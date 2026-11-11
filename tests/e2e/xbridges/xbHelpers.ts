/**
 * Shared helpers for the X-Bridges V8 end-to-end specs (WP-20).
 * Expected values in the specs never come from these helpers: they only drive the UI and read what the UI exposes
 * (status bar, toolbar, Scope "Export Data" CSV, stored project JSON from Save).
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** Playwright 1.65 wants a browser build the sandbox may not have; fall back to any installed chromium. */
export function useLocalChromium(): void {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let exe: string | undefined = process.env.XBV_CHROMIUM_PATH;
  if (!exe && !defaultBuildPresent(root)) {
    try {
      const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
      const candidate = dirs.length ? path.join(root, dirs[0], 'chrome-linux64', 'chrome') : '';
      if (candidate && fs.existsSync(candidate)) exe = candidate;
    } catch { /* default browser resolution applies */ }
  }
  test.use({
    viewport: { width: 1920, height: 1080 },
    ...(exe ? { launchOptions: { executablePath: exe } } : {}),
  });
}

function defaultBuildPresent(root: string): boolean {
  try {
    // The installed Playwright records its expected revision in browsers.json.
    const browsersJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'node_modules/playwright-core/browsers.json'), 'utf8'));
    const shell = browsersJson.browsers.find((b: any) => b.name === 'chromium-headless-shell');
    return !!shell && fs.existsSync(path.join(root, `chromium_headless_shell-${shell.revision}`));
  } catch { return false; }
}

export interface ErrorLog {
  errors: string[];
  /** Console "Failed to load resource" noise from the sandbox (no network, no local LLM). Kept separate. */
  environment: string[];
}

/** Collects page errors and console errors; resource-load failures are environment noise (Ollama probe, fonts). */
export function trackErrors(page: Page): ErrorLog {
  const log: ErrorLog = { errors: [], environment: [] };
  page.on('pageerror', e => log.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource: net::ERR_/.test(text)) log.environment.push(text);
    else log.errors.push(text);
  });
  return log;
}

export async function openXbridges(page: Page, switchToTab = true): Promise<void> {
  await page.goto('/?projectName=adia', { waitUntil: 'domcontentloaded' });
  const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
  await page.waitForTimeout(2500);
  if (await overlay.count()) {
    await page.keyboard.press('Escape');
    await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
  }
  if (!switchToTab) return;
  await page.getByText('Main X-Bridges', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Engine', exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
}

export const node = (page: Page, id: string): Locator => page.locator(`.react-flow__node[data-id="${id}"]`);
export const handleOf = (page: Page, id: string, handle: string): Locator =>
  page.locator(`.react-flow__node[data-id="${id}"] .react-flow__handle[data-handleid="${handle}"]`);

/**
 * Library drag and drop. The product always drops at the pane centre (see XBV-145), so the node is dragged to the
 * requested screen position afterwards (omit x/y to leave it at the centre).
 */
export async function dropBlock(page: Page, label: string, category: string, x?: number, y?: number): Promise<string> {
  await page.mouse.click(620, 260); // deselect so the new node is the top-most one
  await page.waitForTimeout(700);
  const before = await page.locator('.react-flow__node').count();
  const item = page.getByText(label, { exact: true }).first();
  if (!(await item.isVisible().catch(() => false))) await page.getByRole('button', { name: category }).click();
  await item.dragTo(page.locator('.react-flow'), { targetPosition: { x: 300, y: 300 } });
  await page.waitForFunction(n => document.querySelectorAll('.react-flow__node').length > n, before);
  const id = (await page.locator('.react-flow__node').last().getAttribute('data-id'))!;
  await page.waitForTimeout(900);
  if (x !== undefined && y !== undefined) await moveNodeTo(page, id, x, y);
  return id;
}

/** Move a node so that its centre lands on the screen point (x, y), with a real mouse drag on the node body. */
export async function moveNodeTo(page: Page, id: string, x: number, y: number): Promise<void> {
  const bb = (await node(page, id).boundingBox())!;
  await dragNodeBy(page, id, x - (bb.x + bb.width / 2), y - (bb.y + bb.height / 2));
}

export async function dragNodeBy(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const bb = (await node(page, id).boundingBox())!;
  const sx = bb.x + 60, sy = bb.y + 30;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(sx + (dx * k) / 10, sy + (dy * k) / 10, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/** Drag from one handle to another (output to input, as a user does). */
export async function connect(page: Page, a: string, ah: string, b: string, bh: string): Promise<void> {
  const s = (await handleOf(page, a, ah).boundingBox())!;
  const t = (await handleOf(page, b, bh).boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move((s.x + t.x) / 2, (s.y + t.y) / 2, { steps: 6 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

export async function edgeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('.react-flow__edge')].map(e => e.getAttribute('data-testid') || ''));
}

export async function zoomOut(page: Page, times = 2): Promise<void> {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: 'Zoom Out' }).click();
}

export async function selectNode(page: Page, id: string): Promise<void> {
  await node(page, id).click({ position: { x: 40, y: 20 } });
  await page.waitForTimeout(300);
}

/** The Constant "Value" editor of the properties panel (the block must be selected). */
export const constantValueInput = (page: Page): Locator =>
  page.locator('p:has-text("Hint: Type")').first().locator('xpath=preceding::input[1]');

export async function setConstantValue(page: Page, id: string, value: string): Promise<void> {
  await selectNode(page, id);
  const input = constantValueInput(page);
  await input.fill(value);
  await input.blur();
  await page.waitForTimeout(200);
}

export interface ToolbarSettings { start?: string | number; stop?: string | number; step?: string | number; solver?: string }

export async function setToolbar(page: Page, s: ToolbarSettings): Promise<void> {
  if (s.solver) await page.locator('select').filter({ has: page.locator('option[value="ode14x"]') }).selectOption(s.solver);
  if (s.start !== undefined) await page.locator('input[title^="Simulation start"], input[title^="Start time"]').first().fill(String(s.start));
  if (s.stop !== undefined) await page.locator('input[title^="Simulation stop"], input[title^="Stop time"]').first().fill(String(s.stop));
  if (s.step !== undefined) await page.locator('input[title^="Fixed-step"], input[title^="Fixed step"]').first().fill(String(s.step));
}

export interface IntegratorModel { constant: string; integrator: string; scope: string }

/** Constant -> Integrator -> Scope, built by hand (library drag and drop, handle-to-handle wiring). */
export async function buildIntegratorModel(page: Page, constantValue = '2'): Promise<IntegratorModel> {
  const constant = await dropBlock(page, 'Constant', 'SOURCES');
  await zoomOut(page, 4);
  await moveNodeTo(page, constant, 700, 450);
  const integrator = await dropBlock(page, 'Integrator', 'CONTINUOUS SYSTEMS', 1000, 450);
  const scope = await dropBlock(page, 'Scope', 'SINKS', 1330, 450);
  await connect(page, constant, 'out', integrator, 'in');
  await connect(page, integrator, 'out', scope, 'in1');
  await setConstantValue(page, constant, constantValue);
  return { constant, integrator, scope };
}

export const runButton = (page: Page): Locator => page.getByRole('button', { name: 'Run Engine', exact: true });
export const stopButton = (page: Page): Locator => page.getByRole('button', { name: 'Stop Engine', exact: true });

export async function runToEnd(page: Page, timeout = 60_000): Promise<void> {
  await runButton(page).click();
  await expect(runButton(page)).toBeVisible({ timeout });
  await waitForStatusSettled(page);
}

/**
 * XBV-148: when a run ends the Run button comes back one render before the status bar shows the final time (the
 * status is refreshed on every 4th tick and, at the end, from the effect cleanup), so the bar can show a time up to
 * four steps short for about 40-130 ms. Wait until two reads 250 ms apart agree; the value itself is not assumed,
 * so a run that really stops early still fails the caller's check.
 */
export async function waitForStatusSettled(page: Page, timeoutMs = 3_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let previous = await statusText(page);
  for (;;) {
    await page.waitForTimeout(250);
    const current = await statusText(page);
    if (current === previous || Date.now() > deadline) return current;
    previous = current;
  }
}

/**
 * XBV-149: the workspace reaches the project store through a 300 ms debounce that every canvas change restarts (a run
 * changes the canvas on every 4th tick), and Save does not flush it. Before a Save whose content is asserted, wait
 * until the canvas has been still for longer than the debounce.
 */
export const SAVE_DEBOUNCE_SETTLE_MS = 1_000;

export const statusBar = (page: Page): Locator => page.getByRole('status', { name: 'X-Bridges status bar' });

export async function statusText(page: Page): Promise<string> {
  return ((await statusBar(page).innerText()) || '').replace(/\s+/g, ' ');
}

export async function statusTime(page: Page): Promise<number> {
  const m = /t = (-?[\d.]+) s/.exec(await statusText(page));
  return m ? Number(m[1]) : Number.NaN;
}

export async function problemsSummary(page: Page): Promise<string> {
  const m = /Problems: (.*)$/.exec(await statusText(page));
  return m ? m[1].trim() : '';
}

/** Scope "Export Data" CSV (exact engine samples) as [t, y] rows. */
export async function scopeSamples(page: Page, scopeId: string): Promise<Array<[number, number]>> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(`.react-flow__node[data-id="${scopeId}"] button[title="Export Data"]`).dispatchEvent('click'),
  ]);
  const text = fs.readFileSync((await download.path())!, 'utf8');
  return text.trim().split('\n').slice(1).map(line => {
    const [t, y] = line.split(',').map(Number);
    return [t, y] as [number, number];
  });
}

/** Save through the toolbar (browser fallback downloads the .adia) and return the parsed JSON. */
export async function saveProject(page: Page): Promise<any> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  return JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
}

/** Open a saved .adia through the toolbar Open button (hidden file input in the browser). */
export async function openProjectFile(page: Page, filePath: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open', exact: true }).click(),
  ]);
  await chooser.setFiles(filePath);
  await page.waitForTimeout(2500);
}

/** Model facts that must survive a save/open round trip (no scope history, no measured sizes). */
export function modelFacts(project: any) {
  const nodes = (project.globalXBridgesNodes as any[]).map(n => ({
    id: n.id, type: n.data?.type, parentId: n.data?.parentId, params: n.data?.params,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
  })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = (project.globalXBridgesEdges as any[]).map(e => ({
    source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const { solver, startTime, stopTime, fixedStep } = project.globalXBridgesSimulation ?? {};
  return { nodes, edges, simulation: { solver, startTime, stopTime, fixedStep } };
}

export function expectSamplesFollow(samples: Array<[number, number]>, slope: number, tol: number): void {
  expect(samples.length).toBeGreaterThan(1);
  for (const [t, y] of samples) {
    expect(Number.isFinite(y)).toBe(true);
    expect(Math.abs(y - slope * t)).toBeLessThanOrEqual(tol);
  }
}
