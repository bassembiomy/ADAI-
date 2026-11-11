/**
 * V8 end-to-end, spec 6: subsystem built through the UI. Subsystem block from the library; dragging a block over it
 * moves the block inside (Inport/Outport blocks are created and the crossing wires re-routed). The user can then
 * enter it (double-click), come back through the breadcrumb and run.
 * Oracle: Constant 1 -> Gain 2 -> Integrator is y(t) = 2 t, the same closed form as the flat model Constant 2 -> Integrator.
 */
import { test, expect } from '@playwright/test';
import {
  useLocalChromium, trackErrors, openXbridges, dropBlock, moveNodeTo, zoomOut, connect, setConstantValue, setToolbar,
  runToEnd, scopeSamples, expectSamplesFollow, problemsSummary, node, selectNode, edgeIds,
} from './xbHelpers';

useLocalChromium();

test.describe('X-Bridges subsystem', () => {
  test.setTimeout(150_000);

  test('Gain 2 grouped into a subsystem: enter, breadcrumb back, run equals the flat model (2 t)', async ({ page }) => {
    const log = trackErrors(page);
    await openXbridges(page);

    const constant = await dropBlock(page, 'Constant', 'SOURCES');
    await zoomOut(page, 4);
    await moveNodeTo(page, constant, 700, 420);
    const gain = await dropBlock(page, 'Gain', 'ELEMENT-WISE MATH', 900, 420);
    const integrator = await dropBlock(page, 'Integrator', 'CONTINUOUS SYSTEMS', 1100, 420);
    const scope = await dropBlock(page, 'Scope', 'SINKS', 1370, 420);
    await connect(page, constant, 'out', gain, 'u');
    await connect(page, gain, 'y', integrator, 'in');
    await connect(page, integrator, 'out', scope, 'in1');
    expect(await edgeIds(page)).toHaveLength(3);
    await setConstantValue(page, constant, '1');
    await selectNode(page, gain);
    const gainInput = page.getByText('Parameters', { exact: true }).locator('xpath=following::input[1]');
    await gainInput.fill('2');
    await gainInput.blur();

    // create the subsystem: library block, then drag the Gain over it
    const sub = await dropBlock(page, 'Subsystem', 'SUBSYSTEM ARCHITECTURE', 900, 800);
    await moveNodeTo(page, gain, 900, 800);
    await page.waitForTimeout(600);
    await page.mouse.click(620, 260);

    // the Gain is no longer on the root canvas, the subsystem has an input and an output handle
    await expect(node(page, gain)).toHaveCount(0);
    const subHandles = await node(page, sub).locator('.react-flow__handle').count();
    expect(subHandles).toBe(2);

    // enter by double-click, breadcrumb shows the path, the Gain is inside
    await node(page, sub).dblclick({ position: { x: 60, y: 120 } });
    await expect(page.locator('.react-flow__node[data-id^="GAIN"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Subsystem', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'ROOT PROJECT', exact: true }).click();
    await expect(node(page, constant)).toHaveCount(1);

    await setToolbar(page, { solver: 'rk4', start: 0, stop: 1, step: 0.01 });
    await runToEnd(page);
    expect(await problemsSummary(page)).toBe('No problems');
    expectSamplesFollow(await scopeSamples(page, scope), 2, 1e-9);
    expect(log.errors).toEqual([]);
  });
});
