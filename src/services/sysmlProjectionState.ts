import { useCallback, useState } from 'react';
import type { DiagramPresentation } from '../engine/sysml/presentationState';
import type { LegacySysmlView, SysmlCommandResult } from './sysmlCommandGateway';
import type { BlockData, PackageData, PartData } from '../types/sysml_types';

const EMPTY_PROJECTION: LegacySysmlView = {
  packages: [],
  blocks: [],
  relationships: [],
  parts: [],
  connectors: [],
};

export type SysmlProjectionUpdate =
  | Pick<SysmlCommandResult, 'view'>
  | { delta: { type: 'package'; id: string; bounds: Partial<PackageData> } | { type: 'block'; id: string; bounds: Partial<BlockData> } | { type: 'part'; id: string; bounds: Partial<PartData> } };

/** The single adapter boundary from canonical repository results to shared semantic lookup projections. */
export function applyCanonicalSysmlResult(
  result: SysmlProjectionUpdate,
  setProjection: (view: LegacySysmlView | ((prev: LegacySysmlView) => LegacySysmlView)) => void,
): void {
  if ('view' in result) {
    setProjection(result.view);
  } else if ('delta' in result) {
    const { delta } = result;
    setProjection((prev: LegacySysmlView) => {
      if (delta.type === 'block') {
        return {
          ...prev,
          blocks: prev.blocks.map(b => b.id === delta.id ? { ...b, ...delta.bounds } : b),
        };
      }
      if (delta.type === 'package') {
        return {
          ...prev,
          packages: prev.packages.map(pkg => pkg.id === delta.id ? { ...pkg, ...delta.bounds } : pkg),
        };
      }
      return {
        ...prev,
        parts: prev.parts.map(p => p.id === delta.id ? { ...p, ...delta.bounds } : p),
      };
    });
  }
}

/** Overlay only the active diagram's presentation data onto the full semantic projection. */
export function projectDiagramScopedCanvasView(
  complete: LegacySysmlView,
  diagramId: string,
  presentations: Record<string, DiagramPresentation>,
  contextElementIds: readonly string[] = [],
  presentationDrafts: Readonly<Record<string, import('./sysmlCommandGateway').PresentationCoordinates>> = {},
): LegacySysmlView {
  const diagram = presentations[diagramId];
  const visibleIds = new Set([...(diagram?.elementIds ?? []), ...contextElementIds]);
  const isPresented = (elementId: string) => visibleIds.has(elementId);
  return {
    ...complete,
    packages: complete.packages.filter(pkg => isPresented(pkg.id)).map(pkg => {
      const bounds = diagram?.presentations[pkg.id]?.bounds;
      return { ...pkg, ...(bounds ?? {}), ...(presentationDrafts[pkg.id] ?? {}) };
    }),
    blocks: complete.blocks.filter(block => isPresented(block.id)).map(block => {
      const bounds = diagram?.presentations[block.id]?.bounds;
      return { ...block, ...(bounds ?? {}), ...(presentationDrafts[block.id] ?? {}) };
    }),
    parts: complete.parts.filter(part => isPresented(part.id)).map(part => {
      const presentation = diagram?.presentations[part.id];
      const portLayouts = presentation?.portLayouts;
      return presentation ? {
        ...part,
        ...presentation.bounds,
        ...(presentationDrafts[part.id] ?? {}),
        ...(portLayouts ? { portLayouts } : {}),
      } : { ...part, ...(presentationDrafts[part.id] ?? {}) };
    }),
    relationships: complete.relationships,
    connectors: complete.connectors,
  };
}

export function useSysmlProjectionState() {
  const [projection, setProjection] = useState<LegacySysmlView>(EMPTY_PROJECTION);
  const applyResult = useCallback((result: SysmlProjectionUpdate) => {
    applyCanonicalSysmlResult(result, setProjection);
  }, []);

  const updateBlockBounds = useCallback((id: string, bounds: Partial<BlockData>) => {
    applyCanonicalSysmlResult({ delta: { type: 'block', id, bounds } }, setProjection);
  }, []);

  const updatePackageBounds = useCallback((id: string, bounds: Partial<PackageData>) => {
    applyCanonicalSysmlResult({ delta: { type: 'package', id, bounds } }, setProjection);
  }, []);

  const updatePartBounds = useCallback((id: string, bounds: Partial<PartData>) => {
    applyCanonicalSysmlResult({ delta: { type: 'part', id, bounds } }, setProjection);
  }, []);

  return {
    ...projection,
    applyCanonicalSysmlResult: applyResult,
    updatePackageBounds,
    updateBlockBounds,
    updatePartBounds,
  };
}
