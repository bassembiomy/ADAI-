import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateScalabilityFixture } from '../../src/engine/sysml/largeModelGenerator';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../src/services/sysmlCommandGateway';

const size = Number(process.argv.find(arg => arg.startsWith('--size='))?.split('=')[1] ?? 10_000);
const url = process.env.ADIA_PROFILE_URL ?? 'http://127.0.0.1:3105';
if (!Number.isSafeInteger(size) || size < 1_000) throw new Error('Provide --size=<integer >= 1000>');
const fixture = generateScalabilityFixture({ semanticCount: size, seed: 42, topology: 'distributed' });
const payload = buildCanonicalSysmlProjectPayload(
  createSysmlGatewayState(fixture.repository, fixture.coordinates, fixture.diagramPresentations),
  {
    version: '1.0', projectName: `Scalability browser profile ${size}`,
    diagramWorkspace: {
      tabs: [{ kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' }],
      activeTab: { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
    },
    stateMachine: fixture.stateMachine,
  },
);
const file = Buffer.from(JSON.stringify(payload));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');
  const overlay = page.getByTestId('welcome-overlay');
  if (await overlay.isVisible()) {
    await overlay.click({ force: true });
    await overlay.waitFor({ state: 'hidden' });
  }
  await page.evaluate(() => {
    const w = window as any;
    w.__profileTicks = [performance.now()];
    w.__profileLongTasks = [];
    w.__profileTimer = setInterval(() => w.__profileTicks.push(performance.now()), 16);
    w.__profileObserver = new PerformanceObserver(entries => {
      w.__profileLongTasks.push(...entries.getEntries().map(item => item.duration));
    });
    w.__profileObserver.observe({ type: 'longtask' });
    w.__profileLoadStart = performance.now();
  });
  await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles({
    name: `scalability-${size}.adia`, mimeType: 'application/json', buffer: file,
  });
  const expectedDefinitions = Object.keys(fixture.repository.definitions).length;
  await page.waitForFunction(expected => Object.keys((window as any).__sysmlRepository?.definitions ?? {}).length === expected, expectedDefinitions);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const load = await page.evaluate(() => {
    const w = window as any;
    const end = performance.now();
    const times = [...w.__profileTicks, end];
    const activeDiagramId = w.__adiaTestHooks?.getActiveDiagramId();
    return {
      durationMs: end - w.__profileLoadStart,
      maxHeartbeatGapMs: Math.max(...times.slice(1).map((value, index) => value - times[index])),
      longTasksMs: w.__profileLongTasks,
      activeDiagramId,
      presented: w.__adiaTestHooks?.getDiagramPresentations()?.[activeDiagramId]?.elementIds?.length,
      treeDomRows: document.querySelectorAll('.model-tree-row').length,
    };
  });
  if (load.activeDiagramId !== 'diagram-ordinary') throw new Error(`Unexpected active diagram: ${load.activeDiagramId}`);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const edit = await page.evaluate(async () => {
    const w = window as any;
    w.__profileTicks = [performance.now()];
    w.__profileLongTasks = [];
    const start = performance.now();
    const result = w.__sysmlExecuteCommand({ type: 'updateElement', elementId: 'blk_1', patch: { name: 'Browser Profiled Block' } });
    const handlerMs = performance.now() - start;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise(resolve => setTimeout(resolve, 50));
    const end = performance.now();
    const times = [...w.__profileTicks, end];
    return {
      committed: result?.committed,
      name: w.__sysmlRepository?.definitions?.blk_1?.name,
      handlerMs,
      settleMs: end - start,
      maxHeartbeatGapMs: Math.max(...times.slice(1).map((value, index) => value - times[index])),
      longTasksMs: w.__profileLongTasks,
      treeDomRows: document.querySelectorAll('.model-tree-row').length,
    };
  });
  const { profile } = await cdp.send('Profiler.stop');
  if (!edit.committed || edit.name !== 'Browser Profiled Block') throw new Error('Browser rename did not commit');
  const weights = new Map<number, number>();
  profile.samples?.forEach((id, index) => weights.set(id, (weights.get(id) ?? 0) + (profile.timeDeltas?.[index] ?? 0)));
  const hotspots = profile.nodes.map(node => ({
    function: node.callFrame.functionName,
    url: node.callFrame.url,
    line: node.callFrame.lineNumber + 1,
    selfMs: Number(((weights.get(node.id) ?? 0) / 1000).toFixed(2)),
  })).sort((left, right) => right.selfMs - left.selfMs).slice(0, 20);
  const outputDir = resolve('artifacts/scalability');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, `profile-browser-${size}.cpuprofile`), JSON.stringify(profile));
  const result = { size, seed: 42, productionUrl: url, fileMB: file.length / 1024 / 1024, load, edit, hotspots, errors };
  writeFileSync(resolve(outputDir, `profile-browser-${size}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await cdp.detach();
  await page.close();
} finally {
  await browser.close();
}
