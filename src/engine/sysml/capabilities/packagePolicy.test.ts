import { expect, it } from 'vitest';
import { createEmptyRepository } from '../model';
import { validateElementImport, validatePackageImport, validatePackageMerge, validatePackageOwnershipMove } from './packagePolicy';

it('rejects invalid imports and equivalent duplicates without mutation', () => {
  const repo = createEmptyRepository();
  repo.packages.a = { id: 'a', kind: 'package', name: 'A', namespace: [], ownerId: 'model' };
  repo.definitions.mass = { id: 'mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'a' };
  const before = JSON.stringify(repo);
  expect(validatePackageImport(repo, 'a', 'mass').code).toBe('PACKAGE_IMPORT_TARGET_NOT_PACKAGE');
  expect(validateElementImport(repo, 'a', 'missing').code).toBe('ELEMENT_NOT_FOUND');
  expect(validateElementImport(repo, 'a', 'mass').allowed).toBe(true);
  expect(JSON.stringify(repo)).toBe(before);
  repo.relationships.import1 = { id: 'import1', kind: 'elementImport', sourceId: 'a', targetId: 'mass', importingNamespaceId: 'a', importedElementId: 'mass', visibility: 'public', alias: 'Weight' };
  expect(validateElementImport(repo, 'a', 'mass', 'public', 'Weight').code).toBe('DUPLICATE_IMPORT');
  expect(validateElementImport(repo, 'a', 'mass', 'public', 'Weight').allowed).toBe(false);
});

it('rejects self and circular merges and containment moves', () => {
  const repo = createEmptyRepository();
  repo.packages.a = { id: 'a', kind: 'package', name: 'A', namespace: [], ownerId: 'model' };
  repo.packages.b = { id: 'b', kind: 'package', name: 'B', namespace: [], ownerId: 'a' };
  expect(validatePackageMerge(repo, 'a', 'a').code).toBe('PACKAGE_MERGE_CYCLE');
  repo.relationships.merge = { id: 'merge', kind: 'packageMerge', sourceId: 'b', targetId: 'a', mergingPackageId: 'b', mergedPackageId: 'a' };
  expect(validatePackageMerge(repo, 'a', 'b').code).toBe('PACKAGE_MERGE_CYCLE');
  expect(validatePackageOwnershipMove(repo, 'a', 'a').code).toBe('SELF_OWNERSHIP_CYCLE');
  expect(validatePackageOwnershipMove(repo, 'a', 'b').code).toBe('OWNERSHIP_CYCLE');
});

it('rejects duplicate package imports and merges and unsupported namespace endpoints', () => {
  const repo = createEmptyRepository();
  repo.packages.a = { id: 'a', kind: 'package', name: 'A', namespace: [], ownerId: 'model' };
  repo.packages.b = { id: 'b', kind: 'package', name: 'B', namespace: [], ownerId: 'model' };
  repo.definitions.mass = { id: 'mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'a' };
  expect(validatePackageImport(repo, 'mass', 'b').code).toBe('INVALID_NAMESPACE');
  expect(validatePackageMerge(repo, 'mass', 'b').code).toBe('PACKAGE_MERGE_ENDPOINT_NOT_PACKAGE');
  repo.relationships.pi = { id: 'pi', kind: 'packageImport', sourceId: 'a', targetId: 'b', importingNamespaceId: 'a', importedPackageId: 'b', visibility: 'public' };
  repo.relationships.pm = { id: 'pm', kind: 'packageMerge', sourceId: 'a', targetId: 'b', mergingPackageId: 'a', mergedPackageId: 'b' };
  expect(validatePackageImport(repo, 'a', 'b', 'private').code).toBe('DUPLICATE_IMPORT');
  expect(validatePackageMerge(repo, 'a', 'b').code).toBe('DUPLICATE_PACKAGE_MERGE');
});
