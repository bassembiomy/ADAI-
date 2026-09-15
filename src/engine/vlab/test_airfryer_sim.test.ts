import { describe, it, expect } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { Node, Edge } from '@xyflow/react';

const reconstructLabNodes = (nodes: any[]): Node[] => {
  return nodes.map(n => ({
    id: n.id,
    type: 'default',
    position: n.position,
    data: {
      type: n.blockId,
      blockId: n.blockId,
      label: n.label,
      params: n.params
    }
  }));
};

const createAirFryerCalibrationFixture = () => {
  const lab = {
    nodes: [
      { id: 'ac_supply', blockId: 'ac_voltage', position: { x: 0, y: 0 }, label: '230V AC Supply', params: { Vpk: 230 * Math.SQRT2, f: 50 } },
      { id: 'heating_element', blockId: 'thermal_resistor', position: { x: 0, y: 0 }, label: 'Heating Element', params: { Rth: 35 } },
      { id: 'air_chamber', blockId: 'ma_chamber', position: { x: 0, y: 0 }, label: 'Cooking Basket (Air)', params: { V: 0.005, ambient_temp: 100 } },
      { id: 'temp_sensor', blockId: 'temp_sensor', position: { x: 0, y: 0 }, label: 'Basket Temp Sensor' },
      { id: 'thermal_scope', blockId: 'scope', position: { x: 0, y: 0 }, label: 'Temp Monitor' },
      { id: 'ground', blockId: 'ground', position: { x: 0, y: 0 }, label: 'PE Ground' }
    ],
    edges: [
      { id: 'e1', source: 'ac_supply', target: 'heating_element', sourceHandle: 'p_s', targetHandle: 'a_t' },
      { id: 'e1_ret', source: 'heating_element', target: 'ground', sourceHandle: 'b_s', targetHandle: 'a_t' },
      { id: 'e1_gnd', source: 'ac_supply', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e2', source: 'heating_element', target: 'air_chamber', sourceHandle: 'h_s', targetHandle: 'h_t' },
      { id: 'e3', source: 'air_chamber', target: 'temp_sensor', sourceHandle: 'h_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'temp_sensor', target: 'thermal_scope', sourceHandle: 't_s', targetHandle: 'in1_t' }
    ]
  };

  return { nodes: reconstructLabNodes(lab.nodes), edges: lab.edges as any[] };
};

const createAirFryerScopeFixture = () => {
  const lab = {
    nodes: [
      { id: 'air_chamber', blockId: 'ma_chamber', position: { x: 0, y: 0 }, label: 'Cooking Basket (Air)', params: { V: 0.005, ambient_temp: 100, k_loss: 0 } },
      { id: 'thermal_scope', blockId: 'scope', position: { x: 0, y: 0 }, label: 'Temp Monitor' }
    ],
    edges: [
      { id: 'e1', source: 'air_chamber', target: 'thermal_scope', sourceHandle: 'h_s', targetHandle: 'in1_t' }
    ]
  };

  return { nodes: reconstructLabNodes(lab.nodes), edges: lab.edges as any[] };
};

describe('Air Fryer Simulation debug', () => {
  it('exposes a 373.15 K chamber state as 100 °C at the air-fryer scope', () => {
    const fixture = createAirFryerScopeFixture();
    const engine = new VLabPhysicsEngine();
    const seededState = engine.simulateStep(fixture.nodes, fixture.edges, null, 0.001);
    const tempIndex = seededState.variableNames.indexOf('air_chamber_state_temp');
    expect(tempIndex).toBeGreaterThanOrEqual(0);

    const initialState = {
      ...seededState,
      x: [...seededState.x],
      prevX: undefined,
      prevDt: undefined,
      time: 0
    };
    initialState.x[tempIndex] = 373.15;
    const state = engine.simulateStep(fixture.nodes, fixture.edges, initialState, 0.001);

    expect(state.scopeValues).toBeCloseTo(100, 2);
  });

  it('expects 230 V RMS across 35 ohms to produce about 1511 W average power', () => {
    const fixture = createAirFryerCalibrationFixture();
    const engine = new VLabPhysicsEngine();
    const sampleCount = 20;
    const dt = 1 / (50 * sampleCount);
    let state: any = null;
    const heatSamples: number[] = [];

    for (let sample = 0; sample < sampleCount; sample++) {
      state = engine.simulateStep(fixture.nodes, fixture.edges, state, dt);
      const heatIndex = state.variableNames.indexOf('heating_element_branch_heat_flow');
      expect(heatIndex).toBeGreaterThanOrEqual(0);
      heatSamples.push(state.x[heatIndex]);
    }

    const meanHeatFlow = heatSamples.reduce((sum, heat) => sum + heat, 0) / heatSamples.length;
    expect(meanHeatFlow).toBeCloseTo((230 ** 2) / 35, 0);
  });

  it('simulates air fryer for 100 steps and prints temperature profile', { timeout: 30000 }, () => {
    const lab = {
      id: 'air_fryer_thermal',
      nodes: [
        { id: 'ac_supply', blockId: 'ac_voltage', position: { x: 50, y: 200 }, label: '230V AC Supply', params: { Vpk: 325, f: 50 } },
        { id: 'heating_element', blockId: 'thermal_resistor', position: { x: 250, y: 200 }, label: 'Heating Element', params: { Rth: 35 } },
        { id: 'convection_link', blockId: 'convective_heat', position: { x: 450, y: 100 }, label: 'Convection Interface', params: { h: 80, A: 0.15 } },
        { id: 'air_chamber', blockId: 'ma_chamber', position: { x: 650, y: 200 }, label: 'Cooking Basket (Air)', params: { V: 0.005 } },
        { id: 'circulation_fan', blockId: 'ma_pressure_source', position: { x: 650, y: 400 }, label: 'Air Circulation Fan', params: { P: 150 } },
        { id: 'fan_ctrl', blockId: 'ps_constant', position: { x: 650, y: 550 }, label: 'Fan Speed Ctrl', params: { value: 0.8 } },
        { id: 'temp_sensor', blockId: 'temp_sensor', position: { x: 850, y: 200 }, label: 'Basket Temp Sensor' },
        { id: 'thermal_scope', blockId: 'scope', position: { x: 1050, y: 150 }, label: 'Temp Monitor', params: { time_range: 300 } },
        { id: 'thermal_ref', blockId: 'thermal_ref', position: { x: 850, y: 350 }, label: 'Thermal Reference' },
        { id: 'ground', blockId: 'ground', position: { x: 200, y: 400 }, label: 'PE Ground' }
      ],
      edges: [
        { id: 'e1', source: 'ac_supply', target: 'heating_element', sourceHandle: 'p_s', targetHandle: 'a_t' },
        { id: 'e1_ret', source: 'heating_element', target: 'ground', sourceHandle: 'b_s', targetHandle: 'a_t' },
        { id: 'e1_gnd', source: 'ac_supply', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e2', source: 'heating_element', target: 'convection_link', sourceHandle: 'h_s', targetHandle: 'a_t' },
        { id: 'e3', source: 'convection_link', target: 'air_chamber', sourceHandle: 'b_s', targetHandle: 'h_t' },
        { id: 'e4', source: 'fan_ctrl', target: 'circulation_fan', sourceHandle: 'y_s', targetHandle: 's_t' },
        { id: 'e5', source: 'circulation_fan', target: 'air_chamber', sourceHandle: 'b_s', targetHandle: 'a_t' },
        { id: 'e6', source: 'air_chamber', target: 'temp_sensor', sourceHandle: 'h_s', targetHandle: 'a_t' },
        { id: 'e6_ref', source: 'temp_sensor', target: 'thermal_ref', sourceHandle: 'b_s', targetHandle: 'a_t' },
        { id: 'e7', source: 'temp_sensor', target: 'thermal_scope', sourceHandle: 't_s', targetHandle: 'in1_t' }
      ]
    };

    const nodes = reconstructLabNodes(lab.nodes);
    const edges = lab.edges as any[];

    const engine = new VLabPhysicsEngine();
    let state: any = null;
    const dt = 0.05;
    
    console.log('Running Air Fryer simulation for 100 steps (5 seconds total):');
    for (let step = 0; step < 100; step++) {
      state = engine.simulateStep(nodes, edges, state, dt);
      if ((step + 1) % 10 === 0 || step < 5) {
        console.log(`  Step ${step + 1} (t = ${((step + 1) * dt).toFixed(2)}s): Scope value = ${state.scopeValues} °C`);
      }
    }
    expect(Number(state.scopeValues)).toBeGreaterThan(0);
  });
});
