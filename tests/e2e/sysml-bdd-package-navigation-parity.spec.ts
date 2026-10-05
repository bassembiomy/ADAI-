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
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function', null, { timeout: 30000 });
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
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModeler(page);
  });

  test('assigning a Requirement to a Block from the BDD inspector persists a canonical Satisfy relationship', async ({ page }) => {
    await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent', diagramId: 'bdd',
        element: {
          id: 'bdd-assign-controller', name: 'Controller', kind: 'block', namespace: [], ownerId: 'model',
          isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
        },
        presentation: { x: 180, y: 160, width: 220, height: 150 },
      });
      execute({
        type: 'createAndPresent', diagramId: 'requirements',
        element: {
          id: 'bdd-assign-req', name: 'Controller shall regulate output', kind: 'requirement', namespace: [], ownerId: 'model',
          requirementId: 'REQ-BDD-001', text: 'Controller shall regulate output.', status: 'draft', version: '1.0',
        },
        presentation: { x: 180, y: 160, width: 220, height: 120 },
      });
    });

    await page.locator('#adia-diagram-canvas g[data-semantic-id="bdd-assign-controller"]').click();
    await expect(page.getByText('Satisfied Requirements', { exact: true })).toBeVisible();
    const requirementSelector = page.locator('select[multiple]').filter({ has: page.locator('option[value="bdd-assign-req"]') }).first();
    await expect(requirementSelector).toBeVisible();
    await requirementSelector.selectOption('bdd-assign-req');

    await expect.poll(() => page.evaluate(() => {
      const repository = (window as any).__sysmlRepository;
      return Object.values(repository.relationships).filter((relationship: any) =>
        relationship.kind === 'satisfy' && relationship.sourceId === 'bdd-assign-controller' && relationship.targetId === 'bdd-assign-req',
      ).length;
    })).toBe(1);
    await expect.poll(() => requirementSelector.evaluate((select: HTMLSelectElement) =>
      Array.from(select.selectedOptions, option => option.value),
    )).toEqual(['bdd-assign-req']);

    await requirementSelector.selectOption([]);
    await expect(page.getByRole('heading', { name: 'Confirm Delete Relationship' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Relationship' }).click();
    await expect.poll(() => page.evaluate(() => Object.values((window as any).__sysmlRepository.relationships)
      .filter((relationship: any) => relationship.kind === 'satisfy' && relationship.sourceId === 'bdd-assign-controller').length,
    )).toBe(0);
    await expect.poll(() => requirementSelector.evaluate((select: HTMLSelectElement) => select.selectedOptions.length)).toBe(0);
  });

  test('1. BDD property connection routes from compartment row and uses association styling', async ({ page }) => {
    // Switch to SysML BDD
    await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
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
          featureId: 'prop-ctrl',
          ownerBlockId: 'blk-engine',
          name: 'ctrl',
          typeId: 'blk-controller',
          aggregation: 'none',
        },
      });
    });

    // Verify property appears in the Engine block compartment
    const propElement = page.locator('text[data-property-id="prop-ctrl"]').first();
    await expect(propElement).toBeVisible({ timeout: 5000 });

    // Use Playwright pointer movement so hit-testing and the complete drag lifecycle run.
    const targetBlock = page.locator('g[data-semantic-id="blk-controller"]').first();
    await expect(targetBlock).toBeVisible({ timeout: 5000 });
    await propElement.dragTo(targetBlock, { targetPosition: { x: 30, y: 50 } });

    const createdRel = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return Object.values(repo.relationships).find((r: any) => r.sourceId === 'prop-ctrl' && r.targetId === 'blk-controller') as any;
    });

    // Verify created relationship has property ID as sourceId (not the owner block)
    expect(createdRel).toBeDefined();
    expect(createdRel.kind).toBe('association');

    // Check SVG canvas for the relationship edge
    const edgeGroup = page.locator(`g[data-semantic-id="${createdRel.id}"]`).first();
    await expect(edgeGroup).toBeVisible({ timeout: 5000 });

    // Assert that the edge starts at the property compartment row
    // Engine block is at x=100, y=100.
    // Property row 0 is at local y = 45 + 0 * 12 + 6 = 51, so sp.y = 100 + 51 = 151.
    // sp.x is at right boundary of owner block: 100 + ownerWidth >= 300.
    const pathD = await page.evaluate((relId) => {
      const el = document.querySelector(`g[data-semantic-id="${relId}"] path:nth-of-type(2)`);
      return el ? el.getAttribute('d') : null;
    }, createdRel.id);
    expect(pathD).toBeTruthy();
    const match = pathD!.match(/^M\s+([\d.]+)\s+([\d.]+)/);
    expect(match).toBeTruthy();
    const spX = parseFloat(match![1]);
    const spY = parseFloat(match![2]);
    expect(spX).toBeGreaterThanOrEqual(300);
    expect(spY).toBeCloseTo(151, 0);

    // Deselect newly created relationship to assert default semantic association styling
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    const stroke = await page.evaluate((relId) => {
      const el = document.querySelector(`g[data-semantic-id="${relId}"] path:nth-of-type(2)`);
      return el ? getComputedStyle(el).stroke : '';
    }, createdRel.id);
    expect(stroke).toMatch(/(167,\s*139,\s*250|a78bfa)/i);

    // Real save and reload
    const saved = await saveProject(page, 'bdd-assoc-parity.adia');
    await reloadAndReopenProject(page, saved);
    await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
    await page.waitForTimeout(300);

    const reloadedState = await repoState(page);
    expect(reloadedState.definitions).toContain('blk-engine');
    expect(reloadedState.definitions).toContain('blk-controller');
    expect(reloadedState.relationships).toContain(createdRel.id);
  });

  test('BDD block selects on release, but starts moving only after a held pointer drag', async ({ page }) => {
    await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
    await page.evaluate(() => {
      (window as any).__sysmlExecuteCommand({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'blk-click-drag',
          name: 'ClickDragBlock',
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
        presentation: { x: 120, y: 120, width: 180, height: 120 },
      });
    });

    const block = page.locator('#adia-diagram-canvas g[data-semantic-id="blk-click-drag"]');
    const selectionOutline = block.locator('rect[stroke-dasharray="5,5"]');
    await expect(block).toBeVisible();
    const box = await block.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + 80, box!.y + 50);
    await page.mouse.down();
    await expect(selectionOutline).toHaveCount(0);
    await page.mouse.up();
    await expect(selectionOutline).toHaveCount(1);

    const beforeDrag = await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramPresentations?.().bdd?.presentations?.['blk-click-drag']?.bounds?.x);
    const transformBeforeDrag = await block.getAttribute('transform');
    await page.mouse.move(box!.x + 80, box!.y + 50);
    await page.mouse.down();
    await page.mouse.move(box!.x + 180, box!.y + 90, { steps: 5 });
    await expect.poll(() => block.getAttribute('transform')).not.toBe(transformBeforeDrag);
    const transformWhileHeld = await block.getAttribute('transform');
    await page.mouse.up();
    await page.mouse.move(box!.x + 220, box!.y + 100);
    await expect.poll(() => block.getAttribute('transform')).toBe(transformWhileHeld);
    await expect.poll(async () => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramPresentations?.().bdd?.presentations?.['blk-click-drag']?.bounds?.x)).toBeGreaterThan(beforeDrag);
  });

  test('2. Part creation inside active Block context without owner chooser and Root returns to origin BDD', async ({ page }) => {
    // Switch to SysML BDD
    await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
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

    // Regression check: Opening another diagram clears return stack so Root returns to the new diagram
    // 1. Double-click bdd-powertrain to activate it
    await filterTree(page, 'Powertrain');
    await page.locator('[data-semantic-id="bdd-powertrain"]').first().dblclick();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe('bdd-powertrain');

    // 2. Create a block in bdd-powertrain and enter it
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd-powertrain',
        element: {
          id: 'blk-motor',
          name: 'Motor',
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
        presentation: { x: 200, y: 150, width: 180, height: 120 },
      });
    });

    // Enter blk-motor
    await page.locator('g[data-semantic-id="blk-motor"]').first().dblclick();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('ibd');

    // Click Root breadcrumb
    await page.locator('button:has-text("Root")').first().click();
    await page.waitForTimeout(300);

    // Must return to bdd-powertrain, NOT bdd or stale diagram
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe('bdd-powertrain');
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('bdd');
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

    // Reveal package contents via UI action on the Model Explorer tree
    await filterTree(page, 'ParentPackage');
    const parentRow = page.locator('.model-tree-row[data-semantic-id="pkg-parent"]').first();
    await expect(parentRow).toBeVisible();
    await parentRow.click({ button: 'right' });
    const showContentsBtn = page.getByRole('menuitem', { name: 'Show Contents', exact: true });
    await expect(showContentsBtn).toBeVisible();
    await showContentsBtn.click();
    await page.waitForTimeout(300);

    // Assert that the blocks inside ParentPackage are now presented on canvas
    await expect(page.locator('g[data-semantic-id="blk-base"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('g[data-semantic-id="blk-derived"]')).toBeVisible({ timeout: 5000 });

    // Verify semantic ownership in repository remains unchanged
    const repoBeforeGen = await page.evaluate(() => (window as any).__sysmlRepository);
    expect(repoBeforeGen.packages['pkg-sub']?.ownerId).toBe('pkg-parent');
    expect(repoBeforeGen.definitions['blk-base']?.ownerId).toBe('pkg-parent');
    expect(repoBeforeGen.definitions['blk-derived']?.ownerId).toBe('pkg-parent');

    // Exercise every Package Diagram relationship tool through real canvas clicks.
    // The resulting semantic relationship and its canvas projection must both exist.
    const relationshipGestures = [
      { label: 'Generalization', kind: 'generalization', source: 'blk-derived', target: 'blk-base' },
      { label: 'Package Import', kind: 'packageImport', source: 'pkg-parent', target: 'pkg-sub' },
      { label: 'Access', kind: 'packageImport', source: 'pkg-sub', target: 'pkg-parent', visibility: 'private' },
      { label: 'Element Import', kind: 'elementImport', source: 'pkg-parent', target: 'blk-base' },
      { label: 'Package Merge', kind: 'packageMerge', source: 'pkg-parent', target: 'pkg-sub' },
      { label: 'Dependency', kind: 'dependency', source: 'blk-derived', target: 'blk-base' },
    ] as const;

    const createdRelationshipIds: string[] = [];
    for (const gesture of relationshipGestures) {
      await page.getByRole('button', { name: gesture.label, exact: true }).click();
      const sourceNode = page.locator(`g[data-semantic-id="${gesture.source}"]`).first();
      const targetNode = page.locator(`g[data-semantic-id="${gesture.target}"]`).first();
      await sourceNode.click({ position: { x: 20, y: 45 } });
      await targetNode.click({ position: { x: 20, y: 45 } });

      const created = await page.evaluate(({ kind, source, target, visibility }) => {
        const repo = (window as any).__sysmlRepository;
        const relationship = Object.values(repo.relationships).find((rel: any) =>
          rel.kind === kind && rel.sourceId === source && rel.targetId === target &&
          (visibility === undefined || rel.visibility === visibility)
        ) as any;
        if (!relationship) return undefined;
        const endpointSemanticsValid = kind === 'packageImport'
          ? relationship.importingNamespaceId === source && relationship.importedPackageId === target
          : kind === 'elementImport'
            ? relationship.importingNamespaceId === source && relationship.importedElementId === target
            : kind === 'packageMerge'
              ? relationship.mergingPackageId === source && relationship.mergedPackageId === target
              : relationship.sourceId === source && relationship.targetId === target;
        return { id: relationship.id, endpointSemanticsValid };
      }, gesture);
      expect(created, `${gesture.label} should commit the expected semantic relationship`).toBeDefined();
      expect(created!.endpointSemanticsValid, `${gesture.label} should preserve its typed semantic endpoints`).toBe(true);
      createdRelationshipIds.push(created!.id);

      await expect(page.locator(`g[data-semantic-id="${created!.id}"]`)).toBeVisible({ timeout: 5000 });
    }

    // Verify tree projection still maintains hierarchy
    await filterTree(page, 'BaseClass');
    await expect(page.locator('.model-tree-row[data-semantic-id="blk-base"]')).toBeVisible();

    // Save and reload
    const saved = await saveProject(page, 'package-diagram-parity.adia');
    await reloadAndReopenProject(page, saved);
    await page.waitForTimeout(300);

    const reloaded = await repoState(page);
    for (const relationshipId of createdRelationshipIds) {
      expect(reloaded.relationships).toContain(relationshipId);
    }
    expect(reloaded.packages).toContain('pkg-parent');
    expect(reloaded.packages).toContain('pkg-sub');
  });

  test('IBD context is unique per Block after returning to BDD', async ({ page }) => {
    await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      for (const [id, name, x] of [['blk-alpha', 'Alpha', 120], ['blk-beta', 'Beta', 420]]) {
        execute({
          type: 'createAndPresent',
          diagramId: 'bdd',
          element: {
            id,
            name,
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
          presentation: { x, y: 150, width: 200, height: 140 },
        });
      }
      execute({
        type: 'createDiagram',
        diagram: {
          id: 'ibd-alpha',
          name: 'Alpha IBD',
          kind: 'diagram',
          diagramKind: 'ibd',
          namespace: [],
          ownerId: 'blk-alpha',
          contextElementId: 'blk-alpha',
        },
      });
    });

    await filterTree(page, 'Alpha');
    await page.locator('[data-semantic-id="ibd-alpha"]').first().dblclick();
    await expect.poll(async () => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('ibd');
    await expect.poll(async () => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe('ibd-alpha');

    await page.locator('button:has-text("Root")').first().click();
    await expect.poll(async () => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('bdd');

    await filterTree(page, 'Beta');
    await page.locator('[data-semantic-id="blk-beta"]').first().dblclick();
    await expect.poll(async () => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('ibd');
    await expect.poll(async () => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe('blk-beta');
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getNavigationStack?.())).toEqual(
      expect.arrayContaining([expect.objectContaining({ diagramKind: 'bdd' })]),
    );
  });

  test('creates and opens exact diagrams from Structural, Requirements, and Behavior', async ({ page }) => {
    for (const [pillar, menuItem, expectedKind] of [
      ['Structural', 'Block Definition Diagram (BDD)', 'bdd'],
      ['Requirements', 'Requirements Diagram', 'requirements'],
      ['Behavior', 'State Machine Diagram', 'stateMachine'],
    ] as const) {
      const row = page.locator('.model-tree-row', { hasText: pillar }).first();
      await row.click({ button: 'right' });
      await page.getByRole('menuitem', { name: menuItem, exact: true }).click();
      await expect.poll(() => page.evaluate(kind => (window as any).__adiaTestHooks.getDiagramMode() === kind, expectedKind)).toBe(true);
    }
  });

  test('creates multiple BDDs, presents distinct blocks, persists tabs, rejects duplicates, and returns to origin', async ({ page }) => {
    // 1. Create BDD-A through the Structural context menu
    const structuralRow = page.locator('.model-tree-row', { hasText: 'Structural' }).first();
    await structuralRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Block Definition Diagram (BDD)', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('bdd');

    const diagramIdA = await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.());
    expect(diagramIdA).toBeTruthy();
    // Rename diagram A to BDD-A for clarity in tree
    await page.evaluate((id) => {
      (window as any).__sysmlExecuteCommand({
        type: 'updateElement',
        elementId: id,
        patch: { name: 'BDD-A' },
      });
    }, diagramIdA);

    // 2. Create BDD-B through the Structural context menu
    await structuralRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Block Definition Diagram (BDD)', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).not.toBe(diagramIdA);

    const diagramIdB = await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.());
    expect(diagramIdB).toBeTruthy();
    // Rename diagram B to BDD-B
    await page.evaluate((id) => {
      (window as any).__sysmlExecuteCommand({
        type: 'updateElement',
        elementId: id,
        patch: { name: 'BDD-B' },
      });
    }, diagramIdB);

    // 3. Present distinct blocks in each diagram
    await page.evaluate(({ diagA, diagB }) => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent',
        diagramId: diagA,
        element: {
          id: 'blk-alpha-a',
          name: 'BlockAlphaA',
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
        presentation: { x: 100, y: 100, width: 200, height: 140 },
      });
      execute({
        type: 'createAndPresent',
        diagramId: diagB,
        element: {
          id: 'blk-beta-b',
          name: 'BlockBetaB',
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
        presentation: { x: 200, y: 150, width: 200, height: 140 },
      });
    }, { diagA: diagramIdA, diagB: diagramIdB });

    // 4. Double-click each tree node
    await filterTree(page, 'BDD-A');
    const rowA = page.locator(`.model-tree-row[data-semantic-id="${diagramIdA}"]`).first();
    await expect(rowA).toBeVisible();
    await rowA.dblclick();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe(diagramIdA);

    await filterTree(page, 'BDD-B');
    const rowB = page.locator(`.model-tree-row[data-semantic-id="${diagramIdB}"]`).first();
    await expect(rowB).toBeVisible();
    await rowB.dblclick();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe(diagramIdB);

    // 5. Saves/reloads using existing helpers and asserts both [data-diagram-id] tabs and active exact ID survive
    const saved = await saveProject(page, 'bdd-a-b-workspace.adia');
    await reloadAndReopenProject(page, saved);
    await page.waitForTimeout(400);

    const tabA = page.locator(`[data-diagram-id="${diagramIdA}"]`);
    const tabB = page.locator(`[data-diagram-id="${diagramIdB}"]`);
    await expect(tabA).toBeVisible({ timeout: 10000 });
    await expect(tabB).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe(diagramIdB);

    // 6. Assert rejected duplicate creation adds no tree node/tab
    const duplicateResult = await page.evaluate((id) => {
      return (window as any).__sysmlExecuteCommand({
        type: 'createDiagram',
        diagram: {
          id,
          name: 'Duplicate Diagram',
          kind: 'diagram',
          diagramKind: 'bdd',
          namespace: [],
          ownerId: 'model',
        },
      });
    }, diagramIdA);
    expect(duplicateResult.committed).toBe(false);
    expect(duplicateResult.diagnostics.some((d: any) => d.code === 'DUPLICATE_ELEMENT_ID')).toBe(true);
    await expect(page.locator(`[data-diagram-id="${diagramIdA}"]`)).toHaveCount(1);

    // 7. Closing BDD-A retains its repository diagram
    const closeBtnA = page.locator(`[data-diagram-id="${diagramIdA}"] button[title="Close Tab"]`).first();
    await closeBtnA.click();
    await expect(page.locator(`[data-diagram-id="${diagramIdA}"]`)).toHaveCount(0);
    const repoAfterClose = await page.evaluate(() => (window as any).__sysmlRepository);
    expect(repoAfterClose.diagrams[diagramIdA]).toBeDefined();

    // 8. Root from an IBD opened from BDD-B returns to BDD-B
    // Make sure BDD-B is the active diagram tab
    await page.locator(`[data-diagram-id="${diagramIdB}"]`).first().click();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe(diagramIdB);

    // Enter blk-beta-b
    await filterTree(page, 'BlockBetaB');
    const blockBRow = page.locator('.model-tree-row[data-semantic-id="blk-beta-b"]').first();
    await expect(blockBRow).toBeVisible();
    await blockBRow.dblclick();
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('ibd');

    // Click Root breadcrumb
    const rootBreadcrumb = page.locator('button:has-text("Root")').first();
    await expect(rootBreadcrumb).toBeVisible();
    await rootBreadcrumb.click();

    // Returns to BDD-B
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.())).toBe('bdd');
    expect(await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.())).toBe(diagramIdB);
  });

  test('creates a package diagram from a package and restores exact navigation', async ({ page }) => {
    // 1. Create a Package
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createElement',
        element: {
          id: 'pkg-powertrain',
          name: 'Powertrain',
          kind: 'package',
          namespace: [],
          ownerId: 'model',
        },
      });
    });

    // 2. Create a Package Diagram under Powertrain
    const result = await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      return execute({
        type: 'createDiagram',
        diagram: {
          id: 'pkg-diag-powertrain',
          name: 'Powertrain Package Diagram',
          kind: 'diagram',
          diagramKind: 'package',
          ownerId: 'pkg-powertrain',
          namespace: ['Powertrain'],
        },
      });
    });
    expect(result.committed).toBe(true);

    // 3. Open the diagram and verify activeDiagramId
    await page.evaluate((id) => {
      (window as any).__adiaTestHooks?.openExactDiagram?.(id);
    }, 'pkg-diag-powertrain');

    const activeId = await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.());
    expect(activeId).toBe('pkg-diag-powertrain');

    // 4. Save and reload project
    const savedPath = await saveProject(page, 'pkg-diag-test.adia');
    await reloadAndReopenProject(page, savedPath);

    // 5. Open the restored diagram and verify
    await page.evaluate((id) => {
      (window as any).__adiaTestHooks?.openExactDiagram?.(id);
    }, 'pkg-diag-powertrain');

    const restoredId = await page.evaluate(() => (window as any).__adiaTestHooks?.getActiveDiagramId?.());
    expect(restoredId).toBe('pkg-diag-powertrain');
  });
});
