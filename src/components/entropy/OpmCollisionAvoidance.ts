/**
 * Collision resolution engine for OPM diagrams.
 * Detects AABB (axis-aligned bounding box) overlaps between blocks and calculates
 * smooth minimal-translation escape vectors so blocks never overlap.
 */

export interface RectBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function checkOverlap(a: RectBounds, b: RectBounds, pad: number = 10): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    a.x >= b.x + b.width + pad ||
    a.y + a.height + pad <= b.y ||
    a.y >= b.y + b.height + pad
  );
}

export function resolveBlockOverlap(
  movingNode: RectBounds,
  otherNodes: RectBounds[],
  padding: number = 16
): { x: number; y: number; collided: boolean } {
  let currentX = movingNode.x;
  let currentY = movingNode.y;
  let collided = false;

  // Perform up to 10 relaxation passes to handle clusters
  for (let iteration = 0; iteration < 10; iteration++) {
    let hadCollisionThisPass = false;

    for (const other of otherNodes) {
      if (other.id === movingNode.id) continue;

      const currentBounds: RectBounds = {
        id: movingNode.id,
        x: currentX,
        y: currentY,
        width: movingNode.width,
        height: movingNode.height,
      };

      if (checkOverlap(currentBounds, other, padding)) {
        collided = true;
        hadCollisionThisPass = true;

        // Overlap distances on each cardinal direction
        const overlapRight = (other.x + other.width + padding) - currentX;
        const overlapLeft = (currentX + movingNode.width + padding) - other.x;
        const overlapBottom = (other.y + other.height + padding) - currentY;
        const overlapTop = (currentY + movingNode.height + padding) - other.y;

        const minOverlap = Math.min(overlapRight, overlapLeft, overlapBottom, overlapTop);

        if (minOverlap === overlapRight) {
          currentX = other.x + other.width + padding;
        } else if (minOverlap === overlapLeft) {
          currentX = other.x - movingNode.width - padding;
        } else if (minOverlap === overlapBottom) {
          currentY = other.y + other.height + padding;
        } else {
          currentY = other.y - movingNode.height - padding;
        }
      }
    }

    if (!hadCollisionThisPass) break;
  }

  return { x: Math.round(currentX), y: Math.round(currentY), collided };
}
