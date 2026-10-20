/**
 * Open MR_PLD_A5414465340.adia in the running ADIA web app and save it with the app's own Save, so the
 * delivered file is exactly what ADIA writes for this model.
 *
 *   npx vite --port 3000                                  # the app
 *   node scripts/save_mr_pld_a5414465340_in_app.mjs [url] # rewrites MR_PLD_A5414465340.adia
 *
 * Chromium comes from Playwright (PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH).
 */
import { chromium } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'MR_PLD_A5414465340.adia');
const url = process.argv[2] ?? 'http://127.0.0.1:3000/?projectName=adia';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1900, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(url, { timeout: 180000 });
await page.waitForTimeout(4000);
const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
if (await overlay.count() > 0) {
  await page.keyboard.press('Escape');
  await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}
await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(FILE);
await page.waitForTimeout(7000);
// the project opens on the model organisation
await page.locator('[role="tab"]').filter({ hasText: 'PKG 01' }).first().click();
await page.waitForTimeout(1500);
const download = page.waitForEvent('download', { timeout: 120000 });
await page.getByRole('button', { name: /^Save$/ }).first().click();
await (await download).saveAs(FILE);
await browser.close();
if (errors.length) throw new Error(`the app reported errors:\n${errors.join('\n')}`);
console.log(`saved by ADIA: ${FILE}`);
