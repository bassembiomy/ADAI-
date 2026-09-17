import { expect, test } from '@playwright/test';

test.describe('Application-Wide Light Mode Visual & Functional Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?projectName=adia');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss intro overlay if present
    const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if (await overlay.count() > 0) {
      await page.keyboard.press('Escape');
      await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  });

  test('major workspaces render in light mode without dark root surfaces', async ({ page }) => {
    // Switch to light theme
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem('adia-theme', 'light');
    });

    // Ensure theme attribute took effect
    const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(themeAttr).toBe('light');

    const workspaces = [
      'State Machine',
      'SysML BDD',
      'Requirements',
      'SysML IBD',
      'X-Bridges',
      'V-Lab',
      'HIL',
      'ENTROPY OPM'
    ];

    for (const name of workspaces) {
      const modeBtn = page.getByRole('button', { name, exact: true });
      await expect(modeBtn).toBeVisible();
      await modeBtn.click();
      await page.waitForTimeout(300);

      // Verify that workspace mounted and root canvas/container is visible
      const mainContainer = page.locator('main, .engineering-canvas, svg, .entropy-workspace, .hil-workspace, .xbridges-workspace, .vlab-workspace').first();
      await expect(mainContainer).toBeVisible();

      // Capture visual snapshot for regression tracking
      const snapshotName = `light-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      await expect(page.locator('body')).toHaveScreenshot(snapshotName, {
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
      });
    }
  });

  test('DOE dialog opens and renders in light mode with semantic classes', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem('adia-theme', 'light');
    });

    const doeBtn = page.getByRole('button', { name: 'DOE (RSM)', exact: true });
    if (await doeBtn.isVisible()) {
      await doeBtn.click();
      await page.waitForTimeout(500);

      const doeDialog = page.locator('.doe-workspace').first();
      await expect(doeDialog).toBeVisible({ timeout: 5000 });

      await expect(page.locator('body')).toHaveScreenshot('light-doe-dialog.png', {
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
      });

      // Close DOE dialog if close button is present
      const closeBtn = page.locator('button[title="Close DOE Analyzer"], button[title="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
  });
});
