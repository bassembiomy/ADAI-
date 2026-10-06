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
  /** Port ids wired to another block (the same list the equation receives as `connectedPorts`); used by the event detector (WP-12b) */
  connectedPorts?: string[];
}

/** One scope input channel: the solver variable of every component of the wired signal. */
export interface ScopeChannelBinding {
  /** 1-based scope channel (in1 = 1) */
  channel: number;
  /** number of components of the wired signal (1 = scalar) */
  width: number;
  /** solver variable per component; -1 = unwired */
  indices: number[];
  /** channel names of a vector signal (`a b c`, `d q 0`), empty for a scalar */
  channelNames: string[];
  /** exact port id of the wired source, when wired */
  sourcePortId?: string;
}

// The fully assembled system
export interface AssembledSystem {
  // Total number of unknowns
  systemSize: number;
  // Variable names for debugging
  variableNames: string[];
  // Which variables are differential states vs algebraic
  isDifferentialState: boolean[];
  /** Variables whose derivative always uses the BDF1 stencil (multibody frame poses: held coordinates and the joints' backward-difference rates assume it). */
  firstOrderOnly?: boolean[];
  // True only for known equations with no internal or across/branch derivatives.
  isPurelyAlgebraic?: boolean;
  // The global residual function
  residuals: (x: number[], dx: number[], ctx: EquationContext) => number[];
  // Node-level Kirchhoff equations (through-variable sum = 0). A vector net (width-N signal, composite three-phase electrical
  // port) has one entry per channel: `channel` is the 0-based channel (absent on scalar nets).
  kirchhoffNodes: { nodeId: string; throughIndices: number[]; signs: number[]; channel?: number }[];
  // Component equations
  components: ComponentEquation[];
  // Scope output mapping: scopeNodeId -> variable index per scope channel (-1 = unwired channel, or a vector channel: those are
  // listed with all their components in `scopeChannels`, never reduced to their first component).
  scopeOutputs: Map<string, number[]>;
  // Scope channels with their width (WP-09c): scopeNodeId -> one binding per scope channel in1, in2, ...
  scopeChannels?: Map<string, ScopeChannelBinding[]>;
  // Which block owns each unknown and each residual row (diagnostics of the structural rank check)
  structure?: {
    variableOwners: { blockId: string; blockType: string }[];
    rowOwners: { blockId: string; blockType: string }[];
    /** unknowns that are indeterminate by design (e.g. reaction of a constraint wired to one frame twice) */
    exemptVariables?: number[];
    /** connected Electrical networks without any reference (F-064); reported before the solve */
    floatingElectricalNetworks?: { blocks: { blockId: string; blockType: string }[] }[];
    /** connected Rotational / Translational networks without a reference, inertia or mass (WP-13, F-064); reported before the solve */
    floatingMechanicalNetworks?: { blocks: { blockId: string; blockType: string }[] }[];
    /** ports of an ideal torque / force source that are open (WP-13); reported before the solve */
    openSourcePorts?: { blockId: string; blockType: string; portId: string }[];
    /** connected Thermal networks without a Thermal Reference, Thermal Mass or Temperature Source (WP-15, F-011/F-064) */
    floatingThermalNetworks?: { blocks: { blockId: string; blockType: string }[] }[];
    /** connected Magnetic networks without a Magnetic Reference (WP-15, F-064) */
    floatingMagneticNetworks?: { blocks: { blockId: string; blockType: string }[] }[];  };
}
