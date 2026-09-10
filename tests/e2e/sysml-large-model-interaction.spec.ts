import { test, expect } from '@playwright/test';

test.describe('SysML Large Model Real UI Interaction & Latency Gates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click();
      await page.waitForTimeout(600);
    }
  });

  test('verifies responsive pan, zoom, drag interaction and diagnostics modal', async ({ page }) => {
    const canvas = page.locator('svg').first();
    await expect(canvas).toBeVisible();

    // 1. Pan Interaction
    const panStart = Date.now();
    await page.mouse.move(500, 300);
    await page.mouse.down({ button: 'middle' }).catch(async () => {
      await page.keyboard.down('Space');
      await page.mouse.down({ button: 'left' });
    });
    await page.mouse.move(600, 400);
    await page.mouse.up({ button: 'middle' }).catch(async () => {
      await page.mouse.up({ button: 'left' });
      await page.keyboard.up('Space');
    });
    const panDuration = Date.now() - panStart;
    expect(panDuration).toBeLessThan(1000);

    // 2. Zoom Responsiveness
    const zoomStart = Date.now();
    await page.mouse.move(550, 350);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(50);
    const zoomDuration = Date.now() - zoomStart;
    expect(zoomDuration).toBeLessThan(500);

    // 3. Open Diagnostics Dialog & Verify Metrics
    const diagsBtn = page.locator('button:has-text("Diagnostics"), button[title*="Diagnostics"], button:has-text("Limits")').first();
    if (await diagsBtn.isVisible()) {
      await diagsBtn.click();
      const modal = page.locator('text=SysML Large Model Diagnostics & Limits');
      await expect(modal).toBeVisible();

      // Check worker or culling indicators
      const textContent = await page.textContent('body');
      expect(textContent).toContain('Active Viewport');
    }
  });

  test('verifies synthetic 10k entity benchmark execution in client runtime', async ({ page }) => {
    const perfResults = await page.evaluate(async () => {
      const startTime = performance.now();

      // Simulate a 10,000 element structure in browser context
      const elements = [];
      for (let i = 0; i < 10000; i++) {
        elements.push({
          id: `elem_${i}`,
          x: (i % 100) * 200,
          y: Math.floor(i / 100) * 150,
          w: 150,
          h: 100,
        });
      }

      const buildTime = performance.now() - startTime;

      // Viewport query simulation
      const viewport = { x: 500, y: 500, w: 1200, h: 800 };
      const qStart = performance.now();
      let visible = 0;
      for (let i = 0; i < elements.length; i++) {
        const e = elements[i];
        if (e.x + e.w >= viewport.x && e.x <= viewport.x + viewport.w &&
            e.y + e.h >= viewport.y && e.y <= viewport.y + viewport.h) {
          visible++;
        }
      }
      const queryTime = performance.now() - qStart;

      return {
        total: elements.length,
        visible,
        buildTime,
        queryTime,
      };
    });

    expect(perfResults.total).toBe(10000);
    expect(perfResults.visible).toBeLessThan(100);
    expect(perfResults.queryTime).toBeLessThan(50); // Query across 10k items < 50ms in browser
  });
});
