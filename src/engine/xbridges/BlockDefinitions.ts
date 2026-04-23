// src/engine/xbridges/BlockDefinitions.ts
import { XBlock, XPort } from './types';
import { VectorUtils } from './VectorUtils';
import * as math from 'mathjs';
import { MpcSolver } from './MpcSolver';

const createPort = (id: string, name: string, dir: 'input'|'output', val: any = 0, pos?: 'left'|'right'|'top'|'bottom', type: any = 'auto'): XPort => ({
  id, name, type: type || 'auto', direction: dir, value: val, position: pos || (dir === 'input' ? 'left' : 'right')
});

export const BLOCK_LIBRARY: Record<string, (id: string, params: any) => XBlock> = {
  // --- Logic Gates ---
  'AND': (id, params) => ({
    id, type: 'AND', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [ins.every(val => !!val)] })
  }),

  'OR': (id, params) => ({
    id, type: 'OR', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [ins.some(val => !!val)] })
  }),

  'NOT': (id) => ({
    id, type: 'NOT', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [!ins[0]] })
  }),

  'NAND': (id, params) => ({
    id, type: 'NAND', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [!ins.every(val => !!val)] })
  }),

  'NOR': (id, params) => ({
    id, type: 'NOR', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [!ins.some(val => !!val)] })
  }),

  'XOR': (id, params) => ({
    id, type: 'XOR', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [ins.filter(val => !!val).length % 2 !== 0] })
  }),

  // --- Bitwise Operations ---
  'BitwiseAND': (id) => ({
    id, type: 'BitwiseAND', params: {},
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [Number(ins[0]) & Number(ins[1])] })
  }),

  'BitwiseOR': (id) => ({
    id, type: 'BitwiseOR', params: {},
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [Number(ins[0]) | Number(ins[1])] })
  }),

  'BitwiseXOR': (id) => ({
    id, type: 'BitwiseXOR', params: {},
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [Number(ins[0]) ^ Number(ins[1])] })
  }),

  'BitwiseNOT': (id) => ({
    id, type: 'BitwiseNOT', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [~Number(ins[0])] })
  }),

  'ShiftLeft': (id) => ({
    id, type: 'ShiftLeft', params: {},
    inputs: [createPort('in', 'In', 'input'), createPort('sh', 'Shift', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [Number(ins[0]) << Number(ins[1])] })
  }),

  'ShiftRight': (id) => ({
    id, type: 'ShiftRight', params: {},
    inputs: [createPort('in', 'In', 'input'), createPort('sh', 'Shift', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [Number(ins[0]) >> Number(ins[1])] })
  }),
  // --- Sequential Logic ---
  'DFlipFlop': (id) => ({
    id, type: 'DFlipFlop', params: {},
    isStateful: true,
    inputs: [
      createPort('d', 'D', 'input'),
      createPort('clk', 'CLK', 'input', 0, 'top'),
      createPort('rst', 'RST', 'input', 0, 'bottom')
    ],
    outputs: [createPort('q', 'Q', 'output'), createPort('qbar', 'Q!', 'output', 1)],
    state: { q: 0, lastClk: 0 },
    execute: (ins, p, state) => {
      const d = !!ins[0];
      const clk = !!ins[1];
      const rst = !!ins[2];
      let nextQ = state.q;
      
      if (rst) {
        nextQ = 0;
      } else if (clk && !state.lastClk) { // Rising edge
        nextQ = d ? 1 : 0;
      }
      
      return { 
        outputs: [nextQ, nextQ ? 0 : 1],
        nextState: { q: nextQ, lastClk: clk ? 1 : 0 }
      };
    }
  }),

  'JKFlipFlop': (id) => ({
    id, type: 'JKFlipFlop', params: {},
    isStateful: true,
    inputs: [
      createPort('j', 'J', 'input'),
      createPort('k', 'K', 'input'),
      createPort('clk', 'CLK', 'input', 0, 'top'),
      createPort('rst', 'RST', 'input', 0, 'bottom')
    ],
    outputs: [createPort('q', 'Q', 'output'), createPort('qbar', 'Q!', 'output', 1)],
    state: { q: 0, lastClk: 0 },
    execute: (ins, p, state) => {
      const j = !!ins[0];
      const k = !!ins[1];
      const clk = !!ins[2];
      const rst = !!ins[3];
      let nextQ = state.q;
      
      if (rst) {
        nextQ = 0;
      } else if (clk && !state.lastClk) {
        if (j && k) nextQ = state.q ? 0 : 1; // Toggle
        else if (j) nextQ = 1;
        else if (k) nextQ = 0;
      }
      
      return { 
        outputs: [nextQ, nextQ ? 0 : 1],
        nextState: { q: nextQ, lastClk: clk ? 1 : 0 }
      };
    }
  }),

  'Register': (id, params) => ({
    id, type: 'Register', params: { bitWidth: params.bitWidth || 8 },
    isStateful: true,
    inputs: [
      createPort('in', 'Data', 'input'),
      createPort('clk', 'CLK', 'input', 0, 'top'),
      createPort('en', 'EN', 'input', 1, 'bottom'),
      createPort('rst', 'RST', 'input', 0, 'bottom')
    ],
    outputs: [createPort('out', 'Out', 'output')],
    state: { value: 0, lastClk: 0 },
    execute: (ins, p, state) => {
      const data = Number(ins[0]);
      const clk = !!ins[1];
      const en = !!ins[2];
      const rst = !!ins[3];
      let nextVal = state.value;
      
      if (rst) {
        nextVal = 0;
      } else if (en && clk && !state.lastClk) {
        nextVal = data & ((1 << p.bitWidth) - 1);
      }
      
      return { outputs: [nextVal], nextState: { value: nextVal, lastClk: clk ? 1 : 0 } };
    }
  }),

  'Counter': (id, params) => ({
    id, type: 'Counter', params: { maxValue: params.maxValue || 255 },
    isStateful: true,
    inputs: [
      createPort('clk', 'CLK', 'input', 0, 'top'),
      createPort('en', 'EN', 'input', 1, 'bottom'),
      createPort('rst', 'RST', 'input', 0, 'bottom')
    ],
    outputs: [createPort('out', 'Count', 'output')],
    state: { count: 0, lastClk: 0 },
    execute: (ins, p, state) => {
      const clk = !!ins[0];
      const en = !!ins[1];
      const rst = !!ins[2];
      let nextCount = state.count;
      
      if (rst) {
        nextCount = 0;
      } else if (en && clk && !state.lastClk) {
        nextCount = (state.count + 1) % (p.maxValue + 1);
      }
      
      return { outputs: [nextCount], nextState: { count: nextCount, lastClk: clk ? 1 : 0 } };
    }
  }),

  'Clock': (id, params) => ({
    id, type: 'Clock', params: { freq: params.freq || 1 },
    inputs: [],
    outputs: [createPort('clk', 'CLK', 'output')],
    execute: (ins, p, state, time) => {
      const period = 1 / p.freq;
      const clk = (time % period) < (period / 2) ? 1 : 0;
      return { outputs: [clk] };
    }
  }),

  'WaveformGen': (id, params) => ({
    id, type: 'WaveformGen', params: { 
      type: params.type || 'Sine', 
      amp: params.amp || 1, 
      freq: params.freq || 1, 
      offset: params.offset || 0 
    },
    inputs: [],
    outputs: [createPort('out', 'Out', 'output', 0)],
    execute: (ins, p, state, time) => {
      let val = 0;
      const omega = 2 * Math.PI * Number(p.freq) * time;
      const amp = Number(p.amp);
      const offset = Number(p.offset);
      
      if (p.type === 'Sine') val = amp * Math.sin(omega) + offset;
      else if (p.type === 'Square') val = amp * Math.sign(Math.sin(omega)) + offset;
      
      return { outputs: [val] };
    }
  }),

  'Constant': (id, params) => ({
    id, type: 'Constant', params: { value: params.value ?? 1 },
    inputs: [],
    outputs: [createPort('out', 'Out', 'output', params.value ?? 1)],
    execute: (_, p) => {
        // Support parsing arrays if user typed "[1, 2, 3]"
        let v = p.value;
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch(e) {}
        }
        return { outputs: [v] };
    }
  }),

  // --- Element-wise Arithmetic ---
  'VectorAdd': (id) => ({
    id, type: 'VectorAdd', params: {},
    allowDynamicInputs: true,
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => {
      let result = ins[0];
      for (let i = 1; i < ins.length; i++) {
        result = VectorUtils.applyElementWise(result, ins[i], 'add');
      }
      return { outputs: [result] };
    }
  }),

  'VectorSub': (id) => ({
    id, type: 'VectorSub', params: {},
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.applyElementWise(ins[0], ins[1], 'subtract')] })
  }),

  'VectorMul': (id) => ({
    id, type: 'VectorMul', params: {},
    allowDynamicInputs: true,
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => {
      let result = ins[0];
      for (let i = 1; i < ins.length; i++) {
        result = VectorUtils.applyElementWise(result, ins[i], 'multiply');
      }
      return { outputs: [result] };
    }
  }),

  'VectorDiv': (id) => ({
    id, type: 'VectorDiv', params: {},
    inputs: [createPort('in1', 'Num', 'input'), createPort('in2', 'Den', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.applyElementWise(ins[0], ins[1], 'divide')] })
  }),

  'VectorPow': (id) => ({
    id, type: 'VectorPow', params: {},
    inputs: [createPort('in1', 'Base', 'input'), createPort('in2', 'Exp', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.applyElementWise(ins[0], ins[1], 'pow')] })
  }),

  'UnaryNeg': (id) => ({
    id, type: 'UnaryNeg', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.applyUnaryElementWise(ins[0], 'unaryMinus')] })
  }),
  
  'Abs': (id) => ({
    id, type: 'Abs', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.applyUnaryElementWise(ins[0], 'abs')] })
  }),

  // --- Reductions ---
  'SumElements': (id) => ({
    id, type: 'SumElements', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.sum(ins[0])] })
  }),

  'Mean': (id) => ({
    id, type: 'Mean', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.mean(ins[0])] })
  }),
  
  'Max': (id) => ({
    id, type: 'Max', params: {},
    allowDynamicInputs: true,
    inputs: [createPort('in1', 'In1', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => {
        // If single input array, return max of array. If multiple inputs, return element-wise max.
        if (ins.length === 1) return { outputs: [VectorUtils.max(ins[0])] };
        let result = ins[0];
        for (let i = 1; i < ins.length; i++) {
           result = math.dot(result as any, ins[i] as any) as any; // Hack for elementwise max if needed, but math.max handles arrays differently.
           // Actually, for multiple inputs we just want math.max(a, b). math.js handles broadcasting.
        }
        return { outputs: [result] }; // Placeholder for actual implementation if needed. Let's stick to single input reduction.
    }
  }),

  // --- Linear Algebra ---
  'MatrixMul': (id) => ({
    id, type: 'MatrixMul', params: {},
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.matMul(ins[0], ins[1])] })
  }),

  'Transpose': (id) => ({
    id, type: 'Transpose', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.transpose(ins[0])] })
  }),
  
  'Inverse': (id) => ({
    id, type: 'Inverse', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    execute: (ins) => ({ outputs: [VectorUtils.inverse(ins[0])] })
  }),
  
  'Determinant': (id) => ({
      id, type: 'Determinant', params: {},
      inputs: [createPort('in', 'In', 'input')],
      outputs: [createPort('out', 'Out', 'output')],
      execute: (ins) => ({ outputs: [VectorUtils.determinant(ins[0])] })
  }),
  
  // --- Continuous ---
  'Integrator': (id, params) => ({
    id, type: 'Integrator', params: { initialCondition: params.initialCondition ?? 0 },
    isStateful: true,
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output', params.initialCondition ?? 0)],
    state: params.initialCondition ?? 0,
    execute: (ins, p, state, time) => {
        // Output is simply the current state
        return { outputs: [state] }; 
    },
    evaluateDerivatives: (ins) => {
        // The derivative of an integrator is exactly its input
        return ins[0];
    }
  }),

  // --- Sinks ---
  'Scope': (id, params) => {
    const numSignals = Number(params.numSignals) || 1;
    const bufferSize = Number(params.bufferSize) || 1000;
    
    return {
      id, type: 'Scope',
      params: { numSignals, bufferSize },
      isStateful: true,
      inputs: Array.from({ length: numSignals }, (_, i) => 
        createPort(`in${i+1}`, `In ${i+1}`, 'input')
      ),
      outputs: [],
      state: { history: [] },
      execute: (ins, p, state, time) => {
        const history = [...(state.history || [])];
        const sample: any = { t: time };
        for (let i = 0; i < numSignals; i++) {
          sample[`y${i+1}`] = Number(ins[i] || 0);
        }
        
        history.push(sample);
        if (history.length > bufferSize) {
          history.shift();
        }
        return { outputs: [], nextState: { history } };
      }
    };
  },

  // --- Ports ---
  'Inport': (id, params) => ({
    id, type: 'Inport', params: { portNumber: params.portNumber ?? 1, value: params.value ?? 0, smVarId: params.smVarId ?? '' },
    inputs: [],
    outputs: [createPort('out', 'Out', 'output', params.value ?? 0)],
    execute: (ins, p) => ({ outputs: [Number(p.value || 0)] })
  }),

  'Outport': (id, params) => ({
    id, type: 'Outport', params: { portNumber: params.portNumber ?? 1, smVarId: params.smVarId ?? '' },
    inputs: [createPort('in', 'In', 'input')],
    outputs: [],
    execute: () => ({ outputs: [] })
  }),

  // --- PWM Generators ---
  'PWM_GENERATOR': (id, params) => ({
    id, type: 'PWM_GENERATOR', 
    params: { frequency: params.frequency || 5000, carrierType: params.carrierType || 'triangle' },
    inputs: [createPort('duty', 'Duty', 'input', 0, 'left', 'control')],
    outputs: [createPort('pwm', 'PWM', 'output', 0, 'right', 'logical')],
    execute: (ins, p, state, time) => {
      const freq = Number(p.frequency);
      const period = 1 / freq;
      const tRel = time % period;
      let carrier = 0;
      
      if (p.carrierType === 'triangle') {
        carrier = tRel < period / 2 ? (2 * tRel) / (period / 2) - 1 : 1 - (2 * (tRel - period / 2)) / (period / 2);
        // Normalize to 0-1
        carrier = (carrier + 1) / 2;
      } else { // sawtooth
        carrier = tRel / period;
      }
      
      const duty = Math.max(0, Math.min(1, Number(ins[0])));
      return { outputs: [duty > carrier ? 1 : 0] };
    }
  }),

  'THREE_PHASE_PWM': (id, params) => ({
    id, type: 'THREE_PHASE_PWM',
    params: { frequency: params.frequency || 5000, method: params.method || 'SPWM' },
    inputs: [
      createPort('va_ref', 'Va*', 'input', 0, 'left', 'control'),
      createPort('vb_ref', 'Vb*', 'input', 0, 'left', 'control'),
      createPort('vc_ref', 'Vc*', 'input', 0, 'left', 'control')
    ],
    outputs: [
      createPort('ga', 'Ga', 'output', 0, 'right', 'logical'),
      createPort('gb', 'Gb', 'output', 0, 'right', 'logical'),
      createPort('gc', 'Gc', 'output', 0, 'right', 'logical')
    ],
    execute: (ins, p, state, time) => {
      const freq = Number(p.frequency);
      const period = 1 / freq;
      const tRel = (time % period) / period; // Sawtooth carrier 0-1
      
      const refs = ins.map(v => Math.max(0, Math.min(1, (Number(v) + 1) / 2))); // Map -1..1 to 0..1
      
      return { outputs: refs.map(ref => (ref > tRel ? 1 : 0)) };
    }
  }),

  'SIX_STEP_COMMUTATION': (id) => ({
    id, type: 'SIX_STEP_COMMUTATION', params: {},
    inputs: [
      createPort('h1', 'H1', 'input', 0, 'left', 'logical'),
      createPort('h2', 'H2', 'input', 0, 'left', 'logical'),
      createPort('h3', 'H3', 'input', 0, 'left', 'logical')
    ],
    outputs: [
      createPort('ga', 'Ga', 'output', 0, 'right', 'logical'),
      createPort('gb', 'Gb', 'output', 0, 'right', 'logical'),
      createPort('gc', 'Gc', 'output', 0, 'right', 'logical')
    ],
    execute: (ins) => {
      const h = (Number(ins[0]) << 2) | (Number(ins[1]) << 1) | Number(ins[2]);
      let gates = [0, 0, 0]; // A, B, C (Simplified: 1=High, -1=Low, 0=Off)
      switch(h) {
        case 5: gates = [1, -1, 0]; break; // Step 1
        case 1: gates = [1, 0, -1]; break; // Step 2
        case 3: gates = [0, 1, -1]; break; // Step 3
        case 2: gates = [-1, 1, 0]; break; // Step 4
        case 6: gates = [-1, 0, 1]; break; // Step 5
        case 4: gates = [0, -1, 1]; break; // Step 6
      }
      return { outputs: gates };
    }
  }),

  // --- DC-AC Inverters ---
  'THREE_PHASE_INVERTER': (id, params) => ({
    id, type: 'THREE_PHASE_INVERTER',
    params: { Ron: params.Ron || 0.01, Vf: params.Vf || 0.7 },
    inputs: [
      createPort('vdc_p', 'Vdc+', 'input', 24, 'left', 'power'),
      createPort('vdc_n', 'Vdc-', 'input', 0, 'left', 'power'),
      createPort('ga', 'Gate_A', 'input', 0, 'bottom', 'logical'),
      createPort('gb', 'Gate_B', 'input', 0, 'bottom', 'logical'),
      createPort('gc', 'Gate_C', 'input', 0, 'bottom', 'logical')
    ],
    outputs: [
      createPort('va', 'Va', 'output', 0, 'right', 'power'),
      createPort('vb', 'Vb', 'output', 0, 'right', 'power'),
      createPort('vc', 'Vc', 'output', 0, 'right', 'power')
    ],
    execute: (ins) => {
      const vdc = Number(ins[0]) - Number(ins[1]);
      const gates = [Number(ins[2]), Number(ins[3]), Number(ins[4])];
      
      // Phase voltages relative to negative DC bus
      const vPh = gates.map(g => (g > 0.5 ? vdc : 0));
      
      // Optional: Neutral point voltage if balanced load (vPh_avg)
      const vNeut = (vPh[0] + vPh[1] + vPh[2]) / 3;
      
      return { outputs: vPh.map(v => v - vNeut) }; // Line-to-neutral voltages
    }
  }),

  'SINGLE_PHASE_H_BRIDGE': (id, params) => ({
    id, type: 'SINGLE_PHASE_H_BRIDGE',
    params: { Ron: params.Ron || 0.01 },
    inputs: [
      createPort('vdc_p', 'Vdc+', 'input', 12, 'left', 'power'),
      createPort('vdc_n', 'Vdc-', 'input', 0, 'left', 'power'),
      createPort('g1', 'Gate_1', 'input', 0, 'bottom', 'logical'),
      createPort('g2', 'Gate_2', 'input', 0, 'bottom', 'logical')
    ],
    outputs: [createPort('vout', 'Vout', 'output', 0, 'right', 'power')],
    execute: (ins) => {
      const vdc = Number(ins[0]) - Number(ins[1]);
      const s1 = Number(ins[2]) > 0.5;
      const s2 = Number(ins[3]) > 0.5;
      
      // H-bridge output: (S1 - S2) * Vdc
      const vout = (s1 ? vdc : 0) - (s2 ? vdc : 0);
      return { outputs: [vout] };
    }
  }),

  // --- Control & Modulation ---
  'VOLTAGE_REFERENCE_GENERATOR': (id, params) => ({
    id, type: 'VOLTAGE_REFERENCE_GENERATOR',
    params: { frequency: params.frequency || 50, amplitude: params.amplitude || 1 },
    inputs: [createPort('f', 'Freq', 'input', params.frequency || 50, 'left', 'control')],
    outputs: [
      createPort('va', 'Va*', 'output', 0, 'right', 'control'),
      createPort('vb', 'Vb*', 'output', 0, 'right', 'control'),
      createPort('vc', 'Vc*', 'output', 0, 'right', 'control')
    ],
    execute: (ins, p, state, time) => {
      const f = Number(ins[0]);
      const amp = Number(p.amplitude);
      const w = 2 * Math.PI * f;
      
      const va = amp * Math.sin(w * time);
      const vb = amp * Math.sin(w * time - (2 * Math.PI) / 3);
      const vc = amp * Math.sin(w * time - (4 * Math.PI) / 3);
      
      return { outputs: [va, vb, vc] };
    }
  }),

  'FIELD_ORIENTED_CONTROL': (id, params) => ({
    id, type: 'FIELD_ORIENTED_CONTROL',
    params: { Kp: params.Kp || 1, Ki: params.Ki || 10 },
    isStateful: true,
    inputs: [
      createPort('id_ref', 'Id*', 'input', 0, 'left', 'control'),
      createPort('iq_ref', 'Iq*', 'input', 0, 'left', 'control'),
      createPort('ia', 'Ia', 'input', 0, 'top', 'measurement'),
      createPort('ib', 'Ib', 'input', 0, 'top', 'measurement'),
      createPort('theta', 'θ', 'input', 0, 'top', 'measurement')
    ],
    outputs: [
      createPort('vd', 'Vd*', 'output', 0, 'right', 'control'),
      createPort('vq', 'Vq*', 'output', 0, 'right', 'control'),
      createPort('va_ref', 'Va*', 'output', 0, 'right', 'control'),
      createPort('vb_ref', 'Vb*', 'output', 0, 'right', 'control'),
      createPort('vc_ref', 'Vc*', 'output', 0, 'right', 'control')
    ],
    state: { integralD: 0, integralQ: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      const id_ref = Number(ins[0]);
      const iq_ref = Number(ins[1]);
      const ia = Number(ins[2]);
      const ib = Number(ins[3]);
      const theta = Number(ins[4]);
      
      // 1. Clarke Transform (abc -> alpha-beta)
      const ic = -ia - ib;
      const iAlpha = ia;
      const iBeta = (ia + 2 * ib) / Math.sqrt(3);
      
      // 2. Park Transform (alpha-beta -> dq)
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const id = iAlpha * cosT + iBeta * sinT;
      const iq = -iAlpha * sinT + iBeta * cosT;
      
      // 3. PI Control
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const errD = id_ref - id;
      const errQ = iq_ref - iq;
      
      const nextIntD = state.integralD + errD * dt;
      const nextIntQ = state.integralQ + errQ * dt;
      
      const vd = p.Kp * errD + p.Ki * nextIntD;
      const vq = p.Kp * errQ + p.Ki * nextIntQ;
      
      // 4. Inverse Park (dq -> alpha-beta)
      const vAlpha = vd * cosT - vq * sinT;
      const vBeta = vd * sinT + vq * cosT;
      
      // 5. Inverse Clarke (alpha-beta -> abc)
      const va = vAlpha;
      const vb = (-0.5 * vAlpha) + (Math.sqrt(3) / 2) * vBeta;
      const vc = (-0.5 * vAlpha) - (Math.sqrt(3) / 2) * vBeta;
      
      return { 
        outputs: [vd, vq, va, vb, vc],
        nextState: { integralD: nextIntD, integralQ: nextIntQ, lastTime: time }
      };
    }
  }),

  // --- Reference Frame Transformations ---
  'CLARKE_TRANSFORM': (id, params) => ({
    id, type: 'CLARKE_TRANSFORM', 
    params: { mode: params.mode || 'amplitude_invariant' },
    inputs: [
      createPort('ia', 'Ia', 'input', 0, 'left', 'measurement'),
      createPort('ib', 'Ib', 'input', 0, 'left', 'measurement'),
      createPort('ic', 'Ic', 'input', 0, 'left', 'measurement')
    ],
    outputs: [
      createPort('alpha', 'Iα', 'output', 0, 'right', 'transform'),
      createPort('beta', 'Iβ', 'output', 0, 'right', 'transform')
    ],
    execute: (ins, p) => {
      const ia = Number(ins[0]);
      const ib = Number(ins[1]);
      const ic = Number(ins[2]);
      
      let iAlpha = 0;
      let iBeta = 0;
      
      if (p.mode === 'amplitude_invariant') {
        // Standard Clarke (Amplitude Invariant) assuming balanced system (Ia+Ib+Ic=0)
        iAlpha = ia;
        iBeta = (ia + 2 * ib) / Math.sqrt(3);
      } else {
        // Power Invariant Clarke
        const k = Math.sqrt(2/3);
        iAlpha = k * (ia - 0.5 * ib - 0.5 * ic);
        iBeta = k * (Math.sqrt(3)/2 * ib - Math.sqrt(3)/2 * ic);
      }
      
      return { outputs: [iAlpha, iBeta] };
    }
  }),

  'PARK_TRANSFORM': (id) => ({
    id, type: 'PARK_TRANSFORM', params: {},
    inputs: [
      createPort('alpha', 'Iα', 'input', 0, 'left', 'transform'),
      createPort('beta', 'Iβ', 'input', 0, 'left', 'transform'),
      createPort('theta', 'θ', 'input', 0, 'top', 'measurement')
    ],
    outputs: [
      createPort('id', 'Id', 'output', 0, 'right', 'transform'),
      createPort('iq', 'Iq', 'output', 0, 'right', 'transform')
    ],
    execute: (ins) => {
      const iAlpha = Number(ins[0]);
      const iBeta = Number(ins[1]);
      const theta = Number(ins[2]);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const id = iAlpha * cosT + iBeta * sinT;
      const iq = -iAlpha * sinT + iBeta * cosT;
      return { outputs: [id, iq] };
    }
  }),

  'INVERSE_PARK': (id) => ({
    id, type: 'INVERSE_PARK', params: {},
    inputs: [
      createPort('vd', 'Vd', 'input', 0, 'left', 'transform'),
      createPort('vq', 'Vq', 'input', 0, 'left', 'transform'),
      createPort('theta', 'θ', 'input', 0, 'top', 'measurement')
    ],
    outputs: [
      createPort('alpha', 'Vα', 'output', 0, 'right', 'transform'),
      createPort('beta', 'Vβ', 'output', 0, 'right', 'transform')
    ],
    execute: (ins) => {
      const vd = Number(ins[0]);
      const vq = Number(ins[1]);
      const theta = Number(ins[2]);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const vAlpha = vd * cosT - vq * sinT;
      const vBeta = vd * sinT + vq * cosT;
      return { outputs: [vAlpha, vBeta] };
    }
  }),

  'INVERSE_CLARKE': (id) => ({
    id, type: 'INVERSE_CLARKE', params: {},
    inputs: [
      createPort('alpha', 'Vα', 'input', 0, 'left', 'transform'),
      createPort('beta', 'Vβ', 'input', 0, 'left', 'transform')
    ],
    outputs: [
      createPort('va', 'Va', 'output', 0, 'right', 'power'),
      createPort('vb', 'Vb', 'output', 0, 'right', 'power'),
      createPort('vc', 'Vc', 'output', 0, 'right', 'power')
    ],
    execute: (ins) => {
      const vAlpha = Number(ins[0]);
      const vBeta = Number(ins[1]);
      const va = vAlpha;
      const vb = (-0.5 * vAlpha) + (Math.sqrt(3) / 2) * vBeta;
      const vc = (-0.5 * vAlpha) - (Math.sqrt(3) / 2) * vBeta;
      return { outputs: [va, vb, vc] };
    }
  }),

  // --- FOC Control Blocks ---
  'CURRENT_CONTROLLER_DQ': (id, params) => ({
    id, type: 'CURRENT_CONTROLLER_DQ',
    params: { 
      Kp_d: params.Kp_d || 1, Ki_d: params.Ki_d || 10,
      Kp_q: params.Kp_q || 1, Ki_q: params.Ki_q || 10 
    },
    isStateful: true,
    inputs: [
      createPort('id_ref', 'Id*', 'input', 0, 'left', 'control'),
      createPort('iq_ref', 'Iq*', 'input', 0, 'left', 'control'),
      createPort('id', 'Id', 'input', 0, 'top', 'measurement'),
      createPort('iq', 'Iq', 'input', 0, 'top', 'measurement')
    ],
    outputs: [
      createPort('vd', 'Vd*', 'output', 0, 'right', 'control'),
      createPort('vq', 'Vq*', 'output', 0, 'right', 'control')
    ],
    state: { intD: 0, intQ: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const errD = Number(ins[0]) - Number(ins[2]);
      const errQ = Number(ins[1]) - Number(ins[3]);
      
      const nextIntD = state.intD + errD * dt;
      const nextIntQ = state.intQ + errQ * dt;
      
      const vd = p.Kp_d * errD + p.Ki_d * nextIntD;
      const vq = p.Kp_q * errQ + p.Ki_q * nextIntQ;
      
      return { 
        outputs: [vd, vq],
        nextState: { intD: nextIntD, intQ: nextIntQ, lastTime: time }
      };
    }
  }),

  'SPEED_CONTROLLER': (id, params) => ({
    id, type: 'SPEED_CONTROLLER',
    params: { Kp: params.Kp || 0.5, Ki: params.Ki || 5, maxIq: params.maxIq || 10 },
    isStateful: true,
    inputs: [
      createPort('speed_ref', 'ω*', 'input', 0, 'left', 'control'),
      createPort('speed_actual', 'ω', 'input', 0, 'top', 'measurement')
    ],
    outputs: [createPort('iq_ref', 'Iq*', 'output', 0, 'right', 'control')],
    state: { integral: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const err = Number(ins[0]) - Number(ins[1]);
      const nextInt = state.integral + err * dt;
      
      let iq = p.Kp * err + p.Ki * nextInt;
      // Saturation
      iq = Math.max(-p.maxIq, Math.min(p.maxIq, iq));
      
      return { 
        outputs: [iq],
        nextState: { integral: nextInt, lastTime: time }
      };
    }
  }),

  'FLUX_REFERENCE': (id, params) => ({
    id, type: 'FLUX_REFERENCE',
    params: { mode: params.mode || 'constant', value: params.value || 0 },
    inputs: [],
    outputs: [createPort('id_ref', 'Id*', 'output', params.value || 0, 'right', 'control')],
    execute: (_, p) => {
      // In a real implementation, 'field_weakening' would adjust 'value' based on speed.
      return { outputs: [Number(p.value)] };
    }
  }),

  'ROTOR_POSITION_ESTIMATOR': (id, params) => ({
    id, type: 'ROTOR_POSITION_ESTIMATOR',
    params: { method: params.method || 'Hall_sensor' },
    inputs: [
      createPort('ia', 'Ia', 'input', 0, 'left', 'measurement'),
      createPort('ib', 'Ib', 'input', 0, 'left', 'measurement'),
      createPort('ic', 'Ic', 'input', 0, 'left', 'measurement'),
      createPort('va', 'Va', 'input', 0, 'top', 'measurement'),
      createPort('vb', 'Vb', 'input', 0, 'top', 'measurement'),
      createPort('vc', 'Vc', 'input', 0, 'top', 'measurement')
    ],
    outputs: [
      createPort('theta', 'θ', 'output', 0, 'right', 'measurement'),
      createPort('speed', 'ω', 'output', 0, 'right', 'measurement')
    ],
    execute: () => {
      // Placeholder for actual estimator logic
      return { outputs: [0, 0] };
    }
  }),

  // --- SVPWM Core ---
  'SVPWM_CORE': (id, params) => ({
    id, type: 'SVPWM_CORE',
    params: { Ts: params.Ts || 0.0001, Vdc: params.Vdc || 400 },
    inputs: [
      createPort('v_alpha', 'Vα', 'input', 0, 'left', 'transform'),
      createPort('v_beta', 'Vβ', 'input', 0, 'left', 'transform')
    ],
    outputs: [
      createPort('sector', 'Sec', 'output', 1, 'top', 'measurement'),
      createPort('t1', 'T1', 'output', 0, 'top', 'measurement'),
      createPort('t2', 'T2', 'output', 0, 'top', 'measurement'),
      createPort('t0', 'T0', 'output', 0, 'top', 'measurement')
    ],
    execute: (ins, p) => {
      const vAlpha = Number(ins[0]);
      const vBeta = Number(ins[1]);
      const Vdc = Number(p.Vdc);
      const Ts = Number(p.Ts);

      const theta = Math.atan2(vBeta, vAlpha);
      const thetaDeg = (theta * 180 / Math.PI + 360) % 360;
      const sector = Math.floor(thetaDeg / 60) + 1;
      
      const Vref = Math.sqrt(vAlpha * vAlpha + vBeta * vBeta);
      const thetaS = (thetaDeg % 60) * Math.PI / 180;

      const T1 = Ts * (Math.sqrt(3) * Vref / Vdc) * Math.sin(Math.PI / 3 - thetaS);
      const T2 = Ts * (Math.sqrt(3) * Vref / Vdc) * Math.sin(thetaS);
      const T0 = Ts - T1 - T2;

      return { outputs: [sector, Math.max(0, T1), Math.max(0, T2), Math.max(0, T0)] };
    }
  }),

  'SECTOR_SELECTOR': (id) => ({
    id, type: 'SECTOR_SELECTOR', params: {},
    inputs: [createPort('theta', 'θ', 'input', 0, 'left', 'measurement')],
    outputs: [createPort('sector', 'Sec', 'output', 1, 'right', 'discrete')],
    execute: (ins) => {
      const thetaDeg = (Number(ins[0]) * 180 / Math.PI + 360) % 360;
      const sector = Math.floor(thetaDeg / 60) + 1;
      return { outputs: [sector] };
    }
  }),

  'SWITCHING_TIME_CALCULATOR': (id, params) => ({
    id, type: 'SWITCHING_TIME_CALCULATOR',
    params: { Vdc: params.Vdc || 400, Ts: params.Ts || 0.0001 },
    inputs: [
      createPort('vref', 'Vref', 'input', 0, 'left', 'control'),
      createPort('theta_s', 'θs', 'input', 0, 'left', 'measurement'),
      createPort('vdc', 'Vdc', 'input', 400, 'bottom', 'control'),
      createPort('ts', 'Ts', 'input', 0.0001, 'bottom', 'control')
    ],
    outputs: [
      createPort('t1', 'T1', 'output', 0, 'right', 'measurement'),
      createPort('t2', 'T2', 'output', 0, 'right', 'measurement'),
      createPort('t0', 'T0', 'output', 0, 'right', 'measurement')
    ],
    execute: (ins) => {
      const Vref = Number(ins[0]);
      const thetaS = Number(ins[1]);
      const Vdc = Number(ins[2]);
      const Ts = Number(ins[3]);

      const T1 = Ts * (Math.sqrt(3) * Vref / Vdc) * Math.sin(Math.PI / 3 - thetaS);
      const T2 = Ts * (Math.sqrt(3) * Vref / Vdc) * Math.sin(thetaS);
      const T0 = Ts - T1 - T2;

      return { outputs: [Math.max(0, T1), Math.max(0, T2), Math.max(0, T0)] };
    }
  }),

  'SVPWM_GATE_GENERATOR': (id, params) => ({
    id, type: 'SVPWM_GATE_GENERATOR',
    params: { Ts: params.Ts || 0.0001 },
    isStateful: true,
    inputs: [
      createPort('sector', 'Sec', 'input', 1, 'left', 'discrete'),
      createPort('t1', 'T1', 'input', 0, 'left', 'measurement'),
      createPort('t2', 'T2', 'input', 0, 'left', 'measurement'),
      createPort('t0', 'T0', 'input', 0, 'left', 'measurement')
    ],
    outputs: [
      createPort('ga', 'Ga', 'output', 0, 'right', 'logical'),
      createPort('gb', 'Gb', 'output', 0, 'right', 'logical'),
      createPort('gc', 'Gc', 'output', 0, 'right', 'logical')
    ],
    state: { lastTime: 0 },
    execute: (ins, p, state, time) => {
      const Ts = Number(p.Ts);
      const sector = Number(ins[0]);
      const T1 = Number(ins[1]);
      const T2 = Number(ins[2]);
      const T0 = Number(ins[3]);
      
      const tRel = time % Ts;
      const tHalf = Ts / 2;
      
      // Symmetrical PWM: 0 -> Ts/2 -> Ts
      // For first half: 0 -> Ts/2
      const t = tRel > tHalf ? Ts - tRel : tRel;
      
      // Pulse widths for each phase (normalized to 0..Ts/2)
      let da = 0, db = 0, dc = 0;
      
      // Timing calculation based on sector (Standard Symmetrical pattern)
      const t0_4 = T0 / 4;
      const t1_2 = T1 / 2;
      const t2_2 = T2 / 2;

      switch(sector) {
        case 1: da = t0_4; db = t0_4 + t1_2; dc = t0_4 + t1_2 + t2_2; break;
        case 2: da = t0_4 + t2_2; db = t0_4; dc = t0_4 + t1_2 + t2_2; break;
        case 3: da = t0_4 + t1_2 + t2_2; db = t0_4; dc = t0_4 + t1_2; break;
        case 4: da = t0_4 + t1_2 + t2_2; db = t0_4 + t2_2; dc = t0_4; break;
        case 5: da = t0_4 + t1_2; db = t0_4 + t1_2 + t2_2; dc = t0_4; break;
        case 6: da = t0_4; db = t0_4 + t1_2 + t2_2; dc = t0_4 + t2_2; break;
      }

      // Gate = 1 if t > threshold (comparing with triangle carrier)
      // Actually, standard SVPWM centers the pulses.
      // High pulse is between threshold and tHalf.
      return { 
        outputs: [
          t > da ? 1 : 0,
          t > db ? 1 : 0,
          t > dc ? 1 : 0
        ],
        nextState: { lastTime: time }
      };
    }
  }),

  'ZERO_SEQUENCE_INJECTION': (id) => ({
    id, type: 'ZERO_SEQUENCE_INJECTION', params: {},
    inputs: [
      createPort('va', 'Va*', 'input', 0, 'left', 'control'),
      createPort('vb', 'Vb*', 'input', 0, 'left', 'control'),
      createPort('vc', 'Vc*', 'input', 0, 'left', 'control')
    ],
    outputs: [
      createPort('va_mod', 'Va_mod', 'output', 0, 'right', 'control'),
      createPort('vb_mod', 'Vb_mod', 'output', 0, 'right', 'control'),
      createPort('vc_mod', 'Vc_mod', 'output', 0, 'right', 'control')
    ],
    execute: (ins) => {
      const v = ins.map(Number);
      const vOffset = (Math.max(...v) + Math.min(...v)) / 2;
      return { outputs: v.map(val => val - vOffset) };
    }
  }),

  'SVPWM_MODULATOR': (id, params) => ({
    id, type: 'SVPWM_MODULATOR',
    params: { Ts: params.Ts || 0.0001, Vdc: params.Vdc || 400 },
    isStateful: true,
    inputs: [
      createPort('v_alpha', 'Vα', 'input', 0, 'left', 'transform'),
      createPort('v_beta', 'Vβ', 'input', 0, 'left', 'transform')
    ],
    outputs: [
      createPort('ga', 'Ga', 'output', 0, 'right', 'logical'),
      createPort('gb', 'Gb', 'output', 0, 'right', 'logical'),
      createPort('gc', 'Gc', 'output', 0, 'right', 'logical')
    ],
    state: { lastTime: 0 },
    execute: (ins, p, state, time) => {
      // Internal pipeline: CORE -> GATE_GEN
      const core = BLOCK_LIBRARY['SVPWM_CORE'](id, p);
      const coreResult = core.execute(ins, p, {}, time);
      
      const gateGen = BLOCK_LIBRARY['SVPWM_GATE_GENERATOR'](id, p);
      const gateResult = gateGen.execute(coreResult.outputs, p, state, time);
      
      return gateResult;
    }
  }),

  // --- Memory & Delay ---
  'DELAY': (id, params) => ({
    id, type: 'DELAY',
    params: { delay_length: params.delay_length || 1, initial_condition: params.initial_condition || 0 },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    state: { buffer: [], index: 0 },
    execute: (ins, p, state) => {
      const N = Number(p.delay_length);
      const u = ins[0];
      let buffer = state.buffer.length === 0 
        ? new Array(N).fill(p.initial_condition) 
        : [...state.buffer];
      
      const y = buffer[state.index];
      buffer[state.index] = u;
      const nextIndex = (state.index + 1) % N;
      
      return { outputs: [y], nextState: { buffer, index: nextIndex } };
    }
  }),

  // --- Integrators ---
  'INTEGRATOR_CONTINUOUS': (id, params) => ({
    id, type: 'INTEGRATOR_CONTINUOUS',
    params: { initial_condition: params.initial_condition || 0 },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    state: { y: params.initial_condition || 0 },
    execute: (ins, p, state) => ({ outputs: [state.y] }),
    evaluateDerivatives: (ins) => [Number(ins[0])]
  }),

  'INTEGRATOR_DISCRETE': (id, params) => ({
    id, type: 'INTEGRATOR_DISCRETE',
    params: { initial_condition: params.initial_condition || 0, sample_time: params.sample_time || 0.001, method: params.method || 'forward_euler' },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    state: { y: params.initial_condition || 0, u_prev: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const u = Number(ins[0]);
      let nextY = state.y;
      
      if (p.method === 'forward_euler') {
        nextY = state.y + dt * state.u_prev;
      } else if (p.method === 'backward_euler') {
        nextY = state.y + dt * u;
      } else if (p.method === 'tustin') {
        nextY = state.y + (dt / 2) * (u + state.u_prev);
      }
      
      return { outputs: [nextY], nextState: { y: nextY, u_prev: u, lastTime: time } };
    }
  }),

  // --- Signal Routing ---
  'MUX': (id, params) => ({
    id, type: 'MUX',
    params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, `u${i+1}`, 'input')),
    outputs: [createPort('y', 'y', 'output', 0, 'right', 'vector')],
    execute: (ins) => ({ outputs: [ins as any] })
  }),

  'DEMUX': (id, params) => ({
    id, type: 'DEMUX',
    params: { numOutputs: params.numOutputs || 2 },
    inputs: [createPort('u', 'u', 'input', 0, 'left', 'vector')],
    outputs: Array.from({ length: params.numOutputs || 2 }, (_, i) => createPort(`out${i+1}`, `y${i+1}`, 'output')),
    execute: (ins) => ({ outputs: Array.isArray(ins[0]) ? ins[0] : [ins[0]] })
  }),

  // --- Math Operations ---
  'GAIN': (id, params) => ({
    id, type: 'GAIN',
    params: { gain: params.gain || 1 },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => ({ outputs: [Number(ins[0]) * Number(p.gain)] })
  }),

  'PRODUCT': (id, params) => ({
    id, type: 'PRODUCT',
    params: { numInputs: params.numInputs || 2, operation: params.operation || 'multiply' },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, `u${i+1}`, 'input')),
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      if (p.operation === 'divide') {
        return { outputs: [ins.reduce((acc: number, val) => acc / (Number(val) || 1), Number(ins[0]) || 1)] };
      }
      return { outputs: [ins.reduce((acc: number, val) => acc * Number(val), 1)] };
    }
   }),

  // --- Logic & Control Flow ---
  'SWITCH': (id, params) => ({
    id, type: 'SWITCH',
    params: { threshold: params.threshold || 0, criteria: params.criteria || '>' },
    inputs: [
      createPort('u1', 'u1', 'input'),
      createPort('u2', 'u2', 'input'),
      createPort('ctrl', 'ctrl', 'input', 0, 'bottom', 'control')
    ],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u1 = ins[0];
      const u2 = ins[1];
      const ctrl = Number(ins[2]);
      const th = Number(p.threshold);
      let pass = false;
      switch(p.criteria) {
        case '>': pass = ctrl > th; break;
        case '<': pass = ctrl < th; break;
        case '>=': pass = ctrl >= th; break;
        case '<=': pass = ctrl <= th; break;
      }
      return { outputs: [pass ? u1 : u2] };
    }
  }),

  'IF_ELSE': (id) => ({
    id, type: 'IF_ELSE', params: {},
    inputs: [
      createPort('cond', 'cond', 'input', 0, 'bottom', 'logical'),
      createPort('u_true', 'u_true', 'input'),
      createPort('u_false', 'u_false', 'input')
    ],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins) => ({ outputs: [ins[0] ? ins[1] : ins[2]] })
  }),

  'SWITCH_CASE': (id, params) => {
    const numCases = Number(params.numCases) || 2;
    return {
      id, type: 'SWITCH_CASE',
      params: { numCases },
      inputs: [
        createPort('sel', 'selector', 'input', 0, 'bottom', 'discrete'),
        ...Array.from({ length: numCases }, (_, i) => createPort(`in${i+1}`, `case ${i+1}`, 'input'))
      ],
      outputs: [createPort('y', 'y', 'output')],
      execute: (ins) => {
        const sel = Math.floor(Number(ins[0]));
        // selector is 1-indexed for the cases (input 1 is case 1, input 2 is case 2, etc.)
        // ins[0] is selector. ins[1] is case 1, ins[2] is case 2...
        const val = ins[sel] !== undefined ? ins[sel] : ins[1];
        return { outputs: [val] };
      }
    };
  },

  // --- Signal Management ---
  'DATA_TYPE_CONVERSION': (id, params) => {
    const output_type = params.output_type || 'float64';
    const rounding = params.rounding || 'floor';
    const overflow = params.overflow || 'saturate';
    const wl = Number(params.wordLength) || 16;
    const fl = Number(params.fractionLength) || 8;

    return {
      id, type: 'DATA_TYPE_CONVERSION',
      params: { output_type, rounding, overflow, wordLength: wl, fractionLength: fl },
      inputs: [createPort('u', 'u', 'input')],
      outputs: [createPort('y', 'y', 'output')],
      execute: (ins, p) => {
        let u = Number(ins[0]);
        let y = u;

        // 1. Rounding
        if (p.rounding === 'floor') y = Math.floor(u);
        else if (p.rounding === 'ceil') y = Math.ceil(u);
        else if (p.rounding === 'round' || p.rounding === 'nearest') y = Math.round(u);
        else if (p.rounding === 'convergent') {
            const d = Math.floor(u);
            const f = u - d;
            if (f < 0.5) y = d;
            else if (f > 0.5) y = d + 1;
            else y = (d % 2 === 0) ? d : d + 1;
        }

        // 2. Type Simulation & Overflow
        const limits: Record<string, [number, number]> = {
          'int8': [-128, 127],
          'uint8': [0, 255],
          'int16': [-32768, 32767],
          'uint16': [0, 65535],
          'int32': [-2147483648, 2147483647],
          'uint32': [0, 4294967295],
          'boolean': [0, 1]
        };

        if (p.output_type === 'fixed_point') {
            const scale = Math.pow(2, p.fractionLength);
            let raw = Math.round(u * scale);
            const maxRaw = Math.pow(2, p.wordLength - 1) - 1;
            const minRaw = -Math.pow(2, p.wordLength - 1);
            
            if (p.overflow === 'saturate') raw = Math.max(minRaw, Math.min(maxRaw, raw));
            else if (p.overflow === 'wrap') {
                const range = maxRaw - minRaw + 1;
                raw = ((((raw - minRaw) % range) + range) % range) + minRaw;
            }
            y = raw / scale;
        } else if (limits[p.output_type]) {
            const [min, max] = limits[p.output_type];
            if (p.overflow === 'saturate') y = Math.max(min, Math.min(max, y));
            else if (p.overflow === 'wrap') {
                const range = max - min + 1;
                y = ((((Math.floor(y) - min) % range) + range) % range) + min;
            }
            if (p.output_type === 'boolean') y = y > 0.5 ? 1 : 0;
        }

        return { outputs: [y] };
      }
    };
  },

  'TERMINATOR': (id) => ({
    id, type: 'TERMINATOR', params: {},
    inputs: [createPort('u', 'u', 'input')],
    outputs: [],
    execute: () => ({ outputs: [] })
  }),

  // --- Trigonometric Functions ---
  'SIN': (id, params) => ({
    id, type: 'SIN', params: { angle_unit: params.angle_unit || 'radians' },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u = p.angle_unit === 'degrees' ? (Number(ins[0]) * Math.PI) / 180 : Number(ins[0]);
      return { outputs: [Math.sin(u)] };
    }
  }),

  'COS': (id, params) => ({
    id, type: 'COS', params: { angle_unit: params.angle_unit || 'radians' },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u = p.angle_unit === 'degrees' ? (Number(ins[0]) * Math.PI) / 180 : Number(ins[0]);
      return { outputs: [Math.cos(u)] };
    }
  }),

  'TAN': (id, params) => ({
    id, type: 'TAN', params: { angle_unit: params.angle_unit || 'radians' },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u = p.angle_unit === 'degrees' ? (Number(ins[0]) * Math.PI) / 180 : Number(ins[0]);
      return { outputs: [Math.tan(u)] };
    }
  }),

  'COT': (id, params) => ({
    id, type: 'COT', params: { angle_unit: params.angle_unit || 'radians' },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u = p.angle_unit === 'degrees' ? (Number(ins[0]) * Math.PI) / 180 : Number(ins[0]);
      return { outputs: [1 / Math.tan(u)] };
    }
  }),

  'SEC': (id, params) => ({
    id, type: 'SEC', params: { angle_unit: params.angle_unit || 'radians' },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u = p.angle_unit === 'degrees' ? (Number(ins[0]) * Math.PI) / 180 : Number(ins[0]);
      return { outputs: [1 / Math.cos(u)] };
    }
  }),

  'COSEC': (id, params) => ({
    id, type: 'COSEC', params: { angle_unit: params.angle_unit || 'radians' },
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      const u = p.angle_unit === 'degrees' ? (Number(ins[0]) * Math.PI) / 180 : Number(ins[0]);
      return { outputs: [1 / Math.sin(u)] };
    }
  }),

  'PID_CONTROLLER': (id, params) => ({
    id, type: 'PID_CONTROLLER',
    params: {
      mode: params.mode || 'PID',
      Kp: params.Kp !== undefined ? params.Kp : 1,
      Ki: params.Ki !== undefined ? params.Ki : 1,
      Kd: params.Kd !== undefined ? params.Kd : 0.01,
      N: params.N !== undefined ? params.N : 100,
      beta: params.beta !== undefined ? params.beta : 1,
      gamma: params.gamma !== undefined ? params.gamma : 0,
      min: params.min !== undefined ? params.min : -100,
      max: params.max !== undefined ? params.max : 100,
      method: params.method || 'forward_euler'
    },
    isStateful: true,
    inputs: [
      createPort('r', 'Ref', 'input'),
      createPort('y', 'Feedback', 'input'),
      createPort('enable', 'Enable', 'input', 1, 'bottom', 'control'),
      createPort('reset', 'Reset', 'input', 0, 'bottom', 'control')
    ],
    outputs: [
      createPort('u', 'Control', 'output', 0, 'right', 'control'),
      createPort('error', 'Error', 'output', 0, 'top', 'measurement'),
      createPort('p_term', 'P', 'output', 0, 'top', 'measurement'),
      createPort('i_term', 'I', 'output', 0, 'top', 'measurement'),
      createPort('d_term', 'D', 'output', 0, 'top', 'measurement')
    ],
    state: { i_state: 0, d_state: 0, last_ed: 0, last_time: 0 },
    execute: (ins, p, state, time) => {
      const r = Number(ins[0]);
      const y = Number(ins[1]);
      const enable = Number(ins[2]);
      const reset = Number(ins[3]);
      
      if (reset > 0.5) {
        return { 
          outputs: [0, 0, 0, 0, 0], 
          nextState: { i_state: 0, d_state: 0, last_ed: 0, last_time: time } 
        };
      }
      
      if (enable < 0.5) {
        return { outputs: [0, 0, 0, 0, 0], nextState: { ...state, last_time: time } };
      }

      const dt = Math.max(1e-6, time - (state.last_time || 0));
      const error = r - y;
      
      // 1. Proportional Term (with setpoint weighting beta)
      const P = p.Kp * (p.beta * r - y);
      
      // 2. Integral Term (with clamping anti-windup)
      let nextI = state.i_state;
      if (p.mode === 'PI' || p.mode === 'PID') {
        const i_inc = p.Ki * error * dt;
        nextI = state.i_state + i_inc;
      }
      
      // 3. Derivative Term (with filter N and setpoint weighting gamma)
      let D = 0;
      let nextD = state.d_state;
      if (p.mode === 'PD' || p.mode === 'PID') {
        const ed = p.gamma * r - y;
        const diff_e = (ed - (state.last_ed || 0));
        // D(s) = (Kd * N * s) / (s + N)
        D = (p.Kd * p.N * diff_e + state.d_state) / (1 + p.N * dt);
        nextD = D;
      }
      
      const u_unlimited = P + nextI + D;
      const u = Math.max(p.min, Math.min(p.max, u_unlimited));
      
      // Anti-Windup Clamping
      if (p.Ki !== 0) {
        if ((u_unlimited > p.max && error > 0) || (u_unlimited < p.min && error < 0)) {
           nextI = state.i_state;
        }
      }

      return {
        outputs: [u, error, P, nextI, D],
        nextState: {
          i_state: nextI,
          d_state: nextD,
          last_ed: p.gamma * r - y,
          last_time: time
        }
      };
    },
    evaluateDerivatives: (ins, p, state) => {
      const r = Number(ins[0]);
      const y = Number(ins[1]);
      const error = r - y;
      const di = p.Ki * error;
      const ed = p.gamma * r - y;
      const dd = p.N * (p.Kd * p.N * (ed - (state.last_ed || 0)) - state.d_state);
      return [di, dd];
    }
  }),

  // --- Linear Systems ---
  'STATE_SPACE': (id, params) => ({
    id, type: 'STATE_SPACE',
    params: {
      A: params.A || [[-1]], B: params.B || [[1]],
      C: params.C || [[1]], D: params.D || [[0]],
      x0: params.x0 || [0],
      representation: params.representation || 'continuous'
    },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input', 0, 'left', 'vector')],
    outputs: [
      createPort('y', 'y', 'output', 0, 'right', 'vector'),
      createPort('x', 'x', 'output', 0, 'top', 'vector')
    ],
    state: { x: params.x0 || [0], lastTime: 0 },
    execute: (ins, p, state, time) => {
      const u = Array.isArray(ins[0]) ? ins[0] : [Number(ins[0])];
      const x = state.x as number[];
      
      // y = C*x + D*u
      const y = p.C.map((row: number[]) => {
        const cx = row.reduce((sum, val, i) => sum + val * (Number(x[i]) || 0), 0);
        const du = p.D[0].reduce((sum: number, _: any, i: number) => sum + (Number(p.D[0][i]) || 0) * (Number(u[i]) || 0), 0);
        return cx + du;
      });

      if (p.representation === 'discrete') {
        const dt = Math.max(1e-6, time - (state.lastTime || 0));
        // x[k+1] = A*x[k] + B*u[k]
        const nextX = p.A.map((row: number[], i: number) => {
          const ax = row.reduce((sum, val, j) => sum + val * (Number(x[j]) || 0), 0);
          const bu = p.B[i].reduce((sum: number, val: number, j: number) => sum + val * (Number(u[j]) || 0), 0);
          return ax + bu;
        });
        return { outputs: [y, x], nextState: { x: nextX, lastTime: time } };
      }

      return { outputs: [y, x], nextState: { ...state, lastTime: time } };
    },
    evaluateDerivatives: (ins, p, state) => {
      const u = Array.isArray(ins[0]) ? ins[0] : [Number(ins[0])];
      const x = state.x as number[];
      // dx/dt = A*x + B*u
      return p.A.map((row: number[], i: number) => {
        const ax = row.reduce((sum, val, j) => sum + val * (Number(x[j]) || 0), 0);
        const bu = p.B[i].reduce((sum: number, val: number, j: number) => sum + val * (Number(u[j]) || 0), 0);
        return ax + bu;
      });
    }
  }),

  'TRANSFER_FUNCTION': (id, params) => {
    const num = params.numerator || [1];
    const den = params.denominator || [1, 1];
    const n = den.length - 1;
    const a0 = den[0] || 1;
    
    // Normalize denominator (a0 = 1)
    const d = den.map((val: number) => val / a0);
    const b = num.map((val: number) => val / a0);
    
    // Pad numerator with leading zeros if needed
    while (b.length <= n) b.unshift(0);
    
    // Convert to CCF State-Space
    const A = Array.from({ length: n }, (_, i) => 
      Array.from({ length: n }, (__, j) => {
        if (i < n - 1) return j === i + 1 ? 1 : 0;
        return -d[n - j];
      })
    );
    const B = Array.from({ length: n }, (_, i) => [i === n - 1 ? 1 : 0]);
    const b0 = b[0];
    const C = [Array.from({ length: n }, (_, i) => b[n - i] - d[n - i] * b0)];
    const D = [[b0]];

    return BLOCK_LIBRARY['STATE_SPACE'](id, { ...params, A, B, C, D });
  },

  'ZERO_POLE_GAIN': (id, params) => {
    const z = params.zeros || [];
    const p = params.poles || [-1];
    const k = params.gain !== undefined ? params.gain : 1;

    // Helper to multiply (s - r) terms
    const poly = (roots: number[]) => {
      let coeffs = [1];
      for (const r of roots) {
        let next = new Array(coeffs.length + 1).fill(0);
        for (let i = 0; i < coeffs.length; i++) {
          next[i] += coeffs[i];
          next[i+1] -= coeffs[i] * r;
        }
        coeffs = next;
      }
      return coeffs;
    };

    const num = poly(z).map(c => c * k);
    const den = poly(p);

    return BLOCK_LIBRARY['TRANSFER_FUNCTION'](id, { ...params, numerator: num, denominator: den });
  },

  'DISCRETE_TRANSFER_FUNCTION': (id, params) => {
    return BLOCK_LIBRARY['TRANSFER_FUNCTION'](id, { ...params, representation: 'discrete' });
  },

  'PID_BASIC': (id, params) => ({
    id, type: 'PID_BASIC',
    params: {
      mode: params.mode || 'PID',
      Kp: params.Kp !== undefined ? params.Kp : 1,
      Ki: params.Ki !== undefined ? params.Ki : 1,
      Kd: params.Kd !== undefined ? params.Kd : 0,
      N: params.N !== undefined ? params.N : 100,
      min: params.min !== undefined ? params.min : -100,
      max: params.max !== undefined ? params.max : 100,
      method: params.method || 'forward_euler'
    },
    isStateful: true,
    inputs: [
      createPort('e', 'Error', 'input'),
      createPort('enable', 'Enable', 'input', 1, 'bottom', 'control'),
      createPort('reset', 'Reset', 'input', 0, 'bottom', 'control')
    ],
    outputs: [
      createPort('u', 'Control', 'output', 0, 'right', 'control')
    ],
    state: { i_state: 0, d_state: 0, last_e: 0, last_time: 0 },
    execute: (ins, p, state, time) => {
      const error = Number(ins[0]);
      const enable = Number(ins[1]);
      const reset = Number(ins[2]);
      
      if (reset > 0.5) return { outputs: [0], nextState: { i_state: 0, d_state: 0, last_e: 0, last_time: time } };
      if (enable < 0.5) return { outputs: [0], nextState: { ...state, last_time: time } };

      const dt = Math.max(1e-6, time - (state.last_time || 0));
      
      const P = p.Kp * error;
      
      let nextI = state.i_state;
      if (p.mode === 'PI' || p.mode === 'PID') {
        nextI = state.i_state + p.Ki * error * dt;
      }
      
      let D = 0;
      let nextD = state.d_state;
      if (p.mode === 'PD' || p.mode === 'PID') {
        const diff_e = (error - (state.last_e || 0));
        D = (p.Kd * p.N * diff_e + state.d_state) / (1 + p.N * dt);
        nextD = D;
      }
      
      const u_unlimited = P + nextI + D;
      const u = Math.max(p.min, Math.min(p.max, u_unlimited));
      
      // Anti-Windup Clamping
      if (p.Ki !== 0 && ((u_unlimited > p.max && error > 0) || (u_unlimited < p.min && error < 0))) {
        nextI = state.i_state;
      }

      return {
        outputs: [u],
        nextState: { i_state: nextI, d_state: nextD, last_e: error, last_time: time }
      };
    },
    evaluateDerivatives: (ins, p, state) => {
      const error = Number(ins[0]);
      const di = p.Ki * error;
      const dd = p.N * (p.Kd * p.N * (error - (state.last_e || 0)) - state.d_state);
      return [di, dd];
    }
  }),

  // --- Noise Sources ---
  'WHITE_NOISE': (id, params) => ({
    id, type: 'WHITE_NOISE',
    params: { mean: params.mean || 0, variance: params.variance || 1 },
    inputs: [],
    outputs: [createPort('y', 'y', 'output')],
    execute: (ins, p) => {
      // Box-Muller transform for Gaussian noise
      const u1 = Math.random();
      const u2 = Math.random();
      const standardNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const y = Number(p.mean) + Math.sqrt(Number(p.variance)) * standardNormal;
      return { outputs: [y] };
    }
  }),

  'BAND_LIMITED_NOISE': (id, params) => ({
    id, type: 'BAND_LIMITED_NOISE',
    params: { mean: params.mean || 0, variance: params.variance || 1, fc: params.fc || 100 },
    isStateful: true,
    inputs: [],
    outputs: [createPort('y', 'y', 'output')],
    state: { y: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      // 1. Generate White Noise
      const u1 = Math.random();
      const u2 = Math.random();
      const standardNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const whiteNoise = Number(p.mean) + Math.sqrt(Number(p.variance)) * standardNormal;

      // 2. Apply LPF
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const tau = 1 / (2 * Math.PI * Number(p.fc));
      const alpha = dt / (tau + dt);
      const y = alpha * whiteNoise + (1 - alpha) * state.y;
      
      return { outputs: [y], nextState: { y, lastTime: time } };
    }
  }),

  // --- Basic Filters ---
  'LOW_PASS_FILTER': (id, params) => ({
    id, type: 'LOW_PASS_FILTER',
    params: { fc: params.fc || 10, method: params.method || 'discrete' },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    state: { y: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      const u = Number(ins[0]);
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const tau = 1 / (2 * Math.PI * Number(p.fc));
      const alpha = dt / (tau + dt);
      const y = alpha * u + (1 - alpha) * state.y;
      return { outputs: [y], nextState: { y, lastTime: time } };
    },
    evaluateDerivatives: (ins, p, state) => {
      const u = Number(ins[0]);
      const tau = 1 / (2 * Math.PI * Number(p.fc));
      return [(u - state.y) / tau];
    }
  }),

  'HIGH_PASS_FILTER': (id, params) => ({
    id, type: 'HIGH_PASS_FILTER',
    params: { fc: params.fc || 10 },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    state: { y: 0, last_u: 0, lastTime: 0 },
    execute: (ins, p, state, time) => {
      const u = Number(ins[0]);
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const tau = 1 / (2 * Math.PI * Number(p.fc));
      const alpha = tau / (tau + dt);
      const y = alpha * (state.y + u - state.last_u);
      return { outputs: [y], nextState: { y, last_u: u, lastTime: time } };
    }
  }),

  'MOVING_AVERAGE': (id, params) => ({
    id, type: 'MOVING_AVERAGE',
    params: { window_size: params.window_size || 10 },
    isStateful: true,
    inputs: [createPort('u', 'u', 'input')],
    outputs: [createPort('y', 'y', 'output')],
    state: { buffer: [], index: 0 },
    execute: (ins, p, state) => {
      const u = Number(ins[0]);
      const N = Number(p.window_size);
      let buffer = state.buffer.length === 0 ? new Array(N).fill(u) : [...state.buffer];
      buffer[state.index] = u;
      const nextIndex = (state.index + 1) % N;
      const y = buffer.reduce((a: number, b: number) => a + b, 0) / N;
      return { outputs: [y], nextState: { buffer, index: nextIndex } };
    }
  }),

  'KALMAN_FILTER': (id, params) => ({
    id, type: 'KALMAN_FILTER',
    params: {
      A: params.A || [[1, 0.01], [0, 1]],
      B: params.B || [[0.00005], [0.01]],
      C: params.C || [[1, 0]],
      Q: params.Q || [[0.01, 0], [0, 0.01]],
      R: params.R || [[0.1]],
      P0: params.P0 || [[1, 0], [0, 1]]
    },
    isStateful: true,
    inputs: [
      createPort('u', 'u', 'input', 0, 'left', 'vector'),
      createPort('y_meas', 'y_meas', 'input', 0, 'left', 'vector')
    ],
    outputs: [
      createPort('x_hat', 'x_hat', 'output', 0, 'right', 'vector'),
      createPort('y_hat', 'y_hat', 'output', 0, 'right', 'vector'),
      createPort('innovation', 'Inn', 'output', 0, 'top', 'vector'),
      createPort('kg', 'K', 'output', 0, 'top', 'vector')
    ],
    state: { x: null, P: null },
    execute: (ins, p, state) => {
      // Ensure inputs are matrices
      const uArr = Array.isArray(ins[0]) ? ins[0] : [Number(ins[0])];
      const yArr = Array.isArray(ins[1]) ? ins[1] : [Number(ins[1])];
      
      const u = math.matrix(uArr.map(v => [Number(v)])); // Column vector
      const y = math.matrix(yArr.map(v => [Number(v)])); // Column vector
      
      const A = math.matrix(p.A as number[][]);
      const B = math.matrix(p.B as number[][]);
      const C = math.matrix(p.C as number[][]);
      const Q = math.matrix(p.Q as number[][]);
      const R = math.matrix(p.R as number[][]);

      let x = state.x ? math.matrix(state.x as number[][]) : math.zeros(A.size()[0], 1);
      let P = state.P ? math.matrix(state.P as number[][]) : math.matrix(p.P0 as number[][]);

      // 1. Predict
      const x_minus = math.add(math.multiply(A, x), math.multiply(B, u)) as math.Matrix;
      const P_minus = math.add(math.multiply(math.multiply(A, P), math.transpose(A)), Q) as math.Matrix;

      // 2. Kalman Gain
      // S = C*P_minus*C' + R
      const S = math.add(math.multiply(math.multiply(C, P_minus), math.transpose(C)), R) as math.Matrix;
      const K = math.multiply(math.multiply(P_minus, math.transpose(C)), math.inv(S)) as math.Matrix;

      // 3. Update
      const innovation = math.subtract(y, math.multiply(C, x_minus)) as math.Matrix;
      const x_new = math.add(x_minus, math.multiply(K, innovation)) as math.Matrix;
      const I = math.identity(A.size()[0]) as math.Matrix;
      const P_new = math.multiply(math.subtract(I, math.multiply(K, C)), P_minus) as math.Matrix;

      const y_hat = math.multiply(C, x_new) as math.Matrix;

      return {
        outputs: [
          x_new.toArray().map((v: any) => v[0]), 
          y_hat.toArray().map((v: any) => v[0]),
          innovation.toArray().map((v: any) => v[0]),
          K.toArray().flat()
        ],
        nextState: { x: x_new.toArray(), P: P_new.toArray() }
      };
    }
  }),

  'EXTENDED_KALMAN_FILTER': (id, params) => {
    const kf = BLOCK_LIBRARY['KALMAN_FILTER'](id, params);
    return {
      ...kf,
      type: 'EXTENDED_KALMAN_FILTER',
      execute: (ins, p, state, time) => {
        return kf.execute(ins, p, state, time);
      }
    };
  },

  'MPC_CONTROLLER': (id, params) => {
    const Np = Number(params.Np) || 10;
    const Nc = Number(params.Nc) || 3;
    const A = params.A || [[1, 0.1], [0, 1]];
    const B = params.B || [[0], [0.1]];
    const C = params.C || [[1, 0]];
    const D = params.D || [[0]];
    const Q = params.Q || [[10, 0], [0, 10]];
    const R = params.R || [[1]];
    const u_min = params.u_min !== undefined ? params.u_min : -10;
    const u_max = params.u_max !== undefined ? params.u_max : 10;

    return {
      id, type: 'MPC_CONTROLLER',
      params: { Np, Nc, A, B, C, D, Q, R, u_min, u_max },
      isStateful: true,
      inputs: [
        createPort('x', 'x(k)', 'input', [0, 0], 'left', 'vector'),
        createPort('r', 'r(k)', 'input', [1], 'left', 'vector')
      ],
      outputs: [
        createPort('u', 'u(k)', 'output', 0, 'right', 'control'),
        createPort('pred_y', 'Predicted Y', 'output', [], 'top', 'vector')
      ],
      state: { solver: null, u_seq: null },
      execute: (ins, p, state) => {
        const x = Array.isArray(ins[0]) ? ins[0] : [Number(ins[0])];
        const r_val = Array.isArray(ins[1]) ? ins[1] : [Number(ins[1])];
        
        if (!state.solver) {
          state.solver = new MpcSolver({ A: p.A, B: p.B, C: p.C, D: p.D }, p);
        }

        const ref_seq = Array(p.Np).fill(r_val).flat();
        const result = state.solver.solve(x, ref_seq, state.u_seq);

        return { 
          outputs: [result.u[0], result.pred_y],
          nextState: { solver: state.solver, u_seq: result.u }
        };
      }
    };
  }
};
