import { describe, it, expect, beforeAll } from 'vitest';
import { EngineeringIntelligenceTools } from './engineeringIntelligenceTools';
import { buildXbridgesCapabilityIndex, XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { EngineeringArchitecturePlan } from '../contracts/architecturePlan';

// Bounded engineering intelligence tools test suite
describe('EngineeringIntelligenceTools', () => {
  let catalog: XbridgesCapabilityIndex;
  let tools: EngineeringIntelligenceTools;

  beforeAll(() => {
    catalog = buildXbridgesCapabilityIndex();
    tools = new EngineeringIntelligenceTools(catalog);
  });

  const validPlan: EngineeringArchitecturePlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_add_tool_test',
    intentId: 'intent_tool_test',
    system: {
      name: 'Addition System',
      conceptId: 'concept_addition',
      description: 'Sum tool test'
    },
    subsystems: [
      { id: 'sub_math', name: 'Math Core', conceptId: 'concept_arithmetic_unit', functionalRoles: ['calculation'] }
    ],
    components: [
      {
        id: 'comp_adder',
        name: 'Adder',
        conceptId: 'concept_addition',
        subsystemId: 'sub_math',
        role: 'adder',
        designParameters: {}
      }
    ],
    connections: [],
    designDecisions: [],
    informationRequirements: [],
    assumptions: [],
    knowledgeEvidence: [],
    capabilityAssessment: {
      feasible: true,
      coveredConceptIds: ['concept_addition'],
      unsupportedConceptIds: []
    },
    rationale: 'Arithmetic plan'
  };

  it('validates architecture plan through tool gateway with input hashing and diagnostics', () => {
    const res = tools.validateArchitecturePlan({ plan: validPlan });
    expect(res.success).toBe(true);
    expect(res.inputHash).toBeDefined();
    expect(res.data.valid).toBe(true);
  });

  it('builds Model IR, maps concepts to catalog, and compiles plan deterministically', () => {
    // 1. Build IR
    const irRes = tools.buildModelIr({ plan: validPlan, modelId: 'tool_model_1', baseRevision: 0 });
    expect(irRes.success).toBe(true);
    expect(irRes.data.components).toHaveLength(1);

    // 2. Validate IR
    const valRes = tools.validateModelIr({ ir: irRes.data });
    expect(valRes.success).toBe(true);
    expect(valRes.data.isValid).toBe(true);

    // 3. Map concepts
    const mapRes = tools.mapConcepts({ ir: irRes.data });
    expect(mapRes.success).toBe(true);
    if (mapRes.success && mapRes.data.status === 'ok') {
      expect(mapRes.data.boundIr.components[0].capabilityBinding?.catalogBlockId).toBe('Sum');

      // 4. Compile Model IR
      const compRes = tools.compileModelIr({
        ir: mapRes.data.boundIr,
        projectId: 'proj_tool_test',
        baseRevision: 0
      });
      expect(compRes.success).toBe(true);
      expect(compRes.data.planHash).toBeDefined();
      expect(compRes.data.actions.some((a: any) => a.kind === 'add_block')).toBe(true);
    }
  });

  it('rejects invalid inputs fail-closed with clear error messages', () => {
    const invalidPlan = { ...validPlan, components: [{ ...validPlan.components[0], conceptId: 'xbridges_leaked_id' }] };
    const res = tools.validateArchitecturePlan({ plan: invalidPlan });
    expect(res.data.valid).toBe(false);
    expect(res.data.errors.some((e: any) => e.includes('illegally contains catalog block ID'))).toBe(true);
  });
});
