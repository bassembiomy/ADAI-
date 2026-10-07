import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WP-40 smoke: the RC benchmark model goes through the app's real project-import path, runs in V-Lab, and the scope
 * ends at the analytical step response  v_C(t) = V (1 - exp(-t / RC))  with V = 10 V, R = 1 kOhm, C = 1 mF, so at t = 5 s
 * v_C = 10 (1 - e^-5) = 9.9326 V (published first-order RC charging solution), within 1 %.
 */
const MODEL = path.resolve(process.cwd(), 'benchmarks/simscape/cases/rc_charging/vlab_model.json');
const STOP_TIME = 5;
const EXPECTED = 10 * (1 - Math.exp(-STOP_TIME));

test('V-Lab: import the RC benchmark, run it, the scope ends at 10(1-e^-5) within 1 %', async ({ page }) => {
  test.setTimeout(180_000);
  const model = JSON.parse(fs.readFileSync(MODEL, 'utf8')) as { nodes: unknown[]; edges: unknown[] };
  const project = Buffer.from(JSON.stringify({ vlabNodes: model.nodes, vlabEdges: model.edges }), 'utf8');

  await page.goto('/?projectName=adia');
  await page.waitForLoadState('domcontentloaded');
  const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
  if (await overlay.count() > 0) {
    await page.keyboard.press('Escape');
    await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  }

  // the app's own open path: input[type=file] -> parse -> validate -> hydrate
  await page.locator('input[type="file"][accept=".adia,.json"]').setInputFiles({ name: 'rc_charging.adia', mimeType: 'application/json', buffer: project });

  // importing a project without a model-format marker shows the "Project upgraded" notice first
  const upgraded = page.getByRole('dialog').getByRole('button', { name: 'Continue' });
  await upgraded.click({ timeout: 15_000 }).catch(() => {});

  // open the imported V-Lab asset: Workspace Asset Manager -> Manage Files -> Main V-Lab -> Open Tab
  await page.getByRole('button', { name: 'Create/Open Workspace Asset File' }).click();
  await page.getByText(/MANAGE FILES/i).click();
  await page.getByRole('row', { name: /Main V-Lab/ }).getByRole('button', { name: 'Open Tab' }).click();
  await page.locator('.fixed.inset-0', { hasText: 'WORKSPACE ASSET MANAGER' }).getByRole('button', { name: '✕' }).click();
  const workspace = page.locator('#vlab-workspace-container');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.vlab-node')).toHaveCount(6, { timeout: 30_000 });

  await workspace.getByPlaceholder('Unlimited').fill(String(STOP_TIME));
  await workspace.getByRole('button', { name: /RUN SIMULATION/ }).click();
  await expect(workspace.getByText(`Simulation reached limit of ${STOP_TIME}s.`)).toBeVisible({ timeout: 120_000 });
  await expect(workspace.getByTestId('vlab-diagnostics-panel')).toHaveCount(0);

  // open the scope window and its statistics: the charging curve is monotone, so its maximum is the final value
  // (the benchmark places every block at the origin, so the node is addressed by id rather than by a pointer position)
  await workspace.getByTestId('rf__node-scope').dispatchEvent('dblclick');
  await page.getByRole('button', { name: 'Stats' }).click();
  const max = page.getByTestId('scope-stat-max').first();
  await expect(max).toBeVisible();
  const final = Number(await max.getAttribute('data-value'));
  expect(Math.abs(final - EXPECTED) / EXPECTED).toBeLessThan(0.01);
});
