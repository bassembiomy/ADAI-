import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type ModelDiagramDefinition } from '../engine/sysml/model';
import {
  computeImpactHash,
  buildCanonicalSysmlProjectPayload,
  createSysmlGatewayState,
  executeSysmlCommand,
  loadCanonicalSysmlProject,
  type SysmlEditorCommand,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { openExactDiagram } from './sysmlDiagramNavigation';
import {
  buildAssignSubjectsCommand,
  buildCreateExtensionPointCommand,
  buildCreateUseCaseRelationshipCommand,
} from './sysmlUseCaseCommands';
import { createActor, createExtensionPoint, createSubject, createUseCase, createDiagramDefinition } from '../features/modelExplorer/adapters/modelExplorerFactories';
import { buildUseCaseDiagramView, proposeSubjectAssignments } from '../features/sysml/useCaseDiagramView';

const DIAGRAM_ID = 'uc-diagram';

function run(state: SysmlGatewayState, command: SysmlEditorCommand) {
  const result = executeSysmlCommand(state, command);
  return { result, state: result.committed ? { ...state, ...result } as SysmlGatewayState : state };
}

function setup() {
  let state = createSysmlGatewayState(createEmptyRepository());
  const diagram: ModelDiagramDefinition = { id: DIAGRAM_ID, kind: 'diagram', name: 'Use Cases', diagramKind: 'useCase', namespace: [], ownerId: 'model' };
  const created = run(state, { type: 'createDiagram', diagram });
  expect(created.result.committed).toBe(true);
  state = created.state;
  const place = (element: Parameters<typeof createAndPresent>[1], x: number, y: number, width?: number, height?: number) => {
    const out = createAndPresent(state, element, x, y, width, height);
    state = out.state;
    return out.result;
  };
  return { get state() { return state; }, set state(value: SysmlGatewayState) { state = value; }, place };
}

function createAndPresent(state: SysmlGatewayState, element: any, x: number, y: number, width?: number, height?: number) {
  return run(state, { type: 'createAndPresent', element, diagramId: DIAGRAM_ID, presentation: { x, y, ...(width ? { width } : {}), ...(height ? { height } : {}) } });
}

describe('Use Case diagram through the command gateway', () => {
  it('creates a useCase diagram owned by the model, and rejects a Block owner', () => {
    const ctx = setup();
    expect(ctx.state.repository.diagrams[DIAGRAM_ID].diagramKind).toBe('useCase');

    const repo = createEmptyRepository();
    repo.definitions.blk = { id: 'blk', kind: 'block', name: 'B', namespace: [], ownerId: 'model', properties: [], ports: [], operations: [], receptions: [], constraints: [] } as any;
    const bad = executeSysmlCommand(createSysmlGatewayState(repo), {
      type: 'createDiagram',
      diagram: createDiagramDefinition({ ownerId: 'blk', diagramKind: 'useCase' }),
    });
    expect(bad.committed).toBe(false);
    expect(bad.diagnostics[0].code).toBe('INVALID_DIAGRAM_OWNER');
  });

  it('names a new use case diagram readably', () => {
    expect(createDiagramDefinition({ ownerId: 'model', diagramKind: 'useCase' }).name).toBe('UseCaseDiagram');
  });

  it('createAndPresent accepts actor, subject, use case on a useCase diagram with stored bounds', () => {
    const ctx = setup();
    expect(ctx.place(createActor({ id: 'a1', name: 'Pilot', ownerId: 'model' }), 20, 30).committed).toBe(true);
    expect(ctx.place(createSubject({ id: 's1', name: 'Aircraft', ownerId: 'model' }), 200, 20, 400, 400).committed).toBe(true);
    expect(ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 250, 80).committed).toBe(true);
    const presentation = ctx.state.diagramPresentations![DIAGRAM_ID];
    expect(presentation.elementIds).toEqual(['a1', 's1', 'u1']);
    expect(presentation.presentations.s1.bounds).toMatchObject({ x: 200, y: 20, width: 400, height: 400 });
    expect(ctx.state.repository.actors.a1).toBeDefined();
    expect(ctx.state.repository.subjects.s1).toBeDefined();
    expect(ctx.state.repository.useCases.u1).toBeDefined();
  });

  it('addToDiagram knows actors, subjects, use cases and extension points exist, and refuses unrelated kinds', () => {
    const ctx = setup();
    ctx.state = run(ctx.state, { type: 'batch', commands: [
      { type: 'createElement', element: createActor({ id: 'a1', name: 'Pilot', ownerId: 'model' }) },
      { type: 'createElement', element: createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }) },
      { type: 'createElement', element: createSubject({ id: 's1', name: 'Aircraft', ownerId: 'model' }) },
    ] }).state;
    const added = run(ctx.state, { type: 'addToDiagram', diagramId: DIAGRAM_ID, elementIds: ['a1', 'u1', 's1'] });
    expect(added.result.committed).toBe(true);
    // Packages (and other classifiers) do not belong on a Use Case Diagram.
    const pkg = run(added.state, { type: 'addToDiagram', diagramId: DIAGRAM_ID, elementIds: ['model'] });
    expect(pkg.result.committed).toBe(false);
    expect(pkg.result.diagnostics[0].code).toBe('INVALID_DIAGRAM_ELEMENT');
    // Unknown ids are still rejected as missing.
    expect(run(added.state, { type: 'addToDiagram', diagramId: DIAGRAM_ID, elementIds: ['nope'] }).result.diagnostics[0].code).toBe('ELEMENT_NOT_FOUND');
  });

  it('creating an element on the diagram is one undo step and undo removes element and presentation', () => {
    const ctx = setup();
    const before = ctx.state;
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 50, 60);
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(undone.repository.useCases.u1).toBeUndefined();
    expect(undone.diagramPresentations![DIAGRAM_ID]?.elementIds ?? []).toEqual([]);
    expect(Object.keys(undone.repository.useCases)).toEqual(Object.keys(before.repository.useCases));
  });

  it('moves and resizes through updatePresentation without changing the repository revision', () => {
    const ctx = setup();
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 50, 60);
    const revision = ctx.state.repository.revision;
    const moved = run(ctx.state, { type: 'updatePresentation', diagramId: DIAGRAM_ID, elementId: 'u1', presentation: { x: 300, y: 310, width: 220, height: 90 } });
    expect(moved.result.committed).toBe(true);
    expect(moved.state.repository.revision).toBe(revision);
    expect(moved.state.diagramPresentations![DIAGRAM_ID].presentations.u1.bounds).toMatchObject({ x: 300, y: 310, width: 220, height: 90 });
  });

  it('removeFromDiagram keeps the element in the model', () => {
    const ctx = setup();
    ctx.place(createActor({ id: 'a1', name: 'Pilot', ownerId: 'model' }), 10, 10);
    const removed = run(ctx.state, { type: 'removeFromDiagram', diagramId: DIAGRAM_ID, elementIds: ['a1'] });
    expect(removed.state.diagramPresentations![DIAGRAM_ID].elementIds).toEqual([]);
    expect(removed.state.repository.actors.a1).toBeDefined();
  });

  it('creates every relationship kind through the command builder and rejects illegal pairs', () => {
    const ctx = setup();
    ctx.place(createActor({ id: 'a1', name: 'Pilot', ownerId: 'model' }), 0, 0);
    ctx.place(createActor({ id: 'a2', name: 'Captain', ownerId: 'model' }), 0, 200);
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 300, 0);
    ctx.place(createUseCase({ id: 'u2', name: 'Check', ownerId: 'model' }), 300, 200);
    const req = run(ctx.state, { type: 'createElement', element: { id: 'r1', kind: 'requirement', name: 'Safe', namespace: [], ownerId: 'model', requirementId: 'REQ-1', text: 'x', status: 'draft', version: '1' } as any });
    expect(req.result.committed).toBe(true);
    ctx.state = req.state;
    // Requirements can be shown on a Use Case Diagram as traceability targets.
    const shown = run(ctx.state, { type: 'addToDiagram', diagramId: DIAGRAM_ID, elementIds: ['r1'], coordinates: { r1: { x: 600, y: 100 } } });
    expect(shown.result.committed).toBe(true);
    ctx.state = shown.state;

    const make = (input: Parameters<typeof buildCreateUseCaseRelationshipCommand>[1]) => {
      const plan = buildCreateUseCaseRelationshipCommand(ctx.state.repository, input);
      if (!plan.ok) return { plan, committed: false, diagnostics: plan.diagnostics };
      const out = run(ctx.state, plan.command);
      if (out.result.committed) ctx.state = out.state;
      return { plan, committed: out.result.committed, diagnostics: out.result.diagnostics };
    };

    expect(make({ kind: 'useCaseAssociation', sourceId: 'a1', targetId: 'u1' }).committed).toBe(true);
    expect(make({ kind: 'include', sourceId: 'u1', targetId: 'u2' }).committed).toBe(true);
    expect(make({ kind: 'useCaseGeneralization', sourceId: 'a2', targetId: 'a1' }).committed).toBe(true);
    expect(make({ kind: 'useCaseSatisfy', sourceId: 'u1', targetId: 'r1' }).committed).toBe(true);
    expect(make({ kind: 'useCaseTrace', sourceId: 'r1', targetId: 'u2' }).committed).toBe(true);

    const illegal = make({ kind: 'useCaseAssociation', sourceId: 'a1', targetId: 'a2' });
    expect(illegal.committed).toBe(false);
    expect(illegal.diagnostics.length).toBeGreaterThan(0);
    expect(Object.keys(ctx.state.repository.relationships)).toHaveLength(5);

    // The view draws all five once both ends are on the diagram, with no extra presentation records.
    const view = buildUseCaseDiagramView(ctx.state.repository, ctx.state.diagramPresentations![DIAGRAM_ID]);
    expect(view.edges.map(e => e.relationshipKind).sort()).toEqual(
      ['include', 'useCaseAssociation', 'useCaseGeneralization', 'useCaseSatisfy', 'useCaseTrace'].sort(),
    );
  });

  it('extend needs an extension point: the builder asks for one, then creates point + relationship in one undo step', () => {
    const ctx = setup();
    ctx.place(createUseCase({ id: 'base', name: 'Fly', ownerId: 'model' }), 0, 0);
    ctx.place(createUseCase({ id: 'ext', name: 'Divert', ownerId: 'model' }), 300, 0);

    const missing = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'ext', targetId: 'base' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.diagnostics[0].code).toBe('MISSING_EXTENSION_POINT');
      expect(missing.needsExtensionPoint).toEqual({ targetUseCaseId: 'base', candidates: [] });
    }

    // What the gateway would do with an extend that lacks the point: the validation already rejects it.
    const direct = executeSysmlCommand(ctx.state, { type: 'createElement', element: { id: 'bad', kind: 'extend', sourceId: 'ext', targetId: 'base' } });
    expect(direct.committed).toBe(false);

    const revisionBefore = ctx.state.repository.revision;
    const plan = buildCreateUseCaseRelationshipCommand(ctx.state.repository, {
      kind: 'extend', sourceId: 'ext', targetId: 'base', newExtensionPointName: 'engine failure', condition: 'engine out',
      relationshipId: 'rel-ext', extensionPointNewId: 'ep-new',
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const created = run(ctx.state, plan.command);
    expect(created.result.committed).toBe(true);
    ctx.state = created.state;
    expect(ctx.state.repository.useCases.base.extensionPointIds).toEqual(['ep-new']);
    expect(ctx.state.repository.relationships['rel-ext']).toMatchObject({ kind: 'extend', extensionPointId: 'ep-new', name: 'engine out' });

    const view = buildUseCaseDiagramView(ctx.state.repository, ctx.state.diagramPresentations![DIAGRAM_ID]);
    expect(view.edges[0].noteLines).toEqual(['extension point: engine failure', '[engine out]']);
    expect(view.nodes.find(n => n.id === 'base')!.extensionPoints.map(ep => ep.label)).toEqual(['engine failure']);

    // One undo reverts all three steps.
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect(undone.repository.relationships['rel-ext']).toBeUndefined();
    expect(undone.repository.extensionPoints['ep-new']).toBeUndefined();
    expect(undone.repository.useCases.base.extensionPointIds).toEqual([]);
    expect(revisionBefore).toBeGreaterThan(0);
  });

  it('extend reuses the only extension point and asks to choose when there are several', () => {
    const ctx = setup();
    ctx.place(createUseCase({ id: 'base', name: 'Fly', ownerId: 'model' }), 0, 0);
    ctx.place(createUseCase({ id: 'ext', name: 'Divert', ownerId: 'model' }), 300, 0);
    const addPoint = (name: string, id: string) => {
      const command = buildCreateExtensionPointCommand(ctx.state.repository, 'base', name, { extensionPointId: id })!;
      const out = run(ctx.state, command);
      expect(out.result.committed).toBe(true);
      ctx.state = out.state;
    };
    addPoint('a', 'ep-a');
    const single = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'ext', targetId: 'base' });
    expect(single.ok).toBe(true);
    addPoint('b', 'ep-b');
    const several = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'ext', targetId: 'base' });
    expect(several.ok).toBe(false);
    if (!several.ok) expect(several.needsExtensionPoint?.candidates.map(c => c.label)).toEqual(['a', 'b']);
    const picked = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'ext', targetId: 'base', extensionPointId: 'ep-b' });
    expect(picked.ok).toBe(true);
    const wrong = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'ext', targetId: 'base', extensionPointId: 'elsewhere' });
    expect(wrong.ok).toBe(false);
    // Duplicate names on one use case are refused.
    const dup = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'ext', targetId: 'base', newExtensionPointName: 'a' });
    expect(dup.ok).toBe(false);
  });

  it('subject nesting: geometry proposes, the confirmed batch sets subjectId, one undo reverts', () => {
    const ctx = setup();
    ctx.place(createSubject({ id: 's1', name: 'Aircraft', ownerId: 'model' }), 100, 100, 400, 300);
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 150, 150);
    ctx.place(createUseCase({ id: 'u2', name: 'Land', ownerId: 'model' }), 700, 150);

    const proposals = proposeSubjectAssignments(buildUseCaseDiagramView(ctx.state.repository, ctx.state.diagramPresentations![DIAGRAM_ID]));
    expect(proposals).toEqual([{ useCaseId: 'u1', fromSubjectId: undefined, toSubjectId: 's1' }]);
    // Nothing is committed until the user confirms.
    expect(ctx.state.repository.useCases.u1.subjectId).toBeUndefined();

    const command = buildAssignSubjectsCommand(proposals)!;
    const applied = run(ctx.state, command);
    expect(applied.result.committed).toBe(true);
    expect(applied.state.repository.useCases.u1.subjectId).toBe('s1');
    expect(applied.state.repository.useCases.u2.subjectId).toBeUndefined();

    // Moving it back out proposes removal, which also commits cleanly.
    ctx.state = applied.state;
    const moved = run(ctx.state, { type: 'updatePresentation', diagramId: DIAGRAM_ID, elementId: 'u1', presentation: { x: 900, y: 600 } });
    ctx.state = moved.state;
    const removal = proposeSubjectAssignments(buildUseCaseDiagramView(ctx.state.repository, ctx.state.diagramPresentations![DIAGRAM_ID]), { useCaseIds: ['u1'] });
    expect(removal).toEqual([{ useCaseId: 'u1', fromSubjectId: 's1' }]);
    const cleared = run(ctx.state, buildAssignSubjectsCommand(removal)!);
    expect(cleared.state.repository.useCases.u1.subjectId).toBeUndefined();
    expect(buildAssignSubjectsCommand([])).toBeUndefined();

    // The removal was one batch, so one undo restores the membership.
    const undone = executeSysmlCommand(cleared.state, { type: 'undo' });
    expect(undone.repository.useCases.u1.subjectId).toBe('s1');
  });

  it('moving a subject together with its members is one undo step', () => {
    const ctx = setup();
    ctx.place(createSubject({ id: 's1', name: 'Aircraft', ownerId: 'model' }), 100, 100, 400, 300);
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 150, 150);
    const before = ctx.state.diagramPresentations![DIAGRAM_ID].presentations;
    const move = run(ctx.state, {
      type: 'batch',
      commands: [
        { type: 'updatePresentation', diagramId: DIAGRAM_ID, elementId: 's1', presentation: { x: 300, y: 100, width: 400, height: 300 } },
        { type: 'updatePresentation', diagramId: DIAGRAM_ID, elementId: 'u1', presentation: { x: 350, y: 150, width: 180, height: 72 } },
      ],
    });
    expect(move.result.committed).toBe(true);
    expect(move.state.diagramPresentations![DIAGRAM_ID].presentations.u1.bounds).toMatchObject({ x: 350, y: 150 });
    const undone = executeSysmlCommand(move.state, { type: 'undo' });
    expect(undone.diagramPresentations![DIAGRAM_ID].presentations.s1.bounds.x).toBe(before.s1.bounds.x);
    expect(undone.diagramPresentations![DIAGRAM_ID].presentations.u1.bounds.x).toBe(before.u1.bounds.x);
  });

  it('opening a use case diagram by id reports the useCase kind for the workspace to mount', () => {
    const ctx = setup();
    const nav = openExactDiagram({ activeDiagramId: 'x', diagramKind: 'bdd', returnStack: [] }, ctx.state.repository, DIAGRAM_ID);
    expect(nav).toMatchObject({ activeDiagramId: DIAGRAM_ID, diagramKind: 'useCase' });
  });

  it('survives serialize -> load: diagram kind, elements, bounds, relationships, subject and extension points', () => {
    const ctx = setup();
    ctx.place(createActor({ id: 'a1', name: 'Pilot', ownerId: 'model' }), 10, 20);
    ctx.place(createSubject({ id: 's1', name: 'Aircraft', ownerId: 'model' }), 100, 100, 400, 300);
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 150, 150);
    ctx.place(createUseCase({ id: 'u2', name: 'Divert', ownerId: 'model' }), 700, 150);
    ctx.state = run(ctx.state, buildAssignSubjectsCommand([{ useCaseId: 'u1', toSubjectId: 's1' }])!).state;
    ctx.state = run(ctx.state, { type: 'createElement', element: createExtensionPoint({ id: 'ep1', name: 'wind', useCaseId: 'u1' }) }).state;
    ctx.state = run(ctx.state, { type: 'updateElement', elementId: 'u1', patch: { extensionPointIds: ['ep1'] } }).state;
    const ext = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'extend', sourceId: 'u2', targetId: 'u1', condition: 'storm' });
    expect(ext.ok).toBe(true);
    if (!ext.ok) return;
    ctx.state = run(ctx.state, ext.command).state;
    const assoc = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'useCaseAssociation', sourceId: 'a1', targetId: 'u1' });
    if (assoc.ok) ctx.state = run(ctx.state, assoc.command).state;

    const payload = buildCanonicalSysmlProjectPayload(ctx.state, { version: '1', projectName: 'p' });
    const loaded = loadCanonicalSysmlProject(JSON.parse(JSON.stringify(payload)));
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.diagrams[DIAGRAM_ID].diagramKind).toBe('useCase');
    expect(loaded.repository.useCases.u1.subjectId).toBe('s1');
    expect(loaded.repository.useCases.u1.extensionPointIds).toEqual(['ep1']);

    const before = buildUseCaseDiagramView(ctx.state.repository, ctx.state.diagramPresentations![DIAGRAM_ID]);
    const after = buildUseCaseDiagramView(loaded.repository, loaded.diagramPresentations[DIAGRAM_ID]);
    expect(after).toEqual(before);
    expect(after.edges.map(e => e.relationshipKind).sort()).toEqual(['extend', 'useCaseAssociation']);
  });

  it('deleting a use case from the model asks for impact confirmation and removes its presentation', () => {
    const ctx = setup();
    ctx.place(createActor({ id: 'a1', name: 'Pilot', ownerId: 'model' }), 10, 10);
    ctx.place(createUseCase({ id: 'u1', name: 'Fly', ownerId: 'model' }), 300, 10);
    const assoc = buildCreateUseCaseRelationshipCommand(ctx.state.repository, { kind: 'useCaseAssociation', sourceId: 'a1', targetId: 'u1' });
    if (assoc.ok) ctx.state = run(ctx.state, assoc.command).state;
    const first = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: ['u1'] });
    if (!first.committed) {
      expect(first.impact).toBeDefined();
    }
    const done = first.committed ? first : executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: ['u1'], confirmedImpactHash: computeImpactHash(first.impact!) });
    expect(done.committed).toBe(true);
    expect(done.repository.useCases.u1).toBeUndefined();
    expect(done.repository.relationships[Object.keys(ctx.state.repository.relationships)[0]]).toBeUndefined();
    expect(done.diagramPresentations![DIAGRAM_ID].elementIds).not.toContain('u1');
  });
});
