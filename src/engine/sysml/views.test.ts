import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository, isDefinitionKind,
  type StakeholderDefinition, type SysmlRepository, type SysmlRelationship, type ViewDefinition, type ViewpointDefinition,
} from './model';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram, computeImpactHash } from '../../services/sysmlCommandGateway';
import { loadRepository, serializeRepository } from './persistence';
import { validateSysmlRepository } from './validation';
import { classifyRelationship } from './policy';
import { evaluateSysmlConnection, familyOfMetaclass, type SysmlEndpointFamily } from './connectionPolicy';
import { migrateV3ToV4, V4_RELATIONSHIP_METACLASS } from './persistence/migrateV3ToV4';
import { exposedElementIds, stakeholdersOf, viewpointConcernTexts, viewpointOf, viewsConformingTo } from './views';
import { getInspectorSchema } from '../../features/sysml/inspectorSchema';
import {
  buildPackageRelationship, packageRelationshipKeyword, packageToolEndpointError, packageToolEndpointKinds,
} from '../../features/sysml/packageRelationshipNotation';
import { edgeBadgeLabel } from '../../features/sysml/edgeNotation';
import { blockCompartmentLines, computeBlockDisplayBounds, viewpointCompartmentLines } from '../../components/sysml/blockLayout';
import { createView, createViewpoint, createStakeholder } from '../../features/modelExplorer/adapters/modelExplorerFactories';
import { createSysmlExplorerAdapter } from '../../features/modelExplorer/adapters/sysmlExplorerAdapter';

const view = (id: string, name = id): ViewDefinition => ({ id, kind: 'view', name, namespace: [], ownerId: 'model' });
const viewpoint = (id: string, extra: Partial<ViewpointDefinition> = {}): ViewpointDefinition => ({
  id, kind: 'viewpoint', name: id, namespace: [], ownerId: 'model',
  stakeholderIds: [], concernIds: [], purpose: '', languages: [], presentation: [], ...extra,
});
const stakeholder = (id: string, concerns: string[] = []): StakeholderDefinition =>
  ({ id, kind: 'stakeholder', name: id, namespace: [], ownerId: 'model', concerns });
const rel = (id: string, kind: 'conform' | 'expose', sourceId: string, targetId: string): SysmlRelationship => ({ id, kind, sourceId, targetId });

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.requirements.r1 = {
    id: 'r1', kind: 'requirement', name: 'Range', namespace: [], ownerId: 'model', requirementId: 'REQ-1',
    text: 'The vehicle shall reach 500 km.', status: 'draft', version: '1.0',
  };
  repo.definitions.sk = stakeholder('sk', ['Safety', 'Cost']);
  repo.definitions.vp = viewpoint('vp', {
    stakeholderIds: ['sk'], concernIds: ['r1'], concerns: ['Maintainability'], purpose: 'Show the logical structure',
    languages: ['SysML'], presentation: ['Diagram'], methodText: 'Select blocks',
  });
  repo.definitions.v1 = view('v1', 'Logical View');
  repo.definitions.car = {
    id: 'car', kind: 'block', name: 'Car', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations: [], constraints: [],
  };
  repo.relationships.c1 = rel('c1', 'conform', 'v1', 'vp');
  repo.relationships.e1 = rel('e1', 'expose', 'v1', 'car');
  return repo;
}
const codes = (repo: SysmlRepository) => validateSysmlRepository(repo).diagnostics.map(d => d.code);
const errors = (repo: SysmlRepository) => validateSysmlRepository(repo).diagnostics.filter(d => d.severity === 'error');

describe('View, Viewpoint and Stakeholder are stored definitions', () => {
  it('knows the three kinds as definition kinds', () => {
    for (const kind of ['view', 'viewpoint', 'stakeholder']) expect(isDefinitionKind(kind)).toBe(true);
  });

  it('accepts a well-formed model', () => {
    expect(errors(model())).toEqual([]);
  });

  it('creates each through the gateway as a definition, with one undo step', () => {
    for (const element of [view('x'), viewpoint('x'), stakeholder('x')]) {
      const created = executeSysmlCommand(createSysmlGatewayState(createEmptyRepository()), { type: 'createElement', element: element as never });
      expect(created.committed).toBe(true);
      expect(created.repository.definitions.x.kind).toBe(element.kind);
      expect(executeSysmlCommand(created, { type: 'undo' }).repository.definitions.x).toBeUndefined();
    }
  });

  it('round-trips every field and relationship through save and load unchanged', () => {
    const loaded = loadRepository(serializeRepository(model()));
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions.vp).toEqual(model().definitions.vp);
    expect(loaded.repository.definitions.sk).toEqual(model().definitions.sk);
    expect(loaded.repository.definitions.v1).toEqual(model().definitions.v1);
    expect(loaded.repository.relationships.c1).toMatchObject({ kind: 'conform', sourceId: 'v1', targetId: 'vp' });
    expect(loaded.repository.relationships.e1).toMatchObject({ kind: 'expose', sourceId: 'v1', targetId: 'car' });
    expect(viewpointOf(loaded.repository, 'v1')?.id).toBe('vp');
  });

  it('appears in the V4 view with its own metaclasses and records the V3 relationship kind', () => {
    const v4 = migrateV3ToV4(model());
    expect(v4.elements.v1.metaclass).toBe('View');
    expect(v4.elements.vp).toMatchObject({ metaclass: 'Viewpoint', purpose: 'Show the logical structure', stakeholderIds: ['sk'] });
    expect(v4.elements.sk).toMatchObject({ metaclass: 'Stakeholder', concerns: ['Safety', 'Cost'] });
    expect(V4_RELATIONSHIP_METACLASS.conform).toBe('Generalization');
    expect(V4_RELATIONSHIP_METACLASS.expose).toBe('Dependency');
    expect(v4.relationships.c1).toMatchObject({ metaclass: 'Generalization', customProperties: { sourceKind: 'conform' } });
    expect(v4.relationships.e1).toMatchObject({ metaclass: 'Dependency', customProperties: { sourceKind: 'expose' } });
  });
});

describe('view queries (single source of truth: «conform»)', () => {
  it('derives the viewpoint of a view from its conform relationship', () => {
    expect(viewpointOf(model(), 'v1')?.id).toBe('vp');
    const repo = model();
    delete repo.relationships.c1;
    expect(viewpointOf(repo, 'v1')).toBeUndefined();
    expect(viewpointOf(model(), 'car')).toBeUndefined();
    expect(viewpointOf(model(), 'missing')).toBeUndefined();
  });

  it('lists conforming views, exposed elements, stakeholders and concern texts', () => {
    const repo = model();
    expect(viewsConformingTo(repo, 'vp').map(v => v.id)).toEqual(['v1']);
    expect(exposedElementIds(repo, 'v1')).toEqual(['car']);
    expect(stakeholdersOf(repo, 'vp').map(s => s.id)).toEqual(['sk']);
    expect(viewpointConcernTexts(repo, 'vp')).toEqual(['Maintainability', 'Range', 'Safety', 'Cost']);
  });
});

describe('connection policy for «conform» and «expose»', () => {
  const decide = (kind: string, source: SysmlEndpointFamily, target: SysmlEndpointFamily, diagram: 'package' | 'bdd' | 'ibd' = 'package') =>
    evaluateSysmlConnection({
      relationshipKind: kind, diagram,
      source: { id: 's', name: 's', family: source }, target: { id: 't', name: 't', family: target },
    });

  it('allows conform only from a View to a Viewpoint', () => {
    expect(decide('conform', 'view', 'viewpoint').allowed).toBe(true);
    for (const [s, t] of [['viewpoint', 'view'], ['view', 'view'], ['block', 'viewpoint'], ['view', 'block'], ['stakeholder', 'viewpoint']] as const) {
      const result = decide('conform', s, t);
      expect(result.allowed).toBe(false);
      expect(result.diagnostics[0].code).toBe('INVALID_CONFORM_ENDPOINTS');
    }
  });

  it('allows expose from a View to any resolved element, but not from anything else', () => {
    for (const target of ['block', 'package', 'requirement', 'viewpoint', 'port'] as const) expect(decide('expose', 'view', target).allowed).toBe(true);
    expect(decide('expose', 'block', 'block').diagnostics[0].code).toBe('INVALID_EXPOSE_SOURCE');
    expect(decide('expose', 'view', 'unknown').allowed).toBe(false);
  });

  it('draws them on package diagrams and BDDs only', () => {
    expect(decide('conform', 'view', 'viewpoint', 'bdd').allowed).toBe(true);
    expect(decide('conform', 'view', 'viewpoint', 'ibd').diagnostics[0].code).toBe('INVALID_RELATIONSHIP_DIAGRAM');
  });

  it('maps metaclasses to the new endpoint families', () => {
    expect(familyOfMetaclass('View')).toBe('view');
    expect(familyOfMetaclass('Viewpoint')).toBe('viewpoint');
    expect(familyOfMetaclass('Stakeholder')).toBe('stakeholder');
  });

  it('classifies stored relationships through the same policy', () => {
    const repo = model();
    expect(classifyRelationship(repo, 'c1').allowed).toBe(true);
    expect(classifyRelationship(repo, 'e1').allowed).toBe(true);
    repo.relationships.bad = rel('bad', 'conform', 'car', 'vp');
    expect(classifyRelationship(repo, 'bad').diagnostics.join(' ')).toContain('INVALID_CONFORM_ENDPOINTS');
    repo.relationships.bad2 = rel('bad2', 'expose', 'car', 'v1');
    expect(classifyRelationship(repo, 'bad2').diagnostics.join(' ')).toContain('INVALID_EXPOSE_SOURCE');
  });
});

describe('repository rules', () => {
  it('rejects a View that conforms to more than one Viewpoint (MULTIPLE_VIEWPOINTS)', () => {
    const repo = model();
    repo.definitions.vp2 = viewpoint('vp2');
    repo.relationships.c2 = rel('c2', 'conform', 'v1', 'vp2');
    expect(codes(repo)).toContain('MULTIPLE_VIEWPOINTS');
    expect(codes(model())).not.toContain('MULTIPLE_VIEWPOINTS');
  });

  it('rejects a conform whose endpoints are not View to Viewpoint, and an expose from a non-View', () => {
    const repo = model();
    repo.relationships.c2 = rel('c2', 'conform', 'car', 'vp');
    repo.relationships.e2 = rel('e2', 'expose', 'car', 'v1');
    const found = codes(repo);
    expect(found).toContain('INVALID_CONFORM_ENDPOINTS');
    expect(found).toContain('INVALID_EXPOSE_SOURCE');
  });

  it('rejects a Viewpoint whose stakeholder or concern does not resolve', () => {
    const repo = model();
    repo.definitions.vp = viewpoint('vp', { stakeholderIds: ['car', 'ghost'], concernIds: ['ghost'] });
    const found = codes(repo);
    expect(found.filter(code => code === 'MISSING_STAKEHOLDER')).toHaveLength(2);
    expect(found).toContain('MISSING_CONCERN');
  });
});

describe('gateway: relationships on a Package Diagram', () => {
  const withDiagram = () => {
    const repo = model();
    delete repo.relationships.c1;
    delete repo.relationships.e1;
    repo.diagrams.pd = { id: 'pd', kind: 'diagram', name: 'Views', namespace: [], ownerId: 'model', diagramKind: 'package' };
    let state = createSysmlGatewayState(repo);
    const added = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'pd', elementIds: ['v1', 'vp', 'sk', 'car'] });
    expect(added.committed).toBe(true);
    state = { ...state, ...added };
    return state;
  };
  const draw = (state: ReturnType<typeof withDiagram>, tool: 'conform' | 'expose', id: string, source: string, target: string) =>
    executeSysmlCommand(state, { type: 'createAndPresent', diagramId: 'pd', element: buildPackageRelationship(id, tool, source, target), presentation: {} });

  it('creates «conform» and «expose» as one undo step each and projects them with their keyword', () => {
    let state = withDiagram();
    const conform = draw(state, 'conform', 'c1', 'v1', 'vp');
    expect(conform.committed).toBe(true);
    state = { ...state, ...conform };
    const expose = draw(state, 'expose', 'e1', 'v1', 'car');
    expect(expose.committed).toBe(true);
    state = { ...state, ...expose };
    expect(viewpointOf(state.repository, 'v1')?.id).toBe('vp');
    const projected = projectLegacyDiagram(state.repository, state.coordinates, state.diagramPresentations, 'pd');
    expect(projected.relationships.find(r => r.id === 'c1')).toMatchObject({ type: 'conform', label: '«conform»' });
    expect(projected.relationships.find(r => r.id === 'e1')).toMatchObject({ type: 'expose', label: '«expose»' });
    const undone = executeSysmlCommand(state, { type: 'undo' });
    expect(undone.repository.relationships.e1).toBeUndefined();
    expect(undone.repository.relationships.c1).toBeDefined();
  });

  it('refuses a second «conform» from the same View', () => {
    let state = withDiagram();
    state = { ...state, ...draw(state, 'conform', 'c1', 'v1', 'vp') };
    const extra = createViewpoint({ ownerId: 'model', id: 'vp2', name: 'Other' });
    state = { ...state, ...executeSysmlCommand(state, { type: 'createElement', element: extra }) };
    state = { ...state, ...executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'pd', elementIds: ['vp2'] }) };
    const second = draw(state, 'conform', 'c2', 'v1', 'vp2');
    expect(second.committed).toBe(false);
    expect(second.diagnostics.map(d => d.code)).toContain('MULTIPLE_VIEWPOINTS');
    expect(second.repository.relationships.c2).toBeUndefined();
  });

  it('refuses a «conform» between the wrong kinds of element', () => {
    const state = withDiagram();
    const bad = draw(state, 'conform', 'c1', 'car', 'vp');
    expect(bad.committed).toBe(false);
    expect(bad.diagnostics.map(d => d.code)).toContain('INVALID_CONFORM_ENDPOINTS');
  });

  it('projects views, viewpoints and stakeholders as keyworded boxes with a viewpoint compartment', () => {
    const state = withDiagram();
    const projected = projectLegacyDiagram(state.repository, state.coordinates, state.diagramPresentations, 'pd');
    const byId = (id: string) => projected.blocks.find(block => block.id === id)!;
    expect(byId('v1')).toMatchObject({ stereotype: 'view', name: 'Logical View' });
    expect(byId('sk').stereotype).toBe('stakeholder');
    expect(byId('vp')).toMatchObject({
      stereotype: 'viewpoint', viewpointPurpose: 'Show the logical structure',
      viewpointStakeholders: ['sk'], viewpointConcerns: ['Maintainability', 'Range', 'Safety', 'Cost'],
    });
    const lines = blockCompartmentLines(byId('vp'));
    expect(lines).toEqual(expect.arrayContaining(['«purpose»', 'Show the logical structure', '«stakeholders»', 'sk', '«concerns»', 'Range']));
    expect(blockCompartmentLines(byId('v1'))).toEqual([]);
    expect(computeBlockDisplayBounds(byId('vp')).height).toBeGreaterThan(computeBlockDisplayBounds({ ...byId('vp'), viewpointPurpose: undefined, viewpointStakeholders: [], viewpointConcerns: [] }).height);
  });

  it('shows a Viewpoint compartment only for viewpoints and clips long text', () => {
    expect(viewpointCompartmentLines({ stereotype: 'view', viewpointPurpose: 'x' })).toEqual([]);
    const lines = viewpointCompartmentLines({ stereotype: 'viewpoint', viewpointPurpose: 'p'.repeat(200) });
    expect(lines[1].length).toBeLessThanOrEqual(44);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it.each([
    ['sk', 'stakeholderIds'],
    ['r1', 'concernIds'],
  ] as const)('deleting %s removes it from the Viewpoint instead of leaving a dangling reference, and undoes', (deletedId, key) => {
    const state = withDiagram();
    const command = { type: 'deleteElements' as const, elementIds: [deletedId] };
    const preview = executeSysmlCommand(state, command);
    const confirmed = preview.committed
      ? preview
      : executeSysmlCommand(state, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as typeof command);
    expect(confirmed.committed).toBe(true);
    expect((confirmed.repository.definitions.vp as ViewpointDefinition)[key]).toEqual([]);
    expect(errors(confirmed.repository)).toEqual([]);
    const undone = executeSysmlCommand({ ...state, ...confirmed }, { type: 'undo' });
    expect(undone.repository.definitions.sk ?? undone.repository.requirements.r1).toBeDefined();
    expect((undone.repository.definitions.vp as ViewpointDefinition)[key]).toEqual([deletedId]);
  });
});

describe('package diagram tools', () => {
  it('knows keyword, edge label and endpoint rules for the new tools', () => {
    expect(packageRelationshipKeyword({ kind: 'conform' })).toBe('«conform»');
    expect(packageRelationshipKeyword({ kind: 'expose' })).toBe('«expose»');
    expect(edgeBadgeLabel({ type: 'conform' })).toBe('«conform»');
    expect(edgeBadgeLabel({ type: 'expose' })).toBe('«expose»');
    const kinds = packageToolEndpointKinds(model());
    expect(packageToolEndpointError('conform', 'source', 'v1', kinds)).toBeUndefined();
    expect(packageToolEndpointError('conform', 'target', 'vp', kinds)).toBeUndefined();
    expect(packageToolEndpointError('conform', 'source', 'car', kinds)).toMatch(/must be a View/);
    expect(packageToolEndpointError('conform', 'target', 'v1', kinds)).toMatch(/must be a Viewpoint/);
    expect(packageToolEndpointError('expose', 'source', 'v1', kinds)).toBeUndefined();
    expect(packageToolEndpointError('expose', 'target', 'car', kinds)).toBeUndefined();
    expect(packageToolEndpointError('expose', 'source', 'car', kinds)).toMatch(/must be a View/);
  });

  it('builds plain relationships for both tools', () => {
    expect(buildPackageRelationship('r', 'conform', 'a', 'b')).toEqual({ id: 'r', kind: 'conform', sourceId: 'a', targetId: 'b' });
    expect(buildPackageRelationship('r', 'expose', 'a', 'b').kind).toBe('expose');
  });
});

describe('explorer creation', () => {
  it('has factories that produce valid, empty elements', () => {
    expect(createView({ ownerId: 'model', existingNames: ['View'] }).name).not.toBe('View');
    expect(createViewpoint({ ownerId: 'model' })).toMatchObject({ kind: 'viewpoint', stakeholderIds: [], concernIds: [], purpose: '' });
    expect(createStakeholder({ ownerId: 'model' })).toMatchObject({ kind: 'stakeholder', concerns: [] });
  });

  it('creates View, Viewpoint and Stakeholder through the explorer adapter under a package', () => {
    for (const [elementKind, kind] of [['view', 'view'], ['viewpoint', 'viewpoint'], ['stakeholder', 'stakeholder']] as const) {
      let state = createSysmlGatewayState(createEmptyRepository());
      const adapter = createSysmlExplorerAdapter({
        getState: () => state,
        executeCommand: command => {
          const result = executeSysmlCommand(state, command);
          if (result.committed) state = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
          return result;
        },
      });
      const result = adapter.execute({ type: 'createElement', elementKind, ownerId: 'model', name: 'Thing' } as never);
      expect(result.committed).toBe(true);
      expect(Object.values(state.repository.definitions).map(d => d.kind)).toEqual([kind]);
    }
  });
});

describe('inspector', () => {
  const schema = (id: string, repo = model()) => getInspectorSchema({ repository: migrateV3ToV4(repo), elementId: id })!;

  it('gives a Viewpoint purpose, stakeholder and concern pickers, text lists and a method', () => {
    const fields = schema('vp').fields;
    const keys = fields.map(f => f.key);
    expect(keys).toEqual(expect.arrayContaining(['purpose', 'stakeholderIds', 'concernIds', 'concerns', 'languages', 'presentation', 'methodText']));
    const stakeholders = fields.find(f => f.key === 'stakeholderIds')!;
    expect(stakeholders.valueType).toBe('multiSelect');
    expect(stakeholders.options!.map(o => o.value)).toEqual(['sk']);
    expect(stakeholders.value).toEqual(['sk']);
    expect(stakeholders.toCommand!(['sk', 'x'])).toMatchObject({ type: 'UpdateElement', elementId: 'vp', patch: { stakeholderIds: ['sk', 'x'] } });
    expect(fields.find(f => f.key === 'concernIds')!.options!.map(o => o.value)).toEqual(['r1']);
    expect(fields.find(f => f.key === 'purpose')!.toCommand!('Why')).toMatchObject({ patch: { purpose: 'Why' } });
    const languages = fields.find(f => f.key === 'languages')!;
    expect(languages.valueType).toBe('stringList');
    expect(languages.toCommand!([' SysML ', '', 'UML'])).toMatchObject({ patch: { languages: ['SysML', 'UML'] } });
    expect(languages.toCommand!('A\n\n B ')).toMatchObject({ patch: { languages: ['A', 'B'] } });
  });

  it('gives a Stakeholder an editable concerns list', () => {
    const concerns = schema('sk').fields.find(f => f.key === 'concerns')!;
    expect(concerns.value).toEqual(['Safety', 'Cost']);
    expect(concerns.toCommand!(['Safety'])).toMatchObject({ elementId: 'sk', patch: { concerns: ['Safety'] } });
  });

  it('shows a View its derived Viewpoint and exposed elements read-only', () => {
    const fields = schema('v1').fields;
    const viewpointField = fields.find(f => f.key === 'viewpoint')!;
    expect(viewpointField.mode).toBe('readOnly');
    expect(viewpointField.value).toBe('vp');
    expect(fields.find(f => f.key === 'exposes')!.value).toEqual(['car']);
  });

  it('applies an inspector command through the gateway and rejects a dangling stakeholder', () => {
    const state = createSysmlGatewayState(model());
    const ok = executeSysmlCommand(state, { type: 'updateElement', elementId: 'vp', patch: { purpose: 'New purpose', languages: ['SysML', 'UML'] } });
    expect(ok.committed).toBe(true);
    expect((ok.repository.definitions.vp as ViewpointDefinition).languages).toEqual(['SysML', 'UML']);
    const bad = executeSysmlCommand(state, { type: 'updateElement', elementId: 'vp', patch: { stakeholderIds: ['ghost'] } });
    expect(bad.committed).toBe(false);
    expect(bad.diagnostics.map(d => d.code)).toContain('MISSING_STAKEHOLDER');
  });
});
