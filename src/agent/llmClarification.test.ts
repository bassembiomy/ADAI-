import { describe, it, expect } from 'vitest';
import {
  validateLlmClarificationPayload,
  canApplyLlmIntent,
  extractLlmClarification,
  KNOWN_BEHAVIOR_VOCABULARY,
  CLARIFIABLE_INTENTS,
} from './llmClarification';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';

class ScriptedLlm implements LlmProvider {
  public generateCalls = 0;
  public healthCalls = 0;
  constructor(
    private readonly opts: {
      healthy?: boolean;
      payload?: unknown;
      success?: boolean;
      hangHealth?: boolean;
      hangGenerate?: boolean;
      throwOnGenerate?: boolean;
    } = {},
  ) {}

  async health(): Promise<LlmHealth> {
    this.healthCalls += 1;
    if (this.opts.hangHealth) return new Promise<LlmHealth>(() => {});
    return { available: this.opts.healthy ?? true, model: 'scripted', latencyMs: 1 };
  }

  async generate<T>(_req: LlmRequest, _schema?: JsonSchema): Promise<LlmResult<T>> {
    this.generateCalls += 1;
    if (this.opts.hangGenerate) return new Promise<LlmResult<T>>(() => {});
    if (this.opts.throwOnGenerate) throw new Error('ollama exploded');
    if (this.opts.success === false) {
      return { success: false, error: 'model returned invalid JSON' };
    }
    return {
      success: true,
      data: this.opts.payload as T,
      rawOutput: JSON.stringify(this.opts.payload),
    };
  }
}

describe('validateLlmClarificationPayload (deterministic validation)', () => {
  it('accepts a fully valid payload', () => {
    const result = validateLlmClarificationPayload({
      intent: 'diagnose',
      behaviors: ['motor_drive', 'closed_loop_control'],
      objective: '  Three-phase drive check  ',
    });
    expect(result.intent).toBe('diagnose');
    expect(result.behaviors).toEqual(['closed_loop_control', 'motor_drive']);
    expect(result.objective).toBe('Three-phase drive check');
  });

  it('drops unknown intents and never invents one', () => {
    expect(validateLlmClarificationPayload({ intent: 'transmogrify' }).intent).toBeUndefined();
    expect(validateLlmClarificationPayload({ intent: 42 }).intent).toBeUndefined();
  });

  it('filters behaviors to the known vocabulary only', () => {
    const result = validateLlmClarificationPayload({
      behaviors: ['quantum_warp', 'motor_drive', 'motor_drive', 7, null, 'perpetual_motion'],
    });
    expect(result.behaviors).toEqual(['motor_drive']);
  });

  it('caps and trims the objective; empty objective is dropped', () => {
    const long = 'x'.repeat(900);
    expect(validateLlmClarificationPayload({ objective: long }).objective).toHaveLength(500);
    expect(validateLlmClarificationPayload({ objective: '   ' }).objective).toBeUndefined();
    expect(validateLlmClarificationPayload({ objective: 3 }).objective).toBeUndefined();
  });

  it('ignores adversarial structural fields entirely', () => {
    const result = validateLlmClarificationPayload({
      blocks: [{ id: 'FLUX_CAPACITOR' }],
      ports: ['magic_port'],
      parameters: { gain: 99 },
      quantities: [{ name: 'voltage', value: 1e9 }],
      plan: { actions: [{ kind: 'add_block', blockType: 'FLUX_CAPACITOR' }] },
      objective: 'ok',
    });
    expect(result).toEqual({ behaviors: [], objective: 'ok' });
  });

  it('returns an empty clarification for non-object payloads', () => {
    expect(validateLlmClarificationPayload(undefined)).toEqual({ behaviors: [] });
    expect(validateLlmClarificationPayload('create a filter')).toEqual({ behaviors: [] });
    expect(validateLlmClarificationPayload(['motor_drive'])).toEqual({ behaviors: [] });
  });

  it('covers the full intent enum and a stable behavior vocabulary', () => {
    expect(CLARIFIABLE_INTENTS).toEqual(['create', 'inspect', 'modify', 'diagnose', 'repair', 'optimize']);
    expect(KNOWN_BEHAVIOR_VOCABULARY).toContain('closed_loop_control');
    expect(KNOWN_BEHAVIOR_VOCABULARY).toContain('low_pass_filter');
    expect(new Set(KNOWN_BEHAVIOR_VOCABULARY).size).toBe(KNOWN_BEHAVIOR_VOCABULARY.length);
  });
});

describe('canApplyLlmIntent (deterministic signals always win)', () => {
  it('never overrides an explicitly classified action intent', () => {
    expect(canApplyLlmIntent('anything', 'modify')).toBe(false);
    expect(canApplyLlmIntent('anything', 'inspect')).toBe(false);
  });

  it('refuses to override when the user text carries a creation verb', () => {
    expect(canApplyLlmIntent('Create a low pass filter', 'create')).toBe(false);
    expect(canApplyLlmIntent('please BUILD me an inverter', 'create')).toBe(false);
    expect(canApplyLlmIntent('make a gain block', 'create')).toBe(false);
  });

  it('allows refinement only for ambiguous verb-less requests', () => {
    expect(canApplyLlmIntent('why does my model oscillate', 'create')).toBe(true);
    expect(canApplyLlmIntent('the output looks wrong', 'create')).toBe(true);
  });
});

describe('extractLlmClarification (bounded, non-authoritative round-trip)', () => {
  it('skips generation entirely when the provider is unhealthy', async () => {
    const llm = new ScriptedLlm({ healthy: false, payload: { intent: 'repair' } });
    const result = await extractLlmClarification(llm, 'anything');
    expect(result).toBeUndefined();
    expect(llm.generateCalls).toBe(0);
  });

  it('returns undefined when generation fails', async () => {
    const llm = new ScriptedLlm({ success: false });
    expect(await extractLlmClarification(llm, 'anything')).toBeUndefined();
  });

  it('returns undefined when the provider throws', async () => {
    const llm = new ScriptedLlm({ throwOnGenerate: true });
    expect(await extractLlmClarification(llm, 'anything')).toBeUndefined();
  });

  it('returns undefined when health hangs past the timeout', async () => {
    const llm = new ScriptedLlm({ hangHealth: true });
    const started = Date.now();
    const result = await extractLlmClarification(llm, 'anything', { timeoutMs: 30 });
    expect(result).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('returns undefined when generation hangs past the timeout', async () => {
    const llm = new ScriptedLlm({ hangGenerate: true });
    const started = Date.now();
    const result = await extractLlmClarification(llm, 'anything', { timeoutMs: 30 });
    expect(result).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('returns undefined when validation strips the payload to nothing', async () => {
    const llm = new ScriptedLlm({ payload: { blocks: ['FLUX_CAPACITOR'], intent: 'warp' } });
    expect(await extractLlmClarification(llm, 'anything')).toBeUndefined();
  });

  it('returns only the validated subset of a valid payload', async () => {
    const llm = new ScriptedLlm({
      payload: { intent: 'diagnose', behaviors: ['low_pass_filter', 'alien_tech'], objective: 'check the filter' },
    });
    const result = await extractLlmClarification(llm, 'something is off with my filter');
    expect(result).toEqual({
      intent: 'diagnose',
      behaviors: ['low_pass_filter'],
      objective: 'check the filter',
    });
  });
});
