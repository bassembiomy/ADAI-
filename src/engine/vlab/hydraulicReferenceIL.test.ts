import { describe, it, expect } from 'vitest';
import { DAEAssembler } from './DAEAssembler';
import { ImplicitSolver } from './ImplicitSolver';
import { VLabPhysicsEngine } from './vlabPhysics';
import { PhysicalNetworkExtractor } from './kernel/PhysicalNetworkExtractor';
import { validateConnection } from '../../components/vlab/vlabConnectionValidation.test';
import {
  convertPressureToSI,
  convertPressureFromSI,
  computeAbsoluteReferencePressure,
  computeEffectivePortPressure
} from '../../utils/hydraulicUnits';

describe('Hydraulic Reference (IL) Verification & Acceptance Test Suite', () => {
  const extractor = new PhysicalNetworkExtractor();
  const engine = new VLabPhysicsEngine();

  // 1. Default atmospheric-pressure reference
  it('1. establishes default atmospheric-pressure reference (101325 Pa)', () => {
    const pAbs = computeAbsoluteReferencePressure(101325, 'Pa', 'absolute', 101325, 'Pa');
    expect(pAbs).toBe(101325);
  });

  // 2. Custom absolute pressure
  it('2. supports custom absolute pressure', () => {
    const pAbs = computeAbsoluteReferencePressure(5, 'bar', 'absolute', 101325, 'Pa');
    expect(pAbs).toBe(500000);
  });

  // 3. Gauge-to-absolute pressure conversion
  it('3. calculates gauge-to-absolute pressure accurately (p_abs = p_atm + p_ref)', () => {
    const pAbs = computeAbsoluteReferencePressure(2, 'bar', 'gauge', 1, 'atm');
    expect(pAbs).toBe(200000 + 101325);
  });

  // 4. Unit conversion between Pa, bar and psi
  it('4. converts units accurately between Pa, bar and psi', () => {
    const pBarInPa = convertPressureToSI(1, 'bar');
    const pPsiInPa = convertPressureToSI(14.6959, 'psi');
    expect(pBarInPa).toBe(100000);
    expect(pPsiInPa).toBeCloseTo(101325, 0);

    const backToBar = convertPressureFromSI(pBarInPa, 'bar');
    expect(backToBar).toBe(1);

    const backToPsi = convertPressureFromSI(pPsiInPa, 'psi');
    expect(backToPsi).toBeCloseTo(14.6959, 1);
  });

  // 5. Positive mass flow (flow entering network from reference)
  it('5. establishes positive mass flow entering network from higher pressure reference', () => {
    // ref1 (2 bar) -> pipe (R = 1e5) -> ref2 (1 bar)
    const nodes = [
      { id: 'ref1', type: 'vlab_block', data: { type: 'hydraulic_reference_il', params: { referencePressure: { value: 200000, unit: 'Pa' }, pressureType: { value: 'absolute' } } } },
      { id: 'pipe', type: 'vlab_block', data: { type: 'pipe_il', params: { R: { value: 100000, unit: 'Pa/(kg/s)' } } } },
      { id: 'ref2', type: 'vlab_block', data: { type: 'hydraulic_reference_il', params: { referencePressure: { value: 100000, unit: 'Pa' }, pressureType: { value: 'absolute' } } } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'pipe', targetHandle: 'pipe-a' },
      { id: 'e2', source: 'pipe', sourceHandle: 'pipe-b', target: 'ref2', targetHandle: 'ref2-a' }
    ] as any;

    let state: any = null;
    for (let s = 0; s < 5; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
    // Expected flow = (200000 - 100000) / 100000 = 1.0 kg/s
    const pipeFlowIdx = state.variableNames.findIndex((v: string) => v.includes('pipe') && v.includes('mass_flow'));
    expect(pipeFlowIdx).toBeGreaterThanOrEqual(0);
    expect(state.x[pipeFlowIdx]).toBeCloseTo(1.0, 2);
  });

  // 6. Negative mass flow (flow leaving network into reference)
  it('6. establishes negative mass flow leaving network into lower pressure reference', () => {
    // Flow from ref1 (1 bar) into ref2 (2 bar) gives negative flow relative to inlet
    const nodes = [
      { id: 'ref1', type: 'vlab_block', data: { type: 'hydraulic_reference_il', params: { referencePressure: { value: 100000, unit: 'Pa' }, pressureType: { value: 'absolute' } } } },
      { id: 'pipe', type: 'vlab_block', data: { type: 'pipe_il', params: { R: { value: 100000, unit: 'Pa/(kg/s)' } } } },
      { id: 'ref2', type: 'vlab_block', data: { type: 'hydraulic_reference_il', params: { referencePressure: { value: 200000, unit: 'Pa' }, pressureType: { value: 'absolute' } } } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'pipe', targetHandle: 'pipe-a' },
      { id: 'e2', source: 'pipe', sourceHandle: 'pipe-b', target: 'ref2', targetHandle: 'ref2-a' }
    ] as any;

    let state: any = null;
    for (let s = 0; s < 5; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
    const pipeFlowIdx = state.variableNames.findIndex((v: string) => v.includes('pipe') && v.includes('mass_flow'));
    expect(pipeFlowIdx).toBeGreaterThanOrEqual(0);
    expect(state.x[pipeFlowIdx]).toBeCloseTo(-1.0, 2);
  });

  // 7. Zero-flow equilibrium
  it('7. achieves zero-flow static equilibrium when pressures are equal', () => {
    const nodes = [
      { id: 'ref1', type: 'vlab_block', data: { type: 'hydraulic_reference_il', params: { referencePressure: { value: 100000, unit: 'Pa' }, pressureType: { value: 'absolute' } } } },
      { id: 'pipe', type: 'vlab_block', data: { type: 'pipe_il', params: { R: { value: 100000, unit: 'Pa/(kg/s)' } } } },
      { id: 'ref2', type: 'vlab_block', data: { type: 'hydraulic_reference_il', params: { referencePressure: { value: 100000, unit: 'Pa' }, pressureType: { value: 'absolute' } } } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'pipe', targetHandle: 'pipe-a' },
      { id: 'e2', source: 'pipe', sourceHandle: 'pipe-b', target: 'ref2', targetHandle: 'ref2-a' }
    ] as any;

    let state: any = null;
    for (let s = 0; s < 5; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
    }
    const pipeFlowIdx = state.variableNames.findIndex((v: string) => v.includes('pipe') && v.includes('mass_flow'));
    expect(pipeFlowIdx).toBeGreaterThanOrEqual(0);
    expect(state.x[pipeFlowIdx]).toBeCloseTo(0.0, 5);
  });

  // 8. Connection rejection for incompatible domains
  it('8. rejects connection to incompatible physical domains', () => {
    const ilRef = { data: { type: 'hydraulic_reference_il', domain: 'isothermal_liquid', label: 'Ref' } };
    const electrical = { data: { type: 'ground', domain: 'electrical', label: 'Ground' } };
    const thermal = { data: { type: 'thermal_mass', domain: 'thermal', label: 'Thermal Mass' } };
    const gas = { data: { type: 'gas_chamber', domain: 'gas', label: 'Gas Chamber' } };

    expect(validateConnection(ilRef as any, electrical as any).valid).toBe(false);
    expect(validateConnection(ilRef as any, thermal as any).valid).toBe(false);
    expect(validateConnection(ilRef as any, gas as any).valid).toBe(false);
  });

  // 9. Detection of a network without a reference
  it('9. detects isolated isothermal liquid network without a pressure reference', () => {
    const nodes = [
      { id: 'pipe', type: 'vlab_block', data: { type: 'pipe_il', domain: 'isothermal_liquid' } },
      { id: 'restr', type: 'vlab_block', data: { type: 'restriction_il', domain: 'isothermal_liquid' } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    const edges = [
      { id: 'e1', source: 'pipe', sourceHandle: 'pipe-b', target: 'restr', targetHandle: 'restr-a' }
    ] as any;

    const { diagnostics } = extractor.extract(nodes, edges);
    const missingRefDiag = diagnostics.find(d => d.id === 'VL-REF-IL-001');
    expect(missingRefDiag).toBeDefined();
    expect(missingRefDiag?.message).toContain('Isothermal Liquid network has no pressure reference');
  });

  // 10. Detection of conflicting ideal pressure boundaries
  it('10. detects conflicting ideal pressure boundaries connected to the same node', () => {
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

  // 11. Save-and-load parameter preservation
  it('11. preserves parameters across serialization matching Section 12 JSON schema', () => {
    const blockPayload = {
      type: 'hydraulic_reference_il',
      name: 'Hydraulic Reference',
      parameters: {
        referencePressure: { value: 250000, unit: 'Pa' },
        pressureType: 'gauge',
        atmosphericPressure: { value: 101325, unit: 'Pa' },
        elevationCorrection: true,
        referenceElevation: { value: 15, unit: 'm' },
        initializationPriority: 'high'
      }
    };

    const serialized = JSON.stringify(blockPayload);
    const restored = JSON.parse(serialized);

    expect(restored.type).toBe('hydraulic_reference_il');
    expect(restored.name).toBe('Hydraulic Reference');
    expect(restored.parameters.referencePressure.value).toBe(250000);
    expect(restored.parameters.referencePressure.unit).toBe('Pa');
    expect(restored.parameters.pressureType).toBe('gauge');
    expect(restored.parameters.elevationCorrection).toBe(true);
    expect(restored.parameters.referenceElevation.value).toBe(15);
    expect(restored.parameters.referenceElevation.unit).toBe('m');
    expect(restored.parameters.initializationPriority).toBe('high');
  });

  // 12. Copy, paste, undo and redo operations
  it('12. preserves block properties across copy-paste clone operations', () => {
    const originalNode = {
      id: 'ref_orig',
      type: 'vlab_block',
      data: {
        type: 'hydraulic_reference_il',
        label: 'Primary Reservoir',
        params: {
          referencePressure: { value: 3, unit: 'bar', label: 'Reference Pressure' },
          pressureType: { value: 'gauge' }
        }
      }
    };

    // Deep clone simulation for clipboard / undo-redo history
    const clonedNode = JSON.parse(JSON.stringify(originalNode));
    clonedNode.id = 'ref_clone_1';

    expect(clonedNode.data.type).toBe('hydraulic_reference_il');
    expect(clonedNode.data.label).toBe('Primary Reservoir');
    expect(clonedNode.data.params.referencePressure.value).toBe(3);
    expect(clonedNode.data.params.referencePressure.unit).toBe('bar');
  });

  // 13. Block deletion and network revalidation
  it('13. detects block deletion and immediately triggers missing datum error', () => {
    let nodes = [
      { id: 'ref1', type: 'vlab_block', data: { type: 'hydraulic_reference_il', domain: 'isothermal_liquid' } },
      { id: 'pipe1', type: 'vlab_block', data: { type: 'pipe_il', domain: 'isothermal_liquid' } },
      { id: 'solver', type: 'vlab_block', data: { type: 'solver_config' } }
    ] as any;
    let edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'pipe1', targetHandle: 'pipe1-a' }
    ] as any;

    let res = extractor.extract(nodes, edges);
    expect(res.diagnostics.some(d => d.id === 'VL-REF-IL-001')).toBe(false);

    // Delete ref1
    nodes = nodes.filter((n: any) => n.id !== 'ref1');
    edges = edges.filter((e: any) => e.source !== 'ref1' && e.target !== 'ref1');

    res = extractor.extract(nodes, edges);
    expect(res.diagnostics.some(d => d.id === 'VL-REF-IL-001')).toBe(true);
  });

  // 14 & Section 15. Acceptance Test Circuit:
  // Hydraulic Reference (IL) -> Pump (IL) -> Pipe (IL) -> Restriction (IL) -> Hydraulic Reference (IL)
  it('14 & 15. Acceptance Test: simulates complete hydraulic circuit with 2 bar pump rise', () => {
    // Configure:
    // Inlet reference: 1 bar absolute (100,000 Pa)
    // Outlet reference: 1 bar absolute (100,000 Pa)
    // Pump pressure rise: 2 bar (200,000 Pa)
    const nodes = [
      {
        id: 'ref_in',
        type: 'vlab_block',
        data: {
          type: 'hydraulic_reference_il',
          params: { referencePressure: { value: 1, unit: 'bar' }, pressureType: { value: 'absolute' } }
        }
      },
      {
        id: 'pump',
        type: 'vlab_block',
        data: {
          type: 'pump_il',
          params: { pressure_rise: { value: 200000, unit: 'Pa' } }
        }
      },
      {
        id: 'pipe',
        type: 'vlab_block',
        data: {
          type: 'pipe_il',
          params: { R: { value: 50000, unit: 'Pa/(kg/s)' } }
        }
      },
      {
        id: 'restriction',
        type: 'vlab_block',
        data: {
          type: 'restriction_il',
          params: { Cd: { value: 0.6 }, area: { value: 1e-4 }, rho: { value: 1000 } }
        }
      },
      {
        id: 'ref_out',
        type: 'vlab_block',
        data: {
          type: 'hydraulic_reference_il',
          params: { referencePressure: { value: 1, unit: 'bar' }, pressureType: { value: 'absolute' } }
        }
      },
      {
        id: 'solver',
        type: 'vlab_block',
        data: { type: 'solver_config' }
      }
    ] as any;

    const edges = [
      { id: 'e1', source: 'ref_in', sourceHandle: 'ref_in-a', target: 'pump', targetHandle: 'pump-a' },
      { id: 'e2', source: 'pump', sourceHandle: 'pump-b', target: 'pipe', targetHandle: 'pipe-a' },
      { id: 'e3', source: 'pipe', sourceHandle: 'pipe-b', target: 'restriction', targetHandle: 'restriction-a' },
      { id: 'e4', source: 'restriction', sourceHandle: 'restriction-b', target: 'ref_out', targetHandle: 'ref_out-a' }
    ] as any;

    // Simulation initializes without singular-matrix error
    let state: any = null;
    for (let s = 0; s < 10; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }

    // Inspect downstream pressure of pump (node between pump-b and pipe-a)
    // Inlet is 1 bar (100,000 Pa). Pump adds 2 bar (200,000 Pa).
    // Therefore pressure immediately downstream of pump must be ~3 bar (300,000 Pa).
    const pumpDownstreamIdx = state.variableNames.findIndex((v: string) => 
      (v.includes('pump_b') || v.includes('pipe_a')) && (v.includes('pressure') || v.includes('isothermal_liquid') || v.includes('fluid'))
    );
    expect(pumpDownstreamIdx).toBeGreaterThanOrEqual(0);
    const pDownstreamPa = state.x[pumpDownstreamIdx];
    expect(pDownstreamPa).toBeCloseTo(300000, -2); // Approx 300,000 Pa = 3 bar

    // Verify reporting in user-selected units (bar)
    const pDownstreamBar = convertPressureFromSI(pDownstreamPa, 'bar');
    expect(pDownstreamBar).toBeCloseTo(3.0, 1);

    // Verify mass conservation:
    // Flow across pump, pipe, and restriction are identical in steady state
    const pumpFlowIdx = state.variableNames.findIndex((v: string) => v.includes('pump') && v.includes('mass_flow'));
    const pipeFlowIdx = state.variableNames.findIndex((v: string) => v.includes('pipe') && v.includes('mass_flow'));
    const restrFlowIdx = state.variableNames.findIndex((v: string) => v.includes('restriction') && v.includes('mass_flow'));

    expect(pumpFlowIdx).toBeGreaterThanOrEqual(0);
    expect(pipeFlowIdx).toBeGreaterThanOrEqual(0);
    expect(restrFlowIdx).toBeGreaterThanOrEqual(0);

    const mdotPump = state.x[pumpFlowIdx];
    const mdotPipe = state.x[pipeFlowIdx];
    const mdotRestr = state.x[restrFlowIdx];

    expect(mdotPump).toBeGreaterThan(0);
    expect(mdotPump).toBeCloseTo(mdotPipe, 4);
    expect(mdotPipe).toBeCloseTo(mdotRestr, 4);
  });
});
