/**
 * WP-13 — diagnostics closure (plan section 5.2 "Diagnostics").
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * Every `code: '...'` literal the engine sources can emit must have a recipe in
 * src/engine/xbridges/testkit/diagnosticRecipes.ts that (a) provokes it with the stated severity and (b) has a clean
 * variant of the same model that does not emit it. An error stops the run (fewer major steps than planned, usually
 * none); a warning or info does not.
 *
 * The expected severity of each code is fixed here by the controller (Simulink behaviour, decisions D1-D3), not taken
 * from the recipe. Codes whose current severity differs from the decision are pinned with it.fails.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_RECIPES } from '../testkit/diagnosticRecipes';

const ENGINE_DIR = join(__dirname, '..');
const engineCodes = [...new Set(readdirSync(ENGINE_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .flatMap((f) => [...readFileSync(join(ENGINE_DIR, f), 'utf8').matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1])))].sort();

/** Expected severity per code (controller). D1: dimension and data-type mismatches on a connection are errors. */
const EXPECTED: Record<string, 'error' | 'warning' | 'info'> = {
  ALGEBRAIC_LOOP: 'warning',
  ALGEBRAIC_LOOP_NOT_CONVERGED: 'error',
  BLOCK_RUNTIME_FAULT: 'error',
  CONTINUOUS_STATES_WITH_DISCRETE_SOLVER: 'error',
  DATA_TYPE_MISMATCH: 'error',
  DIMENSION_MISMATCH: 'error',
  DISCRETE_BLOCK_CONTINUOUS_SAMPLE_TIME: 'error',
  DIVIDE_BY_ZERO: 'warning',
  EXECUTION_EXCEPTION: 'error',
  FIXED_STEP_INVALID: 'error',
  FRAME_INCONSISTENCY: 'warning',
  INVALID_GMDH_LAYERS: 'error',
  INVALID_SAMPLE_TIME: 'error',
  INVALID_TAGUCHI_LEVELS: 'error',
  LOGIC_NAN_INPUT: 'error',
  MATH_DOMAIN_ERROR: 'warning',
  MISSING_FIS_CONFIG: 'error',
  NON_FINITE_INPUT: 'warning',
  NO_MODEL_CONFIGURED: 'error',
  NUMERICAL_INSTABILITY: 'warning',
  PARAMETER_EMPTY: 'error',
  PARAMETER_INVALID: 'error',
  PARAMETER_NOT_INTEGER: 'error',
  PARAMETER_OPTION_INVALID: 'error',
  PARAMETER_OUT_OF_RANGE: 'error',
  RATE_TRANSITION_REQUIRED: 'warning',
  SAMPLE_RATE_MISMATCH: 'warning',
  SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP: 'error',
  SIGNAL_TYPE_MISMATCH: 'warning',
  START_TIME_INVALID: 'error',
  STOP_TIME_BEFORE_START: 'error',
  STOP_TIME_INFINITE_BATCH: 'error',
  UNCONNECTED_INPUT_PORT: 'warning',
  UNCONNECTED_OUTPUT_PORT: 'warning',
  UNIT_INCONSISTENCY: 'warning',
  UNSUPPORTED_SOLVER: 'error',
};
/** Codes whose current severity contradicts a decision; each must turn red when fixed (then move out of this set). */
const PINNED_SEVERITY: Record<string, string> = {
  DIMENSION_MISMATCH: 'XBV-029 (decision D1)',
  DATA_TYPE_MISMATCH: 'XBV-029 (decision D1)',
};

describe('diagnostics closure', () => {
  it('the engine emits exactly the codes the controller has a severity for (a new code needs a decision)', () => {
    expect(engineCodes).toEqual(Object.keys(EXPECTED).sort());
  });

  it('every engine code has a recipe', () => {
    expect(engineCodes.filter((c) => !DIAGNOSTIC_RECIPES[c])).toEqual([]);
  });

  for (const code of Object.keys(EXPECTED).sort()) {
    const severity = EXPECTED[code];
    const body = () => {
      const recipe = DIAGNOSTIC_RECIPES[code];
      expect(recipe, `recipe for ${code}`).toBeDefined();
      const provoked = recipe.provoke();
      const hits = provoked.diagnostics.filter((d) => d.code === code);
      expect(hits.length, `${code} provoked`).toBeGreaterThan(0);
      expect(hits.every((d) => d.severity === severity), `${code} severity ${hits.map((d) => d.severity)}`).toBe(true);
      if (severity === 'error') expect(provoked.steps, `${code} must stop the run`).toBeLessThan(provoked.plannedSteps);
      else expect(provoked.steps, `${code} must not stop the run`).toBe(provoked.plannedSteps);
      const clean = recipe.clean();
      expect(clean.diagnostics.map((d) => d.code), `${code} clean variant`).not.toContain(code);
    };
    if (PINNED_SEVERITY[code]) it.fails(`${PINNED_SEVERITY[code]}: ${code} is ${severity} and behaves as such`, body);
    else it(`${code}: provoked as ${severity}, clean variant free of it`, body);
  }
});
