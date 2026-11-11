/**
 * V8 end-to-end, spec 5: build by hand, Save (browser download of the .adia), reload the page, Open the file,
 * and compare nodes, edges, parameters, solver and step read back through the UI and through a second Save.
 * Legacy file formats are out of scope here.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  useLocalChromium, trackErrors, openXbridges, buildIntegratorModel, setToolbar, saveProject, openProjectFile,
  modelFacts, selectNode, constantValueInput, edgeIds, node, runToEnd, scopeSamples, expectSamplesFollow,
  runButton, stopButton, setConstantValue, SAVE_DEBOUNCE_SETTLE_MS,
} from './xbHelpers';

useLocalChromium();

async function roundTrip(page: import('@playwright/test').Page, visitOtherTabBeforeSave: boolean, xbridgesTabActiveOnOpen = false) {
  const log = trackErrors(page);
  page.on('dialog', d => d.accept());
  await openXbridges(page);
  const m = await buildIntegratorModel(page, '2');
  await setToolbar(page, { solver: 'ode3', start: 0, stop: 1, step: 0.01 });
  await page.waitForTimeout(800);
  if (visitOtherTabBeforeSave) {
    await page.getByText('Main V-Lab', { exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByText('Main X-Bridges', { exact: true }).click();
    await page.waitForTimeout(1500);
  }

  const saved = await saveProject(page);
  const before = modelFacts(saved);
  expect(before.nodes.map(n => n.type).sort()).toEqual(['Constant', 'Integrator', 'Scope']);
  expect(before.edges).toHaveLength(2);
  expect(before.simulation).toEqual({ solver: 'ode3', startTime: 0, stopTime: 1, fixedStep: 0.01 });
  expect(before.nodes.find(n => n.id === m.constant)!.params.value).toBe(2);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xbv-persist-')), 'roundtrip.adia');
  fs.writeFileSync(file, JSON.stringify(saved));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openXbridges(page, xbridgesTabActiveOnOpen);
  if (xbridgesTabActiveOnOpen) await expect(page.locator('.react-flow__node')).toHaveCount(0); // a reload starts empty
  await openProjectFile(page, file);
  await page.getByText('Main X-Bridges', { exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 15_000 });
  await page.waitForTimeout(1000);

  // through the UI
  expect(await edgeIds(page)).toHaveLength(2);
  await expect(node(page, m.constant)).toHaveCount(1);
  await selectNode(page, m.constant);
  await expect(constantValueInput(page)).toHaveValue('2');
  const solver = page.locator('select').filter({ has: page.locator('option[value="ode14x"]') });
  await expect(solver).toHaveValue('ode3');
  await expect(page.locator('input[title^="Simulation stop"], input[title^="Stop time"]').first()).toHaveValue('1');
  await expect(page.locator('input[title^="Fixed-step"], input[title^="Fixed step"]').first()).toHaveValue('0.01');

  // through the stored JSON of a second Save
  const after = modelFacts(await saveProject(page));
  expect(after).toEqual(before);

  // and the reopened model still computes the closed form
  await runToEnd(page);
  expectSamplesFollow(await scopeSamples(page, m.scope), 2, 1e-9);
  expect(log.errors).toEqual([]);
}

test.describe('X-Bridges persistence', () => {
  test.setTimeout(180_000);

  test('save (after the workspace tab was left once), reload, open: nodes, edges, parameters, solver, step identical and the model runs to 2 t', async ({ page }) => {
    await roundTrip(page, true);
  });

  // Saving straight from the X-Bridges tab stores the model in globalXBridgesNodes (the workspace file entry is only
  // refreshed on a tab switch); opening that file from another tab still restores the model.
  test('save directly from the X-Bridges tab, reload, open from another tab: model restored', async ({ page }) => {
    await roundTrip(page, false);
  });

  // Opening a project while the X-Bridges tab is the active workspace leaves the empty canvas in place, even after
  // switching tabs back and forth: the opened model is not shown (and the stale canvas is what the next Save writes).
  test('XBV-146 opening a project file while the X-Bridges tab is active shows the opened model', async ({ page }) => {
    await roundTrip(page, true, true);
  });

  // XBV-149: the canvas reaches the project store through a 300 ms debounce that every canvas change restarts, and a
  // running simulation changes the canvas on every 4th tick, so nothing is stored while a run is going; Save does not
  // flush the pending store. A Save made 2 s after an edit during a run holds the value from before the run.
  test('XBV-149 Save during a run contains a parameter edited during that run', async ({ page }) => {
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 30, step: 0.01 });
    await page.waitForTimeout(SAVE_DEBOUNCE_SETTLE_MS);
    await runButton(page).click();
    await expect(stopButton(page)).toBeVisible();
    await page.waitForTimeout(800);
    await setConstantValue(page, m.constant, '5');
    await page.waitForTimeout(2_000);
    const stored = modelFacts(await saveProject(page)).nodes.find(n => n.id === m.constant)!;
    await stopButton(page).click();
    expect(stored.params.value).toBe(5);
  });
});
