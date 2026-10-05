import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import {
  buildPackageRelationship,
  packageRelationshipKeyword,
  packageToolEndpointError,
  packageToolEndpointKinds,
  packageToolPrompt,
} from './packageRelationshipNotation';

describe('packageRelationshipKeyword', () => {
  it.each([
    [{ kind: 'packageImport', visibility: 'public' }, '«import»'],
    [{ kind: 'packageImport', visibility: 'private' }, '«access»'],
    [{ kind: 'packageImport' }, '«import»'],
    [{ kind: 'elementImport', visibility: 'public' }, '«import»'],
    [{ kind: 'elementImport', visibility: 'private' }, '«access»'],
    [{ kind: 'elementImport', visibility: 'public', alias: ' Weight ' }, '«import» Weight'],
    [{ kind: 'packageMerge' }, '«merge»'],
    [{ kind: 'dependency' }, undefined],
  ] as const)('%j → %s', (rel, expected) => {
    expect(packageRelationshipKeyword(rel as never)).toBe(expected);
  });
});

describe('buildPackageRelationship', () => {
  it('fills the import, access, element import and merge role fields', () => {
    expect(buildPackageRelationship('r', 'packageImport', 'a', 'b')).toMatchObject({
      kind: 'packageImport', importingNamespaceId: 'a', importedPackageId: 'b', visibility: 'public',
    });
    expect(buildPackageRelationship('r', 'access', 'a', 'b')).toMatchObject({
      kind: 'packageImport', importingNamespaceId: 'a', importedPackageId: 'b', visibility: 'private',
    });
    expect(buildPackageRelationship('r', 'elementImport', 'a', 'x')).toMatchObject({
      kind: 'elementImport', importingNamespaceId: 'a', importedElementId: 'x', visibility: 'public',
    });
    expect(buildPackageRelationship('r', 'packageMerge', 'a', 'b')).toMatchObject({
      kind: 'packageMerge', mergingPackageId: 'a', mergedPackageId: 'b',
    });
  });

  it('leaves other kinds as plain source/target relationships', () => {
    expect(buildPackageRelationship('r', 'dependency', 'a', 'b')).toEqual({ id: 'r', kind: 'dependency', sourceId: 'a', targetId: 'b' });
  });
});

describe('package tool endpoint checks', () => {
  const repo = createEmptyRepository();
  repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
  repo.definitions.blk = {
    id: 'blk', kind: 'block', name: 'Blk', namespace: [], ownerId: 'pkg',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  const kinds = packageToolEndpointKinds(repo);

  it('rejects a Block as the source of a Package Import', () => {
    expect(packageToolEndpointError('packageImport', 'source', 'blk', kinds)).toBe('The source of Package Import must be a Package.');
    expect(packageToolEndpointError('packageImport', 'source', 'pkg', kinds)).toBeUndefined();
  });

  it('rejects a Package as a Generalization end and never accepts the root Model', () => {
    expect(packageToolEndpointError('generalization', 'source', 'pkg', kinds)).toBe('The source of Generalization must be a Block.');
    expect(packageToolEndpointError('packageMerge', 'target', 'model', kinds)).toBeDefined();
  });

  it('accepts any packageable element as an Element Import or Containment target', () => {
    expect(packageToolEndpointError('elementImport', 'target', 'blk', kinds)).toBeUndefined();
    expect(packageToolEndpointError('containment', 'target', 'blk', kinds)).toBeUndefined();
    expect(packageToolEndpointError('containment', 'source', 'blk', kinds)).toBeDefined();
  });

  it('prompts by role and tool', () => {
    expect(packageToolPrompt('generalization', false)).toBe('Select source Block');
    expect(packageToolPrompt('packageImport', false)).toBe('Select source Package');
    expect(packageToolPrompt('dependency', true)).toBe('Select target element');
  });
});
