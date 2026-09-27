import { test, expect } from '@playwright/test';

test('X-Bridges learning lab stays running after worker compilation', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/?projectName=adia', { waitUntil: 'domcontentloaded' });
  const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
  if (await overlay.count()) {
    await page.keyboard.press('Escape');
    await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
  }

  await page.getByRole('banner').getByRole('button', { name: 'X-Bridges', exact: true }).click();
  await page.getByRole('button', { name: 'Labs', exact: true }).click();
  await page.getByText('LMS System Identification Lab', { exact: true }).click();
  await page.getByRole('button', { name: 'Run Engine', exact: true }).click();
  await page.waitForTimeout(1_000);

  await expect(page.getByRole('button', { name: 'Stop Engine', exact: true })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(page.getByRole('button', { name: 'Stop Engine', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
