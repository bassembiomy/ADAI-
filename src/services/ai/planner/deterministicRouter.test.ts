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

  describe('Task 2: Bounded normalization and intent candidate detection', () => {
    it('rejects broad substring matches in architecture prose and does not detect arithmetic', () => {
      const architectureQueries = [
        'Inspect metadata for candidate blocks in catalog',
        'Candidate pattern catalog metadata update',
        'Address additional parameters in the system model',
        'Summary of catalog items and metadata',
        'Padding and ladder networks in power architecture',
      ];

      for (const query of architectureQueries) {
        const result = routeDeterministically(baseRequest(query));
        if (result.status === 'routed') {
          expect(result.intent, `Failed for query: "${query}"`).not.toBe('arithmetic');
        } else {
          expect(result.diagnostics.every(d => d.code !== 'MISSING_ARITHMETIC_OPERAND')).toBe(true);
        }
      }
    });

    it('detects explicit arithmetic phrases with operands', () => {
      const arithmeticQueries = [
        { q: 'add 5 and 7', intent: 'arithmetic' },
        { q: 'sum 5 plus 7', intent: 'arithmetic' },
        { q: 'multiply 10 by 100', intent: 'arithmetic' },
        { q: 'subtract 4 from 10', intent: 'arithmetic' },
        { q: 'divide 100 by 5', intent: 'arithmetic' },
      ];

      for (const { q, intent } of arithmeticQueries) {
        const result = routeDeterministically(baseRequest(q));
        expect(result.status, `Expected routed status for "${q}"`).toBe('routed');
        if (result.status === 'routed') {
          expect(result.intent, `Expected ${intent} for "${q}"`).toBe(intent);
        }
      }
    });

    it('detects pattern_workflow intent for pattern catalog/store vocabulary', () => {
      const queries = [
        'Search PatternStore for verified templates',
        'Retrieve candidate patterns from catalog',
        'Inspect pattern artifact metadata',
      ];
      for (const q of queries) {
        const result = routeDeterministically(baseRequest(q));
        expect(result.status).toBe('routed');
        if (result.status === 'routed') {
          expect(result.intent).toBe('pattern_workflow');
        }
      }
    });

    it('detects model_construction intent for engineering construction objectives', () => {
      const queries = [
        'Construct feedback control loop with Step and Integrator',
        'Create RLC resonant circuit plant model',
        'Build a second-order transfer function model',
      ];
      for (const q of queries) {
        const result = routeDeterministically(baseRequest(q));
        expect(result.status).toBe('routed');
        if (result.status === 'routed') {
          expect(result.intent).toBe('model_construction');
        }
      }
    });

    it('detects validation and simulation intents', () => {
      const valRes = routeDeterministically(baseRequest('Validate graph topology and connections'));
      expect(valRes.status).toBe('routed');
      if (valRes.status === 'routed') {
        expect(valRes.intent).toBe('validation');
      }

      const simRes = routeDeterministically(baseRequest('Simulate step response and observe Scope output'));
      expect(simRes.status).toBe('routed');
      if (simRes.status === 'routed') {
        expect(simRes.intent).toBe('simulation');
      }
    });

    it('routes unrecognized prose without matching vocabulary to unknown', () => {
      const result = routeDeterministically(baseRequest('Hello how are you today?'));
      expect(result.status).toBe('routed');
      if (result.status === 'routed') {
        expect(result.intent).toBe('unknown');
      }
    });
  });

  describe('Task 3: Deterministic preconditions and clarification diagnostics', () => {
    it('returns clarification for missing or single arithmetic operands', () => {
      const zeroOpRes = routeDeterministically(baseRequest('multiply numbers'));
      expect(zeroOpRes.status).toBe('clarification');
      if (zeroOpRes.status === 'clarification') {
        expect(zeroOpRes.diagnostics[0].code).toBe('MISSING_ARITHMETIC_OPERAND');
        expect(zeroOpRes.diagnostics[0].failedPreconditions).toContain('finite_operands_required');
        expect(zeroOpRes.diagnostics[0].remediation).toBeDefined();
      }

      const oneOpRes = routeDeterministically(baseRequest('add 5'));
      expect(oneOpRes.status).toBe('clarification');
      if (oneOpRes.status === 'clarification') {
        expect(oneOpRes.diagnostics[0].code).toBe('MISSING_ARITHMETIC_OPERAND');
      }
    });

    it('returns clarification for non-finite arithmetic operands', () => {
      const req = baseRequest('add 5 and 10', {
        operands: [
          { value: 5, raw: '5' },
          { value: Infinity, raw: 'Infinity' },
        ],
      });
      const result = routeDeterministically(req);
      expect(result.status).toBe('clarification');
      if (result.status === 'clarification') {
        expect(result.diagnostics[0].code).toBe('INVALID_ARITHMETIC_OPERAND');
        expect(result.diagnostics[0].failedPreconditions).toContain('finite_operands_required');
      }
    });

    it('returns clarification when pattern ingestion lacks source metadata', () => {
      const req = baseRequest('Ingest pattern template into PatternStore');
      const result = routeDeterministically(req);
      expect(result.status).toBe('clarification');
      if (result.status === 'clarification') {
        expect(result.diagnostics[0].code).toBe('MISSING_PATTERN_SOURCE_METADATA');
        expect(result.diagnostics[0].failedPreconditions).toContain('source_metadata_required');
        expect(result.diagnostics[0].remediation).toContain('source metadata');
      }
    });

    it('allows pattern ingestion when valid source metadata is provided', () => {
      const req = baseRequest('Ingest pattern template into PatternStore', {
        sourceMetadata: {
          author: 'Bassem',
          license: 'MIT',
          sourceUri: 'catalog://patterns/pid_1',
        },
      });
      const result = routeDeterministically(req);
      expect(result.status).toBe('routed');
      if (result.status === 'routed') {
        expect(result.intent).toBe('pattern_workflow');
        expect(result.normalizedRequest.sourceMetadata).toBeDefined();
      }
    });

    it('returns clarification for empty or whitespace-only objective', () => {
      const result = routeDeterministically(baseRequest('   '));
      expect(result.status).toBe('clarification');
      if (result.status === 'clarification') {
        expect(result.diagnostics[0].code).toBe('EMPTY_REQUEST_OBJECTIVE');
        expect(result.diagnostics[0].remediation).toBeDefined();
      }
    });

    it('returns clarification for ambiguous or conflicting explicit intents', () => {
      const result = routeDeterministically(baseRequest('multiply 10 by 100 and ingest pattern template into PatternStore'));
      expect(result.status).toBe('clarification');
      if (result.status === 'clarification') {
        expect(result.diagnostics[0].code).toBe('AMBIGUOUS_PLANNER_INTENT');
        expect(result.diagnostics[0].message).toMatch(/Conflicting intents detected/);
      }
    });
  });
});
