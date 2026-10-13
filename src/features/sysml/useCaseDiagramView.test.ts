import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import {
  buildUseCaseDiagramView,
  checkUseCaseConnection,
  clipToNode,
  proposeSubjectAssignments,
  subjectContaining,
  subjectMemberIds,
  useCaseMinHeight,
  USE_CASE_SIZE,
  withBoundsOverrides,
} from './useCaseDiagramView';

function fixture(): { repo: SysmlRepository; presentation: DiagramPresentation } {
  const repo = createEmptyRepository();
  repo.actors.pilot = { id: 'pilot', kind: 'actor', name: 'Pilot', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] };
  repo.actors.captain = { id: 'captain', kind: 'actor', name: 'Captain', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] };
  repo.subjects.plane = { id: 'plane', kind: 'subject', name: 'Aircraft', namespace: [], ownerId: 'model' };
  repo.useCases.fly = { id: 'fly', kind: 'useCase', name: 'Fly', namespace: [], ownerId: 'model', extensionPointIds: ['ep1'], behaviorArtifactIds: [] };
  repo.useCases.land = { id: 'land', kind: 'useCase', name: 'Land', namespace: [], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] };
  repo.useCases.checks = { id: 'checks', kind: 'useCase', name: 'Run checks', namespace: [], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] };
  repo.extensionPoints.ep1 = { id: 'ep1', kind: 'extensionPoint', name: 'turbulence', namespace: [], useCaseId: 'fly' };
  repo.requirements.r1 = {
    id: 'r1', kind: 'requirement', name: 'Safe landing', namespace: [], ownerId: 'model', requirementId: 'REQ-1', text: 't',
    status: 'draft', version: '1',
  };
  const place = (id: string, x: number, y: number, width?: number, height?: number) =>
    [id, { id: `p-${id}`, diagramId: 'd', semanticElementId: id, bounds: { x, y, width, height } }] as const;
  const presentation: DiagramPresentation = {
    elementIds: ['pilot', 'captain', 'plane', 'fly', 'land', 'checks', 'r1'],
    presentations: Object.fromEntries([
      place('pilot', 20, 200), place('captain', 20, 400),
      place('plane', 200, 40, 400, 500),
      place('fly', 250, 100), place('land', 250, 260), place('checks', 700, 100),
      place('r1', 700, 400),
    ]),
  };
  return { repo, presentation };
}

function addRel(repo: SysmlRepository, id: string, kind: SysmlRepository['relationships'][string]['kind'], sourceId: string, targetId: string, extra: object = {}) {
  repo.relationships[id] = { id, kind, sourceId, targetId, ...extra };
}

describe('buildUseCaseDiagramView nodes', () => {
  it('projects each kind with its label and orders subjects behind everything else', () => {
    const { repo, presentation } = fixture();
    const view = buildUseCaseDiagramView(repo, presentation);
    expect(view.nodes.map(n => n.kind)).toEqual(['subject', 'requirement', 'actor', 'actor', 'useCase', 'useCase', 'useCase']);
    expect(view.nodes.find(n => n.id === 'pilot')?.label).toBe('Pilot');
    expect(view.nodes.find(n => n.id === 'plane')?.bounds).toEqual({ x: 200, y: 40, width: 400, height: 500 });
  });

  it('lists extension points in the use case compartment and grows the ellipse to fit them', () => {
    const { repo, presentation } = fixture();
    const fly = buildUseCaseDiagramView(repo, presentation).nodes.find(n => n.id === 'fly')!;
    expect(fly.extensionPoints.map(ep => ep.label)).toEqual(['turbulence']);
    expect(fly.bounds.height).toBe(useCaseMinHeight(1));
    expect(fly.bounds.height).toBeGreaterThan(USE_CASE_SIZE.height);
    const land = buildUseCaseDiagramView(repo, presentation).nodes.find(n => n.id === 'land')!;
    expect(land.bounds.height).toBe(USE_CASE_SIZE.height);
  });

  it('never exposes internal ids as labels (unnamed elements fall back to the kind)', () => {
    const { repo, presentation } = fixture();
    repo.useCases.fly.name = '';
    const fly = buildUseCaseDiagramView(repo, presentation).nodes.find(n => n.id === 'fly')!;
    expect(fly.label).not.toContain('fly');
    expect(fly.label.length).toBeGreaterThan(0);
  });

  it('reports presented ids that no longer resolve and skips them', () => {
    const { repo, presentation } = fixture();
    delete repo.useCases.land;
    const view = buildUseCaseDiagramView(repo, presentation);
    expect(view.missingElementIds).toEqual(['land']);
    expect(view.nodes.some(n => n.id === 'land')).toBe(false);
  });

  it('places elements without stored bounds on a deterministic grid', () => {
    const { repo } = fixture();
    const view = buildUseCaseDiagramView(repo, { elementIds: ['pilot', 'fly'], presentations: {} });
    expect(view.nodes.map(n => [n.bounds.x, n.bounds.y])).toEqual([[60, 60], [290, 60]]);
  });
});

describe('buildUseCaseDiagramView edge notation', () => {
  it('association is a solid line with no keyword and no head', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'a1', 'useCaseAssociation', 'pilot', 'fly');
    const edge = buildUseCaseDiagramView(repo, presentation).edges[0];
    expect(edge).toMatchObject({ lineStyle: 'solid', head: 'none', keyword: '', noteLines: [] });
  });

  it('include is dashed with an open arrow at the included use case and the «include» keyword', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'i1', 'include', 'fly', 'checks');
    const edge = buildUseCaseDiagramView(repo, presentation).edges[0];
    expect(edge).toMatchObject({ lineStyle: 'dashed', head: 'openArrow', keyword: '«include»', sourceId: 'fly', targetId: 'checks' });
  });

  it('extend runs extension -> base, names the extension point and shows the condition', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'e1', 'extend', 'land', 'fly', { extensionPointId: 'ep1', name: 'strong wind' });
    const edge = buildUseCaseDiagramView(repo, presentation).edges[0];
    expect(edge).toMatchObject({ lineStyle: 'dashed', head: 'openArrow', keyword: '«extend»', sourceId: 'land', targetId: 'fly' });
    expect(edge.noteLines).toEqual(['extension point: turbulence', '[strong wind]']);
  });

  it('extend with a dangling extension point says unresolved instead of leaking an id', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'e1', 'extend', 'land', 'fly', { extensionPointId: 'gone' });
    const edge = buildUseCaseDiagramView(repo, presentation).edges[0];
    expect(edge.noteLines).toEqual(['extension point: (unresolved)']);
    expect(edge.noteLines.join(' ')).not.toContain('gone');
  });

  it('generalization is a solid line with a hollow triangle at the general element', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'g1', 'useCaseGeneralization', 'captain', 'pilot');
    const edge = buildUseCaseDiagramView(repo, presentation).edges[0];
    expect(edge).toMatchObject({ lineStyle: 'solid', head: 'hollowTriangle', keyword: '' });
  });

  it.each([
    ['useCaseSatisfy', 'fly', 'r1', '«satisfy»'],
    ['useCaseRefine', 'fly', 'r1', '«refine»'],
    ['useCaseTrace', 'r1', 'fly', '«trace»'],
  ] as const)('%s is a dashed open arrow with its keyword', (kind, source, target, keyword) => {
    const { repo, presentation } = fixture();
    addRel(repo, 'x1', kind, source, target);
    const edge = buildUseCaseDiagramView(repo, presentation).edges[0];
    expect(edge).toMatchObject({ lineStyle: 'dashed', head: 'openArrow', keyword, sourceId: source, targetId: target });
  });

  it('only draws edges whose two ends are shown and skips non use-case relationships', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'a1', 'useCaseAssociation', 'pilot', 'fly');
    addRel(repo, 'a2', 'useCaseAssociation', 'pilot', 'land');
    addRel(repo, 'alloc', 'allocation', 'fly', 'land');
    const view = buildUseCaseDiagramView(repo, { ...presentation, elementIds: presentation.elementIds.filter(id => id !== 'land') });
    expect(view.edges.map(e => e.id)).toEqual(['a1']);
  });

  it('honours edges the user removed from this diagram', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'a1', 'useCaseAssociation', 'pilot', 'fly');
    const view = buildUseCaseDiagramView(repo, { ...presentation, hiddenElementIds: ['a1'] });
    expect(view.edges).toEqual([]);
    expect(view.hiddenEdgeIds).toEqual(['a1']);
  });

  it('clips edge ends to the shape outline (ellipse for use cases)', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'i1', 'include', 'fly', 'checks');
    const view = buildUseCaseDiagramView(repo, presentation);
    const edge = view.edges[0];
    const fly = view.nodes.find(n => n.id === 'fly')!;
    const a = fly.bounds.width / 2;
    const b = fly.bounds.height / 2;
    const cx = fly.bounds.x + a;
    const cy = fly.bounds.y + b;
    expect(((edge.start.x - cx) / a) ** 2 + ((edge.start.y - cy) / b) ** 2).toBeCloseTo(1, 6);
  });

  it('fans parallel edges between the same pair so none overlaps another', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'a1', 'useCaseAssociation', 'pilot', 'fly');
    addRel(repo, 'a2', 'useCaseTrace', 'pilot', 'fly');
    const [one, two] = buildUseCaseDiagramView(repo, presentation).edges;
    expect(one.start).not.toEqual(two.start);
  });

  it('is deterministic: edges are ordered by id', () => {
    const { repo, presentation } = fixture();
    addRel(repo, 'z', 'useCaseAssociation', 'pilot', 'fly');
    addRel(repo, 'b', 'useCaseAssociation', 'captain', 'land');
    expect(buildUseCaseDiagramView(repo, presentation).edges.map(e => e.id)).toEqual(['b', 'z']);
  });
});

describe('clipToNode', () => {
  it('leaves a rectangle through the side facing the target', () => {
    const point = clipToNode({ kind: 'actor', bounds: { x: 0, y: 0, width: 100, height: 100 } }, { x: 300, y: 50 });
    expect(point).toEqual({ x: 100, y: 50 });
  });
});

describe('subject nesting', () => {
  it('finds the innermost subject under a use case centre', () => {
    const subjects = [
      { id: 'outer', bounds: { x: 0, y: 0, width: 500, height: 500 } },
      { id: 'inner', bounds: { x: 100, y: 100, width: 200, height: 200 } },
    ];
    expect(subjectContaining({ x: 150, y: 150, width: 40, height: 40 }, subjects)).toBe('inner');
    expect(subjectContaining({ x: 400, y: 400, width: 40, height: 40 }, subjects)).toBe('outer');
    expect(subjectContaining({ x: 900, y: 900, width: 40, height: 40 }, subjects)).toBeUndefined();
  });

  it('proposes assigning use cases drawn inside a subject and not yet members', () => {
    const { repo, presentation } = fixture();
    const view = buildUseCaseDiagramView(repo, presentation);
    // fly (250,100) and land (250,260) sit inside Aircraft (200,40,400x500); checks (700,100) is outside.
    expect(proposeSubjectAssignments(view)).toEqual([
      { useCaseId: 'fly', fromSubjectId: undefined, toSubjectId: 'plane' },
      { useCaseId: 'land', fromSubjectId: undefined, toSubjectId: 'plane' },
    ]);
  });

  it('proposes nothing once the stored subject already matches the geometry', () => {
    const { repo, presentation } = fixture();
    repo.useCases.fly.subjectId = 'plane';
    repo.useCases.land.subjectId = 'plane';
    expect(proposeSubjectAssignments(buildUseCaseDiagramView(repo, presentation))).toEqual([]);
  });

  it('proposes removing a use case dragged out of its (shown) subject', () => {
    const { repo, presentation } = fixture();
    repo.useCases.checks.subjectId = 'plane'; // stored member, but drawn at x=700 (outside)
    const proposals = proposeSubjectAssignments(buildUseCaseDiagramView(repo, presentation), { useCaseIds: ['checks'] });
    expect(proposals).toEqual([{ useCaseId: 'checks', fromSubjectId: 'plane' }]);
  });

  it('leaves a use case alone when its subject is not shown on this diagram', () => {
    const { repo, presentation } = fixture();
    repo.useCases.checks.subjectId = 'plane';
    const withoutSubject = { ...presentation, elementIds: presentation.elementIds.filter(id => id !== 'plane') };
    expect(proposeSubjectAssignments(buildUseCaseDiagramView(repo, withoutSubject))).toEqual([]);
  });

  it('can be restricted to the use cases touched by a gesture', () => {
    const { repo, presentation } = fixture();
    const view = buildUseCaseDiagramView(repo, presentation);
    expect(proposeSubjectAssignments(view, { useCaseIds: ['land'] }).map(p => p.useCaseId)).toEqual(['land']);
  });

  it('moves members with their subject: only stored members drawn inside', () => {
    const { repo, presentation } = fixture();
    repo.useCases.fly.subjectId = 'plane';
    repo.useCases.checks.subjectId = 'plane'; // member by data, but drawn outside
    const view = buildUseCaseDiagramView(repo, presentation);
    expect(subjectMemberIds(view, 'plane')).toEqual(['fly']);
  });
});

describe('withBoundsOverrides', () => {
  it('previews a drop without mutating the stored presentation', () => {
    const { repo, presentation } = fixture();
    const snapshot = JSON.stringify(presentation);
    const preview = withBoundsOverrides(presentation, { land: { x: 900, y: 900, width: 180, height: 72 } });
    expect(JSON.stringify(presentation)).toBe(snapshot);
    const land = buildUseCaseDiagramView(repo, preview).nodes.find(n => n.id === 'land')!;
    expect(land.bounds).toMatchObject({ x: 900, y: 900 });
    // Dropping `land` outside the subject while it is a stored member proposes removal.
    repo.useCases.land.subjectId = 'plane';
    expect(proposeSubjectAssignments(buildUseCaseDiagramView(repo, preview), { useCaseIds: ['land'] }))
      .toEqual([{ useCaseId: 'land', fromSubjectId: 'plane' }]);
  });
});

describe('checkUseCaseConnection', () => {
  it('accepts the legal endpoint combinations of each relationship kind', () => {
    const { repo } = fixture();
    expect(checkUseCaseConnection(repo, 'useCaseAssociation', 'pilot', 'fly').allowed).toBe(true);
    expect(checkUseCaseConnection(repo, 'useCaseAssociation', 'fly', 'pilot').allowed).toBe(true);
    expect(checkUseCaseConnection(repo, 'include', 'fly', 'checks').allowed).toBe(true);
    expect(checkUseCaseConnection(repo, 'extend', 'land', 'fly').allowed).toBe(true);
    expect(checkUseCaseConnection(repo, 'useCaseGeneralization', 'captain', 'pilot').allowed).toBe(true);
    expect(checkUseCaseConnection(repo, 'useCaseSatisfy', 'fly', 'r1').allowed).toBe(true);
    expect(checkUseCaseConnection(repo, 'useCaseTrace', 'r1', 'fly').allowed).toBe(true);
  });

  it('rejects illegal endpoint combinations with a typed code', () => {
    const { repo } = fixture();
    expect(checkUseCaseConnection(repo, 'useCaseAssociation', 'pilot', 'captain').diagnostics[0].code).toBe('INVALID_USE_CASE_ASSOCIATION_ENDPOINTS');
    expect(checkUseCaseConnection(repo, 'include', 'pilot', 'fly').diagnostics[0].code).toBe('INVALID_INCLUDE_ENDPOINTS');
    expect(checkUseCaseConnection(repo, 'extend', 'fly', 'plane').allowed).toBe(false);
    expect(checkUseCaseConnection(repo, 'useCaseGeneralization', 'pilot', 'fly').diagnostics[0].code).toBe('INVALID_GENERALIZATION_FAMILY');
    expect(checkUseCaseConnection(repo, 'useCaseSatisfy', 'r1', 'fly').allowed).toBe(false);
    expect(checkUseCaseConnection(repo, 'include', 'fly', 'fly').diagnostics[0].code).toBe('SELF_RELATIONSHIP');
  });

  it('rejects a duplicate relationship', () => {
    const { repo } = fixture();
    addRel(repo, 'a1', 'useCaseAssociation', 'pilot', 'fly');
    expect(checkUseCaseConnection(repo, 'useCaseAssociation', 'pilot', 'fly').diagnostics[0].code).toBe('DUPLICATE_RELATIONSHIP');
  });
});
