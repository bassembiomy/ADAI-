import { describe, it, expect } from 'vitest';
import { DeterministicEngineeringTemplates } from './deterministicEngineeringTemplates';
import { StructuredRequestExtractor } from '../intent/structuredRequestExtractor';
import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { validateArchitecturePlan } from './architecturePlanValidator';
import { computeArchitecturePlanHash } from '../contracts/architecturePlan';

describe('DeterministicEngineeringTemplates', () => {
  const catalog = buildXbridgesCapabilityIndex();
  const templates = new DeterministicEngineeringTemplates(catalog);
  const extractor = new StructuredRequestExtractor();

  describe('Arithmetic Template', () => {
    it('creates deterministic plan for two operands and Sum block with optional Scope', () => {
      const res = extractor.extract('Multiply 10 by 100 and display it on a scope');
      expect(res.status).toBe('ready');
      if (res.status !== 'ready') return;

      const plan = templates.selectAndInstantiateTemplate(res.request);
      expect(plan).not.toBeNull();
      if (!plan) return;

      // Validate schema
      const validation = validateArchitecturePlan(plan);
      expect(validation.valid).toBe(true);

      // Verify components
      const componentRoles = plan.components.map(c => c.role);
      expect(componentRoles).toContain('source');
      expect(componentRoles).toContain('multiplier');
      expect(componentRoles).toContain('sink'); // Scope

      // Verify connections
      expect(plan.connections.length).toBe(3); // 2 inputs to mul, 1 mul to scope
      const scopeConn = plan.connections.find(c => c.toComponentId === 'comp_scope');
      expect(scopeConn).toBeDefined();
      expect(scopeConn?.toPort).toBe('in1');

      // Deterministic plan hash
      const hash1 = computeArchitecturePlanHash(plan);
      const plan2 = templates.selectAndInstantiateTemplate(res.request)!;
      const hash2 = computeArchitecturePlanHash(plan2);
      expect(hash1).toBe(hash2);
    });
  });

  describe('PID + Transfer Function Feedback Topology Template', () => {
    it('implements exact Setpoint -> Sum -> PID -> TRANSFER_FUNCTION -> Scope topology with feedback', () => {
      const res = extractor.extract('Create a transfer function and a PID controller for it and show on scope');
      expect(res.status).toBe('ready');
      if (res.status !== 'ready') return;

      const plan = templates.selectAndInstantiateTemplate(res.request);
      expect(plan).not.toBeNull();
      if (!plan) return;

      // Validate schema
      const validation = validateArchitecturePlan(plan);
      expect(validation.valid).toBe(true);

      // Verify components: Setpoint, Sum, PID, TF, Scope
      const compIds = plan.components.map(c => c.id);
      expect(compIds).toContain('comp_setpoint');
      expect(compIds).toContain('comp_sum');
      expect(compIds).toContain('comp_pid');
      expect(compIds).toContain('comp_plant');
      expect(compIds).toContain('comp_scope');

      // CRITICAL: Plant must be TRANSFER_FUNCTION, NEVER Integrator or INTEGRATOR_CONTINUOUS
      const plantComp = plan.components.find(c => c.id === 'comp_plant')!;
      expect(plantComp.conceptId).toBe('concept_transfer_function');
      expect(plantComp.designParameters).toHaveProperty('numerator');
      expect(plantComp.designParameters).toHaveProperty('denominator');

      // Verify connections:
      // 1. Setpoint -> Sum(in1)
      const c1 = plan.connections.find(c => c.fromComponentId === 'comp_setpoint' && c.toComponentId === 'comp_sum');
      expect(c1).toBeDefined();
      expect(c1?.toPort).toBe('in1');

      // 2. Sum(out) -> PID(in1)
      const c2 = plan.connections.find(c => c.fromComponentId === 'comp_sum' && c.toComponentId === 'comp_pid');
      expect(c2).toBeDefined();
      expect(c2?.fromPort).toBe('out');

      // 3. PID -> TRANSFER_FUNCTION(u)
      const c3 = plan.connections.find(c => c.fromComponentId === 'comp_pid' && c.toComponentId === 'comp_plant');
      expect(c3).toBeDefined();
      expect(['u', 'out']).toContain(c3?.fromPort);
      expect(c3?.toPort).toBe('u');

      // 4. TRANSFER_FUNCTION(y) -> Scope(in1)
      const c4 = plan.connections.find(c => c.fromComponentId === 'comp_plant' && c.toComponentId === 'comp_scope');
      expect(c4).toBeDefined();
      expect(c4?.fromPort).toBe('y');
      expect(c4?.toPort).toBe('in1');

      // 5. Feedback: TRANSFER_FUNCTION(y) -> Sum(in2)
      const c5 = plan.connections.find(c => c.fromComponentId === 'comp_plant' && c.toComponentId === 'comp_sum');
      expect(c5).toBeDefined();
      expect(c5?.fromPort).toBe('y');
      expect(c5?.toPort).toBe('in2');
      expect(c5?.semanticType).toBe('feedback');
    });

    it('records PID default gains and tuning assumptions explicitly', () => {
      const res = extractor.extract('Create a transfer function and a PID controller for it');
      if (res.status !== 'ready') return;

      const plan = templates.selectAndInstantiateTemplate(res.request);
      expect(plan).not.toBeNull();
      if (!plan) return;

      expect(plan.assumptions.length).toBeGreaterThan(0);
      expect(plan.assumptions.some(a => a.statement.includes('PID'))).toBe(true);
    });
  });
});
