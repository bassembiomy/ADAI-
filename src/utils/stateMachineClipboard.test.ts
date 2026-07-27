import { describe, it, expect } from 'vitest';
import { createStateMachineClipboard, pasteStateMachineClipboard } from './stateMachineClipboard';
import { StateData, JunctionData, TransitionData, Layer } from '../types';

describe('stateMachineClipboard', () => {
  it('should recursively copy composite state sub-layers and paste into target layer with updated parentId', () => {
    const rootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] };
    const childLayer: Layer = { id: 'l_child', name: 'State1_Layer', parentStateId: 's1', stateIds: ['s1_sub1'], transitionIds: [], junctionIds: [] };
    
    const s1 = { id: 's1', name: 'State_1', x: 100, y: 100, width: 120, height: 80, parentId: 'root', children: [] } as StateData;
    const s1_sub1 = { id: 's1_sub1', name: 'Sub_1', x: 10, y: 10, width: 120, height: 80, parentId: 'l_child', children: [] } as StateData;

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

    const pastedTopState = result.newStates.find(s => s.name === 'State_1_copy');
    expect(pastedTopState).toBeDefined();
    expect(pastedTopState?.parentId).toBe('target_layer');
    expect(pastedTopState?.x).toBe(120);

    const pastedSubState = result.newStates.find(s => s.name === 'Sub_1_copy');
    expect(pastedSubState).toBeDefined();
    expect(pastedSubState?.parentId).not.toBe('l_child'); // Should point to cloned child layer ID
  });
});
