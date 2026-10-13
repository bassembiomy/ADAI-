import type { NamedElement, SysmlRelationship, SysmlRepository } from '../model';
import type { DiagramPresentation as LiveDiagramPresentation } from '../presentationState';

export type PackageableElement = NamedElement & { kind: string };
export interface PackageMemberReference {
  element: PackageableElement;
  visibleName: string;
  visibility: 'public' | 'private';
  importedViaId?: string;
}

export interface PackageQueryService {
  getOwnedPackageableElements(packageId: string): PackageableElement[];
  getImportedMembers(namespaceId: string): PackageMemberReference[];
  getVisibleMembers(namespaceId: string): PackageMemberReference[];
  getPackageDependencies(packageId: string, recursive?: boolean): SysmlRelationship[];
  getElementUsages(elementId: string): SysmlRelationship[];
  getQualifiedName(elementId: string): string | null;
  getPresentationsForElement(elementId: string): LiveDiagramPresentation['presentations'][string][];
  getPackageMergeClosure(packageId: string): string[];
}

export function createPackageQueryService(repo: SysmlRepository, presentations: Record<string, LiveDiagramPresentation> = {}): PackageQueryService {
  const elements: PackageableElement[] = [
    ...Object.values(repo.packages), ...Object.values(repo.definitions), ...Object.values(repo.requirements),
    ...Object.values(repo.verificationCases), ...Object.values(repo.actors), ...Object.values(repo.subjects),
    ...Object.values(repo.useCases), ...Object.values(repo.extensionPoints),
  ];
  const byId = new Map(elements.map(e => [e.id, e]));
  const byOwner = new Map<string, PackageableElement[]>();
  for (const element of elements) if (element.ownerId) byOwner.set(element.ownerId, [...(byOwner.get(element.ownerId) ?? []), element]);
  const relationships = Object.values(repo.relationships);
  const from = new Map<string, SysmlRelationship[]>();
  const to = new Map<string, SysmlRelationship[]>();
  for (const rel of relationships) {
    from.set(rel.sourceId, [...(from.get(rel.sourceId) ?? []), rel]);
    to.set(rel.targetId, [...(to.get(rel.targetId) ?? []), rel]);
  }
  const owned = (id: string) => byOwner.get(id) ?? [];
  const imported = (id: string): PackageMemberReference[] => {
    const members: PackageMemberReference[] = [];
    const seen = new Set<string>();
    for (const rel of [...(from.get(id) ?? [])].sort((a, b) => Number(b.kind === 'elementImport') - Number(a.kind === 'elementImport'))) {
      if (rel.kind !== 'elementImport' && rel.kind !== 'packageImport') continue;
      const candidates = rel.kind === 'packageImport' && repo.packages[rel.targetId] ? owned(rel.targetId) : [byId.get(rel.targetId)].filter((e): e is PackageableElement => Boolean(e));
      for (const element of candidates) {
        if (seen.has(element.id)) continue;
        seen.add(element.id);
        members.push({ element, visibleName: rel.kind === 'elementImport' ? rel.alias ?? element.name : element.name, visibility: rel.visibility ?? 'public', importedViaId: rel.id });
      }
    }
    return members;
  };
  const mergeClosure = (id: string): string[] => {
    const seen = new Set<string>([id]);
    const result: string[] = [];
    const queue = [id];
    for (let i = 0; i < queue.length; i++) for (const rel of from.get(queue[i]) ?? []) if (rel.kind === 'packageMerge' && repo.packages[rel.targetId] && !seen.has(rel.targetId)) { seen.add(rel.targetId); result.push(rel.targetId); queue.push(rel.targetId); }
    return result;
  };
  return {
    getOwnedPackageableElements: owned,
    getImportedMembers: imported,
    getVisibleMembers(id) {
      const members: PackageMemberReference[] = owned(id).map(element => ({ element, visibleName: element.name, visibility: 'public' }));
      const seen = new Set(members.map(m => m.element.id));
      for (const member of imported(id)) if (!seen.has(member.element.id)) { members.push(member); seen.add(member.element.id); }
      for (const packageId of mergeClosure(id)) for (const element of owned(packageId)) if (!seen.has(element.id)) { members.push({ element, visibleName: element.name, visibility: 'public' }); seen.add(element.id); }
      return members;
    },
    getPackageDependencies(id, recursive = false) {
      const ids = new Set([id]);
      if (recursive) {
        const queue = [id];
        for (let i = 0; i < queue.length; i++) for (const child of owned(queue[i])) if (!ids.has(child.id)) { ids.add(child.id); queue.push(child.id); }
      }
      return relationships.filter(r => r.kind === 'dependency' && ids.has(r.sourceId));
    },
    getElementUsages(id) { return to.get(id) ?? []; },
    getQualifiedName(id) {
      const names: string[] = [];
      const seen = new Set<string>();
      let current: string | undefined = id;
      while (current) {
        if (seen.has(current)) return null;
        seen.add(current);
        const element: PackageableElement | undefined = byId.get(current);
        if (!element) return null;
        names.unshift(element.name);
        current = element.ownerId;
      }
      return names.join('::');
    },
    getPresentationsForElement(id) { return byId.has(id) ? Object.values(presentations).flatMap(d => Object.values(d.presentations).filter(p => p.semanticElementId === id)) : []; },
    getPackageMergeClosure: mergeClosure,
  };
}
