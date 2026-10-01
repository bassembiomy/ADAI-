export interface ActiveSysmlDiagramTargetInput {
  diagramMode: string;
  activeDiagramId?: string | null;
  currentLayerId?: string | null;
}

/**
 * Resolves the diagram id used by presentation commands.
 *
 * A mode such as `requirements` is only a view kind. Once owned diagrams
 * exist, commands must address the concrete diagram id so the persisted
 * presentation and the rendered canvas are the same diagram.
 */
export function resolveActiveSysmlDiagramTarget({
  diagramMode,
  activeDiagramId,
  currentLayerId,
}: ActiveSysmlDiagramTargetInput): string {
  // IBD commands are owned by the contextual Block. The Block id is the
  // gateway's legacy-compatible IBD target even when an owned IBD diagram
  // presentation exists for that context.
  if (diagramMode === 'ibd') return currentLayerId || activeDiagramId || diagramMode;
  return activeDiagramId || diagramMode;
}
