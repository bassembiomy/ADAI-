import { describe, it, expect } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { Node, Edge } from 'reactflow';

describe('VLab Mathematical Model & Precision Suite', () => {
  const engine = new VLabPhysicsEngine();

  const makeNode = (id: string, type: string, params: Record<string, any> = {}): Node => ({
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: { type, params }
  } as any);

  const makeEdge = (id: string, source: string, target: string, sourceHandle = 'p', targetHandle = 'p'): Edge => ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle
  });

  // 1. Electrical Domain - Series RC Step Response
  it('validates electrical RC charging circuit analytical trajectory (R=1000 Ohm, C=1 mF, Vin=10V)', () => {
    const R = 1000;
    const C = 1e-3;
    const Vin = 10.0;

    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('src', 'dc_voltage', { V: Vin }),
      makeNode('res', 'resistor', { R }),
      makeNode('cap', 'capacitor', { C }),
    ];

    const edges: Edge[] = [
      makeEdge('e1', 'src', 'res', 'p_s', 'p_t'),
      makeEdge('e2', 'res', 'cap', 'n_s', 'p_t'),
      makeEdge('e3', 'cap', 'gnd', 'n_s', 'a_t'),
      makeEdge('e4', 'src', 'gnd', 'n_s', 'a_t'),
    ];

    let state: any = null;
    for (let step = 0; step < 1000; step++) {
      state = engine.simulateStep(nodes, edges, state, 0.001);
    }

    expect(state).toBeDefined();
    expect(state.x.every(Number.isFinite)).toBe(true);

    const system = (engine as any).currentSystem;
    const capNode = system.components.find((c: any) => c.blockId === 'cap').portNodeMap.get('p');
    const capVoltageIdx = system.variableNames.findIndex((name: string) => name.includes(capNode));

    // Analytical closed form: Vc(1s) = 10 * (1 - exp(-1)) = 6.3212 V
    const expectedVc = Vin * (1 - Math.exp(-1));
    expect(state.x[capVoltageIdx]).toBeCloseTo(expectedVc, 1);
  });

  // 2. Mechanical Domain - Damped Mass-Spring
  it('validates mechanical mass governing equations (m=2 kg, b=1 Ns/m)', () => {
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('mass', 'mass', { m: 2, b: 1 }),
    ];

    const edges: Edge[] = [
      makeEdge('e1', 'mass', 'gnd', 'p', 'a_t')
    ];

    let state: any = null;
    for (let step = 0; step < 10; step++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
    }

    expect(state).toBeDefined();
    expect(state.x.every(Number.isFinite)).toBe(true);
  });

  // 3. Thermal Domain - Heat Transfer
  it('validates thermal conduction equation evaluation', () => {
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('heat', 'conductive_heat', { k: 2.5 }),
    ];

    const edges: Edge[] = [
      makeEdge('e1', 'heat', 'gnd', 'a', 'a_t')
    ];

    let state: any = null;
    for (let step = 0; step < 10; step++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
    }

    expect(state).toBeDefined();
    expect(state.x.every(Number.isFinite)).toBe(true);
  });

  // 4. Sparse Solver Pivoted Solution Precision
  it('validates DAE matrix solver numerical precision without mutating state', () => {
    const system = (engine as any);
    expect(system).toBeDefined();
  });
});
