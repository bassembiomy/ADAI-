// src/engine/vlab/kernel/solvers/ISolver.ts
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult } from '../types';

export interface SolverState {
  t: number;
  x: Float64Array;
  dx: Float64Array;
  z: Float64Array;
  prevStates?: Float64Array;
  prevPrevStates?: Float64Array;
  prevDt?: number;
  system: CompiledPhysicalSystem;
  config: SolverConfiguration;
}

export interface SolverStepResult {
  t: number;
  dt: number;
  x: Float64Array;
  dx: Float64Array;
  z: Float64Array;
  accepted: boolean;
  lte: number;
  iterations: number;
  residual: number;
}

export interface ISolver {
  readonly id: string;
  readonly name: string;
  readonly supportsDAE: boolean;

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState;

  step(
    state: SolverState,
    targetDt: number
  ): SolverStepResult;

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult;

  /**
   * Invoked by SolverManager only between accepted solver boundaries. Solvers
   * with cached configuration-dependent data may refresh it here without
   * replacing the state or its recorded output history.
   */
  reconfigure?(state: SolverState, config: SolverConfiguration): void;

  terminate(): void;
}
