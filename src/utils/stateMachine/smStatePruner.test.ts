import { describe, it, expect } from 'vitest';
import { pruneStateHierarchy, pruneMultipleStatesHierarchy, countDescendants } from './smStatePruner';
import { StateData, Layer, JunctionData, TransitionData } from '../../types/sm_types';

describe('smStatePruner', () => {
  const rootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1'], junctionIds: [] };
  const childLayer: Layer = { id: 'l_child', name: 'ChildLayer', parentStateId: 's1', stateIds: ['s1_sub1'], transitionIds: ['t2'], junctionIds: ['j1'] };

  const s1: StateData = { id: 's1', name: 'State_1', x: 0, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 10, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s2: StateData = { id: 's2', name: 'State_2', x: 200, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 20, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s3: StateData = { id: 's3', name: 'State_3', x: 400, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 30, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s1_sub1: StateData = { id: 's1_sub1', name: 'Sub_1', x: 10, y: 10, width: 80, height: 80, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'l_child', children: [], priority: 10, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };

  const j1: JunctionData = { id: 'j1', name: 'J1', color: '#fff', x: 50, y: 50, type: 'junction', autostart: false, parentId: 'l_child' };
  const t1: TransitionData = { id: 't1', sourceId: 's1', targetId: 's2', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };
  const t2: TransitionData = { id: 't2', sourceId: 'j1', targetId: 's1_sub1', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };
  const t3: TransitionData = { id: 't3', sourceId: 's2', targetId: 's3', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };

  it('correctly counts descendant states and sub-layers', () => {
    const counts = countDescendants('s1', [s1, s2, s1_sub1], [rootLayer, childLayer]);
    expect(counts.stateCount).toBe(1);
    expect(counts.layerCount).toBe(1);
  });

  it('recursively prunes state and all descendant states, sub-layers, junctions, and transitions', () => {
    const result = pruneStateHierarchy('s1', {
      states: [s1, s2, s1_sub1],
      layers: [rootLayer, childLayer],
      junctions: [j1],
      transitions: [t1, t2]
    }, {
      currentLayerId: 'l_child',
      layerStack: ['root', 'l_child'],
      layerPath: ['Root', 'State_1']
    });

    expect(result.states.map(s => s.id)).toEqual(['s2']);
    expect(result.layers.map(l => l.id)).toEqual(['root']);
    expect(result.layers[0].stateIds).toEqual(['s2']);
    expect(result.junctions).toEqual([]);
    expect(result.transitions).toEqual([]);
    expect(result.navigation.currentLayerId).toBe('root');
    expect(result.navigation.layerStack).toEqual(['root']);
    expect(result.navigation.layerPath).toEqual(['Root']);
  });

  it('prunes multiple states simultaneously with all descendants and transitions (e.g. Ctrl+A delete)', () => {
    const multiRootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1', 's2', 's3'], transitionIds: ['t1', 't3'], junctionIds: [] };
    const result = pruneMultipleStatesHierarchy(['s1', 's2'], {
      states: [s1, s2, s3, s1_sub1],
      layers: [multiRootLayer, childLayer],
      junctions: [j1],
      transitions: [t1, t2, t3]
    }, {
      currentLayerId: 'root',
      layerStack: ['root'],
      layerPath: ['Root']
    });

    expect(result.states.map(s => s.id)).toEqual(['s3']);
    expect(result.layers.map(l => l.id)).toEqual(['root']);
    expect(result.layers[0].stateIds).toEqual(['s3']);
    expect(result.junctions).toEqual([]);
    expect(result.transitions).toEqual([]);
    expect(result.deletedStateIds).toContain('s1');
    expect(result.deletedStateIds).toContain('s2');
    expect(result.deletedStateIds).toContain('s1_sub1');
  });

  it('removes only the pruned state X-Bridges model without mutating a retained one', () => {
    const deletedState: StateData = {
      ...s1,
      isXBridges: true,
      xBridgesModel: {
        schemaVersion: 1,
        nodes: [],
        edges: [],
        mappings: [{
          smVarId: 'deleted_variable',
          blockId: 'deleted_block',
          portId: 'u',
          direction: 'in',
        }],
        solver: { kind: 'euler', stepSeconds: 0.01 },
        policy: { memory: 'reset', numericFault: 'escalate' },
      },
    };
    const retainedState: StateData = {
      ...s2,
      isXBridges: true,
      xBridgesModel: {
        schemaVersion: 1,
        nodes: [],
        edges: [],
        mappings: [{
          smVarId: 'retained_variable',
          blockId: 'retained_block',
          portId: 'y',
          direction: 'out',
        }],
        solver: { kind: 'euler', stepSeconds: 0.01 },
        policy: { memory: 'retain', numericFault: 'signal-only' },
      },
    };
    const retainedSnapshot = structuredClone(retainedState);

    const result = pruneStateHierarchy('s1', {
      states: [deletedState, retainedState],
      layers: [rootLayer],
      junctions: [],
      transitions: [t1],
    }, {
      currentLayerId: 'root',
      layerStack: ['root'],
      layerPath: ['Root'],
    });

    expect(result.states.map((state) => state.id)).toEqual(['s2']);
    expect(result.states[0]).toEqual(retainedSnapshot);
    expect(retainedState).toEqual(retainedSnapshot);
    expect(result.states).not.toContain(deletedState);
  });

  it('analyzes move rejecting self-descendant region and classifying transitions', async () => {
    const { analyzeStateMove, moveStateMachineElements } = await import('./smStatePruner');
    const snapshot = {
      states: [s1, s2, s1_sub1],
      layers: [rootLayer, childLayer],
      junctions: [j1],
      transitions: [t1, t2],
    };

    // Moving s1 into its child layer l_child must fail
    const circularMove = analyzeStateMove(snapshot, ['s1'], 'l_child');
    expect(circularMove.valid).toBe(false);
    expect(circularMove.reason).toMatch(/descendant/i);

    // Moving s2 into l_child causes t1 to cross region boundaries (invalid)
    const validMove = analyzeStateMove(snapshot, ['s2'], 'l_child');
    expect(validMove.valid).toBe(true);
    expect(validMove.invalid).toContain('t1');

    // Executing move with invalid transitions pruned
    const movedSnapshot = moveStateMachineElements(snapshot, ['s2'], 'l_child', ['t1']);
    expect(movedSnapshot.layers.find(l => l.id === 'l_child')?.stateIds).toContain('s2');
    expect(movedSnapshot.layers.find(l => l.id === 'root')?.stateIds).not.toContain('s2');
    expect(movedSnapshot.transitions.map(t => t.id)).not.toContain('t1');
  });
});
