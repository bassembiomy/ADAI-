/**
 * src/services/ai/catalog/xbridgesDomainVocabulary.ts
 *
 * Comprehensive semantic vocabulary mapping natural language keywords,
 * mathematical operations, physical concepts, and synonyms across all
 * 12 X-Bridges domains to catalog block types, port semantics, and parameters.
 */

import { XbridgesCapabilityIndex } from './xbridgesCapabilityIndex';

export interface DomainVocabularyEntry {
  domain: string;
  keywords: string[];
  canonicalBlocks: string[];
  description: string;
}

export interface SemanticOperation {
  operator: 'multiply' | 'add' | 'subtract' | 'divide' | 'power' | 'gain' | 'abs' | 'negate' | 'integrate' | 'filter' | 'logic' | 'custom';
  blockType: string;
  inputPorts: string[];
  outputPort: string;
  defaultParams?: Record<string, unknown>;
}

export const XBRIDGES_DOMAIN_VOCABULARY: Record<string, DomainVocabularyEntry> = {
  arithmetic: {
    domain: 'arithmetic',
    keywords: [
      'multiply', 'product', 'times', 'by', 'multiplication',
      'add', 'plus', 'sum', 'addition', 'summation',
      'subtract', 'minus', 'difference', 'subtraction',
      'divide', 'division', 'quotient', 'over',
      'power', 'squared', 'cube', 'pow',
      'abs', 'absolute', 'magnitude',
      'negate', 'negative', 'unary minus', 'invert sign'
    ],
    canonicalBlocks: ['VectorMul', 'VectorAdd', 'Sum', 'VectorSub', 'VectorDiv', 'VectorPow', 'Abs', 'UnaryNeg', 'Gain'],
    description: 'Element-wise and algebraic arithmetic operations on signals and matrices.'
  },

  sources: {
    domain: 'sources',
    keywords: [
      'constant', 'cnstant', 'value', 'dc', 'bias',
      'step', 'unit step', 'step function',
      'sine', 'cosine', 'sine wave', 'waveform', 'generator', 'oscillator',
      'clock', 'pulse', 'square wave', 'ramp', 'source'
    ],
    canonicalBlocks: ['Constant', 'Step', 'WaveformGen', 'Clock'],
    description: 'Signal generation and input stimulus blocks.'
  },

  continuous: {
    domain: 'continuous',
    keywords: [
      'integrate', 'integrator', 'integral', 'accumulation',
      'transfer function', 'tf', 'poles', 'zeros', 'denominator', 'numerator',
      'state space', 'continuous', 'differential', 'derivative',
      'rlc', 'mass spring', 'second order', 'resonant'
    ],
    canonicalBlocks: ['Integrator', 'TRANSFER_FUNCTION', 'Gain', 'STATE_SPACE'],
    description: 'Continuous-time dynamical models, transfer functions, and integration.'
  },

  control: {
    domain: 'control',
    keywords: [
      'pid', 'proportional', 'integral', 'derivative', 'closed loop',
      'feedback', 'setpoint', 'error', 'tuning', 'kp', 'ki', 'kd',
      'speed controller', 'current controller', 'flux reference'
    ],
    canonicalBlocks: ['PID_CONTROLLER', 'Sum', 'Gain', 'Integrator'],
    description: 'Feedback control systems, error calculation, and loop stabilization.'
  },

  filters: {
    domain: 'filters',
    keywords: [
      'filter', 'lowpass', 'highpass', 'bandpass', 'butterworth',
      'noise reduction', 'cutoff', 'smoothing', 'attenuation', 'lms'
    ],
    canonicalBlocks: ['TRANSFER_FUNCTION', 'LMS_ADAPTIVE_FILTER'],
    description: 'Frequency-domain signal filtering and adaptive noise cancellation.'
  },

  discontinuities: {
    domain: 'discontinuities',
    keywords: [
      'saturate', 'saturation', 'clamp', 'limit', 'limiter',
      'deadzone', 'dead zone', 'deadband',
      'rate limiter', 'ramp rate', 'slew rate',
      'relay', 'hysteresis', 'bang bang'
    ],
    canonicalBlocks: ['SATURATION', 'DEADZONE', 'RATE_LIMITER', 'RELAY'],
    description: 'Non-linear elements, boundary limits, and switching thresholds.'
  },

  logic: {
    domain: 'logic',
    keywords: [
      'and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor',
      'logic gate', 'boolean', 'truth table', 'interlock', 'binary'
    ],
    canonicalBlocks: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'],
    description: 'Combinational logic and safety interlocking.'
  },

  sequential: {
    domain: 'sequential',
    keywords: [
      'flip flop', 'flipflop', 'd flip flop', 'jk flip flop',
      'latch', 'register', 'counter', 'frequency divider', 'clock divider',
      'state machine', 'sequence'
    ],
    canonicalBlocks: ['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Clock'],
    description: 'Clocked sequential logic, memory elements, and counters.'
  },

  linear_algebra: {
    domain: 'linear_algebra',
    keywords: [
      'matrix multiply', 'dot product', 'matmul',
      'transpose', 'invert matrix', 'matrix inverse',
      'determinant', 'vector transformation', 'linear system'
    ],
    canonicalBlocks: ['MatrixMul', 'Transpose', 'Inverse', 'Determinant'],
    description: 'Matrix computations, transformations, and linear algebra.'
  },

  power: {
    domain: 'power',
    keywords: [
      'inverter', 'three phase inverter', '3-phase inverter', 'h bridge', 'h-bridge',
      'dc voltage source', 'dc bus', 'three phase load', 'converter', 'rectifier'
    ],
    canonicalBlocks: ['THREE_PHASE_INVERTER', 'DC_VOLTAGE_SOURCE', 'THREE_PHASE_LOAD', 'SINGLE_PHASE_H_BRIDGE'],
    description: 'Power electronic converters, inverters, and electrical loads.'
  },

  modulation: {
    domain: 'modulation',
    keywords: [
      'pwm', 'pulse width modulation', 'svpwm', 'space vector',
      'carrier', 'duty cycle', 'clarke', 'park', 'dq', 'alpha beta', 'foc'
    ],
    canonicalBlocks: ['PWM_GENERATOR', 'THREE_PHASE_PWM', 'CLARKE_TRANSFORM', 'PARK_TRANSFORM', 'INVERSE_PARK'],
    description: 'Modulation, field-oriented control (FOC), and coordinate transforms.'
  },

  sinks: {
    domain: 'sinks',
    keywords: [
      'scope', 'oscilloscope', 'display', 'monitor', 'observe',
      'plot', 'show', 'visualize', 'readout', 'graph', 'sink', 'sink_scope'
    ],
    canonicalBlocks: ['Scope', 'Display', 'Outport'],
    description: 'Signal sinks, visualization scopes, and export ports.'
  }
};

/**
 * Resolves a natural language text to a specific mathematical / domain operation.
 */
export function resolveDomainOperation(
  text: string,
  catalog: XbridgesCapabilityIndex
): SemanticOperation | null {
  const lower = text.toLowerCase();

  // 1. Division (e.g. "divide A by B", "quotient of A and B", "A over B")
  if (
    lower.includes('divide') ||
    lower.includes('division') ||
    lower.includes('quotient') ||
    /\bover\b/.test(lower)
  ) {
    const blockType = catalog.blocks.has('VectorDiv') ? 'VectorDiv' : 'Divide';
    return {
      operator: 'divide',
      blockType,
      inputPorts: ['in1', 'in2'],
      outputPort: 'out'
    };
  }

  // 2. Power (e.g. "power of A to B", "A squared", "pow")
  if (
    lower.includes('power') ||
    lower.includes('squared') ||
    lower.includes('cube') ||
    /\bpow\b/.test(lower)
  ) {
    const blockType = catalog.blocks.has('VectorPow') ? 'VectorPow' : 'Power';
    return {
      operator: 'power',
      blockType,
      inputPorts: ['in1', 'in2'],
      outputPort: 'out'
    };
  }

  // 3. Multiplication (e.g. "multiply 10 by 100", "product of A and B", "A times B")
  if (
    lower.includes('multiply') ||
    lower.includes('multiplication') ||
    lower.includes('product') ||
    (/\bby\b/.test(lower) && (lower.includes('constant') || lower.includes('signal') || lower.includes('times'))) ||
    /\btimes\b/.test(lower)
  ) {
    const blockType = catalog.blocks.has('VectorMul')
      ? 'VectorMul'
      : catalog.blocks.has('Product')
      ? 'Product'
      : 'Gain';

    return {
      operator: 'multiply',
      blockType,
      inputPorts: ['in1', 'in2'],
      outputPort: 'out'
    };
  }

  // 4. Subtraction (e.g. "subtract B from A", "difference between A and B", "minus")
  if (
    lower.includes('subtract') ||
    lower.includes('subtraction') ||
    lower.includes('difference') ||
    lower.includes('minus')
  ) {
    const blockType = catalog.blocks.has('Sum') ? 'Sum' : (catalog.blocks.has('VectorSub') ? 'VectorSub' : 'Sub');
    return {
      operator: 'subtract',
      blockType,
      inputPorts: ['in1', 'in2'],
      outputPort: 'out',
      defaultParams: { signs: '+-' }
    };
  }

  // 5. Addition (e.g. "add A and B", "sum of A and B", "plus")
  if (
    lower.includes('add') ||
    lower.includes('plus') ||
    lower.includes('sum') ||
    lower.includes('addition') ||
    lower.includes('summation')
  ) {
    const blockType = catalog.blocks.has('Sum') ? 'Sum' : (catalog.blocks.has('VectorAdd') ? 'VectorAdd' : 'Add');
    return {
      operator: 'add',
      blockType,
      inputPorts: ['in1', 'in2'],
      outputPort: 'out',
      defaultParams: { signs: '++' }
    };
  }

  // 6. Absolute Value
  if (lower.includes('abs') || lower.includes('absolute')) {
    const blockType = catalog.blocks.has('Abs') ? 'Abs' : 'Magnitude';
    return {
      operator: 'abs',
      blockType,
      inputPorts: ['in1'],
      outputPort: 'out'
    };
  }

  // 7. Unary Negation
  if (lower.includes('negate') || lower.includes('negative') || lower.includes('unary minus')) {
    const blockType = catalog.blocks.has('UnaryNeg') ? 'UnaryNeg' : 'Gain';
    return {
      operator: 'negate',
      blockType,
      inputPorts: ['in1'],
      outputPort: 'out',
      defaultParams: blockType === 'Gain' ? { gain: -1 } : undefined
    };
  }

  return null;
}

/**
 * Extracts matched domains and keywords from a natural language request.
 */
export function resolveDomainKeywords(text: string): { domains: string[]; matchedKeywords: string[] } {
  const lower = text.toLowerCase();
  const domains: string[] = [];
  const matchedKeywords: string[] = [];

  for (const [domainName, entry] of Object.entries(XBRIDGES_DOMAIN_VOCABULARY)) {
    let domainMatched = false;
    for (const kw of entry.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) {
        if (!domainMatched) {
          domains.push(domainName);
          domainMatched = true;
        }
        matchedKeywords.push(kw);
      }
    }
  }

  return { domains, matchedKeywords };
}
