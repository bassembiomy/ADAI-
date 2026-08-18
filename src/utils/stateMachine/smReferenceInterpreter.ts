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
    const rawVal = v.initialValue as unknown;
    variables[v.name] = rawVal === true || rawVal === 'true'
      ? true
      : rawVal === false || rawVal === 'false'
        ? false
        : Number(rawVal) || 0;
  }

  const steps: SMTraceStep[] = [];

  for (let i = 0; i < vectorList.length; i++) {
    const vec = vectorList[i];
    const tick = vec.tick ?? (i + 1);

    if (vec.inputs) {
      Object.assign(variables, vec.inputs);
    }

    const evaluateCondition = (cond: string | undefined): boolean => {
      if (!cond || cond === 'true') return true;
      if (cond === 'false') return false;
      const val = variables[cond];
      return Boolean(val);
    };

    const enabledTransitions = Object.values(ir.transitions)
      .filter(t => t.sourceStateId === activeStateId && evaluateCondition(t.guardSource))
      .sort((a, b) => a.priority - b.priority);


    const selectedTransition = enabledTransitions.length > 0 ? enabledTransitions[0] : null;

    if (selectedTransition) {
      activeStateId = selectedTransition.destinationStateId;
    }

    const currentState = ir.states[activeStateId];
    const currentEnum = currentState ? currentState.enumName : initialEnumName;

    // Evaluate XBridges state operations (Step & Outport propagation)
    if (currentState?.xBridges) {
      const stateTimerMs = tick * vec.deltaMs;
      for (const opId of currentState.xBridges.executionOrder) {
        const op = currentState.xBridges.operations[opId];
        if (op?.type === 'Step') {
          const stepTimeSec = Number(op.parameters.step_time ?? op.parameters.stepTime ?? op.parameters.time ?? 0.3);
          const initialVal = Number(op.parameters.initial_value ?? op.parameters.initialValue ?? op.parameters.initial ?? 0);
          const finalVal = Number(op.parameters.final_value ?? op.parameters.finalValue ?? op.parameters.final ?? 1);
          const thresholdMs = Math.ceil(stepTimeSec * 1000.0);
          const val = stateTimerMs < thresholdMs ? initialVal : finalVal;

          for (const m of currentState.xBridges.mappings) {
            const varName = m.variable?.modelName ?? m.sourceVariableId ?? m.variableId;
            if (varName) {
              variables[varName] = val;
            }
          }

        }
      }
    }

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
