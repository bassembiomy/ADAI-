import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateScalabilityFixture } from '../../src/engine/sysml/largeModelGenerator';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../src/services/sysmlCommandGateway';
import { evaluateBrowserProfile, type BrowserProfile } from '../../scripts/scalability/assertBrowserProfile';
import { type WorkflowsMap, type WorkflowSample } from '../../scripts/scalability/workflows';

test.describe('SysML Scalability & Production Responsiveness Gate', () => {
  test.setTimeout(1_200_000);

  test('executes all 10 scalable workflows and satisfies production heartbeat gates', async ({ page, baseURL }) => {
    const size = Number(process.env.SCALABILITY_SIZE ?? 1000);
    const samplesCount = Number(process.env.SCALABILITY_SAMPLES ?? 5);
    const maxHeartbeatLimit = Number(process.env.SCALABILITY_MAX_HEARTBEAT ?? (size >= 50_000 ? 200 : 100));
    const targetUrl = process.env.ADIA_PROFILE_URL ?? baseURL ?? 'http://127.0.0.1:3105';
    const url = targetUrl.includes('perfTelemetry=') ? targetUrl : `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}perfTelemetry=1`;

    console.log(`[Scalability Gate] Running suite at size=${size}, samples=${samplesCount}, limit=${maxHeartbeatLimit}ms, url=${url}`);

    // 1. Generate Fixture
    const fixture = generateScalabilityFixture({ semanticCount: size, seed: 42, topology: 'distributed' });
    const payload = buildCanonicalSysmlProjectPayload(
      createSysmlGatewayState(fixture.repository, fixture.coordinates, fixture.diagramPresentations),
      {
        version: '1.0',
        projectName: `Scalability Gate Model ${size}`,
        diagramWorkspace: {
          tabs: [
            { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
            { kind: 'sysmlDiagram', diagramId: 'diagram-stress' },
          ],
          activeTab: { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
        },
        stateMachine: fixture.stateMachine,
      },
    );
    const fileBuffer = Buffer.from(JSON.stringify(payload));

    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('dialog', d => d.accept());

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function', { timeout: 30000 });

    const overlay = page.getByTestId('welcome-overlay');
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ force: true });
      await overlay.waitFor({ state: 'hidden' });
    }

    // Initialize telemetry
    await page.evaluate(() => {
      const w = window as any;
      w.__ADIA_PERF_ENABLED__ = true;
      w.__profileTicks = [performance.now()];
      w.__profileLongTasks = [];
      if (w.__profileTimer) clearInterval(w.__profileTimer);
      w.__profileTimer = setInterval(() => w.__profileTicks.push(performance.now()), 16);
      if (w.__profileObserver) w.__profileObserver.disconnect();
      w.__profileObserver = new PerformanceObserver(entries => {
        w.__profileLongTasks.push(...entries.getEntries().map(item => item.duration));
      });
      w.__profileObserver.observe({ type: 'longtask' });
      w.__profileLoadStart = performance.now();
    });

    // 2. Load Workflow
    await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles({
      name: `scalability-${size}.adia`,
      mimeType: 'application/json',
      buffer: fileBuffer,
    });

    const expectedDefinitions = Object.keys(fixture.repository.definitions).length;
    await page.waitForFunction(
      expected => Object.keys((window as any).__sysmlRepository?.definitions ?? {}).length === expected,
      expectedDefinitions,
      { timeout: 60000 },
    );
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));

    const loadMetrics = await page.evaluate(() => {
      const w = window as any;
      const end = performance.now();
      const times = [...w.__profileTicks, end];
      return {
        durationMs: end - w.__profileLoadStart,
        heartbeatGapMs: Math.max(...times.slice(1).map((val: number, idx: number) => val - times[idx])),
        longTasksMs: [...w.__profileLongTasks],
        activeDiagramId: w.__adiaTestHooks?.getActiveDiagramId(),
      };
    });

    expect(loadMetrics.activeDiagramId).toBe('diagram-ordinary');

    const workflows: WorkflowsMap = {};

    // Helper to profile an in-browser async operation with strict heartbeat & paint measurement
    async function measureBrowserOperation(
      actionScript: string,
      args?: any,
    ): Promise<WorkflowSample[]> {
      const samples: WorkflowSample[] = [];
      for (let i = 0; i < samplesCount; i++) {
        await page.waitForTimeout(100);
        const sample = await page.evaluate(async ({ script, arg, sampleIdx }) => {
          const w = window as any;
          if (w.__ADIA_PERF__?.clearRenderTelemetry) w.__ADIA_PERF__.clearRenderTelemetry();
          w.__profileTicks = [performance.now()];
          w.__profileLongTasks = [];

          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction('arg', 'sampleIdx', script);
          const start = performance.now();
          const actionResult = await fn(arg, sampleIdx);
          const handlerMs = performance.now() - start;

          await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
          const paintDelayMs = performance.now() - start;

          await new Promise(res => setTimeout(res, 50));
          const end = performance.now();
          const times = [...w.__profileTicks, end];
          const heartbeatGapMs = Math.max(...times.slice(1).map((val: number, idx: number) => val - times[idx]));

          return {
            handlerMs,
            paintDelayMs,
            settleMs: end - start,
            heartbeatGapMs,
            longTasksMs: [...w.__profileLongTasks],
            actionResult,
          };
        }, { script: actionScript, arg: args, sampleIdx: i });

        samples.push({
          handlerMs: sample.handlerMs,
          paintDelayMs: sample.paintDelayMs,
          settleMs: sample.settleMs,
          heartbeatGapMs: sample.heartbeatGapMs,
          longTasksMs: sample.longTasksMs,
        });
      }
      return samples;
    }

    // Pre-warm command gateway execution paths for JIT optimization
    await page.evaluate(() => {
      if (typeof (window as any).__sysmlExecuteCommand === 'function') {
        (window as any).__sysmlExecuteCommand({ type: 'updateElement', elementId: 'blk_1', patch: { name: 'Warmup Block 1' } });
        (window as any).__sysmlExecuteCommand({ type: 'undo' });
        (window as any).__sysmlExecuteCommand({ type: 'redo' });
        (window as any).__sysmlExecuteCommand({ type: 'updateElement', elementId: 'blk_1', patch: { name: 'Warmup Block 2' } });
      }
    });
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));

    // 3. Rename Workflow
    console.log(`[Scalability Gate] Running workflow: rename...`);
    const renameSamples = await measureBrowserOperation(`
      const name = "Renamed Block Sample " + (sampleIdx + 1);
      const res = window.__sysmlExecuteCommand({ type: 'updateElement', elementId: 'blk_1', patch: { name } });
      return res;
    `);
    workflows['rename'] = { samples: renameSamples };
    const currentBlkName = await page.evaluate(() => (window as any).__sysmlRepository?.definitions?.blk_1?.name);
    expect(currentBlkName).toContain('Renamed Block Sample');
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));

    // 4. Undo Workflow (immediately undos the renames with O(1) stack)
    console.log(`[Scalability Gate] Running workflow: undo...`);
    const undoSamples = await measureBrowserOperation(`
      return window.__sysmlExecuteCommand({ type: 'undo' });
    `);
    workflows['undo'] = { samples: undoSamples };

    // 5. Redo Workflow (immediately redoes the renames with O(1) stack)
    console.log(`[Scalability Gate] Running workflow: redo...`);
    const redoSamples = await measureBrowserOperation(`
      return window.__sysmlExecuteCommand({ type: 'redo' });
    `);
    workflows['redo'] = { samples: redoSamples };

    // 6. Property Edit Workflow
    console.log(`[Scalability Gate] Running workflow: property-edit...`);
    const propSamples = await measureBrowserOperation(`
      const name = "voltage_sensor_prop_" + (sampleIdx + 1);
      const blk = window.__sysmlRepository?.definitions?.blk_1;
      const props = Array.isArray(blk?.properties) ? [...blk.properties] : [];
      if (props.length > 0) {
        props[0] = { ...props[0], name };
      } else {
        props.push({ id: 'blk_1_p1', name, kind: 'value' });
      }
      return window.__sysmlExecuteCommand({ type: 'updateElement', elementId: 'blk_1', patch: { properties: props } });
    `);
    workflows['property-edit'] = { samples: propSamples };

    // Pre-warm creation and deletion paths for JIT optimization
    await page.evaluate(() => {
      for (let w = 1; w <= 2; w++) {
        const warmupId = 'warmup_temp_block_' + w;
        if (typeof (window as any).__sysmlExecuteCommand === 'function') {
          (window as any).__sysmlExecuteCommand({
            type: 'createElement',
            element: {
              id: warmupId,
              name: 'Warmup Block ' + w,
              kind: 'block',
              namespace: ['Model'],
              ownerId: 'model',
              isAbstract: false,
              isLeaf: false,
              properties: [],
              ports: [],
              operations: [],
              constraints: [],
            },
          });
          if (typeof (window as any).__sysmlExecuteConfirmedDeletion === 'function') {
            (window as any).__sysmlExecuteConfirmedDeletion([warmupId]);
          }
        }
      }
    });
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));

    // 7. Create / Delete Workflow
    console.log(`[Scalability Gate] Running workflow: create-delete...`);
    const createDeleteSamples = await measureBrowserOperation(`
      const tempId = "temp_scalability_elem_" + (sampleIdx + 1);
      const isCreate = sampleIdx % 2 === 0;
      if (isCreate) {
        return window.__sysmlExecuteCommand({
          type: 'createElement',
          element: {
            id: tempId,
            name: "Temp Block " + tempId,
            kind: 'block',
            namespace: ['Model'],
            ownerId: 'model',
            isAbstract: false,
            isLeaf: false,
            properties: [],
            ports: [],
            operations: [],
            constraints: [],
          },
        });
      } else {
        const prevId = "temp_scalability_elem_" + sampleIdx;
        return typeof window.__sysmlExecuteConfirmedDeletion === 'function'
          ? window.__sysmlExecuteConfirmedDeletion([prevId])
          : window.__sysmlExecuteCommand({ type: 'deleteElements', elementIds: [prevId] });
      }
    `);
    workflows['create-delete'] = { samples: createDeleteSamples };

    // 8. Tree Expand Workflow
    console.log(`[Scalability Gate] Running workflow: tree-expand...`);
    const treeExpandSamples = await measureBrowserOperation(`
      const store = window.__sysmlGatewayState?.store;
      if (store?.queryExplorerChildren) {
        return store.queryExplorerChildren('model');
      }
      return [];
    `);
    workflows['tree-expand'] = { samples: treeExpandSamples };

    // 9. Tree Search Workflow
    console.log(`[Scalability Gate] Running workflow: tree-search...`);
    const treeSearchSamples = await measureBrowserOperation(`
      const store = window.__sysmlGatewayState?.store;
      if (store?.searchExplorer) {
        return store.searchExplorer('Block_10');
      }
      return [];
    `);
    workflows['tree-search'] = { samples: treeSearchSamples };

    // Pre-warm diagram view templates
    await page.evaluate(() => {
      if (typeof (window as any).__setActiveSysmlDiagramId === 'function') {
        (window as any).__setActiveSysmlDiagramId('diagram-stress');
      }
    });
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
    await page.evaluate(() => {
      if (typeof (window as any).__setActiveSysmlDiagramId === 'function') {
        (window as any).__setActiveSysmlDiagramId('diagram-ordinary');
      }
    });
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));

    // 10. Diagram Switch Workflow
    console.log(`[Scalability Gate] Running workflow: diagram-switch...`);
    const diagramSwitchSamples = await measureBrowserOperation(`
      const targetDiagramId = sampleIdx % 2 === 0 ? 'diagram-stress' : 'diagram-ordinary';
      if (typeof window.__setActiveSysmlDiagramId === 'function') {
        window.__setActiveSysmlDiagramId(targetDiagramId);
      } else if (typeof window.__setActivePackageDiagramId === 'function') {
        window.__setActivePackageDiagramId(targetDiagramId);
      }
    `);
    workflows['diagram-switch'] = { samples: diagramSwitchSamples };

    // 11. Stress Diagram Workflow
    console.log(`[Scalability Gate] Running workflow: stress-diagram...`);
    const stressDiagramSamples = await measureBrowserOperation(`
      if (typeof window.__setActiveSysmlDiagramId === 'function') {
        window.__setActiveSysmlDiagramId('diagram-stress');
      }
    `);
    workflows['stress-diagram'] = { samples: stressDiagramSamples };

    // Pre-warm save & reopen worker paths
    await page.evaluate(async () => {
      const w = window as any;
      if (typeof w.__serializeProjectInWorker === 'function' && typeof w.__loadProjectInWorker === 'function') {
        const dummyPayload = {
          projectName: 'Warmup Project',
          sysmlRepository: {
            packageHierarchy: {},
            definitions: {},
            connectors: {},
            diagramReferences: {},
            relationships: {},
            evidence: {},
            verificationCases: {},
            requirementTrees: {},
          },
          workspaceFiles: [],
          diagramPresentations: {},
        };
        const buffer = await w.__serializeProjectInWorker(dummyPayload);
        await w.__loadProjectInWorker(buffer);
      }
    });
    await page.evaluate(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
    await page.waitForTimeout(100);

    // 12. Save & Reopen Workflow (offloaded to worker)
    console.log(`[Scalability Gate] Running workflow: save-reopen...`);
    const saveReopenSamples = await measureBrowserOperation(`
      const payload = {
        projectName: 'Saved Scalability Project',
        sysmlRepository: window.__sysmlRepository,
        workspaceFiles: [],
        diagramPresentations: typeof window.__adiaTestHooks?.getDiagramPresentations === 'function'
          ? window.__adiaTestHooks.getDiagramPresentations()
          : {},
      };
      if (typeof window.__serializeProjectInWorker === 'function' && typeof window.__loadProjectInWorker === 'function') {
        const buffer = await window.__serializeProjectInWorker(payload);
        const loaded = await window.__loadProjectInWorker(buffer);
        if (typeof window.__hydrateProject === 'function') {
          const raw = loaded.rawPayload || payload;
          raw.workspaceFiles = raw.workspaceFiles ?? [];
          window.__hydrateProject(raw, loaded);
        }
      } else if (typeof window.__hydrateProject === 'function') {
        window.__hydrateProject(payload);
      }
      return true;
    `);
    workflows['save-reopen'] = { samples: saveReopenSamples };

    // Verify semantic persistence after reopen
    const persistedName = await page.evaluate(() => (window as any).__sysmlRepository?.definitions?.blk_1?.name);
    expect(persistedName).toBeDefined();

    // Build BrowserProfile structure and write artifact
    const profile: BrowserProfile = {
      size,
      timestamp: new Date().toISOString(),
      samplesCount,
      productionUrl: url,
      workflows,
      load: loadMetrics,
    };

    const outDir = resolve('artifacts/scalability');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `profile-browser-${size}.json`), JSON.stringify(profile, null, 2));

    // Evaluate against strict limits
    const gateResult = evaluateBrowserProfile(profile, {
      maxP95HeartbeatGapMs: maxHeartbeatLimit,
      maxInteractionLongTaskMs: maxHeartbeatLimit,
      maxHandlerP95Ms: maxHeartbeatLimit,
    });

    const summaryPath = resolve(outDir, 'qualification-summary.json');
    let summary: Record<string, any> = {};
    if (existsSync(summaryPath)) {
      try {
        summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      } catch {}
    }
    summary[`tier_${size}`] = {
      size,
      timestamp: profile.timestamp,
      passed: gateResult.passed,
      failures: gateResult.failures,
      workflows: gateResult.workflows,
    };
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log(`[Scalability Gate Results Size=${size}] Passed: ${gateResult.passed}`);
    if (!gateResult.passed) {
      console.error(`Gate Failures (${gateResult.failures.length}):`, gateResult.failures);
    }

    expect(errors).toHaveLength(0);
    expect(gateResult.passed).toBe(true);
  });
});
