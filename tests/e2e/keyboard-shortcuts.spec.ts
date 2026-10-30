import { test, expect, type Page } from '@playwright/test';

// Keyboard shortcuts across the application: each workspace acts on its own keys exactly once.

const block = (id: string, name: string) => ({
  id, name, kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) { await intro.first().click({ position: { x: 10, y: 10 }, force: true }); await expect(intro).toHaveCount(0); }
  await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe('bdd');
});

async function present(page: Page, element: ReturnType<typeof block>, x: number, diagramId?: string) {
  const result = await page.evaluate(({ element, x, diagramId }) => (window as any).__sysmlExecuteCommand({
    type: 'createAndPresent', diagramId: diagramId ?? (window as any).__adiaTestHooks.getActiveDiagramId(),
    element, presentation: { x, y: 100, width: 200, height: 120 },
  }), { element, x, diagramId });
  expect(result.committed, JSON.stringify(result)).toBe(true);
}

const onDiagram = (page: Page, id: string, diagramId?: string) => page.evaluate(({ id, diagramId }) => {
  const hooks = (window as any).__adiaTestHooks;
  return !!hooks.getDiagramPresentations()[diagramId ?? hooks.getActiveDiagramId()]?.presentations?.[id];
}, { id, diagramId });
const inModel = (page: Page, id: string) => page.evaluate(id => !!(window as any).__sysmlRepository.definitions[id], id);
const blockNames = (page: Page) => page.evaluate(() => {
  const hooks = (window as any).__adiaTestHooks;
  const repo = (window as any).__sysmlRepository;
  return Object.keys(hooks.getDiagramPresentations()[hooks.getActiveDiagramId()]?.presentations ?? {})
    .map(id => repo.definitions[id]?.name).filter(Boolean).sort();
});
const symbol = (page: Page, id: string) => page.locator(`#adia-diagram-canvas g[data-semantic-id="${id}"]`);

test('Ctrl+A selects only this diagram; Delete removes the symbols; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo', async ({ page }) => {
  await present(page, block('kb-a', 'Alpha'), 100);
  await present(page, block('kb-b', 'Beta'), 400);
  await page.evaluate(() => (window as any).__sysmlExecuteCommand({ type: 'createDiagram', diagram: { id: 'kb-other', name: 'Other', kind: 'diagram', diagramKind: 'bdd', ownerId: 'model', namespace: [] } }));
  await present(page, block('kb-c', 'Gamma'), 100, 'kb-other');

  await symbol(page, 'kb-a').click({ position: { x: 60, y: 40 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect.poll(() => onDiagram(page, 'kb-a')).toBe(false);
  expect(await onDiagram(page, 'kb-b')).toBe(false);
  expect(await inModel(page, 'kb-a')).toBe(true);
  expect(await onDiagram(page, 'kb-c', 'kb-other')).toBe(true);

  await page.keyboard.press('Control+z');
  await expect.poll(() => onDiagram(page, 'kb-a')).toBe(true);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => onDiagram(page, 'kb-a')).toBe(false);
  await page.keyboard.press('Control+z');
  await expect.poll(() => onDiagram(page, 'kb-a')).toBe(true);
  await page.keyboard.press('Control+y');
  await expect.poll(() => onDiagram(page, 'kb-a')).toBe(false);
});

test('Ctrl+C / Ctrl+V pastes a numbered copy; Ctrl+X then Ctrl+V pastes the element back', async ({ page }) => {
  await present(page, block('kb-a', 'Alpha'), 100);
  await present(page, block('kb-b', 'Beta'), 360);
  await symbol(page, 'kb-a').click({ position: { x: 60, y: 40 } });
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect.poll(() => blockNames(page)).toEqual(['Alpha', 'Alpha2', 'Beta']);

  await symbol(page, 'kb-b').click({ position: { x: 60, y: 40 } });
  await page.keyboard.press('Control+x');
  await page.getByRole('button', { name: 'Delete Element', exact: true }).last().click();
  await expect.poll(() => inModel(page, 'kb-b')).toBe(false);
  await page.keyboard.press('Control+v');
  await expect.poll(() => blockNames(page)).toEqual(['Alpha', 'Alpha2', 'Beta']);
});

test('arrows pan, F fits, Ctrl+= / Ctrl+0 zoom the UI, and keys typed in a field stay in the field', async ({ page }) => {
  await present(page, block('kb-a', 'Alpha'), 100);
  const transform = () => page.evaluate(() => document.querySelector('#adia-diagram-canvas svg.sysml-diagram-canvas > g')!.getAttribute('transform'));
  await page.mouse.click(700, 600);
  const before = await transform();
  await page.keyboard.press('ArrowRight');
  await expect.poll(transform).not.toBe(before);
  const panned = await transform();
  await page.keyboard.press('f');
  await expect.poll(transform).not.toBe(panned);

  const zoom = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('*')].find(e => e.style?.zoom)?.style.zoom ?? '1');
  const z0 = await zoom();
  await page.keyboard.press('Control+=');
  await expect.poll(zoom).not.toBe(z0);
  await page.keyboard.press('Control+0');
  await expect.poll(zoom).toBe(z0);

  await symbol(page, 'kb-a').click({ position: { x: 10, y: 10 } });
  await page.locator('.model-explorer-container input').first().click();
  await page.keyboard.type('fa');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  expect(await onDiagram(page, 'kb-a')).toBe(true);
});

test('Delete in V-Lab never reaches the hidden SysML selection, and Ctrl+S saves once', async ({ page }) => {
  await present(page, block('kb-keep', 'KeepMe'), 120);
  await symbol(page, 'kb-keep').click({ position: { x: 20, y: 20 } });
  await page.getByTestId('diagram-workspace-tabs').locator('[data-workspace-type="vlab"]').click();
  await page.locator('.react-flow__viewport').first().waitFor();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  expect(await inModel(page, 'kb-keep')).toBe(true);

  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await download).suggestedFilename()).toMatch(/\.adia$/);
});

test('Model Explorer: F2 renames, Delete asks to delete from the model, Ctrl+D duplicates the focused row', async ({ page }) => {
  await present(page, block('kb-tree', 'TreeBlock'), 100);
  const row = page.locator('.model-explorer-container [role="treeitem"]', { hasText: 'TreeBlock' }).first();
  await row.click();
  await page.keyboard.press('F2');
  const renameInput = page.locator('.model-explorer-container [role="treeitem"] input');
  await expect(renameInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(renameInput).toHaveCount(0);

  await row.click();
  await page.keyboard.press('Delete');
  await expect(page.getByText('Confirm Delete from Model')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  expect(await inModel(page, 'kb-tree')).toBe(true);

  await row.click();
  await page.keyboard.press('Control+d');
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__sysmlRepository.definitions).filter((d: any) => /^TreeBlock/.test(d.name)).length)).toBe(2);

  // F2 pressed on the diagram does not rename the row the tree last focused.
  await page.mouse.click(800, 650);
  await page.keyboard.press('F2');
  await expect(page.locator('.model-explorer-container [role="treeitem"] input')).toHaveCount(0);
});
