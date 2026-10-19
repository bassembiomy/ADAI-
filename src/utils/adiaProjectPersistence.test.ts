import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { serializeSysmlProjectState } from '../engine/sysml/persistence';
import { createEmptyRepository, type PackageDefinition } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, loadCanonicalSysmlProject } from '../services/sysmlCommandGateway';
import {
  createProjectSnapshot,
  createUnifiedProjectPayload,
  hasUnsavedProjectChanges,
  shouldConfirmProjectReplacement,
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

  it('determines project replacement confirmation correctly', () => {
    const current = { version: '1.0', timestamp: 't1', states: [] };
    const clean = createProjectSnapshot(current);

    expect(shouldConfirmProjectReplacement(current, clean)).toBe(false);
    expect(shouldConfirmProjectReplacement({ ...current, states: [{ id: 's1' }] }, clean)).toBe(true);
    expect(shouldConfirmProjectReplacement(current, null)).toBe(false);
  });

  it('preserves diagramPresentations membership and tracks unsaved changes', () => {
    const payload = createUnifiedProjectPayload(
      {
        version: '1.0',
        projectName: 'SysML Project',
        diagramPresentations: {
          'req-diagram': { elementIds: ['req-1', 'req-2'] },
        },
      },
      () => new Date('2026-09-09T12:00:00.000Z')
    );
    expect(payload).toMatchObject({
      version: '1.0',
      projectName: 'SysML Project',
      diagramPresentations: {
        'req-diagram': { elementIds: ['req-1', 'req-2'] },
      },
    });

    const clean = createProjectSnapshot(payload);
    const modified = {
      ...payload,
      diagramPresentations: {
        'req-diagram': { elementIds: ['req-2'] },
      },
    };
    expect(hasUnsavedProjectChanges(modified, clean)).toBe(true);
  });

  it('keeps diagram presentations through a unified-module export and reopen', () => {
    const pkg: PackageDefinition = { id: 'pkg-a', kind: 'package', name: 'A', namespace: ['model'], ownerId: 'model' };
    let state = createSysmlGatewayState(createEmptyRepository());
    state = { ...state, ...executeSysmlCommand(state, { type: 'createAndPresent', element: pkg, diagramId: 'bdd', presentation: { x: 20, y: 30, width: 220, height: 140 } }) };
    const saved = serializeSysmlProjectState(state.repository, state.diagramPresentations, state.coordinates);
    const file = createUnifiedProjectPayload({ version: '1.0', projectName: 'P', ...saved });
    const reopened = loadCanonicalSysmlProject({ ...file, sysmlRepository: file.sysmlRepository });
    expect(state.diagramPresentations!.bdd.elementIds).toContain('pkg-a');
    expect(reopened.diagramPresentations.bdd.elementIds).toEqual(state.diagramPresentations!.bdd.elementIds);
  });

  it('builds the unified module file with the main Save payload builder, not the raw repository', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    const start = source.indexOf("projectFiles['adia_project_unified.adia']");
    const block = source.slice(start, start + 600);
    expect(block).toContain('buildPayload()');
    expect(block).not.toContain('canonicalSysmlRepository');
  });
});
