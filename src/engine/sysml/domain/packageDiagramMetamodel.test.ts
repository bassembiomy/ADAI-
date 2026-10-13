import { expect, it } from 'vitest';
import type { DiagramKind, PackageImport, ElementImport, PackageMerge } from './index';
import type { SysmlRelationship } from '../model';

it('types package relationships with explicit roles and package diagram kind', () => {
  const kind: DiagramKind = 'package';
  const packageImport: PackageImport = { id: 'pi', metaclass: 'PackageImport', sourceId: 'consumer', targetId: 'types', importingNamespaceId: 'consumer', importedPackageId: 'types', visibility: 'private' };
  const elementImport: ElementImport = { id: 'ei', metaclass: 'ElementImport', sourceId: 'consumer', targetId: 'mass', importingNamespaceId: 'consumer', importedElementId: 'mass', visibility: 'public', alias: 'Weight' };
  const merge: PackageMerge = { id: 'pm', metaclass: 'PackageMerge', sourceId: 'consumer', targetId: 'types', mergingPackageId: 'consumer', mergedPackageId: 'types' };
  const live: SysmlRelationship[] = [
    { id: 'pi', kind: 'packageImport', sourceId: 'consumer', targetId: 'types', importingNamespaceId: 'consumer', importedPackageId: 'types', visibility: 'private' },
    { id: 'ei', kind: 'elementImport', sourceId: 'consumer', targetId: 'mass', importingNamespaceId: 'consumer', importedElementId: 'mass', visibility: 'public', alias: 'Weight' },
    { id: 'pm', kind: 'packageMerge', sourceId: 'consumer', targetId: 'types', mergingPackageId: 'consumer', mergedPackageId: 'types' },
  ];
  expect([kind, packageImport.visibility, elementImport.alias, merge.mergedPackageId, live.map(r => r.kind)]).toEqual(['package', 'private', 'Weight', 'types', ['packageImport', 'elementImport', 'packageMerge']]);
});
