/**
 * Acceptance tests — AG-01: State Machine Ctrl+V gives Simulink-style unique names.
 * Brief: docs/antigravity/briefs/AG-01-sm-paste-unique-names.md
 *
 * Rule (same as right-drag copy, src/utils/stateMachineDragCopy.ts):
 *  - A pasted top-level state or junction gets a name that is unique among the states / junctions already in the
 *    target layer, using uniqueBlockLabel from src/components/common/canvasCopy/blockCopy.ts
 *    (Idle -> Idle1 -> Idle2; State_1 -> State_2 when State_1 exists, skipping names already taken).
 *  - States inside a pasted composite state keep their names (names are scoped to their parent).
 *  - A junction with an empty name keeps the empty name.
 *  - SysML blocks and parts in the clipboard keep their current naming (out of scope).
 */
import { describe, expect, it } from 'vitest';
import { createStateMachineClipboard, pasteStateMachineClipboard } from './stateMachineClipboard';
import type { JunctionData, Layer, StateData } from '../types/sm_types';

const st = (id: string, name: string, parentId: string, x = 0, y = 0) =>
  ({ id, name, x, y, width: 120, height: 80, parentId, children: [] } as unknown as StateData);
const jn = (id: string, name: string, parentId: string) =>
  ({ id, name, x: 0, y: 0, color: '#fff', parentId } as unknown as JunctionData);

const paste = (ids: string[], states: StateData[], junctions: JunctionData[], layers: Layer[], target: string) =>
  pasteStateMachineClipboard(
    createStateMachineClipboard(ids, states, junctions, [], layers, [], [], [], [], []),
    target, states, junctions, [], layers, [], [], [], [], [],
  );

describe('AG-01 State Machine paste names', () => {
  const root: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['a', 'b'], transitionIds: [], junctionIds: ['j1', 'j2'] };
  const states = [st('a', 'Idle', 'root'), st('b', 'Run', 'root')];
  const junctions = [jn('j1', 'J1', 'root'), jn('j2', '', 'root')];

  it('a pasted state gets the next free name in the target layer', () => {
    const r = paste(['a'], states, junctions, [root], 'root');
    const pasted = r.newStates.filter((s: StateData) => s.id !== 'a' && s.id !== 'b');
    expect(pasted.map((s: StateData) => s.name)).toEqual(['Idle1']);
  });

  it('pasting again continues the numbering (Idle1 -> Idle2)', () => {
    const first = paste(['a'], states, junctions, [root], 'root');
    const layers1 = first.updatedLayers as Layer[];
    const states1 = [...states, ...(first.newStates as StateData[])];
    const second = paste(['a'], states1, junctions, layers1, 'root');
    expect((first.newStates as StateData[]).map((s) => s.name)).toEqual(['Idle1']);
    expect((second.newStates as StateData[]).map((s) => s.name)).toEqual(['Idle2']);
  });

  it('several pasted states get distinct names, skipping names already taken', () => {
    const crowded = [st('s1', 'State_1', 'root'), st('s2', 'State_2', 'root')];
    const layer: Layer = { ...root, stateIds: ['s1', 's2'], junctionIds: [] };
    const r = paste(['s1', 's2'], crowded, [], [layer], 'root');
    const pasted = (r.newStates as StateData[]).filter((s) => s.id !== 's1' && s.id !== 's2').map((s) => s.name).sort();
    expect(pasted).toEqual(['State_3', 'State_4']);
  });

  it('keeps the name when it is free in the target layer', () => {
    const other: Layer = { id: 'other', name: 'Other', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] };
    const r = paste(['a'], states, junctions, [root, other], 'other');
    const pasted = (r.newStates as StateData[]).filter((s) => s.id !== 'a' && s.id !== 'b');
    expect(pasted.map((s) => s.name)).toEqual(['Idle']);
  });

  it('child states of a pasted composite keep their names', () => {
    const comp = st('c', 'Mode', 'root');
    const child = st('c1', 'Fast', 'lc');
    const lc: Layer = { id: 'lc', name: 'Mode', parentStateId: 'c', stateIds: ['c1'], transitionIds: [], junctionIds: [] };
    const layer: Layer = { ...root, stateIds: ['c'], junctionIds: [] };
    const r = paste(['c'], [comp, child], [], [layer, lc], 'root');
    const pasted = (r.newStates as StateData[]).filter((s) => s.id !== 'c' && s.id !== 'c1');
    expect(pasted.map((s) => s.name).sort()).toEqual(['Fast', 'Mode1']);
  });

  it('junctions: unique names in the layer, empty names stay empty', () => {
    const r = paste(['j1', 'j2'], states, junctions, [root], 'root');
    const pasted = (r.newJunctions as JunctionData[]).filter((j) => j.id !== 'j1' && j.id !== 'j2').map((j) => j.name).sort();
    expect(pasted).toEqual(['', 'J2']);
  });
});
