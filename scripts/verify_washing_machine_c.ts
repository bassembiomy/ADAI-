/**
 * Closed-loop proof for the washing machine: the generated C controller (plant excluded), fed every tick with the sensor
 * values the simulation's plant produced, reproduces the simulated controller outputs over a whole program.
 *
 * washingMachineReference.test.ts (G1) does this through the differential trace harness, which unrolls every step into
 * one C function and prints a full trace frame per step; that does not scale to 240 000 steps. This script runs the same
 * schedule (fast task, sensors, events, chart step, outputs, remaining fast steps) in a loop over a sensor table.
 *
 * Run: npx tsx scripts/verify_washing_machine_c.ts [QUICK_30|COTTON_40|SPIN_ONLY] [minutes]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInterpreterTrace } from '../src/utils/stateMachine/smCHarness';
import { generateCArtifacts } from '../src/utils/stateMachine/smCGenerator';
import { buildSemanticModel } from '../src/utils/stateMachine/smSemanticBuilder';
import { PROGRAM, washingMachineChart } from '../models/washing_machine/washingMachineChart';

const programName = (process.argv[2] ?? 'QUICK_30') as keyof typeof PROGRAM;
const minutes = Number(process.argv[3] ?? '40');
const ticks = minutes * 6000;
const program = PROGRAM[programName];

const steps = Array.from({ length: ticks }, (_, tick) => ({
  kind: 'step' as const,
  ...(tick === 0 ? { inputs: { program, door_closed: true }, events: ['START'] } : {}),
}));
const simulated = runInterpreterTrace({ name: 'flat-priority', model: washingMachineChart(), steps } as never);

const dir = mkdtempSync(join(tmpdir(), 'adia-wm-verify-'));
try {
  const files = generateCArtifacts(buildSemanticModel(washingMachineChart()).ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
  for (const file of files) writeFileSync(join(dir, file.name), file.content);
  // one line per tick: the sensors the plant produced in that tick
  writeFileSync(join(dir, 'sensors.txt'), simulated.slice(1).map((frame) => {
    const d = frame.data;
    return `${d.door_closed ? 1 : 0} ${d.water_level_mm} ${Math.round((d.water_temp_c as number) * 16)} ${(d.drum_speed_rpm as number).toPrecision(17)} ${d.unbalance ? 1 : 0}`;
  }).join('\n') + '\n');
  writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
#include <stdbool.h>
#include <stdint.h>
#include "wm_core.h"
bool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}
void MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}
double MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}
void MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}
void MCAL_ApplySafeOutputs(void){}
void MCAL_Watchdog_Kick(void){}
static WM_Instance_t wm;
int main(void){
  FILE *in = fopen("sensors.txt", "r");
  unsigned tick; uint32_t j;
  (void)WM_Init(&wm);
  for (tick = 0U; tick < ${ticks}U; tick++) {
    int door, level, temp, unb; double drum;
    if (fscanf(in, "%d %d %d %lf %d", &door, &level, &temp, &drum, &unb) != 5) { return 2; }
    (void)WM_XB_Task(&wm);
    wm.data.door_closed = (door != 0); wm.data.water_level_mm = (int16_t)level; wm.data.water_temp_c = (int16_t)temp;
    wm.data.drum_speed_rpm = (float)drum; wm.data.unbalance = (unb != 0);
    if (tick == 0U) { wm.data.program = (uint8_t)${program}U; (void)WM_PostEvent(&wm, WM_EVENT_START); }
    (void)WM_Step(&wm, WM_TICK_MS); (void)WM_WriteOutputs(&wm);
    for (j = 1U; j < WM_XB_TASK_STEPS_PER_TICK; j++) { (void)WM_XB_Task(&wm); }
    printf("%d %d %d %d %d %.9g %u %u\\n", wm.data.door_lock, wm.data.inlet_valve, wm.data.drain_pump, wm.data.heater, wm.data.motor_enable,
      (double)wm.data.speed_cmd_rpm, (unsigned)wm.data.fault_code, (unsigned)wm.data.phase);
  }
  return 0;
}
`);
  execFileSync('gcc', ['-std=c99', '-O1', '-I.', ...files.filter((f) => f.name.endsWith('.c')).map((f) => f.name), 'main.c', '-lm', '-o', 'verify'], { cwd: dir, stdio: 'pipe' });
  const output = execFileSync('./verify', [], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 30 }).trim().split('\n');
  let mismatches = 0;
  output.forEach((line, tick) => {
    const [lock, inlet, drain, heater, motor, cmd, fault, phase] = line.split(' ').map(Number);
    const d = simulated[tick + 1].data;
    const expected = [d.door_lock, d.inlet_valve, d.drain_pump, d.heater, d.motor_enable].map((v) => (v ? 1 : 0));
    const same = [lock, inlet, drain, heater, motor].every((v, i) => v === expected[i])
      && Math.fround(cmd) === Math.fround(d.speed_cmd_rpm as number) && fault === d.fault_code && phase === d.phase;
    if (!same && mismatches++ < 10) console.log(`tick ${tick}: C ${line} | simulation ${expected.join(' ')} ${d.speed_cmd_rpm} ${d.fault_code} ${d.phase}`);
  });
  console.log(`${programName}: ${output.length} ticks compared, ${mismatches} mismatches, final phase ${simulated.at(-1)!.data.phase}`);
  if (mismatches > 0 || output.length !== ticks) process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
