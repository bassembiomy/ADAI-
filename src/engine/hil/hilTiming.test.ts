import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import type { Layer, StateData, VariableDef } from '../../types/sm_types';

/*
 * Acceptance tests for the generated HIL main loop timing.
 *
 * Standard fixed-step execution (Simulink/Embedded Coder, time-triggered scheduling):
 *   - the step runs every SM_TICK_MS of the model, not a hard-coded delay,
 *   - releases come from a monotonic clock on a fixed-rate grid, not "work + delay",
 *   - SM_Step receives the observed delta so the generated jitter check is effective,
 *   - initial outputs are driven right after SM_Init, before the first tick,
 *   - each tick is Read → overrides → Step → Write.
 * The generated state machine files are not part of this change.
 */

const TICK_MS = 50;

const variables: VariableDef[] = [
  { id: 'v1', name: 'v_in', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
  { id: 'v2', name: 'v_out', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
];

const states: StateData[] = [{
  id: 's1', name: 'Run', x: 0, y: 0, width: 100, height: 100,
  entry: '', during: 'v_out = v_in;', exit: '',
  isActive: false, color: 'blue', parentId: 'root', children: [],
  priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
} as StateData];

const layers: Layer[] = [
  { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] } as Layer,
];

const pins: Record<string, { input: string; output: string }> = {
  Arduino_Uno: { input: '2', output: '13' },
  Arduino_Mega: { input: '2', output: '13' },
  ESP32: { input: '4', output: '2' },
  STM32F4: { input: 'PA0', output: 'PD12' },
  STM32F1: { input: 'PA0', output: 'PC13' },
  Generic: { input: 'PA0', output: 'PD12' },
};

const generate = (target: string) => {
  const pin = pins[target];
  const result = generateMISRACCode({
    tickMs: TICK_MS,
    states,
    junctions: [],
    transitions: [],
    variables,
    layers,
    safetyMode: false,
    hilConfig: {
      enabled: true,
      target,
      clockSpeed: 16,
      commPort: '',
      baudRate: 115200,
      channels: [
        { id: 'cin', name: 'v_in', peripheral: 'GPIO', pin: pin.input, direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'cout', name: 'v_out', peripheral: 'GPIO', pin: pin.output, direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
      ],
      mappings: [
        { id: 'm_in', adiaVarId: 'v_in', channelId: 'cin', direction: 'read' },
        { id: 'm_out', adiaVarId: 'v_out', channelId: 'cout', direction: 'write', safeValue: false },
      ],
    },
  } as never, { includeTestShims: true });
  expect(result.errors).toEqual([]);
  return result;
};

const mainOf = (files: { name: string; content: string }[]) =>
  files.find((file) => file.name.startsWith('main_hil'))?.content ?? '';

describe('HIL main loop timing', () => {
  for (const target of Object.keys(pins)) {
    describe(target, () => {
      const main = mainOf(generate(target).files);

      it('has no hard-coded tick delay', () => {
        expect(main).not.toMatch(/HAL_Delay\s*\(/);
        expect(main).not.toMatch(/\bdelay\s*\(\s*\d+\s*\)/);
        expect(main).not.toMatch(/\busleep\s*\(/);
        expect(main).not.toMatch(/\bSleep\s*\(\s*10\s*\)/);
      });

      it('releases the step from a monotonic clock on the SM_TICK_MS grid', () => {
        expect(main).toContain('ADIA_Scheduler_Init(');
        expect(main).toContain('ADIA_Scheduler_Poll(');
      });

      it('passes the observed delta, not the nominal constant, to SM_Step', () => {
        const call = main.match(/SM_Step\s*\(\s*&sm_instance\s*,\s*([A-Za-z_]\w*)\s*\)/);
        expect(call, 'SM_Step call').not.toBeNull();
        expect(call![1]).not.toBe('SM_TICK_MS');
      });

      it('drives initial outputs after SM_Init and before the first tick', () => {
        const init = main.indexOf('SM_Init(&sm_instance)');
        const firstWrite = main.indexOf('SM_WriteOutputs(&sm_instance)');
        const schedInit = main.indexOf('ADIA_Scheduler_Init(');
        expect(init).toBeGreaterThan(-1);
        expect(firstWrite).toBeGreaterThan(init);
        expect(schedInit).toBeGreaterThan(firstWrite);
      });

      it('runs Read → overrides → Step → Write inside a released tick', () => {
        const poll = main.indexOf('ADIA_Scheduler_Poll(');
        const read = main.indexOf('SM_ReadInputs(&sm_instance)', poll);
        const overrides = main.indexOf('HIL_ApplyOverrides(&sm_instance)', read);
        const step = main.search(/SM_Step\s*\(\s*&sm_instance/);
        const write = main.indexOf('SM_WriteOutputs(&sm_instance)', step);
        expect(poll).toBeGreaterThan(-1);
        expect(read).toBeGreaterThan(poll);
        expect(overrides).toBeGreaterThan(read);
        expect(step).toBeGreaterThan(overrides);
        expect(write).toBeGreaterThan(step);
      });
    });
  }

  const hostGcc = (() => {
    try {
      execFileSync('gcc', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hostGcc)('Generic host build compiles warning-free and steps at SM_TICK_MS in real time', () => {
    const result = generate('Generic');
    const dir = mkdtempSync(join(tmpdir(), 'adia-hil-timing-'));
    try {
      for (const file of result.files) writeFileSync(join(dir, file.name), file.content);
      const exe = join(dir, process.platform === 'win32' ? 'hil_sim.exe' : 'hil_sim');
      const sources = ['hal_drivers.c', 'hil_interface.c', 'main_hil.c', 'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'mcal_dio_hil.c', 'adia_mcal.c', 'adia_component.c'];
      execFileSync('gcc', ['-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-I.', ...sources, '-o', exe, '-lm'], { cwd: dir, stdio: 'pipe' });

      const runMs = 1500;
      const run = spawnSync(exe, [], { cwd: dir, input: '', timeout: runMs, encoding: 'utf8', killSignal: 'SIGKILL' });
      const telemetry = (run.stdout ?? '').split(/\r?\n/).filter((line) => line.includes('=') && !line.startsWith('HIL:'));
      const expected = runMs / TICK_MS;
      // Fixed-rate stepping at 50 ms: about 30 ticks in 1.5 s. A 10 ms delay loop would give about 150.
      expect(telemetry.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.6));
      expect(telemetry.length).toBeLessThanOrEqual(Math.ceil(expected * 1.1) + 1);
      // Observed jitter stays inside the generated window, so no timing fault is latched.
      expect(telemetry.filter((line) => line.includes('ERROR='))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
