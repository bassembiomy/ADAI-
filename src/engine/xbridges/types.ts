// src/engine/xbridges/types.ts

// --- Value Types ---
export type XScalar = number | boolean;
export type XVector = number[] | boolean[];
export type XMatrix = number[][] | boolean[][];
export type XValue = XScalar | XVector | XMatrix;

// --- Signal Types ---
export type XSignalType = 'continuous' | 'discrete' | 'logical' | 'vector' | 'matrix' | 'bit_array' | 'power' | 'measurement' | 'transform' | 'auto';

export interface XPort {
  id: string;
  name: string;
  type: XSignalType;
  direction: 'input' | 'output';
  position?: 'left' | 'right' | 'top' | 'bottom'; // NEW: For specialized layout (Clock on top, etc)
  value: XValue;
  dimensions?: number[]; // [length] for vector, [rows, cols] for matrix. Empty/undefined for scalar.
  inferredType?: string; // For UI display in properties panel
  dataType?: string;
  unit?: string;
  sampleRate?: number;
  frame?: string;
}

export interface XBlock {
  id: string;
  type: string;
  label?: string; // Optional user-defined name
  parentId?: string; // NEW: For hierarchical subsystems ('root' or subsystem ID)
  params: Record<string, any>;
  inputs: XPort[];
  outputs: XPort[];
  state?: any; // For blocks with memory (integrators, unit delays, flip-flops)
  isStateful?: boolean; // NEW: Indicates if the block breaks algebraic loops
  allowDynamicInputs?: boolean; // Can the user add more inputs? (e.g. Sum, Mul, Concat)
  equation?: string; // For Help Center documentation
  icon?: string; // For Help Center documentation
  description?: string; // For Help Center documentation
  
  // The execute function now handles arrays and matrices
  // It receives an array of input values, the block's parameters, the block's state, and current simulation time
  execute: (inputs: XValue[], params: Record<string, any>, state: any, time: number) => { 
    outputs: XValue[]; 
    nextState?: any; 
    error?: string; // Runtime error propagation
  };

  // Optional: For continuous-time blocks (like Integrators), this returns the state derivative (dx/dt)
  // This is required for solvers like ODE1 and ODE4.
  evaluateDerivatives?: (inputs: XValue[], params: Record<string, any>, state: any, time: number) => any;
}


export interface XModel {
  blocks: XBlock[];
  connections: { sourceBlock: string; sourcePort: string; targetBlock: string; targetPort: string }[];
}

export interface SolverOptions {
  solver: 'euler' | 'rk4' | 'ode4' | 'ode45' | 'fixedStep';
  fixedStep?: number; // e.g. 0.01 for RK4/Euler
  startTime: number;
  stopTime: number;
  maxStep?: number;
  minStep?: number;
  tolerance?: number;
  relTol?: number;
  absTol?: number;
}

export interface ModelDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  blockIds?: string[];
}

