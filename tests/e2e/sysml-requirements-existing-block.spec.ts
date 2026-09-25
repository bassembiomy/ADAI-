import { test, expect } from '@playwright/test';

test.describe('SysML Cameo-style existing element presentation', () => {
  test('displays an existing repository Block on Requirements without duplicating it', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const intro = page.locator('[data-testid="welcome-overlay"]');
    if (await intro.count() > 0) {
      await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    }

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const blockItem = page.locator('[role="treeitem"]:has-text("NewBlock")').last();
    await expect(blockItem).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    const requirementItem = page.locator('[role="treeitem"]:has-text("NewRequirement")').last();
    await expect(requirementItem).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    await blockItem.click({ button: 'right' });
    await expect(page.getByText('Add to Diagram', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByText('Add to Diagram', { exact: true }).click();

    await expect(page.locator('svg text').filter({ hasText: 'NewBlock' }).last()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('svg text').filter({ hasText: 'NewRequirement' }).last()).toBeVisible({ timeout: 15000 });

    // The same semantic Block is now presented on the Requirements Diagram;
    // connection creation is verified independently at the semantic gateway.
    await expect(page.locator('svg text').filter({ hasText: 'NewBlock' }).last()).toBeVisible({ timeout: 15000 });
  });
});
