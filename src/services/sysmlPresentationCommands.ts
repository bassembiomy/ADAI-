import type { SysmlEditorCommand } from './sysmlCommandGateway';

export type PortLayoutSide = 'top' | 'right' | 'bottom' | 'left';

export function buildDiagramPresentationBatch(
  diagramId: string,
  updates: Array<{ elementId: string; x: number; y: number }>,
): SysmlEditorCommand | null {
  if (updates.length === 0) return null;
  return {
    type: 'batch',
    commands: updates.map(update => ({
      type: 'updatePresentation' as const,
      diagramId,
      elementId: update.elementId,
      presentation: { x: update.x, y: update.y },
    })),
  };
}

export function buildPortLayoutCommand(
  diagramId: string,
  elementId: string,
  portId: string,
  side: PortLayoutSide,
  offset: number,
  options: { presentationExists?: boolean; bounds?: { x?: number; y?: number; width?: number; height?: number } } = {},
): SysmlEditorCommand {
  const updateCommand: SysmlEditorCommand = {
    type: 'updatePresentation',
    diagramId,
    elementId,
    presentation: {},
    portLayouts: { [portId]: { side, offset: Math.max(0, Math.min(1, offset)) } },
  };
  if (options.presentationExists) return updateCommand;

  return {
    type: 'batch',
    commands: [
      {
        type: 'addToDiagram',
        diagramId,
        elementIds: [elementId],
        ...(options.bounds ? { coordinates: { [elementId]: options.bounds } } : {}),
      },
      updateCommand,
    ],
  };
}
