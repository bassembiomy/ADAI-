import { describe, it, expect } from 'vitest';
import {
  executeSysmlCommand,
  projectLegacyDiagram,
  createSysmlGatewayState,
  buildCanonicalSysmlProjectPayload,
  loadCanonicalSysmlProject,
  computeImpactHash,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { createEmptyRepository, type BlockDefinition, type ConnectorUsage, type PartUsage, type PortDefinition, type PortUsage, type RequirementDefinition, type SysmlRelationship } from '../engine/sysml/model';
import { serializeRepository } from '../engine/sysml/persistence';
import type { SysmlElement } from './sysmlCommandGateway';

describe('sysmlCommandGateway', () => {
  it('creates an element in the canonical repository first and derives legacy arrays', () => {
    const state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'block-engine',
      name: 'Engine',
      kind: 'block',
      namespace: ['Vehicle'],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [{
        id: 'port-fuel',
        name: 'fuelIn',
        kind: 'full',
        typeId: 'FuelType',
        direction: 'in',
        isConjugated: false,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }],
      operations: ['start()'],
      constraints: ['fuelRate > 0'],
    };

    const result = executeSysmlCommand(state, {
      type: 'createElement',
      element: block,
      presentation: { x: 100, y: 150, width: 200, height: 120 },
    });

    expect(result.committed).toBe(true);
    // Repository is mutated first and revision incremented
    expect(result.repository.definitions['block-engine']).toBeDefined();
    expect(result.repository.definitions['block-engine'].name).toBe('Engine');
    expect(result.repository.revision).toBe(1);
    expect(result.repository.auditTrail).toHaveLength(1);
    expect(result.repository.auditTrail[0].command).toBe('createElement');
    expect(result.repository.auditTrail[0].elementIds).toContain('block-engine');

    // Legacy view is derived from canonical repository
    expect(result.view.blocks).toHaveLength(1);
    const legacyBlock = result.view.blocks[0];
    expect(legacyBlock.id).toBe('block-engine');
    expect(legacyBlock.name).toBe('Engine');
    expect(legacyBlock.x).toBe(100);
    expect(legacyBlock.y).toBe(150);
    expect(legacyBlock.ports).toHaveLength(1);
    expect(legacyBlock.ports[0].id).toBe('port-fuel');
    expect(legacyBlock.ports[0].direction).toBe('in');
  });

  it('updates an element in the canonical repository and reflects in derived view', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'block-motor',
      name: 'Motor',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const createResult = executeSysmlCommand(state, {
      type: 'createElement',
      element: block,
    });
    state = { ...state, repository: createResult.repository, history: createResult.history };

    const updateResult = executeSysmlCommand(state, {
      type: 'updateElement',
      elementId: 'block-motor',
      patch: { name: 'ElectricMotor', isAbstract: true },
    });

    expect(updateResult.committed).toBe(true);
    expect(updateResult.repository.revision).toBe(2);
    expect(updateResult.repository.definitions['block-motor'].name).toBe('ElectricMotor');
    expect((updateResult.repository.definitions['block-motor'] as BlockDefinition).isAbstract).toBe(true);

    // Derived view matches
    const updatedViewBlock = updateResult.view.blocks.find((b: any) => b.id === 'block-motor');
    expect(updatedViewBlock?.name).toBe('ElectricMotor');
    expect(updatedViewBlock?.isAbstract).toBe(true);
  });

  it('requires confirmation for cascading deletion and applies atomically upon confirmation', () => {
    let state = createSysmlGatewayState();
    const parentBlock: BlockDefinition = {
      id: 'block-parent',
      name: 'ParentBlock',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const childUsage: PartUsage = {
      id: 'part-child',
      name: 'childUsage',
      kind: 'part',
      ownerId: 'block-parent',
      typeId: 'block-parent',
      aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    let r = executeSysmlCommand(state, { type: 'createElement', element: parentBlock });
    state = { ...state, repository: r.repository, history: r.history };
    r = executeSysmlCommand(state, { type: 'createElement', element: childUsage });
    state = { ...state, repository: r.repository, history: r.history };

    // Deleting parent block cascades to composite childUsage, so it requires confirmation
    const unconfirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['block-parent'],
    });

    expect(unconfirmed.committed).toBe(false);
    expect(unconfirmed.impact).toBeDefined();
    expect(unconfirmed.impact?.deletedElementIds).toContain('part-child');

    // Confirm with hash
    const impactHash = computeImpactHash(unconfirmed.impact!);
    const confirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['block-parent'],
      confirmedImpactHash: impactHash,
    });

    expect(confirmed.committed).toBe(true);
    expect(confirmed.repository.definitions['block-parent']).toBeUndefined();
    expect(confirmed.repository.usages['part-child']).toBeUndefined();
    expect(confirmed.view.blocks).toHaveLength(0);
    expect(confirmed.view.parts).toHaveLength(0);
  });

  it('supports atomic undo and redo across mutations', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'block-undoable',
      name: 'InitialName',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    const r1 = executeSysmlCommand(state, { type: 'createElement', element: block });
    state = { ...state, repository: r1.repository, history: r1.history };

    const r2 = executeSysmlCommand(state, {
      type: 'updateElement',
      elementId: 'block-undoable',
      patch: { name: 'UpdatedName' },
    });
    state = { ...state, repository: r2.repository, history: r2.history };

    expect(state.repository.definitions['block-undoable'].name).toBe('UpdatedName');

    // Undo update
    const undoRes = executeSysmlCommand(state, { type: 'undo' });
    expect(undoRes.committed).toBe(true);
    expect(undoRes.repository.definitions['block-undoable'].name).toBe('InitialName');
    expect(undoRes.view.blocks[0].name).toBe('InitialName');
    state = { ...state, repository: undoRes.repository, history: undoRes.history };

    // Redo update
    const redoRes = executeSysmlCommand(state, { type: 'redo' });
    expect(redoRes.committed).toBe(true);
    expect(redoRes.repository.definitions['block-undoable'].name).toBe('UpdatedName');
    expect(redoRes.view.blocks[0].name).toBe('UpdatedName');
  });

  it('persists only canonical repository and presentation; ignores direct legacy-array tampering', () => {
    let state = createSysmlGatewayState();
    const req: RequirementDefinition = {
      id: 'req-speed',
      name: 'Speed Requirement',
      kind: 'requirement',
      namespace: [],
      requirementId: 'REQ-101',
      text: 'Shall exceed 100 km/h',
      status: 'approved',
      version: '1.0',
    };
    const r = executeSysmlCommand(state, {
      type: 'createElement',
      element: req,
      presentation: { x: 50, y: 75, width: 180, height: 90 },
    });
    state = { ...state, repository: r.repository, coordinates: r.coordinates };

    // Simulate direct legacy mutation (a detached rogue block injected directly into view)
    const tamperedView = {
      ...r.view,
      blocks: [
        ...r.view.blocks,
        {
          id: 'rogue-untracked-block',
          name: 'RogueBlock',
          stereotype: 'block',
          x: 999,
          y: 999,
          width: 100,
          height: 80,
          properties: [],
          operations: [],
          constraints: [],
          classes: [],
          ports: [],
        },
      ],
    };

    // Building the project payload must be authoritative from canonical state
    const payload = buildCanonicalSysmlProjectPayload(state, {
      version: '1.0.0',
      projectName: 'SpeedProject',
    });

    // The project payload has canonical sysmlRepository envelope and coordinates
    expect(payload.sysmlRepository).toBeDefined();
    // Rogue block is not in the serialized repository
    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions['rogue-untracked-block']).toBeUndefined();
    expect(loaded.view.blocks.find((b: any) => b.id === 'rogue-untracked-block')).toBeUndefined();
    // Authorized requirement survived perfectly
    expect(loaded.repository.requirements['req-speed']).toBeDefined();
    expect(loaded.view.blocks.find((b: any) => b.id === 'req-speed')?.reqId).toBe('REQ-101');
  });

  it('rejects tampered checksum or invalid schema on project load without replacing active model', () => {
    const state = createSysmlGatewayState();
    const payload = buildCanonicalSysmlProjectPayload(state, {
      version: '1.0.0',
      projectName: 'CorruptedProject',
    });

    // Corrupt the repository string in envelope
    const parsedEnvelope = JSON.parse(payload.sysmlRepository as string);
    parsedEnvelope.repository.revision = 99999; // Alters content without updating checksum
    const corruptedPayload = {
      ...payload,
      sysmlRepository: JSON.stringify(parsedEnvelope),
    };

    const loadResult = loadCanonicalSysmlProject(corruptedPayload);
    expect(loadResult.valid).toBe(false);
    expect(loadResult.diagnostics.some((d: any) => d.code === 'PERSISTENCE_CHECKSUM_MISMATCH')).toBe(true);
  });

  it('previews container deletion impact, cancels without mutation or revision change, confirms with single revision/audit record, and undoes completely', () => {
    let state = createSysmlGatewayState();
    const parentReq: RequirementDefinition = {
      id: 'req-parent', name: 'ParentReq', kind: 'requirement', namespace: [],
      requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1.0',
    };
    const childReq: RequirementDefinition = {
      id: 'req-child', name: 'ChildReq', kind: 'requirement', namespace: [],
      requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1.0',
    };
    const containmentRel: SysmlRelationship = {
      id: 'rel-rc', kind: 'requirementContainment', sourceId: 'req-parent', targetId: 'req-child',
    };

    // Add elements to state
    let r = executeSysmlCommand(state, { type: 'createElement', element: parentReq, presentation: { x: 10, y: 10, width: 100, height: 60 } });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, history: r.history };
    r = executeSysmlCommand(state, { type: 'createElement', element: childReq, presentation: { x: 10, y: 100, width: 100, height: 60 } });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, history: r.history };
    r = executeSysmlCommand(state, { type: 'createElement', element: containmentRel });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, history: r.history };

    const initialRevision = state.repository.revision;
    const initialAuditLength = state.repository.auditTrail.length;

    // 1. Preview without confirmation hash -> uncommitted, preview lists complete subtree
    const unconfirmed = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['req-parent'] });
    expect(unconfirmed.committed).toBe(false);
    expect(unconfirmed.impact).toBeDefined();
    expect(unconfirmed.impact!.nestedRequirementIds).toEqual(['req-child']);
    expect(unconfirmed.impact!.deletedElementIds).toEqual(expect.arrayContaining(['req-parent', 'req-child', 'rel-rc']));
    expect(unconfirmed.repository.revision).toBe(initialRevision);
    expect(unconfirmed.repository.auditTrail).toHaveLength(initialAuditLength);
    expect(unconfirmed.repository.requirements['req-parent']).toBeDefined();
    expect(unconfirmed.repository.requirements['req-child']).toBeDefined();

    // 2. Confirmed deletion with computed impact hash
    const impactHash = computeImpactHash(unconfirmed.impact!);
    const confirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['req-parent'],
      confirmedImpactHash: impactHash,
    });
    expect(confirmed.committed).toBe(true);
    expect(confirmed.repository.revision).toBe(initialRevision + 1);
    expect(confirmed.repository.auditTrail).toHaveLength(initialAuditLength + 1);
    expect(confirmed.repository.auditTrail[confirmed.repository.auditTrail.length - 1].command).toBe('deleteElements');
    expect(confirmed.repository.requirements['req-parent']).toBeUndefined();
    expect(confirmed.repository.requirements['req-child']).toBeUndefined();
    expect(confirmed.repository.relationships['rel-rc']).toBeUndefined();

    // 3. One undo restores exact repository prior to deletion
    const undone = executeSysmlCommand(
      { ...state, repository: confirmed.repository, coordinates: confirmed.coordinates, history: confirmed.history },
      { type: 'undo' },
    );
    expect(undone.committed).toBe(true);
    expect(undone.repository.requirements['req-parent']).toBeDefined();
    expect(undone.repository.requirements['req-child']).toBeDefined();
    expect(undone.repository.relationships['rel-rc']).toBeDefined();
    expect(undone.repository.revision).toBe(initialRevision);
  });

  it('separates diagram removal from semantic model deletion and preserves containment & revision', () => {
    let state = createSysmlGatewayState();
    const parentReq: RequirementDefinition = {
      id: 'req-parent',
      name: 'System Specification',
      requirementId: 'REQ-001',
      text: 'The system shall perform all operations.',
      namespace: [],
      kind: 'requirement',
      status: 'approved',
      priority: 'high',
      risk: 'low',
      version: '1.0',
    };
    const childReq: RequirementDefinition = {
      id: 'req-child',
      name: 'Subsystem Specification',
      requirementId: 'REQ-002',
      text: 'The subsystem shall perform sub-operations.',
      namespace: [],
      kind: 'requirement',
      status: 'draft',
      priority: 'medium',
      risk: 'medium',
      version: '1.0',
    };
    const containmentRel: SysmlRelationship = {
      id: 'rel-contain',
      kind: 'requirementContainment',
      sourceId: 'req-parent',
      targetId: 'req-child',
    };

    const s1 = executeSysmlCommand(state, { type: 'createElement', element: parentReq });
    const s2 = executeSysmlCommand({ ...state, repository: s1.repository, history: s1.history }, { type: 'createElement', element: childReq });
    const s3 = executeSysmlCommand({ ...state, repository: s2.repository, history: s2.history }, { type: 'createElement', element: containmentRel });

    const initialRevision = s3.repository.revision;
    const initialAuditLength = s3.repository.auditTrail.length;

    // Set initial diagram presentation membership
    state = {
      ...state,
      repository: s3.repository,
      history: s3.history,
      diagramPresentations: {
        'req-diagram-1': { elementIds: ['req-parent', 'req-child'] },
      },
    };

    // Remove parent from diagram only
    const removeResult = executeSysmlCommand(state, {
      type: 'removeFromDiagram',
      diagramId: 'req-diagram-1',
      elementIds: ['req-parent'],
    });

    expect(removeResult.committed).toBe(true);
    // 1. Repository revision is preserved!
    expect(removeResult.repository.revision).toBe(initialRevision);
    expect(removeResult.repository.auditTrail).toHaveLength(initialAuditLength);

    // 2. Both semantic requirements, containment relationship, and RTM rows survive
    expect(removeResult.repository.requirements['req-parent']).toBeDefined();
    expect(removeResult.repository.requirements['req-child']).toBeDefined();
    expect(removeResult.repository.relationships['rel-contain']).toBeDefined();
    expect(removeResult.repository.relationships['rel-contain'].kind).toBe('requirementContainment');

    // 3. Only presentation membership changes
    expect(removeResult.diagramPresentations['req-diagram-1'].elementIds).toEqual(['req-child']);
    expect(removeResult.diagramPresentations['req-diagram-1'].elementIds).not.toContain('req-parent');

    // 4. View for this diagram filters out removed element
    const filteredView = projectLegacyDiagram(removeResult.repository, removeResult.coordinates, removeResult.diagramPresentations, 'req-diagram-1');
    expect(filteredView.blocks.map(b => b.id)).toEqual(['req-child']);

    // 5. Presentation-only operation undoes without modifying repository revision
    const undonePresentation = executeSysmlCommand(
      {
        ...state,
        repository: removeResult.repository,
        coordinates: removeResult.coordinates,
        diagramPresentations: removeResult.diagramPresentations,
        history: removeResult.history,
        presentationHistory: (removeResult as any).presentationHistory,
      },
      { type: 'undo' },
    );
    expect(undonePresentation.committed).toBe(true);
    expect(undonePresentation.diagramPresentations['req-diagram-1'].elementIds).toEqual(expect.arrayContaining(['req-parent', 'req-child']));
    expect(undonePresentation.repository.revision).toBe(initialRevision);

    // 6. Project payload serialization & load round-trips diagramPresentations
    const payload = buildCanonicalSysmlProjectPayload(
      {
        ...state,
        repository: removeResult.repository,
        diagramPresentations: removeResult.diagramPresentations,
      },
      { version: '1.0', projectName: 'Test Project' },
    );
    expect(payload.diagramPresentations).toEqual({
      'req-diagram-1': { elementIds: ['req-child'] },
    });

    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.diagramPresentations).toEqual({
      'req-diagram-1': { elementIds: ['req-child'] },
    });
    expect(loaded.repository.requirements['req-parent']).toBeDefined();
    expect(loaded.repository.requirements['req-child']).toBeDefined();
  });

  it('coalesces rapid pointer drag updates sharing a coalesceKey into a single history entry', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'blk-drag',
      name: 'DraggableBlock',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    let r = executeSysmlCommand(state, {
      type: 'createElement',
      element: block,
      presentation: { x: 0, y: 0 },
    });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, store: r.store, patchHistory: r.patchHistory, history: r.history };

    // Simulate 10 drag move events with same coalesceKey
    for (let i = 1; i <= 10; i++) {
      r = executeSysmlCommand(state, {
        type: 'updatePresentation',
        elementId: 'blk-drag',
        presentation: { x: i * 10, y: i * 10 },
        coalesceKey: 'drag-blk-drag',
      });
      state = { ...state, coordinates: r.coordinates, store: r.store, patchHistory: r.patchHistory, history: r.history };
    }

    expect(state.coordinates['blk-drag']).toEqual({ x: 100, y: 100 });
    // In patchHistory, all 10 drag operations should have coalesced into ONE entry!
    expect(state.patchHistory?.past.length).toBe(2); // 1 create + 1 coalesced drag

    // Single undo restores back to initial position (0, 0)
    const undone = executeSysmlCommand(state, { type: 'undo' });
    expect(undone.coordinates['blk-drag']).toEqual({ x: 0, y: 0 });

    // Redo restores to final position (100, 100)
    const redone = executeSysmlCommand(
      {
        ...state,
        repository: undone.repository,
        coordinates: undone.coordinates,
        diagramPresentations: undone.diagramPresentations,
        store: undone.store,
        patchHistory: undone.patchHistory,
        history: undone.history,
      },
      { type: 'redo' },
    );
    expect(redone.coordinates['blk-drag']).toEqual({ x: 100, y: 100 });
  });

  it('bounds history memory under configurable budget', () => {
    let state = createSysmlGatewayState(undefined, undefined, undefined, {
      maxEntries: 5,
      maxBytes: 5000,
    });

    const block: BlockDefinition = {
      id: 'blk-budget',
      name: 'BudgetBlock',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    let r = executeSysmlCommand(state, { type: 'createElement', element: block });
    state = { ...state, repository: r.repository, store: r.store, patchHistory: r.patchHistory, history: r.history };

    for (let i = 1; i <= 15; i++) {
      r = executeSysmlCommand(state, {
        type: 'updateElement',
        elementId: 'blk-budget',
        patch: { name: `Name_v${i}` },
      });
      state = { ...state, repository: r.repository, store: r.store, patchHistory: r.patchHistory, history: r.history };
    }

    // Both patchHistory and legacy MutationHistory are capped to prevent memory leaks!
    expect(state.patchHistory?.past.length).toBeLessThanOrEqual(5);
    expect(state.history.past.length).toBeLessThanOrEqual(20);
  });

  it('Task 6: refuses deletion touching a protected baseline until cloned or explicitly authorized', () => {
    let state = createSysmlGatewayState();
    const target: RequirementDefinition = {
      id: 'req-target', name: 'Target', kind: 'requirement', namespace: [],
      requirementId: 'REQ-T', text: 'Target', status: 'draft', version: '1.0',
    };
    let r = executeSysmlCommand(state, { type: 'createElement', element: target });
    state = { ...state, repository: r.repository, history: r.history, store: r.store, patchHistory: r.patchHistory, coordinates: r.coordinates, diagramPresentations: r.diagramPresentations };
    const revisionBefore = state.repository.revision;
    const auditBefore = state.repository.auditTrail.length;
    const patchesBefore = state.patchHistory?.past.length ?? 0;

    // Freeze the target inside a protected baseline snapshot.
    const frozen: typeof state.repository.baselines[string] = {
      id: 'bl-frozen', name: 'Frozen', revision: state.repository.revision,
      createdAt: '2026-09-12T00:00:00Z', protected: true,
      contentHash: 'frozen', elementHashes: { 'req-target': 'h-target' },
    };
    state = { ...state, repository: { ...state.repository, baselines: { ...state.repository.baselines, [frozen.id]: frozen } } };

    // 1. Blocked: no silent deletion of protected content.
    const refused = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['req-target'] });
    expect(refused.committed).toBe(false);
    expect(refused.impact?.severity).toBe('blocked');
    expect(refused.impact?.blockedBaselineIds).toEqual(['bl-frozen']);
    expect(refused.diagnostics.map(d => d.code)).toContain('PROTECTED_BASELINE_REQUIRES_AUTHORIZATION');
    expect(refused.repository.revision).toBe(revisionBefore);
    expect(refused.repository.auditTrail).toHaveLength(auditBefore);
    expect(refused.patchHistory?.past.length ?? 0).toBe(patchesBefore);
    expect(refused.repository.requirements['req-target']).toBeDefined();

    // 2. A confirmed impact hash alone is still not enough without authorization.
    const impactHash = computeImpactHash(refused.impact!);
    const hashOnly = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['req-target'], confirmedImpactHash: impactHash });
    expect(hashOnly.committed).toBe(false);
    expect(hashOnly.diagnostics.map(d => d.code)).toContain('PROTECTED_BASELINE_REQUIRES_AUTHORIZATION');

    // 3. Explicit authorization plus the confirmed hash commits atomically.
    const committed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['req-target'],
      confirmedImpactHash: impactHash,
      authorizedBaselineIds: ['bl-frozen'],
    });
    expect(committed.committed).toBe(true);
    expect(committed.repository.requirements['req-target']).toBeUndefined();
    expect(committed.repository.revision).toBe(revisionBefore + 1);
    expect(committed.repository.auditTrail).toHaveLength(auditBefore + 1);
  });
});

describe('sysmlCommandGateway semantic policy gating (Task 2)', () => {
  const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
  const defBlock = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
    id, name: id, kind: 'block', namespace: [], isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations: [], constraints: [], ...extra,
  });
  const requirement = (id: string): RequirementDefinition => ({
    id, name: id, kind: 'requirement', namespace: [], requirementId: `REQ-${id}`,
    text: `${id} text`, status: 'draft', version: '1.0',
  });
  const rel = (id: string, kind: SysmlRelationship['kind'], sourceId: string, targetId: string): SysmlRelationship => ({
    id, kind, sourceId, targetId,
  });

  function commitAll(elements: SysmlElement[]) {
    let state = createSysmlGatewayState();
    for (const element of elements) {
      const r = executeSysmlCommand(state, { type: 'createElement', element });
      expect(r.committed).toBe(true);
      state = {
        ...state, repository: r.repository, history: r.history, store: r.store,
        patchHistory: r.patchHistory, coordinates: r.coordinates,
        diagramPresentations: r.diagramPresentations,
      };
    }
    return state;
  }

  function codesOf(result: { diagnostics: Array<{ code: string }> }): string[] {
    return result.diagnostics.map(d => d.code);
  }

  it('rejects generalization with non-block endpoints instead of a generic error', () => {
    const state = commitAll([defBlock('b1'), requirement('req1')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length, patches: state.patchHistory?.past.length ?? 0 };
    const result = executeSysmlCommand(state, {
      type: 'createElement', element: rel('g-bad', 'generalization', 'req1', 'b1'),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('INVALID_GENERALIZATION_ENDPOINTS');
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
    expect(result.patchHistory?.past.length ?? 0).toBe(before.patches);
    expect(result.repository.relationships['g-bad']).toBeUndefined();
  });

  it('rejects composition touching requirement endpoints', () => {
    const state = commitAll([defBlock('b1'), requirement('req1')]);
    const result = executeSysmlCommand(state, {
      type: 'createElement', element: rel('c-bad', 'composition', 'b1', 'req1'),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('INVALID_COMPOSITION_ENDPOINTS');
  });

  it('blocks invalid relationship creates and updates before repository mutation', () => {
    const valueType = { id: 'temperature', name: 'Temperature', namespace: [], kind: 'valueType' as const };
    const state = commitAll([defBlock('system'), defBlock('child'), valueType as SysmlElement, requirement('req')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length };

    const aggregation = executeSysmlCommand(state, {
      type: 'createElement', element: rel('aggregation', 'sharedAggregation', 'system', 'temperature'),
    });
    expect(aggregation.committed).toBe(false);
    expect(codesOf(aggregation)).toContain('INVALID_AGGREGATION_ENDPOINTS');
    expect(aggregation.repository.relationships.aggregation).toBeUndefined();

    const crossFamily = executeSysmlCommand(state, {
      type: 'createElement', element: rel('cross-family', 'generalization', 'system', 'temperature'),
    });
    expect(crossFamily.committed).toBe(false);
    expect(codesOf(crossFamily)).toContain('CROSS_FAMILY_GENERALIZATION');
    expect(crossFamily.repository.relationships['cross-family']).toBeUndefined();

    const structuralRequirement = executeSysmlCommand(state, {
      type: 'createElement', element: rel('req-structure', 'association', 'req', 'system'),
    });
    expect(structuralRequirement.committed).toBe(false);
    expect(codesOf(structuralRequirement)).toContain('INCOMPATIBLE_RELATIONSHIP_ENDPOINTS');
    expect(structuralRequirement.repository.relationships['req-structure']).toBeUndefined();

    const valid = executeSysmlCommand(state, {
      type: 'createElement', element: rel('change-me', 'association', 'system', 'child'),
    });
    expect(valid.committed).toBe(true);
    const update = executeSysmlCommand({ ...state, repository: valid.repository, history: valid.history, store: valid.store, patchHistory: valid.patchHistory }, {
      type: 'updateElement', elementId: 'change-me', patch: { kind: 'sharedAggregation', targetId: 'temperature' },
    });
    expect(update.committed).toBe(false);
    expect(codesOf(update)).toContain('INVALID_AGGREGATION_ENDPOINTS');
    expect(update.repository.relationships['change-me']).toEqual(valid.repository.relationships['change-me']);
    expect(update.repository.revision).toBe(before.revision + 1);
    expect(update.repository.auditTrail).toHaveLength(before.audit + 1);
  });

  it('rejects relationships with missing endpoints and duplicates with typed codes', () => {
    const state = commitAll([defBlock('a'), defBlock('b')]);
    const missing = executeSysmlCommand(state, {
      type: 'createElement', element: rel('r-missing', 'association', 'a', 'ghost'),
    });
    expect(missing.committed).toBe(false);
    expect(codesOf(missing)).toContain('MISSING_RELATIONSHIP_ENDPOINT');

    const first = executeSysmlCommand(state, {
      type: 'createElement', element: rel('r1', 'association', 'a', 'b'),
    });
    expect(first.committed).toBe(true);
    const next = {
      ...state, repository: first.repository, history: first.history, store: first.store,
      patchHistory: first.patchHistory, coordinates: first.coordinates,
      diagramPresentations: first.diagramPresentations,
    };
    const dupe = executeSysmlCommand(next, {
      type: 'createElement', element: rel('r2', 'association', 'a', 'b'),
    });
    expect(dupe.committed).toBe(false);
    expect(codesOf(dupe)).toContain('DUPLICATE_RELATIONSHIP');
  });

  it('rejects block creation specializing a leaf supertype', () => {
    const state = commitAll([defBlock('leaf-parent', { isLeaf: true })]);
    const result = executeSysmlCommand(state, {
      type: 'createElement',
      element: defBlock('child', { supertypeIds: ['leaf-parent'] }),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('LEAF_SPECIALIZATION');
  });

  it('accepts a valid block-to-block generalization (policy allow path)', () => {
    const state = commitAll([defBlock('base'), defBlock('sub')]);
    const result = executeSysmlCommand(state, {
      type: 'createElement', element: rel('g-ok', 'generalization', 'sub', 'base'),
    });
    expect(result.committed).toBe(true);
    expect(result.repository.relationships['g-ok']).toBeDefined();
  });

  const portDef = (id: string, direction: PortDefinition['direction'], typeId = 'if'): PortDefinition => ({
    id, name: id, kind: 'proxy', typeId, direction, isConjugated: false, multiplicity: one,
  });

  function ibdFixture() {
    const ifDef = { id: 'if', name: 'IF', namespace: [], kind: 'interface' as const, features: ['signal'] };
    return commitAll([
      ifDef as unknown as SysmlElement,
      defBlock('sys', { ports: [portDef('boundary-def', 'out')] }),
      defBlock('compA', { ports: [portDef('out-def', 'out')] }),
      defBlock('compB', { ports: [portDef('in-def', 'in'), portDef('out-def-b', 'out')] }),
      { id: 'partA', name: 'partA', kind: 'part', ownerId: 'sys', typeId: 'compA', aggregation: 'composite', multiplicity: one } as unknown as SysmlElement,
      { id: 'partB', name: 'partB', kind: 'part', ownerId: 'sys', typeId: 'compB', aggregation: 'composite', multiplicity: one } as unknown as SysmlElement,
      { id: 'aOut', name: 'out', kind: 'port', ownerId: 'partA', definitionId: 'out-def' } as unknown as SysmlElement,
      { id: 'bIn', name: 'in', kind: 'port', ownerId: 'partB', definitionId: 'in-def' } as unknown as SysmlElement,
      { id: 'bOut', name: 'out', kind: 'port', ownerId: 'partB', definitionId: 'out-def-b' } as unknown as SysmlElement,
    ]);
  }

  const connector = (id: string, extra: Partial<ConnectorUsage> = {}): ConnectorUsage => ({
    id, kind: 'assembly', ownerId: 'sys', sourcePortId: 'aOut', targetPortId: 'bIn', ...extra,
  });

  it('gates connector creation (connect path) through the IBD policy', () => {
    const state = ibdFixture();
    const ok = executeSysmlCommand(state, { type: 'createElement', element: connector('conn-ok') });
    expect(ok.committed).toBe(true);
    expect(ok.repository.connectors['conn-ok']).toBeDefined();

    const badDirection = executeSysmlCommand(state, {
      type: 'createElement', element: connector('conn-dir', { targetPortId: 'bOut' }),
    });
    expect(badDirection.committed).toBe(false);
    expect(codesOf(badDirection)).toContain('INCOMPATIBLE_PORT_DIRECTION');

    const badContext = executeSysmlCommand(state, {
      type: 'createElement', element: connector('conn-ctx', { ownerId: 'compA' }),
    });
    expect(badContext.committed).toBe(false);
    expect(codesOf(badContext)).toContain('INVALID_CONNECTOR_CONTEXT');

    const afterOk = {
      ...state, repository: ok.repository, history: ok.history, store: ok.store,
      patchHistory: ok.patchHistory, coordinates: ok.coordinates,
      diagramPresentations: ok.diagramPresentations,
    };
    const dupe = executeSysmlCommand(afterOk, {
      type: 'createElement', element: connector('conn-dupe'),
    });
    expect(dupe.committed).toBe(false);
    expect(codesOf(dupe)).toContain('DUPLICATE_CONNECTOR');
  });

  it('validates updateElement against leaf / redefine policy', () => {
    const base = defBlock('base', {
      properties: [{ id: 'p1', name: 'p1', kind: 'value', typeId: 'T', multiplicity: one }],
    });
    const leafParent = defBlock('leaf-parent', { isLeaf: true });
    const state = commitAll([
      { id: 'T', name: 'T', namespace: [], kind: 'valueType' } as unknown as SysmlElement,
      base, leafParent, defBlock('child', { supertypeIds: ['base'] }),
    ]);

    const leafUpdate = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'child', patch: { supertypeIds: ['leaf-parent'] },
    });
    expect(leafUpdate.committed).toBe(false);
    expect(codesOf(leafUpdate)).toContain('LEAF_SPECIALIZATION');
    expect(leafUpdate.repository.revision).toBe(state.repository.revision);

    const badRedefine = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'child',
      patch: {
        properties: [{ id: 'p1r', name: 'p1r', kind: 'value', typeId: 'Other', multiplicity: one, redefinesId: 'p1' }],
      },
    });
    expect(badRedefine.committed).toBe(false);
    expect(codesOf(badRedefine)).toContain('INCOMPATIBLE_REDEFINITION');

    const sealParent = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'base', patch: { isLeaf: true },
    });
    expect(sealParent.committed).toBe(false);
    expect(codesOf(sealParent)).toContain('LEAF_SPECIALIZATION');
  });

  it('rejects deletion of unknown elements with a typed code and no state change', () => {
    const state = commitAll([defBlock('lonely')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length };
    const result = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['ghost'] });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('ELEMENT_NOT_FOUND');
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
  });
});


