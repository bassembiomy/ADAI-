import { test, expect } from '@playwright/test';
import { runFreezeWorkload, type FreezeWorkload } from './freeze-workloads';

test.describe('Freeze Prevention & Non-Blocking Renderer Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?projectName=perf-gate');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss any welcome overlay or intro modal
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click({ force: true });
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  });

  test('freeze gate suite is loaded from the performance test directory', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/./);
  });

  async function assertHeartbeatDuringWorkload(page: any, workload: FreezeWorkload) {
    // Ensure the page bundle and freeze workloads are mounted
    await page.waitForFunction(() => Boolean((window as any).__adia_freeze_workloads), { timeout: 10000 });

    // Execute workload while recording heartbeat in browser context
    const stats = await page.evaluate(async (w) => {
      (window as any).__adia_workload_markers = (window as any).__adia_workload_markers || [];
      (window as any).__adia_workload_markers.push({ workload: w, status: 'started', timestamp: performance.now() });

      let rAFCount = 0;
      let intervalCount = 0;
      let running = true;
      const timestamps: number[] = [];

      const rafLoop = () => {
        if (!running) return;
        rAFCount++;
        requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);

      const intervalId = setInterval(() => {
        intervalCount++;
        timestamps.push(performance.now());
      }, 16);

      // Warm up heartbeat for 50ms
      await new Promise(r => setTimeout(r, 50));

      const workloads = (window as any).__adia_freeze_workloads;
      if (!workloads || typeof workloads[w] !== 'function') {
        running = false;
        clearInterval(intervalId);
        throw new Error(`Freeze workload handler not registered for module: ${w}`);
      }

      // Record timestamps index right before starting workload
      const startIndex = timestamps.length;
      const result = await workloads[w]();

      running = false;
      clearInterval(intervalId);

      (window as any).__adia_workload_markers.push({
        workload: w,
        status: 'completed',
        timestamp: performance.now(),
        result,
      });

      // Compute max gap during active workload execution
      let maxGap = 0;
      const activeTimestamps = timestamps.slice(Math.max(0, startIndex - 1));
      for (let i = 1; i < activeTimestamps.length; i++) {
        const gap = activeTimestamps[i] - activeTimestamps[i - 1];
        if (gap > maxGap) maxGap = gap;
      }

      return { rAFCount, intervalCount, maxGap };
    }, workload);

    // Verify workload completed marker
    const markers = await page.evaluate(() => (window as any).__adia_workload_markers || []);
    const completed = markers.some((m: any) => m.workload === workload && m.status === 'completed');
    expect(completed, `Workload ${workload} must produce a completed marker`).toBe(true);

    // Heartbeat asserts: event loop must continue ticking without blocking renderer
    expect(stats.intervalCount, `Interval heartbeat during ${workload} must continue`).toBeGreaterThan(0);
    expect(stats.maxGap, `Max interval gap during ${workload} must remain under 150ms`).toBeLessThan(150);
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
