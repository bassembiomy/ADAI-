import { test, expect, type Page } from '@playwright/test';

async function command(page: Page, input: any) {
  const result = await page.evaluate(input => (window as any).__sysmlExecuteCommand(input), input);
  expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) { await intro.first().click({ position: { x: 10, y: 10 }, force: true }); await expect(intro).toHaveCount(0); }
  await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe('bdd');
  const diagramId = await page.evaluate(() => (window as any).__adiaTestHooks.getActiveDiagramId());
  for (const id of ['port-system', 'port-component']) {
    await command(page, { type: 'createAndPresent', diagramId,
      element: { id, name: id === 'port-system' ? 'PortSystem' : 'Component', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] },
      presentation: { x: id === 'port-system' ? 180 : 500, y: 160, width: 220, height: 150 },
    });
  }
  await command(page, { type: 'createDiagram', diagram: { id: 'ports-ibd', name: 'Ports IBD', kind: 'diagram', diagramKind: 'ibd', ownerId: 'port-system', contextElementId: 'port-system', namespace: [] } });
  await page.locator('#adia-diagram-canvas g[data-semantic-id="port-system"]').dblclick({ position: { x: 80, y: 50 } });
  await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe('ibd');
  for (const [id, x] of [['part-left', 200], ['part-right', 520]] as const) {
    await command(page, { type: 'createOwnedFeature', intent: { featureKind: 'property', ownerBlockId: 'port-system', propertyKind: 'part', typeId: 'port-component', featureId: id, name: id }, diagramId: 'ports-ibd', presentation: { x, y: 200, width: 180, height: 120 } });
  }
  await expect(page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]')).toBeVisible();
});

for (const [label, kind] of [['Standard', 'umlPort'], ['Flow', 'flowPort'], ['Proxy', 'proxyPort'], ['Full', 'fullPort']] as const) {
  test(`adds ${label} port from the selected IBD Part and displays it on both usages`, async ({ page }) => {
    await page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]').click({ position: { x: 80, y: 50 } });
    await page.getByTitle(`Add ${label} Port`, { exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports.length)).toBe(1);
    const port = await page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports[0]);
    expect(port.portKind).toBe(kind);
    await expect(page.locator(`[data-testid="ibd-connector-endpoint"][data-definition-id="${port.id}"]`)).toHaveCount(2);
    expect(await page.evaluate(() => (window as any).__sysmlRepository.definitions['port-system'].ports.length)).toBe(0);
  });
}

test('connects two part ports through the real IBD Connect tool', async ({ page }) => {
  await page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]').click({ position: { x: 80, y: 50 } });
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports.length)).toBe(1);
  const endpoints = page.locator('[data-testid="ibd-connector-endpoint"]');
  await expect(endpoints).toHaveCount(2);
  await page.locator('button[data-help-feature="app-ibd-connector-tool"]').click();
  await page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-left"]').click();
  await page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-right"]').click();
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__sysmlRepository.connectors).filter((u: any) => u.kind === 'assembly').length)).toBe(1);
  await expect(page.locator('[data-presentation-kind="connector"]')).toHaveCount(1);
});




test('boundary ports connect to Part ports as delegation in the active IBD', async ({ page }) => {
  await page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]').click({ position: { x: 80, y: 50 } });
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  await page.locator('#adia-diagram-canvas').click({ position: { x: 20, y: 150 } });
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  const boundary = page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="boundary"]');
  await expect(boundary).toHaveCount(1);
  await page.locator('button[data-help-feature="app-ibd-connector-tool"]').click();
  await boundary.click();
  await page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-left"]').click();
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__sysmlRepository.connectors).filter((c: any) => c.kind === 'delegation').length)).toBe(1);
  await expect(page.locator('[data-presentation-kind="connector"]')).toHaveCount(1);
});

test('a connected boundary port follows its saved diagram layout after dragging', async ({ page }) => {
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  const boundary = page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="boundary"]');
  await page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]').click({ position: { x: 80, y: 50 } });
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  await page.locator('button[data-help-feature="app-ibd-connector-tool"]').click();
  await boundary.click();
  await page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-left"]').click();
  await expect(page.locator('[data-presentation-kind="connector"]')).toHaveCount(1);
  await expect(page.locator('button[data-help-feature="app-ibd-connector-tool"]')).toHaveText('Connect');
  const portId = await boundary.getAttribute('data-definition-id');
  const port = (await boundary.boundingBox())!;
  const frame = (await page.locator('#adia-diagram-canvas rect[stroke-dasharray="10,5"]').boundingBox())!;
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.5, frame.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(portId => (window as any).__adiaTestHooks.getDiagramPresentations()['ports-ibd']?.presentations['port-system']?.portLayouts?.[portId!], portId)).toMatchObject({ side: 'top', offset: 0.5 });
  await expect.poll(async () => {
    const bounds = (await boundary.boundingBox())!;
    return Math.abs(bounds.y + bounds.height / 2 - frame.y);
  }).toBeLessThan(2);
  const start = await page.locator('[data-presentation-kind="connector"] path').first().evaluate(path => {
    const curve = path as SVGPathElement;
    const point = curve.getPointAtLength(0).matrixTransform(curve.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  const movedPort = (await boundary.boundingBox())!;
  expect(Math.abs(start.x - (movedPort.x + movedPort.width / 2))).toBeLessThan(2);
  expect(Math.abs(start.y - (movedPort.y + movedPort.height / 2))).toBeLessThan(2);
});

test('Part port layout and connector survive save/reopen without changing the sibling layout', async ({ page }) => {
  test.setTimeout(90000);
  const part = page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]');
  await part.click({ position: { x: 80, y: 50 } });
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  const portId = await page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports[0].id);
  const endpoint = page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-left"]');
  const portBounds = (await endpoint.boundingBox())!;
  const bodyBounds = (await part.locator('rect[fill="var(--sysml-part-fill)"]').boundingBox())!;
  await page.mouse.move(portBounds.x + portBounds.width / 2, portBounds.y + portBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bodyBounds.x + bodyBounds.width, bodyBounds.y + bodyBounds.height / 2, { steps: 5 });
  await page.mouse.up();
  const readLayout = () => page.evaluate(portId => (window as any).__adiaTestHooks.getDiagramPresentations()['ports-ibd']?.presentations['part-left']?.portLayouts?.[portId], portId);
  await expect.poll(readLayout).toMatchObject({ side: 'right', offset: 0.5 });
  expect(await page.evaluate(portId => (window as any).__adiaTestHooks.getDiagramPresentations()['ports-ibd']?.presentations['part-right']?.portLayouts?.[portId], portId)).toBeUndefined();
  await page.locator('button[data-help-feature="app-ibd-connector-tool"]').click();
  await endpoint.click();
  await page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-right"]').click();
  await expect(page.locator('[data-presentation-kind="connector"]')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Save ADIA project (.adia)').click();
  const download = await downloadPromise;
  const path = test.info().outputPath('part-ports.adia');
  await download.saveAs(path);
  await page.reload();
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) { await intro.click({ position: { x: 10, y: 10 }, force: true }); await expect(intro).toHaveCount(0); }
  await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(path);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__sysmlRepository.diagrams['ports-ibd']))).toBe(true);
  await page.evaluate(() => (window as any).__setActiveSysmlDiagramId('ports-ibd'));
  await expect(endpoint).toHaveCount(1);
  await expect(page.locator('[data-presentation-kind="connector"]')).toHaveCount(1);
  await expect.poll(readLayout).toMatchObject({ side: 'right', offset: 0.5 });
});

test('the Part inspector exposes port creation and editing for a type outside the IBD', async ({ page }) => {
  await page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]').click({ position: { x: 80, y: 50 } });
  const ports = page.getByText('Block Ports (Component)', { exact: true }).locator('..');
  await expect(ports).toBeVisible();
  await ports.getByRole('button', { name: '+ Proxy', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports.length)).toBe(1);
  const name = ports.locator('input[data-help-feature="app-port-name"]');
  await name.fill('command');
  await expect.poll(() => page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports[0].name)).toBe('command');
  await expect(page.locator('[data-testid="ibd-connector-endpoint"]')).toHaveCount(2);
});

test('a fast Part drag moves the pressed Part rather than the previous selection', async ({ page }) => {
  const left = page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]');
  const right = page.locator('#adia-diagram-canvas g[data-semantic-id="part-right"]');
  await right.click({ position: { x: 80, y: 50 } });
  const rightBefore = await right.getAttribute('transform');
  await left.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.x + 80, y = bounds.y + 50;
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 11, clientY: y, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 37, clientY: y, button: 0 }));
  });
  await expect(left).toHaveAttribute('transform', 'translate(237, 200)');
  await expect(right).toHaveAttribute('transform', rightBefore!);
});

test('a group of Parts stops at the frame boundary without changing its spacing', async ({ page }) => {
  const left = page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]');
  const right = page.locator('#adia-diagram-canvas g[data-semantic-id="part-right"]');
  await left.click({ position: { x: 80, y: 50 } });
  await right.click({ position: { x: 80, y: 50 }, modifiers: ['Control'] });
  const bounds = (await left.boundingBox())!;
  await page.mouse.move(bounds.x + 80, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 120, bounds.y + 50, { steps: 10 });
  await page.mouse.up();
  await expect(left).toHaveAttribute('transform', 'translate(50, 200)');
  await expect(right).toHaveAttribute('transform', 'translate(370, 200)');
});

test('moving an implicit IBD frame carries its Parts and undoes in one step', async ({ page }) => {
  const frame = page.locator('#adia-diagram-canvas rect[stroke-dasharray="10,5"]');
  const bounds = (await frame.boundingBox())!;
  await page.mouse.move(bounds.x + 750, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 783, bounds.y + 167, { steps: 5 });
  await page.mouse.up();
  await expect(frame).toHaveAttribute('x', '83');
  await expect(frame).toHaveAttribute('y', '67');
  await expect(frame).toHaveAttribute('width', '1200');
  await expect(frame).toHaveAttribute('height', '800');
  const left = page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]');
  const right = page.locator('#adia-diagram-canvas g[data-semantic-id="part-right"]');
  await expect(left).toHaveAttribute('transform', 'translate(233, 217)');
  await expect(right).toHaveAttribute('transform', 'translate(553, 217)');
  await page.keyboard.press('Control+z');
  await expect(frame).toHaveAttribute('x', '50');
  await expect(left).toHaveAttribute('transform', 'translate(200, 200)');
  await expect(right).toHaveAttribute('transform', 'translate(520, 200)');
});

test('losing focus stops a held Part port drag', async ({ page }) => {
  const part = page.locator('#adia-diagram-canvas g[data-semantic-id="part-left"]');
  await part.click({ position: { x: 80, y: 50 } });
  await page.getByTitle('Add Standard Port', { exact: true }).click();
  const portId = await page.evaluate(() => (window as any).__sysmlRepository.definitions['port-component'].ports[0].id);
  const endpoint = page.locator('[data-testid="ibd-connector-endpoint"][data-occurrence-id="part-left"]');
  const port = (await endpoint.boundingBox())!;
  const body = (await part.locator('rect[fill="var(--sysml-part-fill)"]').boundingBox())!;
  const layout = () => page.evaluate(id => (window as any).__adiaTestHooks.getDiagramPresentations()['ports-ibd']?.presentations['part-left']?.portLayouts?.[id], portId);
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width, body.y + body.height / 2, { steps: 5 });
  await expect.poll(layout).toMatchObject({ side: 'right', offset: 0.5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(body.x + body.width / 2, body.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(layout).toMatchObject({ side: 'right', offset: 0.5 });
});
