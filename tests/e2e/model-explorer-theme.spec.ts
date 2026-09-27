import { test, expect } from '@playwright/test';

/**
 * Visual and functional theme verification for the Cameo-style Model Explorer.
 * Verifies that the explorer adheres to ADIA's shared theme contract in both dark and light modes.
 */
test.describe('Model Explorer - Theme Verification (Task 16)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss intro/welcome overlay if visible
    const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if (await overlay.count() > 0) {
      await page.keyboard.press('Escape');
      await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  });

  test('renders properly in dark mode using theme tokens without raw slate surfaces', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    });

    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    // Check computed background color is --surface-panel (#242424 -> rgb(36, 36, 36))
    const bgColor = await explorer.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toBe('rgb(36, 36, 36)');

    // Ensure it is not raw slate-900 (#0f172a / rgb(15, 23, 42)) or #0b0f19
    expect(bgColor).not.toBe('rgb(15, 23, 42)');
    expect(bgColor).not.toBe('rgb(11, 15, 25)');
  });

  test('adapts seamlessly to light mode without dark root surfaces', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    });

    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    // Check computed background color is --surface-panel (#ffffff -> rgb(255, 255, 255))
    const bgColor = await explorer.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toBe('rgb(255, 255, 255)');

    // Text color should be dark (--text-primary: #172a35 -> rgb(23, 42, 53))
    const textColor = await explorer.evaluate(el => window.getComputedStyle(el).color);
    expect(textColor).toBe('rgb(23, 42, 53)');
  });
});
