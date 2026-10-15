// @vitest-environment jsdom
// Regression: editing the X-Bridges model of a state and then adding a variable in the main Variables panel
// (any App re-render within the workspace's 300 ms save debounce) re-imported the stored model and deleted the edits.
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { XbridgesWorkspace } from './XbridgesWorkspace';
import { useXBridgesWorkspaceInputs } from './xbridgesWorkspaceInputs';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).ResizeObserver ??= RO;
  (globalThis as any).DOMMatrixReadOnly ??= class { m22 = 1; };
  window.HTMLElement.prototype.scrollIntoView ??= (() => undefined);
});
afterEach(cleanup);

const node = (id: string) => ({ id, type: 'xblock', position: { x: 0, y: 0 }, data: { ...BLOCK_LIBRARY.Constant(id, { value: 1 }) } });
const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

/** The App wiring: states hold the state-embedded model; the Variables panel re-renders App. */
let latestStates: any[] = [];
function AppLike() {
  const [states, setStates] = useState<any[]>([
    { id: 's1', name: 'Controller', isActive: false, xBridgesModel: { nodes: [node('a'), node('b'), node('c')], edges: [], mappings: [] } },
  ]);
  const [variables, setVariables] = useState<any[]>([]);
  latestStates = states;
  const inputs = useXBridgesWorkspaceInputs(states, 's1', [], []);
  return (
    <div>
      <button onClick={() => setVariables(v => [...v, { id: `v${v.length}`, name: `v${v.length}`, type: 'double', initialValue: '0', currentValue: 0, visibleInScope: true }])}>Add variable</button>
      <button onClick={() => setStates(prev => prev.map(s => ({ ...s, isActive: !s.isActive })))}>Toggle active</button>
      <XbridgesWorkspace key="s1" {...inputs} availableVariables={variables}
        onSave={(nodes, edges, mappings) => setStates(prev => prev.map(s => s.id === 's1' ? { ...s, xBridgesModel: { ...s.xBridgesModel, nodes, edges, mappings: Array.from(mappings) } } : s))} />
    </div>
  );
}
const storedIds = () => latestStates[0].xBridgesModel.nodes.map((n: any) => n.id);

describe('X-Bridges model inside a state keeps its edits when App re-renders', () => {
  it('adding a variable right after an edit does not bring deleted blocks back', async () => {
    render(<AppLike />);
    await wait(400);
    expect(storedIds()).toEqual(['a', 'b', 'c']);
    await act(async () => { fireEvent.keyDown(window, { code: 'KeyA', key: 'a', ctrlKey: true }); });
    await act(async () => { fireEvent.keyDown(window, { code: 'Delete', key: 'Delete' }); });
    await wait(50);
    fireEvent.click(screen.getByText('Add variable'));
    await wait(600);
    expect(storedIds()).toEqual([]);
  });

  it('an unrelated state update (e.g. simulation activity) does not revert the edit either', async () => {
    render(<AppLike />);
    await wait(400);
    await act(async () => { fireEvent.keyDown(window, { code: 'KeyA', key: 'a', ctrlKey: true }); });
    await act(async () => { fireEvent.keyDown(window, { code: 'Delete', key: 'Delete' }); });
    await wait(50);
    fireEvent.click(screen.getByText('Toggle active'));
    await wait(600);
    expect(storedIds()).toEqual([]);
  });
});

describe('useXBridgesWorkspaceInputs', () => {
  const model = { nodes: [node('a')], edges: [{ id: 'e' }], mappings: [] as any[] };
  it('keeps the same arrays across re-renders until the stored model changes', () => {
    const { result, rerender } = renderHook(({ states }) => useXBridgesWorkspaceInputs(states, 's1', [], []), {
      initialProps: { states: [{ id: 's1', xBridgesModel: model }] as any[] },
    });
    const first = result.current;
    rerender({ states: [{ id: 's1', isActive: true, xBridgesModel: model }] });
    expect(result.current.initialNodes).toBe(first.initialNodes);
    expect(result.current.initialEdges).toBe(first.initialEdges);
    expect(result.current.initialMappings).toBe(first.initialMappings);
    rerender({ states: [{ id: 's1', xBridgesModel: { ...model, nodes: [node('a'), node('b')] } }] });
    expect(result.current.initialNodes).not.toBe(first.initialNodes);
    expect(result.current.initialNodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(result.current.initialEdges).toBe(first.initialEdges);
  });

  it('uses the global canvas when no state is open', () => {
    const nodes = [node('g')];
    const edges: any[] = [];
    const { result } = renderHook(() => useXBridgesWorkspaceInputs([], null, nodes, edges));
    expect(result.current.initialNodes.map(n => n.id)).toEqual(['g']);
    expect(result.current.initialEdges).toEqual([]);
    expect(result.current.initialMappings).toEqual([]);
  });
});
