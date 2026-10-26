import { test, expect, type Page } from '@playwright/test';

// SolidWorks-style diagram navigation: middle drag pans 1:1 (also over symbols and outside
// the canvas), the wheel zooms about the cursor, Shift+middle drag zooms, double middle click fits.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) { await intro.first().click({ position: { x: 10, y: 10 }, force: true }); await expect(intro).toHaveCount(0); }
  await page.locator('[data-diagram-id="adia-default-bdd"], [data-diagram-id="bdd"]').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__adiaTestHooks.getDiagramMode())).toBe('bdd');
  const creation = await page.evaluate(() => (window as any).__sysmlExecuteCommand({
    type: 'createAndPresent', diagramId: (window as any).__adiaTestHooks.getActiveDiagramId(),
    element: { id: 'nav-block', name: 'NavBlock', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] },
    presentation: { x: 180, y: 160, width: 220, height: 150 },
  }));
  expect(creation.committed, JSON.stringify(creation)).toBe(true);
});

async function viewOf(page: Page) {
  return page.evaluate(() => {
    const g = document.querySelector('#adia-diagram-canvas svg.sysml-diagram-canvas > g')!;
    const m = /translate\(([-\d.e]+), ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(g.getAttribute('transform')!)!;
    const r = document.querySelector('#adia-diagram-canvas')!.getBoundingClientRect();
    return { x: +m[1], y: +m[2], s: +m[3], left: r.left, top: r.top, w: r.width, h: r.height };
  });
}

async function canvasCentre(page: Page) {
  const v = await viewOf(page);
  return { x: Math.round(v.left + v.w / 2), y: Math.round(v.top + v.h / 2) };
}

test('middle drag pans exactly with the pointer, including outside the canvas', async ({ page }) => {
  const c = await canvasCentre(page);
  const before = await viewOf(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.move(c.x + 37, c.y - 23, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => { const v = await viewOf(page); return [v.x - before.x, v.y - before.y, v.s]; }).toEqual([37, -23, before.s]);
});

test('middle drag over a symbol pans the view and leaves the symbol where it is', async ({ page }) => {
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="nav-block"]');
  const transform = await block.getAttribute('transform');
  const box = (await block.boundingBox())!;
  const before = await viewOf(page);
  await page.mouse.move(box.x + 60, box.y + 40);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + 110, box.y + 60, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => { const v = await viewOf(page); return [v.x - before.x, v.y - before.y]; }).toEqual([50, 20]);
  await expect(block).toHaveAttribute('transform', transform!);
});

test('wheel and Shift+middle drag zoom about the cursor', async ({ page }) => {
  const c = await canvasCentre(page);
  const p = { x: c.x + 90, y: c.y - 40 };
  const worldUnder = (v: Awaited<ReturnType<typeof viewOf>>) => ({ x: (p.x - v.left - v.x) / v.s, y: (p.y - v.top - v.y) / v.s });
  const start = await viewOf(page);
  const anchor = worldUnder(start);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await viewOf(page)).s).toBeGreaterThan(start.s * 1.5);
  const zoomed = await viewOf(page);
  expect(worldUnder(zoomed).x).toBeCloseTo(anchor.x, 3);
  expect(worldUnder(zoomed).y).toBeCloseTo(anchor.y, 3);

  await page.keyboard.down('Shift');
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(p.x, p.y + 220, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await viewOf(page)).s / zoomed.s).toBeCloseTo(0.5, 6);
  const out = await viewOf(page);
  expect(worldUnder(out).x).toBeCloseTo(anchor.x, 3);
});

test('double middle click fits the diagram, a pan followed by a press does not', async ({ page }) => {
  const c = await canvasCentre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(c.x + 40, c.y, { steps: 4 });
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  const afterPan = await viewOf(page);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  expect((await viewOf(page)).s).toBe(afterPan.s);

  await page.waitForTimeout(500);
  await page.mouse.click(c.x, c.y, { button: 'middle' });
  await page.mouse.click(c.x, c.y, { button: 'middle' });
  const block = page.locator('#adia-diagram-canvas g[data-semantic-id="nav-block"]');
  await expect.poll(async () => {
    const box = (await block.boundingBox())!;
    const v = await viewOf(page);
    return Math.round(box.x + box.width / 2 - (v.left + v.w / 2));
  }).toBe(0);
});
