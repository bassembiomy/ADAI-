import { describe, it, expect } from 'vitest';
import {
  RequestConfidencePolicy,
  CONFIDENCE_THRESHOLDS,
  computeDeterministicConfidence
} from './requestConfidencePolicy';
import { StructuredEngineeringRequest } from '../contracts/structuredEngineeringRequest';

describe('RequestConfidencePolicy', () => {
  const policy = new RequestConfidencePolicy();

  const createBaseRequest = (overrides?: Partial<StructuredEngineeringRequest>): StructuredEngineeringRequest => ({
    schemaVersion: '1.0.0',
    requestId: 'req_test_1',
    originalText: 'Add 10 and 20',
    normalizedText: 'add 10 and 20',
    intent: 'create',
    operations: ['add'],
    entities: [
      { id: 'c1', semanticType: 'Constant', sourceText: '10', catalogBlockId: 'Constant', confidence: 1.0 },
      { id: 'c2', semanticType: 'Constant', sourceText: '20', catalogBlockId: 'Constant', confidence: 1.0 },
      { id: 's1', semanticType: 'Sum', sourceText: 'add', catalogBlockId: 'Sum', confidence: 1.0 }
    ],
    values: [
      { id: 'v1', kind: 'number', sourceText: '10', normalizedValue: 10, confidence: 1.0 },
      { id: 'v2', kind: 'number', sourceText: '20', normalizedValue: 20, confidence: 1.0 }
    ],
    relationships: [
      { id: 'r1', type: 'feeds', sourceEntityId: 'c1', targetEntityId: 's1', sourceText: '10 feeds Sum' },
      { id: 'r2', type: 'feeds', sourceEntityId: 'c2', targetEntityId: 's1', sourceText: '20 feeds Sum' }
    ],
    requestedOutputs: [],
    constraints: [],
    unresolvedRequirements: [],
    confidence: 1.0,
    evidence: [{ source: 'user', description: 'test' }],
    ...overrides
  });

  describe('Missing REQUIRED slot policy', () => {
    it('treats missing REQUIRED values as blocking regardless of confidence score', () => {
      const request = createBaseRequest({
        confidence: 1.0, // High confidence must NOT bypass missing REQUIRED slot!
        unresolvedRequirements: [
          {
            id: 'slot_operands',
            slotName: 'operands',
            classification: 'REQUIRED',
            valueSchema: 'number[]',
            prompt: 'Please provide the two numbers to add.',
            reason: 'Arithmetic requires operands',
            affectedDecisionIds: ['add_operands'],
            status: 'unresolved'
          }
        ]
      });

      const outcome = policy.evaluate(request);
      expect(outcome.status).toBe('clarification_required');
      if (outcome.status === 'clarification_required') {
        expect(outcome.clarificationQuestion.targetSlotId).toBe('slot_operands');
        expect(outcome.clarificationQuestion.question).toBe('Please provide the two numbers to add.');
        expect(outcome.clarificationQuestion.reason).toBe('Arithmetic requires operands');
      }
    });

    it('keeps OPTIONAL, INFERABLE, and DEFAULTABLE values explicit in assumptions', () => {
      const request = createBaseRequest({
        unresolvedRequirements: [
          {
            id: 'slot_obs',
            slotName: 'observability',
            classification: 'OPTIONAL',
            valueSchema: 'string',
            prompt: 'Observe on scope?',
            reason: 'Observability',
            affectedDecisionIds: ['scope_opt'],
            status: 'unresolved'
          },
          {
            id: 'slot_gains',
            slotName: 'pid_gains',
            classification: 'DEFAULTABLE',
            valueSchema: 'object',
            prompt: 'PID gains',
            reason: 'Tuning',
            affectedDecisionIds: ['pid_gains'],
            status: 'unresolved',
            resolvedValue: { Kp: 1, Ki: 0, Kd: 0 }
          }
        ]
      });

      const outcome = policy.evaluate(request);
      expect(outcome.status).toBe('ready');
      if (outcome.status === 'ready') {
        expect(outcome.assumptions.length).toBeGreaterThanOrEqual(2);
        expect(outcome.assumptions.some(a => a.includes('observability'))).toBe(true);
        expect(outcome.assumptions.some(a => a.includes('pid_gains'))).toBe(true);
      }
    });
  });

  describe('Deterministic confidence components', () => {
    it('computes confidence from lexical, value schema, reference, and catalog components', () => {
      const req = createBaseRequest();
      const comp = computeDeterministicConfidence(req);

      expect(comp.lexicalMatch).toBe(1.0);
      expect(comp.valueSchemaValidity).toBe(1.0);
      expect(comp.referenceResolution).toBe(1.0);
      expect(comp.catalogResolution).toBe(1.0);
      expect(comp.overallScore).toBe(1.0);
    });

    it('penalizes ungrounded catalog entities in catalogResolution score', () => {
      const req = createBaseRequest({
        entities: [
          { id: 'c1', semanticType: 'Constant', sourceText: '10', catalogBlockId: 'Constant', confidence: 1.0 },
          { id: 'u1', semanticType: 'UnknownBlock', sourceText: 'mystery', confidence: 0.5 }
        ]
      });
      const comp = computeDeterministicConfidence(req);
      expect(comp.catalogResolution).toBe(0.5);
      expect(comp.overallScore).toBeLessThan(1.0);
    });
  });

  describe('Threshold boundaries', () => {
    it('produces "ready" when overall confidence is at exactly READY threshold (0.85)', () => {
      const outcome = policy.evaluateWithScore(0.85, []);
      expect(outcome.status).toBe('ready');
    });

    it('produces "clarification_required" when overall confidence is at 0.849', () => {
      const outcome = policy.evaluateWithScore(0.849, []);
      expect(outcome.status).toBe('clarification_required');
    });

    it('produces "clarification_required" when overall confidence is at exactly CLARIFICATION threshold (0.70)', () => {
      const outcome = policy.evaluateWithScore(0.70, []);
      expect(outcome.status).toBe('clarification_required');
    });

    it('produces "invalid" when overall confidence is below CLARIFICATION threshold (0.699)', () => {
      const outcome = policy.evaluateWithScore(0.699, []);
      expect(outcome.status).toBe('invalid');
    });
  });
});
