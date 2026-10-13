import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../../types/sysml_types';
import type { Layer, StateData, TransitionData } from '../../types/sm_types';
import { buildSystemReport } from './systemReport/buildSystemReport';
import { richHierarchy, richReportInput, richRepository } from './systemReport/systemReport.fixture';
import { SM_LABEL_MAX_CHARS, renderBddDiagram, renderIbdDiagram, renderRequirementsDiagram, renderStateMachineDiagrams } from './reportDiagrams';
import { renderActivityDiagrams, renderSequenceDiagrams, renderUseCaseDiagrams } from './reportDiagrams.sysml';
import { textWidth } from './reportSvgGeometry';
import { buildSequenceDiagramView } from '../sysml/sequenceDiagramView';
import { edgeNodeCollisions, figuresOf, labelCollisions, outsideViewBox, parseFigure } from './figureGeometry.testutil';

function expectSound(figure: string, name: string): void {
  const g = parseFigure(figure);
  expect(edgeNodeCollisions(g), `${name}: edges through nodes`).toEqual([]);
  expect(outsideViewBox(g), `${name}: drawn outside the viewBox`).toEqual([]);
  expect(labelCollisions(g), `${name}: label collisions`).toEqual([]);
}

const caption = (figure: string) => /aria-label="([^"]*)"/.exec(figure)?.[1] ?? '(no caption)';

describe('report figure geometry (every figure of the full system report)', () => {
  const html = buildSystemReport(richReportInput());
  const figures = figuresOf(html);

  it('finds the figures of every diagram family', () => {
    const captions = figures.map(caption).join('\n');
    for (const family of ['Block definition diagram', 'Internal block diagram', 'State machine', 'Sequence diagram', 'Activity diagram', 'Use case diagram', 'Parametric diagram', 'Requirements diagram', 'Package diagram']) {
      expect(captions, family).toContain(family);
    }
  });

  it('no edge passes through a node that is not one of its ends, nothing is drawn outside the viewBox, no labels collide', () => {
    expect(figures.length).toBeGreaterThan(8);
    // the check is not vacuous: the figures contain nodes, routed edges and labels to test
    const all = figures.map(parseFigure);
    expect(all.reduce((n, g) => n + g.nodes.length, 0)).toBeGreaterThan(30);
    expect(all.reduce((n, g) => n + g.edges.length, 0)).toBeGreaterThan(20);
    expect(all.reduce((n, g) => n + g.labels.length, 0)).toBeGreaterThan(8);
    for (const figure of figures) expectSound(figure, caption(figure));
  });

  it('never sets a label along a path (rotated text on vertical runs)', () => {
    expect(html).not.toContain('<textPath');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// State machines (defect 1, 6b)
// ---------------------------------------------------------------------------------------------------------------------
function state(id: string, name: string, extra: Partial<StateData> = {}): StateData {
  return {
    id, name, x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#fff',
    parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false, ...extra,
  } as unknown as StateData;
}
function transition(id: string, sourceId: string, targetId: string, condition: string, action = ''): TransitionData {
  return { id, sourceId, targetId, condition, action, afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 } as unknown as TransitionData;
}

describe('state machine figures', () => {
  const h = richHierarchy();
  const main = renderStateMachineDiagrams({ layers: h.layers!, states: h.states!, junctions: h.junctions ?? [], transitions: h.transitions! })[0];
  const g = parseFigure(main);

  it('keeps the back transition Running -> Idle and its label inside the viewBox (defect 1a)', () => {
    expect(main).toContain('id="edge-tr_2"');
    expect(main).toContain('[stop == true]');
    expect(outsideViewBox(g)).toEqual([]);
    const back = g.edges.find(e => e.id === 'edge-tr_2')!;
    const lowest = Math.max(...g.nodes.map(n => n.y + n.height));
    // the route really does leave the node band (so the old node-only viewBox would have clipped it) ...
    expect(Math.max(...back.points.map(p => p.y))).toBeGreaterThan(lowest);
    // ... and the viewBox now reaches below it
    expect(g.viewBox.y + g.viewBox.height).toBeGreaterThan(Math.max(...back.points.map(p => p.y)));
    const label = g.labels.find(l => l.text === '[stop == true]')!;
    expect(label.box.y + label.box.height).toBeLessThanOrEqual(g.viewBox.y + g.viewBox.height);
  });

  it('widens the rank gap to hold the longest label, so labels neither clip nor touch the target (defect 1b)', () => {
    const idle = g.nodes.find(n => n.id === 'st_idle')!;
    const running = g.nodes.find(n => n.id === 'st_run')!;
    const label = g.labels.find(l => l.text === '[start == true] / motor = 1')!;
    expect(label).toBeDefined();
    const gap = running.x - (idle.x + idle.width);
    expect(gap).toBeGreaterThanOrEqual(textWidth('[start == true] / motor = 1', 9) + 20);
    expect(label.box.x).toBeGreaterThanOrEqual(idle.x + idle.width);
    expect(label.box.x + label.box.width).toBeLessThanOrEqual(running.x);
  });

  it('truncates only beyond the limit, with an ellipsis', () => {
    const long = 'a'.repeat(30) + ' == ' + 'b'.repeat(30);
    const s = [state('a', 'A', { autostart: true }), state('b', 'B')];
    const layer: Layer = { id: 'l', name: 'L', parentStateId: null, stateIds: ['a', 'b'], transitionIds: ['t1', 't2'], junctionIds: [] };
    const fig = renderStateMachineDiagrams({ layers: [layer], states: s, junctions: [], transitions: [transition('t1', 'a', 'b', long), transition('t2', 'b', 'a', 'short')] })[0];
    const labels = parseFigure(fig).labels.map(l => l.text);
    const cut = labels.find(t => t.endsWith('…'))!;
    expect(cut).toBeDefined();
    expect(cut.length).toBe(SM_LABEL_MAX_CHARS);
    expect(labels).toContain('[short]');
    expectSound(fig, 'long label');
  });

  it('draws self-transition labels and back-edge labels', () => {
    const s = [state('a', 'A', { autostart: true }), state('b', 'B')];
    const layer: Layer = { id: 'l', name: 'L', parentStateId: null, stateIds: ['a', 'b'], transitionIds: ['t1', 't2', 't3', 't4'], junctionIds: [] };
    const fig = renderStateMachineDiagrams({
      layers: [layer], states: s, junctions: [],
      transitions: [transition('t1', 'a', 'b', 'go'), transition('t2', 'b', 'a', 'back'), transition('t3', 'b', 'b', 'tick'), transition('t4', 'b', 'b', 'tock')],
    })[0];
    const labels = parseFigure(fig).labels.map(l => l.text);
    expect(labels).toEqual(expect.arrayContaining(['[go]', '[back]', '[tick]', '[tock]']));
    expectSound(fig, 'self and back edges');
  });

  it('routes transitions that skip a column along the gutters, never through the state between (defect 6a)', () => {
    const s = [state('a', 'A', { autostart: true }), state('b', 'B'), state('c', 'C')];
    const layer: Layer = { id: 'l', name: 'L', parentStateId: null, stateIds: ['a', 'b', 'c'], transitionIds: ['t1', 't2', 't3'], junctionIds: [] };
    const fig = renderStateMachineDiagrams({
      layers: [layer], states: s, junctions: [],
      transitions: [transition('t1', 'a', 'b', 'one'), transition('t2', 'b', 'c', 'two'), transition('t3', 'a', 'c', 'skip')],
    })[0];
    expect(parseFigure(fig).edges.find(e => e.id === 'edge-t3')).toBeDefined();
    expectSound(fig, 'column skip');
  });

  it('routes off-view stubs without crossing states (defect 6b)', () => {
    const s = [state('a', 'A', { autostart: true }), state('b', 'B'), state('c', 'C'), state('z', 'Z')];
    const layer: Layer = { id: 'l', name: 'L', parentStateId: null, stateIds: ['a', 'b', 'c'], transitionIds: ['t1', 't2', 't3', 't4'], junctionIds: [] };
    const other: Layer = { id: 'm', name: 'Other', parentStateId: null, stateIds: ['z'], transitionIds: [], junctionIds: [] };
    const fig = renderStateMachineDiagrams({
      layers: [layer, other], states: s, junctions: [],
      transitions: [transition('t1', 'a', 'b', 'one'), transition('t2', 'b', 'c', 'two'), transition('t3', 'a', 'z', 'leave'), transition('t4', 'z', 'c', 'enter')],
    })[0];
    expect(fig).toContain('sm-stub');
    expect(parseFigure(fig).edges.map(e => e.id)).toEqual(expect.arrayContaining(['edge-t3', 'edge-t4']));
    expectSound(fig, 'stubs');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Sequence (defect 4)
// ---------------------------------------------------------------------------------------------------------------------
describe('sequence figures', () => {
  it('trims the viewBox to the content instead of the editor canvas (defect 4)', () => {
    const repo = richRepository();
    const [fig] = renderSequenceDiagrams(repo);
    const g = parseFigure(fig);
    const synthetic = {
      ...repo,
      diagrams: { ...repo.diagrams, d: { id: 'd', kind: 'diagram', name: 'x', namespace: [], diagramKind: 'sequence', contextElementId: 'ix_checkout' } },
    } as any;
    const canvas = buildSequenceDiagramView(synthetic, 'd').canvasSize;
    const lastMessageY = Math.max(...g.edges.flatMap(e => e.points.map(p => p.y)));
    const bottom = g.viewBox.y + g.viewBox.height;
    // a lifeline tail of 24 plus margins, not the app's canvas
    expect(bottom - lastMessageY).toBeLessThanOrEqual(24 + 16 + 12);
    expect(g.viewBox.height).toBeLessThan(canvas.height - 40);
    // lifelines end at the tail, not at the canvas bottom
    const lines = [...fig.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)" stroke="#546e7a"/g)].map(m => Number(m[3]));
    expect(lines.length).toBeGreaterThan(1);
    for (const y2 of lines) expect(y2).toBeLessThanOrEqual(lastMessageY + 24 + 12);
    expectSound(fig, 'sequence');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// IBD (defect 5, 6a)
// ---------------------------------------------------------------------------------------------------------------------
describe('internal block diagrams', () => {
  const h = richHierarchy();
  const ibd = (blockId: string) => renderIbdDiagram({
    contextBlock: h.blocks.find(b => b.id === blockId)!,
    parts: h.parts!.filter(p => p.blockId === blockId),
    connectors: h.connectors!, blocks: h.blocks, allParts: h.parts!,
  });

  it('puts the item-flow label horizontally on a connector run, not along the path (defect 5a)', () => {
    const fig = ibd('blk_veh');
    expect(fig).not.toContain('<textPath');
    const g = parseFigure(fig);
    const label = g.labels.find(l => l.text === 'torque');
    expect(label, 'label "torque" is a plain halo text').toBeDefined();
    expect(fig).toMatch(/<text class="rf-edge-label"[^>]*>torque<\/text>/);
    const route = g.edges.find(e => e.id === 'edge-con_a')!;
    // the label sits on the longest horizontal run of its own route
    const cy = label!.box.y + label!.box.height / 2;
    const near = route.points.slice(1).some((p, i) => Math.abs(p.y - route.points[i].y) < 0.5 && Math.abs(p.y - cy) < 14
      && label!.box.x >= Math.min(p.x, route.points[i].x) - 1 && label!.box.x + label!.box.width <= Math.max(p.x, route.points[i].x) + 1);
    expect(near).toBe(true);
    expectSound(fig, 'IBD Vehicle');
  });

  it('keeps boundary-port labels clear of the parts and of connector labels (defect 5b)', () => {
    const fig = ibd('blk_pt');
    const g = parseFigure(fig);
    const label = g.labels.find(l => l.text === 'torqueOut')!;
    expect(label).toBeDefined();
    for (const n of g.nodes) expect(label.box.x + label.box.width <= n.x || label.box.x >= n.x + n.width || label.box.y + label.box.height <= n.y || label.box.y >= n.y + n.height, `torqueOut vs ${n.id}`).toBe(true);
    // the frame holds a gutter at least as wide as the label between its edge and the parts
    const frame = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="none" stroke="#0b3445" stroke-width="1.2" stroke-dasharray="6 4"/.exec(fig)!;
    const frameRight = Number(frame[1]) + Number(frame[3]);
    const partsRight = Math.max(...g.nodes.map(n => n.x + n.width));
    expect(frameRight - partsRight).toBeGreaterThanOrEqual(textWidth('torqueOut', 9));
    expectSound(fig, 'IBD Powertrain');
  });

  it('routes a connector around a part that sits between its ends (defect 6a)', () => {
    const mk = (id: string, name: string, extra: Partial<BlockData> = {}): BlockData => ({ id, name, stereotype: 'block', x: 0, y: 0, width: 160, height: 100, properties: [], operations: [], constraints: [], classes: [], ports: [], ...extra } as BlockData);
    const t = mk('t', 'T', { ports: [{ id: 'po', name: 'out', type: 'Real', direction: 'out' }, { id: 'pi', name: 'in', type: 'Real', direction: 'in' }] });
    const ctx = mk('ctx', 'Ctx');
    const part = (id: string): PartData => ({ id, name: id.toUpperCase(), blockId: 'ctx', typeId: 't', multiplicity: '1', x: 0, y: 0, width: 140, height: 80 });
    const conn = (id: string, a: string, b: string): ConnectorData => ({ id, sourcePartId: a, sourcePortId: 'po', targetPartId: b, targetPortId: 'pi', itemFlow: `flow-${id}` });
    const fig = renderIbdDiagram({
      contextBlock: ctx, parts: ['p1', 'p2', 'p3'].map(part), blocks: [t, ctx],
      connectors: [conn('c1', 'p1', 'p2'), conn('c2', 'p2', 'p3'), conn('c3', 'p1', 'p3')],
    });
    const g = parseFigure(fig);
    expect(g.edges).toHaveLength(3);
    // p1 and p3 ports share a y with p2's: the direct way is blocked, so the route needs a detour (>= 6 vertices)
    expect(g.edges.find(e => e.id === 'edge-c3')!.points.length).toBeGreaterThanOrEqual(6);
    expectSound(fig, 'IBD skip connector');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Long edges in layered diagrams (defect 6a)
// ---------------------------------------------------------------------------------------------------------------------
describe('edges spanning more than one rank', () => {
  const block = (id: string, name: string, stereotype = 'block'): BlockData => ({ id, name, stereotype, x: 0, y: 0, width: 160, height: 100, properties: [], operations: [], constraints: [], classes: [], ports: [] } as BlockData);
  const rel = (id: string, sourceId: string, targetId: string, type: string): RelationshipData => ({ id, sourceId, targetId, type, label: '' } as RelationshipData);

  it('BDD: a composition from the top block to the bottom block detours around the middle block', () => {
    const fig = renderBddDiagram({
      blocks: [block('a', 'A'), block('b', 'B'), block('c', 'C')],
      relationships: [rel('r1', 'a', 'b', 'composition'), rel('r2', 'b', 'c', 'composition'), rel('r3', 'a', 'c', 'composition')],
    });
    const g = parseFigure(fig);
    expect(g.edges).toHaveLength(3);
    const b = g.nodes.find(n => n.id === 'b')!;
    // A, B and C are stacked in one column: the A -> C edge has to leave B's horizontal span to get past it
    expect(g.edges.find(e => e.id === 'edge-r3')!.points.some(p => p.x < b.x || p.x > b.x + b.width)).toBe(true);
    expectSound(fig, 'BDD skip');
  });

  it('requirements diagram: a derive that skips a level detours around the middle requirement', () => {
    const req = (id: string, reqId: string): BlockData => ({ ...block(id, reqId, 'requirement'), reqId } as BlockData);
    const fig = renderRequirementsDiagram({
      blocks: [req('a', 'R1'), req('b', 'R2'), req('c', 'R3')],
      relationships: [rel('r1', 'a', 'b', 'requirementContainment'), rel('r2', 'b', 'c', 'requirementContainment'), rel('r3', 'a', 'c', 'requirementContainment')],
    });
    const g = parseFigure(fig);
    expect(g.edges).toHaveLength(3);
    const b = g.nodes.find(n => n.id === 'b')!;
    expect(g.edges.find(e => e.id === 'edge-r3')!.points.some(p => p.x < b.x || p.x > b.x + b.width)).toBe(true);
    expectSound(fig, 'requirements skip');
  });

  it('activity: a flow that skips an action detours around it', () => {
    const repo = createEmptyRepository() as any;
    repo.definitions.act = {
      id: 'act', kind: 'activity', name: 'Skip', namespace: [], parameters: [], partitions: [],
      nodes: [{ id: 'n0', kind: 'initial', name: '' }, { id: 'n1', kind: 'action', name: 'Middle' }, { id: 'n2', kind: 'action', name: 'End action' }],
      edges: [
        { id: 'e1', kind: 'controlFlow', sourceId: 'n0', targetId: 'n1' },
        { id: 'e2', kind: 'controlFlow', sourceId: 'n1', targetId: 'n2' },
        { id: 'e3', kind: 'controlFlow', sourceId: 'n0', targetId: 'n2', guard: 'skip' },
      ],
    };
    const [fig] = renderActivityDiagrams(repo);
    const g = parseFigure(fig);
    expect(g.edges).toHaveLength(3);
    const middle = g.nodes.find(n => n.kind === 'action' && n.height > 0 && g.nodes.filter(m => m.kind === 'action').length === 2 && n.y < Math.max(...g.nodes.map(m => m.y)))!;
    expect(middle).toBeDefined();
    expect(g.edges.find(e => e.id.endsWith('e3'))!.points.some(p => p.x < middle.x || p.x > middle.x + middle.width)).toBe(true);
    expectSound(fig, 'activity skip');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Use cases (defect 6c)
// ---------------------------------------------------------------------------------------------------------------------
describe('use case relationships across views', () => {
  it('draws a relationship between use cases of two subjects once, on the view owning its source', () => {
    const repo = createEmptyRepository() as any;
    repo.subjects.s1 = { id: 's1', kind: 'subject', name: 'Alpha', namespace: [] };
    repo.subjects.s2 = { id: 's2', kind: 'subject', name: 'Beta', namespace: [] };
    const uc = (id: string, name: string, subjectId: string) => { repo.useCases[id] = { id, kind: 'useCase', name, namespace: [], subjectId, extensionPointIds: [], behaviorArtifactIds: [] }; };
    uc('u1', 'Order', 's1');
    uc('u2', 'Pay', 's2');
    repo.relationships.inc = { id: 'inc', kind: 'include', sourceId: 'u1', targetId: 'u2' };
    const [alpha, beta] = renderUseCaseDiagrams(repo);
    expect(caption(alpha)).toContain('Alpha');
    expect(caption(beta)).toContain('Beta');
    expect(alpha).toContain('data-drawn-edges="1" data-omitted-edges="0"');
    expect(beta).toContain('data-drawn-edges="0" data-omitted-edges="1"');
    expect(beta).toMatch(/Order → Pay \(include; drawn on the view that owns Order\)/);
    // the non-owning view no longer shows the foreign use case at all
    expect(parseFigure(beta).nodes.length).toBe(1);
    expect(parseFigure(alpha).nodes.length).toBe(2);
    expectSound(alpha, 'alpha');
    expectSound(beta, 'beta');
  });
});

describe('geometry helper', () => {
  const figure = (inner: string) => `<figure class="report-figure"><svg viewBox="0 0 100 100">${inner}</svg></figure>`;
  it('reports an edge through a node, a drawn point outside the viewBox and overlapping labels', () => {
    const g = parseFigure(figure(
      `<g class="rf-node" data-x="40" data-y="40" data-w="20" data-h="20"><rect x="40" y="40" width="20" height="20"/></g>`
      + `<path id="edge-x" d="M 50 0 L 50 100 L 150 100"/>`
      + `<text class="rf-edge-label" x="10" y="20" font-size="9" text-anchor="start">abcdef</text><text class="rf-edge-label" x="12" y="21" font-size="9" text-anchor="start">abcdef</text>`,
    ));
    expect(edgeNodeCollisions(g)).toHaveLength(1);
    expect(outsideViewBox(g).length).toBeGreaterThan(0);
    expect(labelCollisions(g)).toHaveLength(1);
  });
  it('accepts a clean figure', () => {
    const g = parseFigure(figure(`<g class="rf-node" data-x="40" data-y="40" data-w="20" data-h="20"></g><path id="edge-x" d="M 20 0 L 20 90"/>`));
    expect(edgeNodeCollisions(g)).toEqual([]);
    expect(outsideViewBox(g)).toEqual([]);
  });
});