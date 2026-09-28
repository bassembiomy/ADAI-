import { test, expect } from '@playwright/test';

async function dismissOverlay(page: import('@playwright/test').Page) {
  const intro = page.locator('[data-testid="welcome-overlay"]');
  try {
    if (await intro.isVisible({ timeout: 1500 })) {
      await intro.click({ force: true });
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    }
  } catch {}
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="welcome-overlay"]').forEach(el => el.remove());
  });
}

test.describe('Requirements persistence across BDD/IBD navigation', () => {
  test('Scenario A: Click Requirements tab directly from IBD', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlay(page);

    // 1. Go to Requirements diagram
    await page.locator('button:has-text("Requirements")').first().click();
    await page.waitForTimeout(300);

    // 2. Add a Requirement
    const addReqBtn = page.getByRole('button', { name: '+ Requirement' }).first();
    await expect(addReqBtn).toBeVisible({ timeout: 5000 });
    await addReqBtn.click();
    await page.waitForTimeout(500);

    const reqNode = page.locator('#adia-diagram-canvas g[data-semantic-id]').first();
    await expect(reqNode).toBeVisible({ timeout: 5000 });

    // 3. Go to BDD
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    // 4. Add a Block
    const addBlockBtn = page.getByRole('button', { name: 'Block', exact: true }).first();
    await expect(addBlockBtn).toBeVisible({ timeout: 5000 });
    await addBlockBtn.click();
    await page.waitForTimeout(500);

    const blockNode = page.locator('#adia-diagram-canvas g[data-semantic-id]').first();
    await expect(blockNode).toBeVisible();

    // Double click the Block to enter its IBD
    await blockNode.dblclick();
    const ibdTitle = page.locator('#adia-diagram-canvas').getByText(/ibd \[Block/i);
    if (!await ibdTitle.isVisible()) {
      await blockNode.dblclick({ position: { x: 50, y: 30 } });
    }
    await expect(ibdTitle).toBeVisible({ timeout: 10000 });

    // 5. Add a Part in IBD
    const partBtn = page.getByRole('button', { name: 'Part', exact: true }).first();
    await expect(partBtn).toBeVisible({ timeout: 5000 });
    await partBtn.click();
    await page.waitForTimeout(500);

    // Confirm type if prompt appears
    const typeDialog = page.locator('[role="dialog"][aria-modal="true"]');
    if (await typeDialog.isVisible()) {
      const candidateBtn = typeDialog.locator('button').filter({ hasText: /blk-|block/i }).first();
      if (await candidateBtn.isVisible()) {
        await candidateBtn.click();
      }
      const confirmBtn = typeDialog.getByRole('button', { name: 'Confirm' });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
    }
    await page.waitForTimeout(500);

    // 6. Click Requirements diagram tab directly from IBD
    await page.locator('button:has-text("Requirements")').first().click();
    await page.waitForTimeout(500);

    // Verify requirement is visible on canvas
    const reqNodesAfter = page.locator('#adia-diagram-canvas g[data-semantic-id]');
    const countAfter = await reqNodesAfter.count();
    expect(countAfter).toBeGreaterThan(0);
  });

  test('Scenario B: In IBD, click Root breadcrumb first, then click Requirements tab', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlay(page);

  // 1. Go to Requirements diagram
  await page.locator('button:has-text("Requirements")').first().click();
  await page.waitForTimeout(300);

    // 2. Add a Requirement
    const addReqBtn = page.getByRole('button', { name: '+ Requirement' }).first();
    await expect(addReqBtn).toBeVisible({ timeout: 5000 });
    await addReqBtn.click();
    await page.waitForTimeout(500);

    const reqNode = page.locator('#adia-diagram-canvas g[data-semantic-id]').first();
    await expect(reqNode).toBeVisible({ timeout: 5000 });

    // 3. Go to BDD
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    // 4. Add a Block
    const addBlockBtn = page.getByRole('button', { name: 'Block', exact: true }).first();
    await expect(addBlockBtn).toBeVisible({ timeout: 5000 });
    await addBlockBtn.click();
    await page.waitForTimeout(500);

    const blockNode = page.locator('#adia-diagram-canvas g[data-semantic-id]').first();
    await expect(blockNode).toBeVisible();

    // Double click the Block to enter its IBD
    await blockNode.dblclick({ position: { x: 50, y: 30 } });
    await page.waitForTimeout(500);

    // 5. Add a Part in IBD
    const partBtn = page.getByRole('button', { name: 'Part', exact: true }).first();
    await expect(partBtn).toBeVisible({ timeout: 5000 });
    await partBtn.click();
    await page.waitForTimeout(500);

    // Confirm type if prompt appears
    const typeDialog = page.locator('[role="dialog"][aria-modal="true"]');
    if (await typeDialog.isVisible()) {
      const candidateBtn = typeDialog.locator('button').filter({ hasText: /blk-|block/i }).first();
      if (await candidateBtn.isVisible()) {
        await candidateBtn.click();
      }
      const confirmBtn = typeDialog.getByRole('button', { name: 'Confirm' });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
    }
    await page.waitForTimeout(500);

    // 6. In IBD, click Root in breadcrumbs first
    const rootBreadcrumb = page.locator('button:has-text("L0")').first();
    await expect(rootBreadcrumb).toBeVisible({ timeout: 5000 });
    await rootBreadcrumb.click();
    await page.waitForTimeout(500);

    // 7. Click Requirements tab
    await page.locator('button:has-text("Requirements")').first().click();
    await page.waitForTimeout(500);

    // Verify requirement is visible on canvas
    const reqNodesAfter = page.locator('#adia-diagram-canvas g[data-semantic-id]');
    const countAfter = await reqNodesAfter.count();
    expect(countAfter).toBeGreaterThan(0);
  });
});
