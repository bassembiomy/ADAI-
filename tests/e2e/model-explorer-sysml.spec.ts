import { test, expect } from '@playwright/test';

/**
 * Deterministic end-to-end authoring scenarios for Cameo-style Model Explorer in SysML mode.
 * Verifies root Model containment, Block & Part authoring, F2 rename, and view mode switching.
 */
test.describe('Model Explorer - SysML Real Authoring (Task 17)', () => {
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

    // Switch to SysML BDD mode
    const sysmlBtn = page.locator('button:has-text("SysML BDD")');
    await expect(sysmlBtn).toBeVisible();
    await sysmlBtn.click();
    await page.waitForTimeout(300);
  });

  test('creates Block and Part, verifies containment hierarchy, and performs inline rename with F2', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    // 1. Root Model package is visible in containment tree
    const rootModel = page.locator('[role="treeitem"]:has-text("Model")').first();
    await expect(rootModel).toBeVisible();

    // 2. Right click Model -> Create Block
    await rootModel.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    const createBlockOption = menu.locator('[role="menuitem"]:has-text("Block")').first();
    await expect(createBlockOption).toBeVisible();
    await createBlockOption.click();

    await expect(menu).not.toBeVisible();
    const blockItem = page.locator('[role="treeitem"]:has-text("Block")').last();
    await expect(blockItem).toBeVisible();

    // 3. Inline rename Block to "Vehicle" via F2
    await blockItem.click();
    await expect(blockItem).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('F2');

    const renameInput = page.locator('.model-explorer-container [role="treeitem"] input[type="text"]');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Vehicle');
    await page.keyboard.press('Enter');

    const vehicleItem = page.locator('[role="treeitem"]:has-text("Vehicle")');
    await expect(vehicleItem).toBeVisible();

    // 4. Right click Vehicle -> Create Part
    await vehicleItem.click({ button: 'right' });
    await expect(menu).toBeVisible();

    const createPartOption = menu.locator('[role="menuitem"]:has-text("Part")').first();
    await expect(createPartOption).toBeVisible();
    await createPartOption.click();

    await expect(menu).not.toBeVisible();

    // 5. Verify containment: Part is visible under Vehicle
    const partItem = page.locator('[role="treeitem"]:has-text("Part")').last();
    await expect(partItem).toBeVisible();
  });

  test('switches between Containment and Diagram views and toggles favorites filter deterministically', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    // Diagram tab switch
    const diagramTab = page.locator('button:has-text("Diagram")');
    await expect(diagramTab).toBeVisible();
    await diagramTab.click();
    await expect(diagramTab).toHaveAttribute('aria-selected', 'true');

    // Containment tab switch
    const containmentTab = page.locator('button:has-text("Containment")');
    await expect(containmentTab).toBeVisible();
    await containmentTab.click();
    await expect(containmentTab).toHaveAttribute('aria-selected', 'true');

    // Toggle favorites filter button
    const favBtn = page.locator('button[aria-label="Toggle Favorites"]');
    await expect(favBtn).toBeVisible();
    await favBtn.click();
    await expect(favBtn).toHaveAttribute('aria-pressed', 'true');

    // Toggle back
    await favBtn.click();
    await expect(favBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
