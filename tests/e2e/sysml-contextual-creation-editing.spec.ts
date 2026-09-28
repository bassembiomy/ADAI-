import { test, expect } from '@playwright/test';

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

test.describe('SysML Contextual Creation and Editing E2E Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModeler(page);
  });

  test('1. Creates a standard port from a selected BDD Block sharing semantic identity in tree and block feature list', async ({ page }) => {
    // Switch to SysML BDD
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    // Create a Block on canvas
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent',
        diagramId: 'bdd',
        element: {
          id: 'blk-vehicle',
          name: 'Vehicle',
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
        presentation: { x: 150, y: 120, width: 220, height: 160 },
      });
    });

    const blockNode = page.locator('#adia-diagram-canvas g[data-semantic-id="blk-vehicle"]').first();
    await expect(blockNode).toBeVisible({ timeout: 5000 });

    // Select the block on canvas
    await blockNode.click({ position: { x: 50, y: 40 } });
    await page.waitForTimeout(200);

    // Click the Standard port button from PortKindActions toolbar
    const stdPortBtn = page.getByRole('button', { name: 'Standard', exact: true }).first();
    await expect(stdPortBtn).toBeVisible({ timeout: 5000 });
    await stdPortBtn.click();
    await page.waitForTimeout(300);

    // Verify port was created in repository owned by blk-vehicle
    const portData = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      const blk = repo.definitions['blk-vehicle'];
      return blk?.ports?.[0];
    });

    expect(portData).toBeDefined();
    expect(portData.name).toMatch(/^(p\d+|port.*)/i);
    expect(portData.kind).toBe('standard');

    // Confirm tree node has the port under Vehicle
    await filterTree(page, '');
    await page.getByRole('button', { name: 'Expand All' }).click();
    await page.waitForTimeout(300);
    const treeRow = page.locator(`.model-tree-row[data-semantic-id="blk-vehicle"]`).first();
    await expect(treeRow).toBeVisible();
    const portTreeRow = page.locator(`.model-tree-row[data-semantic-id="${portData.id}"]`);
    await expect(portTreeRow).toBeVisible();
    await expect(portTreeRow).toHaveAttribute('data-kind', 'port');

    // Confirm Block feature list in repository matches
    const vehiclePorts = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return repo.definitions['blk-vehicle'].ports.map((p: any) => ({ id: p.id, name: p.name, kind: p.kind }));
    });
    expect(vehiclePorts).toHaveLength(1);
    expect(vehiclePorts[0].id).toBe(portData.id);
  });

  test('2. Contextual Part creation in active Block IBD and relationship property editing with persistence', async ({ page }) => {
    // Switch to SysML BDD
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);

    // Create container Block Chassis, component Block Wheel, and an association between them
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
        presentation: { x: 420, y: 100, width: 200, height: 140 },
      });
      execute({
        type: 'createOwnedFeature',
        intent: {
          featureKind: 'property',
          ownerBlockId: 'blk-chassis',
          propertyKind: 'part',
          typeId: 'blk-wheel',
          featureId: 'property-existing-role',
          name: 'existingRole',
        },
      });
      execute({
        type: 'createElement',
        element: {
          id: 'rel-chassis-wheel',
          kind: 'association',
          sourceId: 'blk-chassis',
          targetId: 'blk-wheel',
          sourceRole: 'body',
          targetRole: 'tire',
          sourceMultiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
          targetMultiplicity: { lower: 4, upper: 4, ordered: false, unique: true },
        },
      });
      execute({
        type: 'addToDiagram',
        diagramId: 'bdd',
        elementIds: ['rel-chassis-wheel'],
      });
    });

    // Enter Chassis block into its IBD context via tree double-click
    await filterTree(page, 'Chassis');
    const chassisRow = page.locator('[data-semantic-id="blk-chassis"]').first();
    await expect(chassisRow).toBeVisible();
    await chassisRow.dblclick();
    await page.waitForTimeout(400);

    // Confirm diagram mode is IBD
    await expect.poll(async () => {
      return page.evaluate(() => (window as any).__adiaTestHooks?.getDiagramMode?.());
    }).toBe('ibd');

    // Create Part inside IBD
    const partBtn = page.getByRole('button', { name: 'Part', exact: true }).first();
    await expect(partBtn).toBeVisible({ timeout: 5000 });
    await partBtn.click();

    // TypeSelectionPrompt opens; select Wheel and confirm
    const typeDialog = page.locator('[role="dialog"][aria-labelledby="type-selection-title"]');
    await expect(typeDialog).toBeVisible({ timeout: 5000 });
    await typeDialog.getByRole('button', { name: /Wheel/ }).click();
    const confirmType = typeDialog.getByRole('button', { name: 'Confirm' });
    await expect(confirmType).toBeEnabled();
    await confirmType.click();
    await expect(typeDialog).toBeHidden({ timeout: 5000 });
    await page.waitForTimeout(400);

    // Confirm Part usage created with Chassis as owner
    const createdPart = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return Object.values(repo.usages).find((u: any) => u.kind === 'part' && u.typeId === 'blk-wheel' && u.name.startsWith('part_')) as any;
    });
    expect(createdPart).toBeDefined();
    expect(createdPart.ownerId).toBe('blk-chassis');

    // Return to BDD via Root breadcrumb
    await page.locator('button:has-text("Root")').first().click();
    await page.waitForTimeout(300);

    // Edit relationship properties through the actual selection + inspector workflow.
    await page.locator('#adia-diagram-canvas g[data-semantic-id="rel-chassis-wheel"]').click();
    const sourceRole = page.getByRole('textbox', { name: 'Source role name' });
    const targetRole = page.getByRole('textbox', { name: 'Target role name' });
    const sourceMultiplicity = page.getByRole('textbox', { name: 'Source multiplicity' });
    const targetMultiplicity = page.getByRole('textbox', { name: 'Target multiplicity' });
    await expect(sourceRole).toBeVisible({ timeout: 5000 });

    // A duplicate role is rejected by semantic validation and must not mutate the model.
    await sourceRole.fill('existingRole');
    await sourceRole.press('Tab');
    await expect.poll(async () => page.evaluate(() =>
      (window as any).__sysmlRepository.relationships['rel-chassis-wheel'].sourceRole,
    )).toBe('body');
    const validationDialog = page.getByRole('alertdialog');
    await expect(validationDialog).toBeVisible();
    await validationDialog.getByRole('button', { name: 'Dismiss' }).click();

    await sourceRole.fill('vehicleBody');
    await targetRole.fill('rollingTires');
    await sourceMultiplicity.fill('0..1');
    await targetMultiplicity.fill('2..*');
    await targetMultiplicity.press('Tab');

    const relInRepo = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return repo.relationships['rel-chassis-wheel'];
    });
    expect(relInRepo.sourceRole).toBe('vehicleBody');
    expect(relInRepo.targetRole).toBe('rollingTires');
    expect(relInRepo.sourceMultiplicity).toEqual({ lower: 0, upper: 1, ordered: false, unique: true });
    expect(relInRepo.targetMultiplicity).toEqual({ lower: 2, upper: '*', ordered: false, unique: true });

    // Step 3: Exercise persistence by saving and reloading project
    const saved = await saveProject(page, 'sysml-contextual-creation.adia');
    await reloadAndReopenProject(page, saved);
    await page.waitForTimeout(300);

    // Verify after reload that repository state survives
    const reloaded = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return {
        part: Object.values(repo.usages).find((u: any) => u.kind === 'part' && u.typeId === 'blk-wheel' && u.name.startsWith('part_')) as any,
        rel: repo.relationships['rel-chassis-wheel'],
      };
    });

    expect(reloaded.part).toBeDefined();
    expect(reloaded.part.ownerId).toBe('blk-chassis');
    expect(reloaded.rel).toBeDefined();
    expect(reloaded.rel.sourceRole).toBe('vehicleBody');
    expect(reloaded.rel.targetRole).toBe('rollingTires');
    expect(reloaded.rel.sourceMultiplicity).toEqual({ lower: 0, upper: 1, ordered: false, unique: true });
    expect(reloaded.rel.targetMultiplicity).toEqual({ lower: 2, upper: '*', ordered: false, unique: true });
  });

  test('3. Dragging a typed Block property onto its type Block creates a visible BDD association', async ({ page }) => {
    await page.locator('button:has-text("SysML BDD")').first().click();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const execute = (window as any).__sysmlExecuteCommand;
      execute({
        type: 'createAndPresent', diagramId: 'bdd',
        element: {
          id: 'bdd-owner', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
          isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
        },
        presentation: { x: 140, y: 140, width: 220, height: 180 },
      });
      execute({
        type: 'createAndPresent', diagramId: 'bdd',
        element: {
          id: 'bdd-target', name: 'Engine', kind: 'block', namespace: [], ownerId: 'model',
          isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
        },
        presentation: { x: 520, y: 180, width: 200, height: 150 },
      });
      execute({
        type: 'createOwnedFeature',
        intent: {
          featureKind: 'property', propertyKind: 'part', ownerBlockId: 'bdd-owner',
          typeId: 'bdd-target', name: 'engine', featureId: 'bdd-prop-engine', usageId: 'bdd-usage-engine',
        },
      });
    });

    const propertyText = page.locator('#adia-diagram-canvas [data-property-id="bdd-prop-engine"]');
    const targetBlock = page.locator('#adia-diagram-canvas g[data-semantic-id="bdd-target"]');
    await expect(propertyText).toBeVisible();
    await expect(targetBlock).toBeVisible();
    const source = await propertyText.boundingBox();
    const target = await targetBlock.boundingBox();
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
    await page.mouse.down();
    // Releasing slightly outside the symbol border should still snap to the
    // intended Block, matching the forgiving connector drop behavior in the UI.
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height + 12, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => page.evaluate(() => {
      const repository = (window as any).__sysmlRepository;
      return Object.values(repository.relationships).filter((relationship: any) =>
        relationship.kind === 'association' && relationship.sourceId === 'bdd-prop-engine' && relationship.targetId === 'bdd-target',
      ).length;
    })).toBe(1);
    const relationshipId = await page.evaluate(() => Object.values((window as any).__sysmlRepository.relationships)
      .find((relationship: any) => relationship.sourceId === 'bdd-prop-engine' && relationship.targetId === 'bdd-target')?.id);
    const relationshipGraphic = page.locator(`#adia-diagram-canvas g[data-semantic-id="${relationshipId}"]`);
    await expect(relationshipGraphic).toBeVisible();
    await expect(relationshipGraphic.locator('path').first()).not.toHaveAttribute('d', /^M\s*0\s+0\b/);
  });
});
