export interface PresentationCoordinates {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface DiagramElementPresentation {
  id: string;
  diagramId: string;
  semanticElementId: string;
  bounds: PresentationCoordinates;
  style?: Record<string, string | number>;
  portLayouts?: Record<string, { side: 'top' | 'right' | 'bottom' | 'left'; offset: number }>;
}

/** Compatibility shape: elementIds is an index; presentations is keyed by semantic element ID. */
export interface DiagramPresentation {
  elementIds: string[];
  presentations: Record<string, DiagramElementPresentation>;
}

export type DiagramPresentationInput = Partial<DiagramPresentation> & { elementIds: string[] };

export function stableDiagramPresentationId(diagramId: string, semanticElementId: string): string {
  return `presentation:${encodeURIComponent(diagramId)}:${encodeURIComponent(semanticElementId)}`;
}

/**
 * Upgrade legacy membership + global-coordinate sidecars into diagram-scoped
 * records. Existing stable IDs and bounds always win; global coordinates are
 * consulted only for records that have not yet been migrated.
 */
export function normalizeDiagramPresentations(
  input: Record<string, DiagramPresentationInput | DiagramPresentation> = {},
  legacyCoordinates: Record<string, PresentationCoordinates> = {},
): Record<string, DiagramPresentation> {
  return Object.fromEntries(Object.entries(input).map(([diagramId, value]) => {
    const elementIds = [...new Set(value.elementIds ?? Object.keys(value.presentations ?? {}))];
    const presentations = { ...(value.presentations ?? {}) };
    for (const semanticElementId of elementIds) {
      const existing = presentations[semanticElementId];
      presentations[semanticElementId] = existing ?? {
        id: stableDiagramPresentationId(diagramId, semanticElementId),
        diagramId,
        semanticElementId,
        bounds: { ...(legacyCoordinates[semanticElementId] ?? {}) },
      };
    }
    return [diagramId, { elementIds, presentations }];
  }));
}
