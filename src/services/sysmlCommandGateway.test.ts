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
import { createEmptyRepository, type BlockDefinition, type PartUsage, type RequirementDefinition, type SysmlRelationship } from '../engine/sysml/model';
import { serializeRepository } from '../engine/sysml/persistence';

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
});
