import { test, expect, type Page } from '@playwright/test';

async function command(page: Page, input: any) {
  const result = await page.evaluate(input => (window as any).__sysmlExecuteCommand(input), input);
  expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
}
async function openDiagram(page: Page, id: string, kind: string) {
  await page.evaluate(id => (window as any).__setActiveSysmlDiagramId(id), id);
  await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe(kind);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) { await intro.click({ position: { x: 10, y: 10 }, force: true }); await expect(intro).toHaveCount(0); }
});

test('Use Case Include connects the selected source and target through its palette', async ({ page }) => {
  await command(page, { type: 'createDiagram', diagram: { id: 'audit-uc', kind: 'diagram', diagramKind: 'useCase', name: 'Use Case audit', namespace: [], ownerId: 'model' } });
  for (const [id, name, x] of [['uc-main', 'Drive', 180], ['uc-included', 'Start engine', 540]] as const) {
    await command(page, { type: 'createAndPresent', diagramId: 'audit-uc', element: { id, name, kind: 'useCase', ownerId: 'model', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] }, presentation: { x, y: 180, width: 220, height: 140 } });
  }
  await openDiagram(page, 'audit-uc', 'useCase');
  const workspace = page.getByTestId('usecase-workspace');
  await workspace.getByRole('button', { name: 'Include', exact: true }).click();
  await workspace.locator('[data-testid="uc-node-useCase"][data-label="Drive"]').click();
  await workspace.locator('[data-testid="uc-node-useCase"][data-label="Start engine"]').click();
  await expect(workspace.locator('[data-testid="uc-edge"][data-kind="include"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__sysmlRepository.relationships).some((r: any) => r.kind === 'include' && r.sourceId === 'uc-main' && r.targetId === 'uc-included'))).toBe(true);
});

test('Sequence synchronous call connects lifelines and draws its reply', async ({ page }) => {
  await command(page, { type: 'createElement', element: { id: 'audit-interaction', kind: 'interaction', name: 'Startup', namespace: [], ownerId: 'model', lifelines: [{ id: 'sender', name: 'sender' }, { id: 'receiver', name: 'receiver' }], messages: [], fragments: [] } });
  await command(page, { type: 'createDiagram', diagram: { id: 'audit-sequence', kind: 'diagram', diagramKind: 'sequence', name: 'Startup sequence', namespace: [], ownerId: 'audit-interaction', contextElementId: 'audit-interaction' } });
  await openDiagram(page, 'audit-sequence', 'sequence');
  const workspace = page.getByTestId('sequence-workspace');
  await workspace.getByRole('button', { name: 'Synchronous Call', exact: true }).click();
  await workspace.locator('[data-testid="sequence-lifeline-head"][data-label="sender"]').click();
  await workspace.locator('[data-testid="sequence-lifeline-head"][data-label="receiver"]').click();
  await expect(workspace.locator('[data-testid="sequence-message"][data-sort="synchCall"]')).toHaveCount(1);
  await expect(workspace.locator('[data-testid="sequence-message"][data-sort="reply"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as any).__sysmlRepository.definitions['audit-interaction'].messages.length)).toBe(2);
});

test('Package Import tool keeps import semantics and notation on the canvas', async ({ page }) => {
  await command(page, { type: 'createDiagram', diagram: { id: 'audit-package', kind: 'diagram', diagramKind: 'package', name: 'Package audit', namespace: [], ownerId: 'model' } });
  for (const [id, x] of [['pkg-source', 180], ['pkg-target', 520]] as const) {
    await command(page, { type: 'createAndPresent', diagramId: 'audit-package', element: { id, kind: 'package', name: id, ownerId: 'model', namespace: [] }, presentation: { x, y: 180, width: 220, height: 160 } });
  }
  await openDiagram(page, 'audit-package', 'package');
  await page.locator('button[data-help-feature="app-package-path-tool"]').filter({ hasText: 'Import' }).first().click();
  await page.locator('#adia-diagram-canvas g[data-semantic-id="pkg-source"]').click({ position: { x: 70, y: 50 } });
  await page.locator('#adia-diagram-canvas g[data-semantic-id="pkg-target"]').click({ position: { x: 70, y: 50 } });
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__sysmlRepository.relationships).some((r: any) => r.kind === 'packageImport'))).toBe(true);
  await expect(page.locator('#adia-diagram-canvas').getByText('«import»', { exact: true })).toBeVisible();
});

test('Requirements displays an existing Use Case and its Satisfy connection', async ({ page }) => {
  await command(page, { type: 'createDiagram', diagram: { id: 'audit-requirements', kind: 'diagram', diagramKind: 'requirements', name: 'Requirement audit', namespace: [], ownerId: 'model' } });
  await command(page, { type: 'createAndPresent', diagramId: 'audit-requirements', element: { id: 'audit-usecase', name: 'Drive', kind: 'useCase', ownerId: 'model', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] }, presentation: { x: 180, y: 180, width: 220, height: 140 } });
  await command(page, { type: 'createAndPresent', diagramId: 'audit-requirements', element: { id: 'audit-requirement', name: 'Drive safely', kind: 'requirement', namespace: [], ownerId: 'model', requirementId: 'REQ-DRIVE', text: 'Drive safely', status: 'draft', version: '1' }, presentation: { x: 540, y: 180, width: 220, height: 140 } });
  await command(page, { type: 'createAndPresent', diagramId: 'audit-requirements', element: { id: 'audit-satisfy', kind: 'useCaseSatisfy', sourceId: 'audit-usecase', targetId: 'audit-requirement' }, presentation: {} });
  await openDiagram(page, 'audit-requirements', 'requirements');
  await expect(page.locator('#adia-diagram-canvas g[data-semantic-id="audit-usecase"]')).toBeVisible();
  await expect(page.locator('#adia-diagram-canvas').getByText('«satisfy»', { exact: true })).toBeVisible();
});

test('Activity Flow tool connects output pin through a decision to an input pin', async ({ page }) => {
  await command(page, { type: 'createElement', element: { id: 'audit-activity', kind: 'activity', name: 'Route data', namespace: [], ownerId: 'model', parameters: [], partitions: [], edges: [], nodes: [
    { id: 'produce', name: 'Produce', kind: 'action', pins: [{ id: 'output', name: 'output', direction: 'out' }] },
    { id: 'decide', name: 'Decision', kind: 'decision' },
    { id: 'consume', name: 'Consume', kind: 'action', pins: [{ id: 'input', name: 'input', direction: 'in' }] },
  ] } });
  await command(page, { type: 'createDiagram', diagram: { id: 'audit-activity-diagram', name: 'Routing', kind: 'diagram', diagramKind: 'activity', ownerId: 'audit-activity', namespace: [] } });
  await command(page, { type: 'addToDiagram', diagramId: 'audit-activity-diagram', elementIds: ['produce', 'decide', 'consume'], coordinates: { produce: { x: 60, y: 100 }, decide: { x: 320, y: 200 }, consume: { x: 540, y: 300 } } });
  await openDiagram(page, 'audit-activity-diagram', 'activity');
  const workspace = page.getByTestId('activity-workspace');
  await workspace.getByRole('button', { name: 'Flow', exact: true }).click();
  await workspace.locator('[data-testid="activity-pin"][data-label="output"]').click();
  await workspace.getByTestId('activity-node-decision').click();
  await workspace.getByRole('button', { name: 'Flow', exact: true }).click();
  await workspace.getByTestId('activity-node-decision').click();
  await workspace.locator('[data-testid="activity-pin"][data-label="input"]').click();
  await expect(workspace.locator('[data-testid="activity-edge"][data-kind="objectFlow"]')).toHaveCount(2);
});
