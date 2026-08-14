import { describe, expect, it } from 'vitest';
import {
  createProjectSnapshot,
  createUnifiedProjectPayload,
  hasUnsavedProjectChanges,
} from './adiaProjectPersistence';

describe('ADIA unified project persistence', () => {
  it('creates the unified envelope without dropping module fields', () => {
    const payload = createUnifiedProjectPayload(
      { version: '1.0', projectName: 'Pump', states: [], globalXBridgesNodes: [] },
      () => new Date('2026-08-14T12:00:00.000Z')
    );
    expect(payload).toMatchObject({
      version: '1.0',
      timestamp: '2026-08-14T12:00:00.000Z',
      projectName: 'Pump',
      states: [],
      globalXBridgesNodes: [],
    });
  });

  it('ignores timestamp changes but detects model changes', () => {
    const first = { version: '1.0', timestamp: 'one', states: [] };
    const clean = createProjectSnapshot(first);
    expect(hasUnsavedProjectChanges({ ...first, timestamp: 'two' }, clean)).toBe(false);
    expect(hasUnsavedProjectChanges({ ...first, states: [{ id: 's1' }] }, clean)).toBe(true);
  });
});
