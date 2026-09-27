import { describe, it, expect } from 'vitest';
import {
  StructuredEngineeringRequestSchema,
  ExtractedValueSchema,
  RequestEntitySchema,
  RequestRelationshipSchema,
  UnresolvedRequirementSchema,
  ActiveRequestSessionSchema,
  RequestUnderstandingResultSchema,
  StructuredEngineeringRequest,
  RequestUnderstandingResult
} from './structuredEngineeringRequest';

describe('StructuredEngineeringRequest Contracts', () => {
  it('validates a valid addition request with operands and normalized values', () => {
    const validAddition: StructuredEngineeringRequest = {
      schemaVersion: '1.0.0',
      requestId: 'req_add_10_20',
      originalText: 'Add 10 and 20',
      normalizedText: 'add 10 and 20',
      intent: 'create',
      operations: ['add'],
      entities: [
        {
          id: 'ent_sum_1',
          semanticType: 'adder',
          sourceText: 'Add',
          catalogBlockId: 'Sum',
          confidence: 1.0
        }
      ],
      values: [
        {
          id: 'val_op1',
          kind: 'number',
          sourceText: '10',
          normalizedValue: 10,
          confidence: 1.0
        },
        {
          id: 'val_op2',
          kind: 'number',
          sourceText: '20',
          normalizedValue: 20,
          confidence: 1.0
        }
      ],
      relationships: [],
      requestedOutputs: [],
      constraints: [],
      unresolvedRequirements: [],
      confidence: 0.98,
      evidence: [
        { source: 'user', description: 'Explicit arithmetic expression' }
      ]
    };

    const parsed = StructuredEngineeringRequestSchema.parse(validAddition);
    expect(parsed.requestId).toBe('req_add_10_20');
    expect(parsed.values).toHaveLength(2);
    expect(parsed.values[0].normalizedValue).toBe(10);
    expect(parsed.values[1].normalizedValue).toBe(20);
  });

  it('validates a multiplication request with Scope observability relationship', () => {
    const multiplicationWithScope: StructuredEngineeringRequest = {
      schemaVersion: '1.0.0',
      requestId: 'req_mul_scope',
      originalText: 'Multiply 10 by 100 and display it on a scope',
      normalizedText: 'multiply 10 by 100 and display it on a scope',
      intent: 'create',
      operations: ['multiply'],
      entities: [
        {
          id: 'ent_mul',
          semanticType: 'multiplier',
          sourceText: 'Multiply',
          catalogBlockId: 'VectorMul',
          confidence: 0.95
        },
        {
          id: 'ent_scope',
          semanticType: 'sink_display',
          sourceText: 'scope',
          catalogBlockId: 'Scope',
          confidence: 1.0
        }
      ],
      values: [
        {
          id: 'val_1',
          kind: 'number',
          sourceText: '10',
          normalizedValue: 10,
          confidence: 1.0
        },
        {
          id: 'val_2',
          kind: 'number',
          sourceText: '100',
          normalizedValue: 100,
          confidence: 1.0
        }
      ],
      relationships: [
        {
          id: 'rel_obs',
          type: 'observes',
          sourceEntityId: 'ent_mul',
          targetEntityId: 'ent_scope',
          sourceText: 'display it on a scope'
        }
      ],
      requestedOutputs: ['Scope'],
      constraints: [],
      unresolvedRequirements: [],
      confidence: 0.95,
      evidence: [
        { source: 'user', description: 'Multiplication request with explicit scope destination' }
      ]
    };

    const parsed = StructuredEngineeringRequestSchema.parse(multiplicationWithScope);
    expect(parsed.relationships).toHaveLength(1);
    expect(parsed.relationships[0].type).toBe('observes');
    expect(parsed.requestedOutputs).toContain('Scope');
  });

  it('validates transfer-function and PID controller request with missing required parameters', () => {
    const tfPidRequest: StructuredEngineeringRequest = {
      schemaVersion: '1.0.0',
      requestId: 'req_tf_pid',
      originalText: 'Create a transfer function and a PID controller for it',
      normalizedText: 'create a transfer function and a pid controller for it',
      intent: 'create',
      operations: ['control_loop'],
      entities: [
        {
          id: 'ent_tf',
          semanticType: 'plant',
          sourceText: 'transfer function',
          catalogBlockId: 'TRANSFER_FUNCTION',
          confidence: 0.95
        },
        {
          id: 'ent_pid',
          semanticType: 'controller',
          sourceText: 'pid controller',
          catalogBlockId: 'PID_CONTROLLER',
          confidence: 1.0
        }
      ],
      values: [],
      relationships: [
        {
          id: 'rel_fb',
          type: 'feedback',
          sourceEntityId: 'ent_tf',
          targetEntityId: 'ent_pid',
          sourceText: 'for it'
        }
      ],
      requestedOutputs: [],
      constraints: [],
      unresolvedRequirements: [
        {
          id: 'slot_num_den',
          slotName: 'transfer_function_coefficients',
          classification: 'REQUIRED',
          valueSchema: 'object',
          prompt: 'Please provide the transfer function numerator and denominator coefficients.',
          reason: 'A transfer function cannot compile without plant dynamics.',
          affectedDecisionIds: ['dec_plant_order'],
          status: 'unresolved'
        }
      ],
      confidence: 0.85,
      evidence: [
        { source: 'user', description: 'Transfer function + PID request' }
      ]
    };

    const parsed = StructuredEngineeringRequestSchema.parse(tfPidRequest);
    expect(parsed.unresolvedRequirements).toHaveLength(1);
    expect(parsed.unresolvedRequirements[0].classification).toBe('REQUIRED');
    expect(parsed.unresolvedRequirements[0].status).toBe('unresolved');
  });

  it('validates discriminated RequestUnderstandingResult outcomes', () => {
    const readyResult: RequestUnderstandingResult = {
      status: 'ready',
      request: {
        schemaVersion: '1.0.0',
        requestId: 'req_ready',
        originalText: 'Add 1 and 2',
        normalizedText: 'add 1 and 2',
        intent: 'create',
        operations: ['add'],
        entities: [],
        values: [],
        relationships: [],
        requestedOutputs: [],
        constraints: [],
        unresolvedRequirements: [],
        confidence: 1.0,
        evidence: []
      }
    };
    expect(RequestUnderstandingResultSchema.parse(readyResult).status).toBe('ready');

    const clarifyResult: RequestUnderstandingResult = {
      status: 'clarification_required',
      request: readyResult.request,
      blockingRequirement: {
        id: 'slot_op',
        slotName: 'operands',
        classification: 'REQUIRED',
        valueSchema: 'number_pair',
        prompt: 'Which two numbers would you like to add?',
        reason: 'Addition requires two numbers to compute a sum.',
        affectedDecisionIds: [],
        status: 'unresolved'
      }
    };
    expect(RequestUnderstandingResultSchema.parse(clarifyResult).status).toBe('clarification_required');

    const unsupportedResult: RequestUnderstandingResult = {
      status: 'unsupported',
      reason: '3D CFD mesh analysis is outside the X-Bridges 1D lumped-parameter scope.'
    };
    expect(RequestUnderstandingResultSchema.parse(unsupportedResult).status).toBe('unsupported');

    const invalidResult: RequestUnderstandingResult = {
      status: 'invalid',
      errors: ['Confidence score cannot exceed 1.0']
    };
    expect(RequestUnderstandingResultSchema.parse(invalidResult).status).toBe('invalid');
  });

  it('validates ActiveRequestSession tracking lifecycle state and revision increments', () => {
    const session = {
      sessionId: 'sess_123',
      projectId: 'proj_456',
      request: {
        schemaVersion: '1.0.0' as const,
        requestId: 'req_session_test',
        originalText: 'Add two numbers',
        normalizedText: 'add two numbers',
        intent: 'create' as const,
        operations: ['add'],
        entities: [],
        values: [],
        relationships: [],
        requestedOutputs: [],
        constraints: [],
        unresolvedRequirements: [],
        confidence: 0.9,
        evidence: []
      },
      answeredSlotIds: [],
      state: 'clarifying' as const,
      revision: 1
    };

    const parsed = ActiveRequestSessionSchema.parse(session);
    expect(parsed.state).toBe('clarifying');
    expect(parsed.revision).toBe(1);
  });

  it('rejects malformed confidence, missing sourceText, and unknown relationship types', () => {
    expect(() =>
      ExtractedValueSchema.parse({
        id: 'v1',
        kind: 'number',
        sourceText: '', // Empty source text rejected
        normalizedValue: 10,
        confidence: 1.0
      })
    ).toThrow();

    expect(() =>
      RequestRelationshipSchema.parse({
        id: 'r1',
        type: 'non_existent_relationship_type', // Invalid relationship
        sourceEntityId: 'e1',
        targetEntityId: 'e2',
        sourceText: 'connects'
      })
    ).toThrow();

    expect(() =>
      StructuredEngineeringRequestSchema.parse({
        schemaVersion: '1.0.0',
        requestId: 'req_bad',
        originalText: 'test',
        normalizedText: 'test',
        intent: 'create',
        operations: [],
        entities: [],
        values: [],
        relationships: [],
        requestedOutputs: [],
        constraints: [],
        unresolvedRequirements: [],
        confidence: 1.5, // > 1.0 rejected
        evidence: []
      })
    ).toThrow();
  });
});
