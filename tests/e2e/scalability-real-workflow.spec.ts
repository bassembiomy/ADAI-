import { test, expect } from '@playwright/test';
import { generateScalabilityFixture } from '../../src/engine/sysml/largeModelGenerator';
import {
  createSysmlGatewayState,
  buildCanonicalSysmlProjectPayload,
} from '../../src/services/sysmlCommandGateway';

// This Playwright spec runs against the development server to verify end-to-end functionality.
// Production performance qualification is measured separately via scripts/scalability/profileBrowser.ts.
test.describe('Scalability Real-Workflow Functional Verification (Development Server)', () => {
  test('imports real 1k fixture, renders diagram & tree, executes commands, measures heartbeat and long tasks', async ({
    page,
  }) => {
    // 1. Generate deterministic fixture and project file payload
    const fixture = generateScalabilityFixture({
      semanticCount: 1_000,
      seed: 42,
      topology: 'distributed',
    });

    const gatewayState = createSysmlGatewayState(
      fixture.repository,
      fixture.coordinates,
      fixture.diagramPresentations
    );

    const payload = buildCanonicalSysmlProjectPayload(gatewayState, {
      version: '1.0',
      projectName: 'Scalability-Real-Workflow-1k',
      diagramWorkspace: {
        tabs: [
          { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
          { kind: 'sysmlDiagram', diagramId: 'diagram-stress' },
        ],
        activeTab: { kind: 'sysmlDiagram', diagramId: 'diagram-ordinary' },
      },
      stateMachine: fixture.stateMachine,
    });

    const projectFileBuffer = Buffer.from(JSON.stringify(payload, null, 2));

    // 2. Open application page
    await page.goto('/?projectName=scalability-e2e', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).__sysmlExecuteCommand === 'function');

    const overlay = page.getByTestId('welcome-overlay');
    if (await overlay.isVisible()) {
      await overlay.click({ force: true });
      await overlay.waitFor({ state: 'hidden' });
    }

    // 3. Set up heartbeat timer & Long Tasks performance observer
    await page.evaluate(() => {
      const w = window as any;
      w.__scalabilityTicks = [performance.now()];
      w.__scalabilityLongTasks = [];
      w.__scalabilityTimer = setInterval(() => {
        w.__scalabilityTicks.push(performance.now());
      }, 16);

      try {
        w.__scalabilityObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            w.__scalabilityLongTasks.push({
              start: entry.startTime,
              duration: entry.duration,
            });
          }
        });
        w.__scalabilityObserver.observe({ type: 'longtask', buffered: false });
      } catch {
        // Fallback if longtask observer not supported
      }
      w.__scalabilityImportStart = performance.now();
    });

    // 4. Import the real file through input[type="file"]
    const fileInput = page.locator('input[type="file"][accept=".adia,.json"]');
    await fileInput.setInputFiles({
      name: 'scalability-1k.adia',
      mimeType: 'application/json',
      buffer: projectFileBuffer,
    });

    // 5. Wait for the repository definitions to load
    const expectedDefsCount = Object.keys(fixture.repository.definitions).length;
    await page.waitForFunction(
      (expected) => Object.keys((window as any).__sysmlRepository?.definitions ?? {}).length === expected,
      expectedDefsCount
    );

    // Wait 2 animation frames to settle paint
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );

    // 6. Inspect view, active diagram, presented elements, and DOM rows
    const viewMetrics = await page.evaluate(() => {
      const hooks = (window as any).__adiaTestHooks;
      const activeDiagramId = hooks?.getActiveDiagramId();
      const presentations = hooks?.getDiagramPresentations();
      const activePres = presentations?.[activeDiagramId];

      const w = window as any;
      const importEnd = performance.now();
      const ticks = [...(w.__scalabilityTicks || []), importEnd];
      const maxGap = Math.max(...ticks.slice(1).map((v: number, i: number) => v - ticks[i]));

      return {
        activeDiagramId,
        diagramMode: hooks?.getDiagramMode(),
        presentedElements: activePres?.elementIds?.length ?? 0,
        treeDomRows: document.querySelectorAll('.model-tree-row').length,
        importDurationMs: importEnd - (w.__scalabilityImportStart || importEnd),
        maxHeartbeatGapMs: maxGap,
        longTasksCount: w.__scalabilityLongTasks?.length ?? 0,
      };
    });

    expect(viewMetrics.activeDiagramId).toBe('diagram-ordinary');
    expect(viewMetrics.presentedElements).toBeGreaterThanOrEqual(100);
    expect(viewMetrics.presentedElements).toBeLessThanOrEqual(500);

    // Tree virtualization assertion: visible DOM rows must stay bounded (not all 1k elements mounted)
    expect(viewMetrics.treeDomRows).toBeLessThan(100);

    // 7. Execute real command via __sysmlExecuteCommand and measure heartbeat gap
    const editMetrics = await page.evaluate(async () => {
      const w = window as any;
      w.__scalabilityTicks = [performance.now()];
      w.__scalabilityLongTasks = [];

      const start = performance.now();
      const result = w.__sysmlExecuteCommand({
        type: 'updateElement',
        elementId: 'blk_1',
        patch: { name: 'Block_1_E2E_Renamed' },
      });
      const handlerMs = performance.now() - start;

      // Allow microtasks & 2 rAFs for paint
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      const end = performance.now();
      const ticks = [...w.__scalabilityTicks, end];
      const maxHeartbeatGapMs = Math.max(...ticks.slice(1).map((v: number, i: number) => v - ticks[i]));

      const def = w.__sysmlRepository?.definitions?.['blk_1'];
      return {
        committed: result?.committed,
        renamedTo: def?.name,
        handlerMs,
        settleMs: end - start,
        maxHeartbeatGapMs,
        longTasks: w.__scalabilityLongTasks,
      };
    });

    expect(editMetrics.committed).toBe(true);
    expect(editMetrics.renamedTo).toBe('Block_1_E2E_Renamed');

    // 8. Test undo command
    const undoMetrics = await page.evaluate(async () => {
      const w = window as any;
      const res = w.__sysmlExecuteCommand({ type: 'undo' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const def = w.__sysmlRepository?.definitions?.['blk_1'];
      return { committed: res?.committed, restoredName: def?.name };
    });

    expect(undoMetrics.committed).toBe(true);
    expect(undoMetrics.restoredName).toBe('Block_1');

    console.log('[E2E Scalability Result]:', {
      viewMetrics,
      editMetrics: {
        handlerMs: editMetrics.handlerMs,
        settleMs: editMetrics.settleMs,
        maxHeartbeatGapMs: editMetrics.maxHeartbeatGapMs,
        longTasksCount: editMetrics.longTasks.length,
      },
    });
  });
});
