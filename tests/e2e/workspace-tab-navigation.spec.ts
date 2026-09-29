import { test, expect } from '@playwright/test';

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
}

test.describe('workspace tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModeler(page);
  });

  test('opens existing X-Bridges and V-Lab files from the lower tab bar', async ({ page }) => {
    const tabs = page.locator('.workspace-tab-bar');
    const xbridges = tabs.locator('[data-workspace-type="xbridges"]');
    const vlab = tabs.locator('[data-workspace-type="vlab"]');

    await xbridges.click();
    await expect(xbridges).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('X-Bridges', { exact: true }).last()).toBeVisible();

    await vlab.click();
    await expect(vlab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: /V-LAB PHYSICS SIMULATOR/i })).toBeVisible();

    await expect(tabs.locator('[data-workspace-type="xbridges"]')).toHaveCount(1);
    await expect(tabs.locator('[data-workspace-type="vlab"]')).toHaveCount(1);
  });

  test('uses the lower workspace tabs as the only visible workspace navigator', async ({ page }) => {
    await expect(page.locator('.workspace-tab-bar')).toHaveCount(1);
    const header = page.getByRole('banner');
    await expect(header.getByRole('button', { name: 'State Machine', exact: true })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'X-Bridges', exact: true })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'V-Lab', exact: true })).toHaveCount(0);
  });
});
