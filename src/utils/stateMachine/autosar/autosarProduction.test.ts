// @vitest-environment jsdom
/**
 * Phase-2 production-hardening acceptance tests for the AUTOSAR SWC generator (planner-owned).
 * Plan: docs/superpowers/plans/2026-10-27-autosar-codegen.md, "Phase 2" (W1-W15).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../../generatedCodeTestWorkspace';
import { generateMISRACCode } from '../../stateMachineCodeGenerator';
import type { StateData, TransitionData, VariableDef, VariableType } from '../../../types/sm_types';
import { buildSemanticModel } from '../smSemanticBuilder';
import { flatOrFixture } from '../smFixtures';
import type { StateMachineModelV5 } from '../smModel';
import {
  AUTOSAR_GENERATOR_VERSION,
  deriveAutosarPorts,
  generateAutosarSwc,
  toAutosarSwcName,
} from './autosarSwcGenerator';
import { checkMisraSubset } from './autosarMisraChecker';

type GeneratedFile = { name: string; content: string };

// ---------------------------------------------------------------- fixtures

const variable = (id: string, type: VariableType, initialValue = '0'): VariableDef => ({
  id,
  name: id,
  type,
  initialValue,
  currentValue: type === 'bool' ? initialValue === 'true' : Number(initialValue),
  visibleInScope: true,
});

const automotiveFixture = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables.push(variable('lamp_level', 'uint8'));
  model.states[1].entry = 'lamp_level = 200;';
  return model;
};

const safetyFixture = (): StateMachineModelV5 => {
  const model = automotiveFixture();
  model.safetyMode = true;
  model.states[1].isSafeState = true;
  return model;
};

const ROUND_TRIP_TYPES: VariableType[] = [
  'bool', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int', 'uint', 'float', 'double', 'int64',
];

/** One state whose during action copies every in_<type> to out_<type>. */
const roundTripFixture = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  const only: StateData = { ...model.states[0], during: ROUND_TRIP_TYPES.map((t) => `out_${t} = in_${t};`).join(' ') };
  model.states = [only];
  model.transitions = [];
  model.layers = [{ ...model.layers[0], stateIds: [only.id], transitionIds: [] }];
  model.variables = ROUND_TRIP_TYPES.flatMap((t) => [
    variable(`in_${t}`, t, t === 'bool' ? 'false' : '0'),
    variable(`out_${t}`, t, t === 'bool' ? 'false' : '0'),
  ]);
  return model;
};

/** 40 inputs, 40 outputs, 15-state chain. */
const largeFixture = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  const template = model.states[0];
  const transitionTemplate = model.transitions[0];
  const states: StateData[] = [];
  const transitions: TransitionData[] = [];
  for (let index = 0; index < 15; index += 1) {
    states.push({
      ...template,
      id: `s${index}`,
      name: `Stage${index}`,
      autostart: index === 0,
      priority: index + 1,
      entry: `out_${index} = in_${index} + ${index};`,
      during: `out_${index + 20} = in_${index + 20};`,
    });
    if (index > 0) {
      transitions.push({
        ...transitionTemplate,
        id: `t${index}`,
        sourceId: `s${index - 1}`,
        targetId: `s${index}`,
        condition: `in_${30 + (index % 10)} > ${index}`,
        action: `out_${30 + (index % 10)} = in_${index % 10};`,
      });
    }
  }
  model.states = states;
  model.transitions = transitions;
  model.layers = [{ ...model.layers[0], stateIds: states.map((s) => s.id), transitionIds: transitions.map((t) => t.id) }];
  model.variables = Array.from({ length: 40 }, (_, index) => [
    variable(`in_${index}`, 'int32'),
    variable(`out_${index}`, 'int32'),
  ]).flat();
  return model;
};

// ---------------------------------------------------------------- helpers

const file = (files: readonly GeneratedFile[], name: string): string => {
  const found = files.find((item) => item.name === name);
  expect(found, `expected generated file '${name}'`).toBeDefined();
  return found!.content;
};

const generateOk = (model: StateMachineModelV5, swcName?: string): GeneratedFile[] => {
  const result = generateAutosarSwc(model, swcName === undefined ? {} : { swcName });
  expect(result.errors).toEqual([]);
  return result.files;
};

const withPackage = <T>(label: string, files: readonly GeneratedFile[], body: (root: string) => T): T => {
  const workspace = createGeneratedCodeTestWorkspace(label);
  try {
    const root = join(workspace.directory, 'pkg');
    for (const item of files) {
      const target = join(root, item.name.slice('autosar/'.length));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, item.content);
    }
    return body(root);
  } finally {
    workspace.cleanup();
  }
};

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });

const STRICT = ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror'];
const INCLUDES = ['-I', 'swc', '-I', 'core', '-I', 'stubs'];
const sourcesOf = (files: readonly GeneratedFile[], dirs: string[]): string[] =>
  files.map((item) => item.name.slice('autosar/'.length))
    .filter((name) => name.endsWith('.c') && dirs.some((dir) => name.startsWith(`${dir}/`)));

const buildAndRun = (
  root: string,
  files: readonly GeneratedFile[],
  extraFlags: string[],
  testSource?: string,
  compiler = 'gcc',
): string => {
  const sources = sourcesOf(files, testSource === undefined ? ['swc', 'core', 'stubs', 'test'] : ['swc', 'core', 'stubs']);
  if (testSource !== undefined) {
    writeFileSync(join(root, 'planner_test.c'), testSource);
    sources.push('planner_test.c');
  }
  run(compiler, [...STRICT, ...extraFlags, ...INCLUDES, ...sources, '-lm', '-o', 'host_test'], root);
  return run(join(root, 'host_test'), [], root);
};

const SANITIZE = ['-DADIA_TESTING', '-g', '-fsanitize=address,undefined', '-fno-sanitize-recover=all'];

const CHECK_MACRO = '#define CHECK(c) do { if (!(c)) { (void)printf("FAIL %s:%d %s\\n", __FILE__, __LINE__, #c); return 1; } } while (0)';

/** Robustness behaviour on automotiveFixture / safetyFixture (W4, W5, W1 fault path). */
const robustnessTest = (swc: string, safety: boolean): string => `
#include <math.h>
#include <stdio.h>
#include "${swc}.h"
#include "Rte_${swc}_Stub.h"
#include "sm_core.h"
${CHECK_MACRO}

int main(void)
{
    uint32 cycle;
    uint16 initialState;

    /* W4: non-finite float inputs are rejected, last valid value kept. */
    Rte_Stub_Reset();
    ${swc}_Init();
    initialState = Rte_Stub_PP_SmStatus_ActiveState_Value;
    Rte_Stub_RP_total_total_Value = 6.0;
    Rte_Stub_RP_count_count_Value = 3.0;
    ${swc}_MainFunction();
    Rte_Stub_RP_total_total_Value = (float64)NAN;
    Rte_Stub_RP_count_count_Value = (float64)INFINITY;
    Rte_Stub_RP_go_go_Value = TRUE;
    ${swc}_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value != initialState);
    CHECK(Rte_Stub_PP_ratio_ratio_Value == 2.0);
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);

    /* W5: RTE error limit (default 10) on one port -> Dem FAILED; one good read clears it. */
    Rte_Stub_Reset();
    ${swc}_Init();
    Rte_Stub_RP_go_go_Status = RTE_E_NO_DATA;
    for (cycle = 1U; cycle < ${swc.toUpperCase()}_RTE_ERROR_LIMIT; cycle++) {
        ${swc}_MainFunction();
        CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);
    }
    ${swc}_MainFunction();
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);
    Rte_Stub_RP_go_go_Status = RTE_E_OK;
    ${swc}_MainFunction();
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);

    /* W4+W5: a NaN stream counts as a read failure too. */
    Rte_Stub_Reset();
    ${swc}_Init();
    Rte_Stub_RP_total_total_Value = (float64)NAN;
    for (cycle = 0U; cycle < ${swc.toUpperCase()}_RTE_ERROR_LIMIT; cycle++) {
        ${swc}_MainFunction();
    }
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);

    /* W5 soak: the failure counter saturates and never wraps back to PASSED. */
    Rte_Stub_Reset();
    ${swc}_Init();
    Rte_Stub_RP_count_count_Status = RTE_E_NEVER_RECEIVED;
    for (cycle = 0U; cycle < 70000U; cycle++) {
        ${swc}_MainFunction();
        if (cycle >= ${swc.toUpperCase()}_RTE_ERROR_LIMIT) {
            CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);
        }
    }
    CHECK(Rte_Stub_RP_SmFaultEvent_CallCount == 70000U);

    /* W1: forced core fault -> error status, Dem FAILED, latched${safety ? ', safe state entered' : ''}. */
    Rte_Stub_Reset();
    ${swc}_Init();
    CHECK(${swc}_Test_GetInstance() != NULL);
    CHECK(SM_Test_SetStateActive(${swc}_Test_GetInstance(), SM_ST_A, false) == SM_ERR_NONE);
    ${swc}_MainFunction();
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);
    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U);
${safety ? `    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_ST_B);
    CHECK(Rte_Stub_PP_lamp_level_lamp_level_Value == 200U);` : ''}
    ${swc}_MainFunction();
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x01U);

    /* Re-initialisation recovers. */
    Rte_Stub_Reset();
    ${swc}_Init();
    ${swc}_MainFunction();
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);
    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);

    (void)printf("ROBUSTNESS TESTS PASSED\\n");
    return 0;
}
`;

/** W13: extreme values round-trip for every type. */
const roundTripTest = (swc: string): string => {
  const values: Record<string, string> = {
    bool: 'TRUE', int8: '(sint8)-128', uint8: '255U', int16: '(sint16)-32768', uint16: '65535U',
    int32: '(sint32)(-2147483647 - 1)', uint32: '4294967295UL', int: '(sint32)(-2147483647 - 1)', uint: '4294967295UL',
    float: '1.5F', double: '-2.25', int64: '(sint64)123456789',
  };
  return `
#include <stdio.h>
#include "${swc}.h"
#include "Rte_${swc}_Stub.h"
${CHECK_MACRO}

int main(void)
{
    Rte_Stub_Reset();
    ${swc}_Init();
${ROUND_TRIP_TYPES.map((t) => `    Rte_Stub_RP_in_${t}_in_${t}_Value = ${values[t]};`).join('\n')}
    ${swc}_MainFunction();
${ROUND_TRIP_TYPES.map((t) => `    CHECK(Rte_Stub_PP_out_${t}_out_${t}_Value == ${values[t]});`).join('\n')}
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);
    (void)printf("ROUND TRIP PASSED\\n");
    return 0;
}
`;
};

const arxmlOf = (files: readonly GeneratedFile[], swc = 'AdiaSwc'): Document => {
  const document = new DOMParser().parseFromString(file(files, `autosar/arxml/${swc}.arxml`), 'application/xml');
  expect(document.getElementsByTagName('parsererror').length).toBe(0);
  return document;
};

const shortName = (element: Element): string =>
  Array.from(element.children).find((child) => child.localName === 'SHORT-NAME')?.textContent?.trim() ?? '';

const collectPaths = (root: Element): Set<string> => {
  const paths = new Set<string>();
  const walk = (element: Element, prefix: string): void => {
    const name = shortName(element);
    const path = name === '' ? prefix : `${prefix}/${name}`;
    if (name !== '') paths.add(path);
    for (const child of Array.from(element.children)) walk(child, path);
  };
  walk(root, '');
  return paths;
};

const expectReferencesResolve = (document: Document): void => {
  const paths = collectPaths(document.documentElement);
  for (const reference of Array.from(document.getElementsByTagName('*')).filter((e) => e.hasAttribute('DEST'))) {
    const target = reference.textContent!.trim();
    if (target.startsWith('/AUTOSAR_Platform/')) continue;
    expect(paths.has(target), `${reference.localName} -> ${target}`).toBe(true);
  }
};

const gcovSummary = (root: string, source: string, gcda: string): { lines: number; branchesTaken: number } => {
  const output = run('gcov', ['-b', '-o', '.', gcda], root);
  const section = output.split(/File '/).find((chunk) => chunk.startsWith(source)) ?? '';
  const lines = /Lines executed:([\d.]+)%/.exec(section);
  const taken = /Taken at least once:([\d.]+)%/.exec(section);
  expect(lines, `gcov output for ${source}:\n${output}`).not.toBeNull();
  return { lines: Number(lines![1]), branchesTaken: taken === null ? 100 : Number(taken![1]) };
};

// ---------------------------------------------------------------- tests

describe('W1 generated unit test reaches every SWC path', () => {
  it.each([
    ['automotive', automotiveFixture],
    ['safety', safetyFixture],
    ['round-trip', roundTripFixture],
  ])('%s model: 100%% lines and >= 90%% branches of swc/AdiaSwc.c', (_label, fixture) => {
    const files = generateOk(fixture());
    withPackage('autosar-cov', files, (root) => {
      const sources = sourcesOf(files, ['swc', 'core', 'stubs', 'test']);
      run('gcc', [...STRICT, '-DADIA_TESTING', '-O0', '--coverage', ...INCLUDES, ...sources, '-lm', '-o', 'cov_test'], root);
      expect(run(join(root, 'cov_test'), [], root)).toContain('ALL TESTS PASSED');
      const coverage = gcovSummary(root, 'swc/AdiaSwc.c', 'cov_test-AdiaSwc.gcda');
      expect(coverage.lines).toBe(100);
      expect(coverage.branchesTaken).toBeGreaterThanOrEqual(90);
    });
  });

  it('keeps test hooks out of the production build and builds the test target with ADIA_TESTING', () => {
    const files = generateOk(safetyFixture());
    expect(file(files, 'autosar/swc/AdiaSwc.h')).toMatch(/#ifdef ADIA_TESTING[\s\S]*AdiaSwc_Test_GetInstance\s*\(\s*void\s*\)[\s\S]*#endif/);
    expect(file(files, 'autosar/Makefile')).toContain('-DADIA_TESTING');
    withPackage('autosar-nm', files, (root) => {
      run('gcc', [...STRICT, ...INCLUDES, '-c', 'swc/AdiaSwc.c', '-o', 'prod.o'], root);
      expect(run('nm', ['prod.o'], root)).not.toContain('_Test_');
      run('gcc', [...STRICT, '-DADIA_TESTING', ...INCLUDES, '-c', 'swc/AdiaSwc.c', '-o', 'test.o'], root);
      expect(run('nm', ['test.o'], root)).toContain('AdiaSwc_Test_GetInstance');
    });
  });
});

describe('W2 the generated unit test detects defects (mutation gate)', () => {
  const mutants: Array<[string, (source: string) => string]> = [
    ['user output port writes removed', (source) => source.replace(/\(void\)\s*Rte_Write_PP_(?!SmStatus)\w+\s*\([^;]*\);/g, '/* mutant */')],
    ['Dem PASSED and FAILED swapped', (source) => source
      .replace(/DEM_EVENT_STATUS_PASSED/g, '__MUTANT_TMP__')
      .replace(/DEM_EVENT_STATUS_FAILED/g, 'DEM_EVENT_STATUS_PASSED')
      .replace(/__MUTANT_TMP__/g, 'DEM_EVENT_STATUS_FAILED')],
    ['RTE_E_LOST_DATA reads rejected', (source) => source.replace(/RTE_E_LOST_DATA/g, 'RTE_E_INVALID')],
  ];

  it('baseline passes', () => {
    withPackage('autosar-mut0', generateOk(automotiveFixture()), (root) => {
      expect(run('make', ['-C', root, 'test'], root)).toContain('ALL TESTS PASSED');
    });
  });

  it.each(mutants)('mutant "%s" is killed', (_label, mutate) => {
    withPackage('autosar-mut', generateOk(automotiveFixture()), (root) => {
      const path = join(root, 'swc', 'AdiaSwc.c');
      const original = readFileSync(path, 'utf8');
      const mutated = mutate(original);
      expect(mutated, 'mutation must change the source').not.toBe(original);
      writeFileSync(path, mutated);
      const result = spawnSync('make', ['-C', root, 'test'], { encoding: 'utf8' });
      expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
    });
  });
});

describe('W3 static analysis, second compiler and sanitizers', () => {
  it.each([
    ['automotive', automotiveFixture],
    ['safety', safetyFixture],
    ['round-trip', roundTripFixture],
  ])('%s model is clean under gcc -fanalyzer', (_label, fixture) => {
    const files = generateOk(fixture());
    withPackage('autosar-analyzer', files, (root) => {
      for (const source of sourcesOf(files, ['swc', 'core'])) {
        run('gcc', [...STRICT, '-fanalyzer', ...INCLUDES, '-c', source, '-o', '/dev/null'], root);
      }
    });
  });

  it('builds and passes its generated test with clang', () => {
    const files = generateOk(safetyFixture());
    withPackage('autosar-clang', files, (root) => {
      expect(buildAndRun(root, files, ['-DADIA_TESTING'], undefined, 'clang')).toContain('ALL TESTS PASSED');
    });
  });

  it.each([
    ['automotive', automotiveFixture, false],
    ['safety', safetyFixture, true],
  ] as const)('%s model: robustness + 70k-cycle soak pass under ASan/UBSan', (_label, fixture, safety) => {
    const files = generateOk(fixture());
    withPackage('autosar-asan', files, (root) => {
      expect(buildAndRun(root, files, SANITIZE, robustnessTest('AdiaSwc', safety))).toContain('ROBUSTNESS TESTS PASSED');
    });
  });

  it('robustness also holds with clang', () => {
    const files = generateOk(safetyFixture());
    withPackage('autosar-clang-rob', files, (root) => {
      expect(buildAndRun(root, files, ['-DADIA_TESTING'], robustnessTest('AdiaSwc', true), 'clang')).toContain('ROBUSTNESS TESTS PASSED');
    });
  });
});

describe('W5 RTE error limit is configurable and documented', () => {
  it('defines an overridable limit and documents it', () => {
    const files = generateOk(automotiveFixture());
    const sources = file(files, 'autosar/swc/AdiaSwc.h') + file(files, 'autosar/swc/AdiaSwc.c');
    expect(sources).toMatch(/#ifndef\s+ADIASWC_RTE_ERROR_LIMIT\s*\n\s*#define\s+ADIASWC_RTE_ERROR_LIMIT\s+10U/);
    expect(file(files, 'autosar/doc/Integration_Guide.md')).toContain('ADIASWC_RTE_ERROR_LIMIT');
  });

  it('honours an integrator override at compile time', () => {
    const files = generateOk(automotiveFixture());
    withPackage('autosar-limit', files, (root) => {
      const test = robustnessTest('AdiaSwc', false);
      expect(buildAndRun(root, files, ['-DADIA_TESTING', '-DADIASWC_RTE_ERROR_LIMIT=3U'], test)).toContain('ROBUSTNESS TESTS PASSED');
    });
  });
});

describe('W6-W8 model checks', () => {
  it('rejects a non-integer period', () => {
    const model = automotiveFixture();
    model.tickMs = 2.5;
    const result = generateAutosarSwc(model);
    expect(result.files).toEqual([]);
    expect(result.errors.map((error) => error.id)).toContain('AUTOSAR_INVALID_PERIOD');
  });

  it('warns about 64-bit precision loss', () => {
    const result = generateAutosarSwc(roundTripFixture());
    expect(result.errors).toEqual([]);
    const warning = result.warnings.find((item) => item.includes('[AUTOSAR_64BIT_PRECISION]'));
    expect(warning).toBeDefined();
    expect(warning).toContain('in_int64');
  });

  it('drops unused variables from ports and ARXML with a warning', () => {
    const model = automotiveFixture();
    model.variables.push(variable('spare_signal', 'uint16'));
    const result = generateAutosarSwc(model);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((item) => item.includes('[AUTOSAR_UNUSED_VARIABLE]') && item.includes('spare_signal'))).toBe(true);
    const ports = deriveAutosarPorts(buildSemanticModel(model).ir!);
    expect([...ports.provided, ...ports.required].map((port) => port.portName)).not.toContain('RP_spare_signal');
    expect(file(result.files, 'autosar/arxml/AdiaSwc.arxml')).not.toContain('spare_signal');
    expect(file(result.files, 'autosar/swc/AdiaSwc.c')).not.toContain('spare_signal');
  });
});

describe('W9 MISRA Rule 5.1 and additional rules', () => {
  it.each([
    ['Rule 5.1', [
      { name: 'a.c', content: 'void Abcdefghijklmnopqrstuvwxyz12345_One(void)\n{\n}\n' },
      { name: 'b.c', content: 'void Abcdefghijklmnopqrstuvwxyz12345_Two(void)\n{\n}\n' },
    ]],
    ['Rule 16.4', [{ name: 'c.c', content: 'int f(int a)\n{\n    switch (a) {\n    case 1: {\n        return 2;\n    }\n    }\n    return 0;\n}\n' }]],
    ['Rule 21.4', [{ name: 'd.c', content: '#include <setjmp.h>\n' }]],
    ['Rule 21.5', [{ name: 'e.c', content: '#include <signal.h>\n' }]],
    ['Rule 21.10', [{ name: 'f.c', content: '#include <time.h>\n' }]],
  ] as const)('detects %s', (rule, files) => {
    expect(checkMisraSubset(files).map((finding) => finding.rule)).toContain(rule);
  });

  it('does not flag static functions or names distinct within 31 characters', () => {
    expect(checkMisraSubset([
      { name: 'a.c', content: 'static void Abcdefghijklmnopqrstuvwxyz12345_One(void)\n{\n}\n' },
      { name: 'b.c', content: 'static void Abcdefghijklmnopqrstuvwxyz12345_Two(void)\n{\n}\nvoid Short_Name(void)\n{\n}\n' },
      { name: 'c.c', content: 'int g(int a)\n{\n    switch (a) {\n    case 1: {\n        return 2;\n    }\n    default: {\n        return 0;\n    }\n    }\n}\n' },
    ])).toEqual([]);
  });

  it('blocks generation when long names collide in the first 31 characters', () => {
    const longSwc = generateAutosarSwc(automotiveFixture(), { swcName: 'A'.repeat(40) });
    expect(longSwc.files).toEqual([]);
    expect(longSwc.errors.some((error) => error.id === 'AUTOSAR_MISRA_VIOLATION' && error.message.includes('Rule 5.1'))).toBe(true);

    // C identifiers derive from the state id (SM_ST_<ID>_Entry/During/Exit), not the display name.
    const model = automotiveFixture();
    const [idA, idB] = ['door_locking_sequence_waiting_a', 'door_locking_sequence_waiting_b'];
    model.states[0].id = idA;
    model.states[1].id = idB;
    model.transitions[0].sourceId = idA;
    model.transitions[0].targetId = idB;
    model.layers[0].stateIds = [idA, idB];
    const longStates = generateAutosarSwc(model);
    expect(longStates.errors.some((error) => error.id === 'AUTOSAR_MISRA_VIOLATION' && error.message.includes('Rule 5.1'))).toBe(true);
  });

  it('derives UI SWC names that are valid and 5.1-safe', () => {
    expect(toAutosarSwcName('MR_PLD_ECU.adia')).toBe('MR_PLD_ECU');
    expect(toAutosarSwcName('door lock-ctrl.adia')).toBe('door_lock_ctrl');
    expect(toAutosarSwcName('')).toBe('AdiaSwc');
    expect(toAutosarSwcName(undefined)).toBe('AdiaSwc');
    for (const raw of ['123abc.adia', 'x'.repeat(80), 'Électronique Moteur.adia', '___', 'Very_Long_Body_Control_Module_Name.adia']) {
      const name = toAutosarSwcName(raw);
      expect(name, raw).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,17}$/);
      expect(generateAutosarSwc(automotiveFixture(), { swcName: name }).errors, raw).toEqual([]);
    }
  });
});

describe('W10 ARXML integration facts', () => {
  it('declares single instantiation, non-concurrent runnables and modelled init values', () => {
    const document = arxmlOf(generateOk(automotiveFixture()));
    const flags = document.getElementsByTagName('SUPPORTS-MULTIPLE-INSTANTIATION');
    expect(flags.length).toBe(1);
    expect(flags[0].textContent!.trim()).toBe('false');
    const runnables = Array.from(document.getElementsByTagName('RUNNABLE-ENTITY'));
    expect(runnables.length).toBe(2);
    for (const runnable of runnables) {
      expect(runnable.getElementsByTagName('CAN-BE-INVOKED-CONCURRENTLY')[0]?.textContent?.trim(), shortName(runnable)).toBe('false');
    }
    const initValueOf = (portName: string): number => {
      const port = Array.from(document.getElementsByTagName('*')).find((element) =>
        /^(P|R)-PORT-PROTOTYPE$/.test(element.localName) && shortName(element) === portName)!;
      return Number(port.getElementsByTagName('VALUE')[0].textContent);
    };
    expect(initValueOf('RP_count')).toBe(1);
    expect(initValueOf('RP_go')).toBe(0);
    expect(initValueOf('PP_ratio')).toBe(0);
  });

  it('lists exactly the memory sections used in C, each with a resolving SW-ADDRMETHOD-REF', () => {
    for (const fixture of [automotiveFixture, roundTripFixture]) {
      const files = generateOk(fixture());
      const used = new Set(files.filter((item) => /^autosar\/(swc|core)\/.*\.c$/.test(item.name))
        .flatMap((item) => [...item.content.matchAll(/AdiaSwc_START_SEC_(\w+)/g)].map((match) => match[1])));
      const document = arxmlOf(files);
      const consumption = document.getElementsByTagName('RESOURCE-CONSUMPTION');
      expect(consumption.length).toBe(1);
      const sections = Array.from(consumption[0].getElementsByTagName('MEMORY-SECTION'));
      expect(new Set(sections.map(shortName))).toEqual(used);
      for (const section of sections) {
        expect(section.getElementsByTagName('SW-ADDRMETHOD-REF').length, shortName(section)).toBe(1);
      }
      expectReferencesResolve(document);
    }
  });
});

describe('W11 traceability', () => {
  const traced = ['autosar/swc/AdiaSwc.c', 'autosar/swc/AdiaSwc.h', 'autosar/arxml/AdiaSwc.arxml',
    'autosar/doc/MISRA_Compliance.md', 'autosar/doc/Integration_Guide.md'];
  const fingerprintOf = (files: readonly GeneratedFile[]): string => {
    const prints = traced.map((name) => {
      const match = /ADIA-FINGERPRINT: ([0-9a-f]{16})\b/.exec(file(files, name));
      expect(match, `${name} must carry ADIA-FINGERPRINT`).not.toBeNull();
      expect(file(files, name), name).toContain(`ADIA-AUTOSAR-GENERATOR: ${AUTOSAR_GENERATOR_VERSION}`);
      return match![1];
    });
    expect(new Set(prints).size).toBe(1);
    return prints[0];
  };

  it('stamps one model fingerprint and the generator version on every deliverable', () => {
    expect(AUTOSAR_GENERATOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const first = fingerprintOf(generateOk(automotiveFixture()));
    expect(fingerprintOf(generateOk(automotiveFixture()))).toBe(first);
    const changed = automotiveFixture();
    changed.transitions[0].condition = '!go';
    expect(fingerprintOf(generateOk(changed))).not.toBe(first);
  });
});

describe('W12 front-end parity with Generate C/H', () => {
  const brokenModels: Array<[string, () => StateMachineModelV5]> = [
    ['safety mode without safe state', () => { const m = automotiveFixture(); m.safetyMode = true; return m; }],
    ['guard on an undeclared variable', () => { const m = automotiveFixture(); m.transitions[0].condition = 'ghost > 1'; return m; }],
    ['action on an undeclared variable', () => { const m = automotiveFixture(); m.states[1].entry = 'phantom = 3;'; return m; }],
  ];

  it.each(brokenModels)('%s: every C/H error id is reported', (_label, fixture) => {
    const reference = generateMISRACCode(fixture());
    expect(reference.errors.length).toBeGreaterThan(0);
    const autosar = generateAutosarSwc(fixture());
    expect(autosar.files).toEqual([]);
    const ids = new Set(autosar.errors.map((error) => error.id));
    for (const error of reference.errors) {
      expect(ids.has(error.id), `missing ${error.id}: ${error.message}`).toBe(true);
    }
  });
});

describe('W13 type round trip', () => {
  it('every ADIA type crosses input port -> core -> output port with extreme values (gcc + UBSan)', () => {
    const files = generateOk(roundTripFixture());
    withPackage('autosar-roundtrip', files, (root) => {
      expect(buildAndRun(root, files, SANITIZE, roundTripTest('AdiaSwc'))).toContain('ROUND TRIP PASSED');
    });
  });

  it('round trip also holds with clang', () => {
    const files = generateOk(roundTripFixture());
    withPackage('autosar-roundtrip-clang', files, (root) => {
      expect(buildAndRun(root, files, ['-DADIA_TESTING'], roundTripTest('AdiaSwc'), 'clang')).toContain('ROUND TRIP PASSED');
    });
  });
});

describe('W14 scale', () => {
  it('40 in / 40 out / 15 states: fast, MISRA clean, builds and passes its generated test', () => {
    const started = performance.now();
    const result = generateAutosarSwc(largeFixture());
    expect(performance.now() - started).toBeLessThan(5000);
    expect(result.errors).toEqual([]);
    expect(checkMisraSubset(result.files.filter((item) => /^autosar\/(swc|core)\//.test(item.name)))).toEqual([]);
    const ports = deriveAutosarPorts(buildSemanticModel(largeFixture()).ir!);
    expect(ports.required.length + ports.provided.length).toBeGreaterThanOrEqual(60);
    withPackage('autosar-large', result.files, (root) => {
      expect(run('make', ['-C', root, 'test'], root)).toContain('ALL TESTS PASSED');
    });
  }, 120_000);
});

describe('W15 auditable documents', () => {
  it('MISRA deviations have ids, rules and rationale; the guide lists every port, the period and the fingerprint', () => {
    const files = generateOk(automotiveFixture());
    const misra = file(files, 'autosar/doc/MISRA_Compliance.md');
    const deviations = misra.split('\n').filter((line) => /DEV-\d+/.test(line));
    expect(deviations.length).toBeGreaterThan(0);
    for (const line of deviations.filter((entry) => entry.trim().startsWith('|'))) {
      expect(line, line).toMatch(/(Rule|Dir) \d+\.\d+/);
    }
    expect(misra).toMatch(/[Rr]ationale/);

    const guide = file(files, 'autosar/doc/Integration_Guide.md');
    for (const port of ['RP_go', 'RP_total', 'RP_count', 'PP_ratio', 'PP_lamp_level', 'PP_SmStatus', 'RP_SmFaultEvent']) {
      expect(guide).toContain(port);
    }
    expect(guide).toMatch(/10\s*ms/);
    expect(guide).toMatch(/ADIA-FINGERPRINT: [0-9a-f]{16}/);
  });
});
