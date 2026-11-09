/**
 * Acceptance tests — Simulink-style copy in every block canvas (X-Bridges, V-Lab, OPM, State Machine).
 * Plan: docs/superpowers/plans/2026-11-09-copy-everywhere-and-resizable-panels.md
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { copyBlocks, OPM_NODE_SHAPE, VLAB_NODE_SHAPE, XBRIDGES_NODE_SHAPE } from './canvasCopy/blockCopy';
import { createDragCopyController, type DragCopyHost } from './canvasCopy/dragCopyController';
import { dragCopyStates } from '../../utils/stateMachineDragCopy';
import * as xbBlockCopy from '../xbridges/blockCopy';
import * as xbController from '../xbridges/dragCopyController';
import type { Layer, StateData, TransitionData } from '../../types/sm_types';

describe('shared copy module', () => {
  it('X-Bridges keeps using the shared implementation', () => {
    expect(xbBlockCopy.copyBlocks).toBeTypeOf('function');
    expect(xbController.createDragCopyController).toBe(createDragCopyController);
  });

  it('V-Lab blocks: independent copies with unique labels and the lines between them', () => {
    const onUpdate = () => {};
    const nodes = [
      { id: 'r1', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Resistor', type: 'resistor', params: { R: { value: 10 } }, ports: [{ id: 'p' }, { id: 'n' }], parentId: 'root', onUpdate } },
      { id: 'c1', type: 'default', position: { x: 200, y: 0 }, data: { label: 'Capacitor', type: 'capacitor', params: { C: { value: 1e-6 } }, ports: [{ id: 'p' }, { id: 'n' }], parentId: 'root' } },
    ];
    const edges = [{ id: 'w', source: 'r1', target: 'c1', sourceHandle: 'n', targetHandle: 'p' }];
    const r = copyBlocks(nodes, edges, ['r1', 'c1'], { offset: { x: 40, y: 40 }, shape: VLAB_NODE_SHAPE });
    expect(r.nodes).toHaveLength(2);
    expect(r.edges).toHaveLength(1);
    const copy = r.nodes.find((n) => n.data.type === 'resistor')!;
    expect(copy.data.label).toBe('Resistor1');
    expect(copy.data.params).toEqual(nodes[0].data.params);
    expect(copy.data.params).not.toBe(nodes[0].data.params);
    expect(copy.data.params.R).not.toBe(nodes[0].data.params.R);
    expect(copy.data.ports).not.toBe(nodes[0].data.ports);
    expect(copy.data.onUpdate).toBe(onUpdate);
    expect(copy.position).toEqual({ x: 40, y: 40 });
  });

  it('OPM things: name is data.name, nesting is the node parentId', () => {
    const nodes: any[] = [
      { id: 'obj', type: 'opmObject', position: { x: 10, y: 10 }, data: { name: 'Water', parentId: null } },
      { id: 'st', type: 'opmState', parentId: 'obj', position: { x: 5, y: 30 }, data: { name: 'cold', parentId: 'obj' } },
      { id: 'proc', type: 'opmProcess', position: { x: 300, y: 10 }, data: { name: 'Heating', parentId: null } },
    ];
    const edges = [{ id: 'l', source: 'st', target: 'proc' }];
    const r = copyBlocks(nodes, edges, ['obj'], { offset: { x: 50, y: 0 }, shape: OPM_NODE_SHAPE });
    expect(r.nodes).toHaveLength(2);
    const obj = r.nodes.find((n) => n.type === 'opmObject')!;
    const st = r.nodes.find((n) => n.type === 'opmState')!;
    expect(obj.data.name).toBe('Water1');
    expect(obj.position).toEqual({ x: 60, y: 10 });
    expect(st.parentId).toBe(obj.id);
    expect(st.data.parentId).toBe(obj.id);
    expect(st.position).toEqual({ x: 5, y: 30 });
    expect(st.data.name).toBe('cold');
    expect(r.edges).toHaveLength(0);
  });

  it('the X-Bridges shape is the default', () => {
    expect(XBRIDGES_NODE_SHAPE).toBeDefined();
    const r = copyBlocks([{ id: 'g', position: { x: 0, y: 0 }, data: { type: 'GAIN', label: 'Gain', params: {}, parentId: 'root' } }], [], ['g'], { offset: { x: 0, y: 0 } });
    expect(r.nodes[0].data.label).toBe('Gain1');
  });

  it('the controller works with any node shape (V-Lab)', () => {
    let nodes: any[] = [{ id: 'r1', position: { x: 0, y: 0 }, selected: false, data: { label: 'Resistor', type: 'resistor', params: {}, parentId: 'root' } }];
    let edges: any[] = [];
    const host: DragCopyHost = {
      getNodes: () => nodes, getEdges: () => edges, setGraph: (n, e) => { nodes = n as any; edges = e as any; },
      getZoom: () => 1, pushHistory: vi.fn(), commit: vi.fn(), shape: VLAB_NODE_SHAPE,
    };
    const ctl = createDragCopyController(host);
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'r1');
    ctl.pointerMove({ clientX: 100, clientY: 0, buttons: 2 });
    ctl.pointerUp({ button: 2, clientX: 100, clientY: 0 });
    for (let i = 0; i < 5; i++) ctl.pointerMove({ clientX: 200 + i, clientY: 0, buttons: 0 });
    expect(nodes).toHaveLength(2);
    expect(nodes[1].data.label).toBe('Resistor1');
    expect(nodes[1].position).toEqual({ x: 100, y: 0 });
  });
});

describe('state machine drag copy (composite states, transitions, unique names)', () => {
  const st = (id: string, name: string, x: number, y: number, parentId: string | null, children: string[] = []): StateData =>
    ({ id, name, x, y, width: 100, height: 60, parentId, children, entry: '', during: '', exit: '', isActive: false, priority: 1, isParallel: false, regionId: null, autostart: false } as any);
  const tr = (id: string, sourceId: string, targetId: string): TransitionData =>
    ({ id, sourceId, targetId, condition: '', action: '', afterTicks: null, type: 'condition' } as any);
  const states = [st('A', 'Idle', 0, 0, null), st('B', 'Run', 200, 0, null, ['B1', 'B2']), st('B1', 'Fast', 10, 10, 'B'), st('B2', 'Slow', 10, 80, 'B')];
  const transitions = [tr('t1', 'A', 'B'), tr('t2', 'B1', 'B2')];
  const layers: Layer[] = [
    { id: 'root', name: 'Root', parentStateId: null, stateIds: ['A', 'B'], transitionIds: ['t1'], junctionIds: [] },
    { id: 'LB', name: 'B', parentStateId: 'B', stateIds: ['B1', 'B2'], transitionIds: ['t2'], junctionIds: [] },
  ];

  it('copies a composite state with its child states and their internal transitions', () => {
    const r = dragCopyStates({ states, junctions: [], transitions, layers }, ['B'], { layerId: 'root', drop: { x: 500, y: 300 } });
    const top = r.states.filter((s) => r.newTopLevelStateIds.includes(s.id));
    expect(top).toHaveLength(1);
    expect(top[0].name).toBe('Run1');
    expect({ x: top[0].x, y: top[0].y }).toEqual({ x: 500, y: 300 });
    const children = r.states.filter((s) => s.parentId === top[0].id);
    expect(children.map((c) => c.name).sort()).toEqual(['Fast', 'Slow']);
    const newChildIds = new Set(children.map((c) => c.id));
    expect(r.transitions.filter((t) => newChildIds.has(t.sourceId) && newChildIds.has(t.targetId))).toHaveLength(1);
    expect(r.transitions.find((t) => t.id === 't1')).toBeDefined();
    expect(r.layers.find((l) => l.id === 'root')!.stateIds).toContain(top[0].id);
    expect(r.states.length).toBe(states.length + 3);
  });

  it('copies two states with the transition between them, keeping their relative placement', () => {
    const r = dragCopyStates({ states, junctions: [], transitions, layers }, ['A', 'B'], { layerId: 'root', drop: { x: 100, y: 400 } });
    const top = r.states.filter((s) => r.newTopLevelStateIds.includes(s.id));
    expect(top.map((s) => s.name).sort()).toEqual(['Idle1', 'Run1']);
    const idle = top.find((s) => s.name === 'Idle1')!;
    const run = top.find((s) => s.name === 'Run1')!;
    expect(run.x - idle.x).toBe(200);
    expect(r.transitions.some((t) => t.sourceId === idle.id && t.targetId === run.id)).toBe(true);
  });

  it('does not modify the original model', () => {
    const before = JSON.stringify({ states, transitions, layers });
    dragCopyStates({ states, junctions: [], transitions, layers }, ['B'], { layerId: 'root', drop: { x: 0, y: 0 } });
    expect(JSON.stringify({ states, transitions, layers })).toBe(before);
  });
});

describe('every canvas uses the shared copy controller', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  it('V-Lab replaces its own right-drag gesture', () => {
    const v = src('src/components/vlab/VLabWorkspace.tsx');
    expect(v).toContain('createDragCopyController');
    expect(v).not.toContain('rightDragCopyGesture');
    expect(v).toContain('copyBlocks');
  });
  it('OPM supports drag copy and uses the shared copy for paste', () => {
    const o = src('src/components/entropy/EntropyWorkspace.tsx');
    expect(o).toContain('createDragCopyController');
    expect(o).toContain('copyBlocks');
  });
  it('the State Machine canvas copies through dragCopyStates', () => {
    expect(src('src/App.tsx')).toContain('dragCopyStates');
  });
});
