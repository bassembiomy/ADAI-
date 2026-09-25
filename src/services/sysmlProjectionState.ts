import { useCallback, useState } from 'react';
import type { DiagramPresentation } from '../engine/sysml/presentationState';
import type { LegacySysmlView, SysmlCommandResult } from './sysmlCommandGateway';

const EMPTY_PROJECTION: LegacySysmlView = {
  blocks: [],
  relationships: [],
  parts: [],
  connectors: [],
};

/** The single adapter boundary from canonical repository results to shared semantic lookup projections. */
export function applyCanonicalSysmlResult(
  result: Pick<SysmlCommandResult, 'view'>,
  setProjection: (view: LegacySysmlView) => void,
): void {
  setProjection(result.view);
}

/** Overlay only the active diagram's presentation data onto the full semantic projection. */
export function projectDiagramScopedCanvasView(
  complete: LegacySysmlView,
  diagramId: string,
  presentations: Record<string, DiagramPresentation>,
  contextElementIds: readonly string[] = [],
): LegacySysmlView {
  const diagram = presentations[diagramId];
  const visibleIds = new Set([...(diagram?.elementIds ?? []), ...contextElementIds]);
  const isPresented = (elementId: string) => visibleIds.has(elementId);
  return {
    ...complete,
    blocks: complete.blocks.filter(block => isPresented(block.id)).map(block => {
      const bounds = diagram?.presentations[block.id]?.bounds;
      return bounds ? { ...block, ...bounds } : block;
    }),
    parts: complete.parts.filter(part => isPresented(part.id)).map(part => {
      const presentation = diagram?.presentations[part.id];
      const portLayouts = presentation?.portLayouts;
      return presentation ? {
        ...part,
        ...presentation.bounds,
        ...(portLayouts ? { portLayouts } : {}),
      } : part;
    }),
    relationships: complete.relationships,
    connectors: complete.connectors,
  };
}

export function useSysmlProjectionState() {
  const [projection, setProjection] = useState<LegacySysmlView>(EMPTY_PROJECTION);
  const applyResult = useCallback((result: Pick<SysmlCommandResult, 'view'>) => {
    applyCanonicalSysmlResult(result, setProjection);
  }, []);

  return { ...projection, applyCanonicalSysmlResult: applyResult };
}
