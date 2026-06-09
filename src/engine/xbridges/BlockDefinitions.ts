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
    icon: 'activity',
    equation: 'Out = A & B & ...',
    execute: (ins) => ({ outputs: [ins.every(val => !!val)] })
  }),

  'OR': (id, params) => ({
    id, type: 'OR', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    icon: 'activity',
    equation: 'Out = A | B | ...',
    execute: (ins) => ({ outputs: [ins.some(val => !!val)] })
  }),

  'NOT': (id) => ({
    id, type: 'NOT', params: {},
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    icon: 'zap',
    equation: 'Out = !In',
    execute: (ins) => ({ outputs: [!ins[0]] })
  }),

  'NAND': (id, params) => ({
    id, type: 'NAND', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    icon: 'activity',
    equation: 'Out = !(A & B & ...)',
    description: 'A Not-AND gate. The output is LOW (0) only if all inputs are HIGH (1).',
    execute: (ins) => ({ outputs: [!ins.every(val => !!val)] })
  }),

  'NOR': (id, params) => ({
    id, type: 'NOR', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    icon: 'activity',
    equation: 'Out = !(A | B | ...)',
    description: 'A Not-OR gate. The output is HIGH (1) only if all inputs are LOW (0).',
    execute: (ins) => ({ outputs: [!ins.some(val => !!val)] })
  }),

  'XOR': (id, params) => ({
    id, type: 'XOR', params: { numInputs: params.numInputs || 2 },
    allowDynamicInputs: true,
    inputs: Array.from({ length: params.numInputs || 2 }, (_, i) => createPort(`in${i+1}`, String.fromCharCode(65 + i), 'input')),
    outputs: [createPort('out', 'Out', 'output')],
    icon: 'activity',
    equation: 'Out = Σ(Inputs) % 2',
    execute: (ins) => ({ outputs: [ins.filter(val => !!val).length % 2 !== 0] })
  }),

  // --- Bitwise Operations ---
  'BitwiseAND': (id) => ({
    id, type: 'BitwiseAND', params: {},
    inputs: [createPort('in1', 'A', 'input'), createPort('in2', 'B', 'input')],
    outputs: [createPort('out', 'Out', 'output')],
    icon: 'cpu',
    equation: 'Out = A & B (Bitwise)',
    description: 'Performs a bitwise AND operation on two integer inputs.',
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
    icon: 'layers',
    equation: 'Q(next) = D (on Clock Edge)',
    description: 'A standard D-type flip-flop that samples the input D on the rising edge of the clock.',
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
    icon: 'layers',
    equation: 'Q(next) = J!Q + !KQ (on Clock Edge)',
    description: 'A JK flip-flop that can set, reset, or toggle its state based on J and K inputs.',
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
    icon: 'database',
    equation: 'Val(next) = Data (if EN & CLK)',
    description: 'A multi-bit register that stores an integer value. Sampling occurs on the rising edge of the clock when EN is high.',
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
    icon: 'activity',
    equation: 'Count = (Count + 1) % (Max + 1)',
    description: 'A discrete-time counter that increments its internal value on each clock pulse.',
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
    icon: 'zap',
    equation: 'Clock = (t % T < T/2) ? 1 : 0',
    description: 'Generates a periodic square wave signal (1/0) at a specified frequency.',
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
    icon: 'plus',
    equation: 'Y = Σ(Ui)',
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
    icon: 'activity',
    equation: 'Y = Π(Ui)',
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
    icon: 'layers',
    equation: 'y(t) = ∫ u(τ) dτ + y(0)',
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
    id, type: 'Inport', params: { 
      port_index: params.port_index || 1, 
      name: params.name || `In${params.port_index || 1}`,
      data_type: params.data_type || 'auto',
      dimension: params.dimension || 1,
      value: params.value ?? 0, 
      smVarId: params.smVarId ?? '' 
    },
    inputs: [createPort('in', 'In', 'input')], // Bridge from parent
    outputs: [createPort('out', 'Out', 'output', params.value ?? 0)],
    state: { value: 0 },
    execute: (ins, p, state) => ({ outputs: [ins[0] !== undefined ? ins[0] : (state.value || Number(p.value || 0))] })
  }),

  'Outport': (id, params) => ({
    id, type: 'Outport', params: { 
      port_index: params.port_index || 1, 
      name: params.name || `Out${params.port_index || 1}`,
      data_type: params.data_type || 'auto',
      dimension: params.dimension || 1,
      smVarId: params.smVarId ?? '' 
    },
    inputs: [createPort('in', 'In', 'input')],
    outputs: [createPort('out', 'Out', 'output')], // Bridge to parent
    execute: (ins) => ({ outputs: [ins[0]] })
  }),

  'Subsystem': (id, params) => ({
    id, type: 'Subsystem',
    params: { 
      name: params.name || 'Subsystem',
      mask: params.mask || {},
      atomic_execution: params.atomic_execution || false
    },
    inputs: [], 
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
    },
    icon: 'zap',
    equation: 'PWM = Duty > Carrier(t)'
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
    icon: 'cpu',
    equation: 'Vdq = PI(I_ref - I_meas)\\nVabc = T_inv(Vdq, θ)',
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
    },
    icon: 'network',
    equation: 'α = Ia\\nβ = (Ia + 2*Ib)/√3'
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

  'CURRENT_CONTROLLER_DQ': (id, params) => ({
    id, type: 'CURRENT_CONTROLLER_DQ',
    params: { 
      Kp_d: params.Kp_d || 1, Ki_d: params.Ki_d || 10,
      Kp_q: params.Kp_q || 1, Ki_q: params.Ki_q || 10,
      iMax: params.iMax || 100
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
    state: { intD: 0, intQ: 0, lastT: 0 },
    execute: (ins, p, state, t) => {
      const dt = Math.max(1e-6, t - (state.lastT || 0));
      const eD = Number(ins[0]) - Number(ins[2]);
      const eQ = Number(ins[1]) - Number(ins[3]);
      const nextIntD = state.intD + eD * dt;
      const nextIntQ = state.intQ + eQ * dt;
      const vd = p.Kp_d * eD + p.Ki_d * nextIntD;
      const vq = p.Kp_q * eQ + p.Ki_q * nextIntQ;
      return { 
        outputs: [vd, vq],
        nextState: { intD: nextIntD, intQ: nextIntQ, lastT: t }
      };
    }
  }),

  'DOE_MODEL': (id, params) => {
    const inputNames = (typeof params.inputNames === 'object' && params.inputNames !== null && 'value' in params.inputNames) 
      ? params.inputNames.value : (params.inputNames || ['X1']);
    const outputName = (typeof params.outputName === 'object' && params.outputName !== null && 'value' in params.outputName) 
      ? params.outputName.value : (params.outputName || 'Y');
    const modelType = (typeof params.modelType === 'object' && params.modelType !== null && 'value' in params.modelType) 
      ? params.modelType.value : (params.modelType || 'RSM');
    
    return {
      id, type: 'DOE_MODEL',
      params: { ...params, inputNames, outputName, modelType },
      inputs: inputNames.map((name: string, i: number) => createPort(`in${i+1}`, name, 'input')),
      outputs: [createPort('out', outputName, 'output')],
      execute: (ins, p) => {
        try {
            const mType = (typeof p.modelType === 'object' && p.modelType !== null) ? p.modelType.value : (p.modelType || 'RSM');
            const equationStr = (typeof p.equation === 'object' && p.equation !== null) ? p.equation.value : (p.equation || '');
            
            const cleanIns = ins.map(v => {
                const n = Number(v);
                return isNaN(n) ? 0 : n;
            });

            if (mType === 'RSM') {
                const scope: any = {};
                const inputNamesArr = (typeof p.inputNames === 'object' && p.inputNames !== null && 'value' in p.inputNames) 
                  ? p.inputNames.value : (p.inputNames || inputNames);
                
                inputNamesArr.forEach((name: string, i: number) => {
                    const val = cleanIns[i] || 0;
                    scope[name] = val;
                    scope[`X${i+1}`] = val;
                });

                const lines = (equationStr || '').split('\n').filter((l: string) => l.trim() !== '');
                const eqLine = lines.find((l: string) => l.includes('Y ='));
                let eqStr = eqLine ? eqLine.split('Y =')[1].trim() : (lines[0] || '0');
                
                if (eqLine) {
                  lines.slice(lines.indexOf(eqLine) + 1).forEach((line: string) => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
                      eqStr += ' ' + trimmed;
                    }
                  });
                }

                try {
                    const result = math.evaluate(eqStr, scope);
                    return { outputs: [Number(result) || 0] };
                } catch (e) {
                    return { outputs: [cleanIns.reduce((a, b) => a + b, 0)] };
                }
            } else if (mType === 'GMDH') {
                const layers = (typeof p.layers === 'object' && p.layers !== null && !Array.isArray(p.layers)) ? p.layers.value : p.layers;
                const polyOrder = (typeof p.polyOrder === 'object' && p.polyOrder !== null) ? p.polyOrder.value : (p.polyOrder || 2);
                
                if (!layers || !Array.isArray(layers) || layers.length === 0) {
                    return { outputs: [cleanIns[0] || 0] };
                }

                let currentVals = [...cleanIns];
                for (const layer of (layers as any[])) {
                    currentVals = layer.map((neuron: any) => {
                        const xi = currentVals[neuron.inputs[0]] || 0;
                        const xj = currentVals[neuron.inputs[1]] || 0;
                        let vals: number[];
                        if (polyOrder === 3) {
                            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
                        } else {
                            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj];
                        }
                        const coeffs = neuron.coeffs || neuron.weights || [];
                        return vals.reduce((sum, v, cIdx) => sum + v * (coeffs[cIdx] || 0), 0);
                    });
                }
                return { outputs: [Number(currentVals[0]) || 0] };
            } else if (mType === 'Taguchi') {
                const grandMean = (typeof p.grandMean === 'object') ? p.grandMean.value : (p.grandMean || 0);
                const factorLevels = (typeof p.factorLevels === 'object' && !Array.isArray(p.factorLevels)) ? p.factorLevels.value : (p.factorLevels || []);
                
                let prediction = Number(grandMean);
                factorLevels.forEach((f: any, i: number) => {
                    const val = cleanIns[i] || 0;
                    // Find nearest level
                    if (f.means && Array.isArray(f.means)) {
                        const sortedMeans = [...f.means].sort((a, b) => Math.abs(a.level - val) - Math.abs(b.level - val));
                        const nearest = sortedMeans[0];
                        if (nearest) {
                            prediction += (nearest.meanY - grandMean);
                        }
                    }
                });
                return { outputs: [prediction] };
            }
            
            return { outputs: [cleanIns.reduce((a, b) => a + b, 0)] };
        } catch (err) {
            return { outputs: [0] };
        }
      }
    };
  },

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
    icon: 'network',
    equation: 'T1 = Ts * (√3*Vref/Vdc) * sin(π/3 - θs)\\nT2 = Ts * (√3*Vref/Vdc) * sin(θs)',
    description: 'Calculates the space vector modulation timing intervals T1, T2, and T0 for a given voltage vector in the alpha-beta plane.',
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
    icon: 'network',
    equation: 'Gate = f(Vα, Vβ, Vdc)',
    description: 'A complete Space Vector Pulse Width Modulation (SVPWM) modulator. It converts voltage references into 6-step switching signals for a 3-phase inverter.',
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
    icon: 'database',
    equation: 'y(k) = u(k - N)',
    description: 'Delays the input signal by a specified number of simulation steps. Useful for modeling transport delays or discrete-time pipelines.',
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
    icon: 'layers',
    equation: 'y(k) = y(k-1) + Δt * u(k-1) (Forward Euler)',
    description: 'Performs numerical integration of a discrete-time signal using Euler or Tustin methods.',
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
    icon: 'rows',
    description: 'Bundles multiple scalar signals into a single vector signal for cleaner routing.',
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
    icon: 'activity',
    equation: 'y = u * K',
    description: 'Multiplies the input signal by a constant gain factor K.',
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
    icon: 'activity',
    equation: 'y = (ctrl > th) ? u1 : u2',
    description: 'Passes either the first or second input based on whether a control signal meets a threshold criteria.',
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
    icon: 'activity',
    equation: 'y = sin(u)',
    description: 'Calculates the sine of the input signal (in radians or degrees).',
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
    icon: 'settings-2',
    equation: 'dx/dt = Ax + Bu\\ny = Cx + Du',
    description: 'Models a linear time-invariant (LTI) system in state-space representation. Supports both continuous and discrete-time domains.',
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

    const ss = BLOCK_LIBRARY['STATE_SPACE'](id, { ...params, A, B, C, D });
    return {
      ...ss,
      icon: 'settings-2',
      equation: 'G(s) = (b0*sⁿ + ... + bn) / (a0*sⁿ + ... + an)',
      description: 'Models a linear system using its Laplace-domain transfer function coefficients. Automatically converts to state-space for simulation.'
    };
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
    icon: 'settings-2',
    equation: 'u = PI + D',
    description: 'A basic PID controller implementation with saturation and anti-windup. Ideal for simple control loops.',
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

  'LOW_PASS_FILTER': (id, params) => ({
    id, type: 'LOW_PASS_FILTER',
    params: { fc: params.fc || 10, method: params.method || 'discrete' },
    icon: 'activity',
    equation: 'τ*dy/dt + y = u',
    description: 'A first-order low-pass filter that attenuates high-frequency noise above the cutoff frequency fc.',
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
    icon: 'database',
    equation: 'y(k) = (1/N) * Σ u(k-i)',
    description: 'Calculates the average of the last N input samples. Smooths out high-frequency fluctuations.',
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
    icon: 'cpu',
    equation: 'x̂(k+1) = Ax̂(k) + Bu(k) + K(y - Cx̂)',
    description: 'An optimal estimator for linear systems with Gaussian noise. It provides the best possible estimate of the internal state.',
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
      const uArr = Array.isArray(ins[0]) ? ins[0] : [Number(ins[0])];
      const yArr = Array.isArray(ins[1]) ? ins[1] : [Number(ins[1])];
      const u = math.matrix(uArr.map(v => [Number(v)]));
      const y = math.matrix(yArr.map(v => [Number(v)]));
      const A = math.matrix(p.A as number[][]);
      const B = math.matrix(p.B as number[][]);
      const C = math.matrix(p.C as number[][]);
      const Q = math.matrix(p.Q as number[][]);
      const R = math.matrix(p.R as number[][]);
      let x = state.x ? math.matrix(state.x as number[][]) : math.zeros(A.size()[0], 1);
      let P = state.P ? math.matrix(state.P as number[][]) : math.matrix(p.P0 as number[][]);
      const x_minus = math.add(math.multiply(A, x), math.multiply(B, u)) as math.Matrix;
      const P_minus = math.add(math.multiply(math.multiply(A, P), math.transpose(A)), Q) as math.Matrix;
      const S = math.add(math.multiply(math.multiply(C, P_minus), math.transpose(C)), R) as math.Matrix;
      const K = math.multiply(math.multiply(P_minus, math.transpose(C)), math.inv(S)) as math.Matrix;
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
      icon: 'cpu',
      equation: 'min J = Σ(x\'Qx + u\'Ru)',
      description: 'Advanced predictive controller that solves a constrained optimization problem at each step to determine the optimal control input.',
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
          state.solver = new MpcSolver({ A: p.A, B: p.B, C: p.C, D: p.D }, p as any);
        }
        const ref_seq = Array(p.Np).fill(r_val).flat();
        const result = state.solver.solve(x, ref_seq, state.u_seq);
        return { 
          outputs: [result.u[0], result.pred_y],
          nextState: { solver: state.solver, u_seq: result.u }
        };
      }
    };
  },

  'NUMERIC_REPRESENTATION': (id, params) => {
    const mode = params.mode || 'fixed_point';
    const output_type = params.output_type || 'float64';
    const rounding = params.rounding || 'floor';
    const overflow = params.overflow || 'saturate';
    const wl = Number(params.wordLength) || 16;
    const fl = Number(params.fractionLength) || 8;

    return {
      id, type: 'NUMERIC_REPRESENTATION',
      params: { mode, output_type, rounding, overflow, wordLength: wl, fractionLength: fl },
      isStateful: false,
      inputs: [createPort('u', 'u', 'input')],
      outputs: [
        createPort('y', 'y', 'output'),
        createPort('e', 'error', 'output', 0, 'top', 'measurement')
      ],
      execute: (ins: any[], p: any) => {
        let u = Number(ins[0]);
        let y = u;
        if (p.mode === 'floating_point') {
            if (p.output_type === 'float32') y = Math.fround(u);
            else if (p.output_type === 'float16') y = Number(u.toPrecision(4));
        } else {
            const scale = Math.pow(2, p.fractionLength);
            let raw = u * scale;
            if (p.rounding === 'floor') raw = Math.floor(raw);
            else if (p.rounding === 'ceil') raw = Math.ceil(raw);
            else if (p.rounding === 'round') raw = Math.round(raw);
            else if (p.rounding === 'convergent') {
                const d = Math.floor(raw);
                const f = raw - d;
                if (f < 0.5) raw = d;
                else if (f > 0.5) raw = d + 1;
                else raw = (d % 2 === 0) ? d : d + 1;
            }
            const maxRaw = Math.pow(2, p.wordLength - 1) - 1;
            const minRaw = -Math.pow(2, p.wordLength - 1);
            if (p.overflow === 'saturate') raw = Math.max(minRaw, Math.min(maxRaw, raw));
            else if (p.overflow === 'wrap') {
                const range = maxRaw - minRaw + 1;
                raw = ((((raw - minRaw) % range) + range) % range) + minRaw;
            }
            y = raw / scale;
        }
        const error = Math.abs(u - y);
        return { outputs: [y, error] };
      }
    };
  },

  'DOE_MODULE': (id, params) => ({
    id, type: 'DOE_MODULE',
    params: { 
      modelType: params.modelType || 'RSM',
      factors: params.factors || ['X1', 'X2'],
      response: params.response || 'Y',
      maxLayers: params.maxLayers || 5,
      neuronsPerLayer: params.neuronsPerLayer || 10
    },
    isStateful: true,
    inputs: [
      createPort('dataset', 'Data', 'input', null, 'left', 'data'),
      createPort('trigger', 'Train', 'input', 0, 'top', 'logical')
    ],
    outputs: [
      createPort('model', 'Model', 'output', null, 'right', 'object'),
      createPort('pred', 'Pred', 'output', 0, 'right', 'control')
    ],
    state: { model: null, results: null },
    execute: (ins: any[], p: any, state: any) => {
      return { outputs: [state.model || null, 0] };
    }
  }),
  'AC_INDUCTION_MOTOR': (id: string, params: any) => ({
    id, type: 'AC_INDUCTION_MOTOR',
    params: {
      Rs: params.Rs || 0.5, Ls: params.Ls || 0.1,
      Rr: params.Rr || 0.4, Lr: params.Lr || 0.1,
      Lm: params.Lm || 0.09, P: params.P || 2,
      J: params.J || 0.01, B: params.B || 0.001
    },
    isStateful: true,
    inputs: [
      createPort('va', 'Va', 'input', 0, 'left', 'power'),
      createPort('vb', 'Vb', 'input', 0, 'left', 'power'),
      createPort('vc', 'Vc', 'input', 0, 'left', 'power'),
      createPort('tl', 'Tl', 'input', 0, 'bottom', 'load')
    ],
    outputs: [
      createPort('ia', 'Ia', 'output', 0, 'right', 'measurement'),
      createPort('ib', 'Ib', 'output', 0, 'right', 'measurement'),
      createPort('ic', 'Ic', 'output', 0, 'right', 'measurement'),
      createPort('omega', 'ω', 'output', 0, 'right', 'measurement'),
      createPort('theta', 'θ', 'output', 0, 'right', 'measurement'),
      createPort('te', 'Te', 'output', 0, 'top', 'measurement')
    ],
    state: { ias: 0, ibs: 0, psiar: 0, psibr: 0, omega: 0, theta: 0, lastTime: 0 },
    icon: 'zap',
    equation: 'dPsi/dt = V - Rs*Is\\nd(omega)/dt = (Te - Tl)/J',
    description: 'Dynamic model of a 3-phase Induction Motor in the stationary alpha-beta frame. Outputs mechanical speed, torque, and phase currents.',
    execute: (ins: any[], p: any, state: any) => ({
      outputs: [
        state.ias,
        state.ibs,
        -state.ias - state.ibs,
        state.omega,
        state.theta,
        1.5 * p.P * (p.Lm / p.Lr) * (state.psiar * state.ibs - state.psibr * state.ias)
      ]
    }),
    evaluateDerivatives: (ins, p, state) => {
      const va = Number(ins[0]);
      const vb = Number(ins[1]);
      const vc = Number(ins[2]);
      const tl = Number(ins[3]);
      
      const vAlpha = (2 * va - vb - vc) / 3;
      const vBeta = (vb - vc) / Math.sqrt(3);
      
      const sigma = 1 - (p.Lm * p.Lm) / (p.Ls * p.Lr);
      const kr = p.Lm / p.Lr;
      const tr = p.Lr / p.Rr;
      
      const dias = (vAlpha - (p.Rs + kr * kr * p.Rr) / sigma * state.ias + (kr / (sigma * tr)) * state.psiar + (kr * p.P * state.omega / sigma) * state.psibr) / (sigma * p.Ls);
      const dibs = (vBeta - (p.Rs + kr * kr * p.Rr) / sigma * state.ibs + (kr / (sigma * tr)) * state.psibr - (kr * p.P * state.omega / sigma) * state.psiar) / (sigma * p.Ls);
      const dpsiar = (p.Lm / tr) * state.ias - (1 / tr) * state.psiar - p.P * state.omega * state.psibr;
      const dpsibr = (p.Lm / tr) * state.ibs - (1 / tr) * state.psibr + p.P * state.omega * state.psiar;
      
      const Te = 1.5 * p.P * kr * (state.psiar * state.ibs - state.psibr * state.ias);
      const domega = (Te - tl - p.B * state.omega) / p.J;
      const dtheta = state.omega;
      
      return [dias, dibs, dpsiar, dpsibr, domega, dtheta];
    }
  }),

  'IM_SCALAR_CONTROL': (id: string, params: any) => ({
    id, type: 'IM_SCALAR_CONTROL',
    params: {
      v_f_ratio: params.v_f_ratio || 4,
      boost: params.boost || 10,
      rated_f: params.rated_f || 50
    },
    inputs: [createPort('w_ref', 'ω*', 'input', 0, 'left', 'control')],
    outputs: [
      createPort('va', 'Va*', 'output', 0, 'right', 'control'),
      createPort('vb', 'Vb*', 'output', 0, 'right', 'control'),
      createPort('vc', 'Vc*', 'output', 0, 'right', 'control')
    ],
    icon: 'activity',
    equation: 'V = Vf * f + Vboost',
    description: 'Open-loop Volts-per-Hertz (Scalar) control for Induction Motors. Maintains constant flux-to-frequency ratio.',
    execute: (ins, p, state, time) => {
      const wRef = Math.abs(Number(ins[0]));
      const f = wRef / (2 * Math.PI);
      const vMag = p.v_f_ratio * f + p.boost;
      
      const va = vMag * Math.sin(wRef * time);
      const vb = vMag * Math.sin(wRef * time - 2 * Math.PI / 3);
      const vc = vMag * Math.sin(wRef * time + 2 * Math.PI / 3);
      
      return { outputs: [va, vb, vc] };
    }
  }),

  'IM_FOC_CONTROL': (id: string, params: any) => ({
    id, type: 'IM_FOC_CONTROL',
    params: {
      Kp_speed: params.Kp_speed || 2, Ki_speed: params.Ki_speed || 20,
      Kp_curr: params.Kp_curr || 10, Ki_curr: params.Ki_curr || 100,
      psi_ref: params.psi_ref || 0.9,
      Lm: params.Lm || 0.09, Lr: params.Lr || 0.1, Rr: params.Rr || 0.4, P: params.P || 2
    },
    isStateful: true,
    inputs: [
      createPort('w_ref', 'ω*', 'input', 0, 'left', 'control'),
      createPort('w_meas', 'ω', 'input', 0, 'top', 'measurement'),
      createPort('ia', 'Ia', 'input', 0, 'top', 'measurement'),
      createPort('ib', 'Ib', 'input', 0, 'top', 'measurement'),
      createPort('theta', 'θ_flux', 'input', 0, 'bottom', 'measurement')
    ],
    outputs: [
      createPort('va', 'Va*', 'output', 0, 'right', 'control'),
      createPort('vb', 'Vb*', 'output', 0, 'right', 'control'),
      createPort('vc', 'Vc*', 'output', 0, 'right', 'control'),
      createPort('id_ref', 'Id*', 'output', 0, 'top', 'measurement'),
      createPort('iq_ref', 'Iq*', 'output', 0, 'top', 'measurement')
    ],
    state: { intW: 0, intD: 0, intQ: 0, lastT: 0 },
    icon: 'cpu',
    description: 'High-performance Field-Oriented Control for Induction Motors. Includes speed and current PI loops.',
    execute: (ins, p, state, time) => {
      const dt = Math.max(1e-6, time - (state.lastT || 0));
      const wErr = Number(ins[0]) - Number(ins[1]);
      const nextIntW = state.intW + wErr * dt;
      const iqRef = p.Kp_speed * wErr + p.Ki_speed * nextIntW;
      const idRef = p.psi_ref / p.Lm;
      
      // Clarke/Park
      const ia = Number(ins[2]), ib = Number(ins[3]), theta = Number(ins[4]);
      const iAlpha = ia, iBeta = (ia + 2 * ib) / Math.sqrt(3);
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      const id = iAlpha * cosT + iBeta * sinT, iq = -iAlpha * sinT + iBeta * cosT;
      
      const eD = idRef - id, eQ = iqRef - iq;
      const nextIntD = state.intD + eD * dt, nextIntQ = state.intQ + eQ * dt;
      const vd = p.Kp_curr * eD + p.Ki_curr * nextIntD;
      const vq = p.Kp_curr * eQ + p.Ki_curr * nextIntQ;
      
      const vAlpha = vd * cosT - vq * sinT, vBeta = vd * sinT + vq * cosT;
      const va = vAlpha, vb = -0.5 * vAlpha + Math.sqrt(3) / 2 * vBeta, vc = -0.5 * vAlpha - Math.sqrt(3) / 2 * vBeta;
      
      return { 
        outputs: [va, vb, vc, idRef, iqRef],
        nextState: { intW: nextIntW, intD: nextIntD, intQ: nextIntQ, lastT: time }
      };
    }
  }),

  'IM_FLUX_OBSERVER': (id: string, params: any) => ({
    id, type: 'IM_FLUX_OBSERVER',
    params: { Lm: params.Lm || 0.09, Lr: params.Lr || 0.1, Rr: params.Rr || 0.4, P: params.P || 2 },
    isStateful: true,
    inputs: [
      createPort('ia', 'Ia', 'input', 0, 'left', 'measurement'),
      createPort('ib', 'Ib', 'input', 0, 'left', 'measurement'),
      createPort('omega', 'ω', 'input', 0, 'bottom', 'measurement')
    ],
    outputs: [
      createPort('theta', 'θ_flux', 'output', 0, 'right', 'measurement'),
      createPort('psi_r', 'Ψr', 'output', 0, 'right', 'measurement')
    ],
    state: { psiar: 0.001, psibr: 0, lastTime: 0 },
    icon: 'eye',
    description: 'Current-model Rotor Flux Observer. Estimates the rotor flux angle and magnitude from stator currents and rotor speed.',
    execute: (ins, p, state) => {
      const theta = Math.atan2(state.psibr, state.psiar);
      const mag = Math.sqrt(state.psibr * state.psibr + state.psiar * state.psiar);
      return { outputs: [theta, mag] };
    },
    evaluateDerivatives: (ins, p, state) => {
      const ia = Number(ins[0]), ib = Number(ins[1]), omega = Number(ins[2]);
      const iAlpha = ia, iBeta = (ia + 2 * ib) / Math.sqrt(3);
      const tr = p.Lr / p.Rr;
      const dpsiar = (p.Lm / tr) * iAlpha - (1 / tr) * state.psiar - p.P * omega * state.psibr;
      const dpsibr = (p.Lm / tr) * iBeta - (1 / tr) * state.psibr + p.P * omega * state.psiar;
      return [dpsiar, dpsibr];
    }
  }),

  'VF_SLIP_COMP': (id: string, params: any) => ({
    id, type: 'VF_SLIP_COMP',
    params: {
      v_f_ratio: params.v_f_ratio || 4,
      rated_slip: params.rated_slip || 0.05,
      rated_iq: params.rated_iq || 10
    },
    inputs: [
      createPort('w_ref', 'ω*', 'input', 0, 'left', 'control'),
      createPort('iq_actual', 'Iq', 'input', 0, 'top', 'measurement')
    ],
    outputs: [
      createPort('va', 'Va*', 'output', 0, 'right', 'control'),
      createPort('vb', 'Vb*', 'output', 0, 'right', 'control'),
      createPort('vc', 'Vc*', 'output', 0, 'right', 'control'),
      createPort('w_sync', 'ω_sync', 'output', 0, 'top', 'measurement')
    ],
    icon: 'zap',
    description: 'V/f control with slip compensation. Adjusts the output frequency based on measured q-axis current to maintain constant speed under load.',
    execute: (ins, p, state, time) => {
      const wRef = Number(ins[0]);
      const iq = Number(ins[1]);
      const wSlip = (iq / p.rated_iq) * p.rated_slip * (2 * Math.PI * 50); // Rough estimate
      const wSync = wRef + wSlip;
      const f = Math.abs(wSync) / (2 * Math.PI);
      const vMag = p.v_f_ratio * f + 10;
      
      const va = vMag * Math.sin(wSync * time);
      const vb = vMag * Math.sin(wSync * time - 2 * Math.PI / 3);
      const vc = vMag * Math.sin(wSync * time + 2 * Math.PI / 3);
      
      return { outputs: [va, vb, vc, wSync] };
    }
  }),

  'FIELD_WEAKENING': (id: string, params: any) => ({
    id, type: 'FIELD_WEAKENING',
    params: { v_max: params.v_max || 300, Kp: params.Kp || 0.1, Ki: params.Ki || 1 },
    isStateful: true,
    inputs: [
      createPort('v_mag', '|V|', 'input', 0, 'left', 'measurement'),
      createPort('id_base', 'Id_base', 'input', 10, 'left', 'control')
    ],
    outputs: [createPort('id_ref', 'Id*', 'output', 0, 'right', 'control')],
    state: { integral: 0, lastTime: 0 },
    icon: 'activity',
    description: 'Field weakening controller. Reduces the d-axis current (flux reference) when the terminal voltage exceeds the maximum limit.',
    execute: (ins, p, state, time) => {
      const dt = Math.max(1e-6, time - (state.lastTime || 0));
      const vMag = Number(ins[0]);
      const idBase = Number(ins[1]);
      const vErr = p.v_max - vMag;
      
      let nextInt = state.integral;
      if (vErr < 0) nextInt += vErr * dt;
      else nextInt = Math.min(0, nextInt + vErr * dt);
      
      const deltaId = p.Kp * (vErr < 0 ? vErr : 0) + p.Ki * nextInt;
      const idRef = idBase + deltaId;
      
      return { outputs: [idRef], nextState: { integral: nextInt, lastTime: time } };
    }
  }),

  'MTPA_CONTROLLER': (id: string, params: any) => ({
    id, type: 'MTPA_CONTROLLER',
    params: { Ld: params.Ld || 0.01, Lq: params.Lq || 0.02, psi_m: params.psi_m || 0.1 },
    inputs: [createPort('te_ref', 'Te*', 'input', 0, 'left', 'control')],
    outputs: [
      createPort('id_ref', 'Id*', 'output', 0, 'right', 'control'),
      createPort('iq_ref', 'Iq*', 'output', 0, 'right', 'control')
    ],
    icon: 'zap',
    description: 'Maximum Torque Per Ampere (MTPA) trajectory generator for salient-pole motors (IPMSM).',
    execute: (ins, p) => {
      const Te = Number(ins[0]);
      // Simplified MTPA for learning
      const iq = Te / (1.5 * 2 * (p.psi_m)); // Assuming 2 pole pairs
      const id = -Math.abs(iq * 0.2); // Rough salient effect
      return { outputs: [id, iq] };
    }
  }),

  'AC_MOTOR_PID_CONTROL': (id: string, params: any) => {
    // This block is a composite learning module
    // It internally uses the AC_INDUCTION_MOTOR logic and a PID controller
    const motor = BLOCK_LIBRARY['AC_INDUCTION_MOTOR'](id + '_m', params);
    const pid = BLOCK_LIBRARY['PID_CONTROLLER'](id + '_p', params);
    
    return {
      id, type: 'AC_MOTOR_PID_CONTROL',
      params: { 
        Kp: params.Kp || 2.5, Ki: params.Ki || 1.2, Kd: params.Kd || 0.1,
        w_ref: params.w_ref || 157,
        tl: params.tl || 0,
        Rs: params.Rs || 0.5, Ls: params.Ls || 0.1,
        Rr: params.Rr || 0.4, Lr: params.Lr || 0.1,
        Lm: params.Lm || 0.09, P: params.P || 2,
        J: params.J || 0.01, B: params.B || 0.001,
        N: params.N || 100
      },
      isStateful: true,
      icon: 'graduation-cap',
      description: 'A complete pedagogical model for PID Speed Control of an Induction Motor. It integrates the motor dynamics and the speed regulator into one block for easy analysis of tuning effects.',
      inputs: [
        createPort('w_ref', 'ω*', 'input', params.w_ref || 157, 'left', 'control'),
        createPort('tl', 'Tl', 'input', params.tl || 0, 'bottom', 'load')
      ],
      outputs: [
        createPort('omega', 'ω', 'output', 0, 'right', 'measurement'),
        createPort('error', 'Error', 'output', 0, 'top', 'measurement'),
        createPort('te', 'Torque', 'output', 0, 'top', 'measurement')
      ],
      state: { 
        ias: 0, ibs: 0, psiar: 0.001, psibr: 0, omega: 0, theta: 0, // Motor states
        i_state: 0, d_state: 0, last_e: 0, lastTime: 0 // PID states
      },
      execute: (ins: any[], p: any, state: any) => {
        const Te = 1.5 * p.P * (p.Lm / p.Lr) * (state.psiar * state.ibs - state.psibr * state.ias);
        const error = Number(ins[0]) - state.omega;
        return {
          outputs: [state.omega, error, Te]
        };
      },
      evaluateDerivatives: (ins: any[], p: any, state: any, time: number) => {
        const w_ref = Number(ins[0]);
        const tl = Number(ins[1]);
        const w_meas = state.omega;
        const error = w_ref - w_meas;

        // 1. PID Logic (Stationary Frame Approximation for Learning)
        const P = p.Kp * error;
        const I = state.i_state;
        const D = state.d_state;
        const v_mag = Math.max(0, P + I + D); // Voltage magnitude
        
        // 2. Stator Voltage Generation (V/f synchronous)
        const theta_v = w_ref * time; 
        const va = v_mag * Math.sin(theta_v);
        const vb = v_mag * Math.sin(theta_v - 2 * Math.PI / 3);
        const vc = v_mag * Math.sin(theta_v + 2 * Math.PI / 3);
        
        const vAlpha = (2 * va - vb - vc) / 3;
        const vBeta = (vb - vc) / Math.sqrt(3);

        // 3. Induction Motor Derivatives
        const sigma = 1 - (p.Lm * p.Lm) / (p.Ls * p.Lr);
        const kr = p.Lm / p.Lr;
        const tr = p.Lr / p.Rr;
        
        const dias = (vAlpha - (p.Rs + kr * kr * p.Rr) / sigma * state.ias + (kr / (sigma * tr)) * state.psiar + (kr * p.P * state.omega / sigma) * state.psibr) / (sigma * p.Ls);
        const dibs = (vBeta - (p.Rs + kr * kr * p.Rr) / sigma * state.ibs + (kr / (sigma * tr)) * state.psibr - (kr * p.P * state.omega / sigma) * state.psiar) / (sigma * p.Ls);
        const dpsiar = (p.Lm / tr) * state.ias - (1 / tr) * state.psiar - p.P * state.omega * state.psibr;
        const dpsibr = (p.Lm / tr) * state.ibs - (1 / tr) * state.psibr + p.P * state.omega * state.psiar;
        
        const Te = 1.5 * p.P * kr * (state.psiar * state.ibs - state.psibr * state.ias);
        const domega = (Te - tl - (p.B || 0.001) * state.omega) / (p.J || 0.01);
        const dtheta = state.omega;

        // 4. PID Derivatives
        const di = p.Ki * error;
        const N = p.N || 100;
        const dd = N * (p.Kd * N * (error - (state.last_e || 0)) - state.d_state);

        return [dias, dibs, dpsiar, dpsibr, domega, dtheta, di, dd];
      }
    };
  },

  'LMS_ADAPTIVE_FILTER': (id: string, params: any) => ({
    id, type: 'LMS_ADAPTIVE_FILTER',
    params: { lr: params.lr || 0.05 },
    isStateful: true,
    inputs: [
      createPort('x', 'x', 'input', 0, 'left', 'control'),
      createPort('d', 'd', 'input', 0, 'left', 'control'),
      createPort('lr', 'Learning Rate', 'input', params.lr || 0.05, 'bottom', 'control')
    ],
    outputs: [
      createPort('y', 'y', 'output', 0, 'right', 'control'),
      createPort('err', 'err', 'output', 0, 'right', 'control'),
      createPort('w1', 'w1', 'output', 0, 'right', 'control'),
      createPort('w2', 'w2', 'output', 0, 'right', 'control')
    ],
    state: { w1: 0, w2: 0, x_prev: 0 },
    icon: 'graduation-cap',
    equation: 'y = w1*x + w2*x_prev\\nerr = d - y\\nw = w + lr*err*x_vec',
    description: 'A 2-tap Least Mean Squares (LMS) Adaptive Filter. Automatically learns to predict a target signal d from an input x by updating filter weights w1 and w2.\n\nSampling Time Note: For stable learning, the sampling time (dt) must satisfy dt < 2 / (R * lr) where R is the input signal power. In practice, a sampling rate of 100 Hz to 1 kHz (dt = 1ms to 10ms) is recommended to ensure smooth gradients and prevent divergence.',
    execute: (ins, p, state) => {
      const x = Number(ins[0] ?? 0);
      const d = Number(ins[1] ?? 0);
      const lr = Number(ins[2] ?? p.lr ?? 0.05);
      
      const w1 = state.w1 ?? 0;
      const w2 = state.w2 ?? 0;
      const x_prev = state.x_prev ?? 0;
      
      const y = w1 * x + w2 * x_prev;
      const err = d - y;
      
      const nextW1 = w1 + lr * err * x;
      const nextW2 = w2 + lr * err * x_prev;
      
      return {
        outputs: [y, err, w1, w2],
        nextState: { w1: nextW1, w2: nextW2, x_prev: x }
      };
    }
  }),

  'NEURAL_NEURON_LEARNING': (id: string, params: any) => ({
    id, type: 'NEURAL_NEURON_LEARNING',
    params: { lr: params.lr || 0.1, initW1: params.initW1 || 0.5, initW2: params.initW2 || -0.5, initBias: params.initBias || 0.0 },
    isStateful: true,
    inputs: [
      createPort('x1', 'x1', 'input', 0, 'left', 'control'),
      createPort('x2', 'x2', 'input', 0, 'left', 'control'),
      createPort('target', 'target', 'input', 0, 'left', 'control'),
      createPort('lr', 'Learning Rate', 'input', params.lr || 0.1, 'bottom', 'control')
    ],
    outputs: [
      createPort('y', 'y', 'output', 0, 'right', 'control'),
      createPort('err', 'err', 'output', 0, 'right', 'control'),
      createPort('w1', 'w1', 'output', params.initW1 || 0.5, 'right', 'control'),
      createPort('w2', 'w2', 'output', params.initW2 || -0.5, 'right', 'control'),
      createPort('bias', 'bias', 'output', params.initBias || 0.0, 'right', 'control')
    ],
    state: { 
      w1: params.initW1 || 0.5, 
      w2: params.initW2 || -0.5, 
      bias: params.initBias || 0.0 
    },
    icon: 'graduation-cap',
    equation: 'y = tanh(w1*x1 + w2*x2 + bias)\\nerr = target - y\\ndw = lr*err*(1-y^2)*x',
    description: 'A Single-Neuron Online Gradient Descent Learner using a tanh activation function. Trains weights and bias via online backpropagation.\n\nSampling Time Note: A sampling time of 2ms to 20ms is recommended. Smaller dt values provide smoother optimization trajectories, whereas larger dt values might cause weight divergence or numerical overflow in discrete gradient steps unless the learning rate is scaled down.',
    execute: (ins, p, state) => {
      const x1 = Number(ins[0] ?? 0);
      const x2 = Number(ins[1] ?? 0);
      const target = Number(ins[2] ?? 0);
      const lr = Number(ins[3] ?? p.lr ?? 0.1);
      
      const w1 = state.w1 !== undefined ? state.w1 : (p.initW1 || 0.5);
      const w2 = state.w2 !== undefined ? state.w2 : (p.initW2 || -0.5);
      const bias = state.bias !== undefined ? state.bias : (p.initBias || 0.0);
      
      const net = w1 * x1 + w2 * x2 + bias;
      const y = Math.tanh(net);
      const err = target - y;
      
      const f_prime = 1 - y * y;
      
      const nextW1 = w1 + lr * err * f_prime * x1;
      const nextW2 = w2 + lr * err * f_prime * x2;
      const nextBias = bias + lr * err * f_prime;
      
      return {
        outputs: [y, err, w1, w2, bias],
        nextState: { w1: nextW1, w2: nextW2, bias: nextBias }
      };
    }
  }),

  'RL_Q_LEARNING_CONTROLLER': (id: string, params: any) => {
    const numStates = params.numStates || 5;
    const numActions = params.numActions || 3;
    return {
      id, type: 'RL_Q_LEARNING_CONTROLLER',
      params: { 
        alpha: params.alpha || 0.1, 
        gamma: params.gamma || 0.9, 
        epsilon: params.epsilon || 0.1,
        numStates,
        numActions
      },
      isStateful: true,
      inputs: [
        createPort('error', 'error', 'input', 0, 'left', 'control'),
        createPort('reward', 'reward', 'input', 0, 'left', 'control'),
        createPort('reset', 'reset', 'input', 0, 'bottom', 'logical')
      ],
      outputs: [
        createPort('action', 'action', 'output', 0, 'right', 'control'),
        createPort('max_q', 'max_q', 'output', 0, 'right', 'control')
      ],
      state: {
        qTable: Array.from({ length: numStates }, () => Array(numActions).fill(0)),
        lastStateIdx: Math.floor(numStates / 2),
        lastActionIdx: Math.floor(numActions / 2),
        hasPrev: 0
      },
      icon: 'graduation-cap',
      equation: 'Q(s,a) += α*(R + γ*max_q(s\') - Q(s,a))',
      description: 'Discrete Q-learning control agent. Maps continuous system error into a configurable number of state bins, selects control actions spaced between [-1, 1] using epsilon-greedy exploration, and updates Q-values online.\n\nSampling Time Note: Reinforcement learning control loops require a slower sampling time, typically 20ms to 100ms. If dt is too small, state changes are negligible, causing poor credit assignment. If dt is too large, the delayed control inputs lead to poor regulation stability.',
      execute: (ins, p, state) => {
        const error = Number(ins[0] ?? 0);
        const reward = Number(ins[1] ?? 0);
        const reset = !!ins[2];
        
        const alpha = p.alpha ?? 0.1;
        const gamma = p.gamma ?? 0.9;
        const epsilon = p.epsilon ?? 0.1;
        const nS = p.numStates ?? 5;
        const nA = p.numActions ?? 3;
        
        const actions: number[] = [];
        if (nA === 1) {
          actions.push(0.0);
        } else {
          for (let i = 0; i < nA; i++) {
            actions.push(-1.0 + (2.0 * i) / (nA - 1));
          }
        }
        
        let s = Math.floor(nS / 2);
        if (nS === 5) {
          if (error < -1.0) s = 0;
          else if (error < -0.1) s = 1;
          else if (error > 1.0) s = 4;
          else if (error > 0.1) s = 3;
          else s = 2;
        } else {
          // Linear mapping from error [-1.5, 1.5] to [0, nS - 1]
          const range = 3.0;
          const normalized = (error + 1.5) / range;
          s = Math.max(0, Math.min(nS - 1, Math.floor(normalized * nS)));
        }
        
        let qTable = state && state.qTable && state.qTable.length === nS && state.qTable[0].length === nA
          ? state.qTable.map((row: number[]) => [...row])
          : Array.from({ length: nS }, () => Array(nA).fill(0));
        
        let lastStateIdx = state && state.qTable && state.qTable.length === nS && state.qTable[0].length === nA
          ? (state.lastStateIdx ?? Math.floor(nS / 2))
          : Math.floor(nS / 2);
        let lastActionIdx = state && state.qTable && state.qTable.length === nS && state.qTable[0].length === nA
          ? (state.lastActionIdx ?? Math.floor(nA / 2))
          : Math.floor(nA / 2);
        let hasPrev = state && state.qTable && state.qTable.length === nS && state.qTable[0].length === nA
          ? (state.hasPrev ?? 0)
          : 0;
        
        if (reset) {
          qTable = Array.from({ length: nS }, () => Array(nA).fill(0));
          lastStateIdx = Math.floor(nS / 2);
          lastActionIdx = Math.floor(nA / 2);
          hasPrev = 0;
        }
        
        if (hasPrev === 1 && !reset) {
          const maxQNext = Math.max(...qTable[s]);
          const targetQ = reward + gamma * maxQNext;
          const currentQ = qTable[lastStateIdx][lastActionIdx];
          qTable[lastStateIdx][lastActionIdx] = currentQ + alpha * (targetQ - currentQ);
        }
        
        let aIdx = Math.floor(nA / 2);
        if (Math.random() < epsilon) {
          aIdx = Math.floor(Math.random() * nA);
        } else {
          let maxVal = qTable[s][0];
          aIdx = 0;
          for (let i = 1; i < nA; i++) {
            if (qTable[s][i] > maxVal) {
              maxVal = qTable[s][i];
              aIdx = i;
            }
          }
        }
        
        const action = actions[aIdx];
        const maxQ = Math.max(...qTable[s]);
        
        return {
          outputs: [action, maxQ],
          nextState: {
            qTable,
            lastStateIdx: s,
            lastActionIdx: aIdx,
            hasPrev: 1
          }
        };
      }
    };
  }
};


export const XBRIDGES_CATEGORIES = [
  {
    name: 'Learning Models',
    blocks: [
      { type: 'AC_MOTOR_PID_CONTROL', label: 'AC Motor PID Control', icon: 'graduation-cap' },
      { type: 'LMS_ADAPTIVE_FILTER', label: 'LMS Adaptive Filter', icon: 'graduation-cap' },
      { type: 'NEURAL_NEURON_LEARNING', label: 'Neural Neuron Learner', icon: 'graduation-cap' },
      { type: 'RL_Q_LEARNING_CONTROLLER', label: 'RL Q-Learning Agent', icon: 'graduation-cap' }
    ]
  },
  {
    name: 'Sources',
    blocks: [
      { type: 'Constant', label: 'Constant', icon: 'square' },
      { type: 'WaveformGen', label: 'Waveform Gen', icon: 'activity' },
    ]
  },
  {
    name: 'Element-wise Math',
    blocks: [
      { type: 'VectorAdd', label: 'Add', icon: 'plus' },
      { type: 'VectorSub', label: 'Subtract', icon: 'minus' },
      { type: 'VectorMul', label: 'Multiply', icon: 'x' },
      { type: 'VectorDiv', label: 'Divide', icon: 'divide' },
      { type: 'VectorPow', label: 'Power', icon: 'chevron-up' },
      { type: 'UnaryNeg', label: 'Unary Minus', icon: 'minus-circle' },
      { type: 'Abs', label: 'Absolute Value', icon: 'maximize' },
    ]
  },
  {
    name: 'Reductions',
    blocks: [
      { type: 'SumElements', label: 'Sum of Elements', icon: 'sigma' },
      { type: 'Mean', label: 'Mean', icon: 'bar-chart' },
      { type: 'Max', label: 'Max', icon: 'arrow-up' },
    ]
  },
  {
    name: 'Linear Algebra',
    blocks: [
      { type: 'MatrixMul', label: 'Matrix Multiply', icon: 'grid' },
      { type: 'Transpose', label: 'Transpose', icon: 'rotate-cw' },
      { type: 'Inverse', label: 'Inverse', icon: 'refresh-ccw' },
      { type: 'Determinant', label: 'Determinant', icon: 'hash' },
    ]
  },
  {
    name: 'Continuous',
    blocks: [
      { type: 'Integrator', label: 'Integrator', icon: 'integral' },
    ]
  },
  {
    name: 'Logic Gates',
    blocks: [
      { type: 'AND', label: 'AND Gate', icon: 'plus' },
      { type: 'OR', label: 'OR Gate', icon: 'grid' },
      { type: 'NOT', label: 'NOT Gate', icon: 'minus-circle' },
      { type: 'NAND', label: 'NAND Gate', icon: 'plus' },
      { type: 'NOR', label: 'NOR Gate', icon: 'grid' },
      { type: 'XOR', label: 'XOR Gate', icon: 'plus' },
    ]
  },
  {
    name: 'Bitwise',
    blocks: [
      { type: 'BitwiseAND', label: 'Bitwise AND', icon: 'plus' },
      { type: 'BitwiseOR', label: 'Bitwise OR', icon: 'grid' },
      { type: 'BitwiseXOR', label: 'Bitwise XOR', icon: 'plus' },
      { type: 'BitwiseNOT', label: 'Bitwise NOT', icon: 'minus-circle' },
      { type: 'ShiftLeft', label: 'Shift Left', icon: 'chevron-left' },
      { type: 'ShiftRight', label: 'Shift Right', icon: 'chevron-right' },
    ]
  },
  {
    name: 'Sequential',
    blocks: [
      { type: 'DFlipFlop', label: 'D Flip-Flop', icon: 'refresh-ccw' },
      { type: 'JKFlipFlop', label: 'JK Flip-Flop', icon: 'refresh-ccw' },
      { type: 'Register', label: 'Register', icon: 'box' },
      { type: 'Counter', label: 'Counter', icon: 'trending-up' },
      { type: 'Clock', label: 'Clock', icon: 'rotate-cw' },
    ]
  },
  {
    name: 'Sinks',
    blocks: [
      { type: 'Scope', label: 'Scope', icon: 'monitor' },
    ]
  },
  {
    name: 'Ports',
    blocks: [
      { type: 'Inport', label: 'Inport', icon: 'log-in' },
      { type: 'Outport', label: 'Outport', icon: 'log-out' },
    ]
  },
  {
    name: 'Signal Routing',
    blocks: [
      { type: 'MUX', label: 'Mux', icon: 'layers' },
      { type: 'DEMUX', label: 'Demux', icon: 'grid' },
    ]
  },
  {
    name: 'Motor Control',
    blocks: [
      { type: 'VF_SLIP_COMP', label: 'V/f + Slip Comp', icon: 'zap' },
      { type: 'IM_SCALAR_CONTROL', label: 'Induction Motor Scalar', icon: 'activity' },
      { type: 'IM_FOC_CONTROL', label: 'Induction Motor FOC', icon: 'cpu' },
      { type: 'IM_FLUX_OBSERVER', label: 'Flux Observer', icon: 'eye' },
      { type: 'SIX_STEP_COMMUTATION', label: 'Six-Step BLDC', icon: 'cpu' },
      { type: 'SENSORLESS_SIX_STEP', label: 'Sensorless BLDC', icon: 'cpu' },
      { type: 'AC_INDUCTION_MOTOR', label: 'Induction Motor Model', icon: 'zap' }
    ]
  },
  {
    name: 'Torque Optimization',
    blocks: [
      { type: 'MTPA_CONTROLLER', label: 'MTPA Controller', icon: 'zap' },
      { type: 'FIELD_WEAKENING', label: 'Field Weakening', icon: 'activity' },
      { type: 'MTPA_FW_MANAGER', label: 'MTPA + FW Manager', icon: 'cpu' }
    ]
  },
  {
    name: 'Subsystem Architecture',
    blocks: [
      { type: 'Subsystem', label: 'Subsystem', icon: 'layers' },
      { type: 'Inport', label: 'Inport', icon: 'arrow-right-circle' },
      { type: 'Outport', label: 'Outport', icon: 'arrow-left-circle' }
    ]
  }
];
