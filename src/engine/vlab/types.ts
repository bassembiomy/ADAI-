export const PHYSICAL_DOMAINS = [
  'electrical',
  'rotational',
  'translational',
  'thermal',
  'magnetic',
  'gas',
  'fluid',
  'isothermal_liquid',
  'physical',
  'multibody',
  'frame',
  'multibodyframe',
] as const;

export type PhysicalDomain = (typeof PHYSICAL_DOMAINS)[number];

export interface EquationContext {
  dt: number;
  time: number;
  parameters: Record<string, any>;
  prevStates: number[];
  prevPrevStates?: number[]; // State vector from k-1 for BDF-2
  prevDt?: number;           // Step size from k-1 for BDF-2
  order?: number;            // Current BDF order (1 or 2)
  states: number[];          // current differential state vector
  stateDerivatives: number[]; // dx/dt for each state
}

// Represents a single node (connection point) in the physical network
export interface PhysicalNode {
  id: string;
  domain: PhysicalDomain;
  acrossVarIndex: number;  // index into solution vector x[]
}

// Represents one component's contribution to the system
export interface ComponentEquation {
  blockId: string;
  blockType: string;
  // Port-to-node mapping: portId -> physicalNodeId (e.g. "p1" -> "node_0")
  portNodeMap: Map<string, string>;
  // Parameter values extracted from the ReactFlow node
  params: Record<string, any>;
  // Indices of any internal state variables (for diff. equations)
  stateIndices: number[];
  // The residual function for this component
  residual: (x: number[], dx: number[], ctx: EquationContext) => number[];
  // Number of equations this component contributes
  equationCount: number;
}

// The fully assembled system
export interface AssembledSystem {
  // Total number of unknowns
  systemSize: number;
  // Variable names for debugging
  variableNames: string[];
  // Which variables are differential states vs algebraic
  isDifferentialState: boolean[];
  // The global residual function
  residuals: (x: number[], dx: number[], ctx: EquationContext) => number[];
  // Node-level Kirchhoff equations (through-variable sum = 0)
  kirchhoffNodes: { nodeId: string; throughIndices: number[]; signs: number[] }[];
  // Component equations
  components: ComponentEquation[];
  // Scope output mapping: scopeNodeId -> variable index
  scopeOutputs: Map<string, number[]>;
}
