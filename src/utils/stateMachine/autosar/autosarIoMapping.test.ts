// @vitest-environment node
/**
 * Phase-4 acceptance tests (planner-owned): field-review findings F027-F029.
 * Plan: docs/superpowers/plans/2026-10-27-autosar-codegen.md, "Phase 4" (I1-I8).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { TransitionData, VariableDef } from '../../../types/sm_types';
import { buildSemanticModel } from '../smSemanticBuilder';
import { flatOrFixture } from '../smFixtures';
import type { StateMachineModelV5 } from '../smModel';
import { deriveAutosarPorts, generateAutosarSwc } from './autosarSwcGenerator';
import { runAutosarVerification } from './autosarVerifier';

type GeneratedFile = { name: string; content: string };

const variable = (id: string, type: VariableDef['type'], initialValue = '0'): VariableDef => ({
  id, name: id, type, initialValue,
  currentValue: type === 'bool' ? initialValue === 'true' : Number(initialValue),
  visibleInScope: true,
});

const channel = (id: string, direction: 'In' | 'Out', dataType: string, rangeMin: number, rangeMax: number) => ({
  id, name: id, peripheral: 'GPIO', pin: id, direction, dataType, rangeMin, rangeMax, scalingFactor: 1, unit: '',
});

/**
 * Oven-like model with an explicit I/O declaration: raw button input with edge detection,
 * fail-safe door default, diagnostic-fault temperature, clamped fan request, internal counter/constant,
 * outputs with safe values (fan keeps cooling at 1 on fault).
 */
const ovenFixture = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  const template = model.states[0];
  const t = model.transitions[0];
  model.safetyMode = true;
  model.states = [
    { ...template, id: 'off', name: 'Off', autostart: true, priority: 1, entry: '', during: 'k_prev = k_power_held;', exit: '' },
    { ...template, id: 'heating', name: 'Heating', autostart: false, priority: 2,
      entry: 'heater = true; fan = 3;',
      during: 'k_prev = k_power_held; heater = cavity_temp < setpoint_c; fan = fan_request; counter = counter + 1;',
      exit: 'heater = false; fan = 0;' },
    { ...template, id: 'safe', name: 'Safe', autostart: false, priority: 3, isSafeState: true, entry: 'heater = false; fan = 0;', during: '', exit: '' },
  ];
  const transitions: TransitionData[] = [
    { ...t, id: 't_on', sourceId: 'off', targetId: 'heating', condition: 'k_power_held && !k_prev && !door_open', action: '' },
    { ...t, id: 't_off', sourceId: 'heating', targetId: 'off', condition: 'door_open', action: '' },
  ];
  model.transitions = transitions;
  model.layers = [{ ...model.layers[0], stateIds: ['off', 'heating', 'safe'], transitionIds: ['t_on', 't_off'] }];
  model.variables = [
    variable('k_power_held', 'bool', 'false'),
    variable('k_prev', 'bool', 'false'),
    variable('door_open', 'bool', 'true'),
    variable('cavity_temp', 'double', '20'),
    variable('fan_request', 'uint8', '3'),
    variable('setpoint_c', 'double', '180'),
    variable('counter', 'uint16', '0'),
    variable('heater', 'bool', 'false'),
    variable('fan', 'uint8', '0'),
  ];
  model.hilConfig = {
    enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
    channels: [
      channel('ch_key', 'In', 'bool', 0, 1),
      channel('ch_door', 'In', 'bool', 0, 1),
      channel('ch_temp', 'In', 'double', -40, 300),
      channel('ch_fanreq', 'In', 'uint8_t', 0, 5),
      channel('ch_heater', 'Out', 'bool', 0, 1),
      channel('ch_fan', 'Out', 'uint8_t', 0, 5),
    ],
    mappings: [
      { id: 'map_key', adiaVarId: 'k_power_held', channelId: 'ch_key', direction: 'read' },
      { id: 'map_door', adiaVarId: 'door_open', channelId: 'ch_door', direction: 'read' },
      { id: 'map_temp', adiaVarId: 'cavity_temp', channelId: 'ch_temp', direction: 'read' },
      { id: 'map_fanreq', adiaVarId: 'fan_request', channelId: 'ch_fanreq', direction: 'read' },
      { id: 'map_heater', adiaVarId: 'heater', channelId: 'ch_heater', direction: 'write', safeValue: false },
      { id: 'map_fan', adiaVarId: 'fan', channelId: 'ch_fan', direction: 'write', safeValue: 1 },
    ],
  } as unknown as StateMachineModelV5['hilConfig'];
  model.verification = {
    ...model.verification,
    invalidInputPolicies: { map_key: 'reject', map_door: 'default', map_temp: 'diagnostic-fault', map_fanreq: 'clamp' },
  };
  return model;
};

/** The reviewed anti-pattern: the model "consumes" a button by clearing the mapped input. */
const consumedButtonFixture = (): StateMachineModelV5 => {
  const model = ovenFixture();
  model.transitions[0] = { ...model.transitions[0], condition: 'k_power_held && !door_open', action: 'k_power_held = false;' };
  return model;
};

const generateOk = (model: StateMachineModelV5): { files: GeneratedFile[]; warnings: string[] } => {
  const result = generateAutosarSwc(model);
  expect(result.errors).toEqual([]);
  return { files: result.files, warnings: result.warnings };
};

const file = (files: readonly GeneratedFile[], name: string): string => {
  const found = files.find((item) => item.name === name);
  expect(found, name).toBeDefined();
  return found!.content;
};

const withPackage = <T>(files: readonly GeneratedFile[], body: (root: string) => T): T => {
  const root = mkdtempSync(join(tmpdir(), 'adia-autosar-io-'));
  try {
    for (const item of files) {
      const target = join(root, item.name.slice('autosar/'.length));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, item.content);
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const ovenBehaviourTest = `
#include <stdio.h>
#include "AdiaSwc.h"
#include "Rte_AdiaSwc_Stub.h"
#include "sm_core.h"
#define CHECK(c) do { if (!(c)) { (void)printf("FAIL %s:%d %s\\n", __FILE__, __LINE__, #c); return 1; } } while (0)

int main(void)
{
    uint32 cycle;

    Rte_Stub_Reset();
    AdiaSwc_Init();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_OFF);

    /* F027: a held raw button produces exactly one power-on edge. */
    Rte_Stub_RP_door_open_door_open_Value = FALSE;
    Rte_Stub_RP_k_power_held_k_power_held_Value = TRUE;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_HEATING);
    CHECK(Rte_Stub_PP_heater_heater_Value == TRUE);
    CHECK(Rte_Stub_PP_fan_fan_Value == 3U);
    for (cycle = 0U; cycle < 10U; cycle++) {
        AdiaSwc_MainFunction();
        CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_HEATING);
    }

    /* I5 clamp: out-of-range fan request is clamped to the channel range 0..5. */
    Rte_Stub_RP_fan_request_fan_request_Value = 9U;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_fan_fan_Value == 5U);

    /* I5 reject: a failed button read holds the last valid value (still held, no new edge). */
    Rte_Stub_RP_k_power_held_k_power_held_Status = RTE_E_NO_DATA;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_HEATING);
    Rte_Stub_RP_k_power_held_k_power_held_Status = RTE_E_OK;

    /* I5 default (HW-026): losing the door signal means "door open" -> heating stops at once. */
    Rte_Stub_RP_door_open_door_open_Status = RTE_E_NO_DATA;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_OFF);
    CHECK(Rte_Stub_PP_heater_heater_Value == FALSE);
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);

    /* Door signal back and closed, release then press again -> heating. */
    Rte_Stub_RP_door_open_door_open_Status = RTE_E_OK;
    Rte_Stub_RP_door_open_door_open_Value = FALSE;
    Rte_Stub_RP_k_power_held_k_power_held_Value = FALSE;
    AdiaSwc_MainFunction();
    Rte_Stub_RP_k_power_held_k_power_held_Value = TRUE;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_HEATING);
    CHECK(Rte_Stub_PP_heater_heater_Value == TRUE);

    /* I5 diagnostic-fault + I4 safe values: persistent temperature loss latches the fault. */
    Rte_Stub_RP_cavity_temp_cavity_temp_Status = RTE_E_NO_DATA;
    for (cycle = 0U; cycle < ADIASWC_RTE_ERROR_LIMIT; cycle++) {
        AdiaSwc_MainFunction();
    }
    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U);
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_SAFE);
    CHECK(Rte_Stub_PP_heater_heater_Value == FALSE);
    CHECK(Rte_Stub_PP_fan_fan_Value == 1U);
    /* Safe values persist while the fault is latched, even if the signal comes back. */
    Rte_Stub_RP_cavity_temp_cavity_temp_Status = RTE_E_OK;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_fan_fan_Value == 1U);
    CHECK(Rte_Stub_PP_heater_heater_Value == FALSE);

    (void)printf("OVEN BEHAVIOUR PASSED\\n");
    return 0;
}
`;

describe('I1 I/O mappings are the authoritative AUTOSAR interface', () => {
  it('maps read/write mappings to R/P ports and keeps every unmapped variable internal', () => {
    const { files, warnings } = generateOk(ovenFixture());
    const ports = deriveAutosarPorts(buildSemanticModel(ovenFixture()).ir!);
    expect(ports.required.map((port) => port.portName).sort()).toEqual(
      ['RP_cavity_temp', 'RP_door_open', 'RP_fan_request', 'RP_k_power_held']);
    expect(ports.provided.map((port) => port.portName).sort()).toEqual(['PP_fan', 'PP_heater']);
    expect(ports.required.find((port) => port.portName === 'RP_door_open')).toMatchObject({ invalidInputPolicy: 'default' });
    expect(ports.required.find((port) => port.portName === 'RP_cavity_temp')).toMatchObject({ invalidInputPolicy: 'diagnostic-fault' });
    expect(ports.provided.find((port) => port.portName === 'PP_fan')).toMatchObject({ safeValue: 1 });

    const arxml = file(files, 'autosar/arxml/AdiaSwc.arxml');
    const swc = file(files, 'autosar/swc/AdiaSwc.c');
    for (const internal of ['k_prev', 'setpoint_c', 'counter']) {
      expect(arxml, internal).not.toMatch(new RegExp(`[RP]P_${internal}\\b`));
      expect(swc, internal).not.toMatch(new RegExp(`Rte_(Read|Write)_[RP]P_${internal}_`));
    }
    expect(warnings.some((item) => item.includes('[AUTOSAR_PORTS_INFERRED]'))).toBe(false);
    expect(warnings.some((item) => item.includes('[AUTOSAR_CALIBRATION_CANDIDATE]') && item.includes('setpoint_c'))).toBe(true);
    expect(warnings.some((item) => item.includes('[AUTOSAR_CALIBRATION_CANDIDATE]') && item.includes('counter'))).toBe(false);
  });

  it('documents per-input policies, per-output safe values and calibration candidates', () => {
    const guide = file(generateOk(ovenFixture()).files, 'autosar/doc/Integration_Guide.md');
    for (const text of ['RP_door_open', 'default', 'RP_cavity_temp', 'diagnostic-fault', 'clamp', 'reject', 'PP_fan', 'setpoint_c']) {
      expect(guide, text).toContain(text);
    }
    expect(guide).toMatch(/safe value/i);
  });
});

describe('I2 a mapped input written by the model is rejected (F027)', () => {
  it('errors with an explanation of raw input + edge detection', () => {
    const result = generateAutosarSwc(consumedButtonFixture());
    expect(result.files).toEqual([]);
    const error = result.errors.find((item) => item.id === 'AUTOSAR_INPUT_WRITTEN_BY_MODEL');
    expect(error, JSON.stringify(result.errors)).toBeDefined();
    expect(error!.message).toContain('k_power_held');
    expect(error!.message).toMatch(/edge/i);
  });
});

describe('I3/I6 warnings', () => {
  it('warns when ports are inferred and when a variable is both read and written', () => {
    const model = flatOrFixture();
    model.variables.push(variable('ticks', 'uint16'));
    model.states[0].during = 'ticks = ticks + 1;';
    const { warnings } = generateOk(model);
    expect(warnings.some((item) => item.includes('[AUTOSAR_PORTS_INFERRED]'))).toBe(true);
    expect(warnings.some((item) => item.includes('[AUTOSAR_AMBIGUOUS_DIRECTION]') && item.includes('ticks'))).toBe(true);
  });

  it('warns about safety mode off and missing safe values', () => {
    const model = ovenFixture();
    model.safetyMode = false;
    model.states[2].isSafeState = false;
    const mappings = (model.hilConfig as unknown as { mappings: Array<{ id: string; safeValue?: unknown }> }).mappings;
    delete mappings.find((mapping) => mapping.id === 'map_heater')!.safeValue;
    const { warnings } = generateOk(model);
    expect(warnings.some((item) => item.includes('[AUTOSAR_SAFETY_MODE_OFF]'))).toBe(true);
    expect(warnings.some((item) => item.includes('[AUTOSAR_SAFE_VALUE_MISSING]') && item.includes('heater'))).toBe(true);
  });
});

describe('I4/I5 behaviour on the integrator scenarios (gcc + ASan/UBSan)', () => {
  it('edge-triggered button, clamp, reject, fail-safe default and diagnostic fault with safe values', () => {
    const { files } = generateOk(ovenFixture());
    withPackage(files, (root) => {
      writeFileSync(join(root, 'oven_test.c'), ovenBehaviourTest);
      const sources = files.map((item) => item.name.slice('autosar/'.length))
        .filter((name) => name.endsWith('.c') && /^(swc|core|stubs)\//.test(name));
      const build = spawnSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-DADIA_TESTING', '-g',
        '-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-I', 'swc', '-I', 'core', '-I', 'stubs',
        ...sources, 'oven_test.c', '-lm', '-o', 'oven_test'], { cwd: root, encoding: 'utf8' });
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(join(root, 'oven_test'), [], { cwd: root, encoding: 'utf8' });
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('OVEN BEHAVIOUR PASSED');
    });
  });
});

describe('I8 back-to-back test shipped in the package', () => {
  it('make test runs interpreter-computed expectations and passes', () => {
    const { files } = generateOk(ovenFixture());
    const b2b = file(files, 'autosar/test/test_AdiaSwc_b2b.c');
    expect(b2b).toMatch(/ADIA semantic interpreter/);
    expect(b2b).toContain('ADIA-FINGERPRINT');
    withPackage(files, (root) => {
      const run = spawnSync('make', ['-C', root, 'test'], { encoding: 'utf8' });
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('B2B PASSED');
      expect(run.stdout).toContain('ALL TESTS PASSED');
    });
  });

  it('fails when the core deviates from the model', () => {
    const { files } = generateOk(ovenFixture());
    const sabotaged = files.map((item) => {
      if (item.name !== 'autosar/core/sm_user_logic.c') return item;
      const content = item.content.replace(/(data\.fan\s*=\s*\(uint8_t\)\()3U/, '$14U');
      expect(content).not.toBe(item.content);
      return { ...item, content };
    });
    withPackage(sabotaged, (root) => {
      const run = spawnSync('make', ['-C', root, 'test'], { encoding: 'utf8' });
      expect(run.status, run.stdout).not.toBe(0);
    });
  });

  it('is deterministic', () => {
    expect(file(generateOk(ovenFixture()).files, 'autosar/test/test_AdiaSwc_b2b.c'))
      .toBe(file(generateOk(ovenFixture()).files, 'autosar/test/test_AdiaSwc_b2b.c'));
  });
});

describe('I1-I8 full verifier on the mapped model', () => {
  it('passes every gate', async () => {
    const evidence = await runAutosarVerification(ovenFixture(), { executedAt: null });
    for (const gate of evidence.gates) expect(gate.status, `${gate.id}: ${gate.summary}`).toBe('pass');
    expect(evidence.verdict).toBe('accepted');
  }, 600_000);

  it('keeps the earlier package layout readable for tools that only know phase 1-3 files', () => {
    const names = generateOk(ovenFixture()).files.map((item) => item.name);
    expect(names).toContain('autosar/test/test_AdiaSwc.c');
    expect(names).toContain('autosar/doc/Verification_Report.md');
  });
});

// ---------------------------------------------------------------- I9 integer overflow (found during phase 4)

/** Integer arithmetic that overflows its target type: the model truncates and saturates (default policy). */
const overflowFixture = (strict = false): StateMachineModelV5 => {
  const model = flatOrFixture();
  const only = {
    ...model.states[0],
    during: strict
      ? 'strict = in_s32 + 1;'
      : 's32 = in_s32 + 1; u8 = in_u8 + 10; s8 = in_s8 * 2; s16 = in_s16 - 1; u32 = in_u32 + 1; mixed = in_s32 * in_s8;',
  };
  model.states = [only];
  model.transitions = [];
  model.layers = [{ ...model.layers[0], stateIds: [only.id], transitionIds: [] }];
  model.variables = strict
    ? [variable('in_s32', 'int32'), { ...variable('strict', 'int32'), overflowPolicy: 'error' }]
    : [
      variable('in_s32', 'int32'), variable('in_u8', 'uint8'), variable('in_s8', 'int8'), variable('in_s16', 'int16'), variable('in_u32', 'uint32'),
      variable('s32', 'int32'), variable('u8', 'uint8'), variable('s8', 'int8'), variable('s16', 'int16'), variable('u32', 'uint32'), variable('mixed', 'int32'),
    ];
  return model;
};

const overflowProbe = (strict: boolean): string => `
#include <stdio.h>
#include "AdiaSwc.h"
#include "Rte_AdiaSwc_Stub.h"
#define CHECK(c) do { if (!(c)) { (void)printf("FAIL %s:%d %s\\n", __FILE__, __LINE__, #c); return 1; } } while (0)

int main(void)
{
    Rte_Stub_Reset();
    AdiaSwc_Init();
${strict ? `    Rte_Stub_RP_in_s32_in_s32_Value = (sint32)2147483647;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);
    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U);` : `    Rte_Stub_RP_in_s32_in_s32_Value = (sint32)2147483647;
    Rte_Stub_RP_in_u8_in_u8_Value = 250U;
    Rte_Stub_RP_in_s8_in_s8_Value = (sint8)-100;
    Rte_Stub_RP_in_s16_in_s16_Value = (sint16)-32768;
    Rte_Stub_RP_in_u32_in_u32_Value = 4294967295UL;
    AdiaSwc_MainFunction();
    CHECK(Rte_Stub_PP_s32_s32_Value == (sint32)2147483647);
    CHECK(Rte_Stub_PP_u8_u8_Value == 255U);
    CHECK(Rte_Stub_PP_s8_s8_Value == (sint8)-128);
    CHECK(Rte_Stub_PP_s16_s16_Value == (sint16)(-32767 - 1));
    CHECK(Rte_Stub_PP_u32_u32_Value == 4294967295UL);
    CHECK(Rte_Stub_PP_mixed_mixed_Value == (sint32)(-2147483647 - 1));
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);`}
    (void)printf("OVERFLOW PROBE PASSED\\n");
    return 0;
}
`;

describe('I9 integer overflow follows the model (truncate + saturate, or fault under the error policy) without UB', () => {
  it.each([[false], [true]])('strict overflow policy = %s (gcc + UBSan)', (strict) => {
    const { files } = generateOk(overflowFixture(strict));
    withPackage(files, (root) => {
      writeFileSync(join(root, 'overflow_test.c'), overflowProbe(strict));
      const sources = files.map((item) => item.name.slice('autosar/'.length))
        .filter((name) => name.endsWith('.c') && /^(swc|core|stubs)\//.test(name));
      const build = spawnSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-DADIA_TESTING', '-g',
        '-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-I', 'swc', '-I', 'core', '-I', 'stubs',
        ...sources, 'overflow_test.c', '-lm', '-o', 'overflow_test'], { cwd: root, encoding: 'utf8' });
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(join(root, 'overflow_test'), [], { cwd: root, encoding: 'utf8' });
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('OVERFLOW PROBE PASSED');
    });
  });

  it('back-to-back vectors use the full integer range (no narrowing) and the shipped test passes', () => {
    const { files } = generateOk(overflowFixture());
    const b2b = file(files, 'autosar/test/test_AdiaSwc_b2b.c');
    expect(b2b).toMatch(/\b2147483647\b/);
    expect(b2b).not.toMatch(/±\s*1000|integerSpan|within \+?-?1000/i);
    withPackage(files, (root) => {
      const run = spawnSync('make', ['-C', root, 'test'], { encoding: 'utf8' });
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('B2B PASSED');
    });
  });

  it('the differential gate matches the interpreter over the full range', async () => {
    const evidence = await runAutosarVerification(overflowFixture(), {
      gates: ['differential', 'sanitizers', 'unit-test'], cycles: 2000, seed: 11, executedAt: null,
    });
    for (const gate of evidence.gates.filter((item) => item.status !== 'not-run')) {
      expect(gate.status, `${gate.id}: ${gate.summary}`).toBe('pass');
    }
    expect(evidence.gates.find((item) => item.id === 'differential')!.metrics.mismatches).toBe(0);
  }, 300_000);
});
