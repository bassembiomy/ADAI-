import { test, expect } from '@playwright/test';

/**
 * Task 7 — Browser-level semantic workflows with real application reload
 * (spec sections 4, 6, 8.2, 8.3).
 *
 * Every reload assertion in this file uses the application's real save flow
 * (Save toolbar button producing a downloaded .adia payload built by
 * buildUnifiedProjectPayload/serializeRepository), a real browser page
 * reload, and the real project re-open path (file input through
 * validateImportedJson + hydrateProject + loadCanonicalSysmlProject). No
 * in-memory JSON round-trip is substituted for reload evidence.
 *
 * Mandatory behavior is asserted unconditionally: no optional visibility
 * checks gate core assertions, and TestCase impact confirmation is always
 * required when dependencies or presentations exist.
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

async function repoDefinitionIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((window as any).__sysmlRepository?.definitions ?? {}));
}

async function repoUsageIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((window as any).__sysmlRepository?.usages ?? {}));
}

async function repoRelationshipIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((window as any).__sysmlRepository?.relationships ?? {}));
}

async function repoRequirementIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((window as any).__sysmlRepository?.requirements ?? {}));
}

async function repoVerificationCaseIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((window as any).__sysmlRepository?.verificationCases ?? {}));
}

async function portCount(page: import('@playwright/test').Page, blockId: string): Promise<number> {
  return page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.ports?.length ?? 0, blockId);
}

async function portsOf(page: import('@playwright/test').Page, blockId: string): Promise<any[]> {
  return page.evaluate(id => {
    const b = (window as any).__sysmlRepository.definitions[id];
    return (b?.ports ?? []).map((p: any) => ({ id: p.id, kind: p.kind, portKind: p.portKind, typeId: p.typeId }));
  }, blockId);
}

/** Create one Block through the BDD canvas toolbar and return its canonical ID. */
async function createCanvasBlock(page: import('@playwright/test').Page, name?: string): Promise<string> {
  const before = new Set(await repoDefinitionIds(page));
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  let created = '';
  await expect.poll(async () => {
    const fresh = (await repoDefinitionIds(page)).filter(id => !before.has(id));
    if (fresh.length === 1) created = fresh[0];
    return fresh.length;
  }).toBe(1);
  if (name) {
    await filterTree(page, '');
    const row = page.locator(`.model-tree-row[data-semantic-id="${created}"]`);
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Rename/ }).click();
    const nameInput = row.getByRole('textbox');
    await nameInput.fill(name);
    await nameInput.press('Enter');
    await expect(row).toContainText(name);
  }
  return created;
}

/** Create one Block through the Model Explorer and rename it to a stable label. */
async function createTreeBlock(page: import('@playwright/test').Page, name: string): Promise<string> {
  await filterTree(page, '');
  const before = new Set(await repoDefinitionIds(page));
  const modelRow = page.locator('.model-tree-row[data-semantic-id="model"]');
  await modelRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Block', exact: true }).first().click();
  let created = '';
  await expect.poll(async () => {
    const fresh = (await repoDefinitionIds(page)).filter(id => !before.has(id));
    if (fresh.length === 1) created = fresh[0];
    return fresh.length;
  }).toBe(1);
  const row = page.locator(`.model-tree-row[data-semantic-id="${created}"]`);
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Rename/ }).click();
  const nameInput = row.getByRole('textbox');
  await nameInput.fill(name);
  await nameInput.press('Enter');
  await expect(row).toContainText(name);
  return created;
}

/**
 * Real application save: clicks the production Save toolbar button and
 * captures the downloaded .adia payload (built by
 * buildUnifiedProjectPayload through the canonical serializer).
 */
async function saveProject(page: import('@playwright/test').Page, filename: string): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Save ADIA project (.adia)').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.adia$/);
  const savedPath = test.info().outputPath(filename);
  await download.saveAs(savedPath);
  return savedPath;
}

/**
 * Real application reload: reloads the browser page (wiping all in-memory
 * state) and re-opens the saved project through the production file-import
 * path (validateImportedJson + hydrateProject + loadCanonicalSysmlProject).
 */
async function reloadAndReopenProject(page: import('@playwright/test').Page, savedPath: string) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await dismissOverlay(page);
  await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(savedPath);
}

function typeSelectionPrompt(page: import('@playwright/test').Page) {
  return page.locator('[role="dialog"][aria-labelledby="type-selection-title"]');
}

function impactDialog(page: import('@playwright/test').Page) {
  return page.locator('[role="dialog"][aria-labelledby="move-impact-dialog-title"]');
}

function relationshipWizard(page: import('@playwright/test').Page) {
  return page.getByRole('dialog', { name: 'Create Relationship' });
}

test.describe('SysML v1.6 Diagram Interaction Corrections End-to-End Gates', () => {
  test('BDD connection pen immediately creates a typed property Association', async ({ page }) => {
    test.setTimeout(60000);
    await openModeler(page);
    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const diagramId = await page.evaluate(() => (window as any).__adiaTestHooks.getActiveDiagramId());
    const seeded = await page.evaluate(({ diagramId }) => {
      const execute = (window as any).__sysmlExecuteCommand;
      const owner = execute({ type: 'createAndPresent', diagramId, element: {
        id: 'pen-owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
        properties: [], ports: [], operations: [], constraints: [],
      }, presentation: { x: 100, y: 120, width: 200, height: 140 } });
      const target = execute({ type: 'createAndPresent', diagramId, element: {
        id: 'pen-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
        properties: [], ports: [], operations: [], constraints: [],
      }, presentation: { x: 430, y: 120, width: 180, height: 120 } });
      const feature = execute({ type: 'createOwnedFeature', intent: {
        featureKind: 'property', ownerBlockId: 'pen-owner', propertyKind: 'part', typeId: 'pen-motor',
        featureId: 'pen-motor-property', usageId: 'pen-motor-usage', name: 'motor',
      }});
      return { owner: owner.committed, target: target.committed, feature: feature.committed };
    }, { diagramId });
    expect(seeded).toEqual({ owner: true, target: true, feature: true });

    const before = new Set(await repoRelationshipIds(page));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.locator('#adia-diagram-canvas text[data-property-id="pen-motor-property"]').dispatchEvent('mousedown', { button: 0 });
    await expect(page.getByText('Click target state/junction to connect...')).toBeVisible();
    await page.locator('#adia-diagram-canvas [data-semantic-id="pen-motor"]').dispatchEvent('mousedown', { button: 0 });
    await expect.poll(async () => (await repoRelationshipIds(page)).filter(id => !before.has(id)).length).toBe(1);
    const relationshipId = (await repoRelationshipIds(page)).find(id => !before.has(id))!;
    expect(await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], relationshipId)).toMatchObject({
      kind: 'association', sourceId: 'pen-motor-property', targetId: 'pen-motor',
    });
    const propertyRelPresentation = page.locator(`#adia-diagram-canvas [data-semantic-id="${relationshipId}"][data-presentation-kind="relationship"]`);
    await expect(propertyRelPresentation).toBeVisible();
    await expect(propertyRelPresentation.locator('[data-presentation-role="property-end-marker"]')).toBeVisible();
    await expect(propertyRelPresentation.locator('[data-presentation-role="property-end-label"]')).toContainText('motor');
    await expect(propertyRelPresentation).toHaveAttribute('data-bdd-presentation-kind', 'propertyAssociation');

    // Block-to-Block kind filtering & presentation verification:
    // Connect Block-to-Block pen-owner -> pen-motor
    const b2bBefore = new Set(await repoRelationshipIds(page));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.locator('#adia-diagram-canvas [data-semantic-id="pen-owner"]').dispatchEvent('mousedown', { button: 0 });
    await expect(page.getByText('Click target state/junction to connect...')).toBeVisible();
    await page.locator('#adia-diagram-canvas [data-semantic-id="pen-motor"]').dispatchEvent('mousedown', { button: 0 });
    await expect.poll(async () => (await repoRelationshipIds(page)).filter(id => !b2bBefore.has(id)).length).toBe(1);
    const b2bRelId = (await repoRelationshipIds(page)).find(id => !b2bBefore.has(id))!;
    expect(await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], b2bRelId)).toMatchObject({
      kind: 'association', sourceId: 'pen-owner', targetId: 'pen-motor',
    });
    const b2bPresentation = page.locator(`#adia-diagram-canvas [data-semantic-id="${b2bRelId}"][data-presentation-kind="relationship"]`);
    await expect(b2bPresentation).toBeVisible();
    await expect(b2bPresentation).toHaveAttribute('data-bdd-presentation-kind', 'blockAssociation');
    await expect(b2bPresentation.locator('[data-presentation-role="property-end-marker"]')).toHaveCount(0);
    await expect(b2bPresentation.locator('[data-presentation-role="property-end-label"]')).toHaveCount(0);
  });

  test('Workflow 1: BDD Port authoring from tree and canvas with explicit types, wrong-type rejection, and real save/reload stability', async ({ page }) => {
    test.setTimeout(120000);
    await openModeler(page);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const ownerId = await createCanvasBlock(page, 'OwnerBlock');
    const typeBlockId = await createCanvasBlock(page, 'TypeBlock');
    // Canvas Blocks spawn stacked: move the type Block aside so the owner stays clickable.
    await movePresentation(page, page.locator(`#adia-diagram-canvas [data-semantic-id="${typeBlockId}"]`), 260, 0);
    const typeBlockName = await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.name, typeBlockId);
    expect(typeBlockName).toBe('TypeBlock');

    const ownerNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${ownerId}"]`);
    await expect(ownerNode).toBeVisible({ timeout: 10000 });

    // 1. Standard Port from canvas: explicit no-type exception, no prompt.
    await ownerNode.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(1);
    await expect(typeSelectionPrompt(page)).toHaveCount(0);
    let ports = await portsOf(page, ownerId);
    expect(ports[0].portKind).toBe('umlPort');
    expect(ports[0].typeId).toBeFalsy();

    // 2. ProxyPort from canvas with no InterfaceBlock: empty candidates, no silent selection.
    await ownerNode.click();
    await page.getByRole('button', { name: '+Prx', exact: true }).click();
    const proxyPrompt = typeSelectionPrompt(page);
    await expect(proxyPrompt).toBeVisible();
    await expect(proxyPrompt).toContainText(/Select Type for Proxy Port/i);
    await expect(proxyPrompt).toContainText(/Compatible Types \(0\)/);
    await expect(proxyPrompt).toContainText(/No compatible existing types found in the model\./);
    // Wrong-type candidates are excluded: existing Blocks are not offered for ProxyPort.
    await expect(proxyPrompt.getByRole('button', { name: typeBlockName })).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(1);

    // 3. Wrong-type ProxyPort is rejected by the gateway with a structured diagnostic and no mutation.
    const wrongTypeResult = await page.evaluate(({ owner, wrongType }) => {
      return (window as any).__sysmlExecuteCommand?.({
        type: 'createOwnedFeature',
        intent: { featureKind: 'port', ownerBlockId: owner, portKind: 'proxyPort', typeId: wrongType },
      });
    }, { owner: ownerId, wrongType: typeBlockId });
    expect(wrongTypeResult.committed).toBe(false);
    expect(wrongTypeResult.diagnostics.some((d: any) => d.code === 'INVALID_PROXY_PORT_TYPE')).toBe(true);
    await expect.poll(async () => portCount(page, ownerId)).toBe(1);

    // 4. CreateNewType is a separate explicit action that creates the InterfaceBlock and resumes.
    const defsBefore = new Set(await repoDefinitionIds(page));
    await proxyPrompt.getByRole('button', { name: 'Create New Type' }).click();
    await expect(proxyPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(2);
    const interfaceId = (await repoDefinitionIds(page)).find(id => !defsBefore.has(id))!;
    const interfaceKind = await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.kind, interfaceId);
    expect(interfaceKind).toBe('interface');
    const interfaceName = await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.name, interfaceId);
    ports = await portsOf(page, ownerId);
    expect(ports[1].portKind).toBe('proxyPort');
    expect(ports[1].typeId).toBe(interfaceId);

    // 5. FullPort from canvas: wrong-type InterfaceBlock excluded, Confirm disabled without choice.
    await ownerNode.click();
    await page.getByRole('button', { name: '+Full', exact: true }).click();
    const fullPrompt = typeSelectionPrompt(page);
    await expect(fullPrompt).toBeVisible();
    await expect(fullPrompt).toContainText(/Select Type for Full Port/i);
    await expect(fullPrompt.getByRole('button', { name: interfaceName })).toHaveCount(0);
    await expect(fullPrompt.getByRole('button', { name: typeBlockName })).toHaveCount(1);
    await expect(fullPrompt.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await fullPrompt.getByRole('button', { name: typeBlockName }).click();
    await fullPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(fullPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(3);
    ports = await portsOf(page, ownerId);
    expect(ports[2].portKind).toBe('fullPort');
    expect(ports[2].typeId).toBe(typeBlockId);

    // 6. FlowPort from canvas: cancel creates nothing; explicit choice creates the typed port.
    await ownerNode.click();
    await page.getByRole('button', { name: '+Flow', exact: true }).click();
    const flowPrompt = typeSelectionPrompt(page);
    await expect(flowPrompt).toBeVisible();
    await flowPrompt.getByRole('button', { name: 'Cancel' }).click();
    await expect(flowPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(3);
    await ownerNode.click();
    await page.getByRole('button', { name: '+Flow', exact: true }).click();
    await expect(flowPrompt).toBeVisible();
    await flowPrompt.getByRole('button', { name: typeBlockName }).click();
    await flowPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(flowPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(4);
    ports = await portsOf(page, ownerId);
    expect(ports[3].portKind).toBe('flowPort');
    expect(ports[3].typeId).toBe(typeBlockId);

    // 7. Tree ProxyPort with explicit InterfaceBlock selection.
    await filterTree(page, '');
    const ownerRow = page.locator(`.model-tree-row[data-semantic-id="${ownerId}"]`);
    await ownerRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Proxy Port$/ }).click();
    const treeProxyPrompt = typeSelectionPrompt(page);
    await expect(treeProxyPrompt).toBeVisible();
    await treeProxyPrompt.getByRole('button', { name: interfaceName }).click();
    await treeProxyPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(treeProxyPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(5);
    ports = await portsOf(page, ownerId);
    expect(ports[4].portKind).toBe('proxyPort');
    expect(ports[4].typeId).toBe(interfaceId);

    // 8. Tree FullPort and Legacy FlowPort with explicit type selection.
    await ownerRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Full Port$/ }).click();
    const treeFullPrompt = typeSelectionPrompt(page);
    await expect(treeFullPrompt).toBeVisible();
    await treeFullPrompt.getByRole('button', { name: typeBlockName }).click();
    await treeFullPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(treeFullPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(6);

    await ownerRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Legacy Flow Port$/ }).click();
    const treeFlowPrompt = typeSelectionPrompt(page);
    await expect(treeFlowPrompt).toBeVisible();
    await treeFlowPrompt.getByRole('button', { name: typeBlockName }).click();
    await treeFlowPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(treeFlowPrompt).toHaveCount(0);
    await expect.poll(async () => portCount(page, ownerId)).toBe(7);

    // 9. Tree Standard UML Port creates immediately with no prompt.
    await ownerRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^(Standard UML Port|Port)$/ }).first().click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(8);
    await expect(typeSelectionPrompt(page)).toHaveCount(0);

    ports = await portsOf(page, ownerId);
    expect(ports).toHaveLength(8);
    const portKinds = ports.map(p => p.portKind);
    expect(portKinds).toContain('umlPort');
    expect(portKinds).toContain('flowPort');
    expect(portKinds).toContain('proxyPort');
    expect(portKinds).toContain('fullPort');

    const definitionsBefore = (await repoDefinitionIds(page)).sort();
    const portIdsBefore = ports.map(p => p.id);

    // 10. Real save, real reload, real re-open: every semantic/type/presentation identity is stable.
    const savedPath = await saveProject(page, 'workflow1.adia');
    await reloadAndReopenProject(page, savedPath);
    await expect.poll(async () => (await repoDefinitionIds(page)).sort()).toEqual(definitionsBefore);
    const portsAfter = await portsOf(page, ownerId);
    expect(portsAfter.map(p => p.id)).toEqual(portIdsBefore);
    expect(portsAfter.map(p => p.typeId)).toEqual(ports.map(p => p.typeId));
    expect(await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.kind, interfaceId)).toBe('interface');

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const ownerAfterReload = page.locator(`#adia-diagram-canvas [data-semantic-id="${ownerId}"]`);
    await expect(ownerAfterReload).toBeVisible({ timeout: 15000 });
    await expect(ownerAfterReload.locator('rect[width="10"][height="10"]')).toHaveCount(8);
  });

  test('Workflow 2: typed Part Properties, Association/Dependency/Allocate, rename/undo/redo, IBD connectors, and real save/reload', async ({ page }) => {
    test.setTimeout(180000);
    await openModeler(page);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const vehicleId = await createCanvasBlock(page, 'Vehicle');
    const motorId = await createTreeBlock(page, 'Motor');
    const batteryId = await createTreeBlock(page, 'Battery');

    // Present Motor and Battery on the BDD canvas so relationships render as edges.
    await filterTree(page, '');
    for (const targetId of [motorId, batteryId]) {
      await page.locator(`.model-tree-row[data-semantic-id="${targetId}"]`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
      await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${targetId}"]`)).toBeVisible({ timeout: 10000 });
    }
    // Separate the stacked presentations so each node stays clickable.
    await movePresentation(page, page.locator(`#adia-diagram-canvas [data-semantic-id="${motorId}"]`), 260, 0);
    await movePresentation(page, page.locator(`#adia-diagram-canvas [data-semantic-id="${batteryId}"]`), 260, 220);

    // Typed Part Properties through the explicit tree type-selection workflow.
    await filterTree(page, '');
    const vehicleRow = page.locator(`.model-tree-row[data-semantic-id="${vehicleId}"]`);
    const usagesBefore = new Set(await repoUsageIds(page));
    await vehicleRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Part Property', exact: true }).click();
    const partPrompt = typeSelectionPrompt(page);
    await expect(partPrompt).toBeVisible();
    await expect(partPrompt).toContainText(/Select Type for Part Property/i);
    await partPrompt.getByRole('button', { name: 'Motor' }).click();
    await partPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(partPrompt).toHaveCount(0);

    await vehicleRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Part Property', exact: true }).click();
    await expect(partPrompt).toBeVisible();
    await partPrompt.getByRole('button', { name: 'Battery' }).click();
    await partPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect(partPrompt).toHaveCount(0);

    await expect.poll(async () => (await repoUsageIds(page)).filter(id => !usagesBefore.has(id)).length).toBe(2);
    const partUsageIds = (await repoUsageIds(page)).filter(id => !usagesBefore.has(id));
    const firstPartId = partUsageIds[0];
    const secondPartId = partUsageIds[1];
    const usageTypes = await page.evaluate(ids => ids.map(id => (window as any).__sysmlRepository.usages[id]?.typeId), partUsageIds);
    expect(usageTypes).toEqual([motorId, batteryId]);
    const vehicleProps = await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.properties?.map((p: any) => p.typeId), vehicleId);
    expect(vehicleProps).toEqual([motorId, batteryId]);

    // The connection pen must commit an unambiguous typed property Association
    // directly when the target is the property's declared Block type.
    const enginePropertyId = await page.evaluate(([ownerId, typeId]) =>
      (window as any).__sysmlRepository.definitions[ownerId]?.properties?.find((property: any) => property.typeId === typeId)?.id,
      [vehicleId, motorId],
    );
    expect(enginePropertyId).toBeTruthy();
    const dragSource = page.locator(`#adia-diagram-canvas text[data-property-id="${enginePropertyId}"]`);
    const dragTarget = page.locator(`#adia-diagram-canvas [data-semantic-id="${motorId}"]`);
    const relationshipsBeforePropertyDrag = new Set(await repoRelationshipIds(page));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await dragSource.click();
    await dragTarget.click();
    await expect(page.getByRole('dialog', { name: 'Create Relationship' })).toHaveCount(0);
    await expect.poll(async () => (await repoRelationshipIds(page)).filter(id => !relationshipsBeforePropertyDrag.has(id)).length).toBe(1);
    const propertyAssociationId = (await repoRelationshipIds(page)).find(id => !relationshipsBeforePropertyDrag.has(id))!;
    const propertyAssociation = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], propertyAssociationId);
    expect(propertyAssociation).toMatchObject({ kind: 'association', sourceId: enginePropertyId, targetId: motorId });
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${propertyAssociationId}"][data-presentation-kind="relationship"]`)).toBeVisible();

    // Association Vehicle -> Motor through the explicit tree relationship wizard.
    const relsBefore = new Set(await repoRelationshipIds(page));
    await vehicleRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Association', exact: true }).click();
    const assocWizard = relationshipWizard(page);
    await expect(assocWizard.getByText('Target Element')).toBeVisible();
    await assocWizard.getByRole('button', { name: 'Motor' }).click();
    await assocWizard.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(assocWizard).toHaveCount(0);
    let freshRels = (await repoRelationshipIds(page)).filter(id => !relsBefore.has(id));
    expect(freshRels).toHaveLength(1);
    const associationId = freshRels[0];
    const association = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], associationId);
    expect(association.kind).toBe('association');
    expect(association.sourceId).toBe(vehicleId);
    expect(association.targetId).toBe(motorId);

    // Dependency Motor -> Battery through the explicit tree relationship wizard.
    const motorRow = page.locator(`.model-tree-row[data-semantic-id="${motorId}"]`);
    await motorRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Dependency', exact: true }).click();
    const depWizard = relationshipWizard(page);
    await expect(depWizard.getByText('Target Element')).toBeVisible();
    await depWizard.getByRole('button', { name: 'Battery' }).click();
    await depWizard.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(depWizard).toHaveCount(0);
    freshRels = (await repoRelationshipIds(page)).filter(id => !relsBefore.has(id));
    expect(freshRels).toHaveLength(2);
    const dependencyId = freshRels.find(id => id !== associationId)!;
    const dependency = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], dependencyId);
    expect(dependency.kind).toBe('dependency');
    expect(dependency.sourceId).toBe(motorId);
    expect(dependency.targetId).toBe(batteryId);

    // Allocate from the Motor-typed Part Property usage to Battery through the
    // explicit tree relationship wizard — the same explicit tool used for
    // Association/Dependency above.
    await filterTree(page, '');
    const allocSourceRow = page.locator(`.model-tree-row[data-semantic-id="${firstPartId}"]`);
    await expect(allocSourceRow).toBeVisible();
    await allocSourceRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Allocation', exact: true }).click();
    const allocWizard = relationshipWizard(page);
    await expect(allocWizard.getByText('Target Element')).toBeVisible();
    await expect(allocWizard.getByText('No matching target elements')).toHaveCount(0);
    await allocWizard.getByRole('button', { name: 'Battery', exact: true }).click();
    await allocWizard.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(allocWizard).toHaveCount(0);
    freshRels = (await repoRelationshipIds(page)).filter(id => !relsBefore.has(id));
    expect(freshRels).toHaveLength(3);
    const allocationId = freshRels.find(id => id !== associationId && id !== dependencyId)!;
    const allocation = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], allocationId);
    expect(allocation.kind).toBe('allocation');
    expect(allocation.sourceId).toBe(firstPartId);
    expect(allocation.targetId).toBe(batteryId);

    // Rename the Part Property endpoint with undo/redo. The tree re-filters on
    // every render, so each UI assertion re-filters by the expected live name
    // while the repository carries the semantic assertions.
    const usageName = async (id: string) =>
      page.evaluate(i => (window as any).__sysmlRepository.usages[i]?.name, id);
    const firstPartName = await usageName(firstPartId);
    await filterTree(page, firstPartName);
    const firstPartRow = page.locator(`.model-tree-row[data-semantic-id="${firstPartId}"]`);
    await expect(firstPartRow).toBeVisible();
    await firstPartRow.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Rename")').first().click();
    await firstPartRow.getByRole('textbox').fill('powerUnit');
    await firstPartRow.getByRole('textbox').press('Enter');
    await expect.poll(async () => usageName(firstPartId)).toBe('powerUnit');
    await filterTree(page, 'powerUnit');
    await expect(firstPartRow).toContainText('powerUnit');

    // Blur the filter input onto the row so keyboard undo/redo reach the app history.
    await firstPartRow.click();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => usageName(firstPartId)).toBe(firstPartName);
    await filterTree(page, firstPartName);
    await expect(firstPartRow).not.toContainText('powerUnit');

    await firstPartRow.click();
    await page.keyboard.press('Control+y');
    await expect.poll(async () => usageName(firstPartId)).toBe('powerUnit');
    await filterTree(page, 'powerUnit');
    await expect(firstPartRow).toContainText('powerUnit');
    await filterTree(page, '');

    // Boundary and part ports so IBD connector endpoints exist.
    const vehicleCanvas = page.locator(`#adia-diagram-canvas [data-semantic-id="${vehicleId}"]`);
    await expect(vehicleCanvas).toBeVisible({ timeout: 10000 });
    await vehicleCanvas.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => portCount(page, vehicleId)).toBe(1);

    const motorCanvas = page.locator(`#adia-diagram-canvas [data-semantic-id="${motorId}"]`);
    await expect(motorCanvas).toBeVisible({ timeout: 10000 });
    await motorCanvas.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => portCount(page, motorId)).toBe(1);

    const batteryCanvas = page.locator(`#adia-diagram-canvas [data-semantic-id="${batteryId}"]`);
    await expect(batteryCanvas).toBeVisible({ timeout: 10000 });
    await batteryCanvas.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => portCount(page, batteryId)).toBe(1);

    // Navigate into Vehicle's IBD and connect boundary-to-part delegation plus part-to-part assembly.
    await vehicleCanvas.dblclick();
    await expect(page.locator('#adia-diagram-canvas').getByText(/ibd \[Block/i)).toBeVisible();
    const boundaryEndpoint = page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="boundary"]').first();
    await expect(boundaryEndpoint).toBeVisible();

    await filterTree(page, 'powerUnit');
    await firstPartRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    const secondPartName = await page.evaluate(id => (window as any).__sysmlRepository.usages[id]?.name, secondPartId);
    await filterTree(page, secondPartName);
    const secondPartRow = page.locator(`.model-tree-row[data-semantic-id="${secondPartId}"]`);
    await secondPartRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await filterTree(page, '');

    const secondPartCanvasNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${secondPartId}"]`);
    await movePresentation(page, secondPartCanvasNode, 220, 0);

    const partEndpoints = page.locator('[data-testid="ibd-connector-endpoint"]:not([data-occurrence-id="boundary"])');
    await expect(partEndpoints).toHaveCount(2);

    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await boundaryEndpoint.click();
    await partEndpoints.first().click();
    const connectors = page.locator('#adia-diagram-canvas [data-presentation-kind="connector"]');
    await expect(connectors).toHaveCount(1);
    const delegationId = await connectors.first().getAttribute('data-connector-id');
    expect(delegationId).toBeTruthy();

    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await partEndpoints.first().click();
    await expect(partEndpoints.first()).toHaveAttribute('data-selected', 'true');
    await partEndpoints.nth(1).click();
    await expect(connectors).toHaveCount(2);
    const assemblyId = await connectors.nth(1).getAttribute('data-connector-id');
    expect(assemblyId).toBeTruthy();

    const definitionsBefore = (await repoDefinitionIds(page)).sort();
    const usagesBeforeReload = (await repoUsageIds(page)).sort();
    const relationshipsBefore = (await repoRelationshipIds(page)).sort();

    // Real save, real reload, real re-open: no duplicated definitions, usages, or relationships.
    const savedPath = await saveProject(page, 'workflow2.adia');
    await reloadAndReopenProject(page, savedPath);
    await expect.poll(async () => (await repoDefinitionIds(page)).sort()).toEqual(definitionsBefore);
    await expect.poll(async () => (await repoUsageIds(page)).sort()).toEqual(usagesBeforeReload);
    await expect.poll(async () => (await repoRelationshipIds(page)).sort()).toEqual(relationshipsBefore);

    const associationAfter = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], associationId);
    expect(associationAfter.sourceId).toBe(vehicleId);
    expect(associationAfter.targetId).toBe(motorId);
    const allocationAfter = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], allocationId);
    expect(allocationAfter.sourceId).toBe(firstPartId);
    expect(allocationAfter.targetId).toBe(batteryId);
    expect(await page.evaluate(id => (window as any).__sysmlRepository.usages[id]?.name, firstPartId)).toBe('powerUnit');

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${vehicleId}"]`)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${associationId}"]`)).toBeVisible({ timeout: 10000 });
    await page.locator(`#adia-diagram-canvas [data-semantic-id="${vehicleId}"]`).dblclick();
    await expect(page.locator('#adia-diagram-canvas').getByText(/ibd \[Block/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#adia-diagram-canvas [data-presentation-kind="connector"]')).toHaveCount(2);
  });

  test('Workflow 3: TestCase deletion always requires impact confirmation when presentations exist', async ({ page }) => {
    test.setTimeout(60000);
    await openModeler(page);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const idsBeforeBlock = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeBlock.has(id)).length).toBe(1);
    const blockId = (await semanticIdsInTree(page)).find(id => !idsBeforeBlock.has(id))!;

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const blockItem = page.locator(`.model-tree-row[data-semantic-id="${blockId}"]`);
    await blockItem.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    const blockOnReq = page.locator(`#adia-diagram-canvas [data-semantic-id="${blockId}"]`);
    await expect(blockOnReq).toBeVisible({ timeout: 10000 });

    // Double-click Block on Requirement diagram: must NOT navigate away to IBD.
    await blockOnReq.dblclick();
    await page.waitForTimeout(500);
    const reqModeBtn = page.getByRole('button', { name: 'Requirements', exact: true });
    await expect(reqModeBtn).toHaveClass(/bg-\[var\(--surface-panel\)\]/);

    // TestCase with a diagram presentation (canvas) and one without (tree only).
    const idsBeforeTc1 = new Set(await semanticIdsInTree(page));
    await page.getByRole('button', { name: '+ Test Case', exact: true }).click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeTc1.has(id)).length).toBe(1);
    const tc1Id = (await semanticIdsInTree(page)).find(id => !idsBeforeTc1.has(id))!;
    const tc1Presentation = page.locator(`#adia-diagram-canvas [data-semantic-id="${tc1Id}"]`);
    await expect(tc1Presentation).toBeVisible();

    const modelRow = page.locator('.model-tree-row[data-semantic-id="model"]');
    const idsBeforeTc2 = new Set(await semanticIdsInTree(page));
    await modelRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Test Case' }).first().click();
    await expect.poll(async () => (await semanticIdsInTree(page)).filter(id => !idsBeforeTc2.has(id)).length).toBe(1);
    const tc2Id = (await semanticIdsInTree(page)).find(id => !idsBeforeTc2.has(id))!;

    await filterTree(page, 'Case');
    const tcRows = page.locator('.model-tree-row[data-kind="testCase"], .model-tree-row[data-kind="verificationCase"]');
    await expect(tcRows).toHaveCount(2);

    // Presentation move keeps the semantic element intact.
    const origTransform = await tc1Presentation.getAttribute('transform');
    await movePresentation(page, tc1Presentation, 80, 50);
    await expect(tc1Presentation).not.toHaveAttribute('transform', origTransform ?? '');

    // Removing the presentation preserves the repository element.
    await filterTree(page, '');
    const tc1Row = page.locator(`.model-tree-row[data-semantic-id="${tc1Id}"]`);
    await tc1Row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove from Diagram', exact: true }).click();
    await expect(tc1Presentation).toHaveCount(0);
    await expect(tc1Row).toHaveCount(1);
    // Remove from Diagram is not deletion: it must never ask for confirmation.
    await expect(impactDialog(page)).toHaveCount(0);

    // Re-present the TestCase so its deletion carries presentation impact.
    await tc1Row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${tc1Id}"]`)).toBeVisible({ timeout: 10000 });

    // Give the TestCase a real Verify dependency on a Requirement so deletion
    // impact covers both a relationship and a presentation.
    const reqBeforeTc = new Set(await repoRequirementIds(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    let tcReqId = '';
    await expect.poll(async () => {
      const fresh = (await repoRequirementIds(page)).filter(id => !reqBeforeTc.has(id));
      if (fresh.length === 1) tcReqId = fresh[0];
      return fresh.length;
    }).toBe(1);
    const verifyResult = await page.evaluate(({ tc, req }) => {
      return (window as any).__sysmlExecuteCommand?.({
        type: 'createElement',
        element: { id: `verify-${tc.slice(0, 8)}`, sourceId: tc, targetId: req, kind: 'verify', name: '' },
      });
    }, { tc: tc1Id, req: tcReqId });
    expect(verifyResult.committed).toBe(true);

    // Mandatory impact confirmation: the dialog appears because a relationship
    // and a presentation are affected. No optional visibility check.
    const dialog = impactDialog(page);
    await tc1Row.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Delete from Model")').first().click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText(/Affected Relationships/);
    await expect(dialog).toContainText(/Affected Diagram Presentations/);

    // Cancel preserves every record.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tc1Row).toHaveCount(1);
    expect(await page.evaluate(id => Boolean((window as any).__sysmlRepository.verificationCases[id]), tc1Id)).toBe(true);
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${tc1Id}"]`)).toHaveCount(1);

    // Confirm deletes the canonical element and its presentation.
    await tc1Row.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Delete from Model")').first().click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tc1Row).toHaveCount(0);
    expect(await page.evaluate(id => Boolean((window as any).__sysmlRepository.verificationCases[id]), tc1Id)).toBe(false);
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${tc1Id}"]`)).toHaveCount(0);

    // Undo restores the deleted TestCase; redo re-applies the deletion.
    await page.keyboard.press('Control+z');
    await expect(page.locator(`.model-tree-row[data-semantic-id="${tc1Id}"]`)).toHaveCount(1);
    expect(await page.evaluate(id => Boolean((window as any).__sysmlRepository.verificationCases[id]), tc1Id)).toBe(true);
    await page.keyboard.press('Control+y');
    await expect(page.locator(`.model-tree-row[data-semantic-id="${tc1Id}"]`)).toHaveCount(0);
    expect(await page.evaluate(id => Boolean((window as any).__sysmlRepository.verificationCases[id]), tc1Id)).toBe(false);

    // Presentation-only deletion still requires confirmation: tc2 carries a
    // diagram presentation but zero relationships.
    await filterTree(page, '');
    const tc2Row = page.locator(`.model-tree-row[data-semantic-id="${tc2Id}"]`);
    await tc2Row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Diagram', exact: true }).click();
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${tc2Id}"]`)).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(id =>
      (Object.values((window as any).__sysmlRepository.relationships ?? {}) as any[])
        .filter(rel => rel.sourceId === id || rel.targetId === id).length, tc2Id)).toBe(0);

    await tc2Row.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Delete from Model")').first().click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText(/Affected Diagram Presentations/);
    await expect(dialog.getByText(/Affected Relationships/)).toHaveCount(0);

    // Cancel preserves the TestCase and its presentation.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tc2Row).toHaveCount(1);
    expect(await page.evaluate(id => Boolean((window as any).__sysmlRepository.verificationCases[id]), tc2Id)).toBe(true);
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${tc2Id}"]`)).toHaveCount(1);

    // Confirm deletes the TestCase and its presentation.
    await tc2Row.click({ button: 'right' });
    await page.locator('[role="menuitem"]:has-text("Delete from Model")').first().click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tc2Row).toHaveCount(0);
    expect(await page.evaluate(id => Boolean((window as any).__sysmlRepository.verificationCases[id]), tc2Id)).toBe(false);
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${tc2Id}"]`)).toHaveCount(0);
    await filterTree(page, '');
  });

  test('Workflow 4: State-to-Requirement Satisfy persists across unrelated mutation and real save/reload; reverse direction is rejected with structured diagnostics', async ({ page }) => {
    test.setTimeout(120000);
    await openModeler(page);

    // 1. Create Requirement on Requirements diagram.
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const reqBefore = new Set(await repoRequirementIds(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    let reqId = '';
    await expect.poll(async () => {
      const fresh = (await repoRequirementIds(page)).filter(id => !reqBefore.has(id));
      if (fresh.length === 1) reqId = fresh[0];
      return fresh.length;
    }).toBe(1);

    // 2. Switch to State Machine mode and create a State through the canvas toolbar.
    await page.getByRole('button', { name: 'State Machine' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'State', exact: true }).click();
    const stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    await expect(stateItem).toBeVisible({ timeout: 5000 });
    const stateId = await stateItem.getAttribute('data-semantic-id');
    if (!stateId) throw new Error('State has no semantic ID');
    await stateItem.click();

    // 3. Create the legal State -> Requirement Satisfy link through the inspector.
    const relsBeforeLink = new Set(await repoRelationshipIds(page));
    const reqSelect = page.locator('#req-select');
    await expect(reqSelect).toBeVisible({ timeout: 5000 });
    await reqSelect.selectOption(reqId);
    const addTraceBtn = page.getByRole('button', { name: /Add Trace Link/i });
    await expect(addTraceBtn).toBeEnabled();
    await addTraceBtn.click();
    await expect(page.locator('span:has-text("«satisfy»")').first()).toBeVisible({ timeout: 5000 });

    const satisfyIds = (await repoRelationshipIds(page)).filter(id => !relsBeforeLink.has(id));
    expect(satisfyIds).toHaveLength(1);
    // The inspector link may reuse polling: locate the satisfy relationship by endpoints instead.
    const satisfy = await page.evaluate(({ state, req }) => {
      const rels = Object.values((window as any).__sysmlRepository.relationships ?? {}) as any[];
      return rels.find(r => r.kind === 'satisfy' && r.sourceId === state && r.targetId === req) ?? null;
    }, { state: stateId, req: reqId });
    expect(satisfy).toBeTruthy();
    expect(satisfy.sourceId).toBe(stateId);
    expect(satisfy.targetId).toBe(reqId);
    expect(satisfy.id).toBe(satisfyIds[0]);
    const satisfyRelId: string = satisfy.id;

    // 4. An unrelated mutation (a second State) leaves the relationship valid with identical endpoints.
    await page.getByRole('button', { name: 'State', exact: true }).click();
    await expect.poll(async () => (await repoRelationshipIds(page)).length).toBe(1);
    const satisfyAfterMutation = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], satisfyRelId);
    expect(satisfyAfterMutation.sourceId).toBe(stateId);
    expect(satisfyAfterMutation.targetId).toBe(reqId);

    const relationshipsBefore = (await repoRelationshipIds(page)).sort();
    const requirementsBefore = (await repoRequirementIds(page)).sort();

    // 5. Real save, real reload, real re-open: the same relationship remains valid and visible.
    const savedPath = await saveProject(page, 'workflow4.adia');
    await reloadAndReopenProject(page, savedPath);
    await expect.poll(async () => (await repoRelationshipIds(page)).sort()).toEqual(relationshipsBefore);
    await expect.poll(async () => (await repoRequirementIds(page)).sort()).toEqual(requirementsBefore);

    const satisfyAfterReload = await page.evaluate(id => (window as any).__sysmlRepository.relationships[id], satisfyRelId);
    expect(satisfyAfterReload.kind).toBe('satisfy');
    expect(satisfyAfterReload.sourceId).toBe(stateId);
    expect(satisfyAfterReload.targetId).toBe(reqId);

    await page.getByRole('button', { name: 'State Machine' }).click();
    await page.waitForTimeout(500);
    const stateRowAfter = page.locator(`.model-explorer-container [role="treeitem"][data-semantic-id="${stateId}"]`);
    await expect(stateRowAfter).toBeVisible({ timeout: 10000 });
    await stateRowAfter.click();
    await expect(page.locator('span:has-text("«satisfy»")').first()).toBeVisible({ timeout: 10000 });

    // 6. Reverse direction (Requirement -> State satisfy) returns structured endpoint diagnostics.
    const result = await page.evaluate(({ req, state }) => {
      return (window as any).__sysmlExecuteCommand?.({
        type: 'createElement',
        element: {
          id: 'invalid-reverse-satisfy',
          sourceId: req,
          targetId: state,
          kind: 'satisfy',
          name: '',
        },
      });
    }, { req: reqId, state: stateId });

    expect(result.committed).toBe(false);
    const directionDiag = result.diagnostics.find((d: any) => d.code === 'INVALID_SATISFY_DIRECTION');
    expect(directionDiag).toBeTruthy();
    expect(directionDiag.message).toContain('satisfy');
    expect(directionDiag.message).toContain(reqId);
    expect(directionDiag.message).toContain(stateId);
    expect(directionDiag.message).toContain('requirement');
    expect(directionDiag.message).toContain('state');

    const relCount = await page.evaluate(() => Object.keys((window as any).__sysmlRepository?.relationships ?? {}).length);
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

  test('Workflow 6a: semantic token roles bind Requirement, State, Port, relationship, selection, warning, and error surfaces', async ({ page }) => {
    test.setTimeout(120000);
    await openModeler(page);

    // The production resolver maps every role to its semantic token.
    const expectedTokens = await page.evaluate(() => {
      const hooks = (window as any).__adiaTestHooks;
      const roles = ['block', 'requirement', 'state', 'standardPort', 'proxyPort', 'fullPort', 'flowPort', 'validRequirementRelationship', 'selection', 'warning', 'error'];
      return Object.fromEntries(roles.map(role => [role, hooks.semanticToken(role)]));
    });
    expect(expectedTokens).toEqual({
      block: 'var(--sysml-sem-block)',
      requirement: 'var(--sysml-sem-requirement)',
      state: 'var(--sysml-sem-state)',
      standardPort: 'var(--sysml-sem-standard-port)',
      proxyPort: 'var(--sysml-sem-proxy-port)',
      fullPort: 'var(--sysml-sem-full-port)',
      flowPort: 'var(--sysml-sem-flow-port)',
      validRequirementRelationship: 'var(--sysml-sem-valid-requirement-relationship)',
      selection: 'var(--sysml-sem-selection)',
      warning: 'var(--sysml-sem-warning)',
      error: 'var(--sysml-sem-error)',
    });

    // Warning role: selecting a State with no requirements in the repository
    // renders the accessible warning status with the warning token.
    await page.getByRole('button', { name: 'State Machine' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'State', exact: true }).click();
    const stateItem = page.locator('.model-explorer-container [role="treeitem"]:has-text("State")').last();
    await expect(stateItem).toBeVisible({ timeout: 5000 });
    const stateId = await stateItem.getAttribute('data-semantic-id');
    if (!stateId) throw new Error('State has no semantic ID');
    await stateItem.click();
    const warningStatus = page.locator('p[role="status"][aria-label="Warning: no requirements exist in the repository"]');
    await expect(warningStatus).toBeVisible({ timeout: 5000 });
    await expect(warningStatus).toContainText('Warning:');
    expect(await warningStatus.getAttribute('style')).toContain(expectedTokens.warning);

    // State role: the traceability header icon uses the state token.
    const shieldIcon = page.locator('svg.lucide-shield-check');
    await expect(shieldIcon).toBeVisible();
    expect(await shieldIcon.getAttribute('style')).toContain(expectedTokens.state);

    // Selection role: the Add Trace Link action uses the selection token
    // (asserted once requirements exist and the link form renders below).
    const addTraceBtn = page.getByRole('button', { name: /Add Trace Link/i });

    // Requirement + valid relationship roles: link the State and inspect the badge.
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const reqBefore = new Set(await repoRequirementIds(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    let reqId = '';
    await expect.poll(async () => {
      const fresh = (await repoRequirementIds(page)).filter(id => !reqBefore.has(id));
      if (fresh.length === 1) reqId = fresh[0];
      return fresh.length;
    }).toBe(1);

    await page.getByRole('button', { name: 'State Machine' }).click();
    await page.waitForTimeout(500);
    await page.locator(`.model-explorer-container [role="treeitem"][data-semantic-id="${stateId}"]`).click();
    await expect(addTraceBtn).toBeVisible({ timeout: 5000 });
    expect(await addTraceBtn.getAttribute('style')).toContain(expectedTokens.selection);
    await page.locator('#req-select').selectOption(reqId);
    await expect(addTraceBtn).toBeEnabled();
    await addTraceBtn.click();
    const satisfyBadge = page.locator('span:has-text("«satisfy»")').first();
    await expect(satisfyBadge).toBeVisible({ timeout: 5000 });
    expect(await satisfyBadge.getAttribute('style')).toContain(expectedTokens.validRequirementRelationship);

    // Tree and canvas reference the same semantic Requirement element.
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await expect(page.locator(`.model-tree-row[data-semantic-id="${reqId}"]`)).toHaveCount(1);
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${reqId}"]`)).toBeVisible({ timeout: 10000 });

    // Each Port kind on canvas resolves its own semantic token role.
    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const ownerId = await createCanvasBlock(page, 'RoleOwner');
    const typeBlockId = await createCanvasBlock(page, 'RoleType');
    // Canvas Blocks spawn stacked: move the type Block aside so the owner stays clickable.
    await movePresentation(page, page.locator(`#adia-diagram-canvas [data-semantic-id="${typeBlockId}"]`), 260, 0);
    const typeBlockName = await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.name, typeBlockId);
    const ownerNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${ownerId}"]`);
    await expect(ownerNode).toBeVisible({ timeout: 10000 });

    await ownerNode.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(1);

    await ownerNode.click();
    await page.getByRole('button', { name: '+Prx', exact: true }).click();
    const proxyPrompt = typeSelectionPrompt(page);
    await expect(proxyPrompt).toBeVisible();
    await proxyPrompt.getByRole('button', { name: 'Create New Type' }).click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(2);

    await ownerNode.click();
    await page.getByRole('button', { name: '+Full', exact: true }).click();
    const fullPrompt = typeSelectionPrompt(page);
    await expect(fullPrompt).toBeVisible();
    await fullPrompt.getByRole('button', { name: typeBlockName }).click();
    await fullPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(3);

    await ownerNode.click();
    await page.getByRole('button', { name: '+Flow', exact: true }).click();
    const flowPrompt = typeSelectionPrompt(page);
    await expect(flowPrompt).toBeVisible();
    await flowPrompt.getByRole('button', { name: typeBlockName }).click();
    await flowPrompt.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(4);

    const portStyles = await ownerNode.locator('rect[width="10"][height="10"]').evaluateAll(rects =>
      rects.map(rect => rect.getAttribute('style') ?? '')
    );
    expect(portStyles).toHaveLength(4);
    expect(portStyles.some(style => style.includes('var(--sysml-sem-standard-port)'))).toBe(true);
    expect(portStyles.some(style => style.includes('var(--sysml-sem-proxy-port)'))).toBe(true);
    expect(portStyles.some(style => style.includes('var(--sysml-sem-full-port)'))).toBe(true);
    expect(portStyles.some(style => style.includes('var(--sysml-sem-flow-port)'))).toBe(true);

    // Error role: a Value Property request with no compatible ValueType renders
    // the TYPE_NOT_FOUND error with the error token and creates nothing.
    const propsBefore = await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.properties?.length ?? 0, ownerId);
    await filterTree(page, '');
    await page.locator(`.model-tree-row[data-semantic-id="${ownerId}"]`).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Value Property' }).first().click();
    const valuePrompt = typeSelectionPrompt(page);
    await expect(valuePrompt).toBeVisible();
    await expect(valuePrompt).toContainText(/TYPE_NOT_FOUND/);
    const errorBox = valuePrompt.locator('div', { hasText: 'TYPE_NOT_FOUND' }).last();
    expect(await errorBox.getAttribute('style')).toContain(expectedTokens.error);
    await valuePrompt.getByRole('button', { name: 'Cancel' }).click();
    await expect(valuePrompt).toHaveCount(0);
    expect(await page.evaluate(id => (window as any).__sysmlRepository.definitions[id]?.properties?.length ?? 0, ownerId)).toBe(propsBefore);

    // Selection role on canvas: selecting a committed relationship projects the selection token.
    const relsBefore = new Set(await repoRelationshipIds(page));
    await page.locator(`.model-tree-row[data-semantic-id="${ownerId}"]`).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Association', exact: true }).click();
    const wizard = relationshipWizard(page);
    await wizard.getByRole('button', { name: typeBlockName }).click();
    await wizard.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(wizard).toHaveCount(0);
    const assocId = (await repoRelationshipIds(page)).find(id => !relsBefore.has(id))!;
    const assocEdge = page.locator(`#adia-diagram-canvas [data-semantic-id="${assocId}"]`);
    await expect(assocEdge).toHaveCount(1);
    // The edge group carries only stroked paths, so click its center directly.
    await assocEdge.click({ force: true });
    const edgeStroke = await assocEdge.locator('path').evaluateAll(paths => {
      for (const path of paths) {
        const stroke = (path as SVGPathElement).style?.stroke;
        if (stroke && stroke !== 'transparent' && stroke !== '') return stroke;
      }
      return '';
    });
    expect(edgeStroke).toContain(expectedTokens.selection);
  });

  test('Workflow 6b: both themes resolve semantic roles and real reload preserves valid presentation overrides', async ({ page }) => {
    test.setTimeout(120000);
    await openModeler(page);

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const ownerId = await createCanvasBlock(page);
    const ownerNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${ownerId}"]`);
    await expect(ownerNode).toBeVisible({ timeout: 10000 });
    await ownerNode.click();
    await page.getByRole('button', { name: '+Std', exact: true }).click();
    await expect.poll(async () => portCount(page, ownerId)).toBe(1);
    const darkPortStroke = await ownerNode.locator('rect[width="10"][height="10"]').first().evaluate(rect =>
      getComputedStyle(rect).getPropertyValue('stroke').trim()
    );
    expect(darkPortStroke).not.toBe('');

    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const reqBefore = new Set(await repoRequirementIds(page));
    await page.getByRole('button', { name: '+ Requirement', exact: true }).click();
    let reqId = '';
    await expect.poll(async () => {
      const fresh = (await repoRequirementIds(page)).filter(id => !reqBefore.has(id));
      if (fresh.length === 1) reqId = fresh[0];
      return fresh.length;
    }).toBe(1);

    // Every semantic token is defined in the dark theme.
    const darkTokens = await page.evaluate(() => {
      const names = ['--sysml-sem-block', '--sysml-sem-requirement', '--sysml-sem-state', '--sysml-sem-standard-port', '--sysml-sem-proxy-port', '--sysml-sem-full-port', '--sysml-sem-flow-port', '--sysml-sem-valid-requirement-relationship', '--sysml-sem-selection', '--sysml-sem-warning', '--sysml-sem-error'];
      const computed = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map(name => [name, computed.getPropertyValue(name).trim()]));
    });
    for (const [name, value] of Object.entries(darkTokens)) {
      expect(value, `${name} is defined in the dark theme`).not.toBe('');
    }

    // Light theme resolves the same roles to light-theme values.
    await page.getByTitle('Switch to Light Mode').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightTokens = await page.evaluate(() => {
      const names = ['--sysml-sem-block', '--sysml-sem-requirement', '--sysml-sem-state', '--sysml-sem-standard-port', '--sysml-sem-proxy-port', '--sysml-sem-full-port', '--sysml-sem-flow-port', '--sysml-sem-valid-requirement-relationship', '--sysml-sem-selection', '--sysml-sem-warning', '--sysml-sem-error'];
      const computed = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map(name => [name, computed.getPropertyValue(name).trim()]));
    });
    for (const [name, value] of Object.entries(lightTokens)) {
      expect(value, `${name} is defined in the light theme`).not.toBe('');
    }
    expect(lightTokens['--sysml-sem-proxy-port']).not.toBe(darkTokens['--sysml-sem-proxy-port']);
    expect(lightTokens['--sysml-sem-error']).not.toBe(darkTokens['--sysml-sem-error']);

    await page.getByRole('button', { name: 'SysML BDD' }).click();
    const lightPortStroke = await page.locator(`#adia-diagram-canvas [data-semantic-id="${ownerId}"]`).locator('rect[width="10"][height="10"]').first().evaluate(rect =>
      getComputedStyle(rect).getPropertyValue('stroke').trim()
    );
    expect(lightPortStroke).not.toBe('');
    expect(lightPortStroke).not.toBe(darkPortStroke);

    // A valid user presentation override is stored on the live presentation.
    const diagramId = await page.evaluate(targetId => {
      const presentations = (window as any).__adiaTestHooks.getDiagramPresentations();
      for (const [key, diagram] of Object.entries(presentations) as any[]) {
        if (diagram?.elementIds?.includes(targetId)) return key;
      }
      return null;
    }, reqId);
    expect(diagramId).toBeTruthy();
    const overrideResult = await page.evaluate(({ diagram, target }) => {
      return (window as any).__sysmlExecuteCommand?.({
        type: 'updatePresentation',
        diagramId: diagram,
        elementId: target,
        presentation: {},
        style: { color: '#123456' },
      });
    }, { diagram: diagramId, target: reqId });
    expect(overrideResult.committed).toBe(true);
    // React projects the committed presentation asynchronously: poll the live store.
    await expect.poll(async () => page.evaluate(({ diagram, target }) => {
      return (window as any).__adiaTestHooks.getDiagramPresentations()[diagram]?.presentations[target]?.style;
    }, { diagram: diagramId, target: reqId })).toMatchObject({ color: '#123456' });

    // Rendered effect (review follow-up Finding 6b): the requirement node
    // body on canvas resolves the stored override — the store assertion
    // above alone never proves the pixels. Selection would mask the body
    // stroke with the selection color, so clear it first; the override then
    // paints the body rect (browsers serialize it as rgb(18, 52, 86)).
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    const reqNode = page.locator(`#adia-diagram-canvas [data-semantic-id="${reqId}"]`);
    await expect(reqNode).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => reqNode.evaluate(el =>
      Array.from(el.querySelectorAll('rect')).map(rect =>
        getComputedStyle(rect).getPropertyValue('stroke').trim().toLowerCase()
      ).join('||')
    )).toMatch(/#123456|rgb\(18,\s*52,\s*86\)/);

    // Real save, real reload, real re-open preserves the valid override.
    const savedPath = await saveProject(page, 'workflow6b.adia');
    await reloadAndReopenProject(page, savedPath);
    await expect.poll(async () => (await repoRequirementIds(page)).includes(reqId)).toBe(true);
    await expect.poll(async () => page.evaluate(({ diagram, target }) => {
      return (window as any).__adiaTestHooks.getDiagramPresentations()[diagram]?.presentations[target]?.style;
    }, { diagram: diagramId, target: reqId })).toMatchObject({ color: '#123456' });

    // The semantic role default is intact: the Requirement element is unchanged
    // and its canvas presentation still resolves after reload.
    expect(await page.evaluate(id => (window as any).__sysmlRepository.requirements[id]?.kind, reqId)).toBe('requirement');
    await page.getByRole('button', { name: 'Requirements', exact: true }).click();
    await expect(page.locator(`#adia-diagram-canvas [data-semantic-id="${reqId}"]`)).toBeVisible({ timeout: 15000 });
    // Rendered effect persists across real save/reload (review follow-up
    // Finding 6b): the rehydrated override still paints the node body.
    await page.keyboard.press('Escape');
    await expect.poll(async () => page.locator(`#adia-diagram-canvas [data-semantic-id="${reqId}"]`).evaluate(el =>
      Array.from(el.querySelectorAll('rect')).map(rect =>
        getComputedStyle(rect).getPropertyValue('stroke').trim().toLowerCase()
      ).join('||')
    )).toMatch(/#123456|rgb\(18,\s*52,\s*86\)/);
  });
});
