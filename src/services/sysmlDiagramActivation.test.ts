import { describe, expect, it } from 'vitest';
import { resolvePackageDiagramActivation } from './sysmlDiagramActivation';
import { createEmptyRepository } from '../engine/sysml/model';

describe('resolvePackageDiagramActivation', () => {
  it('returns create status for model when zero package diagrams exist', () => {
    const repo = createEmptyRepository();
    const result = resolvePackageDiagramActivation(repo);
    expect(result).toEqual({ status: 'create', ownerId: 'model' });
  });

  it('returns open status with exact diagram ID when exactly one package diagram exists', () => {
    const repo = createEmptyRepository();
    repo.diagrams['pkg-diag-1'] = {
      id: 'pkg-diag-1',
      kind: 'diagram',
      name: 'System Architecture',
      namespace: ['model'],
      diagramKind: 'package',
      ownerId: 'model',
    };
    const result = resolvePackageDiagramActivation(repo);
    expect(result).toEqual({ status: 'open', diagramId: 'pkg-diag-1' });
  });

  it('returns open status with valid last-active diagram ID among multiple candidates', () => {
    const repo = createEmptyRepository();
    repo.diagrams['pkg-diag-1'] = { id: 'pkg-diag-1', kind: 'diagram', name: 'Alpha', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };
    repo.diagrams['pkg-diag-2'] = { id: 'pkg-diag-2', kind: 'diagram', name: 'Beta', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };

    const result = resolvePackageDiagramActivation(repo, 'pkg-diag-2');
    expect(result).toEqual({ status: 'open', diagramId: 'pkg-diag-2' });
  });

  it('returns choose status with sorted candidate IDs when multiple package diagrams exist without last-active', () => {
    const repo = createEmptyRepository();
    repo.diagrams['pkg-diag-z'] = { id: 'pkg-diag-z', kind: 'diagram', name: 'Zeta Packages', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };
    repo.diagrams['pkg-diag-a'] = { id: 'pkg-diag-a', kind: 'diagram', name: 'Alpha Packages', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };
    repo.diagrams['pkg-diag-b'] = { id: 'pkg-diag-b', kind: 'diagram', name: 'Alpha Packages', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };

    const result = resolvePackageDiagramActivation(repo, null);
    expect(result).toEqual({
      status: 'choose',
      diagramIds: ['pkg-diag-a', 'pkg-diag-b', 'pkg-diag-z'],
    });
  });

  it('ignores stale last-active diagram ID and returns choose status with sorted candidates', () => {
    const repo = createEmptyRepository();
    repo.diagrams['pkg-diag-1'] = { id: 'pkg-diag-1', kind: 'diagram', name: 'One', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };
    repo.diagrams['pkg-diag-2'] = { id: 'pkg-diag-2', kind: 'diagram', name: 'Two', namespace: ['model'], diagramKind: 'package', ownerId: 'model' };

    const result = resolvePackageDiagramActivation(repo, 'stale-or-deleted-id');
    expect(result).toEqual({
      status: 'choose',
      diagramIds: ['pkg-diag-1', 'pkg-diag-2'],
    });
  });

  it('ignores non-package diagrams (e.g. bdd, ibd, requirements)', () => {
    const repo = createEmptyRepository();
    repo.diagrams['bdd-1'] = { id: 'bdd-1', kind: 'diagram', name: 'BDD 1', namespace: ['model'], diagramKind: 'bdd', ownerId: 'model' };
    repo.diagrams['ibd-1'] = { id: 'ibd-1', kind: 'diagram', name: 'IBD 1', namespace: ['model'], diagramKind: 'ibd', ownerId: 'block-1' };

    const result = resolvePackageDiagramActivation(repo);
    expect(result).toEqual({ status: 'create', ownerId: 'model' });
  });
});
