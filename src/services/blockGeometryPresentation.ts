import type { BlockData } from '../types/sysml_types';

export interface BlockPresentationCoordinates { x?: number; y?: number; width?: number; height?: number; }

/** Maps a block geometry patch (BDD x/y/width/height or IBD context ibdX/ibdY/ibdWidth/ibdHeight) to diagram presentation coordinates. */
export function presentationFromBlockGeometry(updates: Partial<BlockData>): BlockPresentationCoordinates {
  const presentation: BlockPresentationCoordinates = {};
  if (updates.x !== undefined || updates.ibdX !== undefined) presentation.x = updates.x ?? updates.ibdX;
  if (updates.y !== undefined || updates.ibdY !== undefined) presentation.y = updates.y ?? updates.ibdY;
  if (updates.width !== undefined || updates.ibdWidth !== undefined) presentation.width = updates.width ?? updates.ibdWidth;
  if (updates.height !== undefined || updates.ibdHeight !== undefined) presentation.height = updates.height ?? updates.ibdHeight;
  return presentation;
}
