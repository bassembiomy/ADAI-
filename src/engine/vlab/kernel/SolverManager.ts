import {
  PhysicalSystemIR,
  SimulationJob,
  SimulationResult,
  SimulationRuntimeJob,
  SimulationRuntimeStepResult,
  SolverConfiguration,
  SolverConfigurationValidationResult,
  SolverStatistics,
  SolverType,
  validateSolverConfiguration
} from './types';
import { SystemAnalyzer, SolverRecommendation } from './SystemAnalyzer';
import { ISolver, SolverState } from './solvers/ISolver';
import { EulerSolver } from './solvers/EulerSolver';
import { RK4Solver } from './solvers/RK4Solver';
import { AdaptiveRKSolver } from './solvers/AdaptiveRKSolver';
import { BDFSolver } from './solvers/BDFSolver';

const DEFAULT_STEP = 0.001;
const DEFAULT_MINIMUM_STEP = 1e-6;
const DEFAULT_MAXIMUM_STEP = 0.1;
const TIME_EPSILON = 1e-12;

const cloneConfiguration = (config: SolverConfiguration): SolverConfiguration => ({ ...config });

class RuntimeSimulationJob implements SimulationRuntimeJob {
  private configuration: SolverConfiguration;
  private solverType: Exclude<SolverType, 'auto'>;
  private solver: ISolver;
  private state: SolverState;
  private suggestedStep: number;
  private readonly startedAt = performance.now();
  private readonly initialTime: number;
  private readonly resultId = `sim_${Date.now()}`;
  private readonly timeHistory: number[];
  private readonly stateHistory: Record<string, number[]> = {};
  private readonly algebraicHistory: Record<string, number[]> = {};
  private readonly outputHistory: Record<string, number[]> = {};
  private acceptedSteps = 0;
  private rejectedSteps = 0;
  private totalIterations = 0;
  private maxResidual = 0;
  private minStepUsed = Infinity;
  private maxStepUsed = 0;
  private functionEvaluations = 0;
  private jacobianEvaluations = 0;

  constructor(
    private readonly manager: SolverManager,
    private readonly job: SimulationJob,
    private readonly onProgress?: (progress: number) => void
  ) {
    const validation = validateSolverConfiguration(job.solverConfiguration);
    if (!validation.valid) throw new TypeError(`Invalid solver configuration: ${validation.errors.join('; ')}`);

    this.configuration = cloneConfiguration(job.solverConfiguration);
    this.solverType = manager.resolveSolverType(job.system, this.configuration);
    this.solver = manager.createSolver(this.solverType);
    this.state = this.solver.initialize(job.compiledSystem, this.configuration, manager.createInitialConditions(job));
    this.initialTime = this.state.t;
    this.suggestedStep = this.initialStepFor(this.configuration);
    this.timeHistory = [this.state.t];
    this.recordCurrentValues();
  }

  get id(): string {
    return this.job.id;
  }

  getConfiguration(): SolverConfiguration {
    return cloneConfiguration(this.configuration);
  }

  updateConfiguration(config: SolverConfiguration): SolverConfigurationValidationResult {
    const validation = validateSolverConfiguration(config);
    if (!validation.valid) return validation;

    const nextConfiguration = cloneConfiguration(config);
    const nextSolverType = this.manager.resolveSolverType(this.job.system, nextConfiguration);

    // Validation completed before any mutable runtime state changes.
    this.configuration = nextConfiguration;
    this.state.config = this.configuration;
    this.suggestedStep = this.initialStepFor(this.configuration);

    if (nextSolverType !== this.solverType) {
      this.solver.terminate();
      this.solverType = nextSolverType;
      this.solver = this.manager.createSolver(nextSolverType);
    }
    this.solver.reconfigure?.(this.state, this.configuration);

    return validation;
  }

  step(): SimulationRuntimeStepResult {
    if (this.isComplete()) return this.completeStepResult();

    // This is the configuration boundary: state.config is replaced before a
    // solver sees the next step, never while it is calculating a step.
    this.state.config = this.configuration;
    const dt = Math.min(this.clampStep(this.suggestedStep), this.configuration.stopTime - this.state.t);
    const result = this.solver.step(this.state, dt);
    this.totalIterations += result.iterations;
    this.maxResidual = Math.max(this.maxResidual, result.residual);
    this.functionEvaluations += Math.max(1, result.iterations);
    if (this.solverType === 'bdf' || this.solverType === 'dae_implicit') this.jacobianEvaluations += result.iterations;

    if (result.accepted) {
      this.commitAcceptedStep(result.t, result.x, result.dx, result.z, result.dt);
      this.acceptedSteps++;
      this.updateSuggestedStepAfterAcceptance(result.dt, result.lte, result.iterations);
      this.onProgress?.(this.configuration.stopTime === 0 ? 1 : this.state.t / this.configuration.stopTime);
    } else {
      this.rejectedSteps++;
      this.suggestedStep = this.clampStep(result.dt * 0.5);
    }

    return {
      time: this.state.t,
      dt: result.dt,
      accepted: result.accepted,
      complete: this.isComplete(),
      lte: result.lte,
      iterations: result.iterations,
      residual: result.residual
    };
  }

  runToCompletion(): SimulationResult {
    while (!this.isComplete()) {
      const boundary = this.step();
      if (!boundary.accepted && this.isAtMinimumStep(boundary.dt)) {
        // Preserve the legacy solvers' escape hatch for a tolerance that can
        // no longer be met at the configured minimum step.
        this.commitAcceptedStep(
          Math.min(this.configuration.stopTime, this.state.t + boundary.dt),
          this.state.x,
          this.state.dx,
          this.state.z,
          boundary.dt
        );
      }
    }
    return this.getResult();
  }

  getResult(): SimulationResult {
    return {
      jobId: this.resultId,
      status: this.isComplete() ? 'SUCCESS' : 'WARNING',
      time: [...this.timeHistory],
      states: this.cloneHistory(this.stateHistory),
      algebraicVariables: this.cloneHistory(this.algebraicHistory),
      outputs: this.cloneHistory(this.outputHistory),
      solverStatistics: this.statistics(),
      diagnostics: []
    };
  }

  private initialStepFor(config: SolverConfiguration): number {
    return this.clampStep(typeof config.initialStep === 'number' ? config.initialStep : DEFAULT_STEP, config);
  }

  private clampStep(step: number, config = this.configuration): number {
    const minimum = typeof config.minimumStep === 'number' ? config.minimumStep : DEFAULT_MINIMUM_STEP;
    const maximum = typeof config.maximumStep === 'number' ? config.maximumStep : DEFAULT_MAXIMUM_STEP;
    return Math.min(maximum, Math.max(minimum, step));
  }

  private isComplete(): boolean {
    return this.state.t >= this.configuration.stopTime - TIME_EPSILON;
  }

  private isAtMinimumStep(dt: number): boolean {
    const minimum = typeof this.configuration.minimumStep === 'number' ? this.configuration.minimumStep : DEFAULT_MINIMUM_STEP;
    return dt <= minimum + TIME_EPSILON;
  }

  private commitAcceptedStep(t: number, x: Float64Array, dx: Float64Array, z: Float64Array, dt: number): void {
    const previousState = new Float64Array(this.state.x);
    this.state.prevPrevStates = this.state.prevStates ? new Float64Array(this.state.prevStates) : undefined;
    this.state.prevStates = previousState;
    this.state.prevDt = dt;
    this.state.t = t;
    this.state.x = new Float64Array(x);
    this.state.dx = new Float64Array(dx);
    this.state.z = new Float64Array(z);
    this.timeHistory.push(this.state.t);
    this.recordCurrentValues();
    this.minStepUsed = Math.min(this.minStepUsed, dt);
    this.maxStepUsed = Math.max(this.maxStepUsed, dt);
  }

  private recordCurrentValues(): void {
    this.state.system.variableNames.slice(0, this.state.system.stateCount).forEach((name, index) => {
      (this.stateHistory[name] ??= []).push(this.state.x[index]);
    });
    this.state.system.variableNames.slice(this.state.system.stateCount).forEach((name, index) => {
      (this.algebraicHistory[name] ??= []).push(this.state.z[index]);
    });
  }

  private updateSuggestedStepAfterAcceptance(dt: number, lte: number, iterations: number): void {
    if (this.solverType === 'rk_adaptive') {
      const factor = lte > 0 ? 0.9 * Math.pow(1 / lte, 0.2) : 1.5;
      this.suggestedStep = this.clampStep(dt * Math.min(2, Math.max(0.5, factor)));
      return;
    }
    if ((this.solverType === 'bdf' || this.solverType === 'dae_implicit') && iterations <= 3) {
      this.suggestedStep = this.clampStep(dt * 1.5);
      return;
    }
    this.suggestedStep = this.initialStepFor(this.configuration);
  }

  private completeStepResult(): SimulationRuntimeStepResult {
    return { time: this.state.t, dt: 0, accepted: false, complete: true, lte: 0, iterations: 0, residual: 0 };
  }

  private cloneHistory(history: Record<string, number[]>): Record<string, number[]> {
    return Object.fromEntries(Object.entries(history).map(([name, values]) => [name, [...values]]));
  }

  private statistics(): SolverStatistics {
    return {
      simulationTime: this.state.t - this.initialTime,
      cpuTimeMs: performance.now() - this.startedAt,
      acceptedSteps: this.acceptedSteps,
      rejectedSteps: this.rejectedSteps,
      newtonIterations: this.totalIterations,
      maxResidual: this.maxResidual,
      minStepUsed: this.minStepUsed === Infinity ? 0 : this.minStepUsed,
      maxStepUsed: this.maxStepUsed,
      functionEvaluations: this.functionEvaluations,
      jacobianEvaluations: this.jacobianEvaluations,
      convergenceStatus: 'CONVERGED'
    };
  }
}

export class SolverManager {
  private analyzer = new SystemAnalyzer();

  recommendSolver(ir: PhysicalSystemIR): SolverRecommendation {
    return this.analyzer.analyze(ir);
  }

  /** Starts an updateable job. Call step() to provide external step boundaries. */
  createRuntimeJob(job: SimulationJob, onProgress?: (progress: number) => void): SimulationRuntimeJob {
    return new RuntimeSimulationJob(this, job, onProgress);
  }

  /** Backward-compatible synchronous entry point. */
  runJob(job: SimulationJob, onProgress?: (progress: number) => void): SimulationResult {
    return this.createRuntimeJob(job, onProgress).runToCompletion();
  }

  resolveSolverType(system: PhysicalSystemIR, config: SolverConfiguration): Exclude<SolverType, 'auto'> {
    if (config.solver === 'auto') return this.recommendSolver(system).recommended as Exclude<SolverType, 'auto'>;
    return config.solver;
  }

  createSolver(type: Exclude<SolverType, 'auto'>): ISolver {
    switch (type) {
      case 'euler': return new EulerSolver();
      case 'rk4': return new RK4Solver();
      case 'rk_adaptive': return new AdaptiveRKSolver();
      case 'bdf':
      case 'dae_implicit': return new BDFSolver();
    }
    throw new Error(`Unsupported solver type: ${type}`);
  }

  createInitialConditions(job: SimulationJob) {
    return job.system.states.map(state => ({
      variableId: state.name,
      value: state.initialValue ?? 0,
      source: 'user' as const,
      priority: 1
    }));
  }
}
