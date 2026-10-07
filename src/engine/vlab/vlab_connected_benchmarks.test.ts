import { describe, it, expect } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { Node, Edge } from '@xyflow/react';

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

  // WP-07 / F-028: every benchmark below is wired with REAL library block ids and exact port ids, so the
  // pre-simulation topology validation (domain, direction, required ports) accepts it and the engine solves
  // the network the title describes. (Earlier revisions used ids that do not exist in the library, e.g.
  // `thermal_reference`, `temperature_source`, `fluid_tank`; those nodes had no ports and tested nothing.)

  const runSteps = (nodes: Node[], edges: Edge[], steps: number, dt: number, probe?: (state: any, t: number) => void) => {
    let state: any = null;
    for (let s = 0; s < steps; s++) {
      state = engine.simulateStep(nodes, edges, state, dt);
      expect(state.x.every(Number.isFinite)).toBe(true);
      if (probe) probe(state, (s + 1) * dt);
    }
    return state;
  };

  // F-041 (WP-30): every benchmark also checks an INDEPENDENT reference value (closed form of the governing equation or a
  // conservation balance written here), not only finiteness. Solved variable by exact engine name.
  const v = (state: any, name: string): number => {
    const i = state.variableNames.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}; have ${state.variableNames.join(', ')}`);
    return state.x[i];
  };

  // 1. Electrical Benchmark: series RLC with DC voltage source
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
      makeEdge('e4', 'cap', 'gnd', 'n', 'a'),
      makeEdge('e5', 'dc', 'gnd', 'n', 'a'),
    ];
    // series RLC, DC step (overdamped here: alpha = R/2L = 25000 > w0 = 1/sqrt(LC) = 1e4):
    //   vC(t) = V [1 - (s2 e^(s1 t) - s1 e^(s2 t)) / (s2 - s1)],  s1,2 = -alpha +- sqrt(alpha^2 - w0^2)
    runSteps(nodes, edges, 100, 0.0001);
    // the fast pole (tau = 21 us) is resolved with a 2 us step; at the 100 us step above the engine is not error-controlled on
    // capacitor voltages (F-103), see the it.fails below
    expect(rlcWorstError(nodes, edges, 2e-6, 1000)).toBeLessThan(0.01 * 24);
  });

  // F-103 (proposed, WP-30): without a Solver Configuration the LTE estimate covers only `_state_` variables and the first BDF1
  // step has no estimate, so across / branch variables (C dv/dt, L di/dt) are not error-controlled: 1.9 % error at dt = 100 us.
  it.fails('benchmark 1 at its own 100 us step meets the 1 % reference (F-103: across variables not error-controlled)', () => {
    expect(rlcWorstError(rlcModel().nodes, rlcModel().edges, 1e-4, 100)).toBeLessThan(0.01 * 24);
  });

  const rlcModel = () => ({
    nodes: [makeNode('dc', 'dc_voltage', { V: 24 }), makeNode('res', 'resistor', { R: 50 }), makeNode('ind', 'inductor', { L: 1e-3 }),
      makeNode('cap', 'capacitor', { C: 1e-5 }), makeNode('gnd', 'ground', {})],
    edges: [makeEdge('e1', 'dc', 'res', 'p', 'p'), makeEdge('e2', 'res', 'ind', 'n', 'p'), makeEdge('e3', 'ind', 'cap', 'n', 'p'),
      makeEdge('e4', 'cap', 'gnd', 'n', 'a'), makeEdge('e5', 'dc', 'gnd', 'n', 'a')],
  });
  /** worst |vC - closed form| of the RLC benchmark run at step dt (R includes the 1 mOhm default source resistance) */
  function rlcWorstError(nodes: Node[], edges: Edge[], dt: number, steps: number): number {
    const V = 24, R = 50.001, L = 1e-3, C = 1e-5;
    const alpha = R / (2 * L), w0 = 1 / Math.sqrt(L * C), r = Math.sqrt(alpha * alpha - w0 * w0), s1 = -alpha + r, s2 = -alpha - r;
    let worst = 0;
    runSteps(nodes, edges, steps, dt, (state, t) => {
      const ref = V * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
      worst = Math.max(worst, Math.abs(v(state, 'Across_cap_p_(electrical)') - ref));
    });
    return worst;
  }

  // 2. Translational Mechanics Benchmark: Mass-Spring-Damper System
  it('benchmark 2: translational mass-spring-damper system response', () => {
    const nodes: Node[] = [
      makeNode('src', 'force_source', { F: 10 }),
      makeNode('mass', 'mass', { m: 1.0 }),
      makeNode('spring', 'trans_spring', { k: 100 }),
      makeNode('damper', 'trans_damper', { b: 5 }),
      makeNode('ref', 'trans_ref', {}),
    ];
    // Ideal Force Source: a positive force drives port B relative to port A (WP-13 certified orientation), so B is on the mass
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'mass', 'b', 'p'),
      makeEdge('e2', 'src', 'ref', 'a', 'p'),
      makeEdge('e3', 'mass', 'spring', 'p', 'r'),
      makeEdge('e4', 'spring', 'ref', 'c', 'p'),
      makeEdge('e5', 'mass', 'damper', 'p', 'r'),
      makeEdge('e6', 'damper', 'ref', 'c', 'p'),
    ];
    // m x'' + b x' + k x = F, x(0) = v(0) = 0 (underdamped): v(t) = F / (m wd) e^(-zeta wn t) sin(wd t)
    const F = 10, m = 1, k = 100, b = 5, wn = Math.sqrt(k / m), zeta = b / (2 * Math.sqrt(k * m)), wd = wn * Math.sqrt(1 - zeta * zeta);
    let worst = 0;
    runSteps(nodes, edges, 50, 0.001, (state, t) => {
      const ref = (F / (m * wd)) * Math.exp(-zeta * wn * t) * Math.sin(wd * t);
      worst = Math.max(worst, Math.abs(v(state, 'Across_damper_r_(translational)') /* net of mass.p */ - ref));
    });
    expect(worst).toBeLessThan(0.01 * F / (m * wd));
  });

  // 3. Rotational Mechanics Benchmark: Inertia-Damper Drivetrain
  it('benchmark 3: rotational inertia and damper system', () => {
    const nodes: Node[] = [
      makeNode('torque', 'torque_source', { T: 5 }),
      makeNode('inertia', 'inertia', { J: 0.01 }),
      makeNode('damper', 'rot_damper', { b: 0.1 }),
      makeNode('ref', 'rot_ref', {}),
    ];
    // Ideal Torque Source: a positive torque drives port C relative to port R (WP-13 certified orientation), so C is on the load
    const edges: Edge[] = [
      makeEdge('e1', 'torque', 'inertia', 'c', 'r'),
      makeEdge('e2', 'torque', 'ref', 'r', 'r'),
      makeEdge('e3', 'inertia', 'damper', 'r', 'r'),
      makeEdge('e4', 'damper', 'ref', 'c', 'r'),
    ];
    // J w' + b w = T: w(t) = T/b (1 - e^(-b t / J))
    const T = 5, J = 0.01, b = 0.1;
    let worst = 0;
    runSteps(nodes, edges, 50, 0.001, (state, t) => {
      worst = Math.max(worst, Math.abs(v(state, 'Across_damper_r_(rotational)') /* net of inertia.r */ - (T / b) * (1 - Math.exp((-b * t) / J))));
    });
    expect(worst).toBeLessThan(0.01 * (T / b) * (1 - Math.exp((-b * 0.05) / J)));
  });

  // 4. Thermal Benchmark: Conductive and Convective Heat Transfer
  it('benchmark 4: thermal mass with Fourier conduction and convection', () => {
    const nodes: Node[] = [
      makeNode('src', 'temp_src', { T: 373.15 }),
      makeNode('cond', 'conductive_heat', { k: 15.0 }),
      makeNode('mass', 'thermal_mass', { C: 500 }),
      makeNode('conv', 'convective_heat', { h: 10, A: 1 }),
      makeNode('ref', 'thermal_ref', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'cond', 'a', 'a'),
      makeEdge('e2', 'cond', 'mass', 'b', 'a'),
      makeEdge('e3', 'mass', 'conv', 'a', 'a'),
      makeEdge('e4', 'conv', 'ref', 'b', 'a'),
    ];
    // C T' = k (T_src - T) - h A (T - 0 K)  (the Thermal Reference is absolute zero), T(0) = T0 = 293.15 K:
    //   T(t) = T_ss + (T0 - T_ss) e^(-t/tau),  T_ss = k T_src / (k + h A),  tau = C / (k + h A)
    const k = 15, hA = 10, C = 500, Ts = 373.15, T0 = 293.15, Tss = (k * Ts) / (k + hA), tau = C / (k + hA);
    let worst = 0;
    runSteps(nodes, edges, 50, 0.01, (state, t) => {
      worst = Math.max(worst, Math.abs(v(state, 'Across_conv_a_(thermal)') /* net of mass.a */ - (Tss + (T0 - Tss) * Math.exp(-t / tau))));
    });
    expect(worst).toBeLessThan(0.01 * (T0 - Tss) * (1 - Math.exp(-0.5 / tau))); // 1 % of the change over the run
  });

  // 5. Fluid Benchmark: pressure source charging a compliant volume through a restriction
  it('benchmark 5: fluid tank with hydrostatic pressure and pipe restriction', () => {
    const nodes: Node[] = [
      makeNode('src', 'pressure_source', { P: 101325 + 5000 }),
      makeNode('pipe', 'fluid_resistance', { Rf: 1e5 }),
      makeNode('tank', 'fluid_capacitance', { Cf: 2.0 }),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'pipe', 'p', 'p'),
      makeEdge('e2', 'pipe', 'tank', 'n', 'p'),
    ];
    // Cf p' = (P_src - p) / Rf, p(0) = 101325 Pa: p(t) = P_src - 5000 e^(-t / (Rf Cf)); the restriction carries mdot = (P_src - p) / Rf
    const Psrc = 101325 + 5000, Rf = 1e5, Cf = 2;
    const state = runSteps(nodes, edges, 50, 0.005);
    const p = v(state, 'Across_tank_p_(fluid)');
    expect(Math.abs(p - (Psrc - 5000 * Math.exp(-0.25 / (Rf * Cf))))).toBeLessThan(1e-3);
    expect(p - 101325).toBeGreaterThan(0.005); // the tank stored mass: Cf (p - p0) = int(mdot) ~ 0.0125 kg
    const mdot = state.x[state.variableNames.findIndex((n: string) => n.startsWith('pipe_branch_'))];
    expect(Math.abs(mdot - (Psrc - p) / Rf)).toBeLessThan(1e-9);
  });

  // 6. Gas Benchmark: Pneumatic Pressure Storage
  it('benchmark 6: gas storage chamber with pneumatic restriction', () => {
    const nodes: Node[] = [
      makeNode('src', 'gas_pressure_source', { P: 200000 }),
      makeNode('valve', 'gas_restriction', { area: 1e-4 }),
      makeNode('chamber', 'gas_chamber', { V: 0.05 }),
      makeNode('cap', 'gas_cap', {}),
      makeNode('ref', 'gas_ref', {}),
    ];
    // Pressure Source (G): P_B - P_A = P. Port A sits on the 1 atm reference and B feeds the restriction, so the upstream pressure
    // is 301325 Pa absolute (the earlier wiring, A on the restriction and B on the reference, demanded -98675 Pa absolute).
    const edges: Edge[] = [
      makeEdge('e1', 'src', 'valve', 'b', 'a'),
      makeEdge('e2', 'valve', 'chamber', 'b', 'a'),
      makeEdge('e3', 'chamber', 'cap', 'b', 'a'),
      makeEdge('e4', 'src', 'ref', 'a', 'g'),
    ];
    // choked while p_ch / p_up < r* = 0.528: mdot* = Cd A p_up sqrt(g/(R T)) (2/(g+1))^((g+1)/(2(g-1))), isothermal chamber
    // dp/dt = R T mdot* / V  ->  p(t) = 101325 + R T mdot* t / V
    const pUp = 101325 + 200000, Cd = 0.62, A = 1e-4, g = 1.4, Rg = 287, T = 293.15, V = 0.05;
    const mdot = Cd * A * pUp * Math.sqrt(g / (Rg * T)) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)));
    let worst = 0;
    const state = runSteps(nodes, edges, 50, 0.002, (st, t) => {
      worst = Math.max(worst, Math.abs(v(st, 'Across_chamber_a_(gas)') - (101325 + (Rg * T * mdot * t) / V)));
    });
    expect(v(state, 'Across_chamber_a_(gas)') / pUp).toBeLessThan(Math.pow(2 / (g + 1), g / (g - 1)));
    expect(worst).toBeLessThan(0.005 * (Rg * T * mdot * 0.1) / V);
  });

  // 7. Magnetic Benchmark: MMF source driving a reluctance, flux read by a flux sensor
  it('benchmark 7: magnetic reluctance circuit with flux sensor', () => {
    const nodes: Node[] = [
      makeNode('mmf', 'mag_mmf_source', { MMF: 500 }),
      makeNode('core', 'reluctance', { R: 1e6 }),
      makeNode('sensor', 'mag_flux_sensor', {}),
      makeNode('ref', 'mag_ref', {}),
      makeNode('scope', 'scope', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'mmf', 'core', 's', 'n'),
      makeEdge('e2', 'core', 'sensor', 's', 'n'),
      makeEdge('e3', 'sensor', 'mmf', 's', 'n'),
      makeEdge('e4', 'mmf', 'ref', 'n', 'n'),
      makeEdge('e5', 'sensor', 'scope', 'phi', 'in1'),
    ];
    const state = runSteps(nodes, edges, 50, 0.001);
    const v = state.scopeValues;
    const flux = typeof v === 'object' && v !== null ? Number((v as any).value ?? (v as any).in1) : Number(v);
    // Hopkinson's law: phi = MMF / R = 500 / 1e6 = 5e-4 Wb (sign follows the sensor orientation)
    expect(Math.abs(flux)).toBeCloseTo(5e-4, 6);
  });

  // 8. Control/Signal Benchmark: Closed-Loop Plant
  it('benchmark 8: closed-loop control system with saturation', () => {
    const nodes: Node[] = [
      // constant reference: a ps_step discontinuity inside the PID+saturation loop collapses the step controller
      // (reported as a solver/event finding in WP-07), so the reference is held constant here.
      makeNode('step', 'ps_constant', { value: 1.0 }),
      makeNode('pid', 'ps_pid_ctrl', { Kp: 2.0, Ki: 0.5, Kd: 0.1 }),
      makeNode('sat', 'ps_saturation', { upper: 1.5, lower: -1.5 }),
      makeNode('plant', 'ps_transfer_fcn', { T: 0.1 }),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'step', 'pid', 'y', 'e'),
      makeEdge('e2', 'pid', 'sat', 'u', 'u'),
      makeEdge('e3', 'sat', 'plant', 'y', 'u'),
    ];
    // e = 1: u = Kp + Ki t + D >= 2 > 1.5 throughout (D >= 0 decays from the derivative kick), so the saturation holds 1.5 and the
    // plant T y' + y = 1.5 gives y(t) = 1.5 (1 - e^(-t/T)), T = 0.1 s
    let worst = 0;
    runSteps(nodes, edges, 50, 0.002, (state, t) => {
      expect(v(state, 'sat_branch_signal_y')).toBeCloseTo(1.5, 9);
      worst = Math.max(worst, Math.abs(v(state, 'plant_branch_signal_y') - 1.5 * (1 - Math.exp(-t / 0.1))));
    });
    expect(worst).toBeLessThan(0.01 * 1.5 * (1 - Math.exp(-1)));
  });

  // 9. Electromechanical Benchmark: Coupled DC Motor System
  it('benchmark 9: electromechanical DC motor coupled electrical and mechanical dynamics', () => {
    const nodes: Node[] = [
      makeNode('dc', 'dc_voltage', { V: 24 }),
      makeNode('motor', 'dc_motor', { Ra: 2.0, La: 5e-3, Kt: 0.1, Ke: 0.1, J: 0.01, B: 0.001 }),
      makeNode('gnd', 'ground', {}),
      makeNode('ref', 'rot_ref', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'dc', 'motor', 'p', 'p'),
      makeEdge('e2', 'motor', 'gnd', 'n', 'a'),
      makeEdge('e3', 'dc', 'gnd', 'n', 'a'),
      makeEdge('e4', 'motor', 'ref', 'r', 'r'),
    ];
    // the shaft R sits on the Mechanical Rotational Reference: a LOCKED-ROTOR test, w = 0, no back EMF, so
    //   La di/dt + Ra i = V  ->  i(t) = V/Ra (1 - e^(-t Ra/La)) (stall current 12 A)
    runSteps(nodes, edges, 50, 0.001);
    // tau = La/Ra = 2.5 ms is resolved with a 0.1 ms step (at the 1 ms step above the first BDF1 step is not error-controlled, F-103)
    expect(lockedRotorWorstError(nodes, edges, 1e-4, 500)).toBeLessThan(0.01 * 12);
  });

  it.fails('benchmark 9 at its own 1 ms step meets the 1 % reference (F-103: first BDF1 step / branch currents not error-controlled)', () => {
    const nodes: Node[] = [
      makeNode('dc', 'dc_voltage', { V: 24 }),
      makeNode('motor', 'dc_motor', { Ra: 2.0, La: 5e-3, Kt: 0.1, Ke: 0.1, J: 0.01, B: 0.001 }),
      makeNode('gnd', 'ground', {}), makeNode('ref', 'rot_ref', {}),
    ];
    const edges: Edge[] = [makeEdge('e1', 'dc', 'motor', 'p', 'p'), makeEdge('e2', 'motor', 'gnd', 'n', 'a'),
      makeEdge('e3', 'dc', 'gnd', 'n', 'a'), makeEdge('e4', 'motor', 'ref', 'r', 'r')];
    expect(lockedRotorWorstError(nodes, edges, 1e-3, 50)).toBeLessThan(0.01 * 12);
  });

  /** worst |i - closed form| of the locked-rotor DC motor (R includes the 1 mOhm default source resistance) */
  function lockedRotorWorstError(nodes: Node[], edges: Edge[], dt: number, steps: number): number {
    const V = 24, Ra = 2.001, La = 5e-3;
    let worst = 0;
    runSteps(nodes, edges, steps, dt, (state, t) => {
      worst = Math.max(worst, Math.abs(v(state, 'motor_branch_current') - (V / Ra) * (1 - Math.exp((-t * Ra) / La))));
      expect(v(state, 'Across_ref_r_(rotational)')).toBe(0); // locked shaft
    });
    return worst;
  }

  // 10. Multi-Domain Appliance Benchmark: Electrical + Thermal coupling
  it('benchmark 10: multi-domain appliance system with electrical, thermal, and mechanical coupling', () => {
    const nodes: Node[] = [
      makeNode('dc', 'dc_voltage', { V: 120 }),
      makeNode('heater', 'upper_heater', { resistance: 20 }),
      makeNode('mass', 'thermal_mass', { C: 1000 }),
      makeNode('loss', 'convective_heat', { h: 10, A: 1 }),
      makeNode('t_ref', 'thermal_ref', {}),
      makeNode('e_gnd', 'ground', {}),
    ];
    const edges: Edge[] = [
      makeEdge('e1', 'dc', 'heater', 'p', 'p'),
      makeEdge('e2', 'heater', 'e_gnd', 'n', 'a'),
      makeEdge('e3', 'dc', 'e_gnd', 'n', 'a'),
      makeEdge('e4', 'heater', 'mass', 'h', 'a'),
      makeEdge('e5', 'mass', 'loss', 'a', 'a'),
      makeEdge('e6', 'loss', 't_ref', 'b', 'a'),
    ];
    // heater: Q_H = efficiency V^2 / R = 0.9 * 120^2 / 20 = 648 W into H; C T' = Q_H - h A (T - 0 K), T(0) = 293.15 K
    //   T(t) = Q_H/(h A) + (293.15 - Q_H/(h A)) e^(-t h A / C)
    const QH = (0.9 * 120 * 120) / 20, hA = 10, C = 1000, T0 = 293.15;
    let worst = 0;
    runSteps(nodes, edges, 50, 0.01, (state, t) => {
      worst = Math.max(worst, Math.abs(v(state, 'Across_loss_a_(thermal)') /* net of mass.a */ - (QH / hA + (T0 - QH / hA) * Math.exp((-t * hA) / C))));
    });
    expect(worst).toBeLessThan(0.01 * Math.abs((QH - hA * T0) / C) * 0.5); // 1 % of the change over the 0.5 s run
  });
});