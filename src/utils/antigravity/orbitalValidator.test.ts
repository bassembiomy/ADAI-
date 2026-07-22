import { describe, it, expect } from 'vitest';
import { generateMockMcalHeader } from './mcalMockGen';
import { runOrbitalValidation } from './orbitalValidator';

describe('mcalMockGen & orbitalValidator', () => {
  it('should generate valid mock MCAL header with uint32_t channel parameters', () => {
    const header = generateMockMcalHeader();
    expect(header).toContain('MCAL_Dio_ReadChannel(uint32_t channel)');
    expect(header).toContain('MCAL_Dio_WriteChannel(uint32_t channel, bool val)');
  });

  it('should execute dry-run validation on valid C code cleanly', async () => {
    const mockFiles = {
      'sm_config.h': '#ifndef SM_CONFIG_H\n#define SM_CONFIG_H\n#include <stdint.h>\n#endif',
      'sm_core.h': '#ifndef SM_CORE_H\n#define SM_CORE_H\n#include <stdint.h>\ntypedef struct { uint32_t current_state; } ADIA_Instance_t;\nvoid SM_Init(ADIA_Instance_t* instance);\n#endif',
      'sm_core.c': '#include "sm_config.h"\n#include "sm_core.h"\nvoid SM_Init(ADIA_Instance_t* instance) { if (instance) { instance->current_state = 0U; } }'
    };

    const res = await runOrbitalValidation(mockFiles);
    expect(res.success).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('should catch syntax errors in invalid C code', async () => {
    const invalidFiles = {
      'sm_core.c': 'void SM_Init(ADIA_Instance_t instance) { broken syntax error here }'
    };

    const res = await runOrbitalValidation(invalidFiles);
    expect(res.success).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
