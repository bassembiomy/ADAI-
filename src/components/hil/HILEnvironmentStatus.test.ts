import { describe, expect, it } from 'vitest';
import { summarizeTargetStatus, HILTargetEnvStatus } from './HILEnvironmentStatus';

const tool = (ok: boolean) => ({ ok, tool: 't', path: ok ? '/p' : null, version: null });
const base = (over: Partial<HILTargetEnvStatus>): HILTargetEnvStatus => ({
  target: 'STM32F4', compiler: tool(true), flasher: tool(true), ...over,
});

describe('summarizeTargetStatus', () => {
  it('is unknown before the IPC answers', () => {
    expect(summarizeTargetStatus(null).level).toBe('unknown');
  });
  it('reports ready when nothing is blocked', () => {
    const s = summarizeTargetStatus(base({}));
    expect(s.level).toBe('ready');
    expect(s.compileBlockedReason).toBeUndefined();
    expect(s.flashBlockedReason).toBeUndefined();
  });
  it('blocks compile and flash with the compile reason when the compiler is missing', () => {
    const s = summarizeTargetStatus(base({ compiler: tool(false), compileBlockedReason: 'no gcc', flashBlockedReason: 'no gcc' }));
    expect(s.level).toBe('blocked');
    expect(s.compileBlockedReason).toBe('no gcc');
    expect(s.flashBlockedReason).toBe('no gcc');
  });
  it('allows compile but blocks flash when only the flasher is missing', () => {
    const s = summarizeTargetStatus(base({ flasher: tool(false), flashBlockedReason: 'no openocd' }));
    expect(s.level).toBe('partial');
    expect(s.compileBlockedReason).toBeUndefined();
    expect(s.flashBlockedReason).toBe('no openocd');
  });
  it('marks ESP32 as unsupported', () => {
    const s = summarizeTargetStatus(base({ target: 'ESP32', code: 'TARGET_NOT_YET_SUPPORTED', compileBlockedReason: 'x', flashBlockedReason: 'x' }));
    expect(s.level).toBe('unsupported');
  });
});
