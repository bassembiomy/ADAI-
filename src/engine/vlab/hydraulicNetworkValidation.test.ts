import { describe, it, expect } from 'vitest';
import { PhysicalNetworkExtractor } from './kernel/PhysicalNetworkExtractor';
import { validateConnection } from '../../components/vlab/vlabConnectionValidation.test';

describe('Isothermal Liquid Network Validation', () => {
  const extractor = new PhysicalNetworkExtractor();

  it('detects missing pressure reference in IL network', () => {
    const nodes = [
      { id: 'pump1', type: 'vlab_block', data: { type: 'pump_il', domain: 'isothermal_liquid' } },
      { id: 'pipe1', type: 'vlab_block', data: { type: 'pipe_il', domain: 'isothermal_liquid' } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'pump1', sourceHandle: 'pump1-b', target: 'pipe1', targetHandle: 'pipe1-a' }
    ] as any;

    const { diagnostics } = extractor.extract(nodes, edges);
    const missingRefDiag = diagnostics.find(d => d.id === 'VL-REF-IL-001');
    expect(missingRefDiag).toBeDefined();
    expect(missingRefDiag?.message).toContain('Isothermal Liquid network has no pressure reference');
  });

  it('passes when hydraulic_reference_il is connected', () => {
    const nodes = [
      { id: 'ref1', type: 'vlab_block', data: { type: 'hydraulic_reference_il', domain: 'isothermal_liquid' } },
      { id: 'pipe1', type: 'vlab_block', data: { type: 'pipe_il', domain: 'isothermal_liquid' } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'pipe1', targetHandle: 'pipe1-a' }
    ] as any;

    const { diagnostics } = extractor.extract(nodes, edges);
    expect(diagnostics.some(d => d.id === 'VL-REF-IL-001')).toBe(false);
  });

  it('detects conflicting ideal pressure boundaries connected to the same node', () => {
    const nodes = [
      { id: 'ref1', type: 'vlab_block', data: { type: 'hydraulic_reference_il', domain: 'isothermal_liquid', params: { referencePressure: 100000 } } },
      { id: 'ref2', type: 'vlab_block', data: { type: 'hydraulic_reference_il', domain: 'isothermal_liquid', params: { referencePressure: 200000 } } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'ref2', targetHandle: 'ref2-a' }
    ] as any;

    const { diagnostics } = extractor.extract(nodes, edges);
    const conflictDiag = diagnostics.find(d => d.id === 'VL-OVERCONSTRAINT-001');
    expect(conflictDiag).toBeDefined();
    expect(conflictDiag?.message).toContain('Conflicting ideal pressure references');
  });

  it('rejects connection from isothermal_liquid to electrical or thermal', () => {
    const ilNode = { data: { type: 'hydraulic_reference_il', domain: 'isothermal_liquid', label: 'IL Ref' } };
    const elecNode = { data: { type: 'resistor', domain: 'electrical', label: 'Resistor' } };

    const result = validateConnection(ilNode as any, elecNode as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot connect');
  });
});
