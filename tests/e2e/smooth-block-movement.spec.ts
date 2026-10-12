import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) { await intro.first().click({ position: { x: 10, y: 10 }, force: true }); await expect(intro).toHaveCount(0); }
  await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe('bdd');
  const creation = await page.evaluate(() => (window as any).__sysmlExecuteCommand({
    type: 'createAndPresent', diagramId: (window as any).__adiaTestHooks.getActiveDiagramId(),
    element: { id: 'smooth-block', name: 'SmoothBlock', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] },
    presentation: { x: 180, y: 160, width: 220, height: 150 },
  }));
  expect(creation.committed, JSON.stringify(creation)).toBe(true);
});

test('an unselected block follows the first one-pixel movement', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  const bounds = await block.boundingBox();
  const before = await block.getAttribute('transform');
  await page.mouse.move(bounds!.x + 80, bounds!.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 81, bounds!.y + 50);
  await expect.poll(() => block.getAttribute('transform')).not.toBe(before);
  await page.mouse.up();
});

test('release commits the release coordinates even before the next animation frame', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  await block.click({ position: { x: 80, y: 50 } });
  const bounds = await block.boundingBox();
  await page.mouse.move(bounds!.x + 80, bounds!.y + 50);
  await page.mouse.down();
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#adia-diagram-canvas')!;
    canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 10, clientY: y, buttons: 1 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 37, clientY: y, button: 0 }));
  }, { x: bounds!.x + 80, y: bounds!.y + 50 });
  await expect.poll(async () => {
    const after = await block.boundingBox();
    return Math.round(after!.x - bounds!.x);
  }).toBe(37);
});



test('selected blocks keep their spacing while dragging as a group', async ({ page }) => {
  await page.evaluate(() => (window as any).__sysmlExecuteCommand({
    type: 'createAndPresent', diagramId: (window as any).__adiaTestHooks.getActiveDiagramId(),
    element: { id: 'smooth-peer', name: 'Peer', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] },
    presentation: { x: 480, y: 160, width: 220, height: 150 },
  }));
  const first = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  const second = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-peer"]');
  await first.click({ position: { x: 80, y: 50 } });
  await second.click({ position: { x: 80, y: 50 }, modifiers: ['Control'] });
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  await page.mouse.move(a.x + 80, a.y + 50);
  await page.mouse.down();
  await page.mouse.move(a.x + 113, a.y + 67, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await first.boundingBox())!.x - a.x)).toBe(33);
  await expect.poll(async () => Math.round((await second.boundingBox())!.x - b.x)).toBe(33);
  expect(Math.round((await second.boundingBox())!.y - b.y)).toBe(17);
});

test('dragging follows screen distance after zooming', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  await block.click({ position: { x: 80, y: 50 } });
  const initial = (await block.boundingBox())!;
  await page.mouse.move(initial.x + 80, initial.y + 50);
  await page.mouse.wheel(0, -150);
  await expect.poll(async () => (await block.boundingBox())!.width).toBeGreaterThan(initial.width);
  const before = (await block.boundingBox())!;
  await page.mouse.move(before.x + 80, before.y + 50);
  await page.mouse.down();
  await page.mouse.move(before.x + 117, before.y + 63, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await block.boundingBox())!.x - before.x)).toBe(37);
  expect(Math.round((await block.boundingBox())!.y - before.y)).toBe(13);
});

test('an unselected block keeps a drag completed before React commits selection', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  const before = await block.getAttribute('transform');
  await block.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.x + 80;
    const y = bounds.y + 50;
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 11, clientY: y, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 37, clientY: y, button: 0 }));
  });
  await expect(block).toHaveAttribute('transform', 'translate(217, 160)');
});

test('a selected block keeps a drag completed before React commits drag state', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  await block.click({ position: { x: 80, y: 50 } });
  await block.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.x + 80, y = bounds.y + 50;
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 11, clientY: y, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 37, clientY: y, button: 0 }));
  });
  await expect(block).toHaveAttribute('transform', 'translate(217, 160)');
});

test('a held drag continues after leaving and reentering the canvas', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  await block.click({ position: { x: 80, y: 50 } });
  const bounds = (await block.boundingBox())!;
  const canvas = (await page.locator('#adia-diagram-canvas').boundingBox())!;
  await page.mouse.move(bounds.x + 80, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(canvas.x - 20, bounds.y + 50, { steps: 10 });
  await page.mouse.move(bounds.x + 117, bounds.y + 63, { steps: 10 });
  await page.mouse.up();
  await expect(block).toHaveAttribute('transform', 'translate(217, 173)');
});

test('each completed drag is one distinct undo step', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  for (const distance of [20, 30]) {
    const bounds = (await block.boundingBox())!;
    await page.mouse.move(bounds.x + 80, bounds.y + 50);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 80 + distance, bounds.y + 50, { steps: 5 });
    await page.mouse.up();
  }
  await expect(block).toHaveAttribute('transform', 'translate(230, 160)');
  await page.keyboard.press('Control+z');
  await expect(block).toHaveAttribute('transform', 'translate(200, 160)');
  await page.keyboard.press('Control+z');
  await expect(block).toHaveAttribute('transform', 'translate(180, 160)');
});

test('one undo restores all blocks moved in a group', async ({ page }) => {
  await page.evaluate(() => (window as any).__sysmlExecuteCommand({ type: 'createAndPresent', diagramId: (window as any).__adiaTestHooks.getActiveDiagramId(), element: { id: 'undo-peer', name: 'Undo peer', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] }, presentation: { x: 480, y: 160, width: 220, height: 150 } }));
  const first = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  const second = page.locator('#adia-diagram-canvas g[data-semantic-id="undo-peer"]');
  await first.click({ position: { x: 80, y: 50 } });
  await second.click({ position: { x: 80, y: 50 }, modifiers: ['Control'] });
  const bounds = (await first.boundingBox())!;
  await page.mouse.move(bounds.x + 80, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 117, bounds.y + 63, { steps: 5 });
  await page.mouse.up();
  await expect(first).toHaveAttribute('transform', 'translate(217, 173)');
  await expect(second).toHaveAttribute('transform', 'translate(517, 173)');
  await page.keyboard.press('Control+z');
  await expect(first).toHaveAttribute('transform', 'translate(180, 160)');
  await expect(second).toHaveAttribute('transform', 'translate(480, 160)');
});

test('grid snapping preserves the spacing of an off-grid group', async ({ page }) => {
  await page.evaluate(() => (window as any).__sysmlExecuteCommand({ type: 'createAndPresent', diagramId: (window as any).__adiaTestHooks.getActiveDiagramId(), element: { id: 'snap-peer', name: 'Snap peer', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] }, presentation: { x: 487, y: 167, width: 220, height: 150 } }));
  const first = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  const second = page.locator('#adia-diagram-canvas g[data-semantic-id="snap-peer"]');
  await first.click({ position: { x: 80, y: 50 } });
  await second.click({ position: { x: 80, y: 50 }, modifiers: ['Control'] });
  await page.locator('button[data-help-feature="app-snap"]').click();
  const bounds = (await first.boundingBox())!;
  await page.mouse.move(bounds.x + 80, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 109, bounds.y + 67, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => {
    const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
    return { dx: Math.round(b.x - a.x), dy: Math.round(b.y - a.y) };
  }).toEqual({ dx: 307, dy: 7 });
});

test('losing window focus ends the drag without a ghost movement on return', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="smooth-block"]');
  const bounds = (await block.boundingBox())!;
  await page.mouse.move(bounds.x + 80, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 50, { steps: 5 });
  await expect(block).toHaveAttribute('transform', 'translate(200, 160)');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(bounds.x + 130, bounds.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect(block).toHaveAttribute('transform', 'translate(200, 160)');
});

for (const diagramKind of ['requirements', 'package'] as const) {
  test(`a fast ${diagramKind} block drag commits the pressed symbol`, async ({ page }) => {
    await page.evaluate(diagramKind => {
      const execute = (window as any).__sysmlExecuteCommand;
      const diagramId = `drag-${diagramKind}`;
      const diagram = execute({ type: 'createDiagram', diagram: { id: diagramId, name: 'Drag audit', kind: 'diagram', diagramKind, ownerId: 'model', namespace: [] } });
      if (!diagram.committed) throw new Error(JSON.stringify(diagram.diagnostics));
      const symbol = execute({ type: 'createAndPresent', diagramId, element: { id: 'cross-mode-drag', name: 'Cross mode', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] }, presentation: { x: 180, y: 160, width: 220, height: 150 } });
      if (!symbol.committed) throw new Error(JSON.stringify(symbol.diagnostics));
      (window as any).__setActiveSysmlDiagramId(diagramId);
    }, diagramKind);
    await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe(diagramKind);
    const symbol = page.locator('#adia-diagram-canvas g[data-semantic-id="cross-mode-drag"]');
    await symbol.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const x = bounds.x + 80, y = bounds.y + 50;
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
      element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 11, clientY: y, buttons: 1 }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 37, clientY: y, button: 0 }));
    });
    await expect(symbol).toHaveAttribute('transform', 'translate(217, 160)');
  });
}
