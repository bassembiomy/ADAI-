import { describe, it, expect } from 'vitest';
import {
  routeDeterministically,
  RoutingResult,
  PlannerIntent,
  RoutingContext,
} from './deterministicRouter';
import { GeneralEngineeringRequest } from './generalIntent';

describe('deterministicRouter', () => {
  const baseRequest = (objective: string, overrides: Partial<GeneralEngineeringRequest> = {}): GeneralEngineeringRequest => ({
    intent: 'create',
    objective,
    targetBehaviors: [],
    inputs: [],
    outputs: [],
    constraints: [],
    ...overrides,
  });

  describe('Task 1: Routing contract', () => {
    it('routes architecture prose with candidate/catalog/metadata to pattern_workflow or unknown, NOT arithmetic', () => {
      const req = baseRequest('Analyze PatternStore catalog metadata and candidate patterns for architecture refinement');
      const result = routeDeterministically(req);
      expect(result.status).toBe('routed');
      if (result.status === 'routed') {
        expect(['pattern_workflow', 'unknown']).toContain(result.intent);
        expect(result.intent).not.toBe('arithmetic');
      }
    });

    it('routes explicit "add 5 and 7" to arithmetic with status "routed"', () => {
      const req = baseRequest('add 5 and 7');
      const result = routeDeterministically(req);
      expect(result.status).toBe('routed');
      if (result.status === 'routed') {
        expect(result.intent).toBe('arithmetic');
        expect(result.normalizedRequest.objective).toBe('add 5 and 7');
      }
    });

    it('returns clarification when arithmetic operands are missing', () => {
      const req = baseRequest('add');
      const result = routeDeterministically(req);
      expect(result.status).toBe('clarification');
      if (result.status === 'clarification') {
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0].code).toMatch(/MISSING_ARITHMETIC_OPERAND|INSUFFICIENT_OPERANDS/);
        expect(result.diagnostics[0].remediation).toBeDefined();
      }
    });

    it('isolates current turn and does not inherit prior-turn operands or operations from context', () => {
      const req = baseRequest('Analyze catalog architecture');
      const context: RoutingContext = {
        priorTurn: {
          intent: 'arithmetic',
          objective: 'add 5 and 7',
          operands: [{ value: 5 }, { value: 7 }],
        },
        conversationHistory: [
          { role: 'user', content: 'add 5 and 7', intent: 'arithmetic' },
          { role: 'assistant', content: 'Calculated 12' },
        ],
      };

      const result = routeDeterministically(req, context);
      if (result.status === 'routed') {
        expect(result.intent).not.toBe('arithmetic');
        expect(result.normalizedRequest.operands).toBeUndefined();
      } else {
        expect(result.diagnostics.every(d => d.code !== 'MISSING_ARITHMETIC_OPERAND')).toBe(true);
      }
    });
  });
});
