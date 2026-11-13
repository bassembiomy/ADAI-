import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hybridXBridgesFixture, reviewedTwoStateFixture } from './smFixtures';
import { buildRandomChart } from './smRandomChartFixture';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { createDefaultAdapters, runVerificationPipeline } from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { StateMachineModelV5 } from './smModel';

/*
 * Production quality of the generated C (all charts, including X-Bridges states):
 *  1. MISRA C:2012: no violation of a mandatory or required rule that cppcheck's MISRA addon
 *     detects. The only accepted deviation is advisory rule 15.5 (single point of exit),
 *     documented in the generated file MISRA_DEVIATIONS.md.
 *  2. No recursion (MISRA 17.2): the call graph of the generated code is acyclic.
 *  3. Bounded stack: no function frame above 128 bytes and a worst-case call-chain stack
 *     of at most 512 bytes on a 64-bit host.
 *  4. Constant tables live in flash on AVR (PROGMEM or equivalent): a 77-state chart uses at
 *     most 32 bytes of initialized RAM (.data); today 800+ bytes.
 *  5. The verification pipeline runs real static analysis and MISRA checks with cppcheck when
 *     the model names it (staticAnalysisToolId 'cppcheck', misraToolId 'cppcheck-misra') and
 *     reports PASS on a correct model.
 */

const has = (tool: string, args = ['--version']) => {
  try { execFileSync(tool, args, { stdio: 'ignore' }); return true; } catch { return false; }
};
const MISRA_PY = ['/usr/lib/x86_64-linux-gnu/cppcheck/addons/misra.py', '/usr/share/cppcheck/addons/misra.py'].find((path) => existsSync(path));
const hasCppcheck = has('cppcheck') && MISRA_PY !== undefined;

/* Advisory rules per MISRA C:2012 that cppcheck checks; everything else it reports is required/mandatory. */
const ADVISORY = new Set(['1.2', '2.3', '2.4', '2.5', '2.6', '2.7', '4.2', '5.9', '8.7', '8.9', '8.11', '8.13', '10.5', '11.4', '11.5', '12.1', '12.3', '12.4', '13.3', '13.4', '15.1', '15.4', '15.5', '17.5', '17.8', '18.4', '18.5', '19.2', '20.1', '20.5', '20.10', '21.12']);
const ACCEPTED_DEVIATIONS = new Set(['15.5']);

const charts: Array<[string, () => StateMachineModelV5]> = [
  ['random-everything', () => buildRandomChart(5003, { innerTransitions: true, arithmetic: true, events: true } as never)],
  ['random-no-history-77-states', () => buildRandomChart(67, { innerTransitions: false, arithmetic: false })],
  ['x-bridges', () => hybridXBridgesFixture()],
];

const writeChart = (model: StateMachineModelV5, dir: string) => {
  const built = buildSemanticModel(model);
  expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  const files = generateCArtifacts(built.ir!).files;
  for (const file of files) {
    const path = join(dir, file.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  return files;
};

const productionSources = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.c') && !/stub|test|harness/.test(name));

describe('generated C is production quality', () => {
  for (const [label, make] of charts) {
    it.skipIf(!hasCppcheck)(`${label}: no MISRA required/mandatory violations detected by cppcheck`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'adia-misra-'));
      try {
        const files = writeChart(make(), dir);
        expect(files.some((file) => file.name.endsWith('MISRA_DEVIATIONS.md'))).toBe(true);
        const dumps: string[] = [];
        for (const source of productionSources(dir)) {
          execFileSync('cppcheck', ['--dump', '--std=c99', '--quiet', '-I.', source], { cwd: dir, stdio: 'pipe' });
          dumps.push(`${source}.dump`);
        }
        let report = '';
        try {
          report = execFileSync('python3', [MISRA_PY!, ...dumps], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
          report = `${(error as { stdout?: string }).stdout ?? ''}${(error as { stderr?: string }).stderr ?? ''}`;
        }
        const violations = [...report.matchAll(/^(\S+):(\d+):\d+: \w+: .*\[misra-c2012-(\d+\.\d+)\]/gm)]
          .map((match) => ({ file: match[1], line: Number(match[2]), rule: match[3] }))
          .filter((violation) => !ACCEPTED_DEVIATIONS.has(violation.rule));
        const required = violations.filter((violation) => !ADVISORY.has(violation.rule));
        expect(required.map((violation) => `${violation.rule} ${violation.file}:${violation.line}`)).toEqual([]);
        expect(violations.map((violation) => `${violation.rule} ${violation.file}:${violation.line}`)).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 300_000);

    it.skipIf(!has('gcc'))(`${label}: acyclic call graph and bounded stack`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'adia-stack-'));
      try {
        writeChart(make(), dir);
        const sources = productionSources(dir);
        execFileSync('gcc', ['-std=c99', '-O2', '-fstack-usage', '-fcallgraph-info=su', '-I.', '-c', ...sources], { cwd: dir, stdio: 'pipe' });
        const frames = new Map<string, number>();
        const edges = new Map<string, Set<string>>();
        for (const name of readdirSync(dir)) {
          if (name.endsWith('.su')) {
            for (const row of readFileSync(join(dir, name), 'utf8').trim().split('\n')) {
              const [where, bytes] = row.split('\t');
              frames.set(where.split(':').at(-1)!, Number(bytes));
            }
          }
          if (name.endsWith('.ci')) {
            const text = readFileSync(join(dir, name), 'utf8');
            for (const match of text.matchAll(/edge: \{ sourcename: "([^"]+)" targetname: "([^"]+)"/g)) {
              const from = match[1].split(':').at(-1)!;
              const to = match[2].split(':').at(-1)!;
              if (!edges.has(from)) edges.set(from, new Set());
              edges.get(from)!.add(to);
            }
          }
        }
        const cycles: string[] = [];
        const depth = new Map<string, number>();
        const visit = (fn: string, path: string[]): number => {
          if (path.includes(fn)) { cycles.push([...path.slice(path.indexOf(fn)), fn].join(' -> ')); return 0; }
          if (depth.has(fn)) return depth.get(fn)!;
          let deepest = 0;
          for (const callee of edges.get(fn) ?? []) deepest = Math.max(deepest, visit(callee, [...path, fn]));
          const total = (frames.get(fn) ?? 0) + deepest;
          depth.set(fn, total);
          return total;
        };
        for (const fn of edges.keys()) visit(fn, []);
        expect(cycles).toEqual([]);
        const largestFrame = Math.max(...frames.values());
        expect(largestFrame).toBeLessThanOrEqual(128);
        expect(Math.max(...depth.values())).toBeLessThanOrEqual(512);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 300_000);
  }

  it.skipIf(!has('avr-gcc'))('keeps constant tables in flash on AVR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adia-rom-'));
    try {
      writeChart(buildRandomChart(67, { innerTransitions: false, arithmetic: false }), dir);
      writeFileSync(join(dir, 'main.c'), '#include "sm_core.h"\nstatic ADIA_Instance_t i;\nbool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}\nvoid MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}\ndouble MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}\nvoid MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}\nvoid MCAL_ApplySafeOutputs(void){}\nvoid MCAL_Watchdog_Kick(void){}\nint main(void){(void)SM_Init(&i);for(;;){(void)SM_Step(&i,SM_TICK_MS);}}\n');
      execFileSync('avr-gcc', ['-std=c99', '-mmcu=atmega328p', '-Os', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', ...productionSources(dir), '-o', 'fw.elf'], { cwd: dir, stdio: 'pipe' });
      const sizes = execFileSync('avr-size', ['-A', 'fw.elf'], { cwd: dir, encoding: 'utf8' });
      const data = Number(/^\.data\s+(\d+)/m.exec(sizes)?.[1] ?? '0');
      expect(data).toBeLessThanOrEqual(32);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it.skipIf(!hasCppcheck)('the verification pipeline runs cppcheck static analysis and MISRA and passes a correct model', async () => {
    const model = reviewedTwoStateFixture();
    model.verification = { ...model.verification, staticAnalysisToolId: 'cppcheck', misraToolId: 'cppcheck-misra' } as never;
    const built = buildSemanticModel(model);
    const ir = built.ir!;
    const workspace = createGeneratedCodeTestWorkspace('production-gates');
    for (const file of generateCArtifacts(ir, { includeVerificationPackage: true }).files) {
      const path = join(workspace.directory, file.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.content);
    }
    const bundle = await runVerificationPipeline({ ir, outputDirectory: workspace.directory, adapters: createDefaultAdapters() });
    expect(bundle.activities['static-analysis'].status).toBe('PASS');
    expect(bundle.activities['misra-analysis'].status).toBe('PASS');
  }, 300_000);
});
