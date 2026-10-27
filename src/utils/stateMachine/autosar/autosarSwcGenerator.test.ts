// @vitest-environment jsdom
/**
 * Acceptance tests for the AUTOSAR Classic SWC generator (planner-owned).
 * Plan: docs/superpowers/plans/2026-10-27-autosar-codegen.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../../generatedCodeTestWorkspace';
import { buildSemanticModel } from '../smSemanticBuilder';
import { flatOrFixture, hybridXBridgesFixture } from '../smFixtures';
import type { StateMachineModelV5 } from '../smModel';
import {
  deriveAutosarPorts,
  generateAutosarSwc,
  toAutosarPlatformType,
} from './autosarSwcGenerator';
import { checkMisraSubset } from './autosarMisraChecker';

type GeneratedFile = { name: string; content: string };

/** flatOrFixture (inputs go/total/count, output ratio) plus a uint8 output written on entry to B. */
const automotiveFixture = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables.push({
    id: 'lamp_level',
    name: 'lamp_level',
    type: 'uint8',
    initialValue: '0',
    currentValue: 0,
    visibleInScope: true,
  });
  model.states[1].entry = 'lamp_level = 200;';
  return model;
};

const safetyFixture = (): StateMachineModelV5 => {
  const model = automotiveFixture();
  model.safetyMode = true;
  model.states[1].isSafeState = true;
  return model;
};

const file = (files: readonly GeneratedFile[], name: string): string => {
  const found = files.find((item) => item.name === name);
  expect(found, `expected generated file '${name}'`).toBeDefined();
  return found!.content;
};

const generateOk = (model: StateMachineModelV5, swcName?: string): GeneratedFile[] => {
  const result = generateAutosarSwc(model, swcName === undefined ? {} : { swcName });
  expect(result.errors).toEqual([]);
  expect(result.files.length).toBeGreaterThan(0);
  return result.files;
};

const writePackage = (directory: string, files: readonly GeneratedFile[]): string => {
  const root = join(directory, 'pkg');
  for (const item of files) {
    expect(item.name.startsWith('autosar/'), `${item.name} must live under autosar/`).toBe(true);
    const target = join(root, item.name.slice('autosar/'.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, item.content);
  }
  return root;
};

const STRICT = ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror'];

const compileAndRun = (
  files: readonly GeneratedFile[],
  swc: string,
  testSource?: string,
): string => {
  const workspace = createGeneratedCodeTestWorkspace('autosar');
  try {
    const root = writePackage(workspace.directory, files);
    const sources = files
      .map((item) => item.name.slice('autosar/'.length))
      .filter((name) => name.endsWith('.c'))
      .filter((name) => (testSource === undefined ? true : !name.startsWith('test/')));
    if (testSource !== undefined) {
      writeFileSync(join(root, 'planner_test.c'), testSource);
      sources.push('planner_test.c');
    }
    const exe = join(root, `${swc}_host_test`);
    execFileSync('gcc', [
      ...STRICT,
      '-I', 'swc', '-I', 'core', '-I', 'stubs',
      ...sources,
      '-lm',
      '-o', exe,
    ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return execFileSync(exe, [], { cwd: root, encoding: 'utf8' });
  } finally {
    workspace.cleanup();
  }
};

const plannerBehaviourTest = (swc: string): string => `
#include <stdio.h>
#include "${swc}.h"
#include "Rte_${swc}_Stub.h"

#define CHECK(c) do { if (!(c)) { (void)printf("FAIL %s:%d %s\\n", __FILE__, __LINE__, #c); return 1; } } while (0)

int main(void)
{
    uint16 initialState;

    /* Init writes every provided port once, with the modelled initial values. */
    Rte_Stub_Reset();
    ${swc}_Init();
    CHECK(Rte_Stub_PP_ratio_ratio_WriteCount == 1U);
    CHECK(Rte_Stub_PP_lamp_level_lamp_level_WriteCount == 1U);
    CHECK(Rte_Stub_PP_lamp_level_lamp_level_Value == 0U);
    initialState = Rte_Stub_PP_SmStatus_ActiveState_Value;
    CHECK(initialState != 0U);

    /* Guard false: no transition, Dem reports PASSED once per cycle. */
    Rte_Stub_RP_go_go_Value = FALSE;
    Rte_Stub_RP_total_total_Value = 6.0;
    Rte_Stub_RP_count_count_Value = 3.0;
    ${swc}_MainFunction();
    CHECK(Rte_Stub_PP_ratio_ratio_Value == 0.0);
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == initialState);
    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);
    CHECK(Rte_Stub_RP_SmFaultEvent_CallCount == 1U);
    CHECK(Rte_Stub_RP_SmFaultEvent_LastStatus == 0x00U);

    /* Guard true: transition action and entry action reach the provided ports. */
    Rte_Stub_RP_go_go_Value = TRUE;
    ${swc}_MainFunction();
    CHECK(Rte_Stub_PP_ratio_ratio_Value == 2.0);
    CHECK(Rte_Stub_PP_lamp_level_lamp_level_Value == 200U);
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value != initialState);
    CHECK(Rte_Stub_RP_SmFaultEvent_CallCount == 2U);

    /* An RTE read failure keeps the last valid value (go stays FALSE after re-init). */
    Rte_Stub_Reset();
    ${swc}_Init();
    Rte_Stub_RP_go_go_Value = TRUE;
    Rte_Stub_RP_go_go_Status = RTE_E_NO_DATA;
    ${swc}_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == initialState);
    CHECK(Rte_Stub_PP_ratio_ratio_Value == 0.0);

    /* RTE_E_LOST_DATA is an overlaid flag: the data delivered is still valid. */
    Rte_Stub_RP_go_go_Status = RTE_E_LOST_DATA;
    ${swc}_MainFunction();
    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value != initialState);

    (void)printf("PLANNER TESTS PASSED\\n");
    return 0;
}
`;

/** Absolute AUTOSAR paths of every identifiable element (one with a SHORT-NAME child). */
const collectPaths = (root: Element): Set<string> => {
  const paths = new Set<string>();
  const walk = (element: Element, prefix: string): void => {
    const shortName = Array.from(element.children).find((child) => child.localName === 'SHORT-NAME');
    const path = shortName === undefined ? prefix : `${prefix}/${shortName.textContent!.trim()}`;
    if (shortName !== undefined) paths.add(path);
    for (const child of Array.from(element.children)) walk(child, path);
  };
  walk(root, '');
  return paths;
};

const parseArxml = (content: string): Document => {
  const document = new DOMParser().parseFromString(content, 'application/xml');
  expect(document.getElementsByTagName('parsererror').length, 'ARXML must be well-formed XML').toBe(0);
  return document;
};

const shortNamesOf = (document: Document, tag: string): string[] =>
  Array.from(document.getElementsByTagName(tag)).map((element) =>
    Array.from(element.children).find((child) => child.localName === 'SHORT-NAME')!.textContent!.trim());

describe('AUTOSAR type mapping', () => {
  it('maps every ADIA variable type to an AUTOSAR_Platform implementation data type', () => {
    expect(toAutosarPlatformType('bool')).toBe('boolean');
    expect(toAutosarPlatformType('int8')).toBe('sint8');
    expect(toAutosarPlatformType('uint8')).toBe('uint8');
    expect(toAutosarPlatformType('int16')).toBe('sint16');
    expect(toAutosarPlatformType('uint16')).toBe('uint16');
    expect(toAutosarPlatformType('int')).toBe('sint32');
    expect(toAutosarPlatformType('int32')).toBe('sint32');
    expect(toAutosarPlatformType('uint')).toBe('uint32');
    expect(toAutosarPlatformType('uint32')).toBe('uint32');
    expect(toAutosarPlatformType('int64')).toBe('sint64');
    expect(toAutosarPlatformType('uint64')).toBe('uint64');
    expect(toAutosarPlatformType('float')).toBe('float32');
    expect(toAutosarPlatformType('single')).toBe('float32');
    expect(toAutosarPlatformType('double')).toBe('float64');
  });
});

describe('AUTOSAR port derivation', () => {
  it('makes assigned variables provided ports and every other variable a required port', () => {
    const built = buildSemanticModel(automotiveFixture());
    expect(built.ir).toBeDefined();
    const ports = deriveAutosarPorts(built.ir!);
    expect(ports.provided.map((port) => port.portName).sort()).toEqual(['PP_lamp_level', 'PP_ratio']);
    expect(ports.required.map((port) => port.portName).sort()).toEqual(['RP_count', 'RP_go', 'RP_total']);
    const ratio = ports.provided.find((port) => port.portName === 'PP_ratio')!;
    expect(ratio).toMatchObject({
      variableId: 'ratio',
      interfaceName: 'SRI_ratio',
      dataElementName: 'ratio',
      platformType: 'float64',
    });
    const go = ports.required.find((port) => port.portName === 'RP_go')!;
    expect(go.platformType).toBe('boolean');
  });
});

describe('AUTOSAR package', () => {
  it('emits the planned file layout without MCAL access and is deterministic', () => {
    const files = generateOk(automotiveFixture());
    const names = files.map((item) => item.name);
    for (const expected of [
      'autosar/swc/AdiaSwc.c',
      'autosar/swc/AdiaSwc.h',
      'autosar/core/sm_config.h',
      'autosar/core/sm_core.h',
      'autosar/core/sm_core.c',
      'autosar/core/sm_mapping.c',
      'autosar/core/sm_safety.c',
      'autosar/core/sm_user_logic.c',
      'autosar/arxml/AdiaSwc.arxml',
      'autosar/stubs/Std_Types.h',
      'autosar/stubs/Platform_Types.h',
      'autosar/stubs/Compiler.h',
      'autosar/stubs/Compiler_Cfg.h',
      'autosar/stubs/AdiaSwc_MemMap.h',
      'autosar/stubs/Rte_AdiaSwc.h',
      'autosar/stubs/Rte_AdiaSwc_Stub.h',
      'autosar/stubs/Rte_AdiaSwc_Stub.c',
      'autosar/test/test_AdiaSwc.c',
      'autosar/Makefile',
      'autosar/doc/MISRA_Compliance.md',
      'autosar/doc/Integration_Guide.md',
    ]) {
      expect(names).toContain(expected);
    }
    expect(new Set(names).size).toBe(names.length);
    for (const item of files.filter((entry) => /^autosar\/(swc|core)\//.test(entry.name))) {
      expect(item.content, `${item.name} must not reach MCAL from an application SWC`).not.toMatch(/mcal_|MCAL_/);
      expect(item.content, `${item.name}`).not.toMatch(/\b(malloc|calloc|realloc|free|printf)\s*\(|<stdio\.h>/);
    }
    expect(names.some((name) => /mcal/i.test(name))).toBe(false);
    expect(generateAutosarSwc(automotiveFixture()).files).toEqual(files);
  });

  it('renders RTE-only runnables with compiler abstraction and paired memory sections', () => {
    const files = generateOk(automotiveFixture());
    const swc = file(files, 'autosar/swc/AdiaSwc.c');
    expect(swc).toContain('#include "Rte_AdiaSwc.h"');
    expect(swc).toContain('FUNC(void, AdiaSwc_CODE) AdiaSwc_Init(void)');
    expect(swc).toContain('FUNC(void, AdiaSwc_CODE) AdiaSwc_MainFunction(void)');
    expect(swc).toMatch(/Rte_Read_RP_go_go\s*\(/);
    expect(swc).toMatch(/Rte_Read_RP_total_total\s*\(/);
    expect(swc).toMatch(/Rte_Write_PP_ratio_ratio\s*\(/);
    expect(swc).toMatch(/Rte_Write_PP_lamp_level_lamp_level\s*\(/);
    expect(swc).toMatch(/Rte_Write_PP_SmStatus_ActiveState\s*\(/);
    expect(swc).toMatch(/Rte_Write_PP_SmStatus_ErrorStatus\s*\(/);
    expect(swc).toMatch(/Rte_Call_RP_SmFaultEvent_SetEventStatus\s*\(/);
    expect(swc).toMatch(/AdiaSwc_START_SEC_VAR_CLEARED_UNSPECIFIED/);

    for (const item of files.filter((entry) => /^autosar\/(swc|core)\/.*\.c$/.test(entry.name))) {
      const sections = [...item.content.matchAll(/#define\s+AdiaSwc_(START|STOP)_SEC_(\w+)\s*\n\s*#include\s+"AdiaSwc_MemMap\.h"/g)];
      expect(sections.length, `${item.name} must place its code in a memory section`).toBeGreaterThan(0);
      for (let index = 0; index < sections.length; index += 2) {
        expect(sections[index][1], item.name).toBe('START');
        expect(sections[index + 1]?.[1], item.name).toBe('STOP');
        expect(sections[index + 1]?.[2], item.name).toBe(sections[index][2]);
      }
      expect(item.content, `${item.name} code must be in a CODE section`).toContain('#define AdiaSwc_START_SEC_CODE');
    }
    expect(file(files, 'autosar/stubs/AdiaSwc_MemMap.h')).toContain('#error');

    const header = file(files, 'autosar/swc/AdiaSwc.h');
    expect(header).toMatch(/#define\s+ADIASWC_PERIOD_MS\s+10U/);
    expect(header).toMatch(/#define\s+ADIASWC_AR_RELEASE_MAJOR_VERSION\s+4U/);
    expect(header).toMatch(/#define\s+ADIASWC_SW_MAJOR_VERSION\s+\d+U/);
    expect(header).toMatch(/#define\s+ADIASWC_VENDOR_ID\s+\d+U/);

    const stubs = files.filter((entry) => entry.name.startsWith('autosar/stubs/')).map((entry) => entry.content).join('\n');
    expect(stubs).toMatch(/#define\s+RTE_E_OK\b/);
    expect(stubs).toMatch(/#define\s+RTE_E_NO_DATA\b[^\n]*131/);
    expect(stubs).toMatch(/#define\s+RTE_E_LOST_DATA\b[^\n]*64/);
  });

  it('describes the SWC in well-formed ARXML whose references all resolve', () => {
    const files = generateOk(automotiveFixture());
    const document = parseArxml(file(files, 'autosar/arxml/AdiaSwc.arxml'));
    const root = document.documentElement;
    expect(root.localName).toBe('AUTOSAR');
    expect(root.namespaceURI).toBe('http://autosar.org/schema/r4.0');

    expect(shortNamesOf(document, 'APPLICATION-SW-COMPONENT-TYPE')).toEqual(['AdiaSwc']);
    expect(shortNamesOf(document, 'P-PORT-PROTOTYPE').sort()).toEqual(['PP_SmStatus', 'PP_lamp_level', 'PP_ratio']);
    expect(shortNamesOf(document, 'R-PORT-PROTOTYPE').sort()).toEqual(['RP_SmFaultEvent', 'RP_count', 'RP_go', 'RP_total']);
    expect(shortNamesOf(document, 'SENDER-RECEIVER-INTERFACE').sort()).toEqual(
      ['SRI_SmStatus', 'SRI_count', 'SRI_go', 'SRI_lamp_level', 'SRI_ratio', 'SRI_total']);
    expect(shortNamesOf(document, 'CLIENT-SERVER-INTERFACE')).toEqual(['CSI_DemEvent']);
    expect(document.getElementsByTagName('INIT-EVENT').length).toBe(1);
    expect(document.getElementsByTagName('SWC-IMPLEMENTATION').length).toBe(1);

    const timing = document.getElementsByTagName('TIMING-EVENT');
    expect(timing.length).toBe(1);
    expect(Number(timing[0].getElementsByTagName('PERIOD')[0].textContent)).toBeCloseTo(0.01, 9);

    const symbols = Array.from(document.getElementsByTagName('RUNNABLE-ENTITY')).map((runnable) =>
      runnable.getElementsByTagName('SYMBOL')[0].textContent!.trim()).sort();
    expect(symbols).toEqual(['AdiaSwc_Init', 'AdiaSwc_MainFunction']);
    const main = Array.from(document.getElementsByTagName('RUNNABLE-ENTITY')).find((runnable) =>
      runnable.getElementsByTagName('SYMBOL')[0].textContent!.trim() === 'AdiaSwc_MainFunction')!;
    expect(main.getElementsByTagName('VARIABLE-ACCESS').length).toBeGreaterThanOrEqual(3 + 3);
    expect(main.getElementsByTagName('SYNCHRONOUS-SERVER-CALL-POINT').length).toBe(1);

    const ratioType = Array.from(document.getElementsByTagName('VARIABLE-DATA-PROTOTYPE')).find((element) =>
      element.getElementsByTagName('SHORT-NAME')[0].textContent!.trim() === 'ratio')!;
    expect(ratioType.getElementsByTagName('TYPE-TREF')[0].textContent!.trim())
      .toBe('/AUTOSAR_Platform/ImplementationDataTypes/float64');

    const paths = collectPaths(root);
    const references = Array.from(document.getElementsByTagName('*')).filter((element) =>
      element.hasAttribute('DEST'));
    expect(references.length).toBeGreaterThan(10);
    for (const reference of references) {
      const target = reference.textContent!.trim();
      if (target.startsWith('/AUTOSAR_Platform/')) continue;
      expect(paths.has(target), `${reference.localName} -> ${target} must resolve`).toBe(true);
    }

    const siblings = Array.from(document.getElementsByTagName('*'));
    for (const parent of siblings) {
      const names = Array.from(parent.children).flatMap((child) =>
        Array.from(child.children).filter((grand) => grand.localName === 'SHORT-NAME').map((grand) => grand.textContent!.trim()));
      expect(new Set(names).size, `duplicate SHORT-NAME under ${parent.localName}`).toBe(names.length);
    }
  });

  it('compiles stand-alone with strict flags and passes the planner behaviour test', () => {
    const files = generateOk(automotiveFixture());
    expect(compileAndRun(files, 'AdiaSwc', plannerBehaviourTest('AdiaSwc'))).toContain('PLANNER TESTS PASSED');
  });

  it('compiles the SWC translation unit under extra conversion and prototype warnings', () => {
    const files = generateOk(automotiveFixture());
    const workspace = createGeneratedCodeTestWorkspace('autosar-swc');
    try {
      const root = writePackage(workspace.directory, files);
      execFileSync('gcc', [
        ...STRICT,
        '-Wconversion', '-Wsign-conversion', '-Wshadow', '-Wcast-qual',
        '-Wstrict-prototypes', '-Wmissing-prototypes', '-Wundef',
        '-I', 'swc', '-I', 'core', '-I', 'stubs',
        '-c', 'swc/AdiaSwc.c', '-o', 'AdiaSwc.o',
      ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    } finally {
      workspace.cleanup();
    }
  });

  it('ships a generated unit test that the shipped Makefile builds and runs', () => {
    const files = generateOk(automotiveFixture());
    const workspace = createGeneratedCodeTestWorkspace('autosar-make');
    try {
      const root = writePackage(workspace.directory, files);
      const output = execFileSync('make', ['-C', root, 'test'], { encoding: 'utf8', stdio: 'pipe' });
      expect(output).toContain('ALL TESTS PASSED');
    } finally {
      workspace.cleanup();
    }
  });

  it('honours a custom SWC short name everywhere', () => {
    const files = generateOk(automotiveFixture(), 'CtApDoorLock');
    expect(files.map((item) => item.name)).toContain('autosar/swc/CtApDoorLock.c');
    expect(files.map((item) => item.name)).toContain('autosar/arxml/CtApDoorLock.arxml');
    expect(file(files, 'autosar/swc/CtApDoorLock.c')).toContain('FUNC(void, CtApDoorLock_CODE) CtApDoorLock_MainFunction(void)');
    expect(file(files, 'autosar/swc/CtApDoorLock.h')).toMatch(/#define\s+CTAPDOORLOCK_PERIOD_MS\s+10U/);
    expect(files.some((item) => item.content.includes('AdiaSwc'))).toBe(false);
    expect(compileAndRun(files, 'CtApDoorLock', plannerBehaviourTest('CtApDoorLock'))).toContain('PLANNER TESTS PASSED');
  });

  it('builds a safety-mode model without MCAL calls and still passes behaviour tests', () => {
    const files = generateOk(safetyFixture());
    for (const item of files.filter((entry) => /^autosar\/(swc|core)\//.test(entry.name))) {
      expect(item.content, item.name).not.toMatch(/mcal_|MCAL_/);
    }
    expect(compileAndRun(files, 'AdiaSwc', plannerBehaviourTest('AdiaSwc'))).toContain('PLANNER TESTS PASSED');
  });

  it('packages an X-Bridges model that compiles stand-alone', () => {
    const files = generateOk(hybridXBridgesFixture());
    expect(files.map((item) => item.name)).toContain('autosar/core/sm_xbridges.c');
    expect(compileAndRun(files, 'AdiaSwc')).toContain('ALL TESTS PASSED');
  });
});

describe('AUTOSAR generation errors', () => {
  it('rejects an SWC name that is not an AUTOSAR identifier', () => {
    for (const bad of ['1Swc', 'Door Lock', '', '_Swc', 'A'.repeat(129)]) {
      const result = generateAutosarSwc(automotiveFixture(), { swcName: bad });
      expect(result.files, bad).toEqual([]);
      expect(result.errors.map((error) => error.id), bad).toContain('AUTOSAR_INVALID_SWC_NAME');
    }
  });

  it('passes semantic-model errors through and generates nothing', () => {
    const model = automotiveFixture();
    model.safetyMode = true; // no safe state
    const result = generateAutosarSwc(model);
    expect(result.files).toEqual([]);
    expect(result.errors.map((error) => error.id)).toContain('SAFE_STATE_REQUIRED');
  });
});

describe('MISRA C:2012 subset checker', () => {
  it('finds no violation in generated SWC and core sources', () => {
    for (const model of [automotiveFixture(), safetyFixture(), hybridXBridgesFixture()]) {
      const files = generateOk(model).filter((item) => /^autosar\/(swc|core)\//.test(item.name));
      expect(checkMisraSubset(files)).toEqual([]);
    }
  });

  it('reports the generated compliance document with the checked rules', () => {
    const report = file(generateOk(automotiveFixture()), 'autosar/doc/MISRA_Compliance.md');
    for (const rule of ['Rule 15.1', 'Rule 15.6', 'Rule 17.7', 'Rule 21.3', 'Rule 21.6', 'Rule 7.3']) {
      expect(report).toContain(rule);
    }
    expect(report).toMatch(/[Dd]eviation/);
  });

  it.each([
    ['Rule 15.1', 'void f(void) { goto done; done: ; }'],
    ['Rule 21.3', 'void f(void) { void *p = malloc(4U); free(p); }'],
    ['Rule 21.6', '#include <stdio.h>\nvoid f(void) { }'],
    ['Rule 17.1', '#include <stdarg.h>\nvoid f(void) { }'],
    ['Rule 21.7', 'int f(const char *s) { return atoi(s); }'],
    ['Rule 21.8', 'void f(void) { abort(); }'],
    ['Rule 7.3', 'long f(void) { return 10l; }'],
    ['Rule 15.6', 'int f(int a) {\n    if (a > 0)\n        return 1;\n    return 0;\n}'],
    ['Rule 4.2', 'const char *s = "??=";'],
    ['Rule 3.1', '/* outer /* inner */\nvoid f(void) { }'],
  ])('detects %s', (rule, source) => {
    const findings = checkMisraSubset([{ name: 'bad.c', content: source }]);
    expect(findings.map((finding) => finding.rule)).toContain(rule);
    expect(findings[0]).toMatchObject({ file: 'bad.c' });
    expect(typeof findings[0].line).toBe('number');
  });

  it('does not flag braces-on-same-line, comments or string contents', () => {
    const clean = [
      '/* malloc and goto in a comment are fine */',
      'static int g(int a)',
      '{',
      '    if (a > 0) {',
      '        return 1;',
      '    } else if (a < 0) {',
      '        return -1;',
      '    } else {',
      '        return 0;',
      '    }',
      '}',
      'static const char *msg = "free(x) goto";',
    ].join('\n');
    expect(checkMisraSubset([{ name: 'ok.c', content: clean }])).toEqual([]);
  });
});
