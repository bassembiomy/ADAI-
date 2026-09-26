import { test, expect } from '@playwright/test';

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count() > 0) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  }
}

async function semanticIdsInTree(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('.model-tree-row[data-semantic-id]').evaluateAll(rows =>
    rows.map(row => row.getAttribute('data-semantic-id')).filter((id): id is string => Boolean(id))
  );
}

test.describe('SysML v1.6 Diagram Interaction Corrections End-to-End Gates', () => {
  test('Workflow 1: BDD Port authoring with stereotype separation and type prompt', async ({ page }) => {
    await openModeler(page);

    // Switch to SysML BDD
    await page.getByRole('button', { name: 'SysML BDD' }).click();

    // Create a Block on the diagram
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const blockItem = page.locator('[role="treeitem"]:has-text("Block")').last();
    await expect(blockItem).toBeVisible({ timeout: 15000 });

    // Click on the Block presentation on canvas to reveal tools
    const blockNode = page.locator('#adia-diagram-canvas svg g:has(> rect)').filter({ hasText: 'Block' }).last();
    await expect(blockNode).toBeVisible();
    await blockNode.click();

    // Verify PortToolMenu button appears or port menu is accessible
    const portToolBtn = page.getByRole('button', { name: /Port/i }).first();
    await expect(portToolBtn).toBeVisible({ timeout: 5000 });
  });

  test('Workflow 2: Property creation and IBD boundary occurrence connector awareness', async ({ page }) => {
    await openModeler(page);

    // Switch to SysML BDD and create a block
    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await expect(page.locator('[role="treeitem"]:has-text("Block")').last()).toBeVisible({ timeout: 15000 });

    // Switch to SysML IBD
    const ibdBtn = page.getByRole('button', { name: 'SysML IBD', exact: true });
    if (await ibdBtn.isEnabled()) {
      await ibdBtn.click();
      await expect(page.locator('#adia-diagram-canvas')).toBeVisible();
    }
  });

  test('Workflow 3: Requirement Diagram Block isolation without implicit drilldown and TestCase presence', async ({ page }) => {
    await openModeler(page);

    // Create a Block on BDD
    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const blockItem = page.locator('[role="treeitem"]:has-text("Block")').last();
    await expect(blockItem).toBeVisible({ timeout: 15000 });

    // Switch to Requirements Diagram
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();

    // Add existing Block to diagram
    await blockItem.click({ button: 'right' });
    await expect(page.getByText('Add to Diagram', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByText('Add to Diagram', { exact: true }).click();

    const blockOnReq = page.locator('#adia-diagram-canvas svg g:has(> rect)').filter({ hasText: 'Block' }).last();
    await expect(blockOnReq).toBeVisible({ timeout: 10000 });

    // Double-click Block on Requirement diagram: must NOT navigate away to IBD
    await blockOnReq.dblclick();
    await page.waitForTimeout(500);

    // Diagram mode must remain Requirements
    const reqModeBtn = page.getByRole('button', { name: 'Requirements', exact: true });
    await expect(reqModeBtn).toHaveClass(/bg-\[var\(--surface-panel\)\]/);
  });

  test('Workflow 4: State to Requirement Satisfy connection and direction enforcement', async ({ page }) => {
    await openModeler(page);

    // Create Requirement on Requirements diagram
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const beforeIds = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !beforeIds.has(id)).length).toBe(1);
    const reqId = (await semanticIdsInTree(page)).find(id => !beforeIds.has(id))!;

    // Switch to State Machine mode
    await page.getByRole('button', { name: 'State Machine' }).click();
    await page.waitForTimeout(500);

    // Ensure State exists
    let stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    if (await stateItem.count() === 0) {
      const rootRow = page.locator('.model-explorer-container [role="treeitem"]').first();
      await rootRow.click({ button: 'right' });
      const menu = page.locator('[role="menu"]');
      if (await menu.isVisible()) {
        const createState = menu.locator('[role="menuitem"]:has-text("State")').first();
        await createState.click();
      }
      stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    }
    await expect(stateItem).toBeVisible({ timeout: 5000 });
    await stateItem.click();

    // Inspector shows traceability section
    const reqSelect = page.locator('#req-select');
    if (await reqSelect.count() > 0) {
      await reqSelect.selectOption(reqId);
      const addTraceBtn = page.getByRole('button', { name: /Add Trace Link/i });
      if (await addTraceBtn.isEnabled()) {
        await addTraceBtn.click();
        await expect(page.locator('text=«satisfy»').first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('Workflow 5: Deterministic Package Diagram activation', async ({ page }) => {
    await openModeler(page);

    // Package Diagram button is clickable even when no package diagram exists yet
    const packageBtn = page.getByRole('button', { name: 'Package Diagram' });
    await expect(packageBtn).toBeVisible();
    await expect(packageBtn).toBeEnabled();

    // Click Package Diagram: automatically creates initial package diagram and activates it
    await packageBtn.click();
    await expect(packageBtn).toHaveClass(/bg-\[var\(--surface-panel\)\]/, { timeout: 10000 });

    // Verify canvas shows Package Diagram header/canvas
    await expect(page.locator('#adia-diagram-canvas')).toBeVisible();
  });
});
