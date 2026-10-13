import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import {
  closeDiagramWorkspaceTab,
  ensureDefaultStateMachineWorkspaceFile,
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

  it('retains BDD-A and BDD-B as different persisted tabs', () => {
    const tabs = openDiagramWorkspaceTab(
      openDiagramWorkspaceTab([], { kind: 'sysmlDiagram', diagramId: 'bdd-a' }),
      { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
    );
    expect(tabs).toEqual([
      { kind: 'sysmlDiagram', diagramId: 'bdd-a' },
      { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
    ]);
  });

  it('restores BDD-A and BDD-B as distinct persisted tabs with the saved active tab', () => {
    const base = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const repository = {
      ...base,
      diagrams: {
        ...base.diagrams,
        'bdd-a': {
          id: 'bdd-a',
          kind: 'diagram',
          name: 'BDD-A',
          namespace: ['model'],
          ownerId: 'model',
          diagramKind: 'bdd',
        },
        'bdd-b': {
          id: 'bdd-b',
          kind: 'diagram',
          name: 'BDD-B',
          namespace: ['model'],
          ownerId: 'model',
          diagramKind: 'bdd',
        },
      },
    } as typeof base;
    const persisted = openDiagramWorkspaceTab(
      openDiagramWorkspaceTab([], { kind: 'sysmlDiagram', diagramId: 'bdd-a' }),
      { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
    );
    const result = normalizeDiagramWorkspace(
      repository,
      persisted,
      { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
    );
    expect(result.tabs).toEqual(persisted);
    expect(result.activeTab).toEqual({ kind: 'sysmlDiagram', diagramId: 'bdd-b' });
    expect(result.diagnostics).toEqual([]);
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

  it('restores a persisted valid active tab instead of defaulting to the first tab', () => {
    const repository = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const result = normalizeDiagramWorkspace(
      repository,
      ['adia-default-bdd', 'adia-default-requirements'],
      'adia-default-requirements',
    );
    expect(result.activeTab).toEqual({ kind: 'sysmlDiagram', diagramId: 'adia-default-requirements' });
    expect(result.diagnostics).toEqual([]);
  });

  it('selects the right neighbor after a middle close and the preceding neighbor after a final close', () => {
    const tabs = [
      { kind: 'stateMachineDiagram', diagramId: 'state-machine', contextRegionId: 'root' },
      { kind: 'sysmlDiagram', diagramId: 'adia-default-requirements' },
      { kind: 'sysmlDiagram', diagramId: 'adia-default-bdd' },
    ] as const;

    const afterMiddleClose = closeDiagramWorkspaceTab(tabs, tabs[1], 'adia-default-requirements');
    expect(afterMiddleClose.tabs).toEqual([tabs[0], tabs[2]]);
    expect(afterMiddleClose.activeTab).toEqual(tabs[2]);

    const afterFinalClose = closeDiagramWorkspaceTab(tabs, tabs[2], 'adia-default-bdd');
    expect(afterFinalClose.tabs).toEqual([tabs[0], tabs[1]]);
    expect(afterFinalClose.activeTab).toEqual(tabs[1]);
  });

  it('recreates the required State Machine file when an imported workspace omits it', () => {
    const files = [{ id: 'imported-xbridges', type: 'xbridges', name: 'Imported X-Bridges', data: {} }];
    const fallback = { id: 'default_sm', type: 'statemachine', name: 'Main State Machine', data: { states: [] } };

    const result = ensureDefaultStateMachineWorkspaceFile(files, () => fallback);

    expect(result.file).toEqual(fallback);
    expect(result.files).toEqual([...files, fallback]);
    expect(files).toHaveLength(1);
  });

  it('keeps an existing State Machine file instead of recreating it', () => {
    const fallback = { id: 'default_sm', type: 'statemachine', name: 'Main State Machine', data: { states: ['saved'] } };
    const files = [fallback];
    const result = ensureDefaultStateMachineWorkspaceFile(files, () => {
      throw new Error('existing file must be preserved');
    });

    expect(result.file).toBe(fallback);
    expect(result.files).toBe(files);
  });

  it('falls back to the default BDD tab with a diagnostic when the persisted active tab is stale', () => {
    const repository = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const result = normalizeDiagramWorkspace(repository, ['adia-default-bdd'], 'stale-diagram-id');
    expect(result.activeTab).toEqual({ kind: 'sysmlDiagram', diagramId: 'adia-default-bdd' });
    expect(result.diagnostics.map(d => d.code)).toContain('STALE_DIAGRAM_TAB');
    expect(result.diagnostics.map(d => d.tabId)).toContain('stale-diagram-id');
  });

  it('resolves legacy package and rtm labels to seeded diagrams', () => {
    const base = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const repository = {
      ...base,
      diagrams: {
        ...base.diagrams,
        'pkg-diag': {
          id: 'pkg-diag',
          kind: 'diagram',
          name: 'Package Diagram',
          namespace: ['model'],
          ownerId: 'model',
          diagramKind: 'package',
        },
        'rtm-diag': {
          id: 'rtm-diag',
          kind: 'diagram',
          name: 'RTM Diagram',
          namespace: ['model'],
          ownerId: 'model',
          diagramKind: 'rtm',
        },
      },
    } as typeof base;
    const result = normalizeDiagramWorkspace(repository, ['package', 'rtm']);
    expect(result.tabs).toEqual([
      { kind: 'sysmlDiagram', diagramId: 'pkg-diag' },
      { kind: 'sysmlDiagram', diagramId: 'rtm-diag' },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('prefers an exact diagram ID over a legacy label collision', () => {
    const base = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    const repository = {
      ...base,
      diagrams: {
        ...base.diagrams,
        package: {
          id: 'package',
          kind: 'diagram',
          name: 'Literal Package ID',
          namespace: ['model'],
          ownerId: 'model',
          diagramKind: 'bdd',
        },
        'pkg-real': {
          id: 'pkg-real',
          kind: 'diagram',
          name: 'Real Package Diagram',
          namespace: ['model'],
          ownerId: 'model',
          diagramKind: 'package',
        },
      },
    } as typeof base;
    const result = normalizeDiagramWorkspace(repository, ['package']);
    expect(result.tabs).toEqual([{ kind: 'sysmlDiagram', diagramId: 'package' }]);
    expect(result.diagnostics).toEqual([]);
  });

  it('returns the same repository reference without mutating input when defaults already exist', () => {
    const first = ensureDefaultSysmlDiagrams(createEmptyRepository());
    const snapshot = JSON.parse(JSON.stringify(first.repository));
    const second = ensureDefaultSysmlDiagrams(first.repository);
    expect(second.repository).toBe(first.repository);
    expect(second.createdDiagramIds).toEqual([]);
    expect(first.repository).toEqual(snapshot);
  });
});
