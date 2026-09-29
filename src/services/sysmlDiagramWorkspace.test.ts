import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import {
  ensureDefaultSysmlDiagrams,
  normalizeDiagramWorkspace,
  openDiagramWorkspaceTab,
} from './sysmlDiagramWorkspace';

describe('sysmlDiagramWorkspace', () => {
  it('creates only missing defaults and remains idempotent', () => {
    const first = ensureDefaultSysmlDiagrams(createEmptyRepository());
    expect(Object.values(first.repository.diagrams).map(d => [d.name, d.diagramKind])).toEqual(expect.arrayContaining([
      ['Main SysML BDD', 'bdd'],
      ['Main Requirements Diagram', 'requirements'],
    ]));
    expect(ensureDefaultSysmlDiagrams(first.repository).createdDiagramIds).toEqual([]);
  });

  it('migrates mode tabs to exact IDs and drops stale duplicates', () => {
    const repository = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const result = normalizeDiagramWorkspace(repository, ['bdd', 'requirements', 'bdd', 'missing']);
    expect(result.tabs).toEqual([
      { kind: 'sysmlDiagram', diagramId: 'adia-default-bdd' },
      { kind: 'sysmlDiagram', diagramId: 'adia-default-requirements' },
    ]);
    expect(result.diagnostics.map(d => d.code)).toContain('STALE_DIAGRAM_TAB');
  });

  it('does not create a default when an equivalent user diagram already exists', () => {
    const repository = createEmptyRepository();
    repository.diagrams['user-bdd'] = {
      id: 'user-bdd',
      kind: 'diagram',
      name: 'User BDD',
      namespace: ['model'],
      ownerId: 'model',
      diagramKind: 'bdd',
    };
    const result = ensureDefaultSysmlDiagrams(repository);
    expect(result.createdDiagramIds).not.toContain('adia-default-bdd');
    expect(result.createdDiagramIds).toContain('adia-default-requirements');
    expect(ensureDefaultSysmlDiagrams(result.repository).createdDiagramIds).toEqual([]);
  });

  it('opens exact diagram tabs without duplicating the same diagram', () => {
    const tabs = openDiagramWorkspaceTab(
      openDiagramWorkspaceTab([], { kind: 'sysmlDiagram', diagramId: 'bdd-a' }),
      { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
    );
    expect(tabs).toEqual([
      { kind: 'sysmlDiagram', diagramId: 'bdd-a' },
      { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
    ]);
    expect(
      openDiagramWorkspaceTab(tabs, { kind: 'sysmlDiagram', diagramId: 'bdd-a' }),
    ).toEqual(tabs);
  });

  it('falls back to the default BDD active tab when every entry is stale', () => {
    const repository = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const result = normalizeDiagramWorkspace(repository, ['missing']);
    expect(result.tabs).toEqual([{ kind: 'sysmlDiagram', diagramId: 'adia-default-bdd' }]);
    expect(result.activeTab).toEqual({ kind: 'sysmlDiagram', diagramId: 'adia-default-bdd' });
    expect(result.diagnostics.map(d => d.code)).toContain('STALE_DIAGRAM_TAB');
  });
});
