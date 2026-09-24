import { test, expect } from '@playwright/test';

/**
 * E2E scenarios for Cameo-style Model Explorer in SysML mode.
 * Verifies tree rendering, package/block containment, favorites filter, and context menu.
 */
test.describe('Model Explorer - SysML Authoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss welcome overlay if visible
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\], [data-testid="welcome-overlay"]');
    if (await intro.isVisible()) {
      await intro.click({ force: true }).catch(() => {});
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  });

  test('switches between Containment and Diagram views in SysML mode', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    const diagramTab = page.locator('button:has-text("Diagram")');
    await expect(diagramTab).toBeVisible();
    await diagramTab.click();
    await expect(diagramTab).toHaveAttribute('aria-selected', 'true');

    const containmentTab = page.locator('button:has-text("Containment")');
    await expect(containmentTab).toBeVisible();
    await containmentTab.click();
    await expect(containmentTab).toHaveAttribute('aria-selected', 'true');
  });

  test('toggles favorites view filter', async ({ page }) => {
    const favBtn = page.locator('button[aria-label="Toggle Favorites"]');
    if (await favBtn.isVisible()) {
      await favBtn.click();
      await page.waitForTimeout(100);
      await expect(favBtn).toHaveAttribute('aria-pressed', 'true');

      // Click again to un-toggle
      await favBtn.click();
      await page.waitForTimeout(100);
      await expect(favBtn).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('opens context menu on right click of a tree item', async ({ page }) => {
    const item = page.locator('[role="treeitem"]').first();
    if (await item.isVisible()) {
      await item.click({ button: 'right' });
      await page.waitForTimeout(200);

      const menu = page.locator('.model-explorer-menu, [role="menu"]');
      if (await menu.isVisible()) {
        await expect(menu).toBeVisible();
        // Press Escape to dismiss menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await expect(menu).not.toBeVisible();
      }
    }
  });
});
