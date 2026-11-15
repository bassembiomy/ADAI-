import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import type { DifferentialFixture, DifferentialScenarioStep } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { createAppSimulationSession } from './smAppAdapter';
import type { SemanticTraceFrame } from './smTrace';
import { PHASE, PROGRAM, washingMachineChart } from '../../../models/washing_machine/washingMachineChart';

/*
 * Reference washing machine (front loader, PMSM drum motor on an inverter), built with ADIA's
 * chart model exactly as the editor creates it (models/washing_machine/washingMachineChart.ts),
 * delivered as models/washing_machine/WashingMachine.adia saved by the app's own Save.
 *
 * Contract (names are part of the interface the embedded engineers integrate against):
 *   tick 10 ms; codePrefix 'WM'.
 *   Sensor inputs (written by the firmware, or by the plant region in simulation):
 *     door_closed (bool), water_level_mm (int16), water_temp_c (fixdt signed 16, fraction 4),
 *     drum_speed_rpm (float), unbalance (bool)
 *   Settings: program (uint8: PROGRAM.COTTON_40, PROGRAM.QUICK_30, PROGRAM.SPIN_ONLY)
 *   Input events: START, PAUSE, CANCEL
 *   Actuator outputs: door_lock, inlet_valve, drain_pump, heater, motor_enable (bool),
 *     speed_cmd_rpm (float, drum speed set point; the inverter's speed loop is an X-Bridges
 *     separate-task state producing iq_ref (float) at 1 ms), fault_code (uint8, 0 = none),
 *     phase (uint8, PHASE.*)
 *   Plant region (simulationOnly): water inflow/drain, heating/cooling, drum mechanics driven
 *     by iq_ref, unbalance onset; fault-injection inputs plant_no_water (bool) and
 *     plant_unbalanced_load (bool) used only by the plant.
 *
 * Product properties checked every tick of the simulated programs:
 *   P1 door_lock is on whenever drum_speed_rpm > 1 or water_level_mm > 5.
 *   P2 heater on implies water_level_mm >= 60.
 *   P3 speed_cmd_rpm > 100 implies water_level_mm <= 5 (no spin with water in the drum).
 *   P4 inlet_valve and drain_pump are never on together.
 *   P5 the quick program started with the door closed reaches PHASE.DONE with fault_code 0
 *      within 40 simulated minutes, after phases FILL, WASH, DRAIN, RINSE and SPIN.
 *   P6 an unbalanced load during spin makes the spin redistribute (speed_cmd_rpm back to <= 100)
 *      and, after at most 3 attempts, finish with a reduced spin (speed_cmd_rpm <= 400) instead
 *      of failing.
 *   P7 no water (plant_no_water) ends in fault_code 1 within the fill time-out (3 min) with
 *      inlet_valve, heater and motor_enable off; the door unlocks only once the drum has stopped
 *      and the drum is empty.
 *   P8 PAUSE stops the motor and heater within one tick and keeps the door locked while water
 *      is in; START resumes the same phase (history).
 * Generated controller:
 *   G1 the generated C (plant excluded), fed each tick with the plant outputs the simulation
 *      produced, reproduces the simulation's controller outputs for the whole quick program.
 *   G2 it compiles with -std=c99 -Wall -Wextra -Werror -pedantic for arm-none-eabi
 *      (cortex-m0plus) and avr (atmega2560); MISRA C:2012 clean except advisory 15.5.
 *   G3 on a cycle-accurate ATmega2560 at 16 MHz the chart tick (Step + WriteOutputs) takes at
 *      most 1 ms (16,000 cycles) and one fast-task step (WM_XB_Task) at most 0.2 ms.
 */

const TICK_MS = 10;
const MINUTE = 60_000 / TICK_MS;

type Frame = SemanticTraceFrame;
const d = (frame: Frame, name: string) => frame.data[name] as number;
const b = (frame: Frame, name: string) => frame.data[name] === true || frame.data[name] === 1;

const simulate = (steps: DifferentialScenarioStep[]) =>
  runInterpreterTrace({ name: 'flat-priority', model: washingMachineChart(), steps } as DifferentialFixture);

const run = (program: number, ticks: number, extra: (tick: number) => Partial<DifferentialScenarioStep> = () => ({})) =>
  simulate(Array.from({ length: ticks }, (_, tick) => ({
    kind: 'step' as const,
    ...(tick === 0 ? { inputs: { program, door_closed: true }, events: ['START'] } : {}),
    ...extra(tick),
  }) as DifferentialScenarioStep));

const checkSafety = (frames: Frame[]) => {
  frames.forEach((frame, tick) => {
    if (d(frame, 'drum_speed_rpm') > 1 || d(frame, 'water_level_mm') > 5) expect(b(frame, 'door_lock'), `P1 tick ${tick}`).toBe(true);
    if (b(frame, 'heater')) expect(d(frame, 'water_level_mm'), `P2 tick ${tick}`).toBeGreaterThanOrEqual(60);
    if (d(frame, 'speed_cmd_rpm') > 100) expect(d(frame, 'water_level_mm'), `P3 tick ${tick}`).toBeLessThanOrEqual(5);
    expect(b(frame, 'inlet_valve') && b(frame, 'drain_pump'), `P4 tick ${tick}`).toBe(false);
  });
};

const phases = (frames: Frame[]) => frames.map((frame) => d(frame, 'phase')).filter((phase, i, all) => i === 0 || all[i - 1] !== phase);

describe('washing machine reference model', () => {
  it('is a valid ADIA chart the app can simulate', () => {
    const model = washingMachineChart();
    const built = buildSemanticModel(model);
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(() => createAppSimulationSession(model as never)).not.toThrow();
    expect(model.tickMs).toBe(TICK_MS);
    expect((model as unknown as { codePrefix: string }).codePrefix).toBe('WM');
    expect(existsSync(join(__dirname, '../../../models/washing_machine/WashingMachine.adia'))).toBe(true);
  });

  it('P1-P5: the quick program completes safely through all phases', () => {
    const frames = run(PROGRAM.QUICK_30, 40 * MINUTE);
    checkSafety(frames);
    const sequence = phases(frames);
    for (const phase of [PHASE.FILL, PHASE.WASH, PHASE.DRAIN, PHASE.RINSE, PHASE.SPIN, PHASE.DONE]) expect(sequence).toContain(phase);
    expect(d(frames.at(-1)!, 'phase')).toBe(PHASE.DONE);
    expect(d(frames.at(-1)!, 'fault_code')).toBe(0);
  }, 900_000);

  it('P6: an unbalanced load redistributes, then finishes with a reduced spin', () => {
    const frames = run(PROGRAM.SPIN_ONLY, 15 * MINUTE, () => ({ inputs: { plant_unbalanced_load: true } }));
    checkSafety(frames);
    const spinFrames = frames.filter((frame) => d(frame, 'phase') === PHASE.SPIN);
    expect(spinFrames.some((frame) => d(frame, 'speed_cmd_rpm') <= 100)).toBe(true);
    expect(Math.max(...spinFrames.slice(-500).map((frame) => d(frame, 'speed_cmd_rpm')))).toBeLessThanOrEqual(400);
    expect(d(frames.at(-1)!, 'phase')).toBe(PHASE.DONE);
    expect(d(frames.at(-1)!, 'fault_code')).toBe(0);
  }, 900_000);

  it('P7: no water ends in a safe fault', () => {
    const frames = run(PROGRAM.COTTON_40, 5 * MINUTE, () => ({ inputs: { plant_no_water: true } }));
    checkSafety(frames);
    const faultAt = frames.findIndex((frame) => d(frame, 'fault_code') === 1);
    expect(faultAt).toBeGreaterThan(0);
    expect(faultAt).toBeLessThanOrEqual(3 * MINUTE + 50);
    for (const frame of frames.slice(faultAt)) {
      expect(b(frame, 'inlet_valve') || b(frame, 'heater') || b(frame, 'motor_enable')).toBe(false);
      if (!b(frame, 'door_lock')) {
        expect(d(frame, 'drum_speed_rpm')).toBeLessThanOrEqual(1);
        expect(d(frame, 'water_level_mm')).toBeLessThanOrEqual(5);
      }
    }
  }, 900_000);

  it('P8: pause stops motor and heater, start resumes the same phase', () => {
    const pauseAt = 4 * MINUTE;
    const frames = run(PROGRAM.COTTON_40, 6 * MINUTE, (tick) => (
      tick === pauseAt ? { events: ['PAUSE'] } : tick === pauseAt + MINUTE ? { events: ['START'] } : {}));
    checkSafety(frames);
    const before = d(frames[pauseAt], 'phase');
    expect(b(frames[pauseAt + 1], 'motor_enable')).toBe(false);
    expect(b(frames[pauseAt + 1], 'heater')).toBe(false);
    expect(d(frames[pauseAt + MINUTE + 2], 'phase')).toBe(before);
  }, 900_000);

  it('G1: the generated controller reproduces the simulation over the quick program', () => {
    const ticks = 40 * MINUTE;
    const steps: DifferentialScenarioStep[] = Array.from({ length: ticks }, (_, tick) => ({
      kind: 'step' as const,
      ...(tick === 0 ? { inputs: { program: PROGRAM.QUICK_30, door_closed: true }, events: ['START'] } : {}),
    }) as DifferentialScenarioStep);
    const simulated = simulate(steps);
    const sensors = ['door_closed', 'water_level_mm', 'water_temp_c', 'drum_speed_rpm', 'unbalance'];
    const fed = steps.map((step, tick) => ({
      ...step,
      inputs: { ...(step as { inputs?: Record<string, unknown> }).inputs, ...Object.fromEntries(sensors.map((name) => [name, simulated[tick + 1].data[name]])) },
    })) as DifferentialScenarioStep[];
    const generated = compileAndRunCTrace({ name: 'flat-priority', model: washingMachineChart(), steps: fed } as DifferentialFixture);
    const outputs = ['door_lock', 'inlet_valve', 'drain_pump', 'heater', 'motor_enable', 'speed_cmd_rpm', 'fault_code', 'phase'];
    for (let tick = 0; tick < simulated.length; tick += 1) {
      for (const name of outputs) {
        expect(generated[tick].data[name], `tick ${tick} ${name}`).toEqual(simulated[tick].data[name]);
      }
    }
  }, 1_800_000);
});

const has = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

describe('washing machine generated code on targets', () => {
  const productionFiles = () => {
    const built = buildSemanticModel(washingMachineChart());
    return generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
  };
  const stubs = '#include <stdbool.h>\n#include <stdint.h>\nbool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}\nvoid MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}\ndouble MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}\nvoid MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}\nvoid MCAL_ApplySafeOutputs(void){}\nvoid MCAL_Watchdog_Kick(void){}\n';

  it.skipIf(!has('arm-none-eabi-gcc') || !has('avr-gcc'))('G2: compiles strictly for Cortex-M0+ and ATmega2560', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adia-wm-'));
    try {
      const files = productionFiles();
      for (const file of files) writeFileSync(join(dir, file.name), file.content);
      writeFileSync(join(dir, 'stubs.c'), stubs);
      const sources = [...files.filter((file) => file.name.endsWith('.c')).map((file) => file.name), 'stubs.c'];
      const strict = ['-std=c99', '-Os', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', '-c'];
      execFileSync('arm-none-eabi-gcc', ['-mcpu=cortex-m0plus', '-mthumb', ...strict, ...sources], { cwd: dir, stdio: 'pipe' });
      execFileSync('avr-gcc', ['-mmcu=atmega2560', ...strict, ...sources], { cwd: dir, stdio: 'pipe' });
      expect(readdirSync(dir).filter((name) => name.endsWith('.o')).length).toBeGreaterThanOrEqual(sources.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);

  it.skipIf(!has('avr-gcc'))('G3: chart tick <= 1 ms and fast task <= 0.2 ms on an ATmega2560 at 16 MHz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adia-wm-cycles-'));
    try {
      const files = productionFiles();
      for (const file of files) writeFileSync(join(dir, file.name), file.content);
      writeFileSync(join(dir, 'main.c'), `#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <stdio.h>
#include "wm_core.h"
${stubs}
static volatile uint16_t ovf;
ISR(TIMER1_OVF_vect){ ovf++; }
static int uput(char c, FILE *f){ (void)f; while(!(UCSR0A & (1<<UDRE0))){} UDR0 = c; return 0; }
static FILE out = FDEV_SETUP_STREAM(uput, NULL, _FDEV_SETUP_WRITE);
static WM_Instance_t wm;
static uint32_t cycles(void){ uint16_t o, t; cli(); t = TCNT1; o = ovf; if ((TIFR1 & (1<<TOV1)) && t < 0x8000U) { o++; } sei(); return ((uint32_t)o << 16) | t; }
int main(void){
  uint32_t tickMax = 0, taskMax = 0; uint16_t i, j;
  UCSR0B = (1<<TXEN0); stdout = &out;
  TCCR1A = 0; TCCR1B = (1<<CS10); TIMSK1 = (1<<TOIE1); sei();
  (void)WM_Init(&wm);
  wm.data.program = 1U; wm.data.door_closed = true; (void)WM_PostEvent(&wm, WM_EVENT_START);
  for (i = 0; i < 1500U; i++) {
    uint32_t s, e;
    wm.data.water_level_mm = (int16_t)((i > 300U && i < 900U) ? 80 : 0);
    wm.data.drum_speed_rpm = (float)((i % 200U) * 6U);
    for (j = 0; j < WM_XB_TASK_STEPS_PER_TICK; j++) { s = cycles(); (void)WM_XB_Task(&wm); e = cycles() - s; if (e > taskMax) { taskMax = e; } }
    s = cycles(); (void)WM_Step(&wm, WM_TICK_MS); (void)WM_WriteOutputs(&wm); e = cycles() - s;
    if (e > tickMax) { tickMax = e; }
  }
  printf("TICK_MAX=%lu TASK_MAX=%lu\\n", (unsigned long)tickMax, (unsigned long)taskMax);
  cli(); sleep_cpu();
  return 0;
}
`);
      const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
      execFileSync('avr-gcc', ['-std=gnu99', '-mmcu=atmega2560', '-DF_CPU=16000000UL', '-Os', '-I.', ...sources, 'main.c', '-o', 'fw.elf', '-lm'], { cwd: dir, stdio: 'pipe' });
      const result = spawnSync('simavr', ['-m', 'atmega2560', '-f', '16000000', 'fw.elf'], { cwd: dir, encoding: 'utf8', timeout: 600_000 });
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      const match = /TICK_MAX=(\d+) TASK_MAX=(\d+)/.exec(text);
      expect(match, text).not.toBeNull();
      expect(Number(match![1]), `chart tick cycles`).toBeLessThanOrEqual(16_000);
      expect(Number(match![2]), `fast task cycles`).toBeLessThanOrEqual(3_200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 900_000);
});
