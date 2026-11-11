/**
 * V8 end-to-end, spec 9: responsiveness smoke on a 300-block chain. The chain is built through the stored project
 * JSON (Gain template taken from a block dropped in the UI and saved), opened with the toolbar Open button, then
 * panned and a block dragged while a PerformanceObserver records long tasks. Reported: the maximum long task;
 * the test fails only above 1 s (plan section 6: freeze-gate budgets live in tests/performance).
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { useLocalChromium, openXbridges, dropBlock, saveProject, openProjectFile, dragNodeBy } from './xbHelpers';

useLocalChromium();

const CHAIN = 300;

test('300-block chain: pan and block drag produce no long task above 1 s (max is reported)', async ({ page }) => {
  test.setTimeout(240_000);
  page.on('dialog', d => d.accept());
  await openXbridges(page);
  await dropBlock(page, 'Gain', 'ELEMENT-WISE MATH');
  await page.waitForTimeout(800);
  const saved = await saveProject(page);
  const template = saved.globalXBridgesNodes[0];
  expect(template.data.type).toBe('GAIN');

  const nodes = Array.from({ length: CHAIN }, (_, i) => ({
    ...template,
    id: `chain-${i}`,
    position: { x: (i % 20) * 260, y: Math.floor(i / 20) * 200 },
    selected: false, dragging: false,
    data: { ...template.data, id: `chain-${i}`, parentId: 'root', selected: false },
  }));
  const edges = nodes.slice(1).map((n, i) => ({
    id: `e-${i}`, source: nodes[i].id, sourceHandle: 'y', target: n.id, targetHandle: 'u',
    type: 'smoothstep', animated: false, style: { stroke: '#4caf50', strokeWidth: 3 },
  }));
  const project = JSON.parse(JSON.stringify(saved));
  project.globalXBridgesNodes = nodes;
  project.globalXBridgesEdges = edges;
  for (const f of project.workspaceFiles) {
    if (f.type === 'xbridges') f.data = { globalXBridgesNodes: nodes, globalXBridgesEdges: edges };
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xbv-chain-')), 'chain300.adia');
  fs.writeFileSync(file, JSON.stringify(project));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openXbridges(page, false);
  await openProjectFile(page, file);
  await page.getByText('Main X-Bridges', { exact: true }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as any).__buildUnifiedProjectPayload().globalXBridgesNodes.length)).toBe(CHAIN);

  await page.evaluate(() => {
    (window as any).__xbvLongTasks = [];
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) (window as any).__xbvLongTasks.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  });

  // pan: drag on an empty pane spot with the mouse
  const pane = page.locator('.react-flow__pane');
  const box = (await pane.boundingBox())!;
  const x0 = box.x + box.width / 2, y0 = box.y + box.height - 40;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(x0 - i * 10, y0 - i * 3);
  await page.mouse.up();
  // wheel zoom
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  // drag one visible block
  const visible = page.locator('.react-flow__node').first();
  const id = (await visible.getAttribute('data-id'))!;
  await dragNodeBy(page, id, 120, 60);
  await page.waitForTimeout(1500);

  const tasks: number[] = await page.evaluate(() => (window as any).__xbvLongTasks);
  const max = tasks.length ? Math.max(...tasks) : 0;
  test.info().annotations.push({ type: 'max-long-task-ms', description: String(Math.round(max)) });
  console.log(`XBV responsiveness: ${tasks.length} long tasks, max ${Math.round(max)} ms (blocks: ${CHAIN})`);
  expect(max).toBeLessThanOrEqual(1000);
});
