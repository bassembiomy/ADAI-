// src/engine/vlab/kernel/SolverManager.ts
import { PhysicalSystemIR, SimulationJob, SimulationResult, SolverType } from './types';
import { SystemAnalyzer, SolverRecommendation } from './SystemAnalyzer';
import { ISolver } from './solvers/ISolver';
import { EulerSolver } from './solvers/EulerSolver';
import { RK4Solver } from './solvers/RK4Solver';
import { AdaptiveRKSolver } from './solvers/AdaptiveRKSolver';
import { BDFSolver } from './solvers/BDFSolver';

export class SolverManager {
  private analyzer = new SystemAnalyzer();
  private solvers: Map<SolverType, ISolver> = new Map();

  constructor() {
    this.solvers.set('euler', new EulerSolver());
    this.solvers.set('rk4', new RK4Solver());
    this.solvers.set('rk_adaptive', new AdaptiveRKSolver());
    this.solvers.set('bdf', new BDFSolver());
    this.solvers.set('dae_implicit', new BDFSolver());
  }

  recommendSolver(ir: PhysicalSystemIR): SolverRecommendation {
    return this.analyzer.analyze(ir);
  }

  runJob(job: SimulationJob, onProgress?: (progress: number) => void): SimulationResult {
    let solverType = job.solverConfiguration.solver;
    if (solverType === 'auto') {
      const rec = this.recommendSolver(job.system);
      solverType = rec.recommended;
    }

    const solver = this.solvers.get(solverType) || this.solvers.get('bdf')!;
    const initialConditions = job.system.states.map(s => ({
      variableId: s.name,
      value: s.initialValue ?? 0,
      source: 'user' as const,
      priority: 1
    }));

    const state = solver.initialize(job.compiledSystem, job.solverConfiguration, initialConditions);
    return solver.solve(state, job.solverConfiguration, onProgress);
  }
}
