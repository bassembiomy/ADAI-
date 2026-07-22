import { describe, it, expect } from 'vitest';
import { runAntigravityPipeline } from './antigravityRunner';

describe('antigravityRunner - Re-Entry Self-Healing & Pipeline', () => {
  it('should auto-fix pass-by-value pointer errors and generate diff log', async () => {
    const rawFiles = {
      'sm_core.h': `#include <stdint.h>\ntypedef struct { uint32_t current_state; } ADIA_Instance_t;\nvoid SM_Init(ADIA_Instance_t instance);`,
      'sm_core.c': `#include "sm_core.h"\nvoid SM_Init(ADIA_Instance_t instance) { / MISRA 15.7 / instance.current_state = 0U; }`
    };

    const res = await runAntigravityPipeline(rawFiles);
    expect(res.success).toBe(true);
    expect(res.files['sm_core.c']).toContain('void SM_Init(ADIA_Instance_t* instance)');
    expect(res.files['sm_core.c']).toContain('instance->current_state = 0U;');
    expect(res.files['sm_core.c']).toContain('/* MISRA 15.7 */');
    expect(res.diffLog).toContain('# Antigravity Auto-Patch Log');
  });

  it('should enforce maximum 3 re-entry loops safety valve on unresolvable errors', async () => {
    const brokenFiles = {
      'sm_core.c': `void SM_Broken(void) { int x = ; }`
    };

    const res = await runAntigravityPipeline(brokenFiles);
    expect(res.success).toBe(false);
    expect(res.status).toBe('REENTRY_FAILED');
    expect(res.loopsUsed).toBeLessThanOrEqual(3);
  });
});
