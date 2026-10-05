import { describe, it, expect, beforeAll } from 'vitest';
import { ConceptToBlockMapper } from './conceptToBlockMapper';
import { buildXbridgesCapabilityIndex, XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { EngineeringModelIR } from '../contracts/modelIr';

describe('ConceptToBlockMapper', () => {
  let catalog: XbridgesCapabilityIndex;
  const mapper = new ConceptToBlockMapper();

  beforeAll(() => {
    catalog = buildXbridgesCapabilityIndex();
  });

  it('maps arithmetic concept_addition to SUM block without inventing capabilities', () => {
    const ir: EngineeringModelIR = {
      schemaVersion: '1.0.0',
      modelId: 'model_sum_test',
      name: 'Summation Model',
      targetDomain: 'arithmetic',
      baseRevision: 0,
      subsystems: [
        { id: 'sub_math', name: 'Math Core' }
      ],
      components: [
        {
          id: 'comp_adder',
          name: 'Adder Block',
          conceptId: 'concept_addition',
          subsystemId: 'sub_math',
          parameters: []
        }
      ],
      ports: [
        { id: 'p_in1', componentId: 'comp_adder', name: 'in1', direction: 'in', domain: 'signal', dataType: 'number' },
        { id: 'p_in2', componentId: 'comp_adder', name: 'in2', direction: 'in', domain: 'signal', dataType: 'number' },
        { id: 'p_out', componentId: 'comp_adder', name: 'sum', direction: 'out', domain: 'signal', dataType: 'number' }
      ],
      connections: [],
      assumptions: [],
      unresolvedParameters: [],
      validationRules: [],
      traceLinks: [],
      rationale: 'Sum model'
    };

    const result = mapper.map(ir, catalog, []);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const boundComp = result.boundIr.components[0];
      expect(boundComp.capabilityBinding).toBeDefined();
      expect(boundComp.capabilityBinding?.catalogBlockId).toBe('Sum');
      expect(catalog.blocks.has('Sum')).toBe(true);
    }
  });

  it('returns structured BLOCK_CAPABILITY_GAP when a concept has no catalog implementation', () => {
    const ir: EngineeringModelIR = {
      schemaVersion: '1.0.0',
      modelId: 'model_exotic_test',
      name: 'Quantum Warp Drive',
      targetDomain: 'physics',
      baseRevision: 0,
      subsystems: [{ id: 'sub_core', name: 'Core' }],
      components: [
        {
          id: 'comp_warp',
          name: 'Quantum Field Warp Generator',
          conceptId: 'concept_quantum_warp_coil', // Doesn't exist in catalog!
          subsystemId: 'sub_core',
          parameters: []
        }
      ],
      ports: [],
      connections: [],
      assumptions: [],
      unresolvedParameters: [],
      validationRules: [],
      traceLinks: [],
      rationale: 'Impossible model'
    };

    const result = mapper.map(ir, catalog, []);
    expect(result.status).toBe('capability_gap');
    if (result.status === 'capability_gap') {
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].type).toBe('BLOCK_CAPABILITY_GAP');
      expect(result.gaps[0].conceptId).toBe('concept_quantum_warp_coil');
      expect(result.unsupportedComponents).toContain('comp_warp');
    }
  });
});
