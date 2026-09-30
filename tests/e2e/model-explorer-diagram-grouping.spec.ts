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

  test('groups elements created from BDD, requirements, and state-machine diagram rows', async ({ page }) => {
    await openModelExplorer(page);

    // 1. Block Definition Diagram
    await createChildElement(page, 'sysml:element:adia-default-bdd', /^Block$/);
    const bdd = page.locator(treeItem('sysml:element:adia-default-bdd'));
    const createdBlock = page.locator('[role="treeitem"][data-node-id^="sysml:element:blk-"]').first();
    expect(await ariaLevel(createdBlock)).toBe(await ariaLevel(bdd) + 1);

    // 2. Requirements Diagram
    await createChildElement(page, 'sysml:element:adia-default-requirements', /^Requirement$/);
    const requirementsDiagram = page.locator(treeItem('sysml:element:adia-default-requirements'));
    const createdRequirement = page.locator('[role="treeitem"][data-node-id^="sysml:element:req-"]').first();
    expect(await ariaLevel(createdRequirement)).toBe(await ariaLevel(requirementsDiagram) + 1);

    // 3. State Machine Diagram (membership derives from the rendered region)
    await createChildElement(page, 'sm:diagram:adia-default-state-machine', /^State$/);
    const stateMachineDiagram = page.locator(treeItem('sm:diagram:adia-default-state-machine'));
    const createdState = page.locator('[role="treeitem"][data-node-id^="sm:state:state-"]').first();
    expect(await ariaLevel(createdState)).toBe(await ariaLevel(stateMachineDiagram) + 1);
  });
});
