/**
 * V8 end-to-end, spec 3: wiring on the canvas by dragging between handles.
 * Rules (plan section 6 and Simulink): output to input only; one driver per input; deleting a block removes its lines.
 */
import { test, expect } from '@playwright/test';
import {
  useLocalChromium, openXbridges, dropBlock, moveNodeTo, zoomOut, connect, edgeIds, selectNode, node,
} from './xbHelpers';

useLocalChromium();

async function twoSourcesOneIntegrator(page: import('@playwright/test').Page) {
  const c1 = await dropBlock(page, 'Constant', 'SOURCES');
  await zoomOut(page, 4);
  await moveNodeTo(page, c1, 700, 400);
  const integrator = await dropBlock(page, 'Integrator', 'CONTINUOUS SYSTEMS', 1050, 560);
  const c2 = await dropBlock(page, 'Constant', 'SOURCES', 700, 800);
  const scope = await dropBlock(page, 'Scope', 'SINKS', 1380, 560);
  return { c1, c2, integrator, scope };
}

test.describe('X-Bridges canvas wiring', () => {
  test.setTimeout(120_000);

  test('output to input drag creates exactly one edge with the handle ids of the ports', async ({ page }) => {
    await openXbridges(page);
    const m = await twoSourcesOneIntegrator(page);
    await connect(page, m.c1, 'out', m.integrator, 'in');
    const ids = await edgeIds(page);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toContain(`${m.c1}out-${m.integrator}in`);
  });

  // XBV-140 (open, S2): the canvas accepts a second driver on an input that is already connected. Simulink allows one
  // line per input port; the workspace has no isValidConnection (src/components/xbridges/XbridgesWorkspace.tsx ~2306).
  test('XBV-140 a second wire dragged into an already-connected input is refused', async ({ page }) => {
    await openXbridges(page);
    const m = await twoSourcesOneIntegrator(page);
    await connect(page, m.c1, 'out', m.integrator, 'in');
    await connect(page, m.c2, 'out', m.integrator, 'in');
    const intoInput = (await edgeIds(page)).filter(id => id.endsWith(`${m.integrator}in`));
    expect(intoInput).toHaveLength(1);
  });

  test('input to input drag is refused', async ({ page }) => {
    await openXbridges(page);
    const m = await twoSourcesOneIntegrator(page);
    await connect(page, m.scope, 'in1', m.integrator, 'in');
    expect(await edgeIds(page)).toHaveLength(0);
    await connect(page, m.integrator, 'in', m.scope, 'in1');
    expect(await edgeIds(page)).toHaveLength(0);
  });

  test('output to output drag is refused', async ({ page }) => {
    await openXbridges(page);
    const m = await twoSourcesOneIntegrator(page);
    await connect(page, m.c1, 'out', m.c2, 'out');
    expect(await edgeIds(page)).toHaveLength(0);
  });

  test('one output fans out to two inputs', async ({ page }) => {
    await openXbridges(page);
    const m = await twoSourcesOneIntegrator(page);
    await connect(page, m.c1, 'out', m.integrator, 'in');
    await connect(page, m.c1, 'out', m.scope, 'in1');
    expect(await edgeIds(page)).toHaveLength(2);
  });

  test('deleting a node removes its edges and only its edges', async ({ page }) => {
    await openXbridges(page);
    const m = await twoSourcesOneIntegrator(page);
    await connect(page, m.c1, 'out', m.integrator, 'in');
    await connect(page, m.integrator, 'out', m.scope, 'in1');
    expect(await edgeIds(page)).toHaveLength(2);
    await selectNode(page, m.integrator);
    await page.keyboard.press('Delete');
    await expect(node(page, m.integrator)).toHaveCount(0);
    expect(await edgeIds(page)).toEqual([]);
    await expect(node(page, m.c1)).toHaveCount(1);
    await expect(node(page, m.scope)).toHaveCount(1);
  });
});
