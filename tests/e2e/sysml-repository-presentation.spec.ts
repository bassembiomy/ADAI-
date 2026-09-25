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
  test('creates a repository-backed BDD from the Structural tree pillar', async ({ page }) => {
    await openModeler(page);
    const structural = page.locator('.model-tree-row[data-node-id="project:pillar:structural"]');
    await structural.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Block Definition Diagram (BDD)', exact: true }).click();

    await filterTree(page, 'BDD');
    const diagram = page.locator('.model-tree-row[data-kind="diagram"]');
    await expect(diagram).toHaveCount(1);
    await expect(diagram).toContainText('[BDD]');
  });

  test('dragging a newly presented Block continues from its active diagram position', async ({ page }) => {
    await openModeler(page);
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();

    const idsBeforeCreation = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Block', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeCreation.has(id)).length)
      .toBe(1);
    const blockId = (await semanticIdsInTree(page)).find(id => !idsBeforeCreation.has(id))!;
    const node = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(node).toBeVisible();

    const beforeDrag = await node.boundingBox();
    if (!beforeDrag) throw new Error('Block presentation has no browser bounds before drag');
    await movePresentation(page, node, 60, 40);
    const afterDrag = await node.boundingBox();
    if (!afterDrag) throw new Error('Block presentation has no browser bounds after drag');
    expect(afterDrag.x - beforeDrag.x).toBeGreaterThanOrEqual(55);
    expect(afterDrag.x - beforeDrag.x).toBeLessThanOrEqual(65);
    expect(afterDrag.y - beforeDrag.y).toBeGreaterThanOrEqual(35);
    expect(afterDrag.y - beforeDrag.y).toBeLessThanOrEqual(45);
  });

  test('dragging an existing Part Property follows the pointer in its IBD presentation', async ({ page }) => {
    await openModeler(page);
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();

    const idsBeforeCreation = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Block', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeCreation.has(id)).length)
      .toBe(1);
    const vehicleId = (await semanticIdsInTree(page)).find(id => !idsBeforeCreation.has(id))!;
    const vehicleCanvasNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${vehicleId}"]`);
    const vehicleTreeNode = page.locator(`.model-tree-row[data-semantic-id="${vehicleId}"]`);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await filterTree(page, 'Block');
    await vehicleTreeNode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await expect(vehicleCanvasNode).toBeVisible();

    await vehicleTreeNode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Part Property', exact: true }).click();
    await filterTree(page, 'part');
    const partTreeNode = page.locator('.model-tree-row[data-kind="part"][data-semantic-id]');
    await expect(partTreeNode).toHaveCount(1);
    const partId = await partTreeNode.getAttribute('data-semantic-id');
    if (!partId) throw new Error('Created Part Property is missing its semantic identity');

    await filterTree(page, '');
    await vehicleCanvasNode.dblclick();
    await expect(page.locator('#adia-diagram-canvas').getByText(/ibd \[Block\]/)).toBeVisible();
    await filterTree(page, 'part');
    await partTreeNode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    const partCanvasNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${partId}"]`);
    await expect(partCanvasNode).toBeVisible();

    const beforeDrag = await partCanvasNode.boundingBox();
    if (!beforeDrag) throw new Error('Part presentation has no browser bounds before drag');
    await movePresentation(page, partCanvasNode, 40, 40);
    const afterDrag = await partCanvasNode.boundingBox();
    if (!afterDrag) throw new Error('Part presentation has no browser bounds after drag');
    expect(afterDrag.x - beforeDrag.x).toBeGreaterThanOrEqual(35);
    expect(afterDrag.x - beforeDrag.x).toBeLessThanOrEqual(45);
    expect(afterDrag.y - beforeDrag.y).toBeGreaterThanOrEqual(35);
    expect(afterDrag.y - beforeDrag.y).toBeLessThanOrEqual(45);
  });

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
