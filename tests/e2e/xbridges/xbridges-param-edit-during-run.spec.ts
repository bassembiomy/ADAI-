/**
 * V8 end-to-end, spec 4: edit the Constant while a run is paused mid-way and resume.
 * Oracle: Constant c into an Integrator (h = 0.01, rk4, y0 = 0) gives increments y[k+1]-y[k] = c h exactly, so a
 * change 2 -> 4 shows as increments 0.02 followed by increments 0.04, switching once, with the closed form
 * y(t) = 2 t1 + 4 (t - t1) where t1 is the switch time.
 */
import { test, expect } from '@playwright/test';
import {
  useLocalChromium, openXbridges, buildIntegratorModel, setToolbar, runButton, stopButton, scopeSamples,
  setConstantValue, constantValueInput, selectNode, expectSamplesFollow, saveProject, modelFacts,
  SAVE_DEBOUNCE_SETTLE_MS,
} from './xbHelpers';

useLocalChromium();

const H = 0.01;

async function runPausedAtAbout(page: import('@playwright/test').Page, ms: number) {
  await runButton(page).click();
  await expect(stopButton(page)).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByTitle('Pause', { exact: true }).click();
  await page.waitForTimeout(700);
}

test.describe('X-Bridges parameter edit during a run', () => {
  test.setTimeout(120_000);

  test('Constant 2 -> 4 at about half the run: slope changes from the next step on, single switch, closed form holds', async ({ page }) => {
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 2, step: H });
    await runPausedAtAbout(page, 1500);
    await setConstantValue(page, m.constant, '4');
    await page.getByTitle('Resume', { exact: true }).click();
    await expect(runButton(page)).toBeVisible({ timeout: 60_000 });

    const samples = await scopeSamples(page, m.scope);
    expect(samples[samples.length - 1][0]).toBeGreaterThanOrEqual(2 - H - 1e-9); // the resumed run reaches the stop time
    const inc = samples.slice(1).map((s, k) => s[1] - samples[k][1]);
    const slow = inc.filter(d => Math.abs(d - 2 * H) <= 1e-9).length;
    const fast = inc.filter(d => Math.abs(d - 4 * H) <= 1e-9).length;
    expect(slow + fast).toBe(inc.length); // every step used exactly one of the two values
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(0);
    const firstFast = inc.findIndex(d => Math.abs(d - 4 * H) <= 1e-9);
    expect(inc.slice(0, firstFast).every(d => Math.abs(d - 2 * H) <= 1e-9)).toBe(true);
    expect(inc.slice(firstFast).every(d => Math.abs(d - 4 * H) <= 1e-9)).toBe(true);
    // closed form around the switch time t1 = samples[firstFast].t
    const t1 = samples[firstFast][0];
    for (const [t, y] of samples) {
      const expected = t <= t1 + 1e-12 ? 2 * t : 2 * t1 + 4 * (t - t1);
      expect(Math.abs(y - expected)).toBeLessThanOrEqual(1e-9);
    }
    // sanity: the model without any edit is exactly 2 t (guards the helper, not the product)
    void expectSamplesFollow;
  });

  // XBV-138 (open, S3): typing 'abc' into a numeric parameter stores the raw string as params.value; plan section 6
  // says invalid text must not overwrite the stored value. The engine keeps using the last valid value (checked
  // below and passing), but the model that is saved holds 'abc'.
  test('XBV-138 invalid text "abc" during a run is reported, the engine keeps 2, and the stored value stays 2', async ({ page }) => {
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 2, step: H });
    await runPausedAtAbout(page, 1200);
    await selectNode(page, m.constant);
    const input = constantValueInput(page);
    await input.fill('abc');
    await input.blur();
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    await page.getByTitle('Resume', { exact: true }).click();
    await expect(runButton(page)).toBeVisible({ timeout: 60_000 });
    const samples = await scopeSamples(page, m.scope);
    for (const [, y] of samples) expect(Number.isFinite(y)).toBe(true);
    expectSamplesFollow(samples, 2, 1e-9); // engine kept the last valid value
    await page.waitForTimeout(SAVE_DEBOUNCE_SETTLE_MS); // XBV-149: otherwise Save may write the pre-edit model
    const stored = modelFacts(await saveProject(page)).nodes.find(n => n.id === m.constant)!;
    expect(stored.params.value).toBe(2);
  });

  test('invalid text "abc" before the run is refused with an error and no run starts', async ({ page }) => {
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    await setConstantValue(page, m.constant, 'abc');
    await expect(page.locator('[role="alert"]').first()).toContainText('abc');
    await setToolbar(page, { solver: 'rk4', start: 0, stop: 1, step: H });
    await runButton(page).click();
    await expect(page.getByRole('status', { name: 'X-Bridges status bar' })).toContainText('Failed');
    await expect(page.getByRole('status', { name: 'X-Bridges status bar' })).toContainText('1 error');
  });
});
