/**
 * src/agent/toolAdapters/sysmlAdapter.test.ts
 *
 * Tests for SysML application delegate and SysmlAdapter.
 *
 * Requirements covered:
 * - Reads current canonical SysML model and revision from existing store
 * - Maps approved agent actions to SysML editor commands
 * - Rejects stale revisions and preserves model unchanged on failure
 * - Command gateway policy gating (ownership, endpoint policy, relationship kinds, duplicate IDs)
 * - Returns updated revision, changed element IDs, and validation evidence
 * - Fails closed when SysML delegate is unavailable
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSysmlDelegate,
  SysmlAdapter,
  type SysmlAdapterOptions,
} from './sysmlAdapter';
import {
  createSysmlGatewayState,
  type SysmlGatewayState,
} from '../../services/sysmlCommandGateway';
import {
  createEmptyRepository,
  type BlockDefinition,
  type RequirementDefinition,
  type SysmlRelationship,
} from '../../engine/sysml/model';

function createMockStateHolder(initialState?: SysmlGatewayState) {
  let currentState = initialState ?? createSysmlGatewayState();

  const options: SysmlAdapterOptions = {
    getState: () => currentState,
    setState: (next) => {
      currentState = next;
    },
    onStateChange: vi.fn(),
  };

  return {
    options,
    getState: () => currentState,
  };
}

describe('createSysmlDelegate', () => {
  describe('inspect()', () => {
    it('returns empty counts and revision 0 for a fresh gateway state', async () => {
      const { options } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      const snapshot = await delegate.inspect();
      expect(snapshot).toEqual({
        revision: 0,
        blockCount: 0,
        requirementCount: 0,
      });
    });

    it('returns current counts when repository has elements', async () => {
      const repo = createEmptyRepository();
      repo.revision = 5;
      repo.definitions['blk-1'] = {
        id: 'blk-1',
        kind: 'block',
        name: 'Block1',
        namespace: ['Root'],
        isAbstract: false,
        isLeaf: false,
        properties: [],
        ports: [],
        operations: [],
        constraints: [],
      };
      repo.requirements['req-1'] = {
        id: 'req-1',
        kind: 'requirement',
        name: 'Req1',
        namespace: ['Root'],
        requirementId: 'REQ-1',
        text: 'Must be fast',
        status: 'approved',
        version: '1.0',
        priority: 'high',
      };

      const state = createSysmlGatewayState(repo);
      const { options } = createMockStateHolder(state);
      const delegate = createSysmlDelegate(options);

      const snapshot = await delegate.inspect();
      expect(snapshot).toEqual({
        revision: 5,
        blockCount: 1,
        requirementCount: 1,
      });
    });
  });

  describe('executeCommand()', () => {
    it('rejects stale revisions and preserves the model unchanged', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      // Current revision is 0; command specifies revision 99
      const result = await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-stale', name: 'StaleBlock' },
        revision: 99,
      });

      expect(result.success).toBe(false);
      expect(result.newRevision).toBe(0);
      expect(result.changedElementIds).toEqual([]);
      expect(result.diagnostics[0]).toMatch(/stale revision/i);

      // Repository must be unchanged
      expect(getState().repository.definitions['blk-stale']).toBeUndefined();
      expect(getState().repository.revision).toBe(0);
    });

    it('creates a block via create_block action, advances revision, and updates state', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      const result = await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-100', name: 'PowerSubsystem' },
        revision: 0,
      });

      expect(result.success).toBe(true);
      expect(result.newRevision).toBe(1);
      expect(result.changedElementIds).toEqual(['blk-100']);

      const updated = getState();
      expect(updated.repository.revision).toBe(1);
      const block = updated.repository.definitions['blk-100'] as BlockDefinition;
      expect(block).toBeDefined();
      expect(block.name).toBe('PowerSubsystem');
      expect(block.kind).toBe('block');
      expect(options.onStateChange).toHaveBeenCalledTimes(1);
    });

    it('creates a requirement via create_requirement action and advances revision', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      const result = await delegate.executeCommand({
        kind: 'create_requirement',
        payload: {
          id: 'req-101',
          name: 'ThermalSafety',
          text: 'Surface temperature shall not exceed 60C',
          status: 'draft',
          priority: 'high',
        },
        revision: 0,
      });

      expect(result.success).toBe(true);
      expect(result.newRevision).toBe(1);
      expect(result.changedElementIds).toEqual(['req-101']);

      const updated = getState();
      const req = updated.repository.requirements['req-101'];
      expect(req).toBeDefined();
      expect(req.name).toBe('ThermalSafety');
      expect(req.text).toBe('Surface temperature shall not exceed 60C');
    });

    it('rejects relationship between missing endpoints and preserves model', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      const result = await delegate.executeCommand({
        kind: 'create_relationship',
        payload: {
          id: 'rel-bad',
          kind: 'satisfy',
          sourceId: 'missing-source',
          targetId: 'missing-target',
        },
        revision: 0,
      });

      expect(result.success).toBe(false);
      expect(result.newRevision).toBe(0);
      expect(result.changedElementIds).toEqual([]);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some(d => d.includes('MISSING_RELATIONSHIP_ENDPOINT'))).toBe(true);

      // Model unchanged
      expect(getState().repository.relationships['rel-bad']).toBeUndefined();
      expect(getState().repository.revision).toBe(0);
    });

    it('creates a valid relationship between existing elements', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      // Step 1: create block
      const r1 = await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-motor', name: 'Motor' },
        revision: 0,
      });
      expect(r1.success).toBe(true);

      // Step 2: create requirement
      const r2 = await delegate.executeCommand({
        kind: 'create_requirement',
        payload: { id: 'req-torque', name: 'TorqueReq', text: 'Min torque 2Nm' },
        revision: 1,
      });
      expect(r2.success).toBe(true);

      // Step 3: create satisfy relationship (block satisfies requirement)
      const r3 = await delegate.executeCommand({
        kind: 'create_relationship',
        payload: {
          id: 'rel-sat',
          kind: 'satisfy',
          sourceId: 'blk-motor',
          targetId: 'req-torque',
        },
        revision: 2,
      });

      expect(r3.success).toBe(true);
      expect(r3.newRevision).toBe(3);
      expect(getState().repository.relationships['rel-sat']).toBeDefined();
    });

    it('rejects duplicate element ID on creation and preserves model', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      // Create initial block
      const r1 = await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-unique', name: 'OriginalBlock' },
        revision: 0,
      });
      expect(r1.success).toBe(true);

      // Try creating another element with the same ID
      const r2 = await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-unique', name: 'DuplicateBlock' },
        revision: 1,
      });

      expect(r2.success).toBe(false);
      expect(r2.newRevision).toBe(1);
      expect(r2.diagnostics.some(d => d.includes('DUPLICATE_ELEMENT_ID') || d.includes('already in use'))).toBe(true);

      // Original block preserved
      const block = getState().repository.definitions['blk-unique'] as BlockDefinition;
      expect(block.name).toBe('OriginalBlock');
    });

    it('updates existing element via updateElement command', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-edit', name: 'InitialName' },
        revision: 0,
      });

      const updateRes = await delegate.executeCommand({
        kind: 'updateElement',
        payload: {
          elementId: 'blk-edit',
          patch: { name: 'UpdatedName' },
        },
        revision: 1,
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.newRevision).toBe(2);
      expect(getState().repository.definitions['blk-edit'].name).toBe('UpdatedName');
    });

    it('deletes element via deleteElements command', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      await delegate.executeCommand({
        kind: 'create_block',
        payload: { id: 'blk-del', name: 'ToDelete' },
        revision: 0,
      });

      const delRes = await delegate.executeCommand({
        kind: 'deleteElements',
        payload: {
          elementIds: ['blk-del'],
        },
        revision: 1,
      });

      expect(delRes.success).toBe(true);
      expect(delRes.newRevision).toBe(2);
      expect(getState().repository.definitions['blk-del']).toBeUndefined();
    });
  });

  describe('validate()', () => {
    it('returns valid: true for an empty or consistent repository', async () => {
      const { options } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);

      const validation = await delegate.validate();
      expect(validation.valid).toBe(true);
      expect(validation.diagnostics).toEqual([]);
    });

    it('returns valid: false when repository contains integrity errors', async () => {
      const repo = createEmptyRepository();
      // Add dangling relationship to repo manually
      repo.relationships['rel-orphan'] = {
        id: 'rel-orphan',
        kind: 'satisfy',
        sourceId: 'ghost-source',
        targetId: 'ghost-target',
      };
      const state = createSysmlGatewayState(repo);
      const { options } = createMockStateHolder(state);
      const delegate = createSysmlDelegate(options);

      const validation = await delegate.validate();
      expect(validation.valid).toBe(false);
      expect(validation.diagnostics.length).toBeGreaterThan(0);
    });
  });
});

describe('SysmlAdapter', () => {
  describe('when delegate is unavailable (fails closed)', () => {
    it('reports isAvailable() as false', () => {
      const adapter = new SysmlAdapter();
      expect(adapter.isAvailable()).toBe(false);
    });

    it('inspect fails closed with descriptive error', async () => {
      const adapter = new SysmlAdapter();
      const result = await adapter.inspect();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unavailable/i);
    });

    it('execute fails closed without mutating anything', async () => {
      const adapter = new SysmlAdapter();
      const result = await adapter.execute({
        id: 'act-1',
        kind: 'create_block',
        payload: { id: 'blk-never', name: 'Never' },
      });

      expect(result.success).toBe(false);
      expect(result.changedArtifacts).toEqual([]);
      expect(result.error).toMatch(/not connected/i);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('when delegate is connected', () => {
    it('inspect returns live workspace data', async () => {
      const { options } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);
      const adapter = new SysmlAdapter(delegate);

      expect(adapter.isAvailable()).toBe(true);

      const inspectResult = await adapter.inspect();
      expect(inspectResult.success).toBe(true);
      expect(inspectResult.data.workspace).toBe('sysml');
      expect(inspectResult.data.revision).toBe(0);
      expect(inspectResult.data.blockCount).toBe(0);
    });

    it('rejects stale action revision before dispatching to delegate', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);
      const adapter = new SysmlAdapter(delegate);

      const result = await adapter.execute({
        id: 'act-stale',
        kind: 'create_block',
        revision: 42, // current is 0
        payload: { id: 'blk-bad', name: 'Bad' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/stale revision/i);
      expect(getState().repository.revision).toBe(0);
    });

    it('executes valid action, produces ToolResult with evidence, and validates model', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);
      const adapter = new SysmlAdapter(delegate);

      const result = await adapter.execute({
        id: 'act-create',
        kind: 'create_block',
        revision: 0,
        payload: { id: 'blk-live', name: 'Heater' },
      });

      expect(result.success).toBe(true);
      expect(result.changedArtifacts).toEqual(['blk-live']);
      expect(result.evidence.newRevision).toBe(1);
      expect(result.evidence.changedElementIds).toEqual(['blk-live']);
      expect((result.evidence.validation as { valid: boolean }).valid).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(getState().repository.definitions['blk-live']).toBeDefined();
    });

    it('returns failure with diagnostics when command is rejected by gateway', async () => {
      const { options, getState } = createMockStateHolder();
      const delegate = createSysmlDelegate(options);
      const adapter = new SysmlAdapter(delegate);

      const result = await adapter.execute({
        id: 'act-invalid-rel',
        kind: 'create_relationship',
        revision: 0,
        payload: {
          id: 'rel-fail',
          kind: 'composition',
          sourceId: 'non-existent-source',
          targetId: 'non-existent-target',
        },
      });

      expect(result.success).toBe(false);
      expect(result.changedArtifacts).toEqual([]);
      expect(result.error).toMatch(/rejected/i);
      expect(getState().repository.revision).toBe(0);
    });
  });
});
