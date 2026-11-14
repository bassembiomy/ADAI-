import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * The cost of one tick must depend on the active configuration, not on the size of the chart,
 * as in Stateflow-generated code (which only visits the active path):
 *  - state timers advance only for active states (walk of the active tree, no loop over all
 *    states);
 *  - the runtime consistency check per tick verifies the active tree, plus a bounded slice of a
 *    rolling full scan of all states (SM_CONSISTENCY_SCAN_CHUNK states per tick, default 16), so
 *    corruption of any state flag is still detected within ceil(states / chunk) ticks;
 *  - SM_WriteOutputs does not repeat a full scan.
 * Measured on a cycle-accurate ATmega2560 simulator (simavr) at 16 MHz for SM_Step +
 * SM_WriteOutputs on charts of 100 and 1000 states with the same active depth:
 *    before: 100 states ~4.4k cycles, 1000 states ~28k cycles per tick.
 *    required: 1000 states <= 4,500 cycles and <= 1.25 x the 100-state cost + 300 cycles.
 * Behaviour is unchanged (the random-chart differential test is the oracle).
 */

const st = (id: string, parentId: string | null, autostart: boolean, priority: number, o: Record<string, unknown> = {}) => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000',
  parentId, children: [], priority, isParallel: false, regionId: null, autostart, ...o,
});
const tr = (id: string, sourceId: string, targetId: string, o: Record<string, unknown>) => ({
  id, sourceId, targetId, condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1, ...o,
});

/** groups composite states in the root, each with `leaves` children cycling on after(2) && cnt > 0. */
export const bigChart = (groups: number, leaves: number): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [
    { id: 'mode', name: 'mode', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'cnt', name: 'cnt', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];
  const states: unknown[] = [];
  const transitions: unknown[] = [];
  const root = { id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: [] as string[], transitionIds: [] as string[], junctionIds: [] };
  const layers: unknown[] = [root];
  for (let g = 0; g < groups; g += 1) {
    const gid = `G${g}`;
    states.push(st(gid, null, g === 0, g + 1, { entry: 'cnt = cnt + 1;' }));
    root.stateIds.push(gid);
    transitions.push(tr(`tg${g}`, gid, `G${(g + 1) % groups}`, { condition: `mode == ${g}` }));
    root.transitionIds.push(`tg${g}`);
    const layer = { id: `L${g}`, name: `L${g}`, parentStateId: gid, decomposition: 'OR', stateIds: [] as string[], transitionIds: [] as string[], junctionIds: [] };
    layers.push(layer);
    for (let l = 0; l < leaves; l += 1) {
      const lid = `S${g}_${l}`;
      states.push(st(lid, gid, l === 0, l + 1, { during: 'cnt = cnt + 1;' }));
      layer.stateIds.push(lid);
      transitions.push(tr(`t${g}_${l}`, lid, `S${g}_${(l + 1) % leaves}`, { type: 'and', condition: 'cnt > 0', afterTicks: 2 }));
      layer.transitionIds.push(`t${g}_${l}`);
    }
  }
  model.states = states as never;
  model.transitions = transitions as never;
  model.layers = layers as never;
  return model;
};

const productionFiles = (model: StateMachineModelV5) => {
  const built = buildSemanticModel(model);
  expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  return generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
};

const has = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};
const hasSimavr = (() => {
  try { execFileSync('simavr', ['--help'], { stdio: 'ignore' }); return true; } catch (error) { return (error as { status?: number }).status !== undefined; }
})();

const MCAL_STUBS = [
  'bool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}',
  'void MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}',
  'double MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}',
  'void MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}',
  'void MCAL_ApplySafeOutputs(void){}',
  'void MCAL_Watchdog_Kick(void){}',
].join('\n');

const AVR_CYCLE_MAIN = `#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <stdio.h>
#include "sm_core.h"
${MCAL_STUBS}
static volatile uint16_t ovf;
ISR(TIMER1_OVF_vect){ ovf++; }
static int uput(char c, FILE *f){ (void)f; while(!(UCSR0A & (1<<UDRE0))){} UDR0 = c; return 0; }
static FILE out = FDEV_SETUP_STREAM(uput, NULL, _FDEV_SETUP_WRITE);
static ADIA_Instance_t inst;
static uint32_t cycles(void){ uint16_t o, t; cli(); t = TCNT1; o = ovf; if ((TIFR1 & (1<<TOV1)) && t < 0x8000U) { o++; } sei(); return ((uint32_t)o << 16) | t; }
int main(void){
  uint32_t worst = 0; uint16_t i;
  UCSR0B = (1<<TXEN0); stdout = &out;
  TCCR1A = 0; TCCR1B = (1<<CS10); TIMSK1 = (1<<TOIE1); sei();
  (void)SM_Init(&inst);
  for (i = 0; i < 300U; i++) {
    uint32_t s, e;
    inst.data.mode = (int32_t)((i / 7U) % 64U);
    s = cycles(); (void)SM_Step(&inst, SM_TICK_MS); (void)SM_WriteOutputs(&inst); e = cycles() - s;
    if (e > worst) { worst = e; }
  }
  printf("STEP_MAX=%lu ERR=%d\\n", (unsigned long)worst, (int)SM_GetError(&inst));
  cli(); sleep_cpu();
  return 0;
}
`;

const avrStepCycles = (model: StateMachineModelV5): number => {
  const dir = mkdtempSync(join(tmpdir(), 'adia-cycles-'));
  try {
    const files = productionFiles(model);
    for (const file of files) writeFileSync(join(dir, file.name), file.content);
    writeFileSync(join(dir, 'cycles_main.c'), AVR_CYCLE_MAIN);
    const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
    execFileSync('avr-gcc', ['-std=gnu99', '-mmcu=atmega2560', '-DF_CPU=16000000UL', '-Os', '-I.', ...sources, 'cycles_main.c', '-o', 'fw.elf'], { cwd: dir, stdio: 'pipe' });
    const result = spawnSync('simavr', ['-m', 'atmega2560', '-f', '16000000', 'fw.elf'], { cwd: dir, encoding: 'utf8', timeout: 300_000 });
    const run = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const match = /STEP_MAX=(\d+) ERR=(\d+)/.exec(run);
    expect(match, run).not.toBeNull();
    expect(Number(match![2])).toBe(0);
    return Number(match![1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('step cost scales with the active configuration', () => {
  it('a 1000-state chart behaves like its simulation', () => {
    const fixture: DifferentialFixture = {
      name: 'flat-priority',
      model: bigChart(40, 24),
      steps: Array.from({ length: 60 }, (_, index) => ({ kind: 'step' as const, inputs: { mode: Math.floor(index / 7) % 40 } })),
    };
    expect(compareSemanticTraces(runInterpreterTrace(fixture), compileAndRunCTrace(fixture))).toBeNull();
  }, 300_000);

  it.skipIf(!has('avr-gcc') || !hasSimavr)('1000 states cost about the same per tick as 100 states on an ATmega2560', () => {
    const small = avrStepCycles(bigChart(10, 9));
    const large = avrStepCycles(bigChart(40, 24));
    expect(large, `100 states: ${small} cycles, 1000 states: ${large} cycles`).toBeLessThanOrEqual(4500);
    expect(large, `100 states: ${small} cycles, 1000 states: ${large} cycles`).toBeLessThanOrEqual(Math.ceil(small * 1.25) + 300);
  }, 900_000);

  it.skipIf(!has('gcc'))('still detects a corrupted state flag within ceil(states / chunk) ticks', () => {
    const files = productionFiles(bigChart(40, 24));
    const dir = mkdtempSync(join(tmpdir(), 'adia-scan-'));
    try {
      for (const file of files) writeFileSync(join(dir, file.name), file.content);
      writeFileSync(join(dir, 'scan_main.c'), `#include <stdio.h>
#include "sm_core.h"
${MCAL_STUBS}
int main(void) {
  static ADIA_Instance_t inst; unsigned tick;
  if (SM_Init(&inst) != SM_ERR_NONE) { return 1; }
  if (SM_Step(&inst, SM_TICK_MS) != SM_ERR_NONE) { return 2; }
  /* Corrupt the flag of a deep, inactive state. */
  inst.state_active[SM_NUM_STATES - 3U] = true;
  for (tick = 1U; tick <= 200U; ++tick) {
    if (SM_Step(&inst, SM_TICK_MS) == SM_ERR_CONFIGURATION) { printf("DETECTED %u\\n", tick); return 0; }
  }
  printf("MISSED\\n");
  return 3;
}
`);
      const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
      execFileSync('gcc', ['-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-I.', ...sources, 'scan_main.c', '-o', 'scan', '-lm'], { cwd: dir, stdio: 'pipe' });
      const output = execFileSync(join(dir, 'scan'), { cwd: dir, encoding: 'utf8' });
      const detected = /DETECTED (\d+)/.exec(output);
      expect(detected, output).not.toBeNull();
      expect(Number(detected![1])).toBeLessThanOrEqual(Math.ceil(1000 / 16) + 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
