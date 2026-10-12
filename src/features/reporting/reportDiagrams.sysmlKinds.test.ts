import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import {
  renderActivityDiagrams, renderPackageDiagrams, renderParametricDiagrams, renderSequenceDiagrams, renderUseCaseDiagrams,
} from './reportDiagrams.sysml';

const mult = { lower: 1, upper: 1 as const, ordered: false, unique: true };

function accounting(html: string): { drawn: number; omitted: number } {
  const drawn = /data-drawn-edges="(\d+)"/.exec(html);
  const omitted = /data-omitted-edges="(\d+)"/.exec(html);
  expect(drawn, 'data-drawn-edges').not.toBeNull();
  expect(omitted, 'data-omitted-edges').not.toBeNull();
  return { drawn: Number(drawn![1]), omitted: Number(omitted![1]) };
}

function nodeRects(html: string): { kind: string; x: number; y: number; w: number; h: number }[] {
  return [...html.matchAll(/<g class="rf-node" data-kind="([^"]+)" data-x="([-\d.]+)" data-y="([-\d.]+)" data-w="([-\d.]+)" data-h="([-\d.]+)"/g)]
    .map(m => ({ kind: m[1], x: Number(m[2]), y: Number(m[3]), w: Number(m[4]), h: Number(m[5]) }));
}

function expectNoNodeOverlap(html: string): void {
  const rects = nodeRects(html);
  expect(rects.length).toBeGreaterThan(0);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.kind}#${i} overlaps ${b.kind}#${j}`).toBe(false);
    }
  }
}

function expectNoRawIds(html: string, ids: string[]): void {
  const visible = html.replace(/(id|href|data-[a-z-]+)="[^"]*"/g, '');
  for (const id of ids) expect(visible, `raw id ${id} leaked`).not.toContain(id);
}

// ---------------------------------------------------------------------------
describe('empty repository', () => {
  it('returns no figures for every new renderer', () => {
    const repo = createEmptyRepository();
    expect(renderPackageDiagrams(repo)).toEqual([]);
    expect(renderUseCaseDiagrams(repo)).toEqual([]);
    expect(renderActivityDiagrams(repo)).toEqual([]);
    expect(renderSequenceDiagrams(repo)).toEqual([]);
    expect(renderParametricDiagrams(repo)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
function packageRepo(): SysmlRepository {
  const repo = createEmptyRepository();
  const pkg = (id: string, name: string, ownerId: string, extra: object = {}) => {
    (repo.packages as any)[id] = { id, kind: 'package', name, namespace: [], ownerId, ...extra };
  };
  pkg('pkgA', 'Structure', 'model');
  pkg('pkgB', 'Behaviour', 'model');
  pkg('pkgLib', 'Library', 'model', { stereotype: 'modelLibrary' });
  pkg('pkgC', 'Sub', 'pkgA');
  (repo.definitions as any).vehicle = { id: 'vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'pkgA', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  (repo.definitions as any).engine = { ...(repo.definitions as any).vehicle, id: 'engine', name: 'Engine' };
  (repo.requirements as any).r1 = { id: 'r1', kind: 'requirement', name: 'Range', namespace: [], ownerId: 'pkgA', requirementId: 'R1', text: 'x', status: 'draft', version: '1' };
  const rel = (id: string, kind: string, sourceId: string, targetId: string, extra: object = {}) => {
    (repo.relationships as any)[id] = { id, kind, sourceId, targetId, ...extra };
  };
  rel('i1', 'packageImport', 'pkgB', 'pkgA', { importingNamespaceId: 'pkgB', importedPackageId: 'pkgA', visibility: 'public' });
  rel('i2', 'packageImport', 'pkgB', 'pkgLib', { importingNamespaceId: 'pkgB', importedPackageId: 'pkgLib', visibility: 'private' });
  rel('i3', 'elementImport', 'pkgB', 'vehicle', { importingNamespaceId: 'pkgB', importedElementId: 'vehicle', visibility: 'public', alias: 'Car' });
  rel('m1', 'packageMerge', 'pkgC', 'pkgLib', { mergingPackageId: 'pkgC', mergedPackageId: 'pkgLib' });
  rel('ghost', 'packageImport', 'pkgB', 'missingPkg', { importingNamespaceId: 'pkgB', importedPackageId: 'missingPkg', visibility: 'public' });
  return repo;
}

describe('renderPackageDiagrams', () => {
  it('draws the ownership tree, imports, merges and per-package element counts with accounting', () => {
    const figures = renderPackageDiagrams(packageRepo());
    expect(figures).toHaveLength(1);
    const html = figures[0];
    expect(html).toContain('Package diagram');
    for (const name of ['Model', 'Structure', 'Behaviour', 'Library', 'Sub']) expect(html).toContain(`>${name}<`);
    expect(html).toContain('«modelLibrary»');
    expect(html).toContain('2 blocks');
    expect(html).toContain('1 requirement');
    expect(html).toContain('«import»');
    expect(html).toContain('«access»');
    expect(html).toContain('«import» Car');
    expect(html).toContain('«merge»');
    expect(html).toContain('requirement-containment-crosshair');
    // 4 ownership edges + 3 imports + 1 merge drawn; the import of a package that is not in the model is reported.
    expect(accounting(html)).toEqual({ drawn: 8, omitted: 1 });
    expect(html).toContain('report-figure-omitted');
    expect(html).toContain('Behaviour → Unknown element');
    expectNoNodeOverlap(html);
    expectNoRawIds(html, ['pkgA', 'pkgB', 'pkgLib', 'missingPkg']);
  });

  it('places an owner above the packages it owns', () => {
    const html = renderPackageDiagrams(packageRepo())[0];
    const rects = nodeRects(html);
    const text = (name: string) => Number(new RegExp(`<text x="[^"]+" y="([\\d.]+)"[^>]*>${name}</text>`).exec(html)![1]);
    expect(text('Model')).toBeLessThan(text('Structure'));
    expect(text('Structure')).toBeLessThan(text('Sub'));
    expect(rects.length).toBe(6);
  });

  it('paginates large package trees and keeps drawn + omitted equal to the connections touching each page', () => {
    const repo = createEmptyRepository();
    for (let i = 0; i < 30; i++) (repo.packages as any)[`p${i}`] = { id: `p${i}`, kind: 'package', name: `Pkg ${i}`, namespace: [], ownerId: i === 0 ? 'model' : `p${Math.floor((i - 1) / 3)}` };
    const figures = renderPackageDiagrams(repo);
    expect(figures.length).toBeGreaterThan(1);
    for (const f of figures) {
      const a = accounting(f);
      expect(a.drawn).toBeGreaterThan(0);
      expectNoNodeOverlap(f);
    }
  });
});

// ---------------------------------------------------------------------------
function useCaseRepo(): SysmlRepository {
  const repo = createEmptyRepository();
  (repo.subjects as any).subj1 = { id: 'subj1', kind: 'subject', name: 'Thermostat', namespace: [], ownerId: 'model' };
  const uc = (id: string, name: string, subjectId?: string, extensionPointIds: string[] = []) => {
    (repo.useCases as any)[id] = { id, kind: 'useCase', name, namespace: [], ownerId: 'model', subjectId, extensionPointIds, behaviorArtifactIds: [] };
  };
  uc('ucSet', 'Set Temperature', 'subj1', ['ep1']);
  uc('ucView', 'View Temperature', 'subj1');
  uc('ucAlarm', 'Raise Alarm', 'subj1');
  uc('ucCal', 'Calibrate Sensor');
  (repo.extensionPoints as any).ep1 = { id: 'ep1', kind: 'extensionPoint', name: 'overheat', namespace: [], useCaseId: 'ucSet' };
  const actor = (id: string, name: string, isExternal = false) => {
    (repo.actors as any)[id] = { id, kind: 'actor', name, namespace: [], ownerId: 'model', isExternal, generalizationIds: [] };
  };
  actor('user', 'Home Owner');
  actor('admin', 'Administrator');
  actor('tech', 'Technician');
  actor('lonely', 'Weather Service', true);
  (repo.requirements as any).req1 = { id: 'req1', kind: 'requirement', name: 'Comfort', namespace: [], requirementId: 'R1', text: 't', status: 'draft', version: '1' };
  const rel = (id: string, kind: string, sourceId: string, targetId: string, extra: object = {}) => {
    (repo.relationships as any)[id] = { id, kind, sourceId, targetId, ...extra };
  };
  rel('a1', 'useCaseAssociation', 'user', 'ucSet');
  rel('a2', 'useCaseAssociation', 'user', 'ucView');
  rel('a3', 'useCaseAssociation', 'tech', 'ucCal');
  rel('inc', 'include', 'ucSet', 'ucView');
  rel('ext', 'extend', 'ucAlarm', 'ucSet', { extensionPointId: 'ep1', name: 'temp > 90' });
  rel('gen', 'useCaseGeneralization', 'ucAlarm', 'ucView');
  rel('agen', 'useCaseGeneralization', 'admin', 'user');
  rel('sat', 'useCaseSatisfy', 'ucSet', 'req1');
  rel('bad', 'include', 'ucView', 'ghostUseCase');
  return repo;
}

describe('renderUseCaseDiagrams', () => {
  const figures = renderUseCaseDiagrams(useCaseRepo());

  it('emits one figure per subject plus one for unassigned use cases and orphan actors', () => {
    expect(figures).toHaveLength(2);
    expect(figures[0]).toContain('Use case diagram · Thermostat');
    expect(figures[1]).toContain('Use case diagram · Unassigned use cases');
  });

  it('draws the subject boundary, ellipses, stick figures and the UML relationship notation', () => {
    const f = figures[0];
    expect(f).toContain('>Thermostat<');
    expect((f.match(/<ellipse/g) ?? []).length).toBe(3);
    expect(f).toContain('>Set Temperature<');
    expect(f).toContain('extension points');
    expect(f).toContain('>overheat<');
    for (const actor of ['Home Owner', 'Administrator']) expect(f).toContain(`>${actor}<`);
    expect((f.match(/data-kind="actor"/g) ?? []).length).toBe(2);
    expect(f).toContain('«include»');
    expect(f).toContain('«extend»');
    expect(f).toContain('extension point: overheat');
    expect(f).toContain('[temp &gt; 90]');
    expect(f).toContain('rf-triangle-hollow');
    expect(f).toContain('«satisfy»');
    expect(f).toContain('«requirement»');
    expect(f).toContain('stroke-dasharray="5 4"');
  });

  it('accounts for every relationship in scope and names the one it cannot draw', () => {
    // association x2, include, extend, generalization, satisfy, actor generalization drawn; include to a missing element reported.
    expect(accounting(figures[0])).toEqual({ drawn: 7, omitted: 1 });
    expect(figures[0]).toContain('View Temperature → Unknown element');
    expect(accounting(figures[1])).toEqual({ drawn: 1, omitted: 0 });
    expect(figures[1]).toContain('>Weather Service<');
    expect(figures[1]).toContain('«external»');
  });

  it('never overlaps nodes and never prints ids', () => {
    figures.forEach(expectNoNodeOverlap);
    figures.forEach(f => expectNoRawIds(f, ['ucSet', 'ucView', 'ucAlarm', 'ucCal', 'subj1', 'ghostUseCase', 'ep1']));
  });

  it('paginates a subject with more than the figure limit of use cases', () => {
    const repo = createEmptyRepository();
    (repo.subjects as any).s = { id: 's', kind: 'subject', name: 'Big', namespace: [] };
    for (let i = 0; i < 25; i++) (repo.useCases as any)[`u${i}`] = { id: `u${i}`, kind: 'useCase', name: `Case ${i}`, namespace: [], subjectId: 's', extensionPointIds: [], behaviorArtifactIds: [] };
    (repo.relationships as any).x = { id: 'x', kind: 'include', sourceId: 'u0', targetId: 'u24' };
    const pages = renderUseCaseDiagrams(repo);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('view 1 of 2');
    // The include crosses pages: the page owning its source draws it (the far end is shown outside the boundary);
    // the other page lists it as not drawn rather than repeating it (R3 defect 6c).
    expect(accounting(pages[0])).toEqual({ drawn: 1, omitted: 0 });
    expect(accounting(pages[1])).toEqual({ drawn: 0, omitted: 1 });
    pages.forEach(expectNoNodeOverlap);
  });
});

// ---------------------------------------------------------------------------
function activityRepo(): { repo: SysmlRepository; edgeCount: number } {
  const repo = createEmptyRepository();
  (repo.definitions as any).order = { id: 'order', kind: 'valueType', name: 'Order', namespace: [] };
  (repo.definitions as any).shipAct = { id: 'shipAct', kind: 'activity', name: 'Ship Parcel', namespace: [], parameters: [], nodes: [], edges: [], partitions: [] };
  const nodes = [
    { id: 'init', kind: 'initial', name: '' },
    { id: 'place', kind: 'action', name: 'Place Order', pins: [{ id: 'placeOut', name: 'orderOut', direction: 'out', typeId: 'order' }] },
    { id: 'dec', kind: 'decision', name: 'In stock?' },
    { id: 'pick', kind: 'action', name: 'Pick Items', pins: [{ id: 'pickIn', name: 'orderIn', direction: 'in', typeId: 'order' }] },
    { id: 'fork', kind: 'fork', name: '' },
    { id: 'pack', kind: 'action', name: 'Pack' },
    { id: 'ship', kind: 'action', name: 'Ship', behaviorId: 'shipAct' },
    { id: 'join', kind: 'join', name: '' },
    { id: 'merge', kind: 'merge', name: '' },
    { id: 'obj', kind: 'objectNode', name: 'Parcel', typeId: 'order' },
    { id: 'flowFin', kind: 'flowFinal', name: '' },
    { id: 'fin', kind: 'activityFinal', name: '' },
  ];
  const edges = [
    { id: 'e1', kind: 'controlFlow', sourceId: 'init', targetId: 'place' },
    { id: 'e2', kind: 'objectFlow', sourceId: 'placeOut', targetId: 'pickIn' },
    { id: 'e3', kind: 'controlFlow', sourceId: 'place', targetId: 'dec' },
    { id: 'e4', kind: 'controlFlow', sourceId: 'dec', targetId: 'pick', guard: 'in stock' },
    { id: 'e5', kind: 'controlFlow', sourceId: 'dec', targetId: 'flowFin', guard: 'else' },
    { id: 'e6', kind: 'controlFlow', sourceId: 'pick', targetId: 'fork' },
    { id: 'e7', kind: 'controlFlow', sourceId: 'fork', targetId: 'pack' },
    { id: 'e8', kind: 'controlFlow', sourceId: 'fork', targetId: 'ship' },
    { id: 'e9', kind: 'controlFlow', sourceId: 'pack', targetId: 'join' },
    { id: 'e10', kind: 'controlFlow', sourceId: 'ship', targetId: 'join' },
    { id: 'e11', kind: 'controlFlow', sourceId: 'join', targetId: 'merge' },
    { id: 'e12', kind: 'objectFlow', sourceId: 'merge', targetId: 'obj' },
    { id: 'e13', kind: 'controlFlow', sourceId: 'obj', targetId: 'fin' },
    { id: 'ghost', kind: 'controlFlow', sourceId: 'pack', targetId: 'doesNotExist' },
  ];
  const partitions = [
    { id: 'laneC', name: 'Customer', nodeIds: ['init', 'place'] },
    { id: 'laneW', name: 'Warehouse', representsId: 'order', nodeIds: ['pick', 'fork', 'pack', 'ship', 'join'] },
  ];
  (repo.definitions as any).proc = { id: 'proc', kind: 'activity', name: 'Process Order', namespace: [], parameters: [], nodes, edges, partitions };
  return { repo, edgeCount: edges.length };
}

describe('renderActivityDiagrams', () => {
  const { repo, edgeCount } = activityRepo();
  const figures = renderActivityDiagrams(repo);
  const f = figures.find(x => x.includes('Process Order'))!;

  it('emits one figure per activity definition (an empty activity is a formal empty figure)', () => {
    expect(figures).toHaveLength(2);
    expect(figures.some(x => x.includes('Ship Parcel') && x.includes('report-figure-empty'))).toBe(true);
  });

  it('draws swimlanes with headers, including the one for nodes outside every partition', () => {
    expect(f).toContain('>Customer<');
    expect(f).toContain('>Warehouse<');
    expect(f).toContain('«represents» Order');
    expect(f).toContain('(no partition)');
  });

  it('uses the control-node notation and pins', () => {
    expect(f).toContain('data-kind="initial"');
    expect(f).toContain('data-kind="activityFinal"');
    expect(f).toContain('data-kind="flowFinal"');
    expect(f).toContain('data-kind="decision"');
    expect(f).toContain('data-kind="merge"');
    expect(f).toContain('data-kind="fork"');
    expect(f).toContain('data-kind="join"');
    expect(f).toContain('«call» Ship Parcel');
    expect(f).toContain(': Order');
    expect(f).toContain('>orderOut<');
    expect(f).toContain('>orderIn<');
  });

  it('draws control flow solid, object flow dashed, with guards', () => {
    const paths = [...f.matchAll(/<path id="edge-act0-([^"]+)" d="[^"]*" fill="none"[^>]*?(stroke-dasharray="5 4")?[^>]*marker-end="url\(#rf-arrow-open\)"/g)];
    const dashed = paths.filter(m => m[0].includes('stroke-dasharray')).map(m => m[1]);
    expect(dashed.sort()).toEqual(['e12', 'e2']);
    expect(f).toContain('[in stock]');
    expect(f).toContain('[else]');
  });

  it('accounts for all edges: drawn + omitted equals the edges in the activity', () => {
    const a = accounting(f);
    expect(a.drawn + a.omitted).toBe(edgeCount);
    expect(a).toEqual({ drawn: edgeCount - 1, omitted: 1 });
    expect(f).toContain('Pack → unknown node');
  });

  it('flows top to bottom and never overlaps nodes', () => {
    expectNoNodeOverlap(f);
    const byKind = (k: string) => nodeRects(f).find(r => r.kind === k)!;
    expect(byKind('initial').y).toBeLessThan(byKind('decision').y);
    expect(byKind('decision').y).toBeLessThan(byKind('fork').y);
    expect(byKind('fork').y).toBeLessThan(byKind('join').y);
    expect(byKind('join').y).toBeLessThan(byKind('activityFinal').y);
  });

  it('does not print ids', () => {
    expectNoRawIds(f, ['placeOut', 'pickIn', 'laneC', 'doesNotExist', 'flowFin']);
  });
});

// ---------------------------------------------------------------------------
function sequenceRepo(): SysmlRepository {
  const repo = createEmptyRepository();
  (repo.definitions as any).web = { id: 'web', kind: 'block', name: 'WebShop', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: ['login()'], constraints: [] };
  (repo.definitions as any).audit = { id: 'audit', kind: 'signal', name: 'AuditSignal', namespace: [] };
  (repo.definitions as any).shop = {
    id: 'shop', kind: 'block', name: 'Shop', namespace: [], isAbstract: false, isLeaf: false, ports: [], operations: [], constraints: [],
    properties: [{ id: 'pWeb', name: 'web', kind: 'part', typeId: 'web', multiplicity: mult }],
  };
  (repo.actors as any).cust = { id: 'cust', kind: 'actor', name: 'Customer', namespace: [], isExternal: true, generalizationIds: [] };
  const msg = (id: string, order: number, sort: string, from: string, to: string, name: string, extra: object = {}) => ({ id, order, sort, name, sourceLifelineId: from, targetLifelineId: to, ...extra });
  (repo.definitions as any).checkout = {
    id: 'checkout', kind: 'interaction', name: 'Checkout', namespace: [],
    lifelines: [
      { id: 'lCust', name: 'cust', representsId: 'cust' },
      { id: 'lWeb', name: 'web', representsId: 'pWeb' },
      { id: 'lDb', name: 'DB' },
    ],
    messages: [
      msg('m1', 1, 'synchCall', 'lCust', 'lWeb', 'login', { arguments: 'user' }),
      msg('m2', 2, 'reply', 'lWeb', 'lCust', 'token'),
      msg('m3', 3, 'createMessage', 'lWeb', 'lDb', ''),
      msg('m4', 4, 'asynchSignal', 'lWeb', 'lDb', '', { signatureId: 'audit' }),
      msg('m5', 5, 'asynchCall', 'lWeb', 'lWeb', 'refresh'),
      msg('m6', 6, 'deleteMessage', 'lWeb', 'lDb', ''),
      msg('m7', 7, 'asynchCall', 'lWeb', 'lMissing', 'orphaned'),
    ],
    fragments: [{ id: 'f1', operator: 'alt', coveredLifelineIds: ['lWeb', 'lDb'], operands: [{ guard: 'paid', messageIds: ['m3'] }, { guard: 'else', messageIds: ['m4'] }] }],
    uses: [{ id: 'u1', refersToId: 'pay', coveredLifelineIds: ['lCust', 'lWeb'], afterMessageId: 'm2' }],
    stateInvariants: [{ id: 'si1', lifelineId: 'lDb', stateId: 'noSuchState', afterMessageId: 'm4' }],
    constraints: [{ id: 'c1', kind: 'time', fromMessageId: 'm1', expression: 't < 5s' }, { id: 'c2', kind: 'duration', fromMessageId: 'm3', toMessageId: 'm4', expression: 'd < 2s' }],
  };
  (repo.definitions as any).pay = { id: 'pay', kind: 'interaction', name: 'Pay', namespace: [], lifelines: [{ id: 'pl', name: 'gateway' }], messages: [], fragments: [] };
  return repo;
}

describe('renderSequenceDiagrams', () => {
  const repo = sequenceRepo();
  const figures = renderSequenceDiagrams(repo);
  const f = figures.find(x => x.includes('Sequence diagram · Checkout'))!;

  it('emits one figure per interaction', () => {
    expect(figures).toHaveLength(2);
    expect(figures.some(x => x.includes('Sequence diagram · Pay'))).toBe(true);
  });

  it('draws lifeline heads with dashed lifelines, resolving names from the model', () => {
    expect((f.match(/stroke-dasharray="6 5"/g) ?? []).length).toBe(3);
    expect((f.match(/data-kind="lifeline"/g) ?? []).length).toBe(3);
    expect(f).toContain('«actor»');
    expect(f).toContain(': WebShop');
  });

  it('orders messages top to bottom with sort-specific arrowheads and labels', () => {
    const ys = [1, 2, 3, 4, 5, 6].map(n => Number(new RegExp(`id="edge-seq0-${n}" d="M [-\\d.]+ ([-\\d.]+)`).exec(f)![1]));
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(6);
    expect(f).toContain('1: login(user)');
    expect(f).toContain('2: token');
    expect(f).toContain('AuditSignal');
    const path = (n: number) => new RegExp(`<path id="edge-seq0-${n}"[^>]*>`).exec(f)![0];
    expect(path(1)).toContain('rf-arrow-filled');
    expect(path(1)).not.toContain('stroke-dasharray');
    expect(path(2)).toContain('stroke-dasharray="5 4"');
    expect(path(2)).toContain('rf-arrow-open');
    expect(path(3)).toContain('stroke-dasharray="5 4"');
    expect(path(4)).toContain('rf-arrow-open');
    expect(path(4)).not.toContain('stroke-dasharray');
    expect(path(6)).toContain('rf-arrow-filled');
  });

  it('draws combined fragments, ref frames, state invariants and time/duration constraints', () => {
    expect(f).toContain('>alt<');
    expect(f).toContain('[paid]');
    expect(f).toContain('[else]');
    expect(f).toContain('>ref<');
    expect(f).toContain('>Pay<');
    expect(f).toContain('{Unknown state}');
    expect(f).toContain('{t &lt; 5s}');
    expect(f).toContain('{d &lt; 2s}');
  });

  it('accounts for every message and names the one it cannot place', () => {
    expect(accounting(f)).toEqual({ drawn: 6, omitted: 1 });
    expect(f).toContain('orphaned (web → unknown lifeline');
    expectNoNodeOverlap(f);
    expectNoRawIds(f, ['lCust', 'lWeb', 'lMissing', 'pWeb', 'noSuchState']);
  });

  it('paginates long interactions and keeps accounting per page', () => {
    const big = createEmptyRepository();
    (big.definitions as any).long = {
      id: 'long', kind: 'interaction', name: 'Long', namespace: [],
      lifelines: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      messages: Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, order: i + 1, sort: 'asynchCall', name: `call${i}`, sourceLifelineId: 'a', targetLifelineId: 'b' })),
      fragments: [],
    };
    const pages = renderSequenceDiagrams(big);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('view 1 of 2');
    expect(accounting(pages[0])).toEqual({ drawn: 20, omitted: 0 });
    expect(accounting(pages[1])).toEqual({ drawn: 5, omitted: 0 });
  });
});

// ---------------------------------------------------------------------------
function parametricRepo(): SysmlRepository {
  const repo = createEmptyRepository();
  (repo.definitions as any).real = { id: 'real', kind: 'valueType', name: 'Real', namespace: [] };
  (repo.definitions as any).newton = {
    id: 'newton', kind: 'constraintBlock', name: 'NewtonSecondLaw', namespace: [],
    parameters: [{ id: 'cpF', name: 'F', typeId: 'real' }, { id: 'cpM', name: 'm', typeId: 'real' }, { id: 'cpA', name: 'a', typeId: 'real' }],
    constraints: ['F = m * a'],
  };
  const prop = (id: string, name: string, kind: string, typeId: string, extra: object = {}) => ({ id, name, kind, typeId, multiplicity: mult, ...extra });
  (repo.definitions as any).body = {
    id: 'body', kind: 'block', name: 'RigidBody', namespace: [], isAbstract: false, isLeaf: false, ports: [], operations: [], constraints: [],
    properties: [
      prop('pMass', 'mass', 'value', 'real', { unit: 'kg' }),
      prop('pAcc', 'acceleration', 'value', 'real', { defaultValue: '9.81' }),
      prop('pForce', 'force', 'value', 'real'),
      prop('pLaw', 'law', 'constraint', 'newton'),
      prop('pPart', 'chassis', 'part', 'body'),
    ],
  };
  (repo.definitions as any).plain = { id: 'plain', kind: 'block', name: 'Plain', namespace: [], isAbstract: false, isLeaf: false, ports: [], operations: [], constraints: [], properties: [prop('x', 'x', 'value', 'real')] };
  const bind = (id: string, a: object, b: object) => {
    (repo.connectors as any)[id] = { id, kind: 'binding', ownerId: 'body', sourcePortId: '', targetPortId: '', sourceEnd: a, targetEnd: b };
  };
  bind('b1', { propertyId: 'pForce' }, { propertyId: 'pLaw', parameterId: 'cpF' });
  bind('b2', { propertyId: 'pMass' }, { propertyId: 'pLaw', parameterId: 'cpM' });
  bind('b3', { propertyId: 'pAcc' }, { propertyId: 'pLaw', parameterId: 'cpA' });
  bind('b4', { propertyId: 'pMass' }, { propertyId: 'pNowhere' });
  bind('b5', { propertyId: 'pPart' }, { propertyId: 'pLaw', parameterId: 'cpF' });
  return repo;
}

describe('renderParametricDiagrams', () => {
  const figures = renderParametricDiagrams(parametricRepo());

  it('emits one figure per block that owns constraint properties or bindings', () => {
    expect(figures).toHaveLength(1);
    expect(figures[0]).toContain('Parametric diagram · RigidBody');
    expect(figures[0]).toContain('par [Block] RigidBody');
  });

  it('draws constraint properties with parameters and expression, value properties as rectangles', () => {
    const f = figures[0];
    expect(f).toContain('«constraint»');
    expect(f).toContain('law : NewtonSecondLaw');
    expect(f).toContain('{F = m * a}');
    for (const p of ['F', 'm', 'a']) expect(f).toContain(`>${p}<`);
    expect(f).toContain('mass : Real [kg]');
    expect(f).toContain('= 9.81');
    expect((f.match(/data-kind="valueProperty"/g) ?? []).length).toBe(3);
    expect((f.match(/data-kind="constraintProperty"/g) ?? []).length).toBe(1);
    expect(f).toContain('rx="14"');
  });

  it('draws binding connectors and accounts for the ones that cannot be drawn', () => {
    const f = figures[0];
    expect((f.match(/<path id="edge-par-/g) ?? []).length).toBe(3);
    expect(accounting(f)).toEqual({ drawn: 3, omitted: 2 });
    expect(f).toContain('mass = unknown property');
    expect(f).toContain('chassis = law.F');
    expectNoNodeOverlap(f);
    expectNoRawIds(f, ['pMass', 'pLaw', 'cpF', 'pNowhere', 'newton']);
  });
});
