import { describe, it, expect } from 'vitest';
import { analyzeStateMachine } from './smAnalysisEngine';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';

describe('smAnalysisEngine', () => {
  const mockVariables: VariableDef[] = [
    { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
    { id: 'v2', name: 'counter', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];

  const mockLayers: Layer[] = [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1', 's2', 's3'], transitionIds: ['t1', 't2'], junctionIds: [] }
  ];

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
      layers: mockLayers,
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
      layers: mockLayers,
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
      layers: mockLayers,
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
      layers: mockLayers,
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
      layers: mockLayers,
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
      layers: mockLayers,
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
      layers: mockLayers,
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
});

