import type { RequestUnderstandingTestCase } from './requestUnderstandingCorpus';

/** Release holdout authored and frozen after validation-v1 fixes. */
export const RELEASE_HOLDOUT_VERSION = '2026-09-23.v2';

export const REQUEST_UNDERSTANDING_RELEASE_HOLDOUT: readonly RequestUnderstandingTestCase[] = [
  ['release-add-01', 'Total 101 and 202', 'arithmetic', ['add'], ['Constant', 'Constant', 'Sum'], [101, 202], 'ready'],
  ['release-add-02', 'Find the sum of -7 and 18.25', 'arithmetic', ['add'], ['Constant', 'Constant', 'Sum'], [-7, 18.25], 'ready'],
  ['release-add-03', 'Add 0.125 plus 4.875 and show it', 'observability', ['add'], ['Constant', 'Constant', 'Sum', 'Scope'], [0.125, 4.875], 'ready'],
  ['release-mul-01', 'Find the product of 16 and 9', 'arithmetic', ['multiply'], ['Constant', 'Constant', 'VectorMul'], [16, 9], 'ready'],
  ['release-mul-02', 'Multiply -3.5 by 8', 'arithmetic', ['multiply'], ['Constant', 'Constant', 'VectorMul'], [-3.5, 8], 'ready'],
  ['release-mul-03', 'Plot 22 times 5 on a scope', 'observability', ['multiply'], ['Constant', 'Constant', 'VectorMul', 'Scope'], [22, 5], 'ready'],
  ['release-sub-01', 'Subtract 17 from 63', 'arithmetic', ['subtract'], ['Constant', 'Constant', 'Sum'], [17, 63], 'ready'],
  ['release-sub-02', 'Calculate the difference between 90 and 45', 'arithmetic', ['subtract'], ['Constant', 'Constant', 'Sum'], [90, 45], 'ready'],
  ['release-sub-03', 'Take 11 away from 50 and display the result', 'observability', ['subtract'], ['Constant', 'Constant', 'Sum', 'Scope'], [11, 50], 'ready'],
  ['release-div-01', 'Divide 225 by 15', 'arithmetic', ['divide'], ['Constant', 'Constant', 'VectorDiv'], [225, 15], 'ready'],
  ['release-div-02', 'Find the quotient of 84 and 7', 'arithmetic', ['divide'], ['Constant', 'Constant', 'VectorDiv'], [84, 7], 'ready'],
  ['release-div-03', 'Show 72 divided by 8 on a scope', 'observability', ['divide'], ['Constant', 'Constant', 'VectorDiv', 'Scope'], [72, 8], 'ready'],
  ['release-control-01', 'Create a PID controller for a transfer function plant', 'pid', ['create'], ['PID_CONTROLLER', 'TRANSFER_FUNCTION'], [], 'ready'],
  ['release-control-02', 'Build a PID and plant feedback loop with scope output', 'pid', ['create'], ['PID_CONTROLLER', 'TRANSFER_FUNCTION', 'Scope'], [], 'ready'],
  ['release-control-03', 'Connect a transfer function to a PID controller', 'pid', ['create'], ['PID_CONTROLLER', 'TRANSFER_FUNCTION'], [], 'ready'],
  ['release-control-04', 'Plot a PID controlled plant response', 'pid', ['create'], ['PID_CONTROLLER', 'TRANSFER_FUNCTION', 'Scope'], [], 'ready'],
  ['release-transfer-01', 'Transfer function numerator [2] denominator [1, 5, 6]', 'transfer_function', ['create'], ['TRANSFER_FUNCTION'], [], 'ready'],
  ['release-transfer-02', 'Create a plant transfer function and observe its output', 'transfer_function', ['create'], ['TRANSFER_FUNCTION', 'Scope'], [], 'ready'],
  ['release-units-01', 'Set signal frequency to 3 kHz', 'units', ['create'], [], [3000], 'unsupported'],
  ['release-units-02', 'Use 330 mV', 'units', ['create'], [], [0.33], 'unsupported'],
  ['release-units-03', 'Resistance equals 2.2 kohm', 'units', ['create'], [], [2200], 'unsupported'],
  ['release-units-04', 'Set duration to 250 ms', 'units', ['create'], [], [0.25], 'unsupported'],
  ['release-typo-01', 'craete an adder using 23 and 77', 'typos', ['add'], ['Constant', 'Constant', 'Sum'], [23, 77], 'ready'],
  ['release-typo-02', 'mutliply 13 by 4 and dsplay it', 'typos', ['multiply'], ['Constant', 'Constant', 'VectorMul', 'Scope'], [13, 4], 'ready'],
  ['release-typo-03', 'subtrct 6 from 29 on a sccope', 'typos', ['subtract'], ['Constant', 'Constant', 'Sum', 'Scope'], [6, 29], 'ready'],
  ['release-typo-04', 'create a trasfer function with a pid controler', 'typos', ['create'], ['PID_CONTROLLER', 'TRANSFER_FUNCTION'], [], 'ready'],
  ['release-negative-01', 'Tell me a joke about resistors', 'unsupported', ['create'], [], [], 'unsupported'],
  ['release-negative-02', 'Suggest a dinner recipe', 'unsupported', ['create'], [], [], 'unsupported'],
  ['release-negative-03', 'Plan my summer vacation', 'unsupported', ['create'], [], [], 'unsupported'],
  ['release-clarify-01', 'Add a pair of numbers', 'arithmetic', ['add'], ['Sum'], [], 'clarification_required']
].map(([id, input, category, expectedOperations, expectedEntityTypes, numericValues, expectedStatus]) => ({
  id: id as string,
  input: input as string,
  category: category as RequestUnderstandingTestCase['category'],
  split: 'holdout' as const,
  expectedOperations: expectedOperations as string[],
  expectedEntityTypes: expectedEntityTypes as string[],
  expectedValues: (numericValues as number[]).map(normalizedValue => ({ normalizedValue })),
  expectedStatus: expectedStatus as RequestUnderstandingTestCase['expectedStatus']
}));
