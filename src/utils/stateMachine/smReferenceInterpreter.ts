import type { SemanticModel } from './smSemanticModel';

export interface SMVerificationVector {
  tick?: number;
  deltaMs: number;
  inputs?: Record<string, any>;
  events?: string[];
}

export interface SMTraceStep {
  tick: number;
  activeStates: string[];
  transitionIds: string[];
  exitActions: string[];
  transitionActions: string[];
  entryActions: string[];
  consumedEvents: string[];
  emittedEvents: string[];
  variables: Record<string, number | boolean>;
  timers: Record<string, number>;
  error: string;
}

export function runReferenceInterpreter(
  ir: SemanticModel,
  vectors: number | SMVerificationVector[]
): SMTraceStep[] {
  const vectorList: SMVerificationVector[] = typeof vectors === 'number'
    ? Array.from({ length: vectors }, (_, i) => ({ tick: i + 1, deltaMs: 100, inputs: {}, events: [] }))
    : vectors;

  const stateKeys = Object.keys(ir.states);
  let activeStateId = stateKeys.length > 0 ? stateKeys[0] : '';
  const activeState = ir.states[activeStateId];
  const initialEnumName = activeState ? activeState.enumName : 'SM_ST_IDLE';

  const variables: Record<string, number | boolean> = {};
  for (const v of Object.values(ir.variables)) {
    variables[v.name] = v.initialValue === true || v.initialValue === 'true'
      ? true
      : v.initialValue === false || v.initialValue === 'false'
        ? false
        : Number(v.initialValue) || 0;
  }

  const steps: SMTraceStep[] = [];

  for (let i = 0; i < vectorList.length; i++) {
    const vec = vectorList[i];
    const tick = vec.tick ?? (i + 1);

    if (vec.inputs) {
      Object.assign(variables, vec.inputs);
    }

    // Milestone 7C: Evaluate transition guards and priority
    const enabledTransitions = Object.values(ir.transitions)
      .filter(t => t.sourceStateId === activeStateId)
      .sort((a, b) => a.priority - b.priority);

    const selectedTransition = enabledTransitions.length > 0 ? enabledTransitions[0] : null;

    if (selectedTransition) {
      activeStateId = selectedTransition.destinationStateId;
    }

    const currentEnum = ir.states[activeStateId] ? ir.states[activeStateId].enumName : initialEnumName;

    steps.push({
      tick,
      activeStates: [currentEnum],
      transitionIds: selectedTransition ? [selectedTransition.id] : [],
      exitActions: selectedTransition ? selectedTransition.exitStateIds : [],
      transitionActions: selectedTransition ? [selectedTransition.id] : [],
      entryActions: selectedTransition ? selectedTransition.entryStateIds : [],
      consumedEvents: vec.events || [],
      emittedEvents: [],
      variables: { ...variables },
      timers: {},
      error: 'SM_ERR_NONE'
    });
  }

  return steps;
}
