/**
 * V8 end-to-end, spec 2: a model built only through the UI (library drag and drop, handle-to-handle wiring,
 * properties panel, toolbar), then run. Oracle: Constant 2 into an Integrator with zero initial condition gives
 * y(t) = 2 t exactly (closed form, linear in t, exact for euler and rk4 up to rounding).
 */
import { test, expect } from '@playwright/test';
import {
  useLocalChromium, trackErrors, openXbridges, buildIntegratorModel, setToolbar, runToEnd, scopeSamples,
  statusTime, problemsSummary, runButton, stopButton, expectSamplesFollow,
} from './xbHelpers';

useLocalChromium();

test.describe('X-Bridges build by hand', () => {
  test.setTimeout(120_000);

  test('Constant(2) -> Integrator -> Scope, rk4, step 0.01, stop 1: every logged sample equals 2 t', async ({ page }) => {
    const log = trackErrors(page);
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 1, step: 0.01 });
    await runToEnd(page);

    expect(await problemsSummary(page)).toBe('No problems');
    expect(await statusTime(page)).toBeCloseTo(1, 9);
    const samples = await scopeSamples(page, m.scope);
    expectSamplesFollow(samples, 2, 1e-9);
    expect(log.errors).toEqual([]);
  });

  // Simulink logs the sample at the stop time (t = 1 is the 101st sample of a fixed-step run 0..1, h = 0.01).
  // ADIA stops after the step that reaches the stop time without executing/logging that final sample.
  test.fail('XBV-143 the scope logs the sample at the stop time t = 1 with value 2', async ({ page }) => {
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 1, step: 0.01 });
    await runToEnd(page);
    const samples = await scopeSamples(page, m.scope);
    const [tLast, yLast] = samples[samples.length - 1];
    expect(tLast).toBeCloseTo(1, 9);
    expect(Math.abs(yLast - 2)).toBeLessThanOrEqual(1e-9);
  });

  // Simulink Step Forward advances the simulation by exactly one step. In ADIA the Single Step button calls
  // stepSimulation(), which returns at once when engineRef is null - the live run uses the worker engine
  // (src/components/xbridges/XbridgesWorkspace.tsx:2929-2931), so the click does nothing.
  test.fail('XBV-144 Single Step while paused advances the time by exactly one step', async ({ page }) => {
    await openXbridges(page);
    await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 5, step: 0.0125 });
    await runButton(page).click();
    await expect(stopButton(page)).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByTitle('Pause', { exact: true }).click();
    await page.waitForTimeout(600);
    const readT = async () => Number(/T = ([\d.]+)s/.exec(await page.locator('text=/^T = /').first().innerText())![1]);
    const t0 = await readT();
    await page.getByTitle('Single Step', { exact: true }).click();
    await page.waitForTimeout(500);
    const t1 = await readT();
    expect(Math.abs(t1 - t0 - 0.0125)).toBeLessThanOrEqual(1e-4); // toolbar shows 4 decimals
    await stopButton(page).click();
  });

  // Simulink drops a block where it is dropped. ADIA places every library drop at the centre of the pane
  // (XbridgesWorkspace.onDrop ignores the pointer, src/components/xbridges/XbridgesWorkspace.tsx:2379-2395).
  test.fail('XBV-145 a library block lands at the pointer position of the drop', async ({ page }) => {
    await openXbridges(page);
    const canvas = page.locator('.react-flow');
    const box = (await canvas.boundingBox())!;
    const target = { x: 120, y: 120 };
    await page.getByText('Constant', { exact: true }).first().dragTo(canvas, { targetPosition: target });
    const created = page.locator('.react-flow__node').first();
    await expect(created).toBeVisible();
    await page.waitForTimeout(900);
    const nb = (await created.boundingBox())!;
    const cx = nb.x + nb.width / 2 - box.x, cy = nb.y + nb.height / 2 - box.y;
    expect(Math.abs(cx - target.x)).toBeLessThan(nb.width);
    expect(Math.abs(cy - target.y)).toBeLessThan(nb.height);
  });
});
