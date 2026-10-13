import { test, expect } from '@playwright/test';

test('debug vlab and xbridges in light and dark mode', async ({ page }) => {
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    pageErrors.push(err.toString() + '\n' + (err.stack || ''));
  });

  await page.goto('/?projectName=adia');
  await page.waitForLoadState('domcontentloaded');

  const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
  if (await overlay.count() > 0) {
    await page.keyboard.press('Escape');
    await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  let currentTheme: string | undefined;
  console.log('--- Initial Dark Mode ---');
  let info = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      className: root.className,
      dataTheme: root.getAttribute('data-theme'),
      surfaceCanvas: window.getComputedStyle(root).getPropertyValue('--surface-canvas'),
      bodyClass: document.body.className,
      themeContractRules: Array.from(document.styleSheets).flatMap(s => {
        try {
          return Array.from(s.cssRules).filter(r => r.cssText && r.cssText.includes('--surface-canvas')).map(r => r.cssText);
        } catch { return []; }
      })
    };
  });
  console.log('Root element info:', JSON.stringify(info, null, 2));

  // Check X-Bridges in Dark Mode
  console.log('--- Switching to X-Bridges (Dark Mode) ---');
  await page.getByRole('banner').getByRole('button', { name: 'X-Bridges', exact: true }).click();
  await page.waitForTimeout(500);

  let xbBg = await page.evaluate(() => {
    const el = document.querySelector('#xbridges-workspace-container') || document.querySelector('.xbridges-workspace');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('X-Bridges container background (dark mode):', xbBg);

  let rfBgXB = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__background');
    if (!el) return 'not found';

    // Inspect ancestors
    const chain: any[] = [];
    let curr: HTMLElement | null = el as HTMLElement;
    while (curr) {
      chain.push({
        tagName: curr.tagName,
        id: curr.id,
        className: curr.className,
        computedBg: window.getComputedStyle(curr).backgroundColor,
        surfaceCanvas: window.getComputedStyle(curr).getPropertyValue('--surface-canvas')
      });
      curr = curr.parentElement;
    }

    return {
      computedBg: window.getComputedStyle(el).backgroundColor,
      surfaceCanvasOnEl: window.getComputedStyle(el).getPropertyValue('--surface-canvas'),
      chain
    };
  });
  console.log('ReactFlow background analysis in X-Bridges (dark mode):', JSON.stringify(rfBgXB, null, 2));

  // Check V-Lab in Dark Mode
  console.log('--- Switching to V-Lab (Dark Mode) ---');
  await page.getByRole('banner').getByRole('button', { name: 'V-Lab', exact: true }).click();
  await page.waitForTimeout(500);

  let vlabBg = await page.evaluate(() => {
    const el = document.querySelector('#vlab-workspace-container') || document.querySelector('.vlab-workspace');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('V-Lab container background (dark mode):', vlabBg);

  let rfBgVLab = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__background');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('ReactFlow background in V-Lab (dark mode):', rfBgVLab);

  // Toggle to Light Mode via the UI button
  console.log('--- Toggling to Light Mode via button ---');
  const themeToggleBtn = page.locator('#adia-theme-toggle-btn');
  await themeToggleBtn.click();
  await page.waitForTimeout(500);

  currentTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log('Document theme after toggle:', currentTheme);

  // Check V-Lab in Light Mode
  let vlabBgLight = await page.evaluate(() => {
    const el = document.querySelector('#vlab-workspace-container') || document.querySelector('.vlab-workspace');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('V-Lab container background (light mode):', vlabBgLight);

  let rfBgVLabLight = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__background');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('ReactFlow background in V-Lab (light mode):', rfBgVLabLight);

  // Check X-Bridges in Light Mode
  console.log('--- Switching to X-Bridges (Light Mode) ---');
  await page.getByRole('banner').getByRole('button', { name: 'X-Bridges', exact: true }).click();
  await page.waitForTimeout(500);

  let xbBgLight = await page.evaluate(() => {
    const el = document.querySelector('#xbridges-workspace-container') || document.querySelector('.xbridges-workspace');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('X-Bridges container background (light mode):', xbBgLight);

  let rfBgXBLight = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__background');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('ReactFlow background in X-Bridges (light mode):', rfBgXBLight);

  // Toggle back to Dark Mode
  console.log('--- Toggling back to Dark Mode via button ---');
  await themeToggleBtn.click();
  await page.waitForTimeout(500);

  currentTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log('Document theme after toggle back to dark:', currentTheme);

  let xbBgDarkAgain = await page.evaluate(() => {
    const el = document.querySelector('#xbridges-workspace-container') || document.querySelector('.xbridges-workspace');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('X-Bridges container background (dark mode again):', xbBgDarkAgain);

  let rfBgXBDarkAgain = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__background');
    return el ? window.getComputedStyle(el).backgroundColor : 'not found';
  });
  console.log('ReactFlow background in X-Bridges (dark mode again):', rfBgXBDarkAgain);

  console.log('--- SUMMARY OF PAGE ERRORS ---');
  console.log(JSON.stringify(pageErrors, null, 2));

  console.log('--- SUMMARY OF ERROR CONSOLE LOGS ---');
  const errorLogs = consoleLogs.filter(l => l.startsWith('[error]') || l.includes('Error') || l.includes('Warning'));
  console.log(JSON.stringify(errorLogs, null, 2));
});
