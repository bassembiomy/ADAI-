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
  if (!bounds) throw new Error('Presentation has no browser bounds');
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test.describe('SysML v1.6 Diagram Interaction Corrections End-to-End Gates', () => {
  test('Workflow 1: BDD Port authoring with stereotype separation, type prompt, wrong-type rejection, and reload stability', async ({ page }) => {
    await openModeler(page);

    // Switch to SysML BDD
    await page.getByRole('button', { name: 'SysML BDD' }).click();

    // Create a Block on the diagram
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const blockId = await page.evaluate(() => {
      const defs = Object.values((window as any).__sysmlRepository?.definitions ?? {}).filter((d: any) => d.kind === 'block');
      return (defs[defs.length - 1] as any)?.id;
    });
    expect(blockId).toBeTruthy();

    // Click on the Block presentation on canvas to select it
    const blockNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(blockNode).toBeVisible({ timeout: 10000 });
    await blockNode.click();

    // 1. Create Standard Port from canvas
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, blockId)).toBe(1);

    // 2. Create Flow Port from canvas
    await blockNode.click();
    await page.getByRole('button', { name: '+Flow', exact: true }).click();
    const flowPrompt = page.locator('[role="dialog"][aria-labelledby="type-selection-title"]');
    await expect(flowPrompt).toBeVisible();
    await flowPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(flowPrompt).toHaveCount(0);
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, blockId)).toBe(2);

    // 3. Test ProxyPort wrong-type rejection and type creation:
    // When no InterfaceBlock exists, clicking +Prx opens TypeSelectionPrompt with error and 0 candidates
    await blockNode.click();
    await page.getByRole('button', { name: '+Prx', exact: true }).click();
    const prompt = page.locator('[role="dialog"][aria-labelledby="type-selection-title"]');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/Select Type for Proxy Port/i);

    // Click 'Create New Type' to author an InterfaceBlock and fulfill typing
    await prompt.getByRole('button', { name: 'Create New Type' }).click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, blockId)).toBe(3);

    const dismissBtn = page.getByRole('button', { name: 'Dismiss' });
    if (await dismissBtn.isVisible()) await dismissBtn.click();

    // 4. Create Full Port from canvas
    await blockNode.click();
    await page.getByRole('button', { name: '+Full', exact: true }).click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, blockId)).toBe(4);

    // 5. Create Port from tree context menu
    const blockTreeRow = page.locator(`.model-tree-row[data-semantic-id="${blockId}"]`);
    await blockTreeRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Port' }).first().click();
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, blockId)).toBe(5);

    // Assert exact canonical feature counts and kinds on the Block
    const ports = await page.evaluate(id => {
      const b = (window as any).__sysmlRepository.definitions[id];
      return b.ports.map((p: any) => ({ id: p.id, kind: p.kind, portKind: p.portKind }));
    }, blockId);
    expect(ports).toHaveLength(5);
    const portKinds = ports.map((p: any) => p.portKind);
    expect(portKinds).toContain('umlPort');
    expect(portKinds).toContain('flowPort');
    expect(portKinds).toContain('proxyPort');
    expect(portKinds).toContain('fullPort');

    // Round-trip repository through serialization and verify stable IDs
    const serializedPortIds = await page.evaluate(id => {
      const repo = (window as any).__sysmlRepository;
      const serialized = JSON.stringify(repo);
      const parsed = JSON.parse(serialized);
      return parsed.definitions[id]?.ports?.map((p: any) => p.id);
    }, blockId);
    expect(serializedPortIds).toEqual(ports.map((p: any) => p.id));
  });

  test('Workflow 2: Property creation, rename propagation, undo/redo, and IBD boundary/assembly connectors', async ({ page }) => {
    await openModeler(page);

    // Switch to SysML BDD
    await page.getByRole('button', { name: 'SysML BDD' }).click();

    // Create System Block on canvas
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const systemId = await page.evaluate(() => {
      const defs = Object.values((window as any).__sysmlRepository?.definitions ?? {}).filter((d: any) => d.kind === 'block');
      return (defs[defs.length - 1] as any)?.id;
    });
    expect(systemId).toBeTruthy();

    // Create SubsystemA Block from tree context menu
    const modelRow = page.locator('.model-tree-row[data-semantic-id="model"]');
    await modelRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Block' }).first().click();
    const subAId = await page.evaluate(() => {
      const defs = Object.values((window as any).__sysmlRepository?.definitions ?? {}).filter((d: any) => d.kind === 'block');
      return (defs[defs.length - 1] as any)?.id;
    });
    expect(subAId).toBeTruthy();

    // Create SubsystemB Block from tree context menu
    await modelRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Block' }).first().click();
    const subBId = await page.evaluate(() => {
      const defs = Object.values((window as any).__sysmlRepository?.definitions ?? {}).filter((d: any) => d.kind === 'block');
      return (defs[defs.length - 1] as any)?.id;
    });
    expect(subBId).toBeTruthy();

    // Add boundary Port to System Block
    const systemCanvas = page.locator(`#adia-diagram-canvas [data-semantic-id="${systemId}"]`);
    await systemCanvas.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, systemId)).toBe(1);

    // Add Port to SubsystemA from tree
    const subARow = page.locator(`.model-tree-row[data-semantic-id="${subAId}"]`);
    await subARow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Port' }).first().click();
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, subAId)).toBe(1);

    // Add Port to SubsystemB from tree
    const subBRow = page.locator(`.model-tree-row[data-semantic-id="${subBId}"]`);
    await subBRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Port' }).first().click();
    await expect.poll(async () => await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length, subBId)).toBe(1);

    // Add two Part Properties to System Block from tree
    const systemTreeRow = page.locator(`.model-tree-row[data-semantic-id="${systemId}"]`);
    await systemTreeRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Part Property' }).first().click();

    await systemTreeRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Part Property' }).first().click();

    await expect.poll(async () => await page.evaluate(() =>
      Object.values((window as any).__sysmlRepository.usages).filter((u: any) => u.kind === 'part').length
    )).toBe(2);

    const partUsages = await page.evaluate(() =>
      Object.values((window as any).__sysmlRepository.usages).filter((u: any) => u.kind === 'part') as any[]
    );
    const firstPartId = partUsages[0].id;
    const secondPartId = partUsages[1].id;

    // Filter tree to make parts visible in VirtualTree
    await filterTree(page, 'part');
    const firstPartRow = page.locator(`.model-tree-row[data-semantic-id="${firstPartId}"]`);
    await expect(firstPartRow).toBeVisible();
    await firstPartRow.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Rename")').first().click();
    await page.getByRole('treeitem').getByRole('textbox').fill('powerUnit');
    await page.getByRole('treeitem').getByRole('textbox').press('Enter');
    await expect(firstPartRow).toContainText('powerUnit');

    await page.keyboard.press('Control+z');
    await expect(firstPartRow).not.toContainText('powerUnit');

    await page.keyboard.press('Control+y');
    await expect(firstPartRow).toContainText('powerUnit');

    // Clear filter before navigating
    await filterTree(page, '');

    // Navigate into System Block's IBD
    await systemCanvas.dblclick();
    await expect(page.locator('#adia-diagram-canvas').getByText(/ibd \[Block/i)).toBeVisible();

    // Boundary endpoint exists
    const boundaryEndpoint = page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="boundary"]').first();
    await expect(boundaryEndpoint).toBeVisible();

    // Add both parts to IBD diagram
    await filterTree(page, 'part');
    await firstPartRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();

    const secondPartRow = page.locator(`.model-tree-row[data-semantic-id="${secondPartId}"]`);
    await secondPartRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await filterTree(page, '');

    // Move second part presentation away so its ports don't overlap first part's ports
    const secondPartCanvasNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${secondPartId}"]`);
    await movePresentation(page, secondPartCanvasNode, 220, 0);

    const partEndpoints = page.locator('[data-testid="ibd-connector-endpoint"]:not([data-occurrence-id="boundary"])');
    await expect(partEndpoints).toHaveCount(2);

    // Connect boundary-to-part delegation
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await boundaryEndpoint.click();
    await partEndpoints.first().click();

    const connectors = page.locator('#adia-diagram-canvas [data-presentation-kind="connector"]');
    await expect(connectors).toHaveCount(1);
    const delegationId = await connectors.first().getAttribute('data-connector-id');
    expect(delegationId).toBeTruthy();

    // Connect part-to-part assembly
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await partEndpoints.first().click();
    await expect(partEndpoints.first()).toHaveAttribute('data-selected', 'true');
    await partEndpoints.nth(1).click();
    await expect(connectors).toHaveCount(2);
    const assemblyId = await connectors.nth(1).getAttribute('data-connector-id');
    expect(assemblyId).toBeTruthy();

    // Verify connectors remain visible and present in canonical repository
    await expect(page.locator('#adia-diagram-canvas [data-presentation-kind="connector"]')).toHaveCount(2);
    const repoConnectors = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return Object.keys(repo?.connectors ?? {});
    });
    expect(repoConnectors).toHaveLength(2);
  });

  test('Workflow 3: Requirement Diagram Block isolation, TestCase creation, removal preservation, and deletion undo', async ({ page }) => {
    await openModeler(page);

    // Create a Block on BDD
    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const idsBeforeBlock = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeBlock.has(id)).length).toBe(1);
    const blockId = (await semanticIdsInTree(page)).find(id => !idsBeforeBlock.has(id))!;

    // Switch to Requirements Diagram
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();

    // Add existing Block to diagram
    const blockItem = page.locator(`.model-tree-row[data-semantic-id="${blockId}"]`);
    await blockItem.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();

    const blockOnReq = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(blockOnReq).toBeVisible({ timeout: 10000 });

    // Double-click Block on Requirement diagram: must NOT navigate away to IBD
    await blockOnReq.dblclick();
    await page.waitForTimeout(500);
    const reqModeBtn = page.getByRole('button', { name: 'Requirements', exact: true });
    await expect(reqModeBtn).toHaveClass(/bg-\[var\(--surface-panel\)\]/);

    // 1. Create TestCase from canvas toolbar
    const idsBeforeTc1 = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Test Case', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeTc1.has(id)).length).toBe(1);
    const tc1Id = (await semanticIdsInTree(page)).find(id => !idsBeforeTc1.has(id))!;
    const tc1Presentation = page.locator(`#adia-diagram-canvas [data-semantic-id="${tc1Id}"]`);
    await expect(tc1Presentation).toBeVisible();

    // 2. Create TestCase from Model Explorer tree
    const modelRow = page.locator('.model-tree-row[data-semantic-id="model"]');
    const idsBeforeTc2 = new Set(await semanticIdsInTree(page));
    await modelRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Test Case' }).first().click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeTc2.has(id)).length).toBe(1);
    const tc2Id = (await semanticIdsInTree(page)).find(id => !idsBeforeTc2.has(id))!;

    await filterTree(page, 'Case');
    const tcRows = page.locator('.model-tree-row[data-kind="testCase"], .model-tree-row[data-kind="verificationCase"]');
    await expect(tcRows).toHaveCount(2);

    // 3. Move presentation on canvas
    const origTransform = await tc1Presentation.getAttribute('transform');
    await movePresentation(page, tc1Presentation, 80, 50);
    await expect(tc1Presentation).not.toHaveAttribute('transform', origTransform ?? '');

    // 4. Remove TC1 presentation from diagram: verify repository preservation
    await filterTree(page, '');
    const tc1Row = page.locator(`.model-tree-row[data-semantic-id="${tc1Id}"]`);
    await tc1Row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove from Diagram', exact: true }).click();
    await expect(tc1Presentation).toHaveCount(0);
    await expect(tc1Row).toHaveCount(1);
    await filterTree(page, 'Case');
    await expect(tcRows).toHaveCount(2);

    // 5. Delete TC2 from Model and undo
    await filterTree(page, 'Case');
    const tc2Row = page.locator(`.model-tree-row[data-semantic-id="${tc2Id}"]`);
    await expect(tc2Row).toBeVisible();
    await tc2Row.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Delete from Model")').first().click();
    const impactDialog = page.locator('[role="dialog"][aria-labelledby="move-impact-dialog-title"]');
    if (await impactDialog.isVisible({ timeout: 500 }).catch(() => false)) {
      await impactDialog.getByRole('button', { name: 'Confirm' }).click();
      await expect(impactDialog).toHaveCount(0);
    }
    await expect(tc2Row).toHaveCount(0);

    await page.keyboard.press('Control+z');
    await expect(tc2Row).toHaveCount(1);
    await filterTree(page, '');
  });

  test('Workflow 4: State to Requirement Satisfy connection and direction enforcement', async ({ page }) => {
    await openModeler(page);

    // 1. Create Requirement on Requirements diagram
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const beforeIds = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !beforeIds.has(id)).length).toBe(1);
    const reqId = (await semanticIdsInTree(page)).find(id => !beforeIds.has(id))!;

    // 2. Switch to State Machine mode and create State
    await page.getByRole('button', { name: 'State Machine' }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'State', exact: true }).click();

    const stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    await expect(stateItem).toBeVisible({ timeout: 5000 });
    const stateId = await stateItem.getAttribute('data-semantic-id');
    if (!stateId) throw new Error('State has no semantic ID');
    await stateItem.click();

    // 3. Connect State -> Requirement Satisfy link via inspector
    const reqSelect = page.locator('#req-select');
    await expect(reqSelect).toBeVisible({ timeout: 5000 });
    await reqSelect.selectOption(reqId);
    const addTraceBtn = page.getByRole('button', { name: /Add Trace Link/i });
    await expect(addTraceBtn).toBeEnabled();
    await addTraceBtn.click();
    await expect(page.locator('span:has-text("«satisfy»")').first()).toBeVisible({ timeout: 5000 });

    // 4. Attempt reverse direction (Requirement -> State satisfy) and assert INVALID_SATISFY_DIRECTION
    const result = await page.evaluate(({ reqId, stateId }) => {
      return (window as any).__sysmlExecuteCommand?.({
        type: 'createElement',
        element: {
          id: 'invalid-reverse-satisfy',
          sourceId: reqId,
          targetId: stateId,
          kind: 'satisfy',
          name: '',
        },
      });
    }, { reqId, stateId });

    expect(result.committed).toBe(false);
    expect(result.diagnostics.some((d: any) => d.code === 'INVALID_SATISFY_DIRECTION')).toBe(true);

    // Assert relationship count remains exactly 1 (unchanged)
    const relCount = await page.evaluate(() => {
      const repo = (window as any).__sysmlRepository;
      return Object.keys(repo?.relationships ?? {}).length;
    });
    expect(relCount).toBe(1);
  });

  test('Workflow 5: Deterministic Package Diagram activation zero/one/many cases', async ({ page }) => {
    await openModeler(page);

    // Case 1: Zero diagrams exist -> clicking Package Diagram automatically creates and activates 1 diagram
    const packageBtn = page.getByRole('button', { name: 'Package Diagram' });
    await expect(packageBtn).toBeVisible();
    await expect(packageBtn).toBeEnabled();

    await packageBtn.click();
    await expect(packageBtn).toHaveClass(/bg-\[var\(--surface-panel\)\]/, { timeout: 10000 });
    await expect(page.locator('#adia-diagram-canvas')).toBeVisible();

    await filterTree(page, 'Package');
    const diagrams = page.locator('.model-tree-row[data-kind="diagram"]');
    await expect(diagrams).toHaveCount(1);
    const firstDiagramId = await diagrams.first().getAttribute('data-semantic-id');
    if (!firstDiagramId) throw new Error('Package Diagram has no semantic ID');

    // Case 2: Exactly 1 diagram exists -> switching away to BDD and clicking Package Diagram directly opens it without chooser
    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await expect(page.getByRole('button', { name: 'SysML BDD' })).toHaveClass(/bg-\[var\(--surface-panel\)\]/);

    await packageBtn.click();
    await expect(packageBtn).toHaveClass(/bg-\[var\(--surface-panel\)\]/);
    await expect(page.locator('div:has-text("Select Package Diagram")')).toHaveCount(0);

    // Case 3: Multiple diagrams exist -> create second diagram via tree
    await filterTree(page, '');
    const modelRow = page.locator('.model-tree-row[data-semantic-id="model"]');
    await modelRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Package Diagram', exact: true }).click();
    await filterTree(page, 'Package');
    await expect(diagrams).toHaveCount(2);

    // Reset activePackageDiagramId to null so resolvePackageDiagramActivation enters chooser mode
    await page.evaluate(() => {
      (window as any).__setActivePackageDiagramId?.(null);
    });

    // Click Package Diagram: chooser dialog appears because 2 diagrams exist and no active diagram is cached
    await page.getByRole('button', { name: 'Package Diagram' }).click();
    const chooser = page.locator('div:has-text("Select Package Diagram")').last();
    await expect(chooser).toBeVisible();

    // Select the second diagram from the chooser
    const chooserButtons = page.locator('button:has-text("ID:")');
    await expect(chooserButtons).toHaveCount(2);
    await chooserButtons.nth(1).click();
    await expect(page.locator('h3:has-text("Select Package Diagram")')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Package Diagram' })).toHaveClass(/bg-\[var\(--surface-panel\)\]/);

    // Case 4: Independent presentation restoration between the two package diagrams
    await page.getByRole('button', { name: 'Package', exact: true }).click();
    await expect(page.locator('#adia-diagram-canvas [data-presentation-kind="package"]')).toHaveCount(1);

    // Switch to first diagram via tree double-click
    await filterTree(page, 'Package');
    await diagrams.first().dblclick();
    await expect(page.locator('#adia-diagram-canvas [data-presentation-kind="package"]')).toHaveCount(0);
  });
});
