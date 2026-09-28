import { test, expect } from '@playwright/test';

/**
 * Task 7 — SysML BDD, Package Diagram, and Navigation Parity Browser Gate
 */

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');

  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count() > 0) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  }
}

async function dismissOverlay(page: import('@playwright/test').Page) {
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count() > 0) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  }
}

async function filterTree(page: import('@playwright/test').Page, query: string) {
  const filterInput = page.locator('input[placeholder^="Filter model"]').first();
  if (await filterInput.isVisible()) {
    await filterInput.fill(query);
  }
}

async function repoState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const repo = (window as any).__sysmlRepository;
    const hooks = (window as any).__adiaTestHooks;
    return {
      revision: repo?.revision,
      definitions: Object.keys(repo?.definitions ?? {}),
      usages: Object.keys(repo?.usages ?? {}),
      relationships: Object.keys(repo?.relationships ?? {}),
      diagrams: Object.keys(repo?.diagrams ?? {}),
      packages: Object.keys(repo?.packages ?? {}),
      activeDiagramId: hooks?.getActiveDiagramId?.(),
      diagramMode: hooks?.getDiagramMode?.(),
      associationColor: hooks?.semanticToken?.('association'),
    };
  });
}

async function saveProject(page: import('@playwright/test').Page, filename: string): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Save ADIA project (.adia)').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.adia$/);
  const savedPath = test.info().outputPath(filename);
  await download.saveAs(savedPath);
  return savedPath;
}

async function reloadAndReopenProject(page: import('@playwright/test').Page, savedPath: string) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await dismissOverlay(page);
  await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(savedPath);
}

test.describe('SysML BDD, Package Diagram, and Navigation Parity E2E Gate', () => {
  test.beforeEach(async ({ page }) => {
    await openModeler(page);
  });

  test('1. BDD property connection routes from compartment row and uses association styling', async ({ page }) => {
    // Switch to SysML BDD
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    // Create two blocks: Engine and Controller
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'blk-engine',
          name: 'Engine',
          kind: 'block',
          namespace: [],
          ownerId: 'model',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        },
        presentation: { x: 100, y: 100, width: 200, height: 160 },
      });
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'blk-controller',
          name: 'Controller',
          kind: 'block',
          namespace: [],
          ownerId: 'model',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        },
        presentation: { x: 450, y: 100, width: 200, height: 160 },
      });
      execute({
        type: 'createOwnedFeature',
        diagramId: 'bdd',
        intent: {
          featureKind: 'property',
          ownerBlockId: 'blk-engine',
          name: 'ctrl',
          typeId: 'blk-controller',
          aggregation: 'none',
        },
      });
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'rel-engine-ctrl',
          name: 'ctrlAssoc',
          kind: 'association',
          sourceId: 'blk-engine',
          targetId: 'blk-controller',
        },
        presentation: {},
      });
    });

    // Verify association styling: edge uses dedicated association color
    const state = await repoState(page);
    expect(state.associationColor).toBe('var(--sysml-sem-association)');
    expect(state.relationships).toContain('rel-engine-ctrl');

    // Check SVG canvas for the relationship edge
    const edgeGroup = page.locator('g[data-semantic-id="rel-engine-ctrl"]').first();
    await expect(edgeGroup).toBeVisible({ timeout: 5000 });

    const stroke = await page.evaluate(() => {
      const el = document.querySelector('g[data-semantic-id="rel-engine-ctrl"] path:nth-of-type(2)');
      return el ? getComputedStyle(el).stroke : '';
    });
    expect(stroke).toMatch(/(167,\s*139,\s*250|a78bfa)/i);

    // Real save and reload
    const saved = await saveProject(page, 'bdd-assoc-parity.adia');
    await reloadAndReopenProject(page, saved);
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    const reloadedState = await repoState(page);
    expect(reloadedState.definitions).toContain('blk-engine');
    expect(reloadedState.definitions).toContain('blk-controller');
    expect(reloadedState.relationships).toContain('rel-engine-ctrl');
  });

  test('2. Part creation inside active Block context without owner chooser and Root returns to origin BDD', async ({ page }) => {
    // Switch to SysML BDD
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    // Create container Block Chassis and component Block Wheel
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'blk-chassis',
          name: 'Chassis',
          kind: 'block',
          namespace: [],
          ownerId: 'model',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        },
        presentation: { x: 100, y: 100, width: 220, height: 160 },
      });
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'blk-wheel',
          name: 'Wheel',
          kind: 'block',
          namespace: [],
          ownerId: 'model',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        },
        presentation: { x: 400, y: 100, width: 200, height: 140 },
      });
    });

    // Enter Chassis block into its IBD context via tree double-click
    await filterTree(page, 'Chassis');
    const chassisRow = page.locator('[data-semantic-id="blk-chassis"]').first();
    await expect(chassisRow).toBeVisible();
    await chassisRow.dblclick();
    await page.waitForTimeout(400);

    // Check diagram mode is now IBD
    await expect.poll(async () => {
      return page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.());
    }).toBe('ibd');

    // Canvas +Part creation inside IBD: click Part toolbar button
    const partBtn = page.getByRole('button', { name: 'Part', exact: true }).first();
    await expect(partBtn).toBeVisible({ timeout: 5000 });
    await partBtn.click();

    // Verify TypeSelectionPrompt opens
    const typeDialog = page.locator('[role="dialog"][aria-labelledby="type-selection-title"]');
    await expect(typeDialog).toBeVisible({ timeout: 5000 });

    // Owner chooser should NOT exist
    await expect(page.locator('text="Select Owner"')).toHaveCount(0);

    // Select Wheel candidate and confirm
    const wheelBtn = typeDialog.locator('button:has-text("Wheel")').first();
    await wheelBtn.click();
    const confirmBtn = typeDialog.locator('button:has-text("Confirm")').first();
    await confirmBtn.click();
    await page.waitForTimeout(400);

    // Verify Part was created in repository with blk-chassis as owner
    await expect.poll(async () => {
      return page.evaluate(() => {
        const repo = (window as any).__sysmlRepository;
        const usages = Object.values(repo?.usages ?? {}) as any[];
        return usages.some(u => u.kind === 'part' && u.typeId === 'blk-wheel' && u.ownerId === 'blk-chassis');
      });
    }).toBe(true);

    // Breadcrumb navigation: L0 Root returns to originating BDD
    const rootBreadcrumb = page.locator('button:has-text("Root")').first();
    await expect(rootBreadcrumb).toBeVisible();
    await rootBreadcrumb.click();
    await page.waitForTimeout(300);
    const afterRootMode = await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.());
    expect(afterRootMode).toBe('bdd');
  });

  test('3. Exact diagram activation across multiple BDDs and Package Diagrams via tree double-click', async ({ page }) => {
    // Create an extra BDD and a Package Diagram
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createDiagram',
        diagram: {
          id: 'bdd-powertrain',
          name: 'Powertrain BDD',
          kind: 'diagram',
          diagramKind: 'bdd',
          namespace: [],
          ownerId: 'model',
        },
      });
      execute({
        type: 'createDiagram',
        diagram: {
          id: 'pkg-architecture',
          name: 'Architecture Packages',
          kind: 'diagram',
          diagramKind: 'package',
          namespace: [],
          ownerId: 'model',
        },
      });
    });

    await filterTree(page, '');
    await page.waitForTimeout(300);

    // Double-click Powertrain BDD in tree
    await filterTree(page, 'Powertrain');
    const bddRow = page.locator('[data-semantic-id="bdd-powertrain"]').first();
    await expect(bddRow).toBeVisible();
    await bddRow.dblclick();
    await page.waitForTimeout(300);

    const activeId1 = await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.());
    expect(activeId1).toBe('bdd-powertrain');

    // Double-click Architecture Packages in tree
    await filterTree(page, 'Architecture');
    const pkgRow = page.locator('[data-semantic-id="pkg-architecture"]').first();
    await expect(pkgRow).toBeVisible();
    await pkgRow.dblclick();
    await page.waitForTimeout(300);

    const activeId2 = await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.());
    const mode2 = await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.());
    expect(activeId2).toBe('pkg-architecture');
    expect(mode2).toBe('package');
  });

  test('4. Package Diagram visual nesting and Show Contents without owner mutation; supported relationships', async ({ page }) => {
    // Create nested packages and blocks
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createDiagram',
        diagram: {
          id: 'diag-pkg-test',
          name: 'Test Package Diagram',
          kind: 'diagram',
          diagramKind: 'package',
          namespace: [],
          ownerId: 'model',
        },
      });
      execute({
        type: 'createElement',
        element: {
          id: 'pkg-parent',
          name: 'ParentPackage',
          kind: 'package',
          namespace: [],
          ownerId: 'model',
        },
      });
      execute({
        type: 'createElement',
        element: {
          id: 'pkg-sub',
          name: 'SubPackage',
          kind: 'package',
          namespace: [],
          ownerId: 'pkg-parent',
        },
      });
      execute({
        type: 'createElement',
        element: {
          id: 'blk-base',
          name: 'BaseClass',
          kind: 'block',
          namespace: [],
          ownerId: 'pkg-parent',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        },
      });
      execute({
        type: 'createElement',
        element: {
          id: 'blk-derived',
          name: 'DerivedClass',
          kind: 'block',
          namespace: [],
          ownerId: 'pkg-parent',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        },
      });
    });

    // Open the package diagram via tree
    await filterTree(page, 'Test Package');
    const pkgDiagRow = page.locator('[data-semantic-id="diag-pkg-test"]').first();
    await expect(pkgDiagRow).toBeVisible();
    await pkgDiagRow.dblclick();
    await page.waitForTimeout(300);

    // Present only parent package initially
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'addToDiagram',
        diagramId: 'diag-pkg-test',
        elementIds: ['pkg-parent'],
      });
    });

    // Check relationship buttons on Package Diagram toolbar: Generalization, Package Import, Access, Element Import, Package Merge, Dependency
    for (const label of ['Generalization', 'Package Import', 'Access', 'Element Import', 'Package Merge', 'Dependency']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // Reveal package contents using Show Contents
    const showContentsResult = await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      const res = execute({
        type: 'showPackageContents',
        diagramId: 'diag-pkg-test',
        packageId: 'pkg-parent',
        mode: 'direct',
      });
      const repo = (window as any).__sysmlRepository;
      return {
        committed: res.committed,
        subOwner: repo.packages['pkg-sub']?.ownerId,
        baseOwner: repo.definitions['blk-base']?.ownerId,
      };
    });
    expect(showContentsResult.committed).toBe(true);
    expect(showContentsResult.subOwner).toBe('pkg-parent');
    expect(showContentsResult.baseOwner).toBe('pkg-parent');

    // Create Generalization on Package Diagram: blk-derived specializes blk-base
    const genResult = await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      const res = execute({
        type: 'createAndPresent',
        diagramId: 'diag-pkg-test',
        element: {
          id: 'rel-pkg-gen',
          kind: 'generalization',
          sourceId: 'blk-derived',
          targetId: 'blk-base',
        },
        presentation: {},
      });
      return res.committed;
    });
    expect(genResult).toBe(true);

    // Save and reload
    const saved = await saveProject(page, 'package-diagram-parity.adia');
    await reloadAndReopenProject(page, saved);
    await page.waitForTimeout(300);

    const reloaded = await repoState(page);
    expect(reloaded.relationships).toContain('rel-pkg-gen');
    expect(reloaded.packages).toContain('pkg-parent');
    expect(reloaded.packages).toContain('pkg-sub');
  });
});
