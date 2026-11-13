import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRandomChart, randomChartExtraSources } from './smRandomChartFixture';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * MISRA C:2012 for charts that call external C functions: the generated production .c files
 * must be free of required/mandatory violations (only advisory 15.5 is accepted). The
 * hand-written implementation of the external functions belongs to the integrator and is
 * excluded from the check.
 */

const has = (tool: string, args = ['--version']) => {
  try { execFileSync(tool, args, { stdio: 'ignore' }); return true; } catch { return false; }
};
const MISRA_PY = ['/usr/lib/x86_64-linux-gnu/cppcheck/addons/misra.py', '/usr/share/cppcheck/addons/misra.py'].find((path) => existsSync(path));
const hasCppcheck = has('cppcheck') && MISRA_PY !== undefined;

/* Advisory rules per MISRA C:2012 that cppcheck checks; everything else it reports is required/mandatory. */
const ACCEPTED_DEVIATIONS = new Set(['15.5']);

/* Runs cppcheck's MISRA addon; it prints violations to stderr as "[file:line] (style) ... [misra-c2012-X.Y]". */
const misraViolations = (dir: string, dumps: string[]) => {
  const run = spawnSync('python3', [MISRA_PY!, ...dumps], { cwd: dir, encoding: 'utf8' });
  const report = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  return [...report.matchAll(/^\[([^\]]+?):(\d+)\][^\n]*\[misra-c2012-(\d+\.\d+)\]/gm)]
    .map((match) => ({ file: match[1], line: Number(match[2]), rule: match[3] }));
};

const SEED = 5003;
const make = (): StateMachineModelV5 =>
  buildRandomChart(SEED, { innerTransitions: true, arithmetic: true, externalFunctions: true } as never);

describe('external C functions are MISRA clean in generated production code', () => {
  it.skipIf(!hasCppcheck)('no MISRA required/mandatory violations in the generated .c files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adia-ext-misra-'));
    try {
      const built = buildSemanticModel(make());
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const files = [
        ...generateCArtifacts(built.ir!).files,
        ...randomChartExtraSources(SEED, { innerTransitions: true, arithmetic: true, externalFunctions: true } as never),
      ];
      for (const file of files) {
        const path = join(dir, file.name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.content);
      }
      const productionSources = readdirSync(dir)
        .filter((name) => name.endsWith('.c') && !/stub|test|harness/.test(name) && name !== 'ext_api.c');
      expect(productionSources.length).toBeGreaterThan(0);
      const dumps: string[] = [];
      for (const source of productionSources) {
        execFileSync('cppcheck', ['--dump', '--std=c99', '--quiet', '-I.', source], { cwd: dir, stdio: 'pipe' });
        dumps.push(`${source}.dump`);
      }
      const violations = misraViolations(dir, dumps)
        .filter((violation) => !ACCEPTED_DEVIATIONS.has(violation.rule));
      expect(violations.map((violation) => `${violation.rule} ${violation.file}:${violation.line}`)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
