import type { SemanticModel, SemanticState } from './smSemanticModel';

/**
 * Multi-rate X-Bridges states ('separate-task' execution). Shared by the generator, the
 * interpreter and the differential harness so that the schedule has one definition.
 */

/** The separate-task X-Bridges states of a chart, in the generator's deterministic state order. */
export const separateTaskStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states)
    .filter((state) => state.xBridges !== null && state.xBridges.solver.execution === 'separate-task')
    .sort((left, right) =>
      left.activityIndex - right.activityIndex || left.id.localeCompare(right.id));

/** The shared fast-task step of a chart, or null when it has no separate-task state. */
export const separateTaskTiming = (
  ir: SemanticModel,
): { readonly periodUs: number; readonly stepsPerTick: number; readonly stepSeconds: number } | null => {
  const states = separateTaskStates(ir);
  if (states.length === 0) return null;
  const solver = states[0].xBridges!.solver;
  return {
    stepSeconds: solver.stepSeconds,
    periodUs: Math.round(solver.stepSeconds * 1_000_000),
    stepsPerTick: solver.substepsPerTick,
  };
};
