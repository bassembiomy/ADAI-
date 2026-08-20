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

      const sys = (engine as any)['currentSystem'];

      boundary.probes.forEach((probe) => {
        let val = 0;
        let found = false;

        // 1. Check exact variable name in system.variableNames
        if (state?.x && sys?.variableNames) {
          let varIdx = sys.variableNames.findIndex((name: string) => name === probe.variableName);

          // 2. Check signal branch for the specific port handle
          if (varIdx === -1 && probe.sourceHandle) {
            const cleanHandle = probe.sourceHandle.replace(/_[st]$/, '');
            varIdx = sys.variableNames.findIndex(
              (name: string) => name === `${probe.sourceNodeId}_branch_signal_${cleanHandle}`
            );
          }

          // 3. Check general branch output
          if (varIdx === -1) {
            varIdx = sys.variableNames.findIndex((name: string) =>
              name.startsWith(`${probe.sourceNodeId}_branch_`)
            );
          }

          // 4. Check state variable
          if (varIdx === -1) {
            varIdx = sys.variableNames.findIndex((name: string) =>
              name.startsWith(`${probe.sourceNodeId}_state_`)
            );
          }

          // 5. Check across potential
          if (varIdx === -1) {
            varIdx = sys.variableNames.findIndex((name: string) =>
              name.includes(`Across_${probe.sourceNodeId}_`)
            );
          }

          if (varIdx !== -1) {
            val = state.x[varIdx];
            found = true;
          }
        }

        // 2. Check scopeValues if not resolved directly
        if (!found && state?.scopeValues !== undefined && state?.scopeValues !== null) {
          if (typeof state.scopeValues === 'object') {
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
          } else if (typeof state.scopeValues === 'number') {
            val = state.scopeValues;
            found = true;
          }
        }

        signals[probe.variableName].push(Number.isFinite(val) ? val : 0);
      });
    }

    return { time, signals, finalState: state };
  }
}
