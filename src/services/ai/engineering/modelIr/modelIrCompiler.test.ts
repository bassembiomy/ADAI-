import { describe, it, expect, beforeAll } from 'vitest';
import { ModelIrCompiler } from './modelIrCompiler';
import { BoundEngineeringModelIR } from '../contracts/modelIr';
import { buildXbridgesCapabilityIndex, XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { EngineeringModelPlanV2Schema } from '../../contracts/engineeringModel';

// Deterministic Model IR compiler test suite
describe('ModelIrCompiler', () => {
  let catalog: XbridgesCapabilityIndex;
  const compiler = new ModelIrCompiler();

  beforeAll(() => {
    catalog = buildXbridgesCapabilityIndex();
  });

  const createMockBoundIr = (): BoundEngineeringModelIR => ({
    schemaVersion: '1.0.0',
    modelId: 'model_compile_test',
    name: 'Arithmetic Addition Model',
    targetDomain: 'xbridges',
    baseRevision: 1,
    subsystems: [
      { id: 'sub_math', name: 'Math Core' }
    ],
    components: [
      {
        id: 'comp_adder',
        name: 'Adder Block',
        conceptId: 'concept_addition',
        subsystemId: 'sub_math',
        parameters: [],
        capabilityBinding: {
          catalogBlockId: 'Sum',
          catalogBlockType: 'Sum',
          parameterMapping: {},
          portMapping: { in1: 'in1', in2: 'in2', sum: 'out' }
        }
      },
      {
        id: 'comp_const',
        name: 'Constant 5',
        conceptId: 'concept_constant',
        subsystemId: 'sub_math',
        parameters: [
          {
            name: 'value',
            value: 5,
            source: 'user',
            confidence: 1.0,
            resolutionState: 'resolved'
          }
        ],
        capabilityBinding: {
          catalogBlockId: 'Constant',
          catalogBlockType: 'Constant',
          parameterMapping: { value: 'value' },
          portMapping: { out: 'out' }
        }
      }
    ],
    ports: [
      { id: 'comp_const_out', componentId: 'comp_const', name: 'out', direction: 'out', domain: 'xbridges', dataType: 'number' },
      { id: 'comp_adder_in1', componentId: 'comp_adder', name: 'in1', direction: 'in', domain: 'xbridges', dataType: 'number' }
    ],
    connections: [
      {
        id: 'conn_const_adder',
        fromPortId: 'comp_const_out',
        toPortId: 'comp_adder_in1',
        semanticType: 'signal'
      }
    ],
    assumptions: ['Pure integer addition'],
    unresolvedParameters: [],
    validationRules: [],
    traceLinks: [
      { irEntityId: 'comp_adder', architectureElementId: 'comp_adder' }
    ],
    rationale: 'Compiled addition plan'
  });

  it('compiles Bound Model IR into a valid EngineeringModelPlanV2 with stable fingerprint', () => {
    const ir = createMockBoundIr();
    const context = {
      projectId: 'proj_compile_100',
      baseRevision: 1,
      catalog
    };

    const plan1 = compiler.compile(ir, context);
    const plan2 = compiler.compile(ir, context);

    // Schema validation
    const parsed = EngineeringModelPlanV2Schema.safeParse(plan1);
    expect(parsed.success).toBe(true);

    // Deterministic planHash invariance
    expect(plan1.planHash).toBeDefined();
    expect(plan1.planHash).toBe(plan2.planHash);

    // Actions verification
    expect(plan1.actions.some((a: any) => a.kind === 'add_block' && a.blockType === 'Sum')).toBe(true);
    expect(plan1.actions.some((a: any) => a.kind === 'add_block' && a.blockType === 'Constant')).toBe(true);
    expect(plan1.actions.some((a: any) => a.kind === 'connect_ports')).toBe(true);

    // Blocks and connections
    expect(plan1.blocks).toHaveLength(2);
    expect(plan1.connections).toHaveLength(1);
    expect(plan1.expectedAfterDelta.addedBlocks).toContain('comp_adder');
    expect(plan1.expectedAfterDelta.addedBlocks).toContain('comp_const');
  });
});
