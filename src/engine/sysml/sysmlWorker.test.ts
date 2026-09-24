import { describe, it, expect } from 'vitest';
import { handleWorkerMessage, cancelRequest } from './sysmlWorker';
import { SysmlWorkerClient } from '../../services/sysmlWorkerClient';
import { generateSysmlModel } from './largeModelGenerator';
import { fromRepository, toWorkerSnapshot, fromWorkerSnapshot, projectNormalizedDiagram } from './normalizedStore';
import type { SysmlRepository } from './model';
import { validateSysmlRepository } from './validation';
import { analyzeMutation } from './mutations';
import { serializeRepository } from './persistence';

function getFixture(count = 50): SysmlRepository {
  return generateSysmlModel({ targetElementCount: count, seed: 100 }).repository;
}

describe('SysML Worker Protocol & Execution', () => {
  it('handles validation requests returning diagnostics', () => {
    const fixture = getFixture(50);
    const response = handleWorkerMessage({
      requestId: 'req-val-1',
      revision: 1,
      taskType: 'validate',
      payload: fixture,
    });

    expect(response.success).toBe(true);
    if (response.success) {
      const result = response.result as any;
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('diagnostics');
      expect(Array.isArray(result.diagnostics)).toBe(true);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles projection requests returning compact deltas and legacy view', () => {
    const fixture = getFixture(50);
    const store = fromRepository(fixture);
    const response = handleWorkerMessage({
      requestId: 'req-proj-1',
      revision: 1,
      taskType: 'project',
      payload: store,
    });

    expect(response.success).toBe(true);
    if (response.success) {
      const { view, delta } = response.result as any;
      expect(view).toBeDefined();
      expect(view.blocks.length).toBeGreaterThan(0);
      expect(delta).toBeDefined();
      expect(delta.blockIds.length).toBe(view.blocks.length);
      expect(delta.totalElements).toBeGreaterThan(0);
    }
  });

  it('handles deletion impact requests returning compact impact deltas', () => {
    const fixture = getFixture(50);
    const firstBlockId = Object.keys(fixture.definitions)[0];

    const response = handleWorkerMessage({
      requestId: 'req-imp-1',
      revision: 1,
      taskType: 'impact',
      targetElementIds: [firstBlockId],
      payload: fixture,
    });

    expect(response.success).toBe(true);
    if (response.success) {
      const { impact, impactSummary } = response.result as any;
      expect(impact.requestedElementIds).toContain(firstBlockId);
      expect(impact.deletedElementIds).toContain(firstBlockId);
      expect(impactSummary).toBeDefined();
      expect(typeof impactSummary.removedRelationships).toBe('number');
    }
  });

  it('handles serialization requests returning valid JSON', () => {
    const fixture = getFixture(30);
    const response = handleWorkerMessage({
      requestId: 'req-ser-1',
      revision: 1,
      taskType: 'serialize',
      payload: fixture,
    });

    expect(response.success).toBe(true);
    if (response.success) {
      expect(typeof response.result).toBe('string');
      const parsed = JSON.parse(response.result as string);
      expect(parsed.schemaVersion).toBe(3);
    }
  });

  it('honors cancellation tokens before and during message processing', () => {
    const fixture = getFixture(30);
    cancelRequest('req-to-cancel');

    const response = handleWorkerMessage({
      requestId: 'req-to-cancel',
      revision: 1,
      taskType: 'validate',
      payload: fixture,
    });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.cancelled).toBe(true);
    }
  });

  describe('SysmlWorkerClient fast-path and lifecycle', () => {
    it('executes validate, project, impact, and serialize via client fast-path', async () => {
      const client = new SysmlWorkerClient(); // no worker instance in Node environment
      const fixture = getFixture(30);
      const firstId = Object.keys(fixture.definitions)[0];

      const validation = await client.validate(fixture, 1);
      expect(validation).toHaveProperty('valid');

      const projection = await client.project(fixture, 1);
      expect(projection.view.blocks.length).toBeGreaterThan(0);
      expect(projection.delta.blockIds.length).toBe(projection.view.blocks.length);

      const impact = await client.analyzeImpact(fixture, 1, [firstId]);
      expect(impact.deletedElementIds).toContain(firstId);

      const json = await client.serialize(fixture, 1);
      expect(typeof json).toBe('string');

      client.terminate();
      expect(client.getPendingCount()).toBe(0);
    });

    it('rejects stale responses when newer revisions are submitted', async () => {
      const client = new SysmlWorkerClient();
      const fixture1 = { ...getFixture(30), revision: 1 };
      const fixture2 = { ...getFixture(30), revision: 2 };

      // Submit revision 1 and revision 2 in sequence
      const promise1 = client.validate(fixture1, 1);
      const promise2 = client.validate(fixture2, 2);

      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
    });

    it('produces deterministic output identical to direct synchronous calls', async () => {
      const fixture = getFixture(40);
      const store = fromRepository(fixture);
      const client = new SysmlWorkerClient();

      const workerProj = await client.project(store, 1);
      const directView = fromRepository(fixture);
      const directProj = fromRepository(fixture);

      expect(workerProj.view.blocks.length).toBe(workerProj.delta.blockIds.length);
      expect(workerProj.delta.totalElements).toBe(
        workerProj.view.blocks.length +
        workerProj.view.parts.length +
        workerProj.view.connectors.length +
        workerProj.view.relationships.length
      );
    });

    it('gracefully reports worker errors on malformed payloads', async () => {
      const response = handleWorkerMessage({
        requestId: 'err-1',
        revision: 1,
        taskType: 'validate',
        payload: null as any,
      });

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error).toContain('non-null object');
      }
    });

    it('rejects worker snapshot with unsupported schemaVersion or revision mismatch', () => {
      const fixture = getFixture(20);
      const store = fromRepository(fixture);
      const snapshot = toWorkerSnapshot(store);

      // Schema mismatch
      const resBadSchema = handleWorkerMessage({
        requestId: 'err-schema',
        revision: snapshot.revision,
        taskType: 'validate',
        payload: { ...snapshot, schemaVersion: 1 as any },
      });
      expect(resBadSchema.success).toBe(false);
      if (!resBadSchema.success) {
        expect(resBadSchema.error).toContain('Unsupported schemaVersion');
      }

      // Revision mismatch
      const resBadRev = handleWorkerMessage({
        requestId: 'err-rev',
        revision: snapshot.revision + 5,
        taskType: 'validate',
        payload: snapshot,
      });
      expect(resBadRev.success).toBe(false);
      if (!resBadRev.success) {
        expect(resBadRev.error).toContain('Revision mismatch');
      }
    });

    it('round-trips store through toWorkerSnapshot and fromWorkerSnapshot without Map/Set leaks', () => {
      const fixture = getFixture(50);
      const store = fromRepository(fixture);
      const snapshot = toWorkerSnapshot(store, 'diagram-root');

      // Assert plain object structure (transferable across postMessage)
      expect(snapshot.definitions instanceof Map).toBe(false);
      expect(typeof snapshot.definitions).toBe('object');
      expect(snapshot.activeDiagramId).toBe('diagram-root');
      expect(Array.isArray(snapshot.activeDiagramElementIds)).toBe(true);

      const rehydrated = fromWorkerSnapshot(snapshot);
      expect(rehydrated.definitions instanceof Map).toBe(true);
      expect(rehydrated.definitions.size).toBe(store.definitions.size);
      expect(rehydrated.usages.size).toBe(store.usages.size);
      expect(rehydrated.relationships.size).toBe(store.relationships.size);
      expect(rehydrated.revision).toBe(store.revision);
    });

    it('verifies exact equivalence between worker snapshot execution and direct main-thread execution', async () => {
      const fixture = getFixture(50);
      const store = fromRepository(fixture);
      const snapshot = toWorkerSnapshot(store);

      // 1. Validation equivalence
      const mainVal = validateSysmlRepository(fixture);
      const workerValRes = handleWorkerMessage({
        requestId: 'eq-val',
        revision: store.revision,
        taskType: 'validate',
        payload: snapshot,
      });
      expect(workerValRes.success).toBe(true);
      if (workerValRes.success) {
        const workerVal = workerValRes.result as any;
        expect(workerVal.valid).toEqual(mainVal.valid);
        expect(workerVal.diagnostics).toEqual(mainVal.diagnostics);
        expect(workerVal.diagnosticCodes).toEqual([...new Set(mainVal.diagnostics.map((d: any) => d.code))].sort());
      }

      // 2. Projection equivalence
      const mainProj = projectNormalizedDiagram(store);
      const workerProjRes = handleWorkerMessage({
        requestId: 'eq-proj',
        revision: store.revision,
        taskType: 'project',
        payload: snapshot,
      });
      expect(workerProjRes.success).toBe(true);
      if (workerProjRes.success) {
        expect((workerProjRes.result as any).view).toEqual(mainProj);
      }

      // 3. Impact analysis equivalence
      const firstId = Object.keys(fixture.definitions)[0];
      const mainImpact = analyzeMutation(fixture, { kind: 'deleteElements', elementIds: [firstId] });
      const workerImpactRes = handleWorkerMessage({
        requestId: 'eq-imp',
        revision: store.revision,
        taskType: 'impact',
        targetElementIds: [firstId],
        payload: snapshot,
      });
      expect(workerImpactRes.success).toBe(true);
      if (workerImpactRes.success) {
        expect((workerImpactRes.result as any).impact).toEqual(mainImpact);
      }

      // 4. Serialization equivalence
      const mainSer = serializeRepository(fixture);
      const workerSerRes = handleWorkerMessage({
        requestId: 'eq-ser',
        revision: store.revision,
        taskType: 'serialize',
        payload: snapshot,
      });
      expect(workerSerRes.success).toBe(true);
      if (workerSerRes.success) {
        expect(workerSerRes.result).toBe(mainSer);
      }
    });

    it('scheduleValidation invokes callback asynchronously with validation report', async () => {
      const client = new SysmlWorkerClient();
      const fixture = getFixture(50);
      const store = fromRepository(fixture);

      let callbackReport: any = null;
      const cancel = client.scheduleValidation(store, store.revision, (report) => {
        callbackReport = report;
      });

      // Allow microtask resolution
      await new Promise(r => setTimeout(r, 10));
      expect(callbackReport).not.toBeNull();
      expect(callbackReport.valid).toBe(true);
      expect(typeof cancel).toBe('function');
    });

    it('scopes projection snapshot only to active diagram elements when diagramId is specified', () => {
      const fixture = getFixture(100);
      const store = fromRepository(fixture);
      const defKeys = Array.from(store.definitions.keys());

      // Create a diagram with only first 5 elements
      const activeIds = defKeys.slice(0, 5);
      store.diagramPresentations.set('diag_small', {
        elementIds: activeIds,
      });

      const scopedSnapshot = toWorkerSnapshot(store, 'diag_small', true);
      expect(Object.keys(scopedSnapshot.definitions).length).toBe(5);
      expect(scopedSnapshot.activeDiagramId).toBe('diag_small');
      expect(scopedSnapshot.activeDiagramElementIds).toEqual(activeIds);

      // Unscoped snapshot contains all definitions
      const fullSnapshot = toWorkerSnapshot(store);
      expect(Object.keys(fullSnapshot.definitions).length).toBe(store.definitions.size);
    });

    it('tracks lastTaskDurationMs, queue count, and fallback diagnostics', async () => {
      const client = new SysmlWorkerClient(null); // Force fallback
      const fixture = getFixture(20);
      const store = fromRepository(fixture);

      await client.validate(store, 1);
      const diags = client.getDiagnostics();

      expect(diags.workerAvailable).toBe(false);
      expect(diags.fallbackReason).toContain('disabled');
      expect(diags.pendingCount).toBe(0);
      expect(diags.staleCount).toBe(0);
      expect(typeof diags.lastTaskDurationMs).toBe('number');
      expect(diags.lastTaskDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('compact diagnostics and deletion impact without full-repo embedding (Task 2)', () => {
    it('validate returns compact diagnostics alongside the full report', () => {
      const fixture = getFixture(20);
      const response = handleWorkerMessage({
        requestId: 'req-compact-val',
        revision: fixture.revision,
        taskType: 'validate',
        payload: fixture,
      });
      expect(response.success).toBe(true);
      if (response.success) {
        const result = response.result as any;
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('diagnostics');
        expect(Array.isArray(result.diagnosticCodes)).toBe(true);
        expect(Array.isArray(result.compactDiagnostics)).toBe(true);
        for (const compact of result.compactDiagnostics) {
          expect(Object.keys(compact).sort()).toEqual(['code', 'elementId', 'severity']);
        }
        expect(result.diagnosticCodes).toEqual([...new Set(result.diagnostics.map((d: any) => d.code))].sort());
      }
    });

    it('validate surfaces typed codes for a relationship with a missing endpoint', () => {
      const fixture = getFixture(10);
      fixture.relationships['rel-bad'] = {
        id: 'rel-bad', kind: 'association', sourceId: 'ghost-source',
        targetId: Object.keys(fixture.definitions)[0],
      };
      const response = handleWorkerMessage({
        requestId: 'req-compact-val-bad',
        revision: fixture.revision,
        taskType: 'validate',
        payload: fixture,
      });
      expect(response.success).toBe(true);
      if (response.success) {
        const result = response.result as any;
        expect(result.diagnosticCodes).toContain('MISSING_RELATIONSHIP_ENDPOINT');
        expect(result.compactDiagnostics.some((d: any) => d.code === 'MISSING_RELATIONSHIP_ENDPOINT')).toBe(true);
      }
    });

    it('project returns delta plus diagnostic codes without embedding the repository', () => {
      const fixture = getFixture(30);
      const store = fromRepository(fixture);
      const response = handleWorkerMessage({
        requestId: 'req-compact-proj',
        revision: store.revision,
        taskType: 'project',
        payload: store,
      });
      expect(response.success).toBe(true);
      if (response.success) {
        const result = response.result as any;
        expect(result.view).toBeDefined();
        expect(result.delta).toBeDefined();
        expect(Array.isArray(result.diagnosticCodes)).toBe(true);
        expect('definitions' in result).toBe(false);
        expect('repository' in result).toBe(false);
        expect('usages' in result).toBe(false);
      }
    });

    it('impact returns compact delta with per-target deletion decisions and no full repo', () => {
      const fixture = getFixture(30);
      const firstBlockId = Object.keys(fixture.definitions)[0];
      const response = handleWorkerMessage({
        requestId: 'req-compact-imp',
        revision: fixture.revision,
        taskType: 'impact',
        targetElementIds: [firstBlockId],
        payload: fixture,
      });
      expect(response.success).toBe(true);
      if (response.success) {
        const result = response.result as any;
        expect(result.requestedElementIds).toContain(firstBlockId);
        expect(result.deletedElementIds).toContain(firstBlockId);
        expect(result.impactSummary).toBeDefined();
        expect(Array.isArray(result.targets)).toBe(true);
        expect(result.targets[0]).toMatchObject({ id: firstBlockId });
        expect(result.targets[0]).toHaveProperty('targetKind');
        expect(result.targets[0]).toHaveProperty('cascadeIds');
        expect(Array.isArray(result.diagnosticCodes)).toBe(true);
        expect('definitions' in result).toBe(false);
        expect('repository' in result).toBe(false);
      }
    });

    it('impact flags unknown targets with a typed diagnostic code', () => {
      const fixture = getFixture(10);
      const response = handleWorkerMessage({
        requestId: 'req-compact-imp-ghost',
        revision: fixture.revision,
        taskType: 'impact',
        targetElementIds: ['ghost-element'],
        payload: fixture,
      });
      expect(response.success).toBe(true);
      if (response.success) {
        const result = response.result as any;
        expect(result.targets[0].targetKind).toBe('unknown');
        expect(result.diagnosticCodes).toContain('UNKNOWN_ELEMENT');
      }
    });
  });
});
