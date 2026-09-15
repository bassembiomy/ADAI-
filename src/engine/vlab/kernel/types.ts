// src/engine/vlab/kernel/types.ts

export type PhysicalDomain =
  | 'electrical'
  | 'rotational'
  | 'translational'
  | 'thermal'
  | 'fluid'
  | 'gas'
  | 'isothermal_liquid';

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

export interface SolverConfigurationValidationResult {
  valid: boolean;
  errors: string[];
}

const solverTypes: SolverType[] = ['auto', 'euler', 'rk4', 'rk_adaptive', 'bdf', 'dae_implicit'];

/**
 * Guards the solver boundary against malformed persisted or external configuration.
 * Callers retain invalid values for correction; they are never handed to a solver.
 */
export function validateSolverConfiguration(config: unknown): SolverConfigurationValidationResult {
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['solver configuration must be an object'] };
  }

  const candidate = config as Partial<SolverConfiguration>;
  const errors: string[] = [];
  const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  const positiveNumberOrAuto = (value: unknown) => value === 'auto' || (finiteNumber(value) && value > 0);

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) errors.push('id must be a non-empty string');
  if (!solverTypes.includes(candidate.solver as SolverType)) errors.push('solver must be a supported solver type');
  if (!finiteNumber(candidate.startTime)) errors.push('startTime must be a finite number');
  if (!finiteNumber(candidate.stopTime)) errors.push('stopTime must be a finite number');
  if (finiteNumber(candidate.startTime) && finiteNumber(candidate.stopTime) && candidate.stopTime < candidate.startTime) {
    errors.push('stopTime must be greater than or equal to startTime');
  }

  for (const field of ['initialStep', 'minimumStep', 'maximumStep'] as const) {
    if (!positiveNumberOrAuto(candidate[field])) errors.push(`${field} must be a finite positive number or auto`);
  }
  if (typeof candidate.minimumStep === 'number' && typeof candidate.maximumStep === 'number' && candidate.minimumStep > candidate.maximumStep) {
    errors.push('minimumStep must not exceed maximumStep');
  }

  for (const field of ['relativeTolerance', 'absoluteTolerance', 'nonlinearTolerance'] as const) {
    if (!finiteNumber(candidate[field]) || candidate[field]! <= 0) errors.push(`${field} must be a finite positive number`);
  }
  if (!Number.isSafeInteger(candidate.maximumIterations) || candidate.maximumIterations! <= 0) {
    errors.push('maximumIterations must be a positive safe integer');
  }
  for (const field of ['enableDiagnostics', 'enableLogging'] as const) {
    if (typeof candidate[field] !== 'boolean') errors.push(`${field} must be a boolean`);
  }

  return { valid: errors.length === 0, errors };
}

export interface SimulationJob {
  id: string;
  networkId: string;
  system: PhysicalSystemIR;
  compiledSystem: CompiledPhysicalSystem;
  solverConfiguration: SolverConfiguration;
}

export interface SimulationRuntimeStepResult {
  time: number;
  dt: number;
  accepted: boolean;
  complete: boolean;
  lte: number;
  iterations: number;
  residual: number;
}

/** A mutable, boundary-stepped simulation job owned by SolverManager. */
export interface SimulationRuntimeJob {
  readonly id: string;
  getConfiguration(): SolverConfiguration;
  updateConfiguration(config: SolverConfiguration): SolverConfigurationValidationResult;
  step(): SimulationRuntimeStepResult;
  getResult(): SimulationResult;
  runToCompletion(): SimulationResult;
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
