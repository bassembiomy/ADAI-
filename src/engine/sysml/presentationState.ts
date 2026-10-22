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
  featureLayouts?: Record<string, PresentationCoordinates>;
}

/** Compatibility shape: elementIds is an index; presentations is keyed by semantic element ID. */
export interface DiagramPresentation {
  elementIds: string[];
  presentations: Record<string, DiagramElementPresentation>;
  /** Semantic IDs explicitly hidden in this diagram, despite visible endpoints. */
  hiddenElementIds?: string[];
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
    return [diagramId, { ...value, elementIds, presentations }];
  }));
}

/** The presentation the canvas shows for a diagram, merged with the legacy mode-keyed record of the default diagrams. */
export function resolveDiagramPresentation(
  diagramId: string,
  presentations: Record<string, DiagramPresentation>,
): DiagramPresentation | undefined {
  const primary = presentations[diagramId];
  const legacyFallbackKey = diagramId === 'adia-default-bdd' ? 'bdd'
    : diagramId === 'adia-default-requirements' ? 'requirements'
    : diagramId === 'bdd' ? 'adia-default-bdd'
    : diagramId === 'requirements' ? 'adia-default-requirements'
    : undefined;
  const legacyFallback = legacyFallbackKey ? presentations[legacyFallbackKey] : undefined;
  return primary && legacyFallback
    ? {
        ...legacyFallback,
        ...primary,
        elementIds: Array.from(new Set([...(legacyFallback.elementIds ?? []), ...(primary.elementIds ?? [])])),
        presentations: { ...(legacyFallback.presentations ?? {}), ...(primary.presentations ?? {}) },
      }
    : (primary ?? legacyFallback);
}
