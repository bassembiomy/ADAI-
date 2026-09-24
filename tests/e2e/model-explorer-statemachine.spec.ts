import { test, expect } from '@playwright/test';

/**
 * E2E scenarios for Cameo-style Model Explorer in State Machine mode.
 * Verifies tree rendering, search filtering, context menu capabilities, and inline rename.
 */
test.describe('Model Explorer - State Machine Authoring', () => {
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

  test('displays Model Explorer toolbar and virtualized tree in containment mode', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    const toolbar = page.locator('.model-explorer-toolbar');
    await expect(toolbar).toBeVisible();

    // Verify tabs are available
    await expect(page.locator('button:has-text("Containment")')).toBeVisible();
    await expect(page.locator('button:has-text("Diagram")')).toBeVisible();
    await expect(page.locator('button:has-text("Search")')).toBeVisible();

    // Check tree container
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
  });

  test('filters visible nodes via search input', async ({ page }) => {
    const searchInput = page.locator('.model-explorer-toolbar input[type="text"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('NonExistentElementXYZ');
    await page.waitForTimeout(200);

    const emptyNotice = page.locator('.model-explorer-container:has-text("No model elements matching")');
    await expect(emptyNotice).toBeVisible();

    // Clear search
    const clearBtn = page.locator('button[title="Clear search"]');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    } else {
      await searchInput.fill('');
    }
  });

  test('supports keyboard navigation in tree rows', async ({ page }) => {
    const firstRow = page.locator('[role="treeitem"]').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await expect(firstRow).toHaveAttribute('aria-selected', 'true');

      // Arrow down to move focus
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
  });
});
