/**
 * Open TRUCK.adia in the running ADIA web app, look at every diagram, run Validate and Generate C/H, and save it
 * with the app's own Save, so the delivered file is exactly what ADIA writes for this model.
 *
 *   npx vite --port 3000                                    # the app
 *   node scripts/save_truck_in_app.mjs [url] [screenshots]  # rewrites TRUCK.adia
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'TRUCK.adia');
const url = process.argv[2] ?? 'http://127.0.0.1:3000/?projectName=adia';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1900, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const dialogs = [];
page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
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
const tabs = page.locator('[role="tab"]');
const names = await tabs.allInnerTexts();
console.log('tabs:', names.map(n => n.trim().replace(/\s+/g, ' ')).join(' | '));
if (shots) {
  for (let i = 0; i < names.length; i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(shots, `${String(i).padStart(2, '0')}.png`) });
  }
}
await page.getByRole('button', { name: /^Validate$/ }).first().click();
await page.waitForTimeout(3000);
if (shots) await page.screenshot({ path: resolve(shots, 'validate.png') });
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /Generate C\/H/ }).first().click();
await page.waitForTimeout(5000);
if (shots) await page.screenshot({ path: resolve(shots, 'generate.png') });
const log = await page.getByText('STRUCTURAL-CHECK').first().innerText().catch(() => '');
if (!log.includes('Passed generator structural validation')) throw new Error('Generate C/H did not pass the structural check');
await page.getByRole('button', { name: /^Close$/ }).first().click();
// the project opens on the user's BDD
await tabs.filter({ hasText: /^\s*BDD/ }).first().click();
await page.waitForTimeout(1500);
const download = page.waitForEvent('download', { timeout: 120000 });
await page.getByRole('button', { name: /^Save$/ }).first().click();
await (await download).saveAs(FILE);
await browser.close();
if (dialogs.length) console.log('dialogs:', dialogs);
if (errors.length) throw new Error(`the app reported errors:\n${errors.join('\n')}`);
console.log(`saved by ADIA: ${FILE}`);
