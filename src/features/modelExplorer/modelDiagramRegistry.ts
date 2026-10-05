import type { ModelExplorerAdapter } from './modelExplorerTypes';
import { resolvePackageDiagramActivation, type PackageDiagramActivation } from '../../services/sysmlDiagramActivation';

export interface ModelDiagramMetadata {
  id: string;
  name: string;
  diagramKind: string;
  ownerId: string;
  contextElementId?: string;
}

export interface ModelDiagramRegistryOptions {
  adapter: ModelExplorerAdapter;
  listDiagrams?: () => ModelDiagramMetadata[];
  getPresentedIds?: (diagramId: string) => string[];
  onOpenDiagram?: (diagramId: string) => void;
}

export interface ModelDiagramRegistry {
  listForOwner(ownerId: string): ModelDiagramMetadata[];
  create(options: {
    ownerId: string;
    diagramKind: string;
    name?: string;
    contextElementId?: string;
  }): ModelDiagramMetadata;
  open(diagramId: string): void;
  presentedElementIds(diagramId: string): string[];
  resolvePackageActivation(lastActiveId?: string | null): PackageDiagramActivation;
}

export function createModelDiagramRegistry(options: ModelDiagramRegistryOptions): ModelDiagramRegistry {
  const localDiagrams: ModelDiagramMetadata[] = [];

  return {
    listForOwner(ownerId: string): ModelDiagramMetadata[] {
      const fromStore = options.listDiagrams ? options.listDiagrams() : localDiagrams;
      return fromStore.filter(d => d.ownerId === ownerId);
    },

    create(createOptions: {
      ownerId: string;
      diagramKind: string;
      name?: string;
      contextElementId?: string;
    }): ModelDiagramMetadata {
      const result = options.adapter.execute({
        type: 'createDiagram',
        ownerId: createOptions.ownerId,
        diagramKind: createOptions.diagramKind,
        name: createOptions.name,
        contextElementId: createOptions.contextElementId,
      });

      if (!result.committed || !result.selectedIds?.[0]) {
        const diagnostic = result.diagnostics[0];
        throw new Error(diagnostic?.message ?? 'Diagram creation failed; no semantic diagram was created.');
      }
      const diagramId = result.selectedIds[0];
      const metadata: ModelDiagramMetadata = {
        id: diagramId,
        name: createOptions.name ?? createOptions.diagramKind.toUpperCase(),
        diagramKind: createOptions.diagramKind,
        ownerId: createOptions.ownerId,
        contextElementId: createOptions.contextElementId,
      };

      localDiagrams.push(metadata);
      return metadata;
    },

    open(diagramId: string): void {
      if (typeof options.onOpenDiagram === 'function') {
        options.onOpenDiagram(diagramId);
      }
    },

    presentedElementIds(diagramId: string): string[] {
      if (typeof options.getPresentedIds === 'function') {
        return options.getPresentedIds(diagramId);
      }
      return [];
    },

    resolvePackageActivation(lastActiveId?: string | null): PackageDiagramActivation {
      const fromStore = options.listDiagrams ? options.listDiagrams() : localDiagrams;
      const diagrams: Record<string, any> = {};
      for (const d of fromStore) {
        diagrams[d.id] = d;
      }
      return resolvePackageDiagramActivation({ diagrams }, lastActiveId);
    },
  };
}
