import { describe, expect, it, vi } from 'vitest';
import { createModelDiagramRegistry } from './modelDiagramRegistry';
import type { ModelExplorerAdapter } from './modelExplorerTypes';

describe('modelDiagramRegistry', () => {
  it('creates and opens an empty owned diagram without creating symbols', () => {
    let diagrams: Record<string, any> = {};
    let presentations: Record<string, { elementIds: string[] }> = {};

    const adapter: ModelExplorerAdapter = {
      domain: 'sysml',
      getRevision: () => 1,
      project: vi.fn(),
      capabilities: vi.fn(),
      preflight: vi.fn().mockReturnValue({ committed: false, revision: 1, diagnostics: [] }),
      execute: vi.fn().mockImplementation((cmd: any) => {
        if (cmd.type === 'createDiagram') {
          const diag = {
            id: 'diag-1',
            name: cmd.name ?? 'Power IBD',
            diagramKind: cmd.diagramKind,
            ownerId: cmd.ownerId,
          };
          diagrams[diag.id] = diag;
          presentations[diag.id] = { elementIds: [] };
          return { committed: true, revision: 2, diagnostics: [], selectedIds: [diag.id] };
        }
        return { committed: false, revision: 1, diagnostics: [] };
      }),
      relationshipTargets: vi.fn(),
    };

    const registry = createModelDiagramRegistry({
      adapter,
      listDiagrams: () => Object.values(diagrams),
      getPresentedIds: (id: string) => presentations[id]?.elementIds ?? [],
    });

    const diagram = registry.create({ ownerId: 'block-1', diagramKind: 'ibd', name: 'Power IBD', contextElementId: 'block-1' });
    expect(diagram.id).toBe('diag-1');
    expect(registry.listForOwner('block-1')).toContainEqual(expect.objectContaining({ id: 'diag-1', name: 'Power IBD' }));
    expect(registry.presentedElementIds('diag-1')).toEqual([]);
    expect(adapter.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'createDiagram',
      ownerId: 'block-1',
      diagramKind: 'ibd',
      contextElementId: 'block-1',
    }));
  });

  it('does not fabricate a diagram ID when semantic creation fails', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml', getRevision: () => 1, project: vi.fn(), capabilities: vi.fn(),
      preflight: vi.fn(), execute: vi.fn().mockReturnValue({
        committed: false, revision: 1, diagnostics: [{ code: 'OWNER_NOT_FOUND', severity: 'error', message: 'Owner missing' }],
      }), relationshipTargets: vi.fn(),
    };
    const registry = createModelDiagramRegistry({ adapter });
    expect(() => registry.create({ ownerId: 'missing', diagramKind: 'package' })).toThrow('Owner missing');
    expect(registry.listForOwner('missing')).toEqual([]);
  });

  it('delegates package activation resolution to resolvePackageDiagramActivation', () => {
    const adapter: ModelExplorerAdapter = {
      domain: 'sysml', getRevision: () => 1, project: vi.fn(), capabilities: vi.fn(),
      preflight: vi.fn(), execute: vi.fn(), relationshipTargets: vi.fn(),
    };
    let diagrams: any[] = [];
    const registry = createModelDiagramRegistry({
      adapter,
      listDiagrams: () => diagrams,
    });

    expect(registry.resolvePackageActivation()).toEqual({ status: 'create', ownerId: 'model' });

    diagrams = [{ id: 'pkg-1', name: 'Main Packages', diagramKind: 'package', ownerId: 'model' }];
    expect(registry.resolvePackageActivation()).toEqual({ status: 'open', diagramId: 'pkg-1' });

    diagrams = [
      { id: 'pkg-1', name: 'Packages Alpha', diagramKind: 'package', ownerId: 'model' },
      { id: 'pkg-2', name: 'Packages Beta', diagramKind: 'package', ownerId: 'model' },
    ];
    expect(registry.resolvePackageActivation('pkg-2')).toEqual({ status: 'open', diagramId: 'pkg-2' });
    expect(registry.resolvePackageActivation(null)).toEqual({ status: 'choose', diagramIds: ['pkg-1', 'pkg-2'] });
  });
});
