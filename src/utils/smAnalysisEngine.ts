/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADIA — State Machine Analysis Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Performs structural analysis on a state-machine chart to identify:
 *   1. Critical execution paths (longest / most complex routes through the graph)
 *   2. Corner cases & behavior anomalies (deadlocks, unreachable states, races …)
 *   3. Test scenarios derived from the analysis (path walk-throughs, boundary tests)
 *
 * The module is pure logic — no rendering, no side-effects.
 */

import {
  StateData,
  JunctionData,
  TransitionData,
  VariableDef,
  Layer,
} from '../types/sm_types';

// ─── Exported types ──────────────────────────────────────────────────────────

export interface CriticalPath {
  id: string;
  name: string;
  /** Ordered list of state / junction names along the path */
  states: string[];
  /** Ordered list of transition conditions along the path */
  transitions: string[];
  /** Composite complexity score */
  complexity: number;
  /** Human-readable description */
  description: string;
}

export type CornerCaseCategory =
  | 'deadlock'
  | 'unreachable'
  | 'self_loop'
  | 'race_condition'
  | 'high_fanout'
  | 'unguarded'
  | 'timer_overflow'
  | 'missing_action';

export interface CornerCase {
  id: string;
  category: CornerCaseCategory;
  severity: 'critical' | 'warning' | 'info';
  elementId: string;
  elementName: string;
  description: string;
  recommendation: string;
}

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestScenario {
  id: string;
  name: string;
  category:
    | 'critical_path'
    | 'corner_case'
    | 'branch_coverage'
    | 'boundary'
    | 'safety';
  preconditions: string[];
  steps: TestStep[];
  expectedResult: string;
  relatedCornerCase?: string;
  relatedCriticalPath?: string;
}

export interface SMAnalysisResult {
  criticalPaths: CriticalPath[];
  cornerCases: CornerCase[];
  testScenarios: TestScenario[];
  metrics: {
    totalPaths: number;
    maxPathLength: number;
    stateReachability: number;
    branchCoverage: number;
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Resolve name for a state or junction id */
const resolveName = (
  id: string,
  states: StateData[],
  junctions: JunctionData[],
): string => {
  const s = states.find((st) => st.id === id);
  if (s) return s.name;
  const j = junctions.find((jn) => jn.id === id);
  if (j) return j.name;
  return 'unknown';
};

type AdjList = Map<string, { targetId: string; transition: TransitionData }[]>;

const buildAdjacencyList = (transitions: TransitionData[]): AdjList => {
  const adj: AdjList = new Map();
  transitions.forEach((t) => {
    if (!adj.has(t.sourceId)) adj.set(t.sourceId, []);
    adj.get(t.sourceId)!.push({ targetId: t.targetId, transition: t });
  });
  return adj;
};

// ─── 1. Critical Path Analysis ───────────────────────────────────────────────

const MAX_PATHS = 100;

interface RawPath {
  nodeIds: string[];
  transitionConditions: string[];
}

/**
 * DFS-based path enumeration from `startId`.
 * Stops collecting after MAX_PATHS to avoid combinatorial explosion.
 */
const enumeratePaths = (
  startId: string,
  adj: AdjList,
): RawPath[] => {
  const results: RawPath[] = [];

  const dfs = (
    current: string,
    visited: Set<string>,
    path: string[],
    conditions: string[],
  ) => {
    if (results.length >= MAX_PATHS) return;

    const neighbours = adj.get(current);
    if (!neighbours || neighbours.length === 0) {
      // Terminal node — record path
      if (path.length > 1) {
        results.push({
          nodeIds: [...path],
          transitionConditions: [...conditions],
        });
      }
      return;
    }

    let expanded = false;
    for (const { targetId, transition } of neighbours) {
      if (results.length >= MAX_PATHS) return;
      if (visited.has(targetId)) continue; // cycle guard
      expanded = true;
      visited.add(targetId);
      path.push(targetId);
      conditions.push(transition.condition || 'true');
      dfs(targetId, visited, path, conditions);
      conditions.pop();
      path.pop();
      visited.delete(targetId);
    }

    // If all neighbours were already visited (cycle-only), record current path
    if (!expanded && path.length > 1) {
      results.push({
        nodeIds: [...path],
        transitionConditions: [...conditions],
      });
    }
  };

  const visited = new Set<string>([startId]);
  dfs(startId, visited, [startId], []);
  return results;
};

const computeCriticalPaths = (
  states: StateData[],
  junctions: JunctionData[],
  transitions: TransitionData[],
): CriticalPath[] => {
  const adj = buildAdjacencyList(transitions);

  // Find the autostart state (root level)
  const autostart = states.find(
    (s) => s.autostart && (!s.parentId || s.parentId === 'root'),
  );
  const autostartJunction = junctions.find(
    (j) => j.autostart && (!j.parentId || j.parentId === 'root'),
  );

  const startId = autostart?.id || autostartJunction?.id;
  if (!startId) return [];

  const rawPaths = enumeratePaths(startId, adj);
  if (rawPaths.length === 0) return [];

  // Sort by descending length
  rawPaths.sort((a, b) => b.nodeIds.length - a.nodeIds.length);

  // Take top 5
  const top = rawPaths.slice(0, 5);

  return top.map((rp, idx) => {
    const names = rp.nodeIds.map((id) => resolveName(id, states, junctions));
    const complexity =
      rp.nodeIds.length *
      (1 + rp.transitionConditions.filter((c) => c !== 'true').length);

    return {
      id: `CP-${String(idx + 1).padStart(3, '0')}`,
      name: `Critical Path ${idx + 1}: ${names[0]} → ${names[names.length - 1]}`,
      states: names,
      transitions: rp.transitionConditions,
      complexity,
      description:
        idx === 0
          ? `Longest execution path (${rp.nodeIds.length} nodes, complexity ${complexity}). This is the most critical batch requiring the highest test coverage.`
          : `Execution path with ${rp.nodeIds.length} nodes, complexity ${complexity}.`,
    };
  });
};

// ─── 2. Corner Case / Behavior Corner Detection ─────────────────────────────

const detectCornerCases = (
  states: StateData[],
  junctions: JunctionData[],
  transitions: TransitionData[],
  variables: VariableDef[],
  tickMs: number,
): CornerCase[] => {
  const cases: CornerCase[] = [];
  let ccId = 0;
  const nextId = () => `CC-${String(++ccId).padStart(3, '0')}`;

  // --- Deadlock states ---
  states.forEach((s) => {
    const hasOutgoing = transitions.some((t) => t.sourceId === s.id);
    if (!hasOutgoing && !s.isSafeState) {
      cases.push({
        id: nextId(),
        category: 'deadlock',
        severity: 'critical',
        elementId: s.id,
        elementName: s.name,
        description: `State "${s.name}" has no outgoing transitions and is not a safe-state. The system will be trapped here permanently.`,
        recommendation:
          'Add an outgoing transition or mark as a designated safe/terminal state.',
      });
    }
  });

  // --- Unreachable states ---
  const autostart = states.find(
    (s) => s.autostart && (!s.parentId || s.parentId === 'root'),
  );
  const autostartJunction = junctions.find(
    (j) => j.autostart && (!j.parentId || j.parentId === 'root'),
  );
  const startId = autostart?.id || autostartJunction?.id;

  if (startId) {
    const reachable = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      transitions
        .filter((t) => t.sourceId === cur)
        .forEach((t) => {
          if (!reachable.has(t.targetId)) queue.push(t.targetId);
        });
    }

    states.forEach((s) => {
      if (!reachable.has(s.id)) {
        cases.push({
          id: nextId(),
          category: 'unreachable',
          severity: 'warning',
          elementId: s.id,
          elementName: s.name,
          description: `State "${s.name}" is not reachable from the autostart state. It represents dead logic.`,
          recommendation:
            'Add a transition leading to this state or remove it to reduce complexity.',
        });
      }
    });
  }

  // --- Unconditional self-loops ---
  transitions.forEach((t) => {
    if (t.sourceId === t.targetId) {
      const condIsTrue = !t.condition || t.condition.trim() === 'true';
      const noTimer = t.afterTicks === null || t.afterTicks === undefined;
      if (condIsTrue && noTimer) {
        const name = resolveName(t.sourceId, states, junctions);
        cases.push({
          id: nextId(),
          category: 'self_loop',
          severity: 'critical',
          elementId: t.id,
          elementName: name,
          description: `Unconditional self-loop on "${name}" — the exit→entry cycle fires every tick with no guard, causing infinite re-entry.`,
          recommendation:
            'Add a guard condition or an "after" timer to prevent infinite cycling.',
        });
      }
    }
  });

  // --- Race conditions (overlapping conditions from same source) ---
  const sourceGroups = new Map<string, TransitionData[]>();
  transitions.forEach((t) => {
    if (!sourceGroups.has(t.sourceId)) sourceGroups.set(t.sourceId, []);
    sourceGroups.get(t.sourceId)!.push(t);
  });

  sourceGroups.forEach((trs, srcId) => {
    if (trs.length < 2) return;
    // Check for duplicate conditions
    const conditionSet = new Map<string, TransitionData[]>();
    trs.forEach((t) => {
      const key = (t.condition || 'true').trim();
      if (!conditionSet.has(key)) conditionSet.set(key, []);
      conditionSet.get(key)!.push(t);
    });
    conditionSet.forEach((group, cond) => {
      if (group.length > 1) {
        const name = resolveName(srcId, states, junctions);
        const targets = group
          .map((t) => resolveName(t.targetId, states, junctions))
          .join(', ');
        cases.push({
          id: nextId(),
          category: 'race_condition',
          severity: 'warning',
          elementId: srcId,
          elementName: name,
          description: `State "${name}" has ${group.length} transitions with identical condition [${cond}] leading to: ${targets}. Only the first by priority will execute — this may hide intended behavior.`,
          recommendation:
            'Differentiate conditions or rely on explicit transition priority ordering.',
        });
      }
    });
  });

  // --- High fan-out junctions ---
  junctions.forEach((j) => {
    const outgoing = transitions.filter((t) => t.sourceId === j.id);
    if (outgoing.length > 3) {
      cases.push({
        id: nextId(),
        category: 'high_fanout',
        severity: 'info',
        elementId: j.id,
        elementName: j.name,
        description: `Junction "${j.name}" has ${outgoing.length} outgoing paths — a complex decision point that is harder to test exhaustively.`,
        recommendation:
          'Consider decomposing into cascaded junctions for clarity and testability.',
      });
    }
  });

  // --- Unguarded transitions (not self-loop, condition is "true", no timer) ---
  transitions.forEach((t) => {
    if (t.sourceId === t.targetId) return; // self-loops handled above
    const condIsTrue = !t.condition || t.condition.trim() === 'true';
    const noTimer =
      t.afterTicks === null || t.afterTicks === undefined;
    if (condIsTrue && noTimer && t.type === 'condition') {
      const srcName = resolveName(t.sourceId, states, junctions);
      const tgtName = resolveName(t.targetId, states, junctions);
      cases.push({
        id: nextId(),
        category: 'unguarded',
        severity: 'warning',
        elementId: t.id,
        elementName: `${srcName} → ${tgtName}`,
        description: `Transition from "${srcName}" to "${tgtName}" has no guard condition and no timer — it will fire on the very first tick unconditionally.`,
        recommendation:
          'Add a guard condition or an "after" timer to control when this transition fires.',
      });
    }
  });

  // --- Timer overflow risk ---
  transitions.forEach((t) => {
    if (t.afterTicks !== null && t.afterTicks !== undefined && t.afterTicks > 0) {
      const totalMs = t.afterTicks * tickMs;
      const UINT32_MAX = 4294967295;
      if (totalMs > UINT32_MAX) {
        const srcName = resolveName(t.sourceId, states, junctions);
        cases.push({
          id: nextId(),
          category: 'timer_overflow',
          severity: 'critical',
          elementId: t.id,
          elementName: srcName,
          description: `Transition from "${srcName}" uses after(${t.afterTicks}) with tickMs=${tickMs}, yielding ${totalMs}ms which overflows uint32_t (max ${UINT32_MAX}).`,
          recommendation:
            'Reduce afterTicks or increase tickMs to stay within uint32_t range.',
        });
      }
    }
  });

  // --- Missing entry/exit actions ---
  states.forEach((s) => {
    const hasOutgoing = transitions.some((t) => t.sourceId === s.id);
    const hasIncoming = transitions.some((t) => t.targetId === s.id);
    if ((hasOutgoing || hasIncoming) && !s.entry && !s.exit && !s.during) {
      cases.push({
        id: nextId(),
        category: 'missing_action',
        severity: 'info',
        elementId: s.id,
        elementName: s.name,
        description: `State "${s.name}" has transitions but no entry, during, or exit actions defined. It is a pass-through state with no observable behavior.`,
        recommendation:
          'Add at least an entry or during action, or document why this state is intentionally passive.',
      });
    }
  });

  return cases;
};

// ─── 3. Test Scenario Generation ─────────────────────────────────────────────

const generateTestScenarios = (
  states: StateData[],
  junctions: JunctionData[],
  transitions: TransitionData[],
  variables: VariableDef[],
  criticalPaths: CriticalPath[],
  cornerCases: CornerCase[],
): TestScenario[] => {
  const scenarios: TestScenario[] = [];
  let tsId = 0;
  const nextId = () => `TS-${String(++tsId).padStart(3, '0')}`;

  // ── A. Critical path walk-throughs ──
  criticalPaths.forEach((cp) => {
    const steps: TestStep[] = [];

    // Initial step: set up autostart
    steps.push({
      action: 'Call SM_Init() to enter autostart state',
      expected: `System enters state "${cp.states[0]}"`,
    });

    for (let i = 0; i < cp.transitions.length; i++) {
      const cond = cp.transitions[i];
      const fromState = cp.states[i];
      const toState = cp.states[i + 1];
      steps.push({
        action:
          cond === 'true'
            ? `Call SM_Step() — transition fires unconditionally from "${fromState}"`
            : `Set variables to satisfy [${cond}], then call SM_Step()`,
        expected: `System transitions from "${fromState}" to "${toState}"`,
      });
    }

    scenarios.push({
      id: nextId(),
      name: `Walk-through: ${cp.name}`,
      category: 'critical_path',
      preconditions: [
        'System is powered on and SM_Init() has been called',
        ...variables
          .filter((v) => v.initialValue)
          .slice(0, 5)
          .map((v) => `${v.name} = ${v.initialValue}`),
      ],
      steps,
      expectedResult: `System reaches terminal state "${cp.states[cp.states.length - 1]}" without crashes or assertion failures.`,
      relatedCriticalPath: cp.id,
    });
  });

  // ── B. Corner case boundary tests ──
  cornerCases.forEach((cc) => {
    const steps: TestStep[] = [];

    switch (cc.category) {
      case 'deadlock':
        steps.push(
          {
            action: `Navigate the system to state "${cc.elementName}"`,
            expected: `System is in state "${cc.elementName}"`,
          },
          {
            action: 'Call SM_Step() repeatedly (100 ticks)',
            expected: `System remains in "${cc.elementName}" — verify no memory corruption or watchdog timeout`,
          },
          {
            action: 'Verify SM_GetActive() returns expected enum',
            expected: `Active state is SM_ST_${cc.elementName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
          },
        );
        break;

      case 'unreachable':
        steps.push(
          {
            action: 'Call SM_Init() and verify initial state',
            expected: 'System starts in autostart state, NOT in the unreachable state',
          },
          {
            action: `Attempt to reach "${cc.elementName}" through all known paths`,
            expected: `No valid path leads to "${cc.elementName}" — confirm this is intentional`,
          },
        );
        break;

      case 'self_loop':
        steps.push(
          {
            action: `Navigate to the state with self-loop ("${cc.elementName}")`,
            expected: `System is in "${cc.elementName}"`,
          },
          {
            action: 'Call SM_Step() 1000 times rapidly',
            expected:
              'No stack overflow, no memory leak, state_timer behaves correctly',
          },
        );
        break;

      case 'race_condition':
        steps.push(
          {
            action: `Navigate to "${cc.elementName}" and set conditions to trigger the race`,
            expected: 'System is in the source state',
          },
          {
            action: 'Call SM_Step() and observe which transition fires',
            expected:
              'The transition with the highest priority fires deterministically',
          },
        );
        break;

      case 'timer_overflow':
        steps.push(
          {
            action: 'Navigate to the state with the long timer',
            expected: 'state_timer starts counting',
          },
          {
            action: 'Fast-forward state_timer near UINT32_MAX',
            expected:
              'No overflow — system either saturates at UINT32_MAX or handles the wrap-around correctly',
          },
        );
        break;

      default:
        steps.push({
          action: `Review behavior of "${cc.elementName}"`,
          expected: 'Confirm behavior matches design intent',
        });
    }

    scenarios.push({
      id: nextId(),
      name: `Corner Case: ${cc.category.replace(/_/g, ' ')} — ${cc.elementName}`,
      category: 'corner_case',
      preconditions: ['SM_Init() called', 'System in known good state'],
      steps,
      expectedResult: `System handles the ${cc.category.replace(/_/g, ' ')} gracefully with no crash, hang, or undefined behavior.`,
      relatedCornerCase: cc.id,
    });
  });

  // ── C. Junction branch-coverage tests ──
  junctions.forEach((j) => {
    const outgoing = transitions.filter((t) => t.sourceId === j.id);
    if (outgoing.length < 2) return;

    outgoing.forEach((t, branchIdx) => {
      const targetName = resolveName(t.targetId, states, junctions);
      const cond = t.condition || 'true';

      scenarios.push({
        id: nextId(),
        name: `Branch Coverage: Junction "${j.name}" → branch ${branchIdx + 1} → "${targetName}"`,
        category: 'branch_coverage',
        preconditions: [
          'SM_Init() called',
          `System has reached junction "${j.name}"`,
        ],
        steps: [
          {
            action:
              cond === 'true'
                ? 'No specific variable setup needed (unconditional branch)'
                : `Set variables to satisfy [${cond}]`,
            expected: `Condition [${cond}] evaluates to true`,
          },
          {
            action: 'Call SM_Step()',
            expected: `System transitions through junction "${j.name}" to "${targetName}"`,
          },
        ],
        expectedResult: `Branch ${branchIdx + 1} of junction "${j.name}" is exercised, arriving at "${targetName}".`,
      });
    });
  });

  // ── D. Safety mode test ──
  const hasSafeState = states.some((s) => s.isSafeState);
  if (hasSafeState) {
    const safeStates = states.filter((s) => s.isSafeState);
    scenarios.push({
      id: nextId(),
      name: 'Safety: Error triggers safe-state transition',
      category: 'safety',
      preconditions: [
        'SM_Init() called',
        'Safety mode is enabled',
        `Safe state(s) defined: ${safeStates.map((s) => s.name).join(', ')}`,
      ],
      steps: [
        {
          action: 'Inject SM_ERR_SAFETY_VIOLATION via SM_Safety_Check()',
          expected: 'SM_GetError() returns SM_ERR_SAFETY_VIOLATION',
        },
        {
          action: 'Call SM_Step()',
          expected: 'System transitions to SM_NODE_ERROR state',
        },
        {
          action: 'Verify no further state transitions occur',
          expected: 'Active state remains SM_NODE_ERROR until reset',
        },
      ],
      expectedResult:
        'Safety mechanism correctly halts the state machine on error.',
    });
  }

  return scenarios;
};

// ─── Main entry point ────────────────────────────────────────────────────────

export const analyzeStateMachine = (chart: {
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: Layer[];
  safetyMode: boolean;
}): SMAnalysisResult => {
  const { states, junctions, transitions, variables, tickMs } = chart;

  // 1. Critical paths
  const criticalPaths = computeCriticalPaths(states, junctions, transitions);

  // 2. Corner cases
  const cornerCases = detectCornerCases(
    states,
    junctions,
    transitions,
    variables,
    tickMs,
  );

  // 3. Test scenarios
  const testScenarios = generateTestScenarios(
    states,
    junctions,
    transitions,
    variables,
    criticalPaths,
    cornerCases,
  );

  // 4. Metrics
  const adj = buildAdjacencyList(transitions);
  const autostart = states.find(
    (s) => s.autostart && (!s.parentId || s.parentId === 'root'),
  );
  const autostartJunction = junctions.find(
    (j) => j.autostart && (!j.parentId || j.parentId === 'root'),
  );
  const startId = autostart?.id || autostartJunction?.id;

  let reachableCount = 0;
  if (startId) {
    const reachable = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      transitions
        .filter((t) => t.sourceId === cur)
        .forEach((t) => {
          if (!reachable.has(t.targetId)) queue.push(t.targetId);
        });
    }
    reachableCount = states.filter((s) => reachable.has(s.id)).length;
  }

  // Branch coverage: fraction of transitions covered by test scenarios
  const coveredTransitionIds = new Set<string>();
  transitions.forEach((t) => {
    // A transition is "covered" if either it's on a critical path or a scenario references its condition
    const onCritical = criticalPaths.some((cp) =>
      cp.transitions.includes(t.condition || 'true'),
    );
    if (onCritical) coveredTransitionIds.add(t.id);
  });
  // Junction branches are always covered
  junctions.forEach((j) => {
    transitions.filter((t) => t.sourceId === j.id).forEach((t) => {
      coveredTransitionIds.add(t.id);
    });
  });

  const rawPaths = startId ? enumeratePaths(startId, adj) : [];

  return {
    criticalPaths,
    cornerCases,
    testScenarios,
    metrics: {
      totalPaths: rawPaths.length,
      maxPathLength: criticalPaths.length > 0 ? criticalPaths[0].states.length : 0,
      stateReachability:
        states.length > 0 ? (reachableCount / states.length) * 100 : 0,
      branchCoverage:
        transitions.length > 0
          ? (coveredTransitionIds.size / transitions.length) * 100
          : 0,
    },
  };
};
