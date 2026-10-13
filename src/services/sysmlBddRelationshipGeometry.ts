export interface Point {
  x: number;
  y: number;
}

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export interface BddPropertyLayout {
  id: string;
  name?: string;
  typeId?: string;
  typeName?: string;
  localY?: number;
}

export interface BddBlockLayout {
  id: string;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: readonly BddPropertyLayout[];
}

export type BddRelationshipGeometryErrorCode =
  | 'SELF_LINK_NOT_ALLOWED'
  | 'STALE_OWNER_ID'
  | 'STALE_TARGET_ID'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_TYPE_MISMATCH'
  | 'GEOMETRY_UNRESOLVABLE';

export interface BddRelationshipGeometryDiagnostic {
  code: BddRelationshipGeometryErrorCode;
  message: string;
}

export interface ResolveBddRelationshipGeometryInput {
  propertyId: string;
  ownerBlockId: string;
  targetBlockId: string;
  blocks: readonly BddBlockLayout[];
  viewport?: ViewportTransform;
  allowFallback?: boolean;
}

export interface BddRelationshipGeometryResult {
  ok: boolean;
  source?: Point;
  target?: Point;
  screenSource?: Point;
  screenTarget?: Point;
  labelPos?: Point;
  propertyLabelPos?: Point;
  path?: string;
  diagnostic?: BddRelationshipGeometryDiagnostic;
}

export interface BddParallelRoute {
  path: string;
  labelPos: Point;
}

/** Build a stable curved lane for multiple relationships sharing visible Blocks. */
export function calculateBddParallelRoute(
  source: Point,
  target: Point,
  edgeIndex = 0,
  totalEdges = 1,
): BddParallelRoute {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  if (totalEdges <= 1) {
    return { path: `M ${source.x} ${source.y} L ${target.x} ${target.y}`, labelPos: { x: midX, y: midY - 8 } };
  }
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;
  const offset = (edgeIndex - (totalEdges - 1) / 2) * 32;
  const control = { x: midX + nx * offset, y: midY + ny * offset };
  return {
    path: `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`,
    labelPos: { x: control.x, y: control.y - 8 },
  };
}

export interface ResolveBddPropertySourceAnchorInput {
  propertyId: string;
  ownerBlockId: string;
  toward: Point;
  blocks: readonly BddBlockLayout[];
}

/** Resolve a live-drag anchor on the actual property row, facing the pointer. */
export function resolveBddPropertySourceAnchor(
  input: ResolveBddPropertySourceAnchorInput,
): Point | undefined {
  const owner = input.blocks.find(block => block.id === input.ownerBlockId);
  if (!owner || !Number.isFinite(owner.x) || !Number.isFinite(owner.y)) return undefined;
  const propertyIndex = owner.properties?.findIndex(property => property.id === input.propertyId) ?? -1;
  if (propertyIndex < 0) return undefined;

  const width = owner.width && owner.width > 0 ? owner.width : 150;
  const property = owner.properties![propertyIndex];
  const localY = property.localY ?? (45 + propertyIndex * 12 + 6);
  if (!Number.isFinite(localY)) return undefined;

  return {
    x: input.toward.x >= owner.x + width / 2 ? owner.x + width : owner.x,
    y: owner.y + localY,
  };
}


/**
 * Calculates the intersection of a ray from `from` towards the center of `rect`
 * with the perimeter of `rect`. Returns the closest boundary point.
 */
function resolveBoundaryIntersection(
  rect: { x: number; y: number; width: number; height: number },
  from: Point,
): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = cx - from.x;
  const dy = cy - from.y;

  // Degenerate: from is already at center
  if (dx === 0 && dy === 0) {
    return { x: rect.x, y: cy };
  }

  const w = rect.width / 2;
  const h = rect.height / 2;
  const angle = Math.atan2(dy, dx);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  let edgeX = cx;
  let edgeY = cy;

  if (Math.abs(cosA) * h > Math.abs(sinA) * w) {
    // Intersects vertical boundary (left if cosA < 0, right if cosA > 0)
    edgeX = cx + (cosA > 0 ? -w : w);
    const tanA = sinA / (cosA || 1e-9);
    edgeY = cy + (edgeX - cx) * tanA;
  } else {
    // Intersects horizontal boundary (top if sinA < 0, bottom if sinA > 0)
    edgeY = cy + (sinA > 0 ? -h : h);
    const cotA = cosA / (sinA || 1e-9);
    edgeX = cx + (edgeY - cy) * cotA;
  }

  // Clamp to boundary rectangle
  edgeX = Math.max(rect.x, Math.min(rect.x + rect.width, edgeX));
  edgeY = Math.max(rect.y, Math.min(rect.y + rect.height, edgeY));

  return { x: edgeX, y: edgeY };
}

/**
 * Resolves diagram-space and viewport-transformed coordinates for a BDD
 * Association connecting a typed property row on an owner Block to a target Block.
 *
 * Guarantees:
 * - Edge source anchors to the specific property row on the owner Block.
 * - Edge target anchors to the boundary of the target Block.
 * - Missing or invalid data returns a structured diagnostic.
 * - Never returns (0, 0) as a fabricated coordinate.
 */
export function resolveBddPropertyRelationshipGeometry(
  input: ResolveBddRelationshipGeometryInput,
): BddRelationshipGeometryResult {
  const { propertyId, ownerBlockId, targetBlockId, blocks, viewport, allowFallback = false } = input;

  if (ownerBlockId === targetBlockId) {
    return {
      ok: false,
      diagnostic: {
        code: 'SELF_LINK_NOT_ALLOWED',
        message: 'A Block cannot connect an association property to itself.',
      },
    };
  }

  const owner = blocks.find(b => b.id === ownerBlockId);
  if (!owner) {
    return {
      ok: false,
      diagnostic: {
        code: 'STALE_OWNER_ID',
        message: `Owner Block "${ownerBlockId}" does not exist in diagram layout.`,
      },
    };
  }

  const target = blocks.find(b => b.id === targetBlockId);
  if (!target) {
    return {
      ok: false,
      diagnostic: {
        code: 'STALE_TARGET_ID',
        message: `Target Block "${targetBlockId}" does not exist in diagram layout.`,
      },
    };
  }

  if (
    !Number.isFinite(owner.x) ||
    !Number.isFinite(owner.y) ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y)
  ) {
    return {
      ok: false,
      diagnostic: {
        code: 'GEOMETRY_UNRESOLVABLE',
        message: 'Block coordinates are missing or non-finite.',
      },
    };
  }

  const ownerWidth = owner.width && owner.width > 0 ? owner.width : 150;
  const ownerHeight = owner.height && owner.height > 0 ? owner.height : 100;
  const targetWidth = target.width && target.width > 0 ? target.width : 150;
  const targetHeight = target.height && target.height > 0 ? target.height : 100;

  const propIndex = owner.properties?.findIndex(p => p.id === propertyId) ?? -1;
  const prop = propIndex >= 0 ? owner.properties![propIndex] : undefined;

  if (!prop) {
    if (allowFallback) {
      // Safe fallback to owner compartment header, never (0,0)
      const fallbackSource: Point = {
        x: owner.x + ownerWidth,
        y: owner.y + 45,
      };
      const fallbackTarget = resolveBoundaryIntersection(
        { x: target.x, y: target.y, width: targetWidth, height: targetHeight },
        fallbackSource,
      );
      return {
        ok: false,
        source: fallbackSource,
        target: fallbackTarget,
        labelPos: {
          x: (fallbackSource.x + fallbackTarget.x) / 2,
          y: (fallbackSource.y + fallbackTarget.y) / 2 - 8,
        },
        propertyLabelPos: {
          x: fallbackSource.x + 24,
          y: fallbackSource.y - 8,
        },
        diagnostic: {
          code: 'PROPERTY_NOT_FOUND',
          message: `Property "${propertyId}" was not found on Block "${ownerBlockId}".`,
        },
      };
    }
    return {
      ok: false,
      diagnostic: {
        code: 'PROPERTY_NOT_FOUND',
        message: `Property "${propertyId}" was not found on Block "${ownerBlockId}".`,
      },
    };
  }

  // Type compatibility check: property type must match target block id or name
  const matchesTarget =
    (prop.typeId && (prop.typeId === target.id || prop.typeId === target.name)) ||
    (prop.typeName && (prop.typeName === target.name || prop.typeName === target.id));

  if (!matchesTarget) {
    return {
      ok: false,
      diagnostic: {
        code: 'PROPERTY_TYPE_MISMATCH',
        message: `Property "${prop.name || propertyId}" is typed by "${prop.typeName || prop.typeId}", but dropped on Block "${target.name || target.id}".`,
      },
    };
  }

  // Calculate row local Y within the owner Block
  // Standard BDD compartment header is at y=45, each row is 12px high, vertical center at +6px
  const localRowY = prop.localY !== undefined ? prop.localY : 45 + propIndex * 12 + 6;
  const sourceY = owner.y + localRowY;

  // Determine if target is to the right or left of owner block to pick the exiting boundary
  const ownerCenterX = owner.x + ownerWidth / 2;
  const targetCenterX = target.x + targetWidth / 2;
  const targetIsRight = targetCenterX >= ownerCenterX;

  const sourceX = targetIsRight ? owner.x + ownerWidth : owner.x;
  const sourcePoint: Point = { x: sourceX, y: sourceY };

  // Calculate target boundary intersection
  const targetPoint: Point = resolveBoundaryIntersection(
    { x: target.x, y: target.y, width: targetWidth, height: targetHeight },
    sourcePoint,
  );

  const path = `M ${sourcePoint.x} ${sourcePoint.y} L ${targetPoint.x} ${targetPoint.y}`;

  // Viewport transforms (pan & zoom)
  let screenSource: Point | undefined;
  let screenTarget: Point | undefined;
  if (viewport) {
    const { panX = 0, panY = 0, zoom = 1 } = viewport;
    screenSource = {
      x: sourcePoint.x * zoom + panX,
      y: sourcePoint.y * zoom + panY,
    };
    screenTarget = {
      x: targetPoint.x * zoom + panX,
      y: targetPoint.y * zoom + panY,
    };
  }

  const labelPos: Point = {
    x: (sourcePoint.x + targetPoint.x) / 2,
    y: (sourcePoint.y + targetPoint.y) / 2 - 8,
  };
  const propertyLabelPos: Point = {
    x: sourcePoint.x + (targetIsRight ? 24 : -24),
    y: sourcePoint.y - 8,
  };

  return {
    ok: true,
    source: sourcePoint,
    target: targetPoint,
    screenSource,
    screenTarget,
    labelPos,
    propertyLabelPos,
    path,
  };
}
