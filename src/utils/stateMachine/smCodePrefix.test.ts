import { describe, expect, it } from 'vitest';
import { applyCodePrefix, applyCodePrefixToSource, codePrefixProblem, prefixedFileName } from './smCodePrefix';

describe('code prefix rename pass', () => {
  it('renames whole identifiers only', () => {
    const out = applyCodePrefixToSource('SM_Init(x); MY_SM_Init(y); SM_TICK_MS; sm_core_x; xsm_core; ADIA_Instance_t a; ADIA_INSTANCE', 'PUMP');
    expect(out).toBe('PUMP_Init(x); MY_SM_Init(y); PUMP_TICK_MS; pump_core_x; xsm_core; PUMP_Instance_t a; ADIA_INSTANCE');
  });

  it('renames in comments, keeps string and char literals, renames include paths', () => {
    const src = [
      '#include "sm_core.h"',
      '#include "mcal_dio.h"',
      '#include <stdio.h>',
      '/* SM_Step is called from sm_core.c */',
      '// SM_Reset',
      'const char *label = "SM_Step \\" sm_core";',
      "char c = 'S';",
      'int n = 12U + SM_X;',
    ].join('\n');
    expect(applyCodePrefixToSource(src, 'PUMP').split('\n')).toEqual([
      '#include "pump_core.h"',
      '#include "pump_mcal_dio.h"',
      '#include <stdio.h>',
      '/* PUMP_Step is called from pump_core.c */',
      '// PUMP_Reset',
      'const char *label = "SM_Step \\" sm_core";',
      "char c = 'S';",
      'int n = 12U + PUMP_X;',
    ]);
  });

  it('prefixes channel macros and guards but leaves the MCAL driver functions', () => {
    const out = applyCodePrefixToSource('#ifndef MCAL_DIO_H\nbool MCAL_Dio_ReadChannel(uint32_t c);\n#define MCAL_CH_START 1U\nMCAL_ApplySafeOutputs();', 'PUMP');
    expect(out).toContain('#ifndef PUMP_MCAL_DIO_H');
    expect(out).toContain('bool MCAL_Dio_ReadChannel(uint32_t c);');
    expect(out).toContain('#define PUMP_MCAL_CH_START 1U');
    expect(out).toContain('MCAL_ApplySafeOutputs();');
  });

  it('is the identity for the default prefix and renames file names', () => {
    const files = [{ name: 'production/sm_core.c', content: 'SM_Init();' }, { name: 'mcal_dio.h', content: '' }, { name: 'tests/test_support.h', content: '' }];
    expect(applyCodePrefix(files, 'SM')).toEqual(files);
    expect(applyCodePrefix(files, undefined)).toEqual(files);
    expect(applyCodePrefix(files, 'PUMP').map((file) => file.name)).toEqual(['production/pump_core.c', 'pump_mcal_dio.h', 'tests/test_support.h']);
    expect(prefixedFileName('sm_testing_report.md', 'PUMP')).toBe('pump_testing_report.md');
  });

  it('validates prefixes', () => {
    for (const ok of ['PUMP', 'MOTOR_A', 'X1', 'A'.repeat(16)]) expect(codePrefixProblem(ok), ok).toBeNull();
    for (const bad of ['pump', '9X', 'A-B', '_X', '', 'A'.repeat(17), 'MCAL', 'ADIA', 'HAL', 'HIL', 'ERR', 'SIG', 'INT8', 'NULL']) {
      expect(codePrefixProblem(bad), bad).not.toBeNull();
    }
  });
});
