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
import { buildSemanticModel } from './stateMachine/smSemanticBuilder';
import { migrateStateMachineModel } from './stateMachine/smModelMigration';
import type {
  LegacyStateMachineModel,
  ModelDiagnostic,
} from './stateMachine/smModel';
import type { SemanticModel } from './stateMachine/smSemanticModel';

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
  diagnostics: ModelDiagnostic[];
  semantic: {
    tickMs: number;
    stateCount: number;
    transitionCount: number;
    junctionCount: number;
    variableCount: number;
    layerCount: number;
    activeSlotCount: number;
    reachableStateIds: string[];
    unreachableStateIds: string[];
    terminalStateIds: string[];
    orLayerIds: string[];
    andLayerIds: string[];
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

const getReachableNodes = (
  states: StateData[],
  junctions: JunctionData[],
  transitions: TransitionData[],
  layers: Layer[],
): Set<string> => {
  const reachable = new Set<string>();
  const autostarts = states.filter(
    (s) => s.autostart && (!s.parentId || s.parentId === 'root'),
  );
  const autostartJunctions = junctions.filter(
    (j) => j.autostart && (!j.parentId || j.parentId === 'root'),
  );
  const startIds = [...autostarts.map(s => s.id), ...autostartJunctions.map(j => j.id)];
  if (startIds.length === 0) {
    const rootStates = states.filter(s => !s.parentId || s.parentId === 'root');
    const rootParallel = rootStates.length > 0 && rootStates.every(s => s.isParallel);
    if (rootParallel) {
      startIds.push(...rootStates.map(s => s.id));
    }
  }

  if (startIds.length === 0) return reachable;

  const queue = [...startIds];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);

    const stateObj = states.find(s => s.id === cur);
    if (stateObj?.isTerminalState === true || stateObj?.isTerminal === true) {
      continue;
    }

    const junctionObj = junctions.find((junction) => junction.id === cur);
    if (
      junctionObj
      && (junctionObj.type === 'history' || junctionObj.type === 'deep-history')
      && junctionObj.parentId
      && junctionObj.parentId !== 'root'
    ) {
      if (!reachable.has(junctionObj.parentId)) queue.push(junctionObj.parentId);
      continue;
    }

    // Follow transitions
    transitions
      .filter((t) => t.sourceId === cur)
      .forEach((t) => {
        if (!reachable.has(t.targetId)) queue.push(t.targetId);
      });

    // Enter child layers implicitly
    if (stateObj) {
      const childLayers = layers.filter(l => l.parentStateId === stateObj.id);
      childLayers.forEach(cl => {
        const layerStates = states.filter(s => cl.stateIds.includes(s.id));
        const allParallel = layerStates.length > 0 && layerStates.every(s => s.isParallel);

        if (allParallel) {
          for (const parallelState of layerStates) {
            if (!reachable.has(parallelState.id)) queue.push(parallelState.id);
          }
        } else {
          const defaultState = layerStates.find(s => s.autostart);
          if (defaultState) {
            if (!reachable.has(defaultState.id)) queue.push(defaultState.id);
          } else {
            const defaultJunc = junctions.find(j => cl.junctionIds.includes(j.id) && j.autostart);
            if (defaultJunc) {
              if (!reachable.has(defaultJunc.id)) queue.push(defaultJunc.id);
            } else if (layerStates.length > 0) {
              if (!reachable.has(layerStates[0].id)) queue.push(layerStates[0].id);
            }
          }
        }
      });
    }
  }

  return reachable;
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
  tickMs: number,
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

      let condStr = transition.condition || 'true';
      if (transition.afterTicks !== null && transition.afterTicks !== undefined) {
        const msVal = transition.afterTicks * tickMs;
        const sVal = msVal / 1000;
        const timerText = `after(${transition.afterTicks} ticks / ${sVal} s)`;
        if (transition.type === 'after') {
          condStr = timerText;
        } else if (transition.type === 'and') {
          condStr = `(${transition.condition}) && ${timerText}`;
        } else if (transition.type === 'or') {
          condStr = `(${transition.condition}) || ${timerText}`;
        }
      }

      conditions.push(condStr);
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
  tickMs: number,
): CriticalPath[] => {
  const adj = buildAdjacencyList(transitions);

  // Find all autostart elements (root level)
  const autostarts = states.filter(
    (s) => s.autostart && (!s.parentId || s.parentId === 'root'),
  );
  const autostartJunctions = junctions.filter(
    (j) => j.autostart && (!j.parentId || j.parentId === 'root'),
  );

  const startIds = [...autostarts.map(s => s.id), ...autostartJunctions.map(j => j.id)];
  if (startIds.length === 0) {
    const rootStates = states.filter(s => !s.parentId || s.parentId === 'root');
    const rootParallel = rootStates.length > 0 && rootStates.every(s => s.isParallel);
    if (rootParallel) {
      startIds.push(...rootStates.map(s => s.id));
    }
  }

  if (startIds.length === 0) return [];

  const rawPaths: RawPath[] = [];
  for (const startId of startIds) {
    rawPaths.push(...enumeratePaths(startId, adj, tickMs));
  }
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
  layers: Layer[],
  tickMs: number,
): CornerCase[] => {
  const cases: CornerCase[] = [];
  let ccId = 0;
  const nextId = () => `CC-${String(++ccId).padStart(3, '0')}`;

  // --- Deadlock states ---
  states.forEach((s) => {
    let hasOutgoing = false;
    let curr: StateData | undefined = s;
    while (curr) {
      if (transitions.some((t) => t.sourceId === curr!.id)) {
        hasOutgoing = true;
        break;
      }
      curr = curr.parentId ? states.find((p) => p.id === curr!.parentId) : undefined;
    }

    if (!hasOutgoing && !s.isSafeState && !s.isTerminalState && !s.isTerminal) {
      cases.push({
        id: nextId(),
        category: 'deadlock',
        severity: 'critical',
        elementId: s.id,
        elementName: s.name,
        description: `State "${s.name}" and all its ancestors have no outgoing transitions, and it is not marked as a safe-state or terminal state. The system will be trapped here permanently.`,
        recommendation:
          `Add an outgoing transition from State '${s.name}' or mark it as an intentional terminal state in the model.`,
      });
    }
  });

  // --- Unreachable states ---
  const reachable = getReachableNodes(states, junctions, transitions, layers);
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
  layers: Layer[],
): TestScenario[] => {
  const reachableSet = getReachableNodes(states, junctions, transitions, layers);
  const scenarios: TestScenario[] = [];
  let tsId = 0;
  const nextId = () => `TS-${String(++tsId).padStart(3, '0')}`;

  // ── A. Critical path walk-throughs ──
  criticalPaths.forEach((cp) => {
    // REQ-R-01: Exclude paths containing unreachable states
    const hasUnreachable = cp.states.some(stName => {
      const st = states.find(s => s.name === stName);
      return st && !reachableSet.has(st.id);
    });
    if (hasUnreachable) return;

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

      let actionText = '';
      if (cond.includes('after(')) {
        const match = cond.match(/after\(([^)]+)\)/);
        const timerDetails = match ? match[1] : 'timer expiration';
        
        if (cond.startsWith('after(')) {
          const ticks = timerDetails.match(/^(\d+)\s+ticks?/)?.[1] ?? 'the required number of';
          actionText = `Call SM_Step(&instance, SM_TICK_MS) ${ticks} times`;
        } else if (cond.includes('&&')) {
          const guard = cond.split('&&')[0].trim();
          const ticks = timerDetails.match(/^(\d+)\s+ticks?/)?.[1] ?? 'the required number of';
          actionText = `Set variables to satisfy ${guard}, then call SM_Step(&instance, SM_TICK_MS) ${ticks} times`;
        } else if (cond.includes('||')) {
          const guard = cond.split('||')[0].trim();
          const ticks = timerDetails.match(/^(\d+)\s+ticks?/)?.[1] ?? 'the required number of';
          actionText = `Set variables to satisfy ${guard} before one SM_Step(&instance, SM_TICK_MS), OR call SM_Step(&instance, SM_TICK_MS) ${ticks} times`;
        } else {
          const ticks = timerDetails.match(/^(\d+)\s+ticks?/)?.[1] ?? 'the required number of';
          actionText = `Call SM_Step(&instance, SM_TICK_MS) ${ticks} times`;
        }
      } else if (cond === 'true') {
        actionText = `Call SM_Step(&instance, SM_TICK_MS) — transition fires unconditionally from "${fromState}"`;
      } else {
        actionText = `Set variables to satisfy [${cond}], then call SM_Step(&instance, SM_TICK_MS)`;
      }

      steps.push({
        action: actionText,
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
    // REQ-R-01: Skip scenario generation for unreachable elements
    if (cc.elementId && states.some(s => s.id === cc.elementId && !reachableSet.has(s.id))) return;

    const steps: TestStep[] = [];

    switch (cc.category) {
      case 'deadlock':
        steps.push(
          {
            action: `Navigate the system to state "${cc.elementName}"`,
            expected: `System is in state "${cc.elementName}"`,
          },
          {
            action: 'Call SM_Step(&instance, SM_TICK_MS) repeatedly (100 ticks)',
            expected: `System remains in "${cc.elementName}" — verify no memory corruption or watchdog timeout`,
          },
          {
            action: 'Verify SM_GetActive() returns expected enum',
            expected: `Active state is SM_ST_${cc.elementName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
          },
        );
        break;

      case 'unreachable':
        // REQ-R-01: Exclude unreachable states from test scenario steps
        return;

      case 'self_loop':
        steps.push(
          {
            action: `Navigate to the state with self-loop ("${cc.elementName}")`,
            expected: `System is in "${cc.elementName}"`,
          },
          {
            action: 'Call SM_Step(&instance, SM_TICK_MS) 1000 times',
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
            action: 'Call SM_Step(&instance, SM_TICK_MS) and observe which transition fires',
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
            action: 'Call SM_Step(&instance, SM_TICK_MS)',
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
          action: 'Call SM_Step(&instance, SM_TICK_MS + 1U) in the host integration harness to induce a timing fault',
          expected: `SM_GetError(&instance) returns SM_ERR_TIMING and safe state "${safeStates[0].name}" becomes active`,
        },
        {
          action: 'Observe the mapped MCAL outputs immediately after the failed step',
          expected: 'Configured safe output values are committed and instance.fault_latched is true',
        },
        {
          action: 'Call SM_Reset(&instance) after recording the fault evidence',
          expected: 'The chart returns to its modeled default configuration and restored outputs are committed',
        },
      ],
      expectedResult:
        `The fault is latched, safe outputs are committed, and modeled safe state "${safeStates[0].name}" is active until explicit reset.`,
    });
  }

  return scenarios;
};

// ─── Main entry point ────────────────────────────────────────────────────────

const analyzeProjectedModel = (chart: {
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: Layer[];
  safetyMode: boolean;
}): SMAnalysisResult => {
  const { states, junctions, transitions, variables, layers = [], tickMs } = chart;

  // 1. Critical paths
  const criticalPaths = computeCriticalPaths(states, junctions, transitions, tickMs);

  // 2. Corner cases
  const cornerCases = detectCornerCases(
    states,
    junctions,
    transitions,
    variables,
    layers,
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
    layers,
  );

  // 4. Metrics
  const adj = buildAdjacencyList(transitions);
  const reachableForMetrics = getReachableNodes(states, junctions, transitions, layers);
  const reachableCount = states.filter((s) => reachableForMetrics.has(s.id)).length;

  const startIds: string[] = [];
  const autostarts = states.filter(
    (s) => s.autostart && (!s.parentId || s.parentId === 'root'),
  );
  const autostartJunctions = junctions.filter(
    (j) => j.autostart && (!j.parentId || j.parentId === 'root'),
  );
  startIds.push(...autostarts.map(s => s.id), ...autostartJunctions.map(j => j.id));
  if (startIds.length === 0) {
    const rootStates = states.filter(s => !s.parentId || s.parentId === 'root');
    const rootParallel = rootStates.length > 0 && rootStates.every(s => s.isParallel);
    if (rootParallel) {
      startIds.push(...rootStates.map(s => s.id));
    }
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

  const rawPaths: RawPath[] = [];
  if (startIds.length > 0) {
    for (const sid of startIds) {
      rawPaths.push(...enumeratePaths(sid, adj, tickMs));
    }
  }

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
    diagnostics: [],
    semantic: {
      tickMs,
      stateCount: states.length,
      transitionCount: transitions.length,
      junctionCount: junctions.length,
      variableCount: variables.length,
      layerCount: layers.length,
      activeSlotCount: 0,
      reachableStateIds: states
        .filter((state) => reachableForMetrics.has(state.id))
        .map((state) => state.id),
      unreachableStateIds: states
        .filter((state) => !reachableForMetrics.has(state.id))
        .map((state) => state.id),
      terminalStateIds: states
        .filter((state) => state.isTerminalState === true || state.isTerminal === true)
        .map((state) => state.id),
      orLayerIds: [],
      andLayerIds: [],
    },
  };
};

const projectSemanticModel = (ir: SemanticModel): {
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: Layer[];
  safetyMode: boolean;
} => {
  const states = Object.values(ir.states)
    .sort((left, right) => left.activityIndex - right.activityIndex)
    .map((state): StateData => {
      const layer = ir.layers[state.layerId];
      return {
        id: state.id,
        name: state.name,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        entry: state.entrySource,
        during: state.duringSource,
        exit: state.exitSource,
        isActive: false,
        color: '',
        parentId: state.parentStateId,
        children: [...state.childLayerIds],
        priority: state.priority,
        isParallel: layer.decomposition === 'AND',
        regionId: state.layerId,
        autostart: layer.decomposition === 'AND'
          || (
            layer.defaultEntryKind === 'state'
            && layer.defaultEntryId === state.id
          ),
        isSafeState: ir.safeStateId === state.id,
        isTerminalState: state.terminal,
      };
    });

  const junctions = Object.values(ir.junctions).map((junction): JunctionData => {
    const layer = ir.layers[junction.layerId];
    return {
      id: junction.id,
      x: 0,
      y: 0,
      name: junction.id,
      color: '',
      parentId: layer.parentStateId,
      type: junction.kind,
      autostart: layer.defaultEntryKind === 'junction'
        && layer.defaultEntryId === junction.id,
    };
  });

  const transitions = Object.values(ir.transitions)
    .filter((transition) =>
      transition.kind !== 'internal-action'
      && ir.states[transition.sourceStateId]?.terminal !== true)
    .map((transition): TransitionData => ({
      id: transition.id,
      sourceId: transition.sourceStateId,
      targetId: transition.destinationStateId,
      condition: transition.guardSource,
      action: transition.actionSource,
      afterTicks: transition.afterTicks,
      type: transition.triggerMode,
      hasControlPoint: false,
      order: transition.priority,
      isInternal: transition.kind === 'inner',
    }));

  const variables = Object.values(ir.variables).map((variable): VariableDef => ({
    id: variable.id,
    name: variable.name,
    type: variable.type,
    initialValue: String(variable.initialValue),
    currentValue: variable.initialValue,
    visibleInScope: true,
  }));

  const layers = Object.values(ir.layers).map((layer): Layer => ({
    id: layer.id,
    name: layer.name,
    parentStateId: layer.parentStateId,
    stateIds: [...layer.children],
    transitionIds: [...layer.transitionIds],
    junctionIds: [...layer.junctionIds],
  }));

  return {
    tickMs: ir.tickMs,
    states,
    junctions,
    transitions,
    variables,
    layers,
    safetyMode: ir.safetyMode,
  };
};

const diagnosticsOnlyAnalysis = (
  diagnostics: ModelDiagnostic[],
): SMAnalysisResult => ({
  criticalPaths: [],
  cornerCases: [],
  testScenarios: [],
  metrics: {
    totalPaths: 0,
    maxPathLength: 0,
    stateReachability: 0,
    branchCoverage: 0,
  },
  diagnostics,
  semantic: {
    tickMs: 0,
    stateCount: 0,
    transitionCount: 0,
    junctionCount: 0,
    variableCount: 0,
    layerCount: 0,
    activeSlotCount: 0,
    reachableStateIds: [],
    unreachableStateIds: [],
    terminalStateIds: [],
    orLayerIds: [],
    andLayerIds: [],
  },
});

export const analyzeSemanticModel = (ir: SemanticModel): SMAnalysisResult => {
  const analysis = analyzeProjectedModel(projectSemanticModel(ir));
  return {
    ...analysis,
    semantic: {
      ...analysis.semantic,
      tickMs: ir.tickMs,
      stateCount: Object.keys(ir.states).length,
      transitionCount: Object.values(ir.transitions)
        .filter((transition) => transition.kind !== 'internal-action').length,
      junctionCount: Object.keys(ir.junctions).length,
      variableCount: Object.keys(ir.variables).length,
      layerCount: Object.keys(ir.layers).length,
      activeSlotCount: ir.activeSlotCount,
      terminalStateIds: Object.values(ir.states)
        .filter((state) => state.terminal)
        .sort((left, right) => left.activityIndex - right.activityIndex)
        .map((state) => state.id),
      orLayerIds: Object.values(ir.layers)
        .filter((layer) => layer.decomposition === 'OR')
        .map((layer) => layer.id)
        .sort(),
      andLayerIds: Object.values(ir.layers)
        .filter((layer) => layer.decomposition === 'AND')
        .map((layer) => layer.id)
        .sort(),
    },
  };
};

export const analyzeStateMachine = (
  chart: LegacyStateMachineModel,
): SMAnalysisResult => {
  const migrated = migrateStateMachineModel(chart);
  const built = buildSemanticModel(migrated.model);
  const diagnostics = [...migrated.diagnostics, ...built.diagnostics];
  if (built.ir === undefined) return diagnosticsOnlyAnalysis(diagnostics);
  return {
    ...analyzeSemanticModel(built.ir),
    diagnostics,
  };
};
