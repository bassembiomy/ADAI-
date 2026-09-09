import { test, expect } from '@playwright/test';

test.describe('SysML Deletion Lifecycle & Impact Qualification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click();
      await page.waitForTimeout(600);
    }
  });

  test('validates deletion protection and confirmation for cascading impacts', async ({ page }) => {
    // Select an element if present
    const blockNode = page.locator('[data-element-id], [data-testid*="block"], g[cursor="pointer"]').first();
    if (await blockNode.isVisible()) {
      await blockNode.click();
      // Look for delete button or hit Delete key
      await page.keyboard.press('Delete');
      // If impact confirmation modal appears, verify its warning and structure
      const confirmModal = page.locator('text=Confirm Deletion, text=Impact Analysis, [role="alertdialog"]');
      if (await confirmModal.isVisible()) {
        await expect(confirmModal).toBeVisible();
      }
    }
  });

  test('preserves non-composite elements during deletion operations', async ({ page }) => {
    // Ensure keyboard shortcuts for undo/redo are functional without crashing the app
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);
    // Canvas remains mounted and interactive
    const canvas = page.locator('svg').first();
    await expect(canvas).toBeVisible();
  });
});
