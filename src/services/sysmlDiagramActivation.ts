import type { SysmlRepository } from '../engine/sysml/model';

export type PackageDiagramActivation =
  | { status: 'open'; diagramId: string }
  | { status: 'choose'; diagramIds: string[] }
  | { status: 'create'; ownerId: 'model' };

export function resolvePackageDiagramActivation(
  repo: Pick<SysmlRepository, 'diagrams'>,
  lastActiveId?: string | null,
): PackageDiagramActivation {
  const packageDiagrams = Object.values(repo.diagrams).filter(
    diagram => diagram.diagramKind === 'package'
  );

  if (packageDiagrams.length === 0) {
    return { status: 'create', ownerId: 'model' };
  }

  if (packageDiagrams.length === 1) {
    return { status: 'open', diagramId: packageDiagrams[0].id };
  }

  if (lastActiveId && packageDiagrams.some(d => d.id === lastActiveId)) {
    return { status: 'open', diagramId: lastActiveId };
  }

  const sorted = [...packageDiagrams].sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });

  return {
    status: 'choose',
    diagramIds: sorted.map(d => d.id),
  };
}
