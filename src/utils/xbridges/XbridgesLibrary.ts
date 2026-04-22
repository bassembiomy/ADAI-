// src/utils/xbridges/XbridgesLibrary.ts

export const XBRIDGES_CATEGORIES = [
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
  }
];
