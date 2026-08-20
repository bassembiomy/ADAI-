import { VLabPhysicsEngine } from '../../vlabPhysics';
import { VLabTestBoundary, SimulationTrajectory } from './types';

export class SimulationHarness {
  static runBoundarySimulation(boundary: VLabTestBoundary): SimulationTrajectory {
    const engine = new VLabPhysicsEngine();
    let state: any = null;
    const time: number[] = [];
    const signals: Record<string, number[]> = {};

    boundary.probes.forEach((p) => {
      signals[p.variableName] = [];
    });

    const totalSteps = Math.round(boundary.totalTime / boundary.dt);

    for (let step = 0; step <= totalSteps; step++) {
      const currentTime = step * boundary.dt;
      time.push(currentTime);

      state = engine.simulateStep(boundary.nodes, boundary.edges, state, boundary.dt);

      boundary.probes.forEach((probe) => {
        let val = 0;
        if (state?.scopeValues !== undefined) {
          if (typeof state.scopeValues === 'number') {
            val = state.scopeValues;
          } else if (state.scopeValues && typeof state.scopeValues === 'object') {
            val =
              (state.scopeValues as any)[probe.variableName] ??
              (state.scopeValues as any)[probe.sourceNodeId] ??
              (state.scopeValues as any).value ??
              0;
          }
        }
        signals[probe.variableName].push(Number.isFinite(val) ? val : 0);
      });
    }

    return { time, signals, finalState: state };
  }
}
