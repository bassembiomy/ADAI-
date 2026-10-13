import type { RequestUnderstandingTestCase } from './requestUnderstandingCorpus';

/**
 * Release holdout created after implementation was frozen. Do not edit cases
 * in place. A changed requirement requires a new version and a new baseline.
 */
export const FROZEN_HOLDOUT_VERSION = '2026-09-23.v1';

export const REQUEST_UNDERSTANDING_FROZEN_HOLDOUT: readonly RequestUnderstandingTestCase[] = [
  {
    id: 'frozen-arithmetic-01', input: 'Please total 13.5 and -2.25', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['add'], expectedEntityTypes: ['Constant', 'Constant', 'Sum'],
    expectedValues: [{ normalizedValue: 13.5 }, { normalizedValue: -2.25 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-arithmetic-02', input: 'Find the product of 7 and 12', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['multiply'], expectedEntityTypes: ['Constant', 'Constant', 'VectorMul'],
    expectedValues: [{ normalizedValue: 7 }, { normalizedValue: 12 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-arithmetic-03', input: 'Take 8 away from 31', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['subtract'], expectedEntityTypes: ['Constant', 'Constant', 'Sum'],
    expectedValues: [{ normalizedValue: 8 }, { normalizedValue: 31 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-arithmetic-04', input: 'Divide 144 by 12', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['divide'], expectedEntityTypes: ['Constant', 'Constant', 'VectorDiv'],
    expectedValues: [{ normalizedValue: 144 }, { normalizedValue: 12 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-arithmetic-05', input: 'Build an adder for two user supplied values', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['add'], expectedEntityTypes: ['Sum'], expectedStatus: 'clarification_required'
  },
  {
    id: 'frozen-arithmetic-06', input: 'Multiply 2.5e2 by 4e-1', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['multiply'], expectedEntityTypes: ['Constant', 'Constant', 'VectorMul'],
    expectedValues: [{ normalizedValue: 250 }, { normalizedValue: 0.4 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-scope-01', input: 'Add 9 to 6, then plot the result', category: 'observability', split: 'holdout',
    expectedOperations: ['add'], expectedEntityTypes: ['Constant', 'Constant', 'Sum', 'Scope'],
    expectedValues: [{ normalizedValue: 9 }, { normalizedValue: 6 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-scope-02', input: 'Show the product of 11 and 3 on the display', category: 'observability', split: 'holdout',
    expectedOperations: ['multiply'], expectedEntityTypes: ['Constant', 'Constant', 'VectorMul', 'Scope'],
    expectedValues: [{ normalizedValue: 11 }, { normalizedValue: 3 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-scope-03', input: 'Observe 81 divided by 9', category: 'observability', split: 'holdout',
    expectedOperations: ['divide'], expectedEntityTypes: ['Constant', 'Constant', 'VectorDiv', 'Scope'],
    expectedValues: [{ normalizedValue: 81 }, { normalizedValue: 9 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-scope-04', input: 'Plot the plant output using a scope', category: 'observability', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['TRANSFER_FUNCTION', 'Scope'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-control-01', input: 'Create a PID controller connected to a transfer function', category: 'pid', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['PID_CONTROLLER', 'TRANSFER_FUNCTION'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-control-02', input: 'Build a closed loop PID around a plant and show its output', category: 'pid', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['PID_CONTROLLER', 'TRANSFER_FUNCTION', 'Scope'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-control-03', input: 'Use a PID to control the transfer function', category: 'pid', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['PID_CONTROLLER', 'TRANSFER_FUNCTION'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-control-04', input: 'Make a transfer function plant with PID feedback and a plot', category: 'pid', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['PID_CONTROLLER', 'TRANSFER_FUNCTION', 'Scope'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-transfer-01', input: 'Create transfer function numerator [1, 3] denominator [1, 4, 4]', category: 'transfer_function', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['TRANSFER_FUNCTION'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-transfer-02', input: 'Model the plant as a transfer function and monitor it', category: 'transfer_function', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['TRANSFER_FUNCTION', 'Scope'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-units-01', input: 'Set frequency to 2.5 kHz', category: 'units', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedValues: [{ normalizedValue: 2500, unit: 'Hz' }], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-units-02', input: 'Use a resistance of 4.7 kohm', category: 'units', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedValues: [{ normalizedValue: 4700, unit: 'ohm' }], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-units-03', input: 'Capacitance is 220 nF', category: 'units', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedValues: [{ normalizedValue: 2.2e-7, unit: 'F' }], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-units-04', input: 'Apply 750 mV', category: 'units', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedValues: [{ normalizedValue: 0.75, unit: 'V' }], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-typo-01', input: 'creat an adder for 17 and 25', category: 'typos', split: 'holdout',
    expectedOperations: ['add'], expectedEntityTypes: ['Constant', 'Constant', 'Sum'],
    expectedValues: [{ normalizedValue: 17 }, { normalizedValue: 25 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-typo-02', input: 'multibly 14 by 6 and disply it', category: 'typos', split: 'holdout',
    expectedOperations: ['multiply'], expectedEntityTypes: ['Constant', 'Constant', 'VectorMul', 'Scope'],
    expectedValues: [{ normalizedValue: 14 }, { normalizedValue: 6 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-typo-03', input: 'substract 19 from 44 on a scop', category: 'typos', split: 'holdout',
    expectedOperations: ['subtract'], expectedEntityTypes: ['Constant', 'Constant', 'Sum', 'Scope'],
    expectedValues: [{ normalizedValue: 19 }, { normalizedValue: 44 }], expectedStatus: 'ready'
  },
  {
    id: 'frozen-typo-04', input: 'pid controler for a trasfer function', category: 'typos', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: ['PID_CONTROLLER', 'TRANSFER_FUNCTION'], expectedStatus: 'ready'
  },
  {
    id: 'frozen-negative-01', input: 'Write a limerick about control systems', category: 'unsupported', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-negative-02', input: 'Book a flight to Alexandria next Thursday', category: 'unsupported', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-negative-03', input: 'Generate a photorealistic image of a motor', category: 'unsupported', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-negative-04', input: 'Run a full 3D CFD mesh of a turbine blade', category: 'unsupported', split: 'holdout',
    expectedOperations: ['create'], expectedEntityTypes: [], expectedStatus: 'unsupported'
  },
  {
    id: 'frozen-ambiguous-01', input: 'Add some values together', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['add'], expectedEntityTypes: ['Sum'], expectedStatus: 'clarification_required'
  },
  {
    id: 'frozen-ambiguous-02', input: 'Divide two numbers and show the answer', category: 'arithmetic', split: 'holdout',
    expectedOperations: ['divide'], expectedEntityTypes: ['VectorDiv', 'Scope'], expectedStatus: 'clarification_required'
  }
] as const;
