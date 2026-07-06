import { describe, it, expect } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

// Replicate reconstructLabNodes without ReactFlow dependence
const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);

const reconstructLabNodes = (labNodes: any[]): any[] => {
  return labNodes.map(ln => {
    const baseBlock = allBlocks.find(b => b.id === ln.blockId);
    if (!baseBlock) {
      return {
        id: ln.id,
        type: 'default',
        position: ln.position,
        data: { label: ln.label || ln.id, type: ln.blockId, params: {} }
      };
    }

    const mergedParams = JSON.parse(JSON.stringify(baseBlock.params));
    if (ln.params) {
      Object.keys(ln.params).forEach(key => {
        if (mergedParams[key]) {
          mergedParams[key].value = ln.params![key];
        }
      });
    }

    const domain = VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === ln.blockId))?.type;

    return {
      id: ln.id,
      type: 'default',
      position: ln.position,
      data: {
        label: ln.label || baseBlock.name,
        type: baseBlock.id,
        icon: baseBlock.icon,
        color: baseBlock.color,
        ports: baseBlock.ports,
        params: mergedParams,
        domain
      }
    };
  });
};

const LEARNING_LABS = [
  {
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
      { id: 'e7', source: 'temp_sensor', target: 'thermal_scope', sourceHandle: 't_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'blender_mixer',
    nodes: [
      { id: 'dc_source', blockId: 'dc_voltage', position: { x: 50, y: 200 }, label: '24V Battery', params: { V: 24 } },
      { id: 'blender_motor', blockId: 'rotational_electromechanical_converter', position: { x: 250, y: 200 }, label: 'DC Motor', params: { K: 0.05, R: 2 } },
      { id: 'mixture_drag', blockId: 'rot_damper', position: { x: 450, y: 200 }, label: 'Mixture Viscosity', params: { b: 0.001 } },
      { id: 'blade_inertia', blockId: 'inertia', position: { x: 450, y: 350 }, label: 'Blade Inertia', params: { J: 0.0002 } },
      { id: 'speed_sensor', blockId: 'rot_motion_sensor', position: { x: 650, y: 200 }, label: 'Speed Sensor' },
      { id: 'blender_scope', blockId: 'scope', position: { x: 850, y: 150 }, label: 'Performance Monitor', params: { time_range: 5 } },
      { id: 'gnd', blockId: 'ground', position: { x: 150, y: 400 }, label: 'Common' }
    ],
    edges: [
      { id: 'be1', source: 'dc_source', target: 'blender_motor', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'be1_ret', source: 'blender_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'be1_gnd', source: 'dc_source', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'be2', source: 'blender_motor', target: 'mixture_drag', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'be3', source: 'mixture_drag', target: 'blade_inertia', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'be4', source: 'mixture_drag', target: 'speed_sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'be5', source: 'speed_sensor', target: 'blender_scope', sourceHandle: 'w_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'pid_ac_motor',
    nodes: [
      { id: 'ref_speed', blockId: 'ps_constant', position: { x: 50, y: 50 }, label: 'Ref Speed (rad/s)', params: { value: 157 } },
      { id: 'error_calc', blockId: 'ps_subtract', position: { x: 200, y: 100 }, label: 'Error' },
      { id: 'speed_pid', blockId: 'ps_pid_ctrl', position: { x: 350, y: 100 }, label: 'Speed PID', params: { Kp: 2.5, Ki: 1.2 } },
      { id: 'dc_bus', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Link (600V)', params: { V: 600 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 500, y: 300 }, label: 'Inverter Bridge' },
      { id: 'ac_motor', blockId: 'ac_motor', position: { x: 700, y: 300 }, label: 'Induction Motor', params: { P: 2 } },
      { id: 'speed_sensor', blockId: 'rot_motion_sensor', position: { x: 850, y: 300 }, label: 'Encoder' },
      { id: 'scope', blockId: 'scope', position: { x: 1000, y: 150 }, label: 'PID Response', params: { time_range: 10 } },
      { id: 'gnd', blockId: 'ground', position: { x: 500, y: 500 }, label: 'GND' }
    ],
    edges: [
      { id: 'pe1', source: 'ref_speed', target: 'error_calc', sourceHandle: 'y_s', targetHandle: 'u1_t' },
      { id: 'pe2', source: 'speed_sensor', target: 'error_calc', sourceHandle: 'w_s', targetHandle: 'u2_t' },
      { id: 'pe3', source: 'error_calc', target: 'speed_pid', sourceHandle: 'y_s', targetHandle: 'e_t' },
      { id: 'pe4', source: 'speed_pid', target: 'inverter', sourceHandle: 'u_s', targetHandle: 'vabc_t' },
      { id: 'pe5', source: 'dc_bus', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'pe6', source: 'dc_bus', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe7', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe8', source: 'inverter', target: 'ac_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 'pe9', source: 'inverter', target: 'ac_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 'pe10', source: 'inverter', target: 'ac_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 'pe11', source: 'ac_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe12', source: 'ac_motor', target: 'speed_sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'pe13', source: 'speed_sensor', target: 'scope', sourceHandle: 'w_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'vfd_inverter_drive',
    nodes: [
      { id: 'dc_link', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Link (600V)', params: { V: 600 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 300, y: 300 }, label: '3-Phase Inverter' },
      { id: 'vfd_controller', blockId: 'im_foc_ctrl', position: { x: 300, y: 100 }, label: 'VFD Controller', params: { mode: 1 } },
      { id: 'im_motor', blockId: 'ac_motor', position: { x: 550, y: 300 }, label: 'Induction Motor' },
      { id: 'ref_speed', blockId: 'ps_step', position: { x: 50, y: 100 }, label: 'Speed Reference', params: { time: 1, initial: 500, final: 1500 } },
      { id: 'vfd_scope', blockId: 'scope', position: { x: 800, y: 200 }, label: 'VFD Performance', params: { time_range: 5 } },
      { id: 'gnd', blockId: 'ground', position: { x: 300, y: 500 }, label: 'Common Ground' }
    ],
    edges: [
      { id: 've1', source: 'ref_speed', target: 'vfd_controller', sourceHandle: 'y_s', targetHandle: 'wr_ref_t' },
      { id: 've2', source: 'dc_link', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 've2_ret', source: 'dc_link', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 've2_inv', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 've3', source: 'vfd_controller', target: 'inverter', sourceHandle: 'vabc_s', targetHandle: 'vabc_t' },
      { id: 've4_a', source: 'inverter', target: 'im_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 've4_b', source: 'inverter', target: 'im_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 've4_c', source: 'inverter', target: 'im_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 've4_n', source: 'im_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 've5', source: 'im_motor', target: 'vfd_scope', sourceHandle: 'r_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'smart_washing_machine',
    nodes: [
      { id: 'washing_ctrl', blockId: 'im_foc_ctrl', position: { x: 50, y: 100 }, label: 'Wash Cycle Controller', params: { target_rpm: 600 } },
      { id: 'dc_link', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Bus (320V)', params: { V: 320 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 300, y: 300 }, label: 'Inverter Drive' },
      { id: 'wash_motor', blockId: 'ac_motor', position: { x: 550, y: 300 }, label: 'Direct Drive Motor' },
      { id: 'basket_load', blockId: 'washing_basket', position: { x: 750, y: 300 }, label: 'Washing Basket', params: { load_mass: 6 } },
      { id: 'wash_scope', blockId: 'scope', position: { x: 950, y: 200 }, label: 'Cycle Analysis', params: { time_range: 10 } },
      { id: 'gnd', blockId: 'ground', position: { x: 300, y: 500 }, label: 'System Ground' }
    ],
    edges: [
      { id: 'we1', source: 'washing_ctrl', target: 'inverter', sourceHandle: 'vabc_s', targetHandle: 'vabc_t' },
      { id: 'we2_dc', source: 'dc_link', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'we2_gnd', source: 'dc_link', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we2_inv', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we3_a', source: 'inverter', target: 'wash_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 'we3_b', source: 'inverter', target: 'wash_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 'we3_c', source: 'inverter', target: 'wash_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 'we3_n', source: 'wash_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we4', source: 'wash_motor', target: 'basket_load', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'we5', source: 'wash_motor', target: 'wash_scope', sourceHandle: 'r_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'advanced_microwave_design',
    nodes: [
      { id: 'pwr_ac', blockId: 'ac_voltage', position: { x: 50, y: 300 }, label: 'AC Supply (230V)', params: { Vpk: 325, f: 50 } },
      { id: 'mw_inverter', blockId: 'microwave_inverter', position: { x: 250, y: 150 }, label: 'HV Inverter', params: { v_out: 4000 } },
      { id: 'mw_magnetron', blockId: 'magnetron', position: { x: 450, y: 100 }, label: '900W Magnetron', params: { efficiency: 65 } },
      { id: 'mw_heater', blockId: 'upper_heater', position: { x: 450, y: 250 }, label: 'Upper Heater', params: { resistance: 35 } },
      { id: 'mw_steam', blockId: 'steam_generator', position: { x: 450, y: 400 }, label: '800W Steam Gen', params: { power: 800 } },
      { id: 'mw_cavity', blockId: 'microwave_cavity', position: { x: 700, y: 250 }, label: '25L Cavity', params: { volume: 25 } },
      { id: 'mw_scope', blockId: 'scope', position: { x: 900, y: 250 }, label: 'Temp Analysis', params: { time_range: 30 } },
      { id: 'mw_ground', blockId: 'ground', position: { x: 300, y: 500 }, label: 'Circuit Ground', params: {} }
    ],
    edges: [
      { id: 'me1', source: 'pwr_ac', target: 'mw_inverter', sourceHandle: 'p_s', targetHandle: 'ac_in_t' },
      { id: 'me2', source: 'mw_inverter', target: 'mw_magnetron', sourceHandle: 'hv_out_s', targetHandle: 'p_t' },
      { id: 'me3', source: 'pwr_ac', target: 'mw_heater', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'me4', source: 'pwr_ac', target: 'mw_steam', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'me5', source: 'mw_magnetron', target: 'mw_cavity', sourceHandle: 'h_s', targetHandle: 'h1_t' },
      { id: 'me6', source: 'mw_heater', target: 'mw_cavity', sourceHandle: 'h_s', targetHandle: 'h2_t' },
      { id: 'me7', source: 'mw_steam', target: 'mw_cavity', sourceHandle: 's_s', targetHandle: 'h3_t' },
      { id: 'me8', source: 'mw_cavity', target: 'mw_scope', sourceHandle: 't_s', targetHandle: 'in1_t' },
      { id: 'mg1', source: 'pwr_ac', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'mg2', source: 'mw_magnetron', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'mg3', source: 'mw_heater', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'mg4', source: 'mw_steam', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' }
    ]
  },
  {
    id: 'voltage_sensing_circuit',
    nodes: [
      { id: 'ac_source', blockId: 'ac_voltage', position: { x: 50, y: 200 }, label: '220V AC Supply', params: { Vpk: 311.13, f: 50 } },
      { id: 'resistor_load', blockId: 'resistor', position: { x: 300, y: 200 }, label: '100Ω Load Resistor', params: { R: 100 } },
      { id: 'v_sensor', blockId: 'v_sensor', position: { x: 550, y: 200 }, label: 'Voltage Sensor', params: { R_int: 1e8 } },
      { id: 'scope', blockId: 'scope', position: { x: 800, y: 150 }, label: 'Oscilloscope', params: { time_range: 0.1 } },
      { id: 'ground', blockId: 'ground', position: { x: 200, y: 400 }, label: 'Ground Reference' }
    ],
    edges: [
      { id: 'e1', source: 'ac_source', target: 'resistor_load', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'resistor_load', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'ac_source', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'resistor_load', target: 'v_sensor', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e5', source: 'v_sensor', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e6', source: 'v_sensor', target: 'scope', sourceHandle: 'v_s', targetHandle: 'in1_t' }
    ]
  }
];

describe('VLab Learning Labs Simulation Tests', () => {
  LEARNING_LABS.forEach(lab => {
    it(`simulates ${lab.id} with DAE Physics Engine`, () => {
      const engine = new VLabPhysicsEngine();
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      console.log(`\n--- Simulating Lab: ${lab.id} ---`);
      let state: any = null;
      const dt = 0.05;

      let successCount = 0;
      let errorThrown: any = null;

      for (let step = 0; step < 5; step++) {
        try {
          state = engine.simulateStep(nodes, edges, state, dt);
          successCount++;
          console.log(`Step ${step + 1} Success! Scope Values:`, JSON.stringify(state.scopeValues));
        } catch (err: any) {
          errorThrown = err;
          console.log(`Step ${step + 1} FAILED with error:`, err.message);
          break;
        }
      }

      expect(errorThrown).toBeNull();
      expect(successCount).toBe(5);

      // Verify that all scopes receive a non-zero, physically correct reading
      if (lab.id === 'air_fryer_thermal') {
        expect(state.scopeValues).toBeGreaterThan(0.001);
      } else if (lab.id === 'blender_mixer') {
        expect(Math.abs(state.scopeValues)).toBeGreaterThan(0.1);
      } else if (lab.id === 'pid_ac_motor') {
        expect(Math.abs(state.scopeValues.value)).toBeGreaterThan(0.1);
        expect(state.scopeValues.target).toBeCloseTo(1500, -1);
      } else if (lab.id === 'vfd_inverter_drive') {
        expect(Math.abs(state.scopeValues.value)).toBeGreaterThan(0.1);
        expect(state.scopeValues.target).toBe(500);
      } else if (lab.id === 'smart_washing_machine') {
        expect(Math.abs(state.scopeValues.value)).toBeGreaterThan(0.1);
        expect(state.scopeValues.amps).toBeGreaterThan(0.001);
      } else if (lab.id === 'advanced_microwave_design') {
        expect(state.scopeValues).toBeGreaterThan(25.001);
      } else if (lab.id === 'voltage_sensing_circuit') {
        expect(Math.abs(state.scopeValues)).toBeGreaterThan(1.0);
      }
    });
  });
});
