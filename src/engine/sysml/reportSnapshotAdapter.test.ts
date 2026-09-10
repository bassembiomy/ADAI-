import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from './model';
import { buildCanonicalTraceabilitySnapshot } from './reportSnapshotAdapter';

describe('canonical report snapshot', () => {
  it('provides a stable revision, hash, index, and diagnostics', () => {
    const repo = createEmptyRepository();
    const snapshot = buildCanonicalTraceabilitySnapshot(repo);
    expect(snapshot.repositoryRevision).toBe(repo.revision);
    expect(snapshot.modelHash).toMatch(/^[0-9a-f]+$/);
    expect(snapshot.index.elementsById.size).toBe(0);
    expect(snapshot.diagnostics).toEqual([]);
  });
});
