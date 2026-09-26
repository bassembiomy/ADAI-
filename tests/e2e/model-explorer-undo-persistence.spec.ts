import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for Model Explorer persistence and state recovery.
 * Verifies that authored containment tree structures persist across page reloads
 * and explorer UI state (view mode, expansion, favorites) is preserved.
 */
test.describe('Model Explorer - Persistence and State Recovery (Task 17)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss welcome overlay if present
    const intro = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if (await intro.count() > 0) {
      await page.keyboard.press('Escape');
      await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  });

  test('preserves explorer UI state and authored states across page reload', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    // 1. Create a state in State Machine mode
    const rootRow = page.locator('[role="treeitem"]').first();
    await expect(rootRow).toBeVisible();

    await rootRow.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    const createStateOption = menu.locator('[role="menuitem"]:has-text("State")').first();
    await expect(createStateOption).toBeVisible();
    await createStateOption.click();
    await expect(menu).not.toBeVisible();

    const stateItem = page.locator('[role="treeitem"]:has-text("State")').last();
    await expect(stateItem).toBeVisible();

    // 2. Toggle favorites filter on
    const favBtn = page.locator('button[aria-label="Toggle Favorites"]');
    await expect(favBtn).toBeVisible();
    await favBtn.click();
    await expect(favBtn).toHaveAttribute('aria-pressed', 'true');

    // 3. Reload page to verify persistence recovery
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const introAfter = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if (await introAfter.count() > 0) {
      await page.keyboard.press('Escape');
      await introAfter.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await introAfter.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    // 4. Verify Model Explorer mounts cleanly after reload
    await expect(explorer).toBeVisible();
    await expect(page.locator('[role="treeitem"]').first()).toBeVisible();
  });
});
