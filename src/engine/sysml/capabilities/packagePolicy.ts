import type { SysmlRepository, SysmlRelationship } from '../model';

export interface PackagePolicyDecision { allowed: boolean; code?: string; message?: string }
const allow = (): PackagePolicyDecision => ({ allowed: true });
const deny = (code: string, message: string): PackagePolicyDecision => ({ allowed: false, code, message });

function exists(repo: SysmlRepository, id: string): boolean {
  return Boolean(repo.packages[id] || repo.diagrams[id] || repo.definitions[id] || repo.requirements[id] || repo.verificationCases[id] || repo.actors[id] || repo.subjects[id] || repo.useCases[id] || repo.extensionPoints[id]);
}

function namespace(repo: SysmlRepository, id: string): PackagePolicyDecision {
  if (!exists(repo, id)) return deny('ELEMENT_NOT_FOUND', `Namespace ${id} does not exist.`);
  return repo.packages[id] ? allow() : deny('INVALID_NAMESPACE', `Element ${id} is not a package namespace.`);
}

function matchingImport(repo: SysmlRepository, kind: SysmlRelationship['kind'], sourceId: string, targetId: string, alias?: string): boolean {
  return Object.values(repo.relationships).some(r => r.kind === kind && r.sourceId === sourceId && r.targetId === targetId && (kind !== 'elementImport' || r.alias === alias));
}

export function validatePackageImport(repo: SysmlRepository, importingNamespaceId: string, importedPackageId: string, visibility: 'public' | 'private' = 'public'): PackagePolicyDecision {
  const source = namespace(repo, importingNamespaceId);
  if (!source.allowed) return source;
  if (!exists(repo, importedPackageId)) return deny('ELEMENT_NOT_FOUND', `Package ${importedPackageId} does not exist.`);
  if (!repo.packages[importedPackageId]) return deny('PACKAGE_IMPORT_TARGET_NOT_PACKAGE', `Element ${importedPackageId} is not a Package.`);
  if (visibility !== 'public' && visibility !== 'private') return deny('INVALID_VISIBILITY', `Visibility ${visibility} is invalid.`);
  const existing = Object.values(repo.relationships).find(r =>
    r.kind === 'packageImport' && r.sourceId === importingNamespaceId && r.targetId === importedPackageId);
  if (existing) {
    const existingVisibility = existing.visibility ?? 'public';
    return deny('DUPLICATE_IMPORT', existingVisibility === visibility
      ? 'Package import already exists.'
      : `This Package already ${existingVisibility === 'public' ? 'imports («import»)' : 'accesses («access»)'} that Package; change the existing relationship's visibility instead of adding ${visibility === 'public' ? '«import»' : '«access»'}.`);
  }
  return allow();
}

export function validateElementImport(repo: SysmlRepository, importingNamespaceId: string, importedElementId: string, visibility: 'public' | 'private' = 'public', alias?: string): PackagePolicyDecision {
  const source = namespace(repo, importingNamespaceId);
  if (!source.allowed) return source;
  if (!exists(repo, importedElementId)) return deny('ELEMENT_NOT_FOUND', `Element ${importedElementId} does not exist.`);
  if (repo.diagrams[importedElementId]) return deny('ELEMENT_IMPORT_TARGET_NOT_PACKAGEABLE', `Diagram ${importedElementId} is not packageable.`);
  if (visibility !== 'public' && visibility !== 'private') return deny('INVALID_VISIBILITY', `Visibility ${visibility} is invalid.`);
  if (alias !== undefined && !alias.trim()) return deny('INVALID_ALIAS', 'Alias must not be empty.');
  if (matchingImport(repo, 'elementImport', importingNamespaceId, importedElementId, alias)) return deny('DUPLICATE_IMPORT', 'Element import already exists.');
  return allow();
}

export function validatePackageMerge(repo: SysmlRepository, mergingPackageId: string, mergedPackageId: string): PackagePolicyDecision {
  if (!exists(repo, mergingPackageId) || !exists(repo, mergedPackageId)) return deny('ELEMENT_NOT_FOUND', 'Merge endpoint does not exist.');
  if (!repo.packages[mergingPackageId] || !repo.packages[mergedPackageId]) return deny('PACKAGE_MERGE_ENDPOINT_NOT_PACKAGE', 'Both merge endpoints must be Packages.');
  if (mergingPackageId === mergedPackageId) return deny('PACKAGE_MERGE_CYCLE', 'A Package cannot merge itself.');
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === mergingPackageId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return Object.values(repo.relationships).filter(r => r.kind === 'packageMerge' && r.sourceId === id).some(r => visit(r.targetId));
  };
  if (visit(mergedPackageId)) return deny('PACKAGE_MERGE_CYCLE', 'Package merge would create a cycle.');
  if (matchingImport(repo, 'packageMerge', mergingPackageId, mergedPackageId)) return deny('DUPLICATE_PACKAGE_MERGE', 'Package merge already exists.');
  return allow();
}

export function validatePackageOwnershipMove(repo: SysmlRepository, elementId: string, newOwnerId: string): PackagePolicyDecision {
  if (!exists(repo, elementId) || !exists(repo, newOwnerId)) return deny('ELEMENT_NOT_FOUND', 'Element or owner does not exist.');
  if (!repo.packages[newOwnerId]) return deny('INVALID_OWNER', 'New owner must be a Package.');
  if (elementId === newOwnerId) return deny('SELF_OWNERSHIP_CYCLE', 'A Package cannot own itself.');
  const seen = new Set<string>();
  let current: string | undefined = newOwnerId;
  while (current) {
    if (current === elementId || seen.has(current)) return deny('OWNERSHIP_CYCLE', 'Ownership would form a cycle.');
    seen.add(current);
    current = repo.packages[current]?.ownerId;
  }
  return allow();
}
