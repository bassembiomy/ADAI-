import { describe, it, expect, afterAll } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';
import { buildDomainFixture } from './vlabDomainFixture';

// Helper to check if a block has an equation factory
const hasEquationFactory = (blockId: string): boolean => {
  return !!blockEquations[blockId];
};

// Per-block limits: 3 steps per block, each bounded to 3 s wall clock / 2000 step attempts,
// plus a vitest timeout as a backstop for the async path.
const PER_STEP_ATTEMPT_LIMIT = 2000;
const PER_STEP_WALL_CLOCK_MS = 3000;
const PER_BLOCK_TIMEOUT_MS = 30000;

// F-012: blocks whose minimal fixture is well-posed enough yet the solver still fails.
// Not fixed here; the equations belong to the named domain work package.
const KNOWN_SOLVER_FAILURES: Record<string, { finding: string; wp: string; diagnosis: string }> = {
  gas_reservoir: {
    finding: 'F-012', wp: 'WP-10..21 (gas domain)',
    diagnosis: 'Newton fails with s=5 driven: port s variable stays at ~P/2 while across[0]-across[1] residual is 5e4; gas ports are not wired by the fixture and no gas reference exists',
  },
  ma_pressure_source: {
    finding: 'F-012', wp: 'WP-10..21 (moist-air/fluid domain)',
    diagnosis: 'a/b fluid ports float with no reference or flow path; branch variable diverges (2.5e12) -> singular Jacobian',
  },
  dist_constraint: {
    finding: 'F-012', wp: 'WP-10..21 (multibody)',
    diagnosis: 'frame ports b/f are unconnected by the fixture (no multibody world/rigid body); constraint rows unbalanced',
  },
  // WP-07: the fixture now wires every signal input by its declared direction (library `direction`). These blocks used to
  // pass only because the old name-vocabulary fixture put a Scope on an input port and left the real input unwired.
  gas_pressure_source: {
    finding: 'F-012', wp: 'WP-10..21 (gas domain)',
    diagnosis: 'ideal pressure source between two open gas ports, which the assembler pins to the same 101325 Pa reference; previously masked because the fixture put the Scope on the `p` control INPUT (read 0 Pa)',
  },
  clarke_transform: {
    finding: 'F-026', wp: 'WP-09',
    diagnosis: 'input `abc` is given a spurious signal branch by DAEAssembler.isPhysicalOutputPort (name vocabulary); a driven input then has two drivers. Direction metadata marks it `in`; WP-09 makes the assembler use it',
  },
  inv_sym_comp_transform: {
    finding: 'F-026', wp: 'WP-09',
    diagnosis: 'output `abc` is read back as across AND driven (name vocabulary / equation readback); residual 3.54 never reaches tolerance. Direction metadata marks it `out`',
  },
  im_flux_observer: {
    finding: 'F-012', wp: 'WP-10..21 (control/estimators)',
    diagnosis: 'with iabc/wr driven by constants the observer collapses the step to 1e-6 and times out; previously masked because iabc/wr were left unwired',
  },
  luenberger_observer: {
    finding: 'F-012', wp: 'WP-10..21 (control/estimators)',
    diagnosis: 'scalar ODE dxhat=-xhat+u+L(y-xhat) collapses the step to 1e-6 and times out; equation ignores matrix A and the state/branch mapping needs review',
  },
};

describe('VLab All Blocks, Solver, and Scope Diagnostic Test Suite', () => {
  const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);

  // We write a diagnostic report to console and return detailed status
  const diagnosticResults: any[] = [];

  allBlocks.forEach(block => {
    // Skip scope and ground as they are test harness components
    if (block.id === 'scope' || block.id === 'ground') {
      return;
    }

    // Documented, still-failing blocks run under it.fails so the suite stays green while
    // any NEW solver error (or a fix that makes one of these pass) is a loud failure.
    const known = KNOWN_SOLVER_FAILURES[block.id];
    const run = known ? it.fails : it;

    run(`Tests block: ${block.id} (${block.name})${known ? ` [known failure ${known.finding} -> ${known.wp}]` : ''}`, () => {
      const engine = new VLabPhysicsEngine();
      // A synchronous solver loop cannot be interrupted by vitest's test timeout, so
      // bound every simulateStep inside the engine: a non-convergent block must throw
      // a diagnosable error (recorded as a solver error below) instead of hanging the suite.
      engine.setStepBudget({ maxStepAttempts: PER_STEP_ATTEMPT_LIMIT, wallClockMs: PER_STEP_WALL_CLOCK_MS });
      // 1-2. Domain-correct network (shared with the validation harness, vlabDomainFixture.ts, F-028): the DUT plus the
      // sources/loads/references of ITS OWN domains, wired by exact port id and signal direction, every required
      // port connected, a scope on a measurable output. Passes the pre-simulation topology validation.
      const dutParams: Record<string, any> = {};
      Object.entries(block.params || {}).forEach(([k, v]: [string, any]) => {
        dutParams[k] = v.value;
      });
      const { nodes, edges } = buildDomainFixture(block, dutParams);
      // 3. Simulate and collect diagnostic data
      let state: any = null;
      let errorOccurred = false;
      let errorMessage = '';
      let scopeReadings: number[] = [];

      try {
        for (let step = 0; step < 3; step++) {
          state = engine.simulateStep(nodes, edges, state, 0.05);
          const val = state.scopeValues;
          const readVal = typeof val === 'object' ? (val.value !== undefined ? val.value : 0) : (val !== undefined ? val : 0);
          scopeReadings.push(readVal);
        }
      } catch (err: any) {
        errorOccurred = true;
        errorMessage = err.message;
      }

      const eqFactory = hasEquationFactory(block.id);
      const isZero = scopeReadings.length > 0 && scopeReadings.every(r => Math.abs(r) < 1e-12);
      
      const status = {
        id: block.id,
        name: block.name,
        hasEquationFactory: eqFactory,
        simulationSuccess: !errorOccurred,
        solverError: errorMessage,
        scopeReadings,
        isScopeAlwaysZero: isZero
      };

      diagnosticResults.push(status);
      // F-012: a solver error is a test failure (it used to be swallowed).
      expect(errorOccurred, `solver error for ${block.id}: ${errorMessage}`).toBe(false);
    }, PER_BLOCK_TIMEOUT_MS);
  });

  afterAll(() => {
    // Generate a beautiful markdown report of all library blocks
    console.log('\n======================================================================');
    console.log('                    VLAB BLOCK DIAGNOSTIC REPORT                      ');
    console.log('======================================================================\n');
    console.log('| Block ID | Name | Eq. Factory? | Sim Success? | Scope Readings | Status |');
    console.log('|---|---|---|---|---|---|');
    
    diagnosticResults.forEach(r => {
      let statusStr = '✅ OK';
      if (!r.hasEquationFactory) {
        statusStr = '⚠️ Missing Eq Factory (Shows 0)';
      } else if (!r.simulationSuccess) {
        statusStr = `❌ Sim Error: ${r.solverError.slice(0, 35)}...`;
      } else if (r.isScopeAlwaysZero) {
        statusStr = '⚠️ Scope reads 0 (No signal propagation)';
      }
      
      console.log(`| \`${r.id}\` | ${r.name} | ${r.hasEquationFactory ? 'Yes' : 'No'} | ${r.simulationSuccess ? 'Yes' : 'No'} | ${JSON.stringify(r.scopeReadings)} | ${statusStr} |`);
    });
    console.log('\n======================================================================\n');
  });
});
