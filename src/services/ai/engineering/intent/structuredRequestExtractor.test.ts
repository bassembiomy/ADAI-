import { describe, it, expect } from 'vitest';
import {
  StructuredRequestExtractor,
  extractStructuredEngineeringRequest
} from './structuredRequestExtractor';
import {
  StructuredEngineeringRequestSchema,
  RequestUnderstandingResultSchema
} from '../contracts/structuredEngineeringRequest';

describe('StructuredRequestExtractor', () => {
  const extractor = new StructuredRequestExtractor();

  describe('Basic arithmetic extraction', () => {
    it('extracts "Add 10 and 20" with two operands and Sum entity', () => {
      const result = extractor.extract('Add 10 and 20');
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;

      const { request } = result;
      expect(request.intent).toBe('create');
      expect(request.operations).toContain('add');

      // Check values
      expect(request.values).toHaveLength(2);
      expect(request.values[0].normalizedValue).toBe(10);
      expect(request.values[1].normalizedValue).toBe(20);

      // Check entities: two constants and a sum
      const entityTypes = request.entities.map(e => e.semanticType);
      expect(entityTypes).toContain('Constant');
      expect(entityTypes).toContain('Sum');

      // Check relationships: Constants feed Sum
      expect(request.relationships.length).toBeGreaterThanOrEqual(2);
      expect(request.relationships.every(r => r.type === 'feeds')).toBe(true);

      // Validate against Zod schema
      expect(StructuredEngineeringRequestSchema.safeParse(request).success).toBe(true);
      expect(RequestUnderstandingResultSchema.safeParse(result).success).toBe(true);
    });

    it('distinguishes count language from operand values in "Create a model adding two numbers"', () => {
      const result = extractor.extract('Create a model adding two numbers');
      expect(result.status).toBe('clarification_required');
      if (result.status !== 'clarification_required') return;

      const { request, blockingRequirement } = result;
      expect(request.intent).toBe('create');
      expect(request.operations).toContain('add');

      // Crucial: "two" is a count of numbers, NOT an operand value of 2!
      expect(request.values).toHaveLength(0);

      // Unresolved requirement for operands
      expect(blockingRequirement.slotName).toBe('operands');
      expect(blockingRequirement.classification).toBe('REQUIRED');
      expect(blockingRequirement.prompt).toMatch(/operands|numbers/i);
      expect(request.unresolvedRequirements).toHaveLength(1);
    });

    it('extracts signed, scientific, and unit-bearing operands correctly', () => {
      const result = extractor.extract('Multiply -5.5 by 2e3 Hz');
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;

      const { request } = result;
      expect(request.operations).toContain('multiply');
      expect(request.values).toHaveLength(2);

      const val1 = request.values.find(v => v.normalizedValue === -5.5);
      expect(val1).toBeDefined();

      const val2 = request.values.find(v => v.normalizedValue === 2000);
      expect(val2).toBeDefined();
      expect(val2?.unit).toBe('Hz');
      expect(val2?.kind).toBe('unit_value');
    });

    it.each([
      ['Please total 13.5 and -2.25', 'add', [13.5, -2.25]],
      ['Take 8 away from 31', 'subtract', [8, 31]],
      ['Observe 81 divided by 9', 'divide', [81, 9]],
      ['creat an adder for 17 and 25', 'add', [17, 25]],
      ['multibly 14 by 6 and disply it', 'multiply', [14, 6]]
    ])('extracts bounded arithmetic paraphrase %s', (input, operation, operands) => {
      const result = extractor.extract(input);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(result.request.operations).toEqual([operation]);
      expect(result.request.values.map(value => value.normalizedValue)).toEqual(operands);
    });

    it('treats "two user supplied values" as a count rather than an operand', () => {
      const result = extractor.extract('Build an adder for two user supplied values');
      expect(result.status).toBe('clarification_required');
      if (result.status !== 'clarification_required') return;
      expect(result.request.operations).toEqual(['add']);
      expect(result.request.values).toEqual([]);
    });
  });

  describe('Control systems and components', () => {
    it('extracts transfer function and PID controller with "for it" relationship', () => {
      const result = extractor.extract('Create a transfer function and a PID controller for it');
      expect(['ready', 'clarification_required']).toContain(result.status);

      const request = result.status === 'ready' || result.status === 'clarification_required'
        ? result.request
        : null;
      expect(request).not.toBeNull();
      if (!request) return;

      const entityTypes = request.entities.map(e => e.semanticType);
      expect(entityTypes).toContain('TRANSFER_FUNCTION');
      expect(entityTypes).toContain('PID_CONTROLLER');

      // Relationship "for it" connects PID to transfer function
      const rel = request.relationships.find(
        r => (r.type === 'controls' || r.type === 'feeds' || r.type === 'references')
      );
      expect(rel).toBeDefined();
      expect(rel?.sourceText).toMatch(/for it/i);
    });

    it('normalizes common controller and transfer-function spelling errors', () => {
      const result = extractor.extract('pid controler for a trasfer function');
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(result.request.entities.map(entity => entity.semanticType)).toEqual(
        expect.arrayContaining(['PID_CONTROLLER', 'TRANSFER_FUNCTION'])
      );
    });

    it('extracts multiplication with scope output and observation relationship', () => {
      const result = extractor.extract('Multiply 10 by 100 and display it on a scope');
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;

      const { request } = result;
      expect(request.operations).toContain('multiply');
      expect(request.requestedOutputs).toContain('scope');

      const entityTypes = request.entities.map(e => e.semanticType);
      expect(entityTypes).toContain('VectorMul');
      expect(entityTypes).toContain('Scope');

      // Scope observes multiplication
      const obsRel = request.relationships.find(r => r.type === 'observes' || r.type === 'feeds');
      expect(obsRel).toBeDefined();
    });

    it('extracts polynomial coefficients for transfer function', () => {
      const result = extractor.extract('Create a transfer function with numerator [1] and denominator [1, 2, 1]');
      expect(['ready', 'clarification_required']).toContain(result.status);

      const request = result.status === 'ready' || result.status === 'clarification_required'
        ? result.request
        : null;
      expect(request).not.toBeNull();
      if (!request) return;

      const numVal = request.values.find(v => v.id === 'numerator' || JSON.stringify(v.normalizedValue) === '[1]');
      const denVal = request.values.find(v => v.id === 'denominator' || JSON.stringify(v.normalizedValue) === '[1,2,1]');
      expect(numVal).toBeDefined();
      expect(denVal).toBeDefined();
      expect(numVal?.normalizedValue).toEqual([1]);
      expect(denVal?.normalizedValue).toEqual([1, 2, 1]);
    });
  });

  describe('Metamorphic and paraphrase equivalence', () => {
    it('produces equivalent structured requests for arithmetic paraphrases', () => {
      const req1 = extractor.extract('Add 10 and 20');
      const req2 = extractor.extract('Find the sum of 10 and 20');
      const req3 = extractor.extract('Calculate 10 + 20');

      expect(req1.status).toBe('ready');
      expect(req2.status).toBe('ready');
      expect(req3.status).toBe('ready');

      if (req1.status === 'ready' && req2.status === 'ready' && req3.status === 'ready') {
        expect(req1.request.intent).toBe(req2.request.intent);
        expect(req1.request.operations).toEqual(req2.request.operations);
        expect(req1.request.operations).toEqual(req3.request.operations);

        const v1 = req1.request.values.map(v => v.normalizedValue).sort();
        const v2 = req2.request.values.map(v => v.normalizedValue).sort();
        const v3 = req3.request.values.map(v => v.normalizedValue).sort();
        expect(v1).toEqual([10, 20]);
        expect(v2).toEqual([10, 20]);
        expect(v3).toEqual([10, 20]);
      }
    });

    it('produces equivalent structured requests for scope display paraphrases', () => {
      const req1 = extractor.extract('Multiply 10 by 100 and display it on a scope');
      const req2 = extractor.extract('Take 10, multiply by 100, and show result on scope');

      expect(req1.status).toBe('ready');
      expect(req2.status).toBe('ready');

      if (req1.status === 'ready' && req2.status === 'ready') {
        expect(req1.request.operations).toEqual(req2.request.operations);
        expect(req1.request.requestedOutputs).toEqual(req2.request.requestedOutputs);
      }
    });
  });

  describe('Unsupported requests', () => {
    it('returns unsupported for non-engineering requests', () => {
      const result = extractor.extract('Write a poem about electricity');
      expect(result.status).toBe('unsupported');
      if (result.status === 'unsupported') {
        expect(result.reason).toMatch(/non-engineering/i);
      }
    });

    it('returns unsupported for 3D CFD / FEA requests', () => {
      const result = extractor.extract('Run 3D CFD aerodynamic airflow simulation');
      expect(result.status).toBe('unsupported');
      if (result.status === 'unsupported') {
        expect(result.reason).toMatch(/cfd|fea/i);
      }
    });
  });

  describe('Top-level helper function', () => {
    it('extractStructuredEngineeringRequest works seamlessly', () => {
      const result = extractStructuredEngineeringRequest('Add 5 and 15');
      expect(result.status).toBe('ready');
    });
  });
});
