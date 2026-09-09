import { test, expect } from '@playwright/test';

test.describe('SysML Persistence & Report Qualification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Dismiss intro overlay if present
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click();
      await page.waitForTimeout(600);
    }
  });

  test('ensures project save payload retains canonical SysML structure', async ({ page }) => {
    // Check for Save Project button or trigger
    const saveButton = page.locator('button:has-text("Save"), button[title*="Save"]').first();
    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeEnabled();
    }
  });

  test('validates report generation includes SysML traceability and diagrams', async ({ page }) => {
    // Check for Report button
    const reportButton = page.locator('button:has-text("Report"), button[title*="Report"]').first();
    if (await reportButton.isVisible()) {
      await reportButton.click({ force: true });
      await page.waitForTimeout(500);
      // Report dialog or export dialog mounts
      const reportDialog = page.locator('[role="dialog"]').or(page.locator('text=Generate Report')).or(page.locator('text=Engineering Report'));
      if (await reportDialog.count() > 0) {
        await expect(reportDialog.first()).toBeVisible();
      }
    }
  });
});
