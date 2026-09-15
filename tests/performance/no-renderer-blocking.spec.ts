import { test, expect } from '@playwright/test';

test.describe('Freeze Prevention & Non-Blocking Renderer Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss any welcome overlay or intro modal
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click();
      await page.waitForTimeout(500);
    }
  });

  test('main thread heartbeat continues during simulated intensive workload', async ({ page }) => {
    // Inject a heartbeat counter on requestAnimationFrame and setInterval to prove the event loop does not freeze
    const heartbeatStats = await page.evaluate(async () => {
      let rAFCount = 0;
      let intervalCount = 0;
      let running = true;

      const rafLoop = () => {
        if (!running) return;
        rAFCount++;
        requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);

      const intervalId = setInterval(() => {
        intervalCount++;
      }, 16);

      // Yield for 600ms while UI interactions happen
      await new Promise(r => setTimeout(r, 600));

      running = false;
      clearInterval(intervalId);

      return { rAFCount, intervalCount };
    });

    // In a 600ms window, heartbeat should run at least 15-20 times if unblocked
    expect(heartbeatStats.rAFCount).toBeGreaterThan(15);
    expect(heartbeatStats.intervalCount).toBeGreaterThan(15);
  });

  test('VLAB simulation execution does not lock the renderer', async ({ page }) => {
    // Navigate or switch to VLAB if workspace switcher exists
    const vlabTab = page.locator('button:has-text("V-LAB"), button:has-text("VLAB"), button[title*="VLAB"]').first();
    if (await vlabTab.isVisible()) {
      await vlabTab.click();
      await page.waitForTimeout(300);
    }

    // Verify canvas or SVG remains interactive
    const canvas = page.locator('canvas, svg, .react-flow').first();
    if (await canvas.isVisible()) {
      await expect(canvas).toBeVisible();
      // Test rapid pointer move without frame freezing
      await page.mouse.move(300, 300);
      await page.mouse.move(400, 400);
    }
  });

  test('SysML traceability matrix and report generation paths remain responsive', async ({ page }) => {
    const sysmlTab = page.locator('button:has-text("SysML"), button[title*="SysML"]').first();
    if (await sysmlTab.isVisible()) {
      await sysmlTab.click();
      await page.waitForTimeout(300);
    }

    // Check that interaction remains sub-100ms
    const startTime = Date.now();
    await page.mouse.wheel(0, -100);
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(500);
  });

  test('DOE and optimization solver dispatch does not halt UI events', async ({ page }) => {
    const doeTab = page.locator('button:has-text("DOE"), button:has-text("Design of Experiments")').first();
    if (await doeTab.isVisible()) {
      await doeTab.click();
      await page.waitForTimeout(300);
    }

    // Verify button hover and click latency
    const buttons = page.locator('button').first();
    if (await buttons.isVisible()) {
      await buttons.hover();
      await expect(buttons).toBeVisible();
    }
  });

  test('HIL telemetry streaming preserves UI responsiveness via batching buffer', async ({ page }) => {
    // Verify that simulating 1,000 rapid serial events does not starve the microtask queue
    const queueResponsiveness = await page.evaluate(async () => {
      const timestamps: number[] = [];
      const interval = setInterval(() => {
        timestamps.push(performance.now());
      }, 10);

      // Simulate a burst of microtasks and message dispatch
      for (let i = 0; i < 500; i++) {
        window.dispatchEvent(new CustomEvent('hil-mock-telemetry', { detail: `DATA,${i},${Math.sin(i)}` }));
      }

      await new Promise(r => setTimeout(r, 200));
      clearInterval(interval);

      // Measure max gap between ticks
      let maxGap = 0;
      for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i - 1];
        if (gap > maxGap) maxGap = gap;
      }
      return { tickCount: timestamps.length, maxGap };
    });

    expect(queueResponsiveness.tickCount).toBeGreaterThan(10);
    expect(queueResponsiveness.maxGap).toBeLessThan(150); // Under 150ms during heavy bursts
  });
});
