import { test, expect } from '@playwright/test';

test.describe('SysML Cameo-style existing element presentation', () => {
  test('displays an existing repository Block and connects it to a Requirement', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const intro = page.locator('[data-testid="welcome-overlay"]');
    if (await intro.count() > 0) {
      await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    }

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const blockItem = page.locator('[role="treeitem"]:has-text("Block")').last();
    await expect(blockItem).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const treeRows = page.locator('.model-tree-row[data-semantic-id]');
    const existingIds = new Set(await treeRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-semantic-id'))));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    await expect.poll(async () => (await treeRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-semantic-id'))))
      .filter(id => id && !existingIds.has(id)).length).toBe(1);
    const requirementId = (await treeRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-semantic-id'))))
      .find(id => id && !existingIds.has(id))!;
    const requirementItem = page.locator(`.model-tree-row[data-semantic-id="${requirementId}"]`);
    await expect(requirementItem).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    await blockItem.click({ button: 'right' });
    await expect(page.getByText('Add to Diagram', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByText('Add to Diagram', { exact: true }).click();

    await expect(page.locator('#adia-diagram-canvas').getByText('Block', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#adia-diagram-canvas').getByText('Requirement', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="treeitem"]:has-text("Block")')).toHaveCount(1);

    // The same semantic Block is now presented on the Requirements Diagram.
    await expect(page.locator('#adia-diagram-canvas').getByText('Block', { exact: true })).toBeVisible({ timeout: 15000 });
    const connectButton = page.getByRole('button', { name: 'Connect', exact: true });
    await connectButton.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible({ timeout: 5000 });
    const blockNode = page.locator('svg g:has(> rect)').filter({ hasText: 'Block' }).last();
    const requirementNode = page.locator('svg g:has(> rect)').filter({ hasText: 'Requirement' }).last();
    await blockNode.evaluate((element) => element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await requirementNode.evaluate((element) => element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await expect(page.getByText('Create Relationship', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Satisfy/i }).click();
    const satisfyPresentation = page.locator('#adia-diagram-canvas svg text').filter({ hasText: '«satisfy»' });
    await expect(satisfyPresentation).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('[role="treeitem"]:has-text("Block")')).toHaveCount(1);
    await expect(requirementItem).toHaveCount(1);
  });
});
