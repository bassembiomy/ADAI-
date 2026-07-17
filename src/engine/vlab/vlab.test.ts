import { describe, it, expect } from 'vitest';
import { Node, Edge } from 'reactflow';
import { VLabPhysicsEngine } from './vlabPhysics';

describe('VLab Physical DAE Engine Tests', () => {
  it('solves simple DC electrical circuit (Ohm\'s Law)', () => {
    const engine = new VLabPhysicsEngine();
    
    // Nodes: ground (0V), dc_voltage (12V), resistor (100 ohms)
    const nodes: Node[] = [
      { id: 'gnd', data: { type: 'ground' } } as any,
      { id: 'src', data: { type: 'dc_voltage', params: { V: 12 } } } as any,
      { id: 'res', data: { type: 'resistor', params: { R: 100 } } } as any,
    ];
    
    // Connections:
    // src.p -> res.p
    // src.n -> gnd.a
    // res.n -> gnd.a
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    let state: any = null;
    const dt = 0.05;
    
    for (let i = 0; i < 5; i++) {
      state = engine.simulateStep(nodes, edges, state, dt);
    }

    expect(state).toBeDefined();
    expect(state.x).toBeDefined();
    
    // Find the resistor branch current
    const system = engine['currentSystem']!;
    const resIdx = system.variableNames.findIndex(name => name.includes('res_branch_current'));
    expect(resIdx).not.toBe(-1);
    
    // Resistor current should be V / R = 12 / 100 = 0.12 A
    expect(state.x[resIdx]).toBeCloseTo(0.12, 4);
  });

  it('simulates RC charging curve correctly', () => {
    const engine = new VLabPhysicsEngine();
    
    // dc_voltage (10V) -> resistor (1000 ohms) -> capacitor (10uF) -> ground
    const nodes: Node[] = [
      { id: 'gnd', data: { type: 'ground' } } as any,
      { id: 'src', data: { type: 'dc_voltage', params: { V: 10 } } } as any,
      { id: 'res', data: { type: 'resistor', params: { R: 1000 } } } as any,
      { id: 'cap', data: { type: 'capacitor', params: { C: 1e-3 } } } as any, // C = 1 mF
    ];
    
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'res', target: 'cap', sourceHandle: 'n_s', targetHandle: 'p_t' },
      { id: 'e3', source: 'cap', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    let state: any = null;
    const dt = 0.001; // 1 ms steps for high accuracy
    
    // Simulate for 1.0 seconds (1000 steps)
    for (let t = 0; t < 1000; t++) {
      state = engine.simulateStep(nodes, edges, state, dt);
    }
    
    const system = engine['currentSystem']!;
    
    // Find capacitor voltage (across variable of the node between resistor and capacitor)
    const capAcrossIdx = system.components.find(c => c.blockId === 'cap')!.portNodeMap.get('p')!;
    const capVarIdx = system.variableNames.findIndex(name => name.includes(capAcrossIdx));
    
    expect(capVarIdx).not.toBe(-1);
    const V_cap = state.x[capVarIdx];
    
    // Expected V_cap = V_src * (1 - e^(-t/RC)) = 10 * (1 - e^(-1)) = 6.3212 V (discretized gives 6.3194)
    expect(V_cap).toBeCloseTo(6.3194, 3);
  });

  it('solves mechanical mass-spring-damper response', () => {
    const engine = new VLabPhysicsEngine();
    
    // force_source (10N) -> mass (1kg) -> spring (100 N/m) -> damper (5 N-s/m) -> ref
    const nodes: Node[] = [
      { id: 'ref', data: { type: 'trans_ref' } } as any,
      { id: 'f_src', data: { type: 'force_source', params: { F: 10 } } } as any, // Library param is F
      { id: 'mass', data: { type: 'mass', params: { m: 1.0 } } } as any,
      { id: 'spring', data: { type: 'trans_spring', params: { k: 100 } } } as any,
      { id: 'damper', data: { type: 'trans_damper', params: { b: 5 } } } as any,
    ];

    // Connect them using the correct ports:
    // f_src.a -> mass.p
    // f_src.b -> ref.p
    // mass.p -> spring.r
    // spring.c -> ref.p
    // mass.p -> damper.r
    // damper.c -> ref.p
    const edges: Edge[] = [
      { id: 'me1', source: 'f_src', target: 'mass', sourceHandle: 'a_s', targetHandle: 'p_t' },
      { id: 'me_ref1', source: 'f_src', target: 'ref', sourceHandle: 'b_s', targetHandle: 'p_t' },
      { id: 'me2', source: 'mass', target: 'spring', sourceHandle: 'p_s', targetHandle: 'r_t' },
      { id: 'me3', source: 'spring', target: 'ref', sourceHandle: 'c_s', targetHandle: 'p_t' },
      { id: 'me4', source: 'mass', target: 'damper', sourceHandle: 'p_s', targetHandle: 'r_t' },
      { id: 'me5', source: 'damper', target: 'ref', sourceHandle: 'c_s', targetHandle: 'p_t' },
    ];

    let state: any = null;
    const dt = 0.05;
    
    // Simulate 4.0 seconds to settle to steady state
    for (let step = 0; step < 80; step++) {
      state = engine.simulateStep(nodes, edges, state, dt);
    }
    
    // At steady state:
    // Force = spring_force => 10 = k * x => x = 10 / 100 = 0.1 m
    // Velocity v = 0
    const system = engine['currentSystem']!;
    const springStateIdx = system.variableNames.findIndex(name => name.includes('spring_state_x'));
    const massVelocityIdx = system.components.find(c => c.blockId === 'mass')!.portNodeMap.get('p')!;
    const massVelVarIdx = system.variableNames.findIndex(name => name.includes(massVelocityIdx));
    
    expect(springStateIdx).not.toBe(-1);
    expect(massVelVarIdx).not.toBe(-1);
    
    expect(state.x[springStateIdx]).toBeCloseTo(-0.1, 3);
    expect(state.x[massVelVarIdx]).toBeCloseTo(0.0, 3);
  });

  it('runs control loop with PID block', () => {
    const engine = new VLabPhysicsEngine();
    
    // ps_constant (ref = 5) -> ps_subtract (error) -> ps_pid_ctrl (output)
    const nodes: Node[] = [
      { id: 'ref', data: { type: 'ps_constant', params: { value: 5.0 } } } as any,
      { id: 'sub', data: { type: 'ps_subtract' } } as any,
      { id: 'pid', data: { type: 'ps_pid_ctrl', params: { Kp: 2.0, Ki: 1.0, Kd: 0.1 } } } as any,
    ];

    // ref.y -> sub.u1
    // pid.u -> sub.u2 (feedback)
    // sub.y -> pid.e
    const edges: Edge[] = [
      { id: 'ce1', source: 'ref', target: 'sub', sourceHandle: 'y_s', targetHandle: 'u1_t' },
      { id: 'ce2', source: 'pid', target: 'sub', sourceHandle: 'u_s', targetHandle: 'u2_t' },
      { id: 'ce3', source: 'sub', target: 'pid', sourceHandle: 'y_s', targetHandle: 'e_t' },
    ];

    let state: any = null;
    const dt = 0.05;
    
    // Simulate 25.0 seconds to settle
    for (let step = 0; step < 500; step++) {
      state = engine.simulateStep(nodes, edges, state, dt);
    }

    const system = engine['currentSystem']!;
    
    // Find output of PID (across variable of the node connected to pid.u)
    const pidOutNode = system.components.find(c => c.blockId === 'pid')!.portNodeMap.get('u')!;
    const pidOutIdx = system.variableNames.findIndex(name => name.includes(pidOutNode));
    
    expect(pidOutIdx).not.toBe(-1);
    
    // With feedback y = PID(ref - y)
    // Steady state: y = ref = 5.0 (due to integral action Ki = 1.0)
    expect(state.x[pidOutIdx]).toBeCloseTo(5.0, 2);
  });

  it('detects zero-crossing events on ps_step input', () => {
    const engine = new VLabPhysicsEngine();
    
    // ps_step (stepTime = 0.5s, final = 10) -> ps_saturation (upper = 5) -> scope
    const nodes: Node[] = [
      { id: 'step', data: { type: 'ps_step', params: { stepTime: 0.5, initial: 0, final: 10 } } } as any,
      { id: 'sat', data: { type: 'ps_saturation', params: { upper: 5.0, lower: -5.0 } } } as any,
      { id: 'scope', data: { type: 'scope' } } as any,
    ];
    
    const edges: Edge[] = [
      { id: 'e1', source: 'step', target: 'sat', sourceHandle: 'y_s', targetHandle: 'u_t' },
      { id: 'e2', source: 'sat', target: 'scope', sourceHandle: 'y_s', targetHandle: 'in1_t' },
    ];
    
    let state: any = null;
    const dt = 0.1;
    
    // Step over 1.0 second (10 steps)
    for (let i = 0; i < 10; i++) {
      state = engine.simulateStep(nodes, edges, state, dt);
    }
    
    const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
    expect(val).toBeCloseTo(5.0, 3);
  });
});
