/**
 * Open WashingMachine.adia in the running ADIA web app, run Validate and Generate C/H on it, and save it with the
 * app's own Save, so the delivered file is exactly what ADIA writes for this model.
 *
 *   npx vite --port 3000                                    # the app
 *   node scripts/save_washing_machine_in_app.mjs [url]      # rewrites models/washing_machine/WashingMachine.adia
 *
 * Chromium comes from Playwright (PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH). Set CHECK_ONLY=1 to run Validate and
 * Generate C/H without saving. Generate C/H can keep the page busy for a few minutes on this chart.
 */
import { chromium } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'models', 'washing_machine', 'WashingMachine.adia');
const url = process.argv[2] ?? 'http://127.0.0.1:3000/?projectName=adia';

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1900, height: 1100 } });
// no external fonts or services: they only delay the page on an offline machine
await page.route(/^(?!http:\/\/(127\.0\.0\.1|localhost)).*/, route => route.abort());
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
// a behaviour-only file is upgraded in memory to the current model format; the app asks to acknowledge it
const upgrade = page.getByRole('button', { name: /^Continue$/ });
if (await upgrade.count() > 0) await upgrade.first().click();
await page.waitForTimeout(1000);

// Validate
await page.locator('[data-help-feature="app-validate"]').first().click();
await page.waitForTimeout(1500);
const validateModal = page.locator('.fixed.inset-0.z-50');
const validateText = await validateModal.count() > 0 ? (await validateModal.last().innerText()).replace(/\s+/g, ' ').trim() : '';
console.log(validateText === '' ? 'Validate: passed, no dialog' : `Validate: the app shows: ${validateText.slice(0, 1500)}`);
if (validateText !== '') { await browser.close(); throw new Error('Validate reported an error'); }

// Generate C/H
await page.locator('[data-help-feature="app-generate-code"]').first().click({ timeout: 300000 });
await page.waitForTimeout(8000);
const dialog = page.locator('.fixed.inset-0.z-50').last();
await dialog.waitFor({ timeout: 300000 });
const dialogText = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const blocked = /Code generation blocked|AI Validation failed|Dangling transition/i.test(dialogText);
console.log(`Generate C/H: ${dialogText.startsWith('Embedded C99 Code Generation') && !blocked ? 'generated' : 'FAILED'}; files listed: ${new Set(dialogText.match(/wm_\w+\.[ch]\b/g) ?? []).size}`);
if (blocked) { await browser.close(); throw new Error('Generate C/H reported errors'); }
await page.keyboard.press('Escape');
await page.mouse.click(5, 5);
await page.waitForTimeout(500);

if (!process.env.CHECK_ONLY) {
  const download = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('[data-help-feature="app-save"]').first().click();
  await (await download).saveAs(FILE);
  console.log(`saved by ADIA: ${FILE}`);
}
await browser.close();
if (errors.length) throw new Error(`the app reported errors:\n${errors.join('\n')}`);
