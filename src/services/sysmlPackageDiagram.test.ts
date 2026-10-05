import { describe, expect, it } from 'vitest';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram, type SysmlGatewayState } from './sysmlCommandGateway';
import { buildDiagramCreationCommand } from './sysmlDiagramCreation';
import { createEmptyRepository, type BlockDefinition, type PackageDefinition } from '../engine/sysml/model';
import { validatePackageImport } from '../engine/sysml/capabilities/packagePolicy';
import { PACKAGE_HEADER_HEIGHT } from '../features/sysml/packageNestingLayout';

const pkg = (id: string, ownerId = 'model', extra: Partial<PackageDefinition> = {}): PackageDefinition => ({
  id, kind: 'package', name: id, namespace: [], ownerId, ...extra,
});
const block = (id: string, ownerId = 'model'): BlockDefinition => ({
  id, kind: 'block', name: id, namespace: [], ownerId,
  isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
});

function packageDiagramRepo() {
  const repository = createEmptyRepository();
  repository.packages.parent = pkg('parent');
  repository.packages.child = pkg('child', 'parent');
  repository.definitions.direct = block('direct', 'parent');
  repository.definitions.nested = block('nested', 'child');
  repository.diagrams.pd = { id: 'pd', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model' };
  repository.diagrams.bdd1 = { id: 'bdd1', kind: 'diagram', diagramKind: 'bdd', name: 'Structure', namespace: [], ownerId: 'parent' };
  return repository;
}

const merge = (state: SysmlGatewayState, result: SysmlGatewayState): SysmlGatewayState => ({ ...state, ...result });

describe('Package Diagram: Show Contents nesting', () => {
  it('places shown members inside the presented Package symbol and grows it, in one undoable step', () => {
    let state = createSysmlGatewayState(packageDiagramRepo());
    state = merge(state, executeSysmlCommand(state, {
      type: 'addToDiagram', diagramId: 'pd', elementIds: ['parent'], coordinates: { parent: { x: 100, y: 100, width: 220, height: 140 } },
    }));
    const shown = executeSysmlCommand(state, { type: 'showPackageContents', diagramId: 'pd', packageId: 'parent', mode: 'recursive' });
    expect(shown.committed).toBe(true);
    const presentations = shown.diagramPresentations.pd.presentations;
    const parent = presentations.parent.bounds as Required<typeof presentations.parent.bounds>;
    const inside = (id: string) => {
      const b = presentations[id].bounds as Required<typeof parent>;
      return b.x >= parent.x && b.y >= parent.y + PACKAGE_HEADER_HEIGHT
        && b.x + b.width <= parent.x + parent.width && b.y + b.height <= parent.y + parent.height;
    };
    expect(inside('child')).toBe(true);
    expect(inside('direct')).toBe(true);
    // Recursive: 'nested' sits inside 'child'.
    const child = presentations.child.bounds as Required<typeof parent>;
    const nested = presentations.nested.bounds as Required<typeof parent>;
    expect(nested.x).toBeGreaterThanOrEqual(child.x);
    expect(nested.y + nested.height).toBeLessThanOrEqual(child.y + child.height);
    expect(parent.width).toBeGreaterThan(220);
    // Presentation only: ownership untouched.
    expect(shown.repository.definitions.nested.ownerId).toBe('child');

    const undone = executeSysmlCommand(shown, { type: 'undo' });
    expect(undone.diagramPresentations.pd.elementIds).toEqual(['parent']);
    expect(undone.diagramPresentations.pd.presentations.parent.bounds.width).toBe(220);
  });

  it('keeps the free grid when the Package itself is not on the diagram', () => {
    const state = createSysmlGatewayState(packageDiagramRepo());
    const shown = executeSysmlCommand(state, { type: 'showPackageContents', diagramId: 'pd', packageId: 'parent', mode: 'direct' });
    expect(shown.committed).toBe(true);
    expect(shown.diagramPresentations.pd.presentations.child.bounds).toMatchObject({ x: 80, y: 80 });
  });
});

describe('Package Diagram: paths and shortcuts', () => {
  it('re-displays any hidden relationship whose ends are shown, including non-package kinds', () => {
    const repository = packageDiagramRepo();
    repository.requirements.req = {
      id: 'req', kind: 'requirement', name: 'Req', namespace: [], ownerId: 'model', requirementId: 'R1', text: 't', status: 'draft', version: '1',
    };
    repository.relationships.sat = { id: 'sat', kind: 'satisfy', sourceId: 'direct', targetId: 'req' };
    let state = createSysmlGatewayState(repository);
    state = merge(state, executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'pd', elementIds: ['direct', 'req'] }));
    state = merge(state, executeSysmlCommand(state, { type: 'removeFromDiagram', diagramId: 'pd', elementIds: ['sat'] }));
    expect(state.diagramPresentations!.pd.hiddenElementIds).toEqual(['sat']);
    expect(projectLegacyDiagram(state.repository, {}, state.diagramPresentations!, 'pd').relationships.map(r => r.id)).not.toContain('sat');

    const displayed = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'pd', elementIds: ['sat'] });
    expect(displayed.committed).toBe(true);
    expect(displayed.diagramPresentations.pd.hiddenElementIds).toBeUndefined();
  });

  it('presents another diagram as a shortcut symbol, never the diagram itself', () => {
    const state = createSysmlGatewayState(packageDiagramRepo());
    expect(executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'pd', elementIds: ['bdd1'] }).committed).toBe(true);
    const self = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'pd', elementIds: ['pd'] });
    expect(self.committed).toBe(false);
    expect(self.diagnostics[0]?.code).toBe('INVALID_DIAGRAM_ELEMENT');
  });

  it('labels element imports with the UML «import» keyword', () => {
    const repository = packageDiagramRepo();
    repository.relationships.ei = {
      id: 'ei', kind: 'elementImport', sourceId: 'child', targetId: 'direct', importingNamespaceId: 'child', importedElementId: 'direct', visibility: 'public', alias: 'D',
    };
    const view = projectLegacyDiagram(repository);
    expect(view.relationships.find(r => r.id === 'ei')?.label).toBe('«import» D');
  });
});

describe('Package Diagram: ownership', () => {
  it('moves a verification case into a Package (previously a silent no-op commit)', () => {
    const repository = packageDiagramRepo();
    repository.verificationCases.vc = { id: 'vc', kind: 'verificationCase', name: 'VC', namespace: [], ownerId: 'model', method: 'test', verifiesRequirementIds: [] };
    const moved = executeSysmlCommand(createSysmlGatewayState(repository), { type: 'moveElements', elementIds: ['vc'], targetOwnerId: 'parent' });
    expect(moved.committed).toBe(true);
    expect(moved.repository.verificationCases.vc.ownerId).toBe('parent');
    expect(executeSysmlCommand(moved, { type: 'undo' }).repository.verificationCases.vc.ownerId).toBe('model');
  });

  it('owns an element created inside a Package symbol by that Package', () => {
    const repository = packageDiagramRepo();
    const outcome = buildDiagramCreationCommand({
      repository, kind: 'Block', ownerId: 'model', diagramId: 'pd', nestedOwnerId: 'child', position: { x: 0, y: 0 },
    });
    expect(outcome.ok && (outcome.command.element as BlockDefinition).ownerId).toBe('child');
    const missing = buildDiagramCreationCommand({
      repository, kind: 'Block', ownerId: 'model', diagramId: 'pd', nestedOwnerId: 'gone', position: { x: 0, y: 0 },
    });
    expect(missing).toMatchObject({ ok: false, diagnostic: { code: 'OWNER_NOT_FOUND' } });
  });

  it('creates a «modelLibrary» Package and projects its keyword', () => {
    const repository = packageDiagramRepo();
    const outcome = buildDiagramCreationCommand({ repository, kind: 'ModelLibrary', ownerId: 'model', diagramId: 'pd', position: { x: 0, y: 0 } });
    if (!outcome.ok) throw new Error(outcome.diagnostic.message);
    const created = executeSysmlCommand(createSysmlGatewayState(repository), outcome.command);
    expect(created.committed).toBe(true);
    expect(created.repository.packages[outcome.semanticId].stereotype).toBe('modelLibrary');
    expect(projectLegacyDiagram(created.repository, {}, created.diagramPresentations, 'pd').packages
      .find(p => p.id === outcome.semanticId)?.stereotype).toBe('modelLibrary');
  });

  it('rejects a Use Case on a Package Diagram instead of creating an invisible element', () => {
    const outcome = buildDiagramCreationCommand({
      repository: packageDiagramRepo(), kind: 'UseCase', ownerId: 'model', diagramId: 'pd', position: { x: 0, y: 0 },
    });
    expect(outcome).toMatchObject({ ok: false, diagnostic: { code: 'INVALID_DIAGRAM_ELEMENT' } });
  });
});

describe('Package import visibility conflict', () => {
  it('explains that an «access» conflicts with an existing «import»', () => {
    const repository = packageDiagramRepo();
    repository.packages.other = pkg('other');
    repository.relationships.pi = {
      id: 'pi', kind: 'packageImport', sourceId: 'parent', targetId: 'other', importingNamespaceId: 'parent', importedPackageId: 'other', visibility: 'public',
    };
    const decision = validatePackageImport(repository, 'parent', 'other', 'private');
    expect(decision.code).toBe('DUPLICATE_IMPORT');
    expect(decision.message).toContain('«access»');
    expect(validatePackageImport(repository, 'parent', 'other', 'public').message).toBe('Package import already exists.');
  });
});
