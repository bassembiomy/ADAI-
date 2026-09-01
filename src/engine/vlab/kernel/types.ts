// src/engine/vlab/kernel/types.ts

export type PhysicalDomain =
  | 'electrical'
  | 'rotational'
  | 'translational'
  | 'thermal'
  | 'fluid'
  | 'gas';

export type VariableRole = 'across' | 'through' | 'state' | 'algebraic' | 'input' | 'output';

export interface PhysicalVariable {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  role: VariableRole;
  value?: number;
}

export interface PhysicalPort {
  id: string;
  name: string;
  domain: PhysicalDomain;
  variables: PhysicalVariable[];
  nodeId?: string;
  reference?: {
    required: boolean;
    value?: number;
  };
}

export interface PhysicalNode {
  id: string;
  domain: PhysicalDomain;
  portIds: string[];
  reference?: boolean;
  referenceValue?: number;
}

export interface PhysicalConnection {
  id: string;
  fromPortId: string;
  toPortId: string;
  nodeId: string;
}

export interface Parameter {
  id: string;
  name: string;
  value: number;
  unit?: string;
  componentId: string;
  min?: number;
  max?: number;
  tunable?: boolean;
}

export interface StateVariable {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  initialValue?: number;
  derivativeVariableId?: string;
  sourceComponentId: string;
  preferred: boolean;
}

export interface AlgebraicVariable {
  id: string;
  name: string;
  symbol: string;
  unit: string;
  sourceComponentId?: string;
  sourceNodeId?: string;
}

export interface IRComponent {
  id: string;
  type: string;
  name: string;
  ports: PhysicalPort[];
  parameters: Parameter[];
  sourceModelNodeId?: string;
}

export type EquationType =
  | 'constitutive'
  | 'conservation'
  | 'connection'
  | 'reference'
  | 'initial_condition'
  | 'constraint';

export interface Equation {
  id: string;
  expression: string;
  type: EquationType;
  componentIds: string[];
  variableIds: string[];
  domain: PhysicalDomain;
  residualForm: string;
}

export interface SolverContext {
  t: number;
  dt: number;
  order?: number;
  prevStates?: Float64Array;
  prevPrevStates?: Float64Array;
  prevDt?: number;
  parameters: Record<string, number>;
  inputs: Record<string, number>;
}

export interface CompiledPhysicalSystem {
  id: string;
  domains: PhysicalDomain[];
  stateCount: number;
  algebraicCount: number;
  totalSize: number;
  isDifferentialState: boolean[];
  variableNames: string[];
  residual: (
    t: number,
    x: Float64Array,
    dx: Float64Array,
    z: Float64Array,
    ctx: SolverContext,
    out: Float64Array
  ) => void;
  jacobian?: (
    t: number,
    x: Float64Array,
    dx: Float64Array,
    z: Float64Array,
    ctx: SolverContext,
    out: Float64Array
  ) => void;
}

export interface PhysicalNetwork {
  id: string;
  domains: PhysicalDomain[];
  componentIds: string[];
  portIds: string[];
  nodeIds: string[];
  referenceNodeIds: string[];
  connections: PhysicalConnection[];
  solverConfigurationId?: string;
  topologyHash: string;
}

export interface PhysicalSystemIR {
  id: string;
  domains: PhysicalDomain[];
  components: IRComponent[];
  nodes: PhysicalNode[];
  states: StateVariable[];
  algebraicVariables: AlgebraicVariable[];
  parameters: Parameter[];
  equations: Equation[];
  connections: PhysicalConnection[];
  references: PhysicalNode[];
  metadata: {
    nodeCount: number;
    stateCount: number;
    algebraicCount: number;
    hasNonlinearities: boolean;
    isStiff: boolean;
    isDAE: boolean;
  };
}

export type SolverType = 'auto' | 'euler' | 'rk4' | 'rk_adaptive' | 'bdf' | 'dae_implicit';

export interface SolverConfiguration {
  id: string;
  solver: SolverType;
  startTime: number;
  stopTime: number;
  initialStep: number | 'auto';
  minimumStep: number | 'auto';
  maximumStep: number | 'auto';
  relativeTolerance: number;
  absoluteTolerance: number;
  maximumIterations: number;
  nonlinearTolerance: number;
  enableDiagnostics: boolean;
  enableLogging: boolean;
}

export interface SimulationJob {
  id: string;
  networkId: string;
  system: PhysicalSystemIR;
  compiledSystem: CompiledPhysicalSystem;
  solverConfiguration: SolverConfiguration;
}

export interface InitialCondition {
  variableId: string;
  value?: number;
  source: 'user' | 'default' | 'computed' | 'solver';
  priority: number;
}

export interface Diagnostic {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  componentIds?: string[];
  networkId?: string;
  timestamp?: number;
  suggestedAction?: string;
}

export interface SolverStatistics {
  simulationTime: number;
  cpuTimeMs: number;
  acceptedSteps: number;
  rejectedSteps: number;
  newtonIterations: number;
  maxResidual: number;
  minStepUsed: number;
  maxStepUsed: number;
  functionEvaluations: number;
  jacobianEvaluations: number;
  convergenceStatus: 'CONVERGED' | 'WARNING' | 'FAILED';
}

export interface SimulationResult {
  jobId: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED' | 'CANCELLED';
  time: number[];
  states: Record<string, number[]>;
  algebraicVariables: Record<string, number[]>;
  outputs: Record<string, number[]>;
  solverStatistics: SolverStatistics;
  diagnostics: Diagnostic[];
}
