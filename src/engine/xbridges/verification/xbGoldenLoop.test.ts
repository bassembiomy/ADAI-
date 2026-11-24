/**
 * XBV-436: compare ADIA's algebraic-loop solve of y = c + y -/+ k y^2 (far roots, zero start) against a Simulink golden.
 *
 * GOLDENS come from `scripts/xbridges-verification/goldens/far_root_loop.m`, run by the user in MATLAB R2024b:
 *   docs/xbridges-verification/goldens/far_root_loop_<TrustRegion|LineSearch>.csv
 * (the folder can be overridden with XB_GOLDEN_DIR, used to exercise this harness against a synthetic file).
 * Columns: case_id,root,c,k,wiring,start,guess,status,error_id,error_msg,y ('#' lines are the header).
 *
 * RULES, per solver file and per case x wiring, start = zero (ADIA also starts from 0):
 *   no CSV                      -> it.skip by name with the matlab command (a skip is not a pass)
 *   Simulink converged (ok)     -> ADIA must converge to the same root within algTol (1 + |y*|), algTol = 1e-6
 *   Simulink failed from zero   -> it.skip by name: Simulink also fails, XBV-436's target is stricter than Simulink; ADIA's
 *                                  outcome for these cases is logged by one always-run test, never asserted
 * start = guess rows (0.9 x root) are reported, not compared: ADIA has no initial-guess input.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { buildModel, type ModelSpec } from '../testkit';

const GOLDEN_DIR = process.env.XB_GOLDEN_DIR ?? join(process.cwd(), 'docs', 'xbridges-verification', 'goldens');
const COMMAND = `matlab -batch "run('scripts/xbridges-verification/goldens/far_root_loop.m')"`;
const SOLVERS = ['TrustRegion', 'LineSearch'] as const;
const ALG_TOL = 1e-6;

// root, c, k: the same table as CASES in xbEngineB.test.ts describe 'e'.
const CASES: [number, number, number][] = [
  [1e3, 1, 1e-6], [1e7, 1, 1e-14], [1e8, 1, 1e-16], [Math.sqrt(1e-3 / 1e-20), 1e-3, 1e-20], [1e9, 1, 1e-18], [1e10, 1, 1e-20],
];
type Wiring = 'minus' | 'plus';

interface Row { caseId: string; root: number; c: number; k: number; wiring: Wiring; start: string; status: string; errorId: string; y: number }

/** Split one CSV line honouring double-quoted fields with "" escapes. */
const splitCsv = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
};

const readRows = (solver: string): Row[] | null => {
  const path = join(GOLDEN_DIR, `far_root_loop_${solver}.csv`);
  if (!existsSync(path)) return null;
  const rows: Row[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#') || line.startsWith('case_id')) continue;
    const f = splitCsv(line);
    rows.push({ caseId: f[0], root: Number(f[1]), c: Number(f[2]), k: Number(f[3]), wiring: f[4] as Wiring, start: f[5], status: f[7], errorId: f[8], y: f[10] === '' ? NaN : Number(f[10]) });
  }
  return rows;
};

const ckLoop = (c: number, k: number, wiring: Wiring): ModelSpec => ({
  blocks: [
    { id: 'one', type: 'Constant', params: { value: c } },
    { id: 's', type: 'Sum', params: { signs: wiring === 'minus' ? '++-' : '+++' } },
    { id: 'p', type: 'PRODUCT', params: { numInputs: 2 } },
    { id: 'gk', type: 'GAIN', params: { gain: wiring === 'minus' ? k : -k } },
  ],
  wires: ['one.out -> s.in1', 's.out -> s.in2', 's.out -> p.in1', 's.out -> p.in2', 'p.y -> gk.u', 'gk.y -> s.in3'],
});

const adia = (c: number, k: number, wiring: Wiring) => {
  const e = new XbridgesEngine(buildModel(ckLoop(c, k, wiring)));
  e.options = { solver: 'rk4', fixedStep: 0.1, startTime: 0, stopTime: 0.5 } as never;
  const compile = e.compile(0);
  e.computeOutputs(0);
  const codes = [...compile, ...e.diagnostics].map((d) => d.code);
  return { y: Number(e.getSignalValue('s', 'out')), codes, fatal: e.hasFatalError() };
};

describe('XBV-436 golden: ADIA far-root algebraic loop against Simulink', () => {
  it('the golden script is in the repository', () => {
    expect(existsSync(join(process.cwd(), 'scripts', 'xbridges-verification', 'goldens', 'far_root_loop.m'))).toBe(true);
  });

  const failedFromZero: { solver: string; row: Row }[] = [];

  for (const solver of SOLVERS) {
    const rows = readRows(solver);
    for (const [root, c, k] of CASES) {
      for (const wiring of ['minus', 'plus'] as const) {
        const label = `${solver}, root ${root.toPrecision(3)}, ${wiring}, zero start`;
        if (!rows) {
          it.skip(`${label}: no golden yet (far_root_loop_${solver}.csv); run ${COMMAND}`, () => {});
          continue;
        }
        const row = rows.find((r) => r.wiring === wiring && r.start === 'zero' && Math.abs(r.root - root) <= 1e-9 * root);
        if (!row) {
          it.skip(`${label}: row missing from far_root_loop_${solver}.csv; re-run ${COMMAND}`, () => {});
          continue;
        }
        if (row.status !== 'ok' || !Number.isFinite(row.y)) {
          failedFromZero.push({ solver, row });
          it.skip(`${label}: Simulink also fails from zero (${row.errorId || 'no identifier'}), so XBV-436's target for this case is stricter than Simulink`, () => {});
          continue;
        }
        it(`${label}: Simulink converged to ${row.y}; ADIA converges to the same root within algTol (1 + |y*|)`, () => {
          const r = adia(c, k, wiring);
          expect(r.fatal, `ADIA fatal: ${r.codes.join(', ')}`).toBe(false);
          expect(r.codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
          expect(Math.abs(r.y - row.y), `ADIA ${r.y} vs Simulink ${row.y}`).toBeLessThanOrEqual(ALG_TOL * (1 + Math.abs(row.y)));
        }, 60_000);
      }
    }
  }

  it('records ADIA\'s outcome where Simulink fails from zero (never fails)', () => {
    for (const { solver, row } of failedFromZero) {
      const r = adia(row.c, row.k, row.wiring);
      console.log(`XBV436_ADIA_WHERE_SIMULINK_FAILS ${solver} root ${row.root} ${row.wiring} (${row.errorId}): ADIA y = ${r.y}, fatal = ${r.fatal}`);
    }
    expect(true).toBe(true);
  });

  for (const solver of SOLVERS) {
    const rows = readRows(solver);
    if (!rows) {
      it.skip(`${solver}: start sensitivity (0.9 x root) not reported, no golden yet; run ${COMMAND}`, () => {});
      continue;
    }
    it(`${solver}: start sensitivity (0.9 x root) is reported`, () => {
      for (const r of rows.filter((x) => x.start === 'guess')) {
        console.log(`XBV436_SIMULINK_GUESS ${solver} root ${r.root} ${r.wiring}: ${r.status} ${r.errorId} y = ${r.y}`);
      }
      expect(rows.length).toBeGreaterThan(0);
    });
  }
});
