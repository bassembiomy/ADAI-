import { test, expect, type Locator, type Page } from '@playwright/test';

async function openModeler(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count() > 0) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  }
}

async function semanticIdsInTree(page: Page): Promise<string[]> {
  return page.locator('.model-tree-row[data-semantic-id]').evaluateAll(rows =>
    rows.map(row => row.getAttribute('data-semantic-id')).filter((id): id is string => Boolean(id))
  );
}

async function filterTree(page: Page, query: string) {
  await page.locator('input[placeholder^="Filter model"]').fill(query);
}

async function createBlock(page: Page, name: string): Promise<{ id: string; row: Locator }> {
  await filterTree(page, '');
  const blockRows = page.locator('.model-tree-row[data-kind="block"][data-semantic-id]');
  const before = new Set(await blockRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-semantic-id'))));
  await page.getByRole('treeitem', { name: /Model/ }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Block', exact: true }).first().click();
  await expect.poll(async () => (await blockRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-semantic-id'))))
    .filter(id => id && !before.has(id)).length)
    .toBe(1);
  const id = (await blockRows.evaluateAll(rows => rows.map(row => row.getAttribute('data-semantic-id'))))
    .find(candidate => candidate && !before.has(candidate))!;
  const row = page.locator(`.model-tree-row[data-semantic-id="${id}"]`);
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Rename/ }).click();
  const nameInput = row.getByRole('textbox');
  await nameInput.fill(name);
  await nameInput.press('Enter');
  await filterTree(page, name);
  await expect(row).toContainText(name);
  return { id, row };
}

async function createSatisfyFromTree(page: Page, source: Locator) {
  await source.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Satisfy', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'Create Relationship' });
  await expect(wizard.getByText('Target Element')).toBeVisible();
  await expect(wizard.getByText('No matching target elements')).toHaveCount(0);
  await wizard.getByRole('button', { name: 'Create', exact: true }).click();
}

test.describe('SysML Model Explorer deletion and rejected-command feedback', () => {
  test('shows gateway diagnostics and confirms Block deletion with owned feature and relationship impact', async ({ page }) => {
    await openModeler(page);
    await page.getByRole('button', { name: 'SysML BDD' }).click();

    const vehicle = await createBlock(page, 'Vehicle');
    await createBlock(page, 'Motor');

    // Create a real owned PartProperty through the Model Explorer command path.
    await filterTree(page, 'Vehicle');
    await vehicle.row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Part Property', exact: true }).click();
    await filterTree(page, 'part');
    await expect.poll(async () => page.locator('.model-tree-row[data-kind="part"]').count())
      .toBe(1);

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await filterTree(page, 'Requirement');
    const idsBeforeRequirement = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeRequirement.has(id)).length)
      .toBe(1);
    const requirementId = (await semanticIdsInTree(page)).find(id => !idsBeforeRequirement.has(id))!;
    const requirementRow = page.locator(`.model-tree-row[data-semantic-id="${requirementId}"]`);

    // Reuse the repository Block in Requirements, then create the semantic Satisfy link.
    await filterTree(page, 'Vehicle');
    await vehicle.row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await expect(page.locator('#adia-diagram-canvas').getByText('Vehicle', { exact: true })).toBeVisible();
    await createSatisfyFromTree(page, vehicle.row);

    const satisfyLink = page.locator('#adia-diagram-canvas svg text').filter({ hasText: '«satisfy»' });
    await expect(satisfyLink).toHaveCount(1);

    // Repeating the same relation is rejected by the gateway and its diagnostic is visible.
    await createSatisfyFromTree(page, vehicle.row);
    const rejection = page.getByRole('alertdialog');
    await expect(rejection).toContainText('DUPLICATE_RELATIONSHIP');
    await rejection.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(satisfyLink).toHaveCount(1);

    // Delete the Block from the repository. Its owned PartProperty, Satisfy link,
    // and Requirements presentation must appear in the gateway impact confirmation.
    await vehicle.row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Delete from Model/ }).click();
    const impactDialog = page.getByRole('dialog', { name: 'Confirm Structural Move' });
    await expect(impactDialog).toBeVisible();
    await expect(impactDialog.getByText(/Included Descendant Elements \(1\)/)).toBeVisible();
    await expect(impactDialog.getByText(/Affected Relationships \(1\)/)).toBeVisible();
    await expect(impactDialog.getByText('Affected Diagram Presentations (1)')).toBeVisible();

    await impactDialog.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(vehicle.row).toHaveCount(0);
    await filterTree(page, 'part');
    await expect(page.locator('.model-tree-row[data-kind="part"]')).toHaveCount(0);
    await filterTree(page, 'Requirement');
    await expect(requirementRow).toHaveCount(1);
    await expect(satisfyLink).toHaveCount(0);
  });
});
