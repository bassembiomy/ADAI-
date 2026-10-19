import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData } from '../../types/sysml_types';
import { PORTRAIT_FIGURE_MAX_HEIGHT, PORTRAIT_VIEW_MAX_WIDTH, renderBddDiagram, renderRequirementsDiagram } from './reportDiagrams';
import { edgeNodeCollisions, figuresOf, labelCollisions, outsideViewBox, parseFigure } from './figureGeometry.testutil';
import { Box, boxesIntersect, svgTexts } from './reportSvgGeometry';

const block = (id: string, extra: Partial<BlockData> = {}): BlockData =>
  ({ id, name: id, stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [], ...extra } as BlockData);
const rel = (id: string, type: RelationshipData['type'], sourceId: string, targetId: string, extra: Partial<RelationshipData> = {}): RelationshipData =>
  ({ id, type, sourceId, targetId, label: '', ...extra } as RelationshipData);

function multiplicityBoxes(figure: string): { text: string; box: Box }[] {
  return svgTexts(figure.replace(/<defs>[\s\S]*?<\/defs>/, '')).filter(t => t.cls.includes('rf-multiplicity')).map(t => ({ text: t.text, box: t.box }));
}

function expectNoOverlap(figure: string, what: string): void {
  const g = parseFigure(figure);
  const labels = multiplicityBoxes(figure);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      expect(boxesIntersect(labels[i].box, labels[j].box), `${what}: "${labels[i].text}" overlaps "${labels[j].text}"`).toBe(false);
    }
    for (const n of g.nodes) expect(boxesIntersect(labels[i].box, n), `${what}: "${labels[i].text}" touches node ${n.id}`).toBe(false);
    for (const l of g.labels) expect(boxesIntersect(labels[i].box, l.box), `${what}: "${labels[i].text}" overlaps edge label "${l.text}"`).toBe(false);
  }
  expect(edgeNodeCollisions(g), `${what}: edges through nodes`).toEqual([]);
  expect(outsideViewBox(g), `${what}: outside viewBox`).toEqual([]);
  expect(labelCollisions(g), `${what}: label collisions`).toEqual([]);
}

describe('BDD multiplicity labels', () => {
  const kids = Array.from({ length: 12 }, (_, i) => `c${i}`);

  it('gives every multiplicity of a 12-way composition fan its own spot (source and target ends)', () => {
    const fig = renderBddDiagram({
      blocks: [block('parent'), ...kids.map(k => block(k))],
      relationships: kids.map((k, i) => rel(`r${i}`, 'composition', 'parent', k, { sourceMultiplicity: '1', targetMultiplicity: '1' })),
    });
    const figures = figuresOf(fig);
    expect(figures).toHaveLength(1);
    expect(multiplicityBoxes(fig)).toHaveLength(24);
    expectNoOverlap(fig, 'fan');
  });

  it('keeps wide and role-carrying multiplicities apart too', () => {
    const fig = renderBddDiagram({
      blocks: [block('parent'), ...kids.slice(0, 6).map(k => block(k))],
      relationships: kids.slice(0, 6).map((k, i) => rel(`r${i}`, 'composition', 'parent', k,
        { sourceMultiplicity: '0..*', targetMultiplicity: '1..*', sourceRole: 'owner', targetRole: `part${i}` })),
    });
    expect(multiplicityBoxes(fig)).toHaveLength(12);
    expectNoOverlap(fig, 'roles');
  });

  it('separates the labels of parallel edges between the same two blocks', () => {
    const fig = renderBddDiagram({
      blocks: [block('a'), block('b')],
      relationships: [0, 1, 2].map(i => rel(`r${i}`, 'association', 'a', 'b', { sourceMultiplicity: '1', targetMultiplicity: '0..*' })),
    });
    expect(multiplicityBoxes(fig)).toHaveLength(6);
    expectNoOverlap(fig, 'parallel');
  });
});

describe('BDD page budget', () => {
  const printedHeight = (figure: string) => {
    const [, w, h] = /viewBox="[-\d.]+ [-\d.]+ (\d+) (\d+)"/.exec(figure)!.map(Number);
    return { w, h: h * Math.min(1, 680 / w) };
  };

  it('splits a 30-block tree into portrait views that each fit the page, losing no block or relationship', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `n${i}`);
    // a ternary tree: n0 owns n1..n3, n1 owns n4..n6, ...
    const relationships = ids.slice(1).map((id, i) => rel(`r${i}`, 'composition', ids[Math.floor(i / 3)], id, { sourceMultiplicity: '1', targetMultiplicity: '1..*' }));
    const html = renderBddDiagram({ blocks: ids.map(id => block(id, { properties: [{ id: `${id}p`, name: 'speed', type: 'Real' } as any] })), relationships });
    const figures = figuresOf(html);
    expect(figures.length).toBeGreaterThan(1);
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();
    for (const f of figures) {
      const { w, h } = printedHeight(f);
      expect(w).toBeLessThanOrEqual(PORTRAIT_VIEW_MAX_WIDTH);
      expect(h).toBeLessThanOrEqual(PORTRAIT_FIGURE_MAX_HEIGHT);
      const g = parseFigure(f);
      g.nodes.forEach(n => seenNodes.add(n.id));
      g.edges.forEach(e => seenEdges.add(e.id.replace('edge-', '')));
      expectNoOverlap(f, 'view');
    }
    expect([...seenNodes].sort()).toEqual([...ids].sort());
    expect(seenEdges.size).toBe(relationships.length);
  });

  it('splits a 19-way star (one parent, many children) instead of printing one tall figure', () => {
    const ids = Array.from({ length: 19 }, (_, i) => `k${i}`);
    const html = renderBddDiagram({
      blocks: [block('root'), ...ids.map(id => block(id, { properties: [{ id: `${id}p`, name: 'a', type: 'Real' } as any] }))],
      relationships: ids.map((id, i) => rel(`r${i}`, 'composition', 'root', id, { sourceMultiplicity: '1', targetMultiplicity: '1' })),
    });
    for (const f of figuresOf(html)) {
      expect(printedHeight(f).h).toBeLessThanOrEqual(PORTRAIT_FIGURE_MAX_HEIGHT);
      expectNoOverlap(f, 'star view');
    }
  });
});

describe('requirements diagram labels', () => {
  it('keeps an edge label off a node that is neither end of its edge', () => {
    const req = (id: string, reqId: string): BlockData => ({ ...block(id, { name: `Requirement ${reqId}` }), stereotype: 'requirement', reqId } as BlockData);
    // v satisfies a, skipping the middle requirement m that sits between them
    const fig = renderRequirementsDiagram({
      blocks: [req('a', 'R1'), req('m', 'R2'), req('z', 'R3'), block('v', { name: 'Vehicle' })],
      relationships: [
        rel('c1', 'requirementContainment', 'a', 'm'),
        rel('c2', 'requirementContainment', 'a', 'z'),
        rel('c3', 'requirementContainment', 'm', 'v'),
        rel('s1', 'satisfy', 'v', 'a'),
      ],
    });
    const g = parseFigure(fig);
    expect(g.labels.length).toBeGreaterThanOrEqual(4);
    for (const l of g.labels) for (const n of g.nodes) expect(boxesIntersect(l.box, n), `label "${l.text}" touches ${n.id}`).toBe(false);
    expect(labelCollisions(g)).toEqual([]);
    expect(outsideViewBox(g)).toEqual([]);
  });
});
