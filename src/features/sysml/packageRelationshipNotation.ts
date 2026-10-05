import type { SysmlRelationship, SysmlRepository } from '../../engine/sysml/model';

/**
 * UML 2.5 / SysML 1.6 keyword shown on a Package Diagram relationship path.
 * Package and element imports read «import» when public and «access» when
 * private; an element import alias is appended after the keyword.
 * Returns undefined for kinds that have no fixed keyword.
 */
export function packageRelationshipKeyword(
  rel: Pick<SysmlRelationship, 'kind' | 'visibility' | 'alias'>,
): string | undefined {
  if (rel.kind === 'packageImport') return rel.visibility === 'private' ? '«access»' : '«import»';
  if (rel.kind === 'elementImport') {
    const keyword = rel.visibility === 'private' ? '«access»' : '«import»';
    return rel.alias?.trim() ? `${keyword} ${rel.alias.trim()}` : keyword;
  }
  if (rel.kind === 'packageMerge') return '«merge»';
  if (rel.kind === 'conform') return '«conform»';
  if (rel.kind === 'expose') return '«expose»';
  return undefined;
}

/**
 * Builds a canonical relationship with the role fields the package policy
 * requires (importing namespace, imported package/element, merge ends).
 * 'access' is a private Package Import.
 */
export function buildPackageRelationship(
  id: string,
  tool: Exclude<PackageRelationshipTool, 'containment'> | SysmlRelationship['kind'],
  sourceId: string,
  targetId: string,
): SysmlRelationship {
  const kind = (tool === 'access' ? 'packageImport' : tool) as SysmlRelationship['kind'];
  const base: SysmlRelationship = { id, kind, sourceId, targetId };
  if (kind === 'packageImport') {
    return { ...base, importingNamespaceId: sourceId, importedPackageId: targetId, visibility: tool === 'access' ? 'private' : 'public' };
  }
  if (kind === 'elementImport') {
    return { ...base, importingNamespaceId: sourceId, importedElementId: targetId, visibility: 'public' };
  }
  if (kind === 'packageMerge') {
    return { ...base, mergingPackageId: sourceId, mergedPackageId: targetId };
  }
  return base;
}

export type PackageRelationshipTool =
  | 'generalization'
  | 'packageImport'
  | 'access'
  | 'elementImport'
  | 'packageMerge'
  | 'dependency'
  | 'conform'
  | 'expose'
  | 'containment';

export type PackageToolEndpointFamily = 'package' | 'classifier' | 'packageable' | 'view' | 'viewpoint' | 'any';

/** Source/target endpoint families each Package Diagram tool accepts. */
export const PACKAGE_TOOL_ENDPOINTS: Record<PackageRelationshipTool, { source: PackageToolEndpointFamily; target: PackageToolEndpointFamily }> = {
  generalization: { source: 'classifier', target: 'classifier' },
  packageImport: { source: 'package', target: 'package' },
  access: { source: 'package', target: 'package' },
  elementImport: { source: 'package', target: 'packageable' },
  packageMerge: { source: 'package', target: 'package' },
  dependency: { source: 'any', target: 'any' },
  // SysML 1.6 §7.3.2: «conform» View -> Viewpoint; «expose» View -> any element.
  conform: { source: 'view', target: 'viewpoint' },
  expose: { source: 'view', target: 'any' },
  // Containment is drawn owner → owned: the owner must be a Package.
  containment: { source: 'package', target: 'packageable' },
};

const FAMILY_LABEL: Record<PackageToolEndpointFamily, string> = {
  package: 'Package',
  classifier: 'Block',
  packageable: 'element',
  view: 'View',
  viewpoint: 'Viewpoint',
  any: 'element',
};

/** Prompt shown while a Package Diagram relationship tool waits for a click. */
export function packageToolPrompt(tool: PackageRelationshipTool, hasSource: boolean): string {
  const endpoints = PACKAGE_TOOL_ENDPOINTS[tool];
  return hasSource
    ? `Select target ${FAMILY_LABEL[endpoints.target]}`
    : `Select source ${FAMILY_LABEL[endpoints.source]}`;
}

export interface PackageToolEndpointKinds {
  isPackage: (id: string) => boolean;
  isClassifier: (id: string) => boolean;
  isPackageable: (id: string) => boolean;
  isView: (id: string) => boolean;
  isViewpoint: (id: string) => boolean;
}

/** Endpoint classification over the canonical repository. The root Model is never a tool endpoint. */
export function packageToolEndpointKinds(repo: SysmlRepository): PackageToolEndpointKinds {
  const isPackage = (id: string) => id !== 'model' && Boolean(repo.packages[id]);
  const isClassifier = (id: string) => {
    const def = repo.definitions[id];
    return Boolean(def && (def.kind === 'block' || def.kind === 'interface'));
  };
  const isPackageable = (id: string) => isPackage(id)
    || Boolean(repo.definitions[id] || repo.requirements[id] || repo.verificationCases[id]
      || repo.useCases?.[id] || repo.actors?.[id]);
  const isView = (id: string) => repo.definitions[id]?.kind === 'view';
  const isViewpoint = (id: string) => repo.definitions[id]?.kind === 'viewpoint';
  return { isPackage, isClassifier, isPackageable, isView, isViewpoint };
}

/** Returns a user-facing reason when the clicked endpoint cannot play the role, else undefined. */
export function packageToolEndpointError(
  tool: PackageRelationshipTool,
  role: 'source' | 'target',
  id: string,
  kinds: PackageToolEndpointKinds,
): string | undefined {
  const family = PACKAGE_TOOL_ENDPOINTS[tool][role];
  const ok = family === 'any'
    || (family === 'package' && kinds.isPackage(id))
    || (family === 'classifier' && kinds.isClassifier(id))
    || (family === 'packageable' && kinds.isPackageable(id))
    || (family === 'view' && kinds.isView(id))
    || (family === 'viewpoint' && kinds.isViewpoint(id));
  if (ok) return undefined;
  return `The ${role} of ${PACKAGE_TOOL_LABELS[tool]} must be a ${FAMILY_LABEL[family]}.`;
}

export const PACKAGE_TOOL_LABELS: Record<PackageRelationshipTool, string> = {
  generalization: 'Generalization',
  packageImport: 'Package Import',
  access: 'Access',
  elementImport: 'Element Import',
  packageMerge: 'Package Merge',
  dependency: 'Dependency',
  conform: 'Conform',
  expose: 'Expose',
  containment: 'Containment',
};
