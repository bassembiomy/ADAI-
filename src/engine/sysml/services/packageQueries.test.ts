import { expect, it } from 'vitest';
import { createEmptyRepository } from '../model';
import { createPackageQueryService } from './packageQueries';

it('resolves ownership, visibility, aliases, qualified names and merge closure', () => {
  const repo = createEmptyRepository();
  repo.packages.a = { id: 'a', kind: 'package', name: 'A', namespace: [], ownerId: 'model' };
  repo.packages.b = { id: 'b', kind: 'package', name: 'B', namespace: [], ownerId: 'model' };
  repo.packages.c = { id: 'c', kind: 'package', name: 'C', namespace: [], ownerId: 'model' };
  repo.definitions.mass = { id: 'mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'b' };
  repo.definitions.speed = { id: 'speed', kind: 'valueType', name: 'Speed', namespace: [], ownerId: 'c' };
  repo.relationships.pi = { id: 'pi', kind: 'packageImport', sourceId: 'a', targetId: 'b', importingNamespaceId: 'a', importedPackageId: 'b', visibility: 'private' };
  repo.relationships.ei = { id: 'ei', kind: 'elementImport', sourceId: 'a', targetId: 'mass', importingNamespaceId: 'a', importedElementId: 'mass', visibility: 'public', alias: 'Weight' };
  repo.relationships.merge = { id: 'merge', kind: 'packageMerge', sourceId: 'a', targetId: 'c', mergingPackageId: 'a', mergedPackageId: 'c' };
  const q = createPackageQueryService(repo);
  expect(q.getOwnedPackageableElements('b').map(e => e.id)).toEqual(['mass']);
  expect(q.getImportedMembers('a').map(e => e.visibleName)).toContain('Weight');
  expect(q.getImportedMembers('a')[0].visibility).toBe('public');
  expect(q.getVisibleMembers('a').some(e => e.element.id === 'mass')).toBe(true);
  expect(q.getQualifiedName('mass')).toBe('Model::B::Mass');
  expect(q.getPackageMergeClosure('a')).toEqual(['c']);
  expect(q.getVisibleMembers('a').map(e => e.element.id)).toContain('speed');
  expect(q.getQualifiedName('absent')).toBeNull();
});

it('finds recursive dependencies, incoming usages and live presentations', () => {
  const repo = createEmptyRepository();
  repo.packages.a = { id: 'a', kind: 'package', name: 'A', namespace: [], ownerId: 'model' };
  repo.packages.b = { id: 'b', kind: 'package', name: 'B', namespace: [], ownerId: 'a' };
  repo.relationships.dep = { id: 'dep', kind: 'dependency', sourceId: 'b', targetId: 'model' };
  const q = createPackageQueryService(repo, { diagram1: { elementIds: ['b'], presentations: { b: { id: 'p1', diagramId: 'diagram1', semanticElementId: 'b', bounds: { x: 1 } } } } });
  expect(q.getPackageDependencies('a')).toEqual([]);
  expect(q.getPackageDependencies('a', true).map(r => r.id)).toEqual(['dep']);
  expect(q.getElementUsages('model').map(r => r.id)).toEqual(['dep']);
  expect(q.getPresentationsForElement('b').map(p => p.id)).toEqual(['p1']);
});
