import React, { memo, useMemo } from 'react';
import type { BlockData, RelationshipData, PartData, ConnectorData } from '../../types/sysml_types';

export type BddDiagramEdgeNotation =
  | 'solid-line'
  | 'filled-diamond'
  | 'hollow-diamond'
  | 'hollow-triangle'
  | 'dashed-arrow';

export type IbdDiagramEdgeNotation = 'assembly-solid' | 'delegation-solid' | 'binding-dashed';

export type DiagramEdgeNotation = BddDiagramEdgeNotation | IbdDiagramEdgeNotation;

export type BddRelationshipKind = 'association' | 'composition' | 'sharedAggregation' | 'generalization' | 'dependency' | 'allocation';

export type IbdConnectorKind = 'assembly' | 'delegation' | 'binding';

/**
 * BDD-only relation notation (OMG SysML 1.6). Mirrors the canonical lookup in
 * src/engine/sysml/bdd.ts without importing engine code into the component
 * layer, so BDD symbols stay disjoint from IBD connector symbols.
 */
export function bddRelationshipNotation(kind: BddRelationshipKind | string): BddDiagramEdgeNotation {
  if (kind === 'composition') return 'filled-diamond';
  if (kind === 'sharedAggregation') return 'hollow-diamond';
  if (kind === 'generalization') return 'hollow-triangle';
  if (kind === 'dependency' || kind === 'allocation') return 'dashed-arrow';
  return 'solid-line';
}

/**
 * IBD-only connector notation (OMG SysML 1.6). Mirrors connectorNotationFor
 * in src/engine/sysml/ibd.ts; intentionally disjoint from BDD notations.
 */
export function ibdConnectorNotation(kind: IbdConnectorKind | string): IbdDiagramEdgeNotation {
  if (kind === 'delegation') return 'delegation-solid';
  if (kind === 'binding') return 'binding-dashed';
  return 'assembly-solid';
}

/**
 * Select edge notation by diagram kind so BDD relations and IBD connectors
 * can never share symbols: 'bdd' always yields a BDD relation notation,
 * 'ibd' always yields an IBD connector notation.
 */
export function diagramEdgeNotation(diagram: 'bdd' | 'ibd', kind: string): DiagramEdgeNotation {
  return diagram === 'ibd' ? ibdConnectorNotation(kind) : bddRelationshipNotation(kind as BddRelationshipKind);
}

export interface DiagramViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  overscan?: number;
}

export interface SpatialBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisibleElementSet {
  visibleBlocks: BlockData[];
  visibleRelationships: RelationshipData[];
  visibleParts: PartData[];
  visibleConnectors: ConnectorData[];
  visibleIds: Set<string>;
  isDegradedMode: boolean;
}

/**
 * 2D spatial grid index for fast O(1) viewport culling.
 * Divides world coordinates into cells and maps bounding boxes to intersecting cells.
 */
export class DiagramSpatialGrid {
  private cellSize: number;
  private cells: Map<string, Set<string>> = new Map();
  private boundsMap: Map<string, SpatialBounds> = new Map();

  constructor(cellSize = 500) {
    this.cellSize = cellSize > 0 ? cellSize : 500;
  }

  private cellKey(col: number, row: number): string {
    return `${col}:${row}`;
  }

  private getCellRange(x: number, y: number, width: number, height: number): {
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  } {
    const minCol = Math.floor(x / this.cellSize);
    const maxCol = Math.floor((x + width) / this.cellSize);
    const minRow = Math.floor(y / this.cellSize);
    const maxRow = Math.floor((y + height) / this.cellSize);
    return { minCol, maxCol, minRow, maxRow };
  }

  public insert(bounds: SpatialBounds): void {
    this.remove(bounds.id);
    this.boundsMap.set(bounds.id, bounds);

    const { minCol, maxCol, minRow, maxRow } = this.getCellRange(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const key = this.cellKey(c, r);
        let set = this.cells.get(key);
        if (!set) {
          set = new Set();
          this.cells.set(key, set);
        }
        set.add(bounds.id);
      }
    }
  }

  public remove(id: string): void {
    const existing = this.boundsMap.get(id);
    if (!existing) return;

    const { minCol, maxCol, minRow, maxRow } = this.getCellRange(
      existing.x,
      existing.y,
      existing.width,
      existing.height,
    );

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const key = this.cellKey(c, r);
        const set = this.cells.get(key);
        if (set) {
          set.delete(id);
          if (set.size === 0) {
            this.cells.delete(key);
          }
        }
      }
    }
    this.boundsMap.delete(id);
  }

  public update(bounds: SpatialBounds): void {
    this.insert(bounds);
  }

  public clear(): void {
    this.cells.clear();
    this.boundsMap.clear();
  }

  public get size(): number {
    return this.boundsMap.size;
  }

  /**
   * Query all element IDs intersecting the given box (e.g. viewport + overscan).
   */
  public query(box: { x: number; y: number; width: number; height: number }): Set<string> {
    const result = new Set<string>();
    const { minCol, maxCol, minRow, maxRow } = this.getCellRange(
      box.x,
      box.y,
      box.width,
      box.height,
    );

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const key = this.cellKey(c, r);
        const set = this.cells.get(key);
        if (set) {
          for (const id of set) {
            // Refine intersection against exact bounds
            const b = this.boundsMap.get(id);
            if (b) {
              if (
                b.x <= box.x + box.width &&
                b.x + b.width >= box.x &&
                b.y <= box.y + box.height &&
                b.y + b.height >= box.y
              ) {
                result.add(id);
              }
            }
          }
        }
      }
    }
    return result;
  }
}

/**
 * Compute the world-space bounding box for the current viewport, with configurable overscan.
 */
export function computeViewportBounds(
  view: { scale: number; offsetX: number; offsetY: number },
  container: { width: number; height: number },
  overscan = 200,
): DiagramViewport {
  const scale = Math.max(0.01, view.scale);
  const x = -view.offsetX / scale;
  const y = -view.offsetY / scale;
  const width = Math.max(1, container.width) / scale;
  const height = Math.max(1, container.height) / scale;
  return { x, y, width, height, scale, overscan };
}

export interface EdgeEndpointIndex {
  relationshipsByEndpoint: Map<string, RelationshipData[]>;
  connectorsByPart: Map<string, ConnectorData[]>;
}

const edgeIndexCache = new WeakMap<readonly RelationshipData[], EdgeEndpointIndex>();

export function getOrCreateEdgeEndpointIndex(
  relationships: readonly RelationshipData[],
  connectors: readonly ConnectorData[],
): EdgeEndpointIndex {
  let index = edgeIndexCache.get(relationships);
  if (!index) {
    const relationshipsByEndpoint = new Map<string, RelationshipData[]>();
    const connectorsByPart = new Map<string, ConnectorData[]>();

    for (const rel of relationships) {
      let s = relationshipsByEndpoint.get(rel.sourceId);
      if (!s) {
        s = [];
        relationshipsByEndpoint.set(rel.sourceId, s);
      }
      s.push(rel);

      if (rel.targetId !== rel.sourceId) {
        let t = relationshipsByEndpoint.get(rel.targetId);
        if (!t) {
          t = [];
          relationshipsByEndpoint.set(rel.targetId, t);
        }
        t.push(rel);
      }
    }

    for (const conn of connectors) {
      let s = connectorsByPart.get(conn.sourcePartId);
      if (!s) {
        s = [];
        connectorsByPart.set(conn.sourcePartId, s);
      }
      s.push(conn);

      if (conn.targetPartId !== conn.sourcePartId) {
        let t = connectorsByPart.get(conn.targetPartId);
        if (!t) {
          t = [];
          connectorsByPart.set(conn.targetPartId, t);
        }
        t.push(conn);
      }
    }

    index = { relationshipsByEndpoint, connectorsByPart };
    edgeIndexCache.set(relationships, index);
  }
  return index;
}

export interface CullElementsOptions {
  edgeIndex?: EdgeEndpointIndex;
  ibdContextBlockId?: string;
  storeRevision?: number;
}

let lastCullRevision: number | undefined = undefined;
let lastCullResult: VisibleElementSet | null = null;

/**
 * Cull diagram elements against the active viewport using the spatial index and indexed edge culling.
 * Automatically enables degraded rendering mode for very large models.
 */
export function cullElements(
  viewport: DiagramViewport,
  blocks: readonly BlockData[],
  relationships: readonly RelationshipData[],
  parts: readonly PartData[],
  connectors: readonly ConnectorData[],
  spatialGrid?: DiagramSpatialGrid,
  performanceModeThreshold = 500,
  options?: CullElementsOptions,
): VisibleElementSet {
  const overscan = viewport.overscan ?? 200;
  const queryBox = {
    x: viewport.x - overscan,
    y: viewport.y - overscan,
    width: viewport.width + overscan * 2,
    height: viewport.height + overscan * 2,
  };

  const totalEntities = blocks.length + parts.length;
  const isDegradedMode = totalEntities >= performanceModeThreshold;

  // Use provided or transient spatial grid
  const grid = spatialGrid ?? new DiagramSpatialGrid(500);
  if (!spatialGrid) {
    for (const b of blocks) {
      grid.insert({
        id: b.id,
        x: b.x,
        y: b.y,
        width: b.width || 150,
        height: b.height || 100,
      });
    }
    for (const p of parts) {
      grid.insert({
        id: p.id,
        x: p.x,
        y: p.y,
        width: p.width || 120,
        height: p.height || 60,
      });
    }
  }

  // Query visible nodes
  const visibleCandidateIds = grid.query(queryBox);
  const visibleIds = new Set<string>();

  // Resolve grid candidates through maps instead of rescanning every entity
  // and checking Set membership. This keeps culling proportional to the
  // viewport candidate count for large models.
  const entityById = new Map<string, BlockData | PartData>();
  for (const block of blocks) entityById.set(block.id, block);
  for (const part of parts) entityById.set(part.id, part);
  const visibleBlocks: BlockData[] = [];
  const visibleParts: PartData[] = [];
  for (const id of visibleCandidateIds) {
    const entity = entityById.get(id);
    if (entity && 'stereotype' in entity) {
      const block = entity as BlockData;
      visibleBlocks.push(block);
      visibleIds.add(id);
      continue;
    }
    if (entity) {
      const part = entity as PartData;
      visibleParts.push(part);
      visibleIds.add(id);
    }
  }

  // Edge culling via endpoint indexes
  const edgeIndex = options?.edgeIndex ?? getOrCreateEdgeEndpointIndex(relationships, connectors);
  const visibleRelationships: RelationshipData[] = [];
  const visibleConnectors: ConnectorData[] = [];
  const seenRels = new Set<string>();
  const seenConns = new Set<string>();

  const queryEndpoints = new Set(visibleIds);
  if (options?.ibdContextBlockId) {
    queryEndpoints.add(options.ibdContextBlockId);
  }

  for (const endpointId of queryEndpoints) {
    const rels = edgeIndex.relationshipsByEndpoint.get(endpointId);
    if (rels) {
      for (const rel of rels) {
        if (!seenRels.has(rel.id)) {
          seenRels.add(rel.id);
          visibleRelationships.push(rel);
          visibleIds.add(rel.id);
        }
      }
    }

    const conns = edgeIndex.connectorsByPart.get(endpointId);
    if (conns) {
      for (const conn of conns) {
        if (!seenConns.has(conn.id)) {
          seenConns.add(conn.id);
          visibleConnectors.push(conn);
          visibleIds.add(conn.id);
        }
      }
    }
  }

  // Reference stability check: return previous result reference if visible elements haven't changed
  if (
    options?.storeRevision !== undefined &&
    lastCullRevision === options.storeRevision &&
    lastCullResult &&
    lastCullResult.visibleIds.size === visibleIds.size &&
    [...visibleIds].every(id => lastCullResult!.visibleIds.has(id))
  ) {
    return lastCullResult;
  }

  const result: VisibleElementSet = {
    visibleBlocks,
    visibleRelationships,
    visibleParts,
    visibleConnectors,
    visibleIds,
    isDegradedMode,
  };

  if (options?.storeRevision !== undefined) {
    lastCullRevision = options.storeRevision;
    lastCullResult = result;
  }

  return result;
}

/**
 * Custom React hook for viewport culling and spatial indexing of SysML diagrams.
 */
export function useDiagramVirtualization(
  viewport: DiagramViewport,
  blocks: readonly BlockData[],
  relationships: readonly RelationshipData[],
  parts: readonly PartData[],
  connectors: readonly ConnectorData[],
  performanceModeThreshold = 500,
): VisibleElementSet {
  // Build and maintain spatial index
  const spatialGrid = useMemo(() => {
    const grid = new DiagramSpatialGrid(500);
    for (const b of blocks) {
      grid.insert({
        id: b.id,
        x: b.x,
        y: b.y,
        width: b.width || 150,
        height: b.height || 100,
      });
    }
    for (const p of parts) {
      grid.insert({
        id: p.id,
        x: p.x,
        y: p.y,
        width: p.width || 120,
        height: p.height || 60,
      });
    }
    return grid;
  }, [blocks, parts]);

  return useMemo(() => {
    return cullElements(
      viewport,
      blocks,
      relationships,
      parts,
      connectors,
      spatialGrid,
      performanceModeThreshold,
    );
  }, [viewport, blocks, relationships, parts, connectors, spatialGrid, performanceModeThreshold]);
}
