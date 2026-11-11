/**
 * V8 end-to-end, spec 7: every entry of the solver menu is selectable and runs Constant 2 -> Integrator -> Scope.
 * Oracle: y(t) = 2 t (closed form). The linear ramp is integrated exactly by every explicit Runge-Kutta order >= 1,
 * so euler and rk4 must hit it within 1e-9; the others within 1e-6 (adaptive and implicit methods).
 */
import { test, expect } from '@playwright/test';
import {
  useLocalChromium, trackErrors, openXbridges, buildIntegratorModel, setToolbar, runToEnd, scopeSamples,
  problemsSummary, statusText,
} from './xbHelpers';

useLocalChromium();

const SOLVERS: Array<{ value: string; tol: number }> = [
  { value: 'rk4', tol: 1e-9 },
  { value: 'euler', tol: 1e-9 },
  { value: 'ode2', tol: 1e-6 },
  { value: 'ode3', tol: 1e-6 },
  { value: 'ode5', tol: 1e-6 },
  { value: 'ode23', tol: 1e-6 },
  { value: 'ode45', tol: 1e-6 },
  { value: 'ode14x', tol: 1e-6 },
  { value: 'ode23tb', tol: 1e-6 },
];

test.describe('X-Bridges solver selector', () => {
  test.setTimeout(300_000);

  test('the menu offers exactly the 10 documented solvers (discrete included)', async ({ page }) => {
    await openXbridges(page);
    const values = await page.locator('select').filter({ has: page.locator('option[value="ode14x"]') })
      .locator('option').evaluateAll(o => o.map(x => (x as HTMLOptionElement).value));
    expect(values.sort()).toEqual([...SOLVERS.map(s => s.value), 'discrete'].sort());
  });

  test('each of the 9 continuous solvers runs the model of 2 without error and reproduces 2 t', async ({ page }) => {
    const log = trackErrors(page);
    await openXbridges(page);
    const m = await buildIntegratorModel(page, '2');
    const results: Record<string, string> = {};
    for (const { value, tol } of SOLVERS) {
      await setToolbar(page, { solver: value, start: 0, stop: 1, step: 0.01 });
      await runToEnd(page, 90_000);
      const problems = await problemsSummary(page);
      let verdict = 'ok';
      if (problems !== 'No problems') verdict = `problems: ${problems} | ${await statusText(page)}`;
      else {
        const samples = await scopeSamples(page, m.scope);
        const worst = Math.max(...samples.map(([t, y]) => Math.abs(y - 2 * t)));
        if (!(samples.length > 1)) verdict = 'no samples';
        else if (!Number.isFinite(worst) || worst > tol) verdict = `max |y - 2t| = ${worst} > ${tol}`;
      }
      results[value] = verdict;
    }
    expect(results).toEqual(Object.fromEntries(SOLVERS.map(s => [s.value, 'ok'])));
    expect(log.errors).toEqual([]);
  });

  // Simulink: the fixed-step discrete solver cannot simulate a model with continuous states (the Integrator), so the
  // run is refused with an error before any step is taken.
  test('discrete solver with a continuous Integrator is refused with a diagnostic naming the continuous state', async ({ page }) => {
    await openXbridges(page);
    await buildIntegratorModel(page, '2');
    await setToolbar(page, { solver: 'discrete', start: 0, stop: 1, step: 0.01 });
    await runToEnd(page, 30_000);
    expect(await statusText(page)).toContain('Failed');
    expect(await problemsSummary(page)).toBe('1 error');
    await page.getByRole('button', { name: /Problems:/ }).click();
    await expect(page.getByRole('list', { name: 'Problems' })).toContainText(/continuous/i);
  });
});
