import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import type { StateData, VariableDef } from '../../types/sm_types';
import { compileAndRunCTrace } from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import { flatOrFixture, type DifferentialFixture } from './smFixtures';
import type { StateMachineModelV5 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import type { XBEdgeV1, XBNodeV1 } from './xbModel';

/*
 * Limits found while building the washing-machine reference model (models/washing_machine). Each is a MINIMAL
 * reproduction that does not use the washing machine, written as `it.fails`: the suite stays green while the defect
 * exists and goes red the day it is fixed, which is the cue to turn the test into a plain `it`.
 *
 * 1. The differential C trace harness (smCHarness.compileAndRunCTrace) cannot run a long scenario: it prints one full
 *    trace frame per step into a 1 MiB execFileSync buffer (ENOBUFS after a few hundred frames) and unrolls the scenario
 *    into one C function (gcc segfaults at 240 000 steps). washingMachineReference.test.ts G1 needs 240 000 steps.
 *    scripts/verify_washing_machine_c.ts proves the same property with a looped harness.
 * 2. The fast task of RATE_LIMITER + SPEED_CONTROLLER costs about 5 000 cycles per step on an ATmega2560 (SPEED_CONTROLLER
 *    alone about 3 200, the 0.2 ms budget): the generated SM_XB_Task evaluates every block in double expressions with
 *    isfinite / FLT_MAX checks on every port and repeats the anti-windup expression of the PI block several times. washingMachineReference.test.ts G3 requires RATE_LIMITER + SPEED_CONTROLLER
 *    in at most 3 200 cycles.
 */

const float32 = 'float32';
const xbNode = (id: string, type: string, params: Record<string, unknown> = {}): XBNodeV1 => {
  const block = BLOCK_LIBRARY[type](id, params);
  const port = (p: { id: string; direction: string }) => ({ id: p.id, direction: p.direction, shape: 'scalar', dimensions: [], dataType: float32 });
  return {
    id, type, label: id,
    parameters: { ...(block.inputs ? { inputs: block.inputs.map(port) } : {}), ...(block.outputs ? { outputs: block.outputs.map(port) } : {}), ...params } as XBNodeV1['parameters'],
  };
};
const edge = (from: string, fromPort: string, to: string, toPort: string): XBEdgeV1 => ({
  id: `${from}.${fromPort}->${to}.${toPort}`, sourceNodeId: from, sourcePortId: fromPort, targetNodeId: to, targetPortId: toPort,
});
const variable = (name: string): VariableDef => ({ id: name, name, type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true });

const speedLoop = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [variable('ref'), variable('act'), variable('iq')];
  const drive = {
    id: 'drive', name: 'Drive', x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000',
    parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true, isXBridges: true,
    xBridgesModel: {
      schemaVersion: 1,
      nodes: [xbNode('in_ref', 'Inport', { smVarId: 'ref' }), xbNode('in_act', 'Inport', { smVarId: 'act' }),
        xbNode('limit', 'RATE_LIMITER', { risingSlewRate: 150, fallingSlewRate: -300, initialCondition: 0, sampleTime: 0.001 }),
        xbNode('pi', 'SPEED_CONTROLLER', { Kp: 0.05, Ki: 0.5, maxIq: 10 }), xbNode('out', 'Outport', { smVarId: 'iq' })],
      edges: [edge('in_ref', 'out', 'limit', 'u'), edge('limit', 'y', 'pi', 'speed_ref'), edge('in_act', 'out', 'pi', 'speed_actual'), edge('pi', 'iq_ref', 'out', 'in')],
      mappings: [
        { smVarId: 'ref', blockId: 'in_ref', portId: 'in', direction: 'in' },
        { smVarId: 'act', blockId: 'in_act', portId: 'in', direction: 'in' },
        { smVarId: 'iq', blockId: 'out', portId: 'out', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.001, execution: 'separate-task' },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    },
  } as unknown as StateData;
  model.states = [drive] as never;
  model.transitions = [];
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['drive'], transitionIds: [], junctionIds: [] }] as never;
  return model;
};

const has = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

const itFailsWithAvr = has('avr-gcc') ? it.fails : it.skip;

describe('limits found by the washing-machine reference model', () => {
  it.fails('the differential C trace harness runs a 5 000-step scenario', () => {
    const fixture: DifferentialFixture = { name: 'flat-priority', model: speedLoop(), steps: Array.from({ length: 5000 }, () => ({ kind: 'step' as const })) };
    expect(compileAndRunCTrace(fixture)).toHaveLength(5001);
  }, 300_000);

  itFailsWithAvr('a RATE_LIMITER + SPEED_CONTROLLER fast step takes at most 0.2 ms on an ATmega2560 at 16 MHz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adia-xb-cycles-'));
    try {
      const files = generateCArtifacts(buildSemanticModel(speedLoop()).ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
      for (const file of files) writeFileSync(join(dir, file.name), file.content);
      writeFileSync(join(dir, 'main.c'), `#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <stdio.h>
#include <stdbool.h>
#include <stdint.h>
#include "sm_core.h"
bool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}
void MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}
double MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}
void MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}
void MCAL_ApplySafeOutputs(void){}
void MCAL_Watchdog_Kick(void){}
static volatile uint16_t ovf;
ISR(TIMER1_OVF_vect){ ovf++; }
static int uput(char c, FILE *f){ (void)f; while(!(UCSR0A & (1<<UDRE0))){} UDR0 = c; return 0; }
static FILE out = FDEV_SETUP_STREAM(uput, NULL, _FDEV_SETUP_WRITE);
static ADIA_Instance_t inst;
static uint32_t cycles(void){ uint16_t o, t; cli(); t = TCNT1; o = ovf; if ((TIFR1 & (1<<TOV1)) && t < 0x8000U) { o++; } sei(); return ((uint32_t)o << 16) | t; }
int main(void){
  uint32_t taskMax = 0; uint16_t i, j;
  UCSR0B = (1<<TXEN0); stdout = &out;
  TCCR1A = 0; TCCR1B = (1<<CS10); TIMSK1 = (1<<TOIE1); sei();
  (void)SM_Init(&inst);
  for (i = 0; i < 300U; i++) {
    inst.data.ref = (float)(i * 3U); inst.data.act = (float)(i * 2U);
    for (j = 0; j < SM_XB_TASK_STEPS_PER_TICK; j++) { uint32_t s = cycles(); (void)SM_XB_Task(&inst); s = cycles() - s; if (s > taskMax) { taskMax = s; } }
    (void)SM_Step(&inst, SM_TICK_MS);
  }
  printf("TASK_MAX=%lu\\n", (unsigned long)taskMax);
  cli(); sleep_cpu();
  return 0;
}
`);
      const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
      execFileSync('avr-gcc', ['-std=gnu99', '-mmcu=atmega2560', '-DF_CPU=16000000UL', '-Os', '-I.', ...sources, 'main.c', '-o', 'fw.elf', '-lm'], { cwd: dir, stdio: 'pipe' });
      const result = spawnSync('simavr', ['-m', 'atmega2560', '-f', '16000000', 'fw.elf'], { cwd: dir, encoding: 'utf8', timeout: 300_000 });
      const match = /TASK_MAX=(\d+)/.exec(`${result.stdout}\n${result.stderr}`);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeLessThanOrEqual(3_200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);
});
