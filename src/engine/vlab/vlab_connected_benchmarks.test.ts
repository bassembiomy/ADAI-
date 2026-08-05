import { describe, it, expect } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { Node, Edge } from 'reactflow';

import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('V-Lab Connected Model Benchmarks (10 Major System Topologies)', () => {
  const engine = new VLabPhysicsEngine();
  const allBlocks = VLAB_LIBRARY.flatMap((d) => d.blocks);

  const makeNode = (id: string, blockId: string, customParams: Record<string, any> = {}): Node => {
    const baseBlock = allBlocks.find((b) => b.id === blockId);
    const domain = VLAB_LIBRARY.find((d) => d.blocks.some((b) => b.id === blockId))?.type || 'Electrical';
    const mergedParams = baseBlock?.params ? JSON.parse(JSON.stringify(baseBlock.params)) : {};
    Object.keys(customParams).forEach((k) => {
      if (mergedParams[k]) mergedParams[k].value = customParams[k];
      else mergedParams[k] = { value: customParams[k] };
    });
    return {
      id,
      type: 'default',
      position: { x: 0, y: 0 },
      data: {
        type: blockId,
        label: baseBlock?.name || blockId,
        ports: baseBlock?.ports || [],
        params: mergedParams,
        domain,
      },
    } as Node;
  };

  const makeEdge = (id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge => ({
    id,
    source,
    target,
    sourceHandle: sourceHandle || 'n',
    targetHandle: targetHandle || 'p',
  });

  // 1. Electrical Benchmark: Resistor Network + RLC + Diode Load
  it('benchmark 1: electrical RLC circuit with DC voltage source', () => {
    const nodes: Node[] = [
      makeNode('dc', 'dc_voltage', { V: 24 }),
      makeNode('res', 'resistor', { R: 50 }),
      makeNode('ind', 'inductor', { L: 1e-3 }),
      makeNode('cap', 'capacitor', { C: 1e-5 }),
      makeNode('gnd', 'ground', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'dc', 'res', 'p', 'p'),
      makeEdge('e2', 'res', 'ind', 'n', 'p'),
      makeEdge('e3', 'ind', 'cap', 'n', 'p'),
      makeEdge('e4', 'cap', 'gnd', 'n', 'gnd'),
      makeEdge('e5', 'dc', 'gnd', 'n', 'gnd'),
    ];

    let state: any = null;
    const dt = 0.0001;
    for (let s = 0; s < 100; s++) {
      state = engine.simulateStep(nodes, edges, state, dt);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 2. Translational Mechanics Benchmark: Mass-Spring-Damper System
  it('benchmark 2: translational mass-spring-damper system response', () => {
    const nodes: Node[] = [
      makeNode('src', 'force_source', { F: 10 }),
      makeNode('mass', 'mass', { m: 1.0 }),
      makeNode('spring', 'trans_spring', { k: 100 }),
      makeNode('damper', 'trans_damper', { b: 5 }),
      makeNode('ref', 'trans_ref', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'mass', 'a', 'p'),
      makeEdge('e2', 'src', 'ref', 'b', 'p'),
      makeEdge('e3', 'mass', 'spring', 'p', 'r'),
      makeEdge('e4', 'spring', 'ref', 'c', 'p'),
      makeEdge('e5', 'mass', 'damper', 'p', 'r'),
      makeEdge('e6', 'damper', 'ref', 'c', 'p'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.001);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 3. Rotational Mechanics Benchmark: Inertia-Damper Drivetrain
  it('benchmark 3: rotational inertia and damper system', () => {
    const nodes: Node[] = [
      makeNode('torque', 'torque_source', { T: 10 }),
      makeNode('inertia', 'inertia', { J: 0.5 }),
      makeNode('damper', 'rot_damper', { b: 0.1 }),
      makeNode('ref', 'rot_ref', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'torque', 'inertia', 'a', 'p'),
      makeEdge('e2', 'torque', 'ref', 'b', 'p'),
      makeEdge('e3', 'inertia', 'damper', 'p', 'r'),
      makeEdge('e4', 'damper', 'ref', 'c', 'p'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.001);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 4. Thermal Benchmark: Conductive and Convective Heat Transfer
  it('benchmark 4: thermal mass with Fourier conduction and convection', () => {
    const nodes: Node[] = [
      makeNode('src', 'temperature_source', { T: 373.15 }),
      makeNode('cond', 'conductive_heat', { k: 15.0 }),
      makeNode('mass', 'thermal_mass', { C: 500, T0: 293.15 }),
      makeNode('ref', 'thermal_reference', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'cond', 'a', 'a'),
      makeEdge('e2', 'cond', 'mass', 'b', 'a'),
      makeEdge('e3', 'mass', 'ref', 'b', 'a'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 5. Fluid Benchmark: Tank Hydrostatic Level and Restrictive Pipe
  it('benchmark 5: fluid tank with hydrostatic pressure and pipe restriction', () => {
    const nodes: Node[] = [
      makeNode('src', 'pressure_source', { P: 101325 + 5000 }),
      makeNode('pipe', 'pipe_restriction', { R: 1e5 }),
      makeNode('tank', 'fluid_tank', { A: 2.0, rho: 1000 }),
      makeNode('ref', 'fluid_reference', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'pipe', 'p', 'p'),
      makeEdge('e2', 'pipe', 'tank', 'n', 'p'),
      makeEdge('e3', 'tank', 'ref', 'n', 'gnd'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.005);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 6. Gas Benchmark: Pneumatic Pressure Storage
  it('benchmark 6: gas storage chamber with pneumatic restriction', () => {
    const nodes: Node[] = [
      makeNode('src', 'gas_pressure_source', { P: 200000 }),
      makeNode('valve', 'gas_valve', { Cd: 0.7 }),
      makeNode('chamber', 'gas_chamber', { V: 0.05 }),
      makeNode('ref', 'gas_reference', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'valve', 'p', 'p'),
      makeEdge('e2', 'valve', 'chamber', 'n', 'p'),
      makeEdge('e3', 'chamber', 'ref', 'n', 'gnd'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.002);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 7. Magnetic Benchmark: Reluctance Circuit with MMF Source and Sensor
  it('benchmark 7: magnetic reluctance circuit with flux sensor', () => {
    const nodes: Node[] = [
      makeNode('mmf', 'mmf_source', { Ni: 500 }),
      makeNode('core', 'reluctance', { R: 1e6 }),
      makeNode('sensor', 'flux_sensor', {}),
      makeNode('ref', 'magnetic_reference', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'mmf', 'core', 'p', 'p'),
      makeEdge('e2', 'core', 'sensor', 'n', 'p'),
      makeEdge('e3', 'sensor', 'ref', 'n', 'gnd'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.001);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 8. Control/Signal Benchmark: Closed-Loop Plant
  it('benchmark 8: closed-loop control system with saturation', () => {
    const nodes: Node[] = [
      makeNode('step', 'step_input', { Amp: 1.0, StepTime: 0.1 }),
      makeNode('pid', 'pid_controller', { Kp: 2.0, Ki: 0.5, Kd: 0.1 }),
      makeNode('sat', 'saturation', { upper: 10.0, lower: -10.0 }),
      makeNode('plant', 'first_order_plant', { K: 1.0, tau: 0.1 }),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'step', 'pid', 'out', 'in'),
      makeEdge('e2', 'pid', 'sat', 'out', 'in'),
      makeEdge('e3', 'sat', 'plant', 'out', 'in'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.002);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 9. Electromechanical Benchmark: Coupled DC Motor System
  it('benchmark 9: electromechanical DC motor coupled electrical and mechanical dynamics', () => {
    const nodes: Node[] = [
      makeNode('dc', 'dc_voltage', { V: 24 }),
      makeNode('motor', 'dc_motor', { Ra: 2.0, La: 5e-3, Kt: 0.1, Ke: 0.1, J: 0.01, b: 0.001 }),
      makeNode('gnd', 'ground', {}),
      makeNode('ref', 'rotational_reference', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'dc', 'motor', 'p', 'p_elec'),
      makeEdge('e2', 'motor', 'gnd', 'n_elec', 'gnd'),
      makeEdge('e3', 'motor', 'ref', 'n_mech', 'gnd'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.001);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  // 10. Multi-Domain Appliance Benchmark: Electrical + Thermal + Mechanical Coupling
  it('benchmark 10: multi-domain appliance system with electrical, thermal, and mechanical coupling', () => {
    const nodes: Node[] = [
      makeNode('dc', 'dc_voltage', { V: 120 }),
      makeNode('heater', 'electrical_heater', { R: 20, eta: 0.95 }),
      makeNode('mass', 'thermal_mass', { C: 1000, T0: 295.15 }),
      makeNode('t_ref', 'thermal_reference', {}),
      makeNode('e_gnd', 'ground', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'dc', 'heater', 'p', 'p'),
      makeEdge('e2', 'heater', 'e_gnd', 'n', 'gnd'),
      makeEdge('e3', 'heater', 'mass', 't_out', 'a'),
      makeEdge('e4', 'mass', 't_ref', 'b', 'a'),
    ];

    let state: any = null;
    for (let s = 0; s < 50; s++) {
      state = engine.simulateStep(nodes, edges, state, 0.01);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });
});
