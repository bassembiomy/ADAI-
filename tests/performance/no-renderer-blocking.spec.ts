import { test, expect, type Page } from '@playwright/test';
import type { FreezeWorkload } from './freeze-workloads';

test.describe('Freeze Prevention & Non-Blocking Renderer Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?projectName=perf-gate');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss welcome overlay using stable test ID
    const intro = page.getByTestId('welcome-overlay');
    if (await intro.isVisible().catch(() => false)) {
      await intro.click();
      await expect(intro).toBeHidden();
    }
  });

  test('freeze gate suite is loaded from the performance test directory', async ({ page }) => {
    // Assert the workload registry is mounted — not just a non-empty title
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).__adia_freeze_workloads), { timeout: 10000 })
      .toBe('object');
  });

  async function assertHeartbeatDuringWorkload(page: Page, workload: FreezeWorkload) {
    // Ensure the page bundle and freeze workloads are mounted
    await page.waitForFunction(() => Boolean((window as any).__adia_freeze_workloads), { timeout: 10000 });

    // Execute workload while recording heartbeat strictly during workload execution
    const stats = await page.evaluate(async (w: string) => {
      const workloads = (window as any).__adia_freeze_workloads;
      if (!workloads || typeof workloads[w] !== 'function') {
        throw new Error(`Freeze workload handler not registered for module: ${w}`);
      }

      // Separate timestamp arrays for interval and rAF monitors
      const intervalTimestamps: number[] = [];
      const rafTimestamps: number[] = [];
      let running = true;

      const rafLoop = () => {
        if (!running) return;
        rafTimestamps.push(performance.now());
        requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);

      const intervalId = setInterval(() => {
        intervalTimestamps.push(performance.now());
      }, 16);

      // Record workload start immediately before execution
      const workloadStart = performance.now();
      let result: any;
      try {
        result = await workloads[w]();
      } finally {
        const workloadEnd = performance.now();
        running = false;
        clearInterval(intervalId);

        // Filter timestamps to only [workloadStart, workloadEnd] — no warm-up ticks
        const activeIntervalTs = intervalTimestamps.filter(t => t >= workloadStart && t <= workloadEnd);
        const activeRafTs = rafTimestamps.filter(t => t >= workloadStart && t <= workloadEnd);

        // Compute max gaps from active-workload timestamps only
        const computeMaxGap = (ts: number[]) => {
          let maxGap = 0;
          for (let i = 1; i < ts.length; i++) {
            const gap = ts[i] - ts[i - 1];
            if (gap > maxGap) maxGap = gap;
          }
          return maxGap;
        };

        // Record completion marker
        (window as any).__adia_workload_markers = (window as any).__adia_workload_markers || [];
        (window as any).__adia_workload_markers.push({
          workload: w,
          status: 'completed',
          timestamp: workloadEnd,
          result,
        });

        return {
          workloadDuration: workloadEnd - workloadStart,
          intervalTicks: activeIntervalTs.length,
          rafTicks: activeRafTs.length,
          maxIntervalGap: computeMaxGap(activeIntervalTs),
          maxRafGap: computeMaxGap(activeRafTs),
          result,
        };
      }
    }, workload);

    // Verify workload completed marker
    const markers = await page.evaluate(() => (window as any).__adia_workload_markers || []);
    const completed = markers.some((m: any) => m.workload === workload && m.status === 'completed');
    expect(completed, `Workload ${workload} must produce a completed marker`).toBe(true);

    // Truthful heartbeat asserts: ticks measured strictly during workload execution
    expect(stats.intervalTicks, `Interval ticks during ${workload}`).toBeGreaterThanOrEqual(2);
    expect(stats.rafTicks, `rAF ticks during ${workload}`).toBeGreaterThanOrEqual(2);
    expect(stats.maxIntervalGap, `Max interval gap during ${workload} must remain under 150ms`).toBeLessThan(150);
    expect(stats.maxRafGap, `Max rAF gap during ${workload} must remain under 150ms`).toBeLessThan(150);

    // Result-contract validation: each workload must return its key and operation count
    expect(stats.result, `${workload} must return workload key`).toMatchObject({ workload });
    expect(stats.result.operations, `${workload} must perform real operations`).toBeGreaterThan(0);
  }

  test('VLAB simulation execution does not lock the renderer', async ({ page }) => {
    await assertHeartbeatDuringWorkload(page, 'vlab');
  });

  test('X-Bridges simulation execution does not lock the renderer', async ({ page }) => {
    await assertHeartbeatDuringWorkload(page, 'xbridges');
  });

  test('SysML validation and matrix paths remain responsive', async ({ page }) => {
    await assertHeartbeatDuringWorkload(page, 'sysml');
  });

  test('DOE and optimization solver dispatch does not halt UI events', async ({ page }) => {
    await assertHeartbeatDuringWorkload(page, 'doe');
  });

  test('HIL telemetry streaming preserves UI responsiveness via batching buffer', async ({ page }) => {
    await assertHeartbeatDuringWorkload(page, 'hil');
  });
});
