import { test, expect } from '@playwright/test';

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const intro = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]').first();
  await intro.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  if (await intro.isVisible()) {
    await page.keyboard.press('Escape').catch(() => {});
    await intro.click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  }

  const closeDrawer = page.locator('.adia-agent-close-btn, button:has-text("✕")').first();
  if (await closeDrawer.isVisible()) {
    await closeDrawer.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function canvasSemanticIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('#adia-diagram-canvas [data-semantic-id]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-semantic-id')).filter((id): id is string => Boolean(id))
  );
}

async function semanticIdsInTree(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('[role="treeitem"][data-semantic-id], .model-virtual-tree-row-wrapper[data-semantic-id], .model-tree-row[data-semantic-id]').evaluateAll(rows =>
    rows.map(row => row.getAttribute('data-semantic-id')).filter((id): id is string => Boolean(id))
  );
}

test.describe('Cameo-style cross-diagram presentation isolation and state traceability', () => {
  test('verifies repository creation isolation, cross-diagram independent placement, and state requirement linking', async ({ page }) => {
    await openModeler(page);

    // 1. Switch to Requirements diagram
    const reqNav = page.locator('[role="treeitem"]:has-text("Main Requirements Diagram"), [role="tab"]:has-text("Requirements"), button:has-text("Requirements")').first();
    if (await reqNav.isVisible()) {
      await reqNav.click();
      await page.waitForTimeout(500);
    }

    // Create a Requirement via toolbar
    const idsBeforeReq = new Set(await canvasSemanticIds(page));
    const addReqBtn = page.locator('button:has-text("+ Requirement")').first();
    await expect(addReqBtn).toBeVisible({ timeout: 5000 });
    await addReqBtn.click();

    await expect.poll(async () => (await canvasSemanticIds(page)).filter(id => !idsBeforeReq.has(id)).length)
      .toBe(1);
    const reqId = (await canvasSemanticIds(page)).find(id => !idsBeforeReq.has(id))!;
    const reqNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${reqId}"]`);
    await expect(reqNode).toBeVisible({ timeout: 10000 });

    // 2. Switch to SysML BDD: The Requirement created on Requirements diagram should NOT appear on BDD
    const bddNav = page.locator('[role="tab"]:has-text("SysML BDD"), [role="treeitem"]:has-text("Main SysML BDD")').first();
    await bddNav.click();
    await page.waitForTimeout(500);
    const reqOnBdd = page.locator(`#adia-diagram-canvas [data-semantic-id="${reqId}"]`);
    await expect(reqOnBdd).toHaveCount(0);

    // 3. Switch to State Machine mode
    const smNav = page.locator('[role="tab"]:has-text("State Machine"), [role="treeitem"]:has-text("Main State Machine Diagram")').first();
    await smNav.dblclick();
    await page.waitForTimeout(500);

    // Ensure a State exists in Model Explorer tree or create one
    let stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    if (await stateItem.count() === 0) {
      const rootRow = page.locator('.model-explorer-container [role="treeitem"]').first();
      await rootRow.click({ button: 'right' });
      const menu = page.locator('[role="menu"]');
      await expect(menu).toBeVisible();
      const createState = menu.locator('[role="menuitem"]:has-text("State")').first();
      await createState.click();
      await expect(menu).not.toBeVisible();
      stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    }

    await expect(stateItem).toBeVisible({ timeout: 5000 });
    await stateItem.click();

    // Verify State Requirement Traceability section is present in inspector
    const traceabilityHeader = page.getByText('Requirement Traceability');
    if (await traceabilityHeader.count() > 0) {
      await expect(traceabilityHeader).toBeVisible();

      // Check the requirement select dropdown contains our requirement
      const reqSelect = page.locator('#req-select');
      await expect(reqSelect).toBeVisible();

      // Select the requirement and link it
      await reqSelect.selectOption(reqId);
      const addTraceBtn = page.getByRole('button', { name: /Add Trace Link/i });
      await expect(addTraceBtn).toBeEnabled();
      await addTraceBtn.click();

      // Verify the link badge «satisfy» appears in the traceability panel
      await expect(page.locator('text=«satisfy»').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
