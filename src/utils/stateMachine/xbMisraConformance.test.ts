import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';

/*
 * MISRA C:2012 conformance of the generated X-Bridges C (sm_xbridges.c / sm_xbridges.h and the
 * sm_core.c that calls them) for every executable X-Bridges conformance case. Only advisory rule
 * 15.5 (single point of exit, documented in MISRA_DEVIATIONS.md) is accepted.
 */

const has = (tool: string, args = ['--version']) => {
  try { execFileSync(tool, args, { stdio: 'ignore' }); return true; } catch { return false; }
};
const MISRA_PY = ['/usr/lib/x86_64-linux-gnu/cppcheck/addons/misra.py', '/usr/share/cppcheck/addons/misra.py'].find((path) => existsSync(path));
const hasCppcheck = has('cppcheck') && MISRA_PY !== undefined;

const ACCEPTED_DEVIATIONS = new Set(['15.5']);

const misraViolations = (dir: string, dumps: string[]) => {
  const run = spawnSync('python3', [MISRA_PY!, ...dumps], { cwd: dir, encoding: 'utf8' });
  const report = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  return [...report.matchAll(/^\[([^\]]+?):(\d+)\][^\n]*\[misra-c2012-(\d+\.\d+)\]/gm)]
    .map((match) => ({ file: match[1], line: Number(match[2]), rule: match[3] }));
};

const productionSources = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.c') && !/stub|test|harness/.test(name));

describe('generated X-Bridges C is MISRA C:2012 conformant', () => {
  for (const [id, testCase] of Object.entries(XB_EXECUTABLE_C_CASES)) {
    it.skipIf(!hasCppcheck)(`${id}: no MISRA violation except accepted deviation 15.5`, () => {
      const built = buildSemanticModel(testCase.fixture.model);
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const dir = mkdtempSync(join(tmpdir(), 'adia-xb-misra-'));
      try {
        for (const file of generateCArtifacts(built.ir!).files) {
          const path = join(dir, file.name);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, file.content);
        }
        const dumps: string[] = [];
        for (const source of productionSources(dir)) {
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
  }
});
