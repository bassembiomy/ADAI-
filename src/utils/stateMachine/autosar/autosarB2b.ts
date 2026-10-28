/**
 * Back-to-back test shipped in the package (`test/test_<SWC>_b2b.c`): seeded input vectors for every required
 * port with the per-cycle expectations (ActiveState, ErrorStatus flag, every provided port) computed at generation
 * time by ADIA's semantic interpreter. Any host C compiler reproduces the comparison without ADIA.
 * Browser-safe: no Node import.
 */
import { isFloatPortType, type AutosarPort } from './autosarPorts';
import type { SwcRenderContext } from './autosarSwc';
import { traceComment } from './autosarTrace';
import { AUTOSAR_DEFAULT_RTE_ERROR_LIMIT, type OracleRun } from './autosarVectors';

const lines = (...parts: Array<string | null | undefined>): string =>
  `${parts.filter((part): part is string => typeof part === 'string').join('\n')}\n`;

const cDouble = (value: number): string => {
  if (Number.isNaN(value)) return 'NAN';
  if (value === Number.POSITIVE_INFINITY) return 'INFINITY';
  if (value === Number.NEGATIVE_INFINITY) return '(-INFINITY)';
  const text = Object.is(value, -0) ? '0' : String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

const chunked = (items: readonly string[], perRow = 8): string[] => {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += perRow) {
    rows.push(`    ${items.slice(index, index + perRow).join(', ')}${index + perRow < items.length ? ',' : ''}`);
  }
  return rows;
};

export const renderB2bTest = (ctx: SwcRenderContext, oracle: OracleRun): string => {
  const { swc, swcUpper, ports } = ctx;
  const hasFloat = ports.required.some((port) => isFloatPortType(port.platformType))
    || ports.provided.some((port) => isFloatPortType(port.platformType));
  const rowsCount = oracle.rows.length;
  const stub = (port: AutosarPort, kind: 'RP' | 'PP'): string => `Rte_Stub_${kind}_${port.cName}_${port.dataElementName}`;

  const inputTables = ports.required.flatMap((port, index) => [
    `/* ${port.portName} (${port.platformType}, policy ${port.invalidInputPolicy ?? 'reject'}): delivered value and read status per cycle. */`,
    `static const double b2b_in_${index}[B2B_CYCLES] = {`,
    ...chunked(oracle.values[index].map(cDouble)),
    '};',
    `static const uint8 b2b_st_${index}[B2B_CYCLES] = {`,
    ...chunked(oracle.status[index].map((code) => `${code}U`), 24),
    '};',
    '',
  ]);
  const expectation = (position: number): string[] => oracle.rows.map((row) => row[position]).map(String);
  const outputTables = [
    'static const uint16 b2b_exp_state[B2B_ROWS] = {',
    ...chunked(expectation(0).map((value) => `${value}U`), 16),
    '};',
    'static const uint8 b2b_exp_error[B2B_ROWS] = {',
    ...chunked(expectation(1).map((value) => `${value}U`), 24),
    '};',
    ...ports.provided.flatMap((port, index) => [
      `/* ${port.portName} (${port.platformType}${port.safeValue === undefined ? '' : `, safe value ${String(port.safeValue)}`}) */`,
      `static const double b2b_exp_${index}[B2B_ROWS] = {`,
      ...chunked(oracle.rows.map((row) => cDouble(row[2 + index]))),
      '};',
    ]),
  ];

  const inputAssign = ports.required.map((port, index) => port.platformType === 'boolean'
    ? `        ${stub(port, 'RP')}_Value = (b2b_in_${index}[cycle] != 0.0) ? TRUE : FALSE;`
    : `        ${stub(port, 'RP')}_Value = (${port.platformType})b2b_in_${index}[cycle];`);
  const statusAssign = ports.required.map((port, index) =>
    `        ${stub(port, 'RP')}_Status = b2b_status(b2b_st_${index}[cycle]);`);
  const compareProvided = ports.provided.map((port, index) =>
    `    b2b_compare("${port.portName}", ${index + 2}U, b2b_exp_${index}[row], (double)${stub(port, 'PP')}_Value, ${isFloatPortType(port.platformType) ? 1 : 0}, cycle);`);

  return lines(
    '/*',
    ' * Back-to-back test of the software component against the ADIA semantic interpreter.',
    ' * The input vectors and the expected outputs below were computed at generation time by the',
    ' * ADIA semantic interpreter (model semantics); this file compares them with the generated C.',
    ' * Comparison rule: integers and booleans exact, floats bit-exact or within 1e-12 relative.',
    ` * ${oracle.cycles} cycles, the component is re-initialised every ${oracle.episodeCycles} cycles; failed reads, non-finite floats and`,
    ' * bursts of consecutive failures are part of the vectors; integer inputs cover the whole type range, including its limits.',
    ' */',
    ...traceComment(ctx.fingerprint),
    '#include <stdio.h>',
    ...(hasFloat ? ['#include <math.h>'] : []),
    `#include "${swc}.h"`,
    `#include "Rte_${swc}_Stub.h"`,
    '',
    '/* `make test` defines ADIA_B2B_MAIN for this test only; in any other build this file is an empty unit (it has its own main). */',
    '#ifdef ADIA_B2B_MAIN',
    '',
    `#if ${swcUpper}_RTE_ERROR_LIMIT != ${AUTOSAR_DEFAULT_RTE_ERROR_LIMIT}U`,
    `#error "The back-to-back vectors assume ${swcUpper}_RTE_ERROR_LIMIT = ${AUTOSAR_DEFAULT_RTE_ERROR_LIMIT}U; build this test with the default."`,
    '#endif',
    '',
    `#define B2B_CYCLES ${oracle.cycles}U`,
    `#define B2B_EPISODE ${oracle.episodeCycles}U`,
    `#define B2B_ROWS ${rowsCount}U`,
    `#define B2B_SIGNALS ${2 + ports.provided.length}U`,
    '',
    ...inputTables,
    ...outputTables,
    '',
    'static unsigned int b2b_failures = 0U;',
    'static unsigned int row = 0U;',
    '',
    ...(ports.required.length === 0 ? [] : [
      'static Std_ReturnType b2b_status(uint8 code)',
      '{',
      '    Std_ReturnType status = RTE_E_NO_DATA;',
      '    if (code == 0U) {',
      '        status = RTE_E_OK;',
      '    } else if (code == 1U) {',
      '        status = RTE_E_LOST_DATA;',
      '    } else {',
      '        status = RTE_E_NO_DATA;',
      '    }',
      '    return status;',
      '}',
      '',
    ]),
    'static int b2b_match(double expected, double actual, int is_float)',
    '{',
    '    int match = 0;',
    '    if (expected == actual) {',
    '        match = 1;',
    ...(hasFloat
      ? [
        '    } else if ((is_float != 0) && (isfinite(expected) != 0) && (isfinite(actual) != 0)) {',
        '        const double scale = (fabs(expected) > fabs(actual)) ? fabs(expected) : fabs(actual);',
        '        if (fabs(expected - actual) <= (1e-12 * scale)) {',
        '            match = 1;',
        '        }',
      ]
      : ['    } else if (is_float != 0) {', '        match = 0;']),
    '    } else {',
    '        match = 0;',
    '    }',
    '    return match;',
    '}',
    '',
    'static void b2b_compare(const char *name, unsigned int signal, double expected, double actual, int is_float, unsigned int cycle)',
    '{',
    '    if (b2b_match(expected, actual, is_float) == 0) {',
    '        ++b2b_failures;',
    '        if (b2b_failures <= 10U) {',
    '            (void)printf("B2B MISMATCH cycle %u row %u signal %u %s: interpreter=%.17g generated C=%.17g\\n", cycle, row, signal, name, expected, actual);',
    '        }',
    '    }',
    '}',
    '',
    '/* Compares ActiveState, ErrorStatus != 0 and every provided port with the interpreter row. */',
    'static void b2b_check(unsigned int cycle)',
    '{',
    '    if (row >= B2B_ROWS) {',
    '        ++b2b_failures;',
    '    } else {',
    '        b2b_compare("ActiveState", 0U, (double)b2b_exp_state[row], (double)Rte_Stub_PP_SmStatus_ActiveState_Value, 0, cycle);',
    '        b2b_compare("ErrorStatus != 0", 1U, (double)b2b_exp_error[row], (Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U) ? 1.0 : 0.0, 0, cycle);',
    ...compareProvided,
    '        ++row;',
    '    }',
    '}',
    '',
    'int main(void)',
    '{',
    '    unsigned int cycle;',
    '    Rte_Stub_Reset();',
    `    ${swc}_Init();`,
    '    b2b_check(0U);',
    '    for (cycle = 0U; cycle < B2B_CYCLES; cycle++) {',
    '        if ((cycle > 0U) && ((cycle % B2B_EPISODE) == 0U)) {',
    '            Rte_Stub_Reset();',
    `            ${swc}_Init();`,
    '            b2b_check(cycle);',
    '        }',
    ...inputAssign,
    ...statusAssign,
    `        ${swc}_MainFunction();`,
    '        b2b_check(cycle + 1U);',
    '    }',
    '    if ((b2b_failures != 0U) || (row != B2B_ROWS)) {',
    '        (void)printf("B2B FAILED: %u mismatch(es), %u of %u rows compared\\n", b2b_failures, row, B2B_ROWS);',
    '        return 1;',
    '    }',
    '    (void)printf("B2B PASSED: %u cycles, %u rows, %u signals compared with the ADIA semantic interpreter\\n", B2B_CYCLES, B2B_ROWS, B2B_SIGNALS);',
    '    return 0;',
    '}',
    '',
    '#else',
    'typedef int ADIA_B2B_Not_Built_t;',
    '#endif /* ADIA_B2B_MAIN */',
  );
};
