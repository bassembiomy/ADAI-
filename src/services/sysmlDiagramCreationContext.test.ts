import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type ModelDiagramDefinition, type PackageDefinition } from '../engine/sysml/model';
import { resolveSysmlCreationOwner } from './sysmlDiagramCreationContext';

describe('sysmlDiagramCreationContext', () => {
  it('resolves IBD owner from valid Block contextElementId', () => {
    const repo = createEmptyRepository();
    const block: BlockDefinition = {
      id: 'blk-1',
      kind: 'block',
      name: 'Engine',
      namespace: ['Model'],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    repo.definitions['blk-1'] = block;

    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'ibd',
      diagramKind: 'ibd',
      contextElementId: 'blk-1',
    });

    expect(result).toEqual({ ok: true, ownerId: 'blk-1' });
  });

  it('rejects IBD creation with OWNER_CONTEXT_REQUIRED when contextElementId is missing', () => {
    const repo = createEmptyRepository();
    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'ibd',
      diagramKind: 'ibd',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('OWNER_CONTEXT_REQUIRED');
      expect(result.diagnostic.message).toMatch(/IBD requires a contextual Block/i);
    }
  });

  it('rejects IBD creation with OWNER_NOT_FOUND when contextElementId does not exist or is not a Block', () => {
    const repo = createEmptyRepository();
    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'ibd',
      diagramKind: 'ibd',
      contextElementId: 'missing-blk',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('OWNER_NOT_FOUND');
    }
  });

  it('resolves Package Diagram owner to diagram owning Package or model', () => {
    const repo = createEmptyRepository();
    const pkg: PackageDefinition = {
      id: 'pkg-sub',
      kind: 'package',
      name: 'Subsystem',
      namespace: ['Model'],
      ownerId: 'model',
    };
    repo.packages['pkg-sub'] = pkg;

    const pkgDiagram: ModelDiagramDefinition = {
      id: 'pkg-diag-1',
      kind: 'diagram',
      diagramKind: 'package',
      name: 'Subsystem Overview',
      namespace: ['Model', 'Subsystem'],
      ownerId: 'pkg-sub',
    };
    repo.diagrams['pkg-diag-1'] = pkgDiagram;

    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'pkg-diag-1',
      diagramKind: 'package',
    });

    expect(result).toEqual({ ok: true, ownerId: 'pkg-sub' });
  });

  it('falls back to model for Package Diagram with owner model or without explicit diagram record', () => {
    const repo = createEmptyRepository();
    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'package',
      diagramKind: 'package',
    });

    expect(result).toEqual({ ok: true, ownerId: 'model' });
  });

  it('falls back to model for root BDD and Requirements diagrams', () => {
    const repo = createEmptyRepository();
    const bddResult = resolveSysmlCreationOwner(repo, {
      diagramId: 'bdd',
      diagramKind: 'bdd',
    });
    expect(bddResult).toEqual({ ok: true, ownerId: 'model' });

    const reqResult = resolveSysmlCreationOwner(repo, {
      diagramId: 'requirements',
      diagramKind: 'requirements',
    });
    expect(reqResult).toEqual({ ok: true, ownerId: 'model' });
  });

  it('resolves explicit owner on a non-root diagram', () => {
    const repo = createEmptyRepository();
    const pkg: PackageDefinition = {
      id: 'pkg-domain',
      kind: 'package',
      name: 'DomainPkg',
      namespace: ['Model'],
      ownerId: 'model',
    };
    repo.packages['pkg-domain'] = pkg;

    const customBdd: ModelDiagramDefinition = {
      id: 'bdd-domain',
      kind: 'diagram',
      diagramKind: 'bdd',
      name: 'Domain BDD',
      namespace: ['Model', 'DomainPkg'],
      ownerId: 'pkg-domain',
    };
    repo.diagrams['bdd-domain'] = customBdd;

    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'bdd-domain',
      diagramKind: 'bdd',
    });

    expect(result).toEqual({ ok: true, ownerId: 'pkg-domain' });
  });

  it('rejects diagram creation with OWNER_NOT_FOUND when non-root diagram owner does not exist in repository', () => {
    const repo = createEmptyRepository();
    const customBdd: ModelDiagramDefinition = {
      id: 'bdd-orphan',
      kind: 'diagram',
      diagramKind: 'bdd',
      name: 'Orphan BDD',
      namespace: ['Model'],
      ownerId: 'non-existent-owner',
    };
    repo.diagrams['bdd-orphan'] = customBdd;

    const result = resolveSysmlCreationOwner(repo, {
      diagramId: 'bdd-orphan',
      diagramKind: 'bdd',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('OWNER_NOT_FOUND');
    }
  });
});
