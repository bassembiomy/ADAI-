import { describe, expect, it } from 'vitest';
import { BlockData, ConnectorData, PartData, RelationshipData } from '../../types/sysml_types';
import { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import { renderBddDiagram, renderIbdDiagram, renderRequirementsDiagram, renderStateMachineDiagrams } from './reportDiagrams';
import { wrapFigure } from './reportDiagramModel';

function block(partial: Partial<BlockData> & { id: string }): BlockData {
  return {
    name: partial.id, stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [], ports: [], ...partial,
  } as BlockData;
}
const rel = (id: string, type: RelationshipData['type'], sourceId: string, targetId: string, extra: Partial<RelationshipData> = {}): RelationshipData =>
  ({ id, type, sourceId, targetId, label: '', ...extra } as RelationshipData);

function acct(html: string): { drawn: number; omitted: number } {
  return { drawn: Number(/data-drawn-edges="(\d+)"/.exec(html)![1]), omitted: Number(/data-omitted-edges="(\d+)"/.exec(html)![1]) };
}
const textY = (html: string, name: string) => Number(new RegExp(`<text x="[^"]+" y="([\\d.]+)"[^>]*>${name}</text>`).exec(html)![1]);

describe('wrapFigure accounting', () => {
  it('adds data attributes and a visible note naming the omitted connections', () => {
    const html = wrapFigure('<rect/>', 'Cap', { x: 0, y: 0, width: 10, height: 10 },
      { drawnNodes: 2, drawnEdges: 3, omitted: [{ id: 'x', reason: 'Engine → Fan <gone>' }] });
    expect(html).toContain('data-drawn-edges="3"');
    expect(html).toContain('data-omitted-edges="1"');
    expect(html).toContain('<p class="report-figure-omitted">1 connection not drawn in this view: Engine → Fan &lt;gone&gt;</p>');
  });
  it('omits the note and attributes when no accounting is passed', () => {
    expect(wrapFigure('', 'Cap', { x: 0, y: 0, width: 10, height: 10 })).not.toContain('data-drawn-edges');
  });
});

describe('BDD SysML orientation and accounting', () => {
  const blocks = [block({ id: 'veh', name: 'Vehicle' }), block({ id: 'car', name: 'Car' }), block({ id: 'eng', name: 'Engine' }), block({ id: 'wheel', name: 'Wheel' })];
  const rels = [
    rel('g1', 'generalization', 'car', 'veh'), // source = specific (supertypes.ts)
    rel('c1', 'composition', 'car', 'eng'),   // source = whole
    rel('c2', 'composition', 'car', 'wheel'),
    rel('dangling', 'association', 'car', 'nowhere'),
  ];
  const html = renderBddDiagram({ blocks, relationships: rels });

  it('puts the supertype above the subtype and the whole above its parts', () => {
    expect(textY(html, 'Vehicle')).toBeLessThan(textY(html, 'Car'));
    expect(textY(html, 'Car')).toBeLessThan(textY(html, 'Engine'));
    expect(textY(html, 'Car')).toBeLessThan(textY(html, 'Wheel'));
  });

  it('accounts for the connection whose end is not in the model', () => {
    expect(acct(html)).toEqual({ drawn: 3, omitted: 1 });
    expect(html).toContain('Car → Unknown element');
  });

  it('accounts per page when the diagram is split', () => {
    const many = Array.from({ length: 25 }, (_, i) => block({ id: `b${i}`, name: `B${i}` }));
    const chain = many.slice(1).map((b, i) => rel(`r${i}`, 'association', many[i].id, b.id));
    const pages = renderBddDiagram({ blocks: many, relationships: chain }).split('</figure>').filter(s => s.includes('<figure'));
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      const a = acct(p);
      const nodesOnPage = (p.match(/<rect x=/g) ?? []).length;
      expect(nodesOnPage).toBeGreaterThan(0);
      expect(a.drawn + a.omitted).toBeGreaterThan(0);
    }
  });
});

describe('requirements orientation', () => {
  it('places the source requirement above the requirement derived from it', () => {
    const reqs = [
      block({ id: 'top', name: 'TopReq', stereotype: 'requirement', reqId: 'R1' }),
      block({ id: 'low', name: 'DerivedReq', stereotype: 'requirement', reqId: 'R2' }),
    ];
    // deriveReqt: source = derived requirement, target = source requirement (relationshipDefinitions.ts).
    const html = renderRequirementsDiagram({ blocks: reqs, relationships: [rel('d', 'deriveReqt', 'low', 'top')] });
    expect(textY(html, 'R1')).toBeLessThan(textY(html, 'R2'));
    expect(acct(html)).toEqual({ drawn: 1, omitted: 0 });
  });
});

describe('IBD accounting and ports', () => {
  const ctx = block({ id: 'sys', name: 'System' });
  const types = [
    block({ id: 'ta', name: 'A', ports: [{ id: 'pa-in', name: 'inA', type: 'x', direction: 'in' }, { id: 'pa-out', name: 'outA', type: 'x', direction: 'out' }, { id: 'pa-io', name: 'ioA', type: 'x', direction: 'inout' }] as never }),
    block({ id: 'tb', name: 'B', ports: [{ id: 'pb-in', name: 'inB', type: 'x', direction: 'in' }] as never }),
  ];
  const parts = [
    { id: 'a', name: 'partA', blockId: 'sys', typeId: 'ta' } as PartData,
    { id: 'b', name: 'partB', blockId: 'sys', typeId: 'tb' } as PartData,
  ];
  const conns = [
    { id: 'k1', sourcePartId: 'a', sourcePortId: 'pa-out', targetPartId: 'b', targetPortId: 'pb-in' },
    { id: 'k2', sourcePartId: 'a', sourcePortId: 'pa-io', targetPartId: 'elsewhere', targetPortId: 'q', itemFlow: 'x' },
  ] as ConnectorData[];
  const html = renderIbdDiagram({ contextBlock: ctx, parts, connectors: conns, blocks: [...types, ctx] });

  it('reports connectors that leave the context instead of dropping them silently', () => {
    expect(acct(html)).toEqual({ drawn: 1, omitted: 1 });
    expect(html).toContain('partA.ioA → unknown part (an end lies outside System)');
  });

  it('lays parts out by connectivity (source left of target) with inputs on the left and outputs on the right', () => {
    const rects = [...html.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="6"/g)].map(m => ({ x: +m[1], w: +m[3] }));
    expect(rects[0].x + rects[0].w).toBeLessThan(rects[1].x);
    const portRects = [...html.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="10" height="10"/g)].map(m => ({ x: +m[1], y: +m[2] }));
    expect(portRects).toHaveLength(4);
    const keys = portRects.map(p => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(4); // no two ports share a slot
    const inA = portRects[0];
    const outA = portRects[1];
    expect(inA.x).toBeLessThan(outA.x);
  });
});

describe('state machine stubs and accounting', () => {
  const st = (id: string, name: string, extra: Partial<StateData> = {}) => ({
    id, name, x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#fff',
    parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false, ...extra,
  }) as StateData;
  const tr = (id: string, sourceId: string, targetId: string, condition = '') =>
    ({ id, sourceId, targetId, condition, action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 }) as TransitionData;
  const states = [st('a', 'Idle', { autostart: true }), st('b', 'Run'), st('x', 'Remote')];
  const layers: Layer[] = [
    { id: 'l1', name: 'Main', parentStateId: null, stateIds: ['a', 'b'], transitionIds: ['t1', 't2', 't3', 't4'], junctionIds: [] },
    { id: 'l2', name: 'Sub', parentStateId: 'b', stateIds: ['x'], transitionIds: [], junctionIds: [] },
  ];
  const transitions = [tr('t1', 'a', 'b', 'go'), tr('t2', 'b', 'x', 'dive'), tr('t3', 'x', 'a', 'surface'), tr('t4', 'a', 'ghost', 'lost')];
  const figures = renderStateMachineDiagrams({ layers, states, junctions: [] as JunctionData[], transitions });

  it('draws a transition into another layer as a labelled stub instead of dropping it', () => {
    expect(figures[0]).toContain('→ Remote (layer Sub)');
    expect(figures[0]).toContain('[dive]');
    expect(figures[0]).toContain('class="sm-stub"');
  });

  it('counts stubs as drawn and reports transitions to unknown states', () => {
    // t1 local, t2 + t3 stubs, t4 target not in the model.
    expect(acct(figures[0])).toEqual({ drawn: 3, omitted: 1 });
    expect(figures[0]).toContain('Idle → unknown state');
  });

  it('keeps chunked views accounted: transitions crossing chunks become stubs', () => {
    const many = Array.from({ length: 22 }, (_, i) => st(`s${i}`, `S${i}`, { autostart: i === 0 }));
    const layer: Layer[] = [{ id: 'big', name: 'Big', parentStateId: null, stateIds: many.map(s => s.id), transitionIds: ['c1', 'c2'], junctionIds: [] }];
    const out = renderStateMachineDiagrams({ layers: layer, states: many, junctions: [], transitions: [tr('c1', 's0', 's1'), tr('c2', 's1', 's21')] });
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('view 1 of 2');
    expect(acct(out[0])).toEqual({ drawn: 2, omitted: 0 });
    expect(out[0]).toContain('→ S21 (other view)');
    expect(acct(out[1])).toEqual({ drawn: 1, omitted: 0 });
    expect(out[1]).toContain('S1 (other view)');
  });
});
