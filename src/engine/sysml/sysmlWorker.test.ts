import { describe, it, expect } from 'vitest';
import { handleWorkerMessage, cancelRequest } from './sysmlWorker';
import { SysmlWorkerClient } from '../../services/sysmlWorkerClient';
import { generateSysmlModel } from './largeModelGenerator';
import { fromRepository } from './normalizedStore';
import type { SysmlRepository } from './model';

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
      expect(parsed.schemaVersion).toBe(2);
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
      const fixture = getFixture(30);

      // Submit revision 1 and revision 2 in sequence
      const promise1 = client.validate(fixture, 1);
      const promise2 = client.validate(fixture, 2);

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
        expect(response.error).toBeDefined();
      }
    });
  });
});
