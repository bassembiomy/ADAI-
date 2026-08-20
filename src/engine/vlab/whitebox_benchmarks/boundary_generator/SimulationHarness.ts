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

    for (let step = 0; step < totalSteps; step++) {
      state = engine.simulateStep(boundary.nodes, boundary.edges, state, boundary.dt);
      const currentTime = (step + 1) * boundary.dt;
      time.push(currentTime);

      boundary.probes.forEach((probe) => {
        let val = 0;
        let found = false;

        // 1. Check scopeValues
        if (state?.scopeValues !== undefined && state?.scopeValues !== null) {
          if (typeof state.scopeValues === 'number') {
            val = state.scopeValues;
            found = true;
          } else if (typeof state.scopeValues === 'object') {
            if (probe.variableName in state.scopeValues) {
              val = Number(state.scopeValues[probe.variableName]);
              found = true;
            } else if (probe.sourceNodeId in state.scopeValues) {
              val = Number(state.scopeValues[probe.sourceNodeId]);
              found = true;
            } else if ('value' in state.scopeValues) {
              val = Number(state.scopeValues.value);
              found = true;
            }
          }
        }

        // 2. Check currentSystem variable names & state.x
        if (!found && state?.x && (engine as any)['currentSystem']) {
          const sys = (engine as any)['currentSystem'];
          const varIdx = sys.variableNames.findIndex(
            (name: string) =>
              name.includes(probe.variableName) ||
              name.includes(probe.sourceNodeId) ||
              (probe.sourceHandle && name.includes(probe.sourceHandle))
          );
          if (varIdx !== -1) {
            val = state.x[varIdx];
            found = true;
          }
        }

        signals[probe.variableName].push(Number.isFinite(val) ? val : 0);
      });
    }

    return { time, signals, finalState: state };
  }
}
