/**
 * V8 end-to-end, spec 1: every built-in lab in the Labs list loads, compiles with no error diagnostic and runs 5 s of
 * simulated time with Run Engine without console errors or page errors. Generalises tests/e2e/xbridges-run-engine.spec.ts.
 * The lab cards are read from the Labs tab itself, so a new lab is picked up (the count is asserted against the card list).
 */
import { test, expect } from '@playwright/test';
import {
  useLocalChromium, trackErrors, openXbridges, runButton, stopButton, problemsSummary, statusBar, waitForStatusSettled,
} from './xbHelpers';

useLocalChromium();

const LAB_COUNT = 11; // XBRIDGES_LEARNING_LABS at the time of writing (cards with a LOAD LAB button)

/** Labs whose run is known to diverge (EKF error shown as Infinity, confidence 0 %). Index is the card position. */
const PINNED: Record<number, string> = {
  4: 'XBV-127', // Robot Vacuum Digital Twin Lab: diverges at the default rk4 step (motor pole about -500/s)
  5: 'XBV-147', // Autonomous Vacuum Navigation & Mapping System: same EKF ERR Infinity symptom, same robot model
};

async function loadLab(page: import('@playwright/test').Page, index: number): Promise<string> {
  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Labs', exact: true }).click();
  const cards = page.locator('h4');
  await expect(cards.first()).toBeVisible();
  const name = (await cards.nth(index).innerText()).trim();
  await cards.nth(index).click();
  await page.waitForTimeout(1500);
  return name;
}

test.describe('X-Bridges built-in labs', () => {
  test.setTimeout(240_000);

  test('the Labs tab lists the expected number of labs', async ({ page }) => {
    await openXbridges(page);
    await page.getByRole('button', { name: 'Labs', exact: true }).click();
    await expect(page.getByText('LOAD LAB')).toHaveCount(LAB_COUNT);
  });

  for (let index = 0; index < LAB_COUNT; index++) {
    const pin = PINNED[index];
    const define = pin ? test.fail : test;
    define(`${pin ? pin + ' ' : ''}lab #${index + 1}: loads, compiles without error and runs 5 s with finite values`, async ({ page }) => {
      const log = trackErrors(page);
      await openXbridges(page);
      const name = await loadLab(page, index);
      test.info().annotations.push({ type: 'lab', description: name });
      await expect(page.locator('.react-flow__node').first()).toBeVisible();

      await page.locator('input[title^="Simulation stop"], input[title^="Stop time"]').first().fill('5');
      await runButton(page).click();
      // a compile error stops the run at once (status Failed); otherwise it ends at the stop time
      await expect(runButton(page)).toBeVisible({ timeout: 180_000 });
      const status = await waitForStatusSettled(page); // XBV-148: final time lands just after the Run button
      const summary = await problemsSummary(page);

      expect.soft(status, `lab "${name}" status bar`).not.toContain('Failed');
      expect.soft(summary, `lab "${name}" problems`).not.toMatch(/error/);
      expect.soft(status).toMatch(/t = 5\.000 s/);
      const canvasText = await page.locator('.react-flow').innerText();
      const hit = /.{0,40}(\bNaN\b|-?Infinity).{0,10}/.exec(canvasText.replace(/\n/g, ' / '));
      expect.soft(hit?.[0] ?? null, `lab "${name}" shows NaN or Infinity`).toBeNull();
      expect(log.errors, `lab "${name}" console/page errors`).toEqual([]);
      void stopButton; void statusBar;
    });
  }
});
