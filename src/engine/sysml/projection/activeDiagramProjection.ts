import type { NormalizedSysmlStore } from '../normalizedStore';
import { getCachedLegacyView } from '../normalizedStore';
import type { LegacySysmlView } from '../../../services/sysmlCommandGateway';

export type LegacyDiagramProjection = LegacySysmlView;

/**
 * Project only the active diagram elements, links, and presentations from the normalized store.
 * Reuses cached entity and legacy projections based on store revision and diagram ID.
 * Direct indexed lookups ensure no full repository traversal occurs.
 */
export function projectActiveDiagram(
  store: NormalizedSysmlStore,
  diagramId?: string,
): LegacyDiagramProjection {
  if (!diagramId) {
    return {
      packages: [],
      blocks: [],
      parts: [],
      relationships: [],
      connectors: [],
    };
  }
  return getCachedLegacyView(store, diagramId);
}
