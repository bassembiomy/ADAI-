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
      getPresentedIds: (id) => presentations[id]?.elementIds ?? [],
    });

    const diagram = registry.create({ ownerId: 'block-1', diagramKind: 'ibd', name: 'Power IBD' });
    expect(diagram.id).toBe('diag-1');
    expect(registry.listForOwner('block-1')).toContainEqual(expect.objectContaining({ id: 'diag-1', name: 'Power IBD' }));
    expect(registry.presentedElementIds('diag-1')).toEqual([]);
  });
});
