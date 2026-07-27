import { describe, it, expect } from 'vitest';
import { createStateMachineClipboard, pasteStateMachineClipboard } from './stateMachineClipboard';
import { StateData, TransitionData, Layer } from '../types/sm_types';

describe('stateMachineClipboard', () => {
  it('should recursively copy composite state sub-layers and paste into target layer with updated parentId', () => {
    const rootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] };
    const childLayer: Layer = { id: 'l_child', name: 'State1_Layer', parentStateId: 's1', stateIds: ['s1_sub1'], transitionIds: [], junctionIds: [] };
    
    const s1 = { id: 's1', name: 'State_1', x: 100, y: 100, width: 120, height: 80, parentId: 'root', children: [] } as unknown as StateData;
    const s1_sub1 = { id: 's1_sub1', name: 'Sub_1', x: 10, y: 10, width: 120, height: 80, parentId: 'l_child', children: [] } as unknown as StateData;

    const clipboard = createStateMachineClipboard(
      ['s1'],
      [s1, s1_sub1],
      [],
      [],
      [rootLayer, childLayer],
      [], [], [], [], []
    );

    expect(clipboard.states).toHaveLength(2);
    expect(clipboard.layers).toHaveLength(1);
    expect(clipboard.topLevelStateIds).toEqual(['s1']);

    const result = pasteStateMachineClipboard(
      clipboard,
      'target_layer',
      [s1, s1_sub1],
      [],
      [],
      [rootLayer, childLayer],
      [], [], [], [], []
    );

    const pastedTopState = result.newStates.find((s: StateData) => s.name === 'State_1_copy');
    expect(pastedTopState).toBeDefined();
    expect(pastedTopState?.parentId).toBe('target_layer');
    expect(pastedTopState?.x).toBe(120);

    const pastedSubState = result.newStates.find((s: StateData) => s.name === 'Sub_1_copy');
    expect(pastedSubState).toBeDefined();
    expect(pastedSubState?.parentId).not.toBe('l_child'); // Should point to cloned child layer ID
  });

  it('should automatically include transitions between selected states/junctions when copying and pasting', () => {
    const rootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1'], junctionIds: [] };
    const s1 = { id: 's1', name: 'State_1', x: 100, y: 100, parentId: 'root' } as unknown as StateData;
    const s2 = { id: 's2', name: 'State_2', x: 300, y: 100, parentId: 'root' } as unknown as StateData;
    const t1 = { id: 't1', sourceId: 's1', targetId: 's2', condition: 'x > 0', action: '' } as unknown as TransitionData;

    // Select only state IDs ['s1', 's2'] (not explicitly 't1')
    const clipboard = createStateMachineClipboard(
      ['s1', 's2'],
      [s1, s2],
      [],
      [t1],
      [rootLayer],
      [], [], [], [], []
    );

    expect(clipboard.transitions).toHaveLength(1);
    expect(clipboard.transitions[0].id).toBe('t1');

    const result = pasteStateMachineClipboard(
      clipboard,
      'root',
      [s1, s2],
      [],
      [t1],
      [rootLayer],
      [], [], [], [], []
    );

    expect(result.newTransitions).toHaveLength(1);
    const newTrans = result.newTransitions[0];
    expect(newTrans.id).not.toBe('t1');

    const newS1 = result.newStates.find((s: StateData) => s.name === 'State_1_copy')!;
    const newS2 = result.newStates.find((s: StateData) => s.name === 'State_2_copy')!;
    expect(newTrans.sourceId).toBe(newS1.id);
    expect(newTrans.targetId).toBe(newS2.id);

    const updatedRootLayer = result.updatedLayers.find((l: Layer) => l.id === 'root')!;
    expect(updatedRootLayer.transitionIds).toContain(newTrans.id);
  });
});
