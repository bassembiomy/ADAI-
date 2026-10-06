import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateScalabilityFixture } from '../../src/engine/sysml/largeModelGenerator';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../src/services/sysmlCommandGateway';
import { calculateStats } from './metrics';

import { type WorkflowsMap } from './workflows';

const size = Number(process.argv.find(arg => arg.startsWith('--size='))?.split('=')[1] ?? 10_000);
const profileCpu = process.argv.includes('--cpu-profile');
const outDirArg = process.argv.find(arg => arg.startsWith('--out-dir='))?.split('=')[1];
const rawUrl = process.env.ADIA_PROFILE_URL ?? 'http://127.0.0.1:3105';
const url = rawUrl.includes('perfTelemetry=') ? rawUrl : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}perfTelemetry=1`;
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
    w.__ADIA_PERF_ENABLED__ = true;
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
  await page.waitForFunction(expected => {
    const w = window as any;
    return w.__adiaTestHooks?.getRenderedDefinitionCount() === expected
      && w.__adiaTestHooks?.getRenderedSysmlRevision() === w.__sysmlRepository?.revision
      && w.__adiaTestHooks?.getActiveDiagramId() === 'diagram-ordinary';
  }, expectedDefinitions);
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

  const samplesCount = Number(process.argv.find(arg => arg.startsWith('--samples='))?.split('=')[1] ?? 5);

  const cdp = profileCpu ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }

  const operations: {
    rename: Array<{ handlerMs: number; paintDelayMs: number; settleMs: number; maxHeartbeatGapMs: number; longTasksMs: number[]; reactCommits?: any[]; renderCountsByArea?: any }>;
    undo: Array<{ handlerMs: number; paintDelayMs: number; settleMs: number; maxHeartbeatGapMs: number; longTasksMs: number[]; reactCommits?: any[]; renderCountsByArea?: any }>;
    redo: Array<{ handlerMs: number; paintDelayMs: number; settleMs: number; maxHeartbeatGapMs: number; longTasksMs: number[]; reactCommits?: any[]; renderCountsByArea?: any }>;
  } = { rename: [], undo: [], redo: [] };

  for (let i = 0; i < samplesCount; i++) {
    const targetName = `Browser Profiled Block ${i + 1}`;
    // 1. Rename
    const renameRes = await page.evaluate(async (name) => {
      const w = window as any;
      if (w.__ADIA_PERF__?.clearRenderTelemetry) w.__ADIA_PERF__.clearRenderTelemetry();
      w.__profileTicks = [performance.now()];
      w.__profileLongTasks = [];
      performance.mark('command-dispatch-start');
      const start = performance.now();
      const result = w.__sysmlExecuteCommand({ type: 'updateElement', elementId: 'blk_1', patch: { name } });
      const handlerMs = performance.now() - start;
      while (w.__adiaTestHooks?.getRenderedSysmlRevision() !== w.__sysmlRepository?.revision) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      performance.mark('command-paint-end');
      const paintDelayMs = performance.now() - start;
      const telemetry = w.__ADIA_PERF__?.getRenderTelemetry?.() ?? { entries: [], renderCountsByArea: {} };
      await new Promise(resolve => setTimeout(resolve, 50));
      const end = performance.now();
      const times = [...w.__profileTicks, end];
      return {
        committed: result?.committed,
        name: w.__sysmlRepository?.definitions?.blk_1?.name,
        handlerMs,
        paintDelayMs,
        settleMs: end - start,
        maxHeartbeatGapMs: Math.max(...times.slice(1).map((val: number, idx: number) => val - times[idx])),
        longTasksMs: w.__profileLongTasks,
        reactCommits: telemetry.entries,
        renderCountsByArea: telemetry.renderCountsByArea,
      };
    }, targetName);
    if (!renameRes.committed || renameRes.name !== targetName) throw new Error(`Rename failed at sample ${i}`);
    operations.rename.push(renameRes);

    // 2. Undo
    const undoRes = await page.evaluate(async () => {
      const w = window as any;
      if (w.__ADIA_PERF__?.clearRenderTelemetry) w.__ADIA_PERF__.clearRenderTelemetry();
      w.__profileTicks = [performance.now()];
      w.__profileLongTasks = [];
      performance.mark('command-dispatch-start');
      const start = performance.now();
      const result = w.__sysmlExecuteCommand({ type: 'undo' });
      const handlerMs = performance.now() - start;
      while (w.__adiaTestHooks?.getRenderedSysmlRevision() !== w.__sysmlRepository?.revision) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      performance.mark('command-paint-end');
      const paintDelayMs = performance.now() - start;
      const telemetry = w.__ADIA_PERF__?.getRenderTelemetry?.() ?? { entries: [], renderCountsByArea: {} };
      await new Promise(resolve => setTimeout(resolve, 50));
      const end = performance.now();
      const times = [...w.__profileTicks, end];
      return {
        committed: result?.committed,
        name: w.__sysmlRepository?.definitions?.blk_1?.name,
        handlerMs,
        paintDelayMs,
        settleMs: end - start,
        maxHeartbeatGapMs: Math.max(...times.slice(1).map((val: number, idx: number) => val - times[idx])),
        longTasksMs: w.__profileLongTasks,
        reactCommits: telemetry.entries,
        renderCountsByArea: telemetry.renderCountsByArea,
      };
    });
    if (!undoRes.committed) throw new Error(`Undo failed at sample ${i}`);
    operations.undo.push(undoRes);

    // 3. Redo
    const redoRes = await page.evaluate(async (name) => {
      const w = window as any;
      if (w.__ADIA_PERF__?.clearRenderTelemetry) w.__ADIA_PERF__.clearRenderTelemetry();
      w.__profileTicks = [performance.now()];
      w.__profileLongTasks = [];
      performance.mark('command-dispatch-start');
      const start = performance.now();
      const result = w.__sysmlExecuteCommand({ type: 'redo' });
      const handlerMs = performance.now() - start;
      while (w.__adiaTestHooks?.getRenderedSysmlRevision() !== w.__sysmlRepository?.revision) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      performance.mark('command-paint-end');
      const paintDelayMs = performance.now() - start;
      const telemetry = w.__ADIA_PERF__?.getRenderTelemetry?.() ?? { entries: [], renderCountsByArea: {} };
      await new Promise(resolve => setTimeout(resolve, 50));
      const end = performance.now();
      const times = [...w.__profileTicks, end];
      return {
        committed: result?.committed,
        name: w.__sysmlRepository?.definitions?.blk_1?.name,
        handlerMs,
        paintDelayMs,
        settleMs: end - start,
        maxHeartbeatGapMs: Math.max(...times.slice(1).map((val: number, idx: number) => val - times[idx])),
        longTasksMs: w.__profileLongTasks,
        reactCommits: telemetry.entries,
        renderCountsByArea: telemetry.renderCountsByArea,
      };
    }, targetName);
    if (!redoRes.committed || redoRes.name !== targetName) throw new Error(`Redo failed at sample ${i}`);
    operations.redo.push(redoRes);
  }

  const profile = cdp ? (await cdp.send('Profiler.stop')).profile : null;
  const weights = new Map<number, number>();
  profile?.samples?.forEach((id, index) => weights.set(id, (weights.get(id) ?? 0) + (profile.timeDeltas?.[index] ?? 0)));
  const hotspots = (profile?.nodes ?? []).map(node => ({
    function: node.callFrame.functionName,
    url: node.callFrame.url,
    line: node.callFrame.lineNumber + 1,
    selfMs: Number(((weights.get(node.id) ?? 0) / 1000).toFixed(2)),
  })).sort((left, right) => right.selfMs - left.selfMs).slice(0, 20);

  const stats = {
    rename: {
      handler: calculateStats(operations.rename.map(o => o.handlerMs)),
      paintDelay: calculateStats(operations.rename.map(o => o.paintDelayMs)),
      settle: calculateStats(operations.rename.map(o => o.settleMs)),
      heartbeatGap: calculateStats(operations.rename.map(o => o.maxHeartbeatGapMs)),
    },
    undo: {
      handler: calculateStats(operations.undo.map(o => o.handlerMs)),
      paintDelay: calculateStats(operations.undo.map(o => o.paintDelayMs)),
      settle: calculateStats(operations.undo.map(o => o.settleMs)),
      heartbeatGap: calculateStats(operations.undo.map(o => o.maxHeartbeatGapMs)),
    },
    redo: {
      handler: calculateStats(operations.redo.map(o => o.handlerMs)),
      paintDelay: calculateStats(operations.redo.map(o => o.paintDelayMs)),
      settle: calculateStats(operations.redo.map(o => o.settleMs)),
      heartbeatGap: calculateStats(operations.redo.map(o => o.maxHeartbeatGapMs)),
    },
  };

  const workflows: WorkflowsMap = {
    rename: {
      samples: operations.rename.map(o => ({
        handlerMs: o.handlerMs,
        paintDelayMs: o.paintDelayMs,
        settleMs: o.settleMs,
        heartbeatGapMs: o.maxHeartbeatGapMs,
        longTasksMs: o.longTasksMs,
      })),
    },
    undo: {
      samples: operations.undo.map(o => ({
        handlerMs: o.handlerMs,
        paintDelayMs: o.paintDelayMs,
        settleMs: o.settleMs,
        heartbeatGapMs: o.maxHeartbeatGapMs,
        longTasksMs: o.longTasksMs,
      })),
    },
    redo: {
      samples: operations.redo.map(o => ({
        handlerMs: o.handlerMs,
        paintDelayMs: o.paintDelayMs,
        settleMs: o.settleMs,
        heartbeatGapMs: o.maxHeartbeatGapMs,
        longTasksMs: o.longTasksMs,
      })),
    },
  };

  const outputDir = outDirArg ? resolve(outDirArg) : resolve('artifacts/scalability');
  mkdirSync(outputDir, { recursive: true });
  if (profile) writeFileSync(resolve(outputDir, `profile-browser-${size}.cpuprofile`), JSON.stringify(profile));
  const result = {
    size,
    timestamp: new Date().toISOString(),
    samplesCount,
    profileCpu,
    seed: 42,
    productionUrl: url,
    fileMB: file.length / 1024 / 1024,
    load,
    operations,
    workflows,
    stats,
    hotspots,
    errors,
  };
  const outFileName = `profile-browser-${size}.json`;
  writeFileSync(resolve(outputDir, outFileName), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ size, load, stats }, null, 2));
  if (cdp) await cdp.detach();
  await page.close();
} finally {
  await browser.close();
}
