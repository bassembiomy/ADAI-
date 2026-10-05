import type { Node } from '@xyflow/react';
import { VLabPhysicsEngine } from '../../vlabPhysics';
import { VLabTestBoundary, VLabProbe, SimulationTrajectory } from './types';
import { blockTypeOf, libraryBlock, portIdFromHandle } from '../../vlabConnectionRules';
import { ScopeReadError, scalarSample } from '../../vlabScopeRead';

/**
 * Index of the solved variable a probe reads, or -1 when it resolves to none.
 *  1. the exact engine variable name
 *  2. the signal branch of the EXACT port the handle points at (F-048): the handle goes through the same portIdFromHandle
 *     path as the assembler and the scope, so a port that really ends in `_s` / `_t` (pmsm_foc.vdc_s, iabc_s, w_s,
 *     th_s) is never mis-stripped; the legacy `<port>_s|_t` suffix is only dropped when the exact id does not exist.
 *     A measurable output with no branch throws: it must not fall through to "some other variable of the block".
 *  3-5. block-level fallbacks (first branch, first state, across potential) for probes on conserving ports.
 */
export function resolveProbeVariableIndex(nodes: Pick<Node, 'id' | 'data' | 'type'>[], probe: VLabProbe, variableNames: readonly string[]): number {
  let varIdx = variableNames.findIndex(name => name === (probe.engineVariable ?? probe.variableName));

  if (varIdx === -1 && probe.sourceHandle) {
    const node = nodes.find(n => n.id === probe.sourceNodeId);
    const portId = node ? portIdFromHandle(node as any, probe.sourceHandle) : undefined;
    if (portId) {
      varIdx = variableNames.findIndex(
        name => name === `${probe.sourceNodeId}_branch_signal_${portId}` || name === `${probe.sourceNodeId}_branch_${portId}`
      );
      const libPort = node ? libraryBlock(blockTypeOf(node as any))?.ports.find(p => p.id === portId) : undefined;
      if (varIdx === -1 && libPort?.direction === 'out') {
        throw new ScopeReadError({
          code: 'out-of-range', scopeId: probe.sourceNodeId, channel: 1, variable: `${probe.sourceNodeId}.${portId}`,
          reason: `probe "${probe.variableName}": signal output ${probe.sourceNodeId}.${portId} has no signal branch in the assembled system`,
        });
      }
    }
  }
  if (varIdx === -1) varIdx = variableNames.findIndex(name => name.startsWith(`${probe.sourceNodeId}_branch_`));
  if (varIdx === -1) varIdx = variableNames.findIndex(name => name.startsWith(`${probe.sourceNodeId}_state_`));
  if (varIdx === -1) varIdx = variableNames.findIndex(name => name.includes(`Across_${probe.sourceNodeId}_`));
  return varIdx;
}

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
        let val: unknown = undefined;
        let found = false;
        let variable: string | undefined;

        if (state?.x && sys?.variableNames) {
          const varIdx = resolveProbeVariableIndex(boundary.nodes, probe, sys.variableNames);
          if (varIdx !== -1) {
            val = state.x[varIdx];
            variable = sys.variableNames[varIdx];
            found = true;
          }
        }

        // A probe on a Scope reads that scope's own value (by variable name, else its first channel): never the first
        // scope's value for an unrelated probe.
        if (!found && state?.perScopeValues) {
          const src = boundary.nodes.find((n) => n.id === probe.sourceNodeId);
          const sv = src && blockTypeOf(src as any) === 'scope' ? state.perScopeValues[probe.sourceNodeId] : undefined;
          if (typeof sv === 'number') {
            val = sv;
            found = true;
          } else if (sv && typeof sv === 'object') {
            const key = [probe.variableName, 'in1', 'value'].find((k) => k in sv);
            if (key !== undefined) {
              val = sv[key];
              found = true;
            }
          }
        }
        // The sample is a finite scalar or the harness throws: never Number(vector), never a silent 0 (F-045).
        if (!found) {
          throw new ScopeReadError({
            code: 'out-of-range', scopeId: probe.sourceNodeId, channel: 1, variable: probe.variableName,
            reason: `probe "${probe.variableName}" (${probe.sourceNodeId}${probe.sourceHandle ? `.${probe.sourceHandle}` : ''}) resolves to no solved variable or scope value`,
          });
        }
        signals[probe.variableName].push(scalarSample(val, { scopeId: probe.sourceNodeId, channel: 1, variable: variable ?? probe.variableName }));
      });
    }

    return { time, signals, finalState: state };
  }
}
