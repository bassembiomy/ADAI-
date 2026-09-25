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

async function filterTree(page: import('@playwright/test').Page, query: string) {
  await page.locator('input[placeholder^="Filter model"]').fill(query);
}

async function movePresentation(
  page: import('@playwright/test').Page,
  node: import('@playwright/test').Locator,
  dx: number,
  dy: number,
) {
  const bounds = await node.boundingBox();
  if (!bounds) throw new Error('Block presentation has no browser bounds');
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test.describe('Cameo-style repository presentation and tree workflows', () => {
  test('one semantic Block keeps independent Requirements and BDD positions', async ({ page }) => {
    await openModeler(page);
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();

    const idsBeforeCreation = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Block', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeCreation.has(id)).length)
      .toBe(1);
    const blockId = (await semanticIdsInTree(page)).find(id => !idsBeforeCreation.has(id))!;
    const treeBlock = page.locator(`.model-tree-row[data-semantic-id="${blockId}"]`);
    const requirementsNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(requirementsNode).toBeVisible();
    await movePresentation(page, requirementsNode, 145, 95);
    const requirementsPosition = await requirementsNode.getAttribute('transform');

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const bddNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(bddNode).toHaveCount(0);
    await filterTree(page, 'Block');
    await treeBlock.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await expect(bddNode).toBeVisible();
    await movePresentation(page, bddNode, 205, 125);
    const bddPosition = await bddNode.getAttribute('transform');
    expect(bddPosition).not.toBe(requirementsPosition);

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await filterTree(page, 'Block');
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`))
      .toHaveAttribute('transform', requirementsPosition!);
    await expect(treeBlock).toHaveCount(1);
  });

  test('remove from Requirements preserves the Block and its BDD presentation', async ({ page }) => {
    await openModeler(page);
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();

    const idsBeforeCreation = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Block', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeCreation.has(id)).length)
      .toBe(1);
    const blockId = (await semanticIdsInTree(page)).find(id => !idsBeforeCreation.has(id))!;
    const treeBlock = page.locator(`.model-tree-row[data-semantic-id="${blockId}"]`);
    const requirementsNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(requirementsNode).toBeVisible();

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const bddNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(bddNode).toHaveCount(0);
    await filterTree(page, 'Block');
    await treeBlock.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await expect(bddNode).toBeVisible();

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await filterTree(page, 'Block');
    await treeBlock.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove from Diagram', exact: true }).click();
    await expect(requirementsNode).toHaveCount(0);
    await expect(treeBlock).toHaveCount(1);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await expect(bddNode).toBeVisible();
    await expect(treeBlock).toHaveCount(1);
  });

  test('one Block is presented across Requirements and BDD with functional tree actions', async ({ page }) => {
    await openModeler(page);

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
    await page.getByRole('menuitem', { name: /^Delete from Model/ }).click();
    // This leaf Block has no owned elements or relationships, so deletion is
    // immediate; material-impact confirmation is covered by the dedicated gate.
    await expect(page.getByRole('treeitem', { name: 'BLDCMotor', exact: true })).toHaveCount(0);
  });
});
