import { expect, test, type Locator, type Page } from '@playwright/test';

async function dismissWelcome(page: Page) {
  const overlay = page.locator('[data-testid="welcome-overlay"]');
  if (await overlay.count()) {
    await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await overlay.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  }
}

async function createCanvasBlock(page: Page): Promise<string> {
  const before = await page.evaluate(() => Object.keys((window as any).__sysmlRepository.definitions));
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  let created = '';
  await expect.poll(async () => {
    const ids = await page.evaluate(() => Object.keys((window as any).__sysmlRepository.definitions));
    const fresh = ids.filter(id => !before.includes(id));
    if (fresh.length === 1) created = fresh[0];
    return fresh.length;
  }).toBe(1);
  return created;
}

async function moveBlock(page: Page, block: Locator, dx: number) {
  const bounds = await block.boundingBox();
  if (!bounds) throw new Error('Block has no browser bounds');
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
}

async function expectNoVisibleId(surface: Locator, ids: string[]) {
  const presentation = await surface.evaluate(element => ({
    text: element.textContent ?? '',
    accessible: [element, ...element.querySelectorAll('*')]
      .flatMap(node => [node.getAttribute('aria-label'), node.getAttribute('aria-description'), node.getAttribute('title')])
      .filter(Boolean)
      .join(' '),
  }));
  for (const value of Object.values(presentation)) {
    expect(value).not.toMatch(/\b(?:Source ID|Target ID|ID)\b/i);
    expect(value).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    for (const id of ids) expect(value).not.toContain(id);
  }
}

async function saveProject(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Save ADIA project (.adia)').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.adia$/);
  const path = test.info().outputPath('sysml-human-readable-labels.adia');
  await download.saveAs(path);
  return path;
}

test('BDD names, unnamed association fallback, and endpoint labels survive rename and reload', async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissWelcome(page);
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  await page.getByRole('tab', { name: /Main SysML BDD/ }).click();

  const canvas = page.locator('#adia-diagram-canvas');
  await expect(canvas).toBeVisible();
  const firstId = await createCanvasBlock(page);
  const first = canvas.locator(`g[data-semantic-id="${firstId}"]`);
  await first.click({ position: { x: 30, y: 40 } });
  const inspector = page.getByLabel('SysML Property Inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('h3')).toHaveText('Block');
  await expectNoVisibleId(inspector, [firstId]);

  const name = inspector.getByRole('textbox', { name: 'Element Name' });
  await name.fill('Flight Computer');
  await name.press('Enter');
  await expect(first.getByText('Flight Computer', { exact: true })).toBeVisible();
  await expect(inspector.locator('h3')).toHaveText('Block: Flight Computer');
  await page.getByRole('button', { name: 'Expand All' }).click();
  const firstTreeRow = page.locator(`.model-tree-row[data-semantic-id="${firstId}"]`);
  await expect(firstTreeRow).toContainText('Flight Computer');
  await expectNoVisibleId(firstTreeRow, [firstId]);
  await expectNoVisibleId(first, [firstId]);

  const secondId = await createCanvasBlock(page);
  const second = canvas.locator(`g[data-semantic-id="${secondId}"]`);
  await expect(second).toBeVisible();
  await moveBlock(page, second, 260);
  await second.click({ position: { x: 30, y: 40 } });
  await inspector.getByRole('textbox', { name: 'Element Name' }).fill('Telemetry Bus');
  await inspector.getByRole('textbox', { name: 'Element Name' }).press('Enter');
  await expect(second.getByText('Telemetry Bus', { exact: true })).toBeVisible();

  const relationshipIdsBefore = await page.evaluate(() => Object.keys((window as any).__sysmlRepository.relationships));
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await first.click({ position: { x: 30, y: 40 } });
  await second.click({ position: { x: 30, y: 40 } });
  let associationId = '';
  await expect.poll(async () => {
    const result = await page.evaluate(() => Object.values((window as any).__sysmlRepository.relationships) as any[]);
    const created = result.filter(rel => !relationshipIdsBefore.includes(rel.id)
      && rel.kind === 'association' && rel.sourceId === firstId && rel.targetId === secondId);
    if (created.length === 1) associationId = created[0].id;
    return created.length;
  }).toBe(1);
  expect(await page.evaluate(id => (window as any).__sysmlRepository.relationships[id].name?.trim() ?? '', associationId)).toBe('');

  const association = canvas.locator(`g[data-semantic-id="${associationId}"][data-presentation-kind="relationship"]`);
  await expect(association).toBeVisible();
  await association.click();
  await expect(inspector.locator('h3')).toHaveText('Association');
  await expect(inspector.getByRole('combobox', { name: 'Source' }).locator('option:checked')).toHaveText('Flight Computer');
  await expect(inspector.getByRole('combobox', { name: 'Target' }).locator('option:checked')).toHaveText('Telemetry Bus');
  await expect(association.locator('title')).toContainText('Association: Flight Computer -> Telemetry Bus');
  await expectNoVisibleId(inspector, [firstId, secondId, associationId]);
  await expectNoVisibleId(association, [firstId, secondId, associationId]);

  await first.click({ position: { x: 30, y: 40 } });
  await inspector.getByRole('textbox', { name: 'Element Name' }).fill('Guidance Computer');
  await inspector.getByRole('textbox', { name: 'Element Name' }).press('Enter');
  await expect(first.getByText('Guidance Computer', { exact: true })).toBeVisible();
  await expect(firstTreeRow).toContainText('Guidance Computer');
  await expect(association.locator('title')).toContainText('Association: Guidance Computer -> Telemetry Bus');
  await association.click();
  await expect(inspector.getByRole('combobox', { name: 'Source' }).locator('option:checked')).toHaveText('Guidance Computer');
  await expectNoVisibleId(inspector, [firstId, secondId, associationId]);

  const savedPath = await saveProject(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissWelcome(page);
  await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(savedPath);
  await expect(canvas.locator(`g[data-semantic-id="${firstId}"]`)).toBeVisible();
  await expect(canvas.locator(`g[data-semantic-id="${secondId}"]`)).toBeVisible();
  await expect(canvas.locator(`g[data-semantic-id="${associationId}"]`)).toBeVisible();
  await expect(canvas.getByText('Guidance Computer', { exact: true })).toBeVisible();
  await expect(canvas.getByText('Telemetry Bus', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand All' }).click();
  await expect(firstTreeRow).toContainText('Guidance Computer');
  await expectNoVisibleId(firstTreeRow, [firstId, secondId, associationId]);
  await expect.poll(() => page.evaluate(id => {
    const rel = (window as any).__sysmlRepository.relationships[id];
    return rel ? [rel.sourceId, rel.targetId] : [];
  }, associationId)).toEqual([firstId, secondId]);

  await canvas.locator(`g[data-semantic-id="${associationId}"]`).click();
  await expect(inspector.locator('h3')).toHaveText('Association');
  await expect(inspector.getByRole('combobox', { name: 'Source' }).locator('option:checked')).toHaveText('Guidance Computer');
  await expect(inspector.getByRole('combobox', { name: 'Target' }).locator('option:checked')).toHaveText('Telemetry Bus');
  await expectNoVisibleId(inspector, [firstId, secondId, associationId]);
  await expectNoVisibleId(canvas.locator(`g[data-semantic-id="${associationId}"]`), [firstId, secondId, associationId]);
});
