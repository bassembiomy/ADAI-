import { describe, it, expect } from 'vitest';
import { sanitizePointers } from './pointerShield';

describe('pointerShield - NO_POINTER_STRIP Protocol', () => {
  it('should convert ADIA_Instance_t parameters to pass-by-pointer and convert dot access to arrow access', () => {
    const rawC = `
      void SM_Safety_Check(ADIA_Instance_t instance) {
          instance.state_timer++;
          if (instance.current_state == 1U) {
              return;
          }
      }
    `;
    const result = sanitizePointers(rawC);
    expect(result).toContain('void SM_Safety_Check(ADIA_Instance_t* instance)');
    expect(result).toContain('instance->state_timer++;');
    expect(result).toContain('instance->current_state == 1U');
  });

  it('should preserve existing pointer asterisks if already present', () => {
    const rawC = `
      void SM_Init(ADIA_Instance_t* instance) {
          instance->current_state = 0U;
      }
    `;
    const result = sanitizePointers(rawC);
    expect(result).toContain('void SM_Init(ADIA_Instance_t* instance)');
    expect(result).toContain('instance->current_state = 0U;');
  });

  it('should handle const ADIA_Instance_t parameters', () => {
    const rawC = `
      bool SM_IsActive(const ADIA_Instance_t instance) {
          return instance.current_state != 0U;
      }
    `;
    const result = sanitizePointers(rawC);
    expect(result).toContain('bool SM_IsActive(const ADIA_Instance_t* instance)');
    expect(result).toContain('return instance->current_state != 0U;');
  });
});
