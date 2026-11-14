import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { generateEmbeddedProject } from '../../engine/embedded/embeddedLayerGenerator';
import { defaultTargetPackFor } from '../../engine/targetPacks/defaultTargetPacks';
import type { StateMachineModelV5 } from './smModel';

/*
 * Tick timing supervision is a model choice:
 *   model.timingFaultPolicy = 'latch' (default, today's behaviour): an observed delta outside
 *     SM_TICK_MIN_MS..SM_TICK_MAX_MS latches SM_ERR_TIMING and enters the fault configuration.
 *   model.timingFaultPolicy = 'monitor' (Stateflow-like): the tick still executes normally on
 *     logical time (timers advance by SM_TICK_MS, as a Stateflow chart's do per sample hit);
 *     the violation is only counted. SM_GetTimingViolations(instance) returns the count; it is
 *     reset by SM_Init/SM_Reset. Invalid deltas the simulation rejects outright (negative,
 *     non-finite) are not representable in C and are out of scope.
 * The simulation and the generated C agree in both modes. The default generates exactly the
 * same code as before (golden snapshot).
 */

const chart = (policy?: 'latch' | 'monitor'): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states[0].during = 'count = count + 1;';
  model.transitions = [{ ...model.transitions[0], condition: '', type: 'after', afterTicks: 4, action: '' }] as never;
  if (policy) (model as unknown as { timingFaultPolicy: string }).timingFaultPolicy = policy;
  return model;
};

const jittered: DifferentialScenarioStep[] = [
  { kind: 'step', elapsedMs: 10 },
  { kind: 'step', elapsedMs: 25 },  // late: outside 9..11
  { kind: 'step', elapsedMs: 3 },   // early
  { kind: 'step', elapsedMs: 10 },
  { kind: 'step', elapsedMs: 10 },
];

const run = (model: StateMachineModelV5) => {
  const fixture: DifferentialFixture = { name: 'timing-jitter-normalized', model, steps: jittered };
  const expected = runInterpreterTrace(fixture);
  expect(compareSemanticTraces(expected, compileAndRunCTrace(fixture))).toBeNull();
  return expected;
};

describe('tick timing supervision policy', () => {
  it("'latch' (default) faults on the first out-of-window tick", () => {
    const frames = run(chart());
    expect(frames[2].error).toMatch(/^TIMING/);
    expect(frames[5].error).toMatch(/^TIMING/);
  }, 120_000);

  it("'monitor' keeps running on logical time like Stateflow", () => {
    const frames = run(chart('monitor'));
    for (const frame of frames) expect(frame.error).toBeNull();
    // after(4 ticks) counts ticks, not milliseconds: fires on the 4th step whatever the jitter.
    expect(frames[3].activeStateIds).toEqual(['a']);
    expect(frames[4].activeStateIds).toEqual(['b']);
    expect(frames[3].data.count).toBe(4);
  }, 120_000);

  it('counts violations in the generated C', () => {
    const built = buildSemanticModel(chart('monitor'));
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    const files = generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
    const dir = mkdtempSync(join(tmpdir(), 'adia-timing-'));
    try {
      for (const file of files) writeFileSync(join(dir, file.name), file.content);
      writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include "sm_core.h"
bool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}
void MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}
double MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}
void MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}
void MCAL_ApplySafeOutputs(void){}
void MCAL_Watchdog_Kick(void){}
int main(void){ ADIA_Instance_t i; (void)SM_Init(&i);
  (void)SM_Step(&i, 10U); (void)SM_Step(&i, 25U); (void)SM_Step(&i, 3U); (void)SM_Step(&i, 10U);
  printf("%lu %d\\n", (unsigned long)SM_GetTimingViolations(&i), (int)SM_GetError(&i));
  (void)SM_Reset(&i); printf("%lu\\n", (unsigned long)SM_GetTimingViolations(&i)); return 0; }
`);
      const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
      execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', ...sources, 'main.c', '-o', 'm', '-lm'], { cwd: dir, stdio: 'pipe' });
      expect(execFileSync(join(dir, 'm'), { encoding: 'utf8' }).trim().split('\n')).toEqual(['2 0', '0']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('rejects an unknown policy', () => {
    const model = chart();
    (model as unknown as { timingFaultPolicy: string }).timingFaultPolicy = 'ignore';
    const codes = buildSemanticModel(model).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);
    expect(codes).toContain('SM_INVALID_TIMING_POLICY');
  });
});

describe('integration guide is current', () => {
  it('describes fixed-point types, the timing policy and the rates', () => {
    const result = generateEmbeddedProject({
      enabled: true, target: 'STM32F4',
      targetSelection: { targetId: 'stm32f407vgt6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
      clockSpeed: 168,
      channels: [{ id: 'LED_0', name: 'led', peripheral: 'GPIO', pin: 'PD12', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' }],
      mappings: [{ id: 'map-led', adiaVarId: 'led', channelId: 'LED_0', direction: 'write', safeValue: false }],
      commPort: 'COM3', baudRate: 115200,
    }, defaultTargetPackFor('stm32f407vgt6')!);
    const guide = result.files.find((file) => /INTEGRATION\.md$/.test(file.path))!.content;
    expect(guide).not.toMatch(/No fixed-point data types/);
    expect(guide).toMatch(/fixdt/);
    expect(guide).toMatch(/timingFaultPolicy/);
    expect(guide).toMatch(/SM_GetTimingViolations/);
  });
});
