import { test, expect } from '@playwright/test';

test.describe('Cameo-style repository presentation and tree workflows', () => {
  test('one Block is presented across Requirements and BDD with functional tree actions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const intro = page.locator('[data-testid="welcome-overlay"]');
    if (await intro.count() > 0) {
      await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    }

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await page.getByRole('button', { name: '+ Block', exact: true }).click();
    const motor = page.locator('[role="treeitem"]:has-text("Block")');
    await expect(motor).toHaveCount(1);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await motor.first().click({ button: 'right' });
    await page.getByText('Add to Diagram', { exact: true }).click();
    await expect(page.locator('#adia-diagram-canvas').getByText('Block', { exact: true })).toBeVisible();

    await motor.first().click({ button: 'right' });
    await page.getByText('Rename', { exact: true }).click();
    await page.getByRole('treeitem').getByRole('textbox').fill('BLDCMotor');
    await page.getByRole('treeitem').getByRole('textbox').press('Enter');
    await expect(page.locator('#adia-diagram-canvas').getByText('BLDCMotor', { exact: true })).toBeVisible();

    await page.getByRole('treeitem', { name: 'BLDCMotor', exact: true }).first().click({ button: 'right' });
    await page.getByText('Copy', { exact: true }).click();
    await page.locator('[role="treeitem"]:has-text("Model")').first().click({ button: 'right' });
    await page.getByText('Paste', { exact: true }).click();
    await expect(page.getByRole('treeitem', { name: 'BLDCMotor_1', exact: true })).toHaveCount(1);

    await page.getByRole('treeitem', { name: 'BLDCMotor', exact: true }).first().click({ button: 'right' });
    await page.getByText('Delete from Model', { exact: true }).click();
    const confirm = page.getByRole('button', { name: /Confirm Delete/i });
    if (await confirm.isVisible()) await confirm.click();
    await expect(page.getByRole('treeitem', { name: 'BLDCMotor', exact: true })).toHaveCount(0);
  });
});
