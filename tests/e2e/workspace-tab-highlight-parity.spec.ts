import { test, expect } from '@playwright/test';

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
}

/**
 * The unified workspace strip mixes workspace-file tabs (keyed by file id) with
 * exact-ID diagram tabs. Both used to carry independent "active" signals, so a
 * stale second tab stayed highlighted, and the workspace file underneath an open
 * diagram view could not be re-selected because it was still the active file id.
 */
test.describe('workspace tab highlight parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModeler(page);
    await page.waitForTimeout(1500);
  });

  test('highlights exactly the rendered view and activates on a single press', async ({ page }) => {
    const stateMachineTab = page.locator('[data-workspace-type="statemachine"]');
    const bddTab = page.locator('[data-diagram-id="adia-default-bdd"]');
    const selectedTabs = page.getByTestId('diagram-workspace-tabs').locator('[role="tab"][aria-selected="true"]');
    const diagramRow = (text: string) =>
      page.locator('[data-node-id][data-kind="diagram"]', { hasText: text }).first();

    // Startup renders the state-machine workspace, so only its tab is selected:
    // the open BDD tab must not read as active beside it.
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(bddTab).toHaveAttribute('aria-selected', 'false');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();

    // A single press on a diagram row brings that diagram into the canvas and
    // moves the one highlight in the strip onto it.
    await diagramRow('Main SysML BDD').click();
    await expect(bddTab).toHaveAttribute('aria-selected', 'true');
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'false');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^Blocks:/)).toBeVisible();

    // A single press on the workspace file tab returns its canvas, even though
    // that file id was still the active workspace file underneath the diagram.
    await stateMachineTab.click();
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();

    // Switching to another module workspace keeps the highlight single.
    await page.locator('[data-workspace-type="xbridges"]').click();
    await expect(page.locator('[data-workspace-type="xbridges"]')).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);

    await stateMachineTab.click();
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();
  });

  test('closing tabs keeps the selected tab and canvas in parity', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const stateMachineTab = page.locator('[data-workspace-type="statemachine"]');
    const requirementsTab = page.locator('[data-diagram-id="adia-default-requirements"]');
    const bddTab = page.locator('[data-diagram-id="adia-default-bdd"]');
    const selectedTabs = tabs.locator('[role="tab"][aria-selected="true"]');

    // Establish a deterministic order after the State Machine workspace tab.
    for (const diagramTab of [bddTab, requirementsTab]) {
      if (await diagramTab.count()) await diagramTab.getByTitle('Close Tab').click();
    }
    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main Requirements Diagram' }).first().click();
    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main SysML BDD' }).first().click();
    await requirementsTab.click();
    await expect(requirementsTab).toHaveAttribute('aria-selected', 'true');
    await requirementsTab.getByTitle('Close Tab').click();
    await expect(bddTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^Blocks:/)).toBeVisible();

    // Open Requirements again, return to State Machine, then remove every
    // diagram tab while preserving the workspace canvas.
    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main Requirements Diagram' }).first().click();
    await stateMachineTab.click();
    await expect(page.getByText(/^States:/)).toBeVisible();
    await bddTab.getByTitle('Close Tab').click();
    await requirementsTab.getByTitle('Close Tab').click();
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(selectedTabs).toHaveText(/State Machine/i);
    await expect(page.getByText(/^States:/)).toBeVisible();
  });

  test('closing the last active diagram returns to the State Machine workspace', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const stateMachineTab = tabs.locator('[data-workspace-type="statemachine"]');
    const bddTab = tabs.locator('[data-diagram-id="adia-default-bdd"]');

    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main SysML BDD' }).first().click();
    await expect(bddTab).toHaveAttribute('aria-selected', 'true');
    await bddTab.getByTitle('Close Tab').click();

    await expect(bddTab).toHaveCount(0);
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();
  });

  test('canvas double-click opens a uniquely owned exact diagram and reuses its tab', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const destination = tabs.locator('[data-diagram-id="canvas-owned-ibd"]');
    await tabs.locator('[data-diagram-id="adia-default-bdd"]').click();
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent', diagramId: 'adia-default-bdd',
        element: {
          id: 'canvas-owner', name: 'Canvas Owner', kind: 'block', namespace: [], ownerId: 'model',
          isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
        },
        presentation: { x: 180, y: 150, width: 180, height: 120 },
      });
      execute({
        type: 'createDiagram', diagram: {
          id: 'canvas-owned-ibd', name: 'Canvas Owned IBD', kind: 'diagram', diagramKind: 'ibd',
          namespace: [], ownerId: 'canvas-owner', contextElementId: 'canvas-owner',
        },
      });
    });
    const symbol = page.locator('#adia-diagram-canvas g[data-semantic-id="canvas-owner"]');
    await expect(symbol).toBeVisible();
    await expect(destination).toHaveCount(0);

    await symbol.click();
    await expect(destination).toHaveCount(0);
    await expect(tabs.locator('[data-diagram-id="adia-default-bdd"]')).toHaveAttribute('aria-selected', 'true');

    await symbol.dblclick();
    await expect(destination).toHaveAttribute('aria-selected', 'true');
    await expect(destination).toHaveCount(1);
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe('canvas-owned-ibd');

    await tabs.locator('[data-diagram-id="adia-default-bdd"]').click();
    await expect(symbol).toBeVisible();
    await symbol.dblclick();
    await expect(destination).toHaveAttribute('aria-selected', 'true');
    await expect(destination).toHaveCount(1);
  });

  test('canvas double-click without a navigable diagram leaves the active canvas in place', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const bdd = tabs.locator('[data-diagram-id="adia-default-bdd"]');
    await bdd.click();
    await page.evaluate(() => {
      (window as any).__sysmlExecuteCommand({
        type: 'createAndPresent', diagramId: 'adia-default-bdd',
        element: {
          id: 'canvas-leaf', name: 'Canvas Leaf', kind: 'block', namespace: [], ownerId: 'model',
          isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
        },
        presentation: { x: 200, y: 150, width: 180, height: 120 },
      });
    });
    const symbol = page.locator('#adia-diagram-canvas g[data-semantic-id="canvas-leaf"]');
    await expect(symbol).toBeVisible();
    const before = await tabs.locator('[role="tab"]').count();
    await symbol.dblclick();
    await expect(bdd).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.locator('[role="tab"]')).toHaveCount(before);
    await expect(symbol).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe('adia-default-bdd');
  });

  test('IBD tab activation and close restore the destination block context', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const bdd = tabs.locator('[data-diagram-id="adia-default-bdd"]');
    const ibdA = tabs.locator('[data-diagram-id="context-ibd-a"]');
    const ibdB = tabs.locator('[data-diagram-id="context-ibd-b"]');
    await bdd.click();
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      for (const [id, name, x] of [['context-a', 'Context A', 150], ['context-b', 'Context B', 420]] as const) {
        execute({
          type: 'createAndPresent', diagramId: 'adia-default-bdd',
          element: { id, name, kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
            properties: [], ports: [], operations: [], constraints: [] },
          presentation: { x, y: 160, width: 180, height: 120 },
        });
        execute({
          type: 'createDiagram', diagram: { id: `context-ibd-${id.slice(-1)}`, name: `${name} IBD`, kind: 'diagram',
            diagramKind: 'ibd', namespace: [], ownerId: id, contextElementId: id },
        });
      }
    });

    await page.locator('#adia-diagram-canvas g[data-semantic-id="context-a"]').dblclick();
    await expect(ibdA).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Context A/ })).toBeVisible();
    await bdd.click();
    await page.locator('#adia-diagram-canvas g[data-semantic-id="context-b"]').dblclick();
    await expect(ibdB).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Context B/ })).toBeVisible();

    await ibdA.click();
    await expect(ibdA).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Context A/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Context B/ })).toHaveCount(0);
    await ibdA.getByTitle('Close Tab').click();
    await expect(ibdB).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Context B/ })).toBeVisible();
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  });

  test('closing a module file underneath an exact diagram preserves the rendered tab', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const stateMachine = tabs.locator('[data-workspace-type="statemachine"]');
    const bdd = tabs.locator('[data-diagram-id="adia-default-bdd"]');
    await bdd.click();
    await expect(page.getByText(/^Blocks:/)).toBeVisible();
    await stateMachine.getByTitle('Close Tab').click();

    await expect(stateMachine).toHaveCount(0);
    await expect(bdd).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.getByText(/^Blocks:/)).toBeVisible();
    await bdd.getByTitle('Close Tab').click();
    await expect(tabs.locator('[data-workspace-type="statemachine"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/^States:/)).toBeVisible();
  });

  test('Root breadcrumb deselects a nested State Machine diagram until its tab is reopened', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const stateMachineFile = tabs.locator('[data-workspace-type="statemachine"]');
    await stateMachineFile.click();
    await page.getByRole('button', { name: 'Expand All' }).click();
    await page.locator('.model-tree-row[data-node-id="sm:region:root"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'State', exact: true }).click();
    await page.getByRole('button', { name: 'Expand All' }).click();
    const state = page.locator('.model-tree-row[data-kind="state"]').last();
    await expect(state).toBeVisible();
    await state.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Region', exact: true }).click();
    await page.getByRole('button', { name: 'Expand All' }).click();
    const region = page.locator('.model-tree-row[data-kind="region"]:not([data-semantic-id="root"])').first();
    await expect(region).toBeVisible();
    const regionId = await region.getAttribute('data-semantic-id');
    expect(regionId).not.toBe('root');
    await region.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'State Machine Diagram', exact: true }).click();

    const nestedId = await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramWorkspace?.()?.activeTab?.diagramId);
    expect(nestedId).toBeTruthy();
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramWorkspace?.()?.activeTab?.contextRegionId)).toBe(regionId);
    const nestedTab = tabs.locator(`[data-diagram-id="${nestedId}"]`);
    await nestedTab.click();
    await expect(nestedTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('button:has-text("Root")').first()).toBeVisible();
    await stateMachineFile.getByTitle('Close Tab').click();
    await expect(stateMachineFile).toHaveCount(0);
    await page.locator('button:has-text("Root")').first().click();

    await expect(nestedTab).toHaveAttribute('aria-selected', 'false');
    await expect(stateMachineFile).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await nestedTab.click();
    await expect(nestedTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('button:has-text("Root")').first()).toBeVisible();
  });
});
