import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Browser-level coverage for Model Explorer diagram grouping:
 *  - the containment tree owns a real, scrollable vertical viewport;
 *  - elements created from a diagram row are grouped beneath that diagram
 *    while staying owned by the legal semantic owner.
 */

const treeItem = (nodeId: string) => `[role="treeitem"][data-node-id="${nodeId}"]`;

async function openModelExplorer(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const intro = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
  if (await intro.count() > 0) {
    await page.keyboard.press('Escape');
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  await expect(page.locator('.model-explorer-container')).toBeVisible();
  await expect(page.locator('.model-explorer-container [role="tree"]')).toBeVisible();
}

async function createChildElement(page: Page, ownerNodeId: string, label: RegExp): Promise<void> {
  const owner = page.locator(treeItem(ownerNodeId));
  await expect(owner).toBeVisible();
  await owner.click({ button: 'right' });

  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();
  const item = menu.getByRole('menuitem', { name: label }).first();
  await expect(item).toBeEnabled();
  await item.click();
  await expect(menu).not.toBeVisible();
}

async function createAndFindChildElement(page: Page, ownerNodeId: string, label: RegExp): Promise<Locator> {
  const existingIds = new Set(await page.locator('.model-explorer-container [role="treeitem"][data-node-id]').evaluateAll(
    elements => elements.map(el => el.getAttribute('data-node-id')!).filter(Boolean),
  ));

  await createChildElement(page, ownerNodeId, label);

  let newId: string | null = null;
  await expect.poll(async () => {
    const currentIds = await page.locator('.model-explorer-container [role="treeitem"][data-node-id]').evaluateAll(
      elements => elements.map(el => el.getAttribute('data-node-id')!).filter(Boolean),
    );
    const added = currentIds.find(id => !existingIds.has(id));
    if (added) {
      newId = added;
      return added;
    }
    return null;
  }).not.toBeNull();

  return page.locator(`.model-explorer-container [role="treeitem"][data-node-id="${newId}"]`);
}

async function ariaLevel(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  return Number(await locator.getAttribute('aria-level'));
}

test.describe('Model Explorer diagram grouping', () => {
  // The authoring flows here create real elements through the model gateway, and
  // the first spec run also pays Vite's cold-start cost.
  test.describe.configure({ timeout: 90_000 });

  test('the containment tree owns a real vertical scroll viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await openModelExplorer(page);

    const tree = page.locator('.model-explorer-container [role="tree"]');
    await expect(tree).toHaveCSS('overflow-y', 'auto');

    // Grow the tree until its content is taller than the viewport it owns.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const overflows = await tree.evaluate(element => element.scrollHeight > element.clientHeight);
      if (overflows) break;
      await createChildElement(page, 'project:model', /^Block$/);
    }
    expect(await tree.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);

    await tree.hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => tree.evaluate(element => element.scrollTop)).toBeGreaterThan(0);

    // Virtualisation stays on after scrolling: the window still renders rows.
    await expect(page.locator('.model-explorer-container [role="treeitem"]').first()).toBeVisible();
  });

  test('groups elements created from BDD, requirements, parametric, and state-machine diagram rows', async ({ page }) => {
    await openModelExplorer(page);

    // 1. Block Definition Diagram
    const bdd = page.locator(treeItem('sysml:element:adia-default-bdd'));
    const createdBlock = await createAndFindChildElement(page, 'sysml:element:adia-default-bdd', /^Block$/);
    expect(await ariaLevel(createdBlock)).toBe(await ariaLevel(bdd) + 1);

    // 2. Requirements Diagram
    const requirementsDiagram = page.locator(treeItem('sysml:element:adia-default-requirements'));
    const createdRequirement = await createAndFindChildElement(page, 'sysml:element:adia-default-requirements', /^Requirement$/);
    expect(await ariaLevel(createdRequirement)).toBe(await ariaLevel(requirementsDiagram) + 1);

    // 3. Parametric Diagram (created under the Parametric pillar, then populated)
    const createdParametricDiagram = await createAndFindChildElement(page, 'project:pillar:parametric', /Parametric/i);
    const parametricDiagramNodeId = await createdParametricDiagram.getAttribute('data-node-id');
    expect(parametricDiagramNodeId).toBeTruthy();
    const createdParametricBlock = await createAndFindChildElement(page, parametricDiagramNodeId!, /^Block$/);
    expect(await ariaLevel(createdParametricBlock)).toBe(await ariaLevel(createdParametricDiagram) + 1);

    // 4. State Machine Diagram (membership derives from the rendered region)
    const stateMachineDiagram = page.locator(treeItem('sm:diagram:adia-default-state-machine'));
    const createdState = await createAndFindChildElement(page, 'sm:diagram:adia-default-state-machine', /^State$/);
    expect(await ariaLevel(createdState)).toBe(await ariaLevel(stateMachineDiagram) + 1);
  });
});
