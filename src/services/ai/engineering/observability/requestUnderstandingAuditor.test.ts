import { describe, it, expect, beforeEach } from 'vitest';
import {
  RequestUnderstandingAuditor,
  redactSensitiveContent,
  RequestUnderstandingAuditEvent
} from './requestUnderstandingAuditor';

describe('Request Understanding Auditor & Observability', () => {
  let auditor: RequestUnderstandingAuditor;

  beforeEach(() => {
    auditor = new RequestUnderstandingAuditor(100);
  });

  describe('redactSensitiveContent', () => {
    it('redacts API keys and secrets while preserving engineering content', () => {
      const input = 'Add 10 and 20 with api_key=AIzaSyD-1234567890abcdef and secret: mySecretPassword!';
      const redacted = redactSensitiveContent(input);

      expect(redacted).not.toContain('AIzaSyD-1234567890abcdef');
      expect(redacted).not.toContain('mySecretPassword!');
      expect(redacted).toContain('Add 10 and 20');
      expect(redacted).toContain('[REDACTED_');
    });

    it('redacts email addresses and bearer tokens', () => {
      const input = 'Create PID controller Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 for user engineer@domain.com';
      const redacted = redactSensitiveContent(input);

      expect(redacted).not.toContain('engineer@domain.com');
      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(redacted).toContain('Create PID controller');
    });

    it('leaves standard engineering prompts unredacted', () => {
      const input = 'Create a transfer function with numerator: [1], denominator: [1, 2, 1]';
      const redacted = redactSensitiveContent(input);
      expect(redacted).toBe(input);
    });
  });

  describe('Auditor Event Recording', () => {
    it('records structured audit event with hashes, outcomes, slots, and durations', () => {
      const event = auditor.recordEvent({
        normalizedRequestHash: 'abc123hash',
        extractorOutcome: 'ready',
        routeSource: 'deterministic',
        unresolvedSlotIds: [],
        catalogResolutionOutcome: {
          totalEntities: 3,
          resolvedCount: 3,
          gapCount: 0
        },
        planHash: 'plan_hash_456',
        stageDurationsMs: {
          normalizationMs: 2,
          extractionMs: 5,
          catalogResolutionMs: 3,
          planningMs: 10,
          totalMs: 20
        },
        redactedInput: 'Add 10 and 20'
      });

      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.normalizedRequestHash).toBe('abc123hash');
      expect(event.extractorOutcome).toBe('ready');
      expect(event.routeSource).toBe('deterministic');
      expect(event.catalogResolutionOutcome.resolvedCount).toBe(3);
      expect(event.stageDurationsMs.totalMs).toBe(20);
      expect(auditor.getEvents()).toHaveLength(1);
    });

    it('records failed understanding and legacy fallback with reason without hidden reasoning', () => {
      const event = auditor.recordEvent({
        normalizedRequestHash: 'unsupported_hash_789',
        extractorOutcome: 'unsupported',
        routeSource: 'legacy_fallback',
        unresolvedSlotIds: [],
        catalogResolutionOutcome: {
          totalEntities: 0,
          resolvedCount: 0,
          gapCount: 0
        },
        fallbackReason: 'Non-engineering prompt: write a poem',
        stageDurationsMs: {
          normalizationMs: 1,
          extractionMs: 2,
          totalMs: 3
        },
        redactedInput: 'write a poem about circuits'
      });

      expect(event.extractorOutcome).toBe('unsupported');
      expect(event.routeSource).toBe('legacy_fallback');
      expect(event.fallbackReason).toBe('Non-engineering prompt: write a poem');
      expect(event.planHash).toBeUndefined();
      // Verifies no hidden chain of thought or raw reasoning is attached
      expect((event as any).reasoning).toBeUndefined();
      expect((event as any).chainOfThought).toBeUndefined();
    });

    it('records unresolved slot IDs on clarification required', () => {
      const event = auditor.recordEvent({
        normalizedRequestHash: 'clarify_hash_101',
        extractorOutcome: 'clarification_required',
        routeSource: 'deterministic',
        unresolvedSlotIds: ['slot_operands_1'],
        catalogResolutionOutcome: {
          totalEntities: 1,
          resolvedCount: 1,
          gapCount: 0
        },
        stageDurationsMs: {
          normalizationMs: 1,
          extractionMs: 3,
          totalMs: 4
        },
        redactedInput: 'Add two numbers'
      });

      expect(event.extractorOutcome).toBe('clarification_required');
      expect(event.unresolvedSlotIds).toEqual(['slot_operands_1']);
    });

    it('caps maximum events to prevent unbounded memory growth', () => {
      const smallAuditor = new RequestUnderstandingAuditor(3);
      for (let i = 0; i < 5; i++) {
        smallAuditor.recordEvent({
          normalizedRequestHash: `hash_${i}`,
          extractorOutcome: 'ready',
          routeSource: 'deterministic',
          unresolvedSlotIds: [],
          catalogResolutionOutcome: { totalEntities: 1, resolvedCount: 1, gapCount: 0 },
          stageDurationsMs: { totalMs: 1 },
          redactedInput: `test ${i}`
        });
      }

      expect(smallAuditor.getEvents()).toHaveLength(3);
      expect(smallAuditor.getEvents()[0].normalizedRequestHash).toBe('hash_2');
      expect(smallAuditor.getEvents()[2].normalizedRequestHash).toBe('hash_4');
    });
  });
});
