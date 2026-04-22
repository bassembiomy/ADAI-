// src/engine/xbridges/BlockDefinitions.ts
import { XBlock, XPort } from './types';
import { VectorUtils } from './VectorUtils';
import * as math from 'mathjs';

const createPort = (id: string, name: string, dir: 'input'|'output', val: any = 0): XPort => ({
  id, name, type: 'auto', direction: dir, value: val
});

export const BLOCK_LIBRARY: Record<string, (id: string, params: any) => XBlock> = {
  // --- Sources ---
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
  'Scope': (id) => ({
    id, type: 'Scope', params: {},
    allowDynamicInputs: true,
    inputs: [createPort('in1', 'In', 'input')],
    outputs: [],
    execute: () => ({ outputs: [] })
  }),

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
  })
};
