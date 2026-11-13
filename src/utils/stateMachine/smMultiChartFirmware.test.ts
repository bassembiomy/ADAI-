import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture } from './smFixtures';
import { runInterpreterTrace } from './smCHarness';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * Several charts in one firmware, at different rates (Simulink multi-rate / several
 * referenced models in one application).
 *
 *   model.codePrefix (optional, default 'SM'): a C identifier in upper case. Every external
 *   symbol, type, macro, include guard and file name of the generated chart uses it:
 *     SM_Init -> PUMP_Init, SM_TICK_MS -> PUMP_TICK_MS, ADIA_Instance_t -> PUMP_Instance_t,
 *     sm_core.c -> pump_core.c, MCAL_CH_X -> PUMP_MCAL_CH_X, mcal_dio.h -> pump_mcal_dio.h.
 *   The MCAL driver functions (MCAL_Dio_ReadChannel, ...) are shared by all charts: their
 *   prototypes are identical in every chart's MCAL header, so one driver implementation
 *   serves every chart. The default prefix generates exactly today's files.
 *   An invalid prefix is SM_INVALID_CODE_PREFIX.
 *
 * Two charts generated into one directory compile and link together, and each one,
 * stepped at its own rate from a common base tick (rate-monotonic: the 10 ms chart every
 * base tick, the 50 ms chart every 5th), behaves exactly like its own simulation.
 */

const counterChart = (tickMs: number, prefix?: string): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.tickMs = tickMs;
  model.variables = [
    { id: 'count', name: 'count', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'runs', name: 'runs', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];
  model.states = [
    { id: 'idle', name: 'Idle', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'count = count + 1;', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true },
    { id: 'run', name: 'Run', x: 0, y: 0, width: 100, height: 60, entry: 'runs = runs + 1;', during: 'count = count + 2;', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 2, isParallel: false, regionId: null, autostart: false },
  ] as never;
  model.transitions = [
    { id: 't_go', sourceId: 'idle', targetId: 'run', condition: '', action: '', afterTicks: 3, type: 'after', hasControlPoint: false, order: 1 },
    { id: 't_back', sourceId: 'run', targetId: 'idle', condition: '', action: '', afterTicks: 2, type: 'after', hasControlPoint: false, order: 1 },
  ] as never;
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['idle', 'run'], transitionIds: ['t_go', 't_back'], junctionIds: [] }] as never;
  if (prefix !== undefined) (model as unknown as { codePrefix: string }).codePrefix = prefix;
  return model;
};

const sources = (model: StateMachineModelV5) => {
  const built = buildSemanticModel(model);
  expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  return generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
};

const hasGcc = (() => { try { execFileSync('gcc', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('several charts in one firmware', () => {
  it('prefixes every external name and file of a chart', () => {
    const files = sources(counterChart(50, 'PUMP'));
    const names = files.map((file) => file.name).sort();
    expect(names.every((name) => name.startsWith('pump_'))).toBe(true);
    const all = files.map((file) => file.content).join('\n');
    expect(all).toMatch(/PUMP_Error_t\s+PUMP_Init\s*\(\s*PUMP_Instance_t/);
    expect(all).toMatch(/#define\s+PUMP_TICK_MS\s+50U/);
    expect(all).not.toMatch(/\bSM_[A-Za-z]/);
    expect(all).not.toMatch(/\bADIA_Instance/);
    expect(all).not.toMatch(/#include\s+"sm_/);
  });

  it('rejects an invalid prefix', () => {
    for (const prefix of ['pump', '9X', 'A-B', 'MCAL']) {
      const codes = buildSemanticModel(counterChart(50, prefix)).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);
      expect(codes, prefix).toContain('SM_INVALID_CODE_PREFIX');
    }
  });

  it.skipIf(!hasGcc)('links a 10 ms and a 50 ms chart together; each matches its own simulation', () => {
    const fast = counterChart(10);
    const slow = counterChart(50, 'PUMP');
    const dir = mkdtempSync(join(tmpdir(), 'adia-multi-'));
    try {
      const fastFiles = sources(fast);
      const slowFiles = sources(slow);
      for (const file of [...fastFiles, ...slowFiles]) {
        expect(existsSync(join(dir, file.name)), `file name collision: ${file.name}`).toBe(false);
        writeFileSync(join(dir, file.name), file.content);
      }
      writeFileSync(join(dir, 'mcal_drivers.c'), [
        '#include "mcal_dio.h"',
        'bool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}',
        'void MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}',
        'double MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}',
        'void MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}',
        'void MCAL_ApplySafeOutputs(void){}',
        'void MCAL_Watchdog_Kick(void){}',
      ].join('\n'));
      writeFileSync(join(dir, 'main.c'), [
        '#include <stdio.h>',
        '#include "sm_core.h"',
        '#include "pump_core.h"',
        'int main(void) {',
        '  ADIA_Instance_t fast; PUMP_Instance_t slow; unsigned tick;',
        '  if (SM_Init(&fast) != SM_ERR_NONE) return 1;',
        '  if (PUMP_Init(&slow) != PUMP_ERR_NONE) return 2;',
        '  for (tick = 0U; tick < 100U; ++tick) {',
        '    if (SM_Step(&fast, SM_TICK_MS) != SM_ERR_NONE) return 3;',
        '    printf("F %ld %ld\\n", (long)fast.data.count, (long)fast.data.runs);',
        '    if ((tick % (PUMP_TICK_MS / SM_TICK_MS)) == 0U) {',
        '      if (PUMP_Step(&slow, PUMP_TICK_MS) != PUMP_ERR_NONE) return 4;',
        '      printf("S %ld %ld\\n", (long)slow.data.count, (long)slow.data.runs);',
        '    }',
        '  }',
        '  return 0;',
        '}',
      ].join('\n'));
      const cFiles = [...fastFiles, ...slowFiles].filter((file) => file.name.endsWith('.c')).map((file) => file.name);
      const exe = join(dir, 'firmware');
      execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', ...cFiles, 'mcal_drivers.c', 'main.c', '-o', exe, '-lm'], { cwd: dir, stdio: 'pipe' });
      const lines = execFileSync(exe, { cwd: dir, encoding: 'utf8' }).trim().split('\n');

      const simulate = (model: StateMachineModelV5, steps: number) => {
        const fixture: DifferentialFixture = { name: 'flat-priority', model, steps: Array.from({ length: steps }, () => ({ kind: 'step' as const })) };
        return runInterpreterTrace(fixture).slice(1).map((frame) => `${frame.data.count} ${frame.data.runs}`);
      };
      expect(lines.filter((line) => line.startsWith('F ')).map((line) => line.slice(2))).toEqual(simulate(fast, 100));
      expect(lines.filter((line) => line.startsWith('S ')).map((line) => line.slice(2))).toEqual(simulate(slow, 20));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
