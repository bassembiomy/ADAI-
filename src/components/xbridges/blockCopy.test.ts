/**
 * Acceptance tests — X-Bridges block copy (right-drag, Ctrl+drag, Ctrl+C / Ctrl+V) with Simulink behaviour.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-block-copy.md
 */
import { describe, expect, it, vi } from 'vitest';
import { copyBlocks, uniqueBlockLabel } from './blockCopy';
import { createDragCopyController, DRAG_COPY_THRESHOLD_PX, type DragCopyHost } from './dragCopyController';

type N = { id: string; type?: string; position: { x: number; y: number }; selected?: boolean; data: any };
type E = { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string; data?: any };

const onUpdate = () => {};
const block = (id: string, type: string, x: number, y: number, extra: Record<string, unknown> = {}): N => ({
  id, type: 'xblock', position: { x, y }, selected: false,
  data: { id, type, label: undefined, params: { gain: 2, nested: { k: [1, 2] } }, state: { x: 0 }, inputs: [{ id: 'u' }], outputs: [{ id: 'y' }], parentId: 'root', onUpdate, ...extra },
});
const edge = (id: string, source: string, target: string): E => ({ id, source, target, sourceHandle: 'y', targetHandle: 'u', data: { waypoints: [{ x: 1, y: 2 }] } });

describe('copyBlocks', () => {
  const g = block('g', 'GAIN', 100, 100, { label: 'Gain' });
  const k = block('k', 'Constant', 0, 0, { label: 'Constant' });
  const t = block('t', 'TERMINATOR', 300, 100);
  const nodes = [g, k, t];
  const edges = [edge('e1', 'k', 'g'), edge('e2', 'g', 't')];

  it('creates independent copies with new ids at an offset', () => {
    const r = copyBlocks(nodes, edges, ['g'], { offset: { x: 40, y: 30 } });
    expect(r.nodes).toHaveLength(1);
    const c = r.nodes[0];
    expect(c.id).not.toBe('g');
    expect(c.data.id).toBe(c.id);
    expect(c.position).toEqual({ x: 140, y: 130 });
    expect(c.selected).toBe(true);
    expect(c.data.params).toEqual(g.data.params);
    expect(c.data.params).not.toBe(g.data.params);
    expect(c.data.params.nested).not.toBe(g.data.params.nested);
    expect(c.data.state).not.toBe(g.data.state);
    expect(c.data.inputs).not.toBe(g.data.inputs);
    expect(c.data.onUpdate).toBeTypeOf('function');
    expect(r.idMap).toEqual({ g: c.id });
  });

  it('copies only the lines whose both ends are copied (Simulink)', () => {
    const r = copyBlocks(nodes, edges, ['k', 'g'], { offset: { x: 10, y: 10 } });
    expect(r.nodes).toHaveLength(2);
    expect(r.edges).toHaveLength(1);
    const e = r.edges[0];
    expect(e.id).not.toBe('e1');
    expect(e.source).toBe(r.idMap.k);
    expect(e.target).toBe(r.idMap.g);
    expect(e.sourceHandle).toBe('y');
    expect(e.data).toEqual(edges[0].data);
    expect(e.data).not.toBe(edges[0].data);
  });

  it('gives copies unique names like Simulink (Gain -> Gain1 -> Gain2)', () => {
    const first = copyBlocks(nodes, edges, ['g'], { offset: { x: 0, y: 0 } }).nodes[0];
    expect(first.data.label).toBe('Gain1');
    const second = copyBlocks([...nodes, first], edges, ['g'], { offset: { x: 0, y: 0 } }).nodes[0];
    expect(second.data.label).toBe('Gain2');
    const unnamed = copyBlocks(nodes, edges, ['t'], { offset: { x: 0, y: 0 } }).nodes[0];
    expect(unnamed.data.label).toBeUndefined();
  });

  it('uniqueBlockLabel increments the trailing number', () => {
    expect(uniqueBlockLabel('Gain', new Set(['Gain']))).toBe('Gain1');
    expect(uniqueBlockLabel('Gain1', new Set(['Gain', 'Gain1']))).toBe('Gain2');
    expect(uniqueBlockLabel('PI Controller', new Set(['PI Controller', 'PI Controller1']))).toBe('PI Controller2');
    expect(uniqueBlockLabel('Free', new Set(['Gain']))).toBe('Free');
  });

  it('never repeats an id, even for many copies in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const a = copyBlocks(nodes, edges, ['g', 'k', 't'], { offset: { x: 0, y: 0 } });
    const b = copyBlocks(nodes, edges, ['g', 'k', 't'], { offset: { x: 0, y: 0 } });
    vi.restoreAllMocks();
    const ids = [...a.nodes, ...b.nodes].map((n) => n.id).concat([...a.edges, ...b.edges].map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('copies a subsystem with its contents and internal lines, children keep their positions', () => {
    const sub = block('sub', 'Subsystem', 50, 50, { label: 'Sub' });
    const inner1 = block('i1', 'GAIN', 10, 10, { parentId: 'sub' });
    const inner2 = block('i2', 'GAIN', 200, 10, { parentId: 'sub' });
    const r = copyBlocks([sub, inner1, inner2], [edge('ei', 'i1', 'i2')], ['sub'], { offset: { x: 100, y: 0 } });
    expect(r.nodes).toHaveLength(3);
    const newSub = r.nodes.find((n) => n.data.type === 'Subsystem')!;
    expect(newSub.position).toEqual({ x: 150, y: 50 });
    const children = r.nodes.filter((n) => n.data.parentId === newSub.id);
    expect(children.map((c) => c.position)).toEqual([{ x: 10, y: 10 }, { x: 200, y: 10 }]);
    expect(children.every((c) => c.selected !== true)).toBe(true);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].source).toBe(r.idMap.i1);
  });
});

describe('drag-copy controller (right-drag and Ctrl+drag)', () => {
  const setup = (initialSelected: string[] = []) => {
    let nodes: N[] = [
      block('a', 'GAIN', 100, 100, { label: 'Gain' }),
      block('b', 'GAIN', 300, 100, { label: 'Gain1' }),
      block('c', 'Constant', 0, 0),
    ].map((n) => ({ ...n, selected: initialSelected.includes(n.id) }));
    let edges: E[] = [edge('ab', 'a', 'b'), edge('ca', 'c', 'a')];
    const host: DragCopyHost = {
      getNodes: () => nodes as any,
      getEdges: () => edges as any,
      setGraph: (n, e) => { nodes = n as any; edges = e as any; },
      getZoom: () => 2,
      pushHistory: vi.fn(),
      commit: vi.fn(),
    };
    const ctl = createDragCopyController(host);
    return { host, ctl, nodes: () => nodes, edges: () => edges };
  };

  it('ignores a plain left press and a press that does not move far enough', () => {
    const { ctl, nodes, host } = setup();
    expect(ctl.pointerDown({ button: 0, clientX: 0, clientY: 0 }, 'a')).toBe(false);
    expect(ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a')).toBe(true);
    ctl.pointerMove({ clientX: DRAG_COPY_THRESHOLD_PX - 1, clientY: 0, buttons: 2 });
    ctl.pointerUp({ button: 2, clientX: DRAG_COPY_THRESHOLD_PX - 1, clientY: 0 });
    expect(nodes()).toHaveLength(3);
    expect(host.commit).not.toHaveBeenCalled();
    expect(ctl.isActive()).toBe(false);
  });

  it('right-drag creates exactly one copy that follows the mouse and is dropped on release', () => {
    const { ctl, nodes, host } = setup();
    ctl.pointerDown({ button: 2, clientX: 500, clientY: 500 }, 'a');
    for (let i = 1; i <= 20; i++) ctl.pointerMove({ clientX: 500 + i * 10, clientY: 500 + i * 4, buttons: 2 });
    expect(nodes()).toHaveLength(4);
    const copy = nodes()[3];
    // zoom 2: 200 px screen = 100 units
    expect(copy.position).toEqual({ x: 200, y: 140 });
    expect(copy.selected).toBe(true);
    expect(nodes().filter((n) => n.selected).map((n) => n.id)).toEqual([copy.id]);
    expect(nodes()[0].position).toEqual({ x: 100, y: 100 });
    ctl.pointerUp({ button: 2, clientX: 700, clientY: 580 });
    expect(host.commit).toHaveBeenCalledTimes(1);
    expect(host.pushHistory).toHaveBeenCalledTimes(1);
    expect(ctl.isActive()).toBe(false);
  });

  it('does nothing after release: moving the mouse never creates another copy (regression)', () => {
    const { ctl, nodes } = setup();
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a');
    ctl.pointerMove({ clientX: 50, clientY: 0, buttons: 2 });
    ctl.pointerUp({ button: 2, clientX: 50, clientY: 0 });
    const after = nodes().map((n) => ({ id: n.id, position: { ...n.position } }));
    for (let i = 0; i < 10; i++) ctl.pointerMove({ clientX: 100 + i * 20, clientY: 40, buttons: 0 });
    expect(nodes().map((n) => ({ id: n.id, position: n.position }))).toEqual(after);
  });

  it('finishes the drop if the button is released outside the window', () => {
    const { ctl, nodes, host } = setup();
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a');
    ctl.pointerMove({ clientX: 40, clientY: 0, buttons: 2 });
    ctl.pointerMove({ clientX: 60, clientY: 0, buttons: 0 });
    expect(ctl.isActive()).toBe(false);
    expect(host.commit).toHaveBeenCalledTimes(1);
    const count = nodes().length;
    ctl.pointerMove({ clientX: 90, clientY: 0, buttons: 0 });
    expect(nodes()).toHaveLength(count);
  });

  it('Ctrl + left drag copies too', () => {
    const { ctl, nodes } = setup();
    expect(ctl.pointerDown({ button: 0, ctrlKey: true, clientX: 0, clientY: 0 }, 'b')).toBe(true);
    ctl.pointerMove({ clientX: 30, clientY: 0, buttons: 1 });
    ctl.pointerUp({ button: 0, clientX: 30, clientY: 0 });
    expect(nodes()).toHaveLength(4);
    expect(nodes()[3].data.type).toBe('GAIN');
  });

  it('copies the whole selection with its internal lines when the dragged block is selected', () => {
    const { ctl, nodes, edges } = setup(['a', 'b']);
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a');
    ctl.pointerMove({ clientX: 20, clientY: 20, buttons: 2 });
    ctl.pointerUp({ button: 2, clientX: 20, clientY: 20 });
    expect(nodes()).toHaveLength(5);
    expect(edges()).toHaveLength(3);
    const copies = nodes().slice(3);
    expect(copies.map((c) => c.data.label).sort()).toEqual(['Gain2', 'Gain3']);
    expect(edges()[2].source).toBe(copies.find((c) => c.data.label === 'Gain2' || c.position.x === 110)!.id);
  });

  it('copies only the dragged block when it is not part of the selection', () => {
    const { ctl, nodes } = setup(['b', 'c']);
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a');
    ctl.pointerMove({ clientX: 20, clientY: 0, buttons: 2 });
    ctl.pointerUp({ button: 2, clientX: 20, clientY: 0 });
    expect(nodes()).toHaveLength(4);
  });

  it('Escape cancels the copy and restores the diagram', () => {
    const { ctl, nodes, edges, host } = setup();
    const before = { n: nodes(), e: edges() };
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a');
    ctl.pointerMove({ clientX: 50, clientY: 0, buttons: 2 });
    expect(nodes()).toHaveLength(4);
    ctl.keyDown({ key: 'Escape' });
    expect(nodes()).toEqual(before.n);
    expect(edges()).toEqual(before.e);
    expect(ctl.isActive()).toBe(false);
    ctl.pointerUp({ button: 2, clientX: 50, clientY: 0 });
    expect(host.commit).not.toHaveBeenCalled();
  });

  it('suppresses the context menu that follows the right-button release, then lets later ones through', () => {
    const { ctl } = setup();
    ctl.pointerDown({ button: 2, clientX: 0, clientY: 0 }, 'a');
    expect(ctl.contextMenu()).toBe(true);
    ctl.pointerMove({ clientX: 50, clientY: 0, buttons: 2 });
    ctl.pointerUp({ button: 2, clientX: 50, clientY: 0 });
    expect(ctl.contextMenu()).toBe(true);
    expect(ctl.contextMenu()).toBe(false);
  });
});
