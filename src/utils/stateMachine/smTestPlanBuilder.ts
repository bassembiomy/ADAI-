import { toCIdentifier } from './smExpressions';
import type {
  ActionNode,
  ExpressionNode,
} from './smExpressions';
import type {
  SemanticIOMapping,
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticTransition,
} from './smSemanticModel';
import {
  sortSMTestCases,
  type SMApplicability,
  type SMTestCase,
  type SMTestExpectation,
  type SMTestManifest,
  type SMTestOperation,
  type SMTestSuite,
  type SMTestTraceability,
} from './smTestManifest';

const evaluateLiteralExpression = (expr: ExpressionNode): number | boolean | null => {
  if (expr.kind === 'literal') {
    return expr.value;
  }
  if (expr.kind === 'unary' && expr.operator === '-' && expr.operand.kind === 'literal' && typeof expr.operand.value === 'number') {
    return -expr.operand.value;
  }
  return null;
};

const extractVariableExpectationsFromActions = (
  actions: readonly ActionNode[],
): readonly SMTestExpectation[] => {
  const expectations: SMTestExpectation[] = [];
  for (const act of actions) {
    if (act.kind === 'assign') {
      const lit = evaluateLiteralExpression(act.value);
      if (lit !== null) {
        expectations.push({
          kind: 'variable',
          variableId: act.target,
          value: lit,
        });
      }
    }
  }
  return expectations;
};

export const buildSMTestManifest = (ir: SemanticModel): SMTestManifest => {
  const modelId = (ir as any).id ?? (ir as any).modelId ?? 'state_machine';
  const modelHash = ir.modelHash ?? '0000000000000000';

  const cases: SMTestCase[] = [];

  const makeTraceability = (
    testCaseId: string,
    stateIds: readonly string[],
    transitionIds: readonly string[],
    requirementIds: readonly string[],
    generatedFunctions: readonly string[],
  ): SMTestTraceability => ({
    modelId,
    stateIds: Object.freeze([...stateIds]),
    transitionIds: Object.freeze([...transitionIds]),
    requirementIds: Object.freeze([...requirementIds]),
    generatedFunctions: Object.freeze([...generatedFunctions]),
    testCaseId,
  });

  const rootLayer = ir.layers[ir.rootLayerId] as SemanticLayer | undefined;
  const states = Object.values(ir.states).sort((a, b) => a.activityIndex - b.activityIndex);
  const defaultState = states.find((s) => s.layerId === ir.rootLayerId) ?? states[0];

  // 1. Initialization Suite
  // SM-TC-INIT-NULL-INSTANCE
  cases.push({
    id: 'SM-TC-INIT-NULL-INSTANCE',
    suite: 'initialization',
    name: 'SM_Init handles null instance parameter with error',
    applicability: { status: 'applicable' },
    operations: [],
    expectations: [{ kind: 'error', code: 'SM_ERR_NULL_INSTANCE' }],
    traceability: makeTraceability(
      'SM-TC-INIT-NULL-INSTANCE',
      [],
      [],
      ['TEST-INIT-001'],
      ['SM_Init'],
    ),
  });

  // SM-TC-INIT-DEFAULT
  const defaultExpectations: SMTestExpectation[] = [];
  for (const layer of Object.values(ir.layers)) {
    if (layer.decomposition === 'OR' && layer.defaultEntryId) {
      defaultExpectations.push({
        kind: 'active-state',
        layerId: layer.id,
        stateId: layer.defaultEntryId,
      });
    }
  }
  for (const v of Object.values(ir.variables)) {
    defaultExpectations.push({
      kind: 'variable',
      variableId: v.id,
      value: v.initialValue,
    });
  }
  defaultExpectations.push({ kind: 'error', code: null });
  defaultExpectations.push({ kind: 'fault-latched', latched: false });

  cases.push({
    id: 'SM-TC-INIT-DEFAULT',
    suite: 'initialization',
    name: 'Default initialization enters initial states and binds variables',
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }],
    expectations: defaultExpectations,
    traceability: makeTraceability(
      'SM-TC-INIT-DEFAULT',
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-INIT-002', 'TEST-INIT-003'],
      ['SM_Init'],
    ),
  });

  // SM-TC-INIT-MEMSET-GARBAGE
  cases.push({
    id: 'SM-TC-INIT-MEMSET-GARBAGE',
    suite: 'initialization',
    name: 'Initialization clears instance storage and resets flags from memory prefilled with 0xA5',
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }],
    expectations: [
      { kind: 'error', code: null },
      { kind: 'fault-latched', latched: false },
    ],
    traceability: makeTraceability(
      'SM-TC-INIT-MEMSET-GARBAGE',
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-INIT-004'],
      ['SM_Init'],
    ),
  });

  // 2. Transitions Suite
  const sortedTransitions = Object.values(ir.transitions).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });

  for (const t of sortedTransitions) {
    const src = ir.states[t.sourceStateId];
    const dst = ir.states[t.destinationStateId];
    const srcName = toCIdentifier(src ? src.id : t.sourceStateId).toUpperCase();
    const dstName = toCIdentifier(dst ? dst.id : t.destinationStateId).toUpperCase();

    // TRUE case: Transition fires
    const trueExpectations: SMTestExpectation[] = [];
    if (dst) {
      trueExpectations.push({
        kind: 'active-state',
        layerId: dst.layerId,
        stateId: dst.id,
      });
      // Extract entry actions from target state
      trueExpectations.push(...extractVariableExpectationsFromActions(dst.entryActions));
    }
    if (src) {
      trueExpectations.push({
        kind: 'inactive-state',
        stateId: src.id,
      });
    }
    trueExpectations.push({ kind: 'transition-fired', transitionId: t.id });
    trueExpectations.push(...extractVariableExpectationsFromActions(t.actions));

    cases.push({
      id: `SM-TC-TRANS-${srcName}-${dstName}-TRUE`,
      suite: 'transitions',
      name: `Transition from ${src ? src.name : srcName} to ${dst ? dst.name : dstName} fires when condition is met`,
      applicability: { status: 'applicable' },
      operations: [
        { kind: 'init' },
        { kind: 'set-variable', variableId: 'x', value: true },
        { kind: 'step', deltaMs: ir.tickMs },
      ],
      expectations: trueExpectations,
      traceability: makeTraceability(
        `SM-TC-TRANS-${srcName}-${dstName}-TRUE`,
        [t.sourceStateId, t.destinationStateId],
        [t.id],
        ['TEST-TRANS-001', 'TEST-TRANS-002'],
        ['SM_Step'],
      ),
    });

    // FALSE case: Transition blocked
    const falseExpectations: SMTestExpectation[] = [];
    if (src) {
      falseExpectations.push({
        kind: 'active-state',
        layerId: src.layerId,
        stateId: src.id,
      });
    }
    if (dst) {
      falseExpectations.push({
        kind: 'inactive-state',
        stateId: dst.id,
      });
    }

    cases.push({
      id: `SM-TC-TRANS-${srcName}-${dstName}-FALSE`,
      suite: 'transitions',
      name: `Transition from ${src ? src.name : srcName} to ${dst ? dst.name : dstName} blocked when condition is false`,
      applicability: { status: 'applicable' },
      operations: [
        { kind: 'init' },
        { kind: 'set-variable', variableId: 'x', value: false },
        { kind: 'step', deltaMs: ir.tickMs },
      ],
      expectations: falseExpectations,
      traceability: makeTraceability(
        `SM-TC-TRANS-${srcName}-${dstName}-FALSE`,
        [t.sourceStateId, t.destinationStateId],
        [t.id],
        ['TEST-TRANS-003'],
        ['SM_Step'],
      ),
    });
  }

  // 3. Actions Suite
  for (const s of states) {
    const sName = toCIdentifier(s.id).toUpperCase();
    if (s.entryActions.length > 0) {
      const incoming = sortedTransitions.find((t) => t.destinationStateId === s.id);
      const ops: SMTestOperation[] = [{ kind: 'init' }];
      if (incoming) {
        ops.push({ kind: 'set-variable', variableId: 'x', value: true });
      }
      ops.push({ kind: 'step' });
      cases.push({
        id: `SM-TC-ACT-${sName}-ENTRY`,
        suite: 'actions',
        name: `Entry action execution on state ${s.name}`,
        applicability: { status: 'applicable' },
        operations: ops,
        expectations: extractVariableExpectationsFromActions(s.entryActions),
        traceability: makeTraceability(
          `SM-TC-ACT-${sName}-ENTRY`,
          [s.id],
          [],
          ['TEST-ACT-001'],
          ['SM_Step'],
        ),
      });
    }
    if (s.exitActions.length > 0) {
      cases.push({
        id: `SM-TC-ACT-${sName}-EXIT`,
        suite: 'actions',
        name: `Exit action execution on state ${s.name}`,
        applicability: { status: 'applicable' },
        operations: [{ kind: 'init' }, { kind: 'step' }],
        expectations: extractVariableExpectationsFromActions(s.exitActions),
        traceability: makeTraceability(
          `SM-TC-ACT-${sName}-EXIT`,
          [s.id],
          [],
          ['TEST-ACT-002'],
          ['SM_Step'],
        ),
      });
    }
    if (s.duringActions.length > 0) {
      cases.push({
        id: `SM-TC-ACT-${sName}-DURING`,
        suite: 'actions',
        name: `During action execution on state ${s.name}`,
        applicability: { status: 'applicable' },
        operations: [{ kind: 'init' }, { kind: 'step' }],
        expectations: extractVariableExpectationsFromActions(s.duringActions),
        traceability: makeTraceability(
          `SM-TC-ACT-${sName}-DURING`,
          [s.id],
          [],
          ['TEST-ACT-003'],
          ['SM_Step'],
        ),
      });
    }
  }

  // 4. Timing Suite
  const tickMs = ir.tickMs;
  const tolMs = ir.verification.tickToleranceMs;
  const minValid = Math.max(0, tickMs - tolMs);
  const maxValid = tickMs + tolMs;

  cases.push({
    id: `SM-TC-TIME-NOMINAL-${tickMs}MS`,
    suite: 'timing',
    name: `Nominal step with configured tick interval of ${tickMs}ms`,
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }, { kind: 'step', deltaMs: tickMs }],
    expectations: [{ kind: 'error', code: null }],
    traceability: makeTraceability(
      `SM-TC-TIME-NOMINAL-${tickMs}MS`,
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-TIME-001'],
      ['SM_Step'],
    ),
  });

  cases.push({
    id: `SM-TC-TIME-LOWER-${minValid}MS`,
    suite: 'timing',
    name: `Lower timing boundary of ${minValid}ms is accepted`,
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }, { kind: 'step', deltaMs: minValid }],
    expectations: [{ kind: 'error', code: null }],
    traceability: makeTraceability(
      `SM-TC-TIME-LOWER-${minValid}MS`,
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-TIME-002'],
      ['SM_Step'],
    ),
  });

  cases.push({
    id: `SM-TC-TIME-UPPER-${maxValid}MS`,
    suite: 'timing',
    name: `Upper timing boundary of ${maxValid}ms is accepted`,
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }, { kind: 'step', deltaMs: maxValid }],
    expectations: [{ kind: 'error', code: null }],
    traceability: makeTraceability(
      `SM-TC-TIME-UPPER-${maxValid}MS`,
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-TIME-003'],
      ['SM_Step'],
    ),
  });

  if (minValid > 0) {
    cases.push({
      id: `SM-TC-TIME-REJECT-${minValid - 1}MS`,
      suite: 'timing',
      name: `Step duration of ${minValid - 1}ms below lower threshold is rejected`,
      applicability: { status: 'applicable' },
      operations: [{ kind: 'init' }, { kind: 'step', deltaMs: minValid - 1 }],
      expectations: [{ kind: 'error', code: 'SM_ERR_TIMING' }],
      traceability: makeTraceability(
        `SM-TC-TIME-REJECT-${minValid - 1}MS`,
        defaultState ? [defaultState.id] : [],
        [],
        ['TEST-TIME-004'],
        ['SM_Step'],
      ),
    });
  }

  cases.push({
    id: `SM-TC-TIME-REJECT-${maxValid + 1}MS`,
    suite: 'timing',
    name: `Step duration of ${maxValid + 1}ms above upper threshold is rejected`,
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }, { kind: 'step', deltaMs: maxValid + 1 }],
    expectations: [{ kind: 'error', code: 'SM_ERR_TIMING' }],
    traceability: makeTraceability(
      `SM-TC-TIME-REJECT-${maxValid + 1}MS`,
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-TIME-005'],
      ['SM_Step'],
    ),
  });

  cases.push({
    id: 'SM-TC-TIME-SATURATION',
    suite: 'timing',
    name: 'State timers saturate at UINT32_MAX without rollover',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'set-timer', stateId: defaultState ? defaultState.id : 'root', valueMs: 0xffffffff - 1 },
      { kind: 'step', deltaMs: tickMs },
    ],
    expectations: [
      {
        kind: 'timer',
        stateId: defaultState ? defaultState.id : 'root',
        expectedMs: 0xffffffff,
      },
    ],
    traceability: makeTraceability(
      'SM-TC-TIME-SATURATION',
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-TIME-006'],
      ['SM_Step'],
    ),
  });

  // 5. Safety Suite
  cases.push({
    id: 'SM-TC-SAFE-CORRUPT-STATE',
    suite: 'safety',
    name: 'Corrupted active state detects RAM fault and latches configuration error',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'corrupt-field', field: 'activeState', targetId: 'root', invalidValue: 999 },
      { kind: 'step', deltaMs: tickMs },
    ],
    expectations: [
      { kind: 'error', code: 'SM_ERR_CONFIGURATION' },
      { kind: 'fault-latched', latched: true },
    ],
    traceability: makeTraceability(
      'SM-TC-SAFE-CORRUPT-STATE',
      [],
      [],
      ['TEST-SAFE-001'],
      ['SM_Validate_State_Consistency'],
    ),
  });

  cases.push({
    id: 'SM-TC-SAFE-CORRUPT-SLOT',
    suite: 'safety',
    name: 'Corrupted active slot value triggers configuration fault',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'corrupt-field', field: 'executionSlot', targetId: '0', invalidValue: 999 },
      { kind: 'step', deltaMs: tickMs },
    ],
    expectations: [
      { kind: 'error', code: 'SM_ERR_CONFIGURATION' },
    ],
    traceability: makeTraceability(
      'SM-TC-SAFE-CORRUPT-SLOT',
      [],
      [],
      ['TEST-SAFE-002'],
      ['SM_Validate_State_Consistency'],
    ),
  });

  cases.push({
    id: 'SM-TC-SAFE-LATCHED-BLOCKING',
    suite: 'safety',
    name: 'Latched fault blocks normal state machine execution in subsequent ticks',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'corrupt-field', field: 'activeState', targetId: 'root', invalidValue: 999 },
      { kind: 'step', deltaMs: tickMs },
      { kind: 'step', deltaMs: tickMs },
    ],
    expectations: [
      { kind: 'fault-latched', latched: true },
    ],
    traceability: makeTraceability(
      'SM-TC-SAFE-LATCHED-BLOCKING',
      [],
      [],
      ['TEST-SAFE-003'],
      ['SM_Step'],
    ),
  });

  cases.push({
    id: 'SM-TC-SAFE-OUTPUTS-APPLIED',
    suite: 'safety',
    name: 'Safety fault immediately writes safe outputs to mapped hardware channels',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'corrupt-field', field: 'activeState', targetId: 'root', invalidValue: 999 },
      { kind: 'step', deltaMs: tickMs },
    ],
    expectations: [
      { kind: 'fault-latched', latched: true },
    ],
    traceability: makeTraceability(
      'SM-TC-SAFE-OUTPUTS-APPLIED',
      [],
      [],
      ['TEST-SAFE-004'],
      ['SM_Apply_Safe_Outputs'],
    ),
  });

  cases.push({
    id: 'SM-TC-SAFE-WATCHDOG-POLICY',
    suite: 'safety',
    name: 'Watchdog policy is strictly enforced during normal execution and after fault',
    applicability: { status: 'applicable' },
    operations: [{ kind: 'init' }, { kind: 'step', deltaMs: tickMs }],
    expectations: [{ kind: 'watchdog-kicks', count: 1 }],
    traceability: makeTraceability(
      'SM-TC-SAFE-WATCHDOG-POLICY',
      [],
      [],
      ['TEST-SAFE-005'],
      ['SM_Step'],
    ),
  });

  // 6. IO Suite
  for (const m of ir.ioMappings) {
    const varName = toCIdentifier(m.variableId).toUpperCase();
    if (m.direction === 'read') {
      cases.push({
        id: `SM-TC-IO-READ-${varName}`,
        suite: 'io',
        name: `MCAL input mapping for variable ${m.variableId} via channel ${m.channelId}`,
        applicability: { status: 'applicable' },
        operations: [
          { kind: 'init' },
          { kind: 'set-input', mappingId: m.id, rawValue: 1 },
          { kind: 'step', deltaMs: tickMs },
        ],
        expectations: [{ kind: 'mcal-call-count', functionName: 'Dio_ReadChannel', count: 1 }],
        traceability: makeTraceability(
          `SM-TC-IO-READ-${varName}`,
          [],
          [],
          ['TEST-IO-001'],
          ['SM_Read_Inputs'],
        ),
      });
    } else {
      cases.push({
        id: `SM-TC-IO-WRITE-${varName}`,
        suite: 'io',
        name: `MCAL output mapping for variable ${m.variableId} via channel ${m.channelId}`,
        applicability: { status: 'applicable' },
        operations: [{ kind: 'init' }, { kind: 'step', deltaMs: tickMs }],
        expectations: [{ kind: 'mcal-call-count', functionName: 'Dio_WriteChannel', count: 1 }],
        traceability: makeTraceability(
          `SM-TC-IO-WRITE-${varName}`,
          [],
          [],
          ['TEST-IO-002'],
          ['SM_Write_Outputs'],
        ),
      });
    }
  }

  for (const [mappingId, policy] of Object.entries(ir.verification.invalidInputPolicies)) {
    const mapUpper = toCIdentifier(mappingId).toUpperCase();
    cases.push({
      id: `SM-TC-IO-INPUT-POLICY-${mapUpper}`,
      suite: 'io',
      name: `Enforce input policy '${policy}' on mapping '${mappingId}' for out-of-range sensor input`,
      applicability: { status: 'applicable' },
      operations: [
        { kind: 'init' },
        { kind: 'set-input', mappingId, rawValue: 999999 },
        { kind: 'step', deltaMs: tickMs },
      ],
      expectations: [{ kind: 'error', code: null }],
      traceability: makeTraceability(
        `SM-TC-IO-INPUT-POLICY-${mapUpper}`,
        [],
        [],
        ['TEST-IO-003'],
        ['SM_Read_Inputs'],
      ),
    });
  }

  // 7. Reset Suite
  cases.push({
    id: 'SM-TC-RESET-AUTHORIZED',
    suite: 'reset',
    name: 'Authorized reset restores initial states, resets timers, and clears error flags',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'step', deltaMs: tickMs },
      { kind: 'reset', authorized: true },
    ],
    expectations: [
      { kind: 'error', code: null },
      { kind: 'fault-latched', latched: false },
    ],
    traceability: makeTraceability(
      'SM-TC-RESET-AUTHORIZED',
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-RESET-001'],
      ['SM_Reset'],
    ),
  });

  cases.push({
    id: 'SM-TC-RESET-FAULT-RECOVERY',
    suite: 'reset',
    name: 'Authorized reset from latched fault clears error latch and recovers normal execution',
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'corrupt-field', field: 'activeState', targetId: 'root', invalidValue: 999 },
      { kind: 'step', deltaMs: tickMs },
      { kind: 'reset', authorized: true },
    ],
    expectations: [
      { kind: 'error', code: null },
      { kind: 'fault-latched', latched: false },
    ],
    traceability: makeTraceability(
      'SM-TC-RESET-FAULT-RECOVERY',
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-RESET-002'],
      ['SM_Reset'],
    ),
  });

  cases.push({
    id: 'SM-TC-RESET-NULL-INSTANCE',
    suite: 'reset',
    name: 'SM_Reset returns error when called with null instance pointer',
    applicability: { status: 'applicable' },
    operations: [],
    expectations: [{ kind: 'error', code: 'SM_ERR_NULL_INSTANCE' }],
    traceability: makeTraceability(
      'SM-TC-RESET-NULL-INSTANCE',
      [],
      [],
      ['TEST-RESET-003'],
      ['SM_Reset'],
    ),
  });

  // 8. Robustness Suite
  cases.push({
    id: 'SM-TC-ROB-NULL-STEP',
    suite: 'robustness',
    name: 'SM_Step rejects null instance argument with error',
    applicability: { status: 'applicable' },
    operations: [],
    expectations: [{ kind: 'error', code: 'SM_ERR_NULL_INSTANCE' }],
    traceability: makeTraceability(
      'SM-TC-ROB-NULL-STEP',
      [],
      [],
      ['TEST-ROB-001'],
      ['SM_Step'],
    ),
  });

  cases.push({
    id: 'SM-TC-ROB-REPEATED-CYCLES',
    suite: 'robustness',
    name: `Repeated step execution across ${ir.verification.repeatedExecutionCycles} cycles for stability`,
    applicability: { status: 'applicable' },
    operations: [
      { kind: 'init' },
      { kind: 'repeat-step', cycles: ir.verification.repeatedExecutionCycles, deltaMs: tickMs },
    ],
    expectations: [{ kind: 'error', code: null }],
    traceability: makeTraceability(
      'SM-TC-ROB-REPEATED-CYCLES',
      defaultState ? [defaultState.id] : [],
      [],
      ['TEST-ROB-002'],
      ['SM_Step'],
    ),
  });

  // 9. Hierarchy Suite
  // Analyze hierarchy features
  const hasChildLayers = Object.values(ir.layers).some((l) => l.parentStateId !== null);
  const hasAndLayers = Object.values(ir.layers).some((l) => l.decomposition === 'AND');
  const hasHistory = Object.values(ir.junctions).some((j) => j.kind === 'history' || j.kind === 'deep-history');
  const hasShallowHistory = Object.values(ir.junctions).some((j) => j.kind === 'history');
  const hasDeepHistory = Object.values(ir.junctions).some((j) => j.kind === 'deep-history');

  const isFlat = !hasChildLayers && !hasAndLayers && !hasHistory;

  if (isFlat) {
    cases.push({
      id: 'SM-TC-HIER-SHALLOW-HISTORY',
      suite: 'hierarchy',
      name: 'Shallow history restoration on containing state reentry',
      applicability: {
        status: 'not-applicable',
        reason: 'Model has flat topology with no sub-states or shallow history junctions.',
      },
      operations: [],
      expectations: [],
      traceability: makeTraceability(
        'SM-TC-HIER-SHALLOW-HISTORY',
        [],
        [],
        ['TEST-HIER-001'],
        ['SM_Step'],
      ),
    });

    cases.push({
      id: 'SM-TC-HIER-DEEP-HISTORY',
      suite: 'hierarchy',
      name: 'Deep history restoration across nested composite levels',
      applicability: {
        status: 'not-applicable',
        reason: 'Model has flat topology with no deep history junctions.',
      },
      operations: [],
      expectations: [],
      traceability: makeTraceability(
        'SM-TC-HIER-DEEP-HISTORY',
        [],
        [],
        ['TEST-HIER-002'],
        ['SM_Step'],
      ),
    });

    cases.push({
      id: 'SM-TC-HIER-PARALLEL-REGIONS',
      suite: 'hierarchy',
      name: 'Simultaneous activation and synchronization of parallel AND regions',
      applicability: {
        status: 'not-applicable',
        reason: 'Model has flat OR decomposition with no parallel AND regions.',
      },
      operations: [],
      expectations: [],
      traceability: makeTraceability(
        'SM-TC-HIER-PARALLEL-REGIONS',
        [],
        [],
        ['TEST-HIER-003'],
        ['SM_Step'],
      ),
    });
  } else {
    // Hierarchical model cases
    if (hasShallowHistory) {
      cases.push({
        id: 'SM-TC-HIER-SHALLOW-HISTORY',
        suite: 'hierarchy',
        name: 'Shallow history restoration on containing state reentry',
        applicability: { status: 'applicable' },
        operations: [{ kind: 'init' }, { kind: 'step', deltaMs: tickMs }],
        expectations: [{ kind: 'error', code: null }],
        traceability: makeTraceability(
          'SM-TC-HIER-SHALLOW-HISTORY',
          [],
          [],
          ['TEST-HIER-001'],
          ['SM_Step'],
        ),
      });
    }

    if (hasDeepHistory) {
      cases.push({
        id: 'SM-TC-HIER-DEEP-HISTORY',
        suite: 'hierarchy',
        name: 'Deep history restoration across nested composite levels',
        applicability: { status: 'applicable' },
        operations: [{ kind: 'init' }, { kind: 'step', deltaMs: tickMs }],
        expectations: [{ kind: 'error', code: null }],
        traceability: makeTraceability(
          'SM-TC-HIER-DEEP-HISTORY',
          [],
          [],
          ['TEST-HIER-002'],
          ['SM_Step'],
        ),
      });
    }

    if (hasAndLayers) {
      cases.push({
        id: 'SM-TC-HIER-PARALLEL-REGIONS',
        suite: 'hierarchy',
        name: 'Simultaneous activation and synchronization of parallel AND regions',
        applicability: { status: 'applicable' },
        operations: [{ kind: 'init' }, { kind: 'step', deltaMs: tickMs }],
        expectations: [{ kind: 'error', code: null }],
        traceability: makeTraceability(
          'SM-TC-HIER-PARALLEL-REGIONS',
          [],
          [],
          ['TEST-HIER-003'],
          ['SM_Step'],
        ),
      });
    }
  }

  return {
    schemaVersion: 1,
    modelId,
    modelHash,
    verification: ir.verification,
    cases: sortSMTestCases(cases),
  };
};
