import { describe, it, expect } from 'vitest';
import { pruneStateHierarchy, countDescendants } from './smStatePruner';
import { StateData, Layer, JunctionData, TransitionData } from '../../types/sm_types';

describe('smStatePruner', () => {
  const rootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1'], junctionIds: [] };
  const childLayer: Layer = { id: 'l_child', name: 'ChildLayer', parentStateId: 's1', stateIds: ['s1_sub1'], transitionIds: ['t2'], junctionIds: ['j1'] };

  const s1: StateData = { id: 's1', name: 'State_1', x: 0, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 10, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s2: StateData = { id: 's2', name: 'State_2', x: 200, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 20, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s1_sub1: StateData = { id: 's1_sub1', name: 'Sub_1', x: 10, y: 10, width: 80, height: 80, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'l_child', children: [], priority: 10, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };

  const j1: JunctionData = { id: 'j1', x: 50, y: 50, type: 'junction', autostart: false, parentId: 'l_child' };
  const t1: TransitionData = { id: 't1', sourceId: 's1', targetId: 's2', event: '', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };
  const t2: TransitionData = { id: 't2', sourceId: 'j1', targetId: 's1_sub1', event: '', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };

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
});
