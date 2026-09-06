import { describe, it, expect } from 'vitest';
import { analyzeStateMachine } from './smAnalysisEngine';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';
import { flatOrFixture } from './stateMachine/smFixtures';

describe('smAnalysisEngine', () => {
  const mockVariables: VariableDef[] = [
    { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
    { id: 'v2', name: 'counter', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];

  const mockLayers: Layer[] = [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1', 's2', 's3'], transitionIds: ['t1', 't2'], junctionIds: [] }
  ];

  it('validates and analyzes a legacy chart through the semantic model', () => {
    const result = analyzeStateMachine({
      tickMs: 10,
      states: [
        {
          id: 'start', name: 'Start', x: 0, y: 0, width: 100, height: 100,
          entry: '', during: '', exit: '',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
        },
        {
          id: 'unused', name: 'Unused', x: 0, y: 0, width: 100, height: 100,
          entry: '', during: '', exit: '',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
          isTerminalState: true,
        },
      ],
      junctions: [],
      transitions: [],
      variables: [],
      layers: [{
        id: 'root',
        name: 'root',
        parentStateId: null,
        stateIds: ['start', 'unused'],
        transitionIds: [],
        junctionIds: [],
      }],
      safetyMode: false,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.semantic.reachableStateIds).toEqual(['start']);
    expect(result.semantic.unreachableStateIds).toEqual(['unused']);
    expect(result.semantic.terminalStateIds).toEqual(['unused']);
    expect(result.metrics.stateReachability).toBe(50);
  });

  it('retains semantic state action sources without false missing-action findings', () => {
    const model = flatOrFixture();
    model.states[0].entry = 'total = total + 1;';

    const result = analyzeStateMachine(model);

    expect(result.cornerCases).not.toContainEqual(expect.objectContaining({
      category: 'missing_action',
      elementId: 'a',
    }));
  });

  it('describes temporal and safety scenarios with the generated public API', () => {
    const model = flatOrFixture();
    model.transitions[0].type = 'after';
    model.transitions[0].afterTicks = 3;
    model.safetyMode = true;
    model.states[1].isSafeState = true;

    const result = analyzeStateMachine(model);
    const temporal = result.testScenarios.find(
      (scenario) => scenario.category === 'critical_path',
    );
    const safety = result.testScenarios.find(
      (scenario) => scenario.category === 'safety',
    );

    expect(temporal?.steps.some((step) =>
      step.action.includes('SM_Step(&instance, SM_TICK_MS) 3 times'))).toBe(true);
    expect(temporal?.steps.map((step) => step.action).join(' ')).not.toContain('Wait for');
    expect(safety?.steps.map((step) => step.action).join(' ')).toContain(
      'SM_Step(&instance, SM_TICK_MS + 1U)',
    );
    expect(safety?.steps.map((step) => step.expected).join(' ')).toContain('B');
    expect(safety?.steps.map((step) => step.expected).join(' ')).not.toContain(
      'SM_NODE_ERROR',
    );
  });

  it('should identify critical paths correctly', () => {
    // Linear path s1 -> s2 -> s3
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: 'counter = 0;', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      },
      {
        id: 's3', name: 'StateC', x: 400, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'red', parentId: 'root', children: [],
        priority: 3, isParallel: false, regionId: 'MAIN', autostart: false,
        isSafeState: true // Mark as safe state to avoid deadlock corner case
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'sensor_val > 10.0', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      },
      {
        id: 't2', sourceId: 's2', targetId: 's3',
        condition: 'counter >= 50', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    expect(result.criticalPaths).toHaveLength(1);
    expect(result.criticalPaths[0].states).toEqual(['StateA', 'StateB', 'StateC']);
    expect(result.criticalPaths[0].transitions).toEqual(['sensor_val > 10.0', 'counter >= 50']);
    expect(result.metrics.maxPathLength).toBe(3);
    expect(result.metrics.totalPaths).toBe(1);
  });

  it('should detect deadlock corner cases', () => {
    // StateC is terminal but not marked as isSafeState
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: 'counter = 0;', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'true', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const deadlocks = result.cornerCases.filter(c => c.category === 'deadlock');
    expect(deadlocks).toHaveLength(1);
    expect(deadlocks[0].elementName).toBe('StateB');
  });

  it('should detect unreachable state corner cases', () => {
    // s3 is unreachable because no transitions lead to it
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: 'counter = 0;', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
        isSafeState: true
      },
      {
        id: 's3', name: 'StateC', x: 400, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'red', parentId: 'root', children: [],
        priority: 3, isParallel: false, regionId: 'MAIN', autostart: false,
        isSafeState: true
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'true', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const unreachable = result.cornerCases.filter(c => c.category === 'unreachable');
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].elementName).toBe('StateC');
  });

  it('should detect unconditional self-loops', () => {
    // Transition t1 goes s1 -> s1 with condition 'true' and no timer
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: 'counter = 0;', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's1',
        condition: 'true', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const selfLoops = result.cornerCases.filter(c => c.category === 'self_loop');
    expect(selfLoops).toHaveLength(1);
    expect(selfLoops[0].elementName).toBe('StateA');
  });

  it('should detect race conditions and timer overflows', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
        isSafeState: true
      }
    ];

    const transitions: TransitionData[] = [
      // Race: two transitions from s1 to s2 with identical condition
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'sensor_val > 5.0', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      },
      {
        id: 't2', sourceId: 's1', targetId: 's2',
        condition: 'sensor_val > 5.0', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 2
      },
      // Timer overflow: afterTicks * tickMs yields value > UINT32_MAX
      {
        id: 't3', sourceId: 's2', targetId: 's1',
        condition: 'true', action: '',
        afterTicks: 450000000, type: 'after', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const races = result.cornerCases.filter(c => c.category === 'race_condition');
    expect(races).toHaveLength(1);
    expect(races[0].elementName).toBe('StateA');

    const overflows = result.cornerCases.filter(c => c.category === 'timer_overflow');
    expect(overflows).toHaveLength(1);
    expect(overflows[0].elementName).toBe('StateB');
  });

  it('should generate test scenarios for critical paths and corner cases', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
        isSafeState: true
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'sensor_val > 2.0', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: true
    });

    expect(result.testScenarios).not.toHaveLength(0);
    
    // Should have critical path scenario
    const pathScenario = result.testScenarios.find(s => s.category === 'critical_path');
    expect(pathScenario).toBeDefined();
    expect(pathScenario?.steps[0].action).toContain('Call SM_Init()');
    expect(pathScenario?.steps[1].action).toContain('Set variables to satisfy [sensor_val > 2.0]');

    // Should have safety scenario since safetyMode = true
    const safetyScenario = result.testScenarios.find(s => s.category === 'safety');
    expect(safetyScenario).toBeDefined();
    expect(safetyScenario?.name).toContain('Safety: Error triggers safe-state transition');
  });

  it('should support parallel states and analyze their reachability correctly', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: true, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: true, regionId: 'MAIN', autostart: true
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions: [],
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: [] }],
      safetyMode: false
    });

    // Both should be reachable since they are parallel and marked autostart
    expect(result.metrics.stateReachability).toBe(100);
    expect(result.cornerCases.filter(c => c.category === 'unreachable')).toHaveLength(0);
  });

  it('should support hierarchical layers and analyze nested state reachability correctly', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'ParentState', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'NestedState', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'child_layer', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: true
      }
    ];

    const layers: Layer[] = [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] },
      { id: 'child_layer', name: 'child_layer', parentStateId: 's1', stateIds: ['s2'], transitionIds: [], junctionIds: [] }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions: [],
      variables: mockVariables,
      layers,
      safetyMode: false
    });

    // Both parent and nested autostart states should be reachable
    expect(result.metrics.stateReachability).toBe(100);
    expect(result.cornerCases.filter(c => c.category === 'unreachable')).toHaveLength(0);
  });

  it('should not detect deadlock in nested states when parent state has an outgoing transition', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'ParentState', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'NestedState', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 's1', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's3', name: 'TargetState', x: 400, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'yellow', parentId: 'root', children: [],
        priority: 3, isParallel: false, regionId: 'MAIN', autostart: false
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's3',
        condition: 'sensor_val > 5', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const layers: Layer[] = [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1', 's3'], transitionIds: ['t1'], junctionIds: [] },
      { id: 'child_layer', name: 'child_layer', parentStateId: 's1', stateIds: ['s2'], transitionIds: [], junctionIds: [] }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers,
      safetyMode: false
    });

    const deadlocks = result.cornerCases.filter(c => c.category === 'deadlock');
    // NestedState does not have outgoing transitions itself, but ParentState does.
    // So NestedState should NOT be reported as a deadlock. Only TargetState (s3) has no outgoing transitions.
    expect(deadlocks).toHaveLength(1);
    expect(deadlocks[0].elementName).toBe('TargetState');
  });

  it('should suppress deadlock warning if state is marked isTerminalState', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
        isTerminalState: true
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'true', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const deadlocks = result.cornerCases.filter(c => c.category === 'deadlock');
    expect(deadlocks).toHaveLength(0);
  });

  it('should identify non-terminal states with zero outgoing transitions as critical deadlocks (REQ-V-01)', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'Start', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'DeadEnd', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'red', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
        isTerminal: false
      },
      {
        id: 's3', name: 'FinalState', x: 400, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 3, isParallel: false, regionId: 'MAIN', autostart: false,
        isTerminal: true
      }
    ];

    const transitions: TransitionData[] = [
      {
        id: 't1', sourceId: 's1', targetId: 's2',
        condition: 'sensor_val > 0', action: '',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const deadlocks = result.cornerCases.filter(c => c.category === 'deadlock');
    expect(deadlocks).toHaveLength(1);
    expect(deadlocks[0].elementId).toBe('s2');
    expect(deadlocks[0].severity).toBe('critical');
    expect(deadlocks[0].recommendation).toContain("Add an outgoing transition from State 'DeadEnd'");
  });

  it('should flag unreachable states and exclude them from test scenarios (REQ-V-02 & REQ-R-01)', () => {
    const states: StateData[] = [
      {
        id: 's1', name: 'Active', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's2', name: 'Isolated', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'red', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      }
    ];

    const transitions: TransitionData[] = [];

    const result = analyzeStateMachine({
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: mockVariables,
      layers: [{ ...mockLayers[0], stateIds: states.map((state) => state.id), transitionIds: transitions.map((transition) => transition.id) }],
      safetyMode: false
    });

    const unreachable = result.cornerCases.filter(c => c.category === 'unreachable');
    expect(unreachable.length).toBe(1);
    expect(unreachable[0].elementId).toBe('s2');

    const scenariosWithUnreachable = result.testScenarios.filter(ts =>
      ts.steps.some(step => step.action.includes('Isolated') || step.expected.includes('Isolated'))
    );
    expect(scenariosWithUnreachable.length).toBe(0);
  });

  it('provides C function metrics and deterministic identifier qualification', async () => {
    const { calculateCFunctionMetrics, allocateExternalIdentifiers } = await import('./smAnalysisEngine');

    const code = `
void SimpleTask(void) {
    int x = 1;
}
`;
    const metrics = calculateCFunctionMetrics(code, 'task.c');
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('SimpleTask');
    expect(metrics[0].parameterCount).toBe(0);
    expect(metrics[0].cyclomaticComplexity).toBe(1);
    expect(metrics[0].stackEstimateBytes).toBe('NOT_RUN');

    const ids = allocateExternalIdentifiers(['long_uuid_identifier_12345678901234567890'], 31);
    const allocated = ids.get('long_uuid_identifier_12345678901234567890');
    expect(allocated).toBeDefined();
    expect(allocated!.length).toBeLessThanOrEqual(31);
  });
});
