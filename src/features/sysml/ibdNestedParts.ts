import type { PropertyDefinition, SysmlRepository } from '../../engine/sysml/model';
import { connectorEndOf } from '../../engine/sysml/connectorEnds';
import { effectiveSupertypeIds } from '../../engine/sysml/services/supertypes';
import { PATH_SEPARATOR } from '../../engine/sysml/partOccurrences';
import type { PartData } from '../../types/sysml_types';

/**
 * Nested parts on an IBD (SysML 1.6 §8.3.2.2): the parts of a part's own type are drawn inside its
 * symbol, so a connector end that runs through a property path (`engine/crankshaft`) is something
 * the user can see and click. A nested part's id is its path string (`path.join('/')`), the same
 * key the connector end and the IBD presentation use.
 *
 * Everything here is pure: it takes the repository (for the Block properties) and the parts the
 * diagram already shows, and returns the parts to draw with their absolute canvas geometry.
 */
export const DEFAULT_NESTED_PART_DEPTH = 1;
export const MAX_NESTED_PART_DEPTH = 4;

export interface NestedPartOptions {
  /** Draw a part's own parts inside its symbol. */
  enabled: boolean;
  /** Levels of nesting to draw below each top-level part (1 = a part's own parts only). */
  depth?: number;
}

const HEADER = 34;
const PAD = 8;
const GAP = 8;
const MIN_WIDTH = 150;
const MIN_HEIGHT = 100;
const LEAF_WIDTH = 120;
const LEAF_HEIGHT = 70;

/** Part and reference properties of a Block that are typed by a Block, own ones first, then inherited ones. */
export function structuralPropertiesOf(repo: SysmlRepository, blockId: string): PropertyDefinition[] {
  const result: PropertyDefinition[] = [];
  const seenProperties = new Set<string>();
  const visitedBlocks = new Set<string>();
  const queue = [blockId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visitedBlocks.has(id)) continue;
    visitedBlocks.add(id);
    const definition = repo.definitions[id];
    if (definition?.kind !== 'block') continue;
    for (const property of definition.properties) {
      if ((property.kind !== 'part' && property.kind !== 'reference') || seenProperties.has(property.id)) continue;
      if (repo.definitions[property.typeId]?.kind !== 'block') continue;
      seenProperties.add(property.id);
      result.push(property);
    }
    queue.push(...effectiveSupertypeIds(repo, id));
  }
  return result;
}

interface Size { width: number; height: number }

interface Node {
  property: PropertyDefinition;
  size: Size;
  children: Node[];
}

/** The tree of parts below a Block, `depth` levels deep; a Block that contains itself stops where it repeats. */
function buildTree(repo: SysmlRepository, blockId: string, depth: number, ancestors: ReadonlySet<string>): Node[] {
  if (depth <= 0) return [];
  const nextAncestors = new Set(ancestors).add(blockId);
  return structuralPropertiesOf(repo, blockId)
    .filter(property => !nextAncestors.has(property.typeId))
    .map(property => {
      const children = buildTree(repo, property.typeId, depth - 1, nextAncestors);
      return { property, children, size: sizeOfNode(children, LEAF_WIDTH, LEAF_HEIGHT) };
    });
}

function gridOf(count: number): { columns: number; rows: number } {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return { columns, rows: Math.ceil(count / columns) };
}

/** Size a symbol needs to hold its children in a grid below the header, never smaller than the base size. */
function sizeOfNode(children: readonly Node[], baseWidth: number, baseHeight: number): Size {
  if (children.length === 0) return { width: baseWidth, height: baseHeight };
  const { columns, rows } = gridOf(children.length);
  const cellWidth = Math.max(...children.map(child => child.size.width));
  const cellHeight = Math.max(...children.map(child => child.size.height));
  return {
    width: Math.max(baseWidth, PAD * 2 + columns * cellWidth + (columns - 1) * GAP),
    height: Math.max(baseHeight, HEADER + PAD + rows * cellHeight + (rows - 1) * GAP + PAD),
  };
}

function placeChildren(
  parentKey: string,
  parent: { x: number; y: number; width: number; height: number },
  children: readonly Node[],
  out: PartData[],
): void {
  if (children.length === 0) return;
  const { columns, rows } = gridOf(children.length);
  const cellWidth = Math.max(...children.map(child => child.size.width));
  const cellHeight = Math.max(...children.map(child => child.size.height));
  const usedWidth = columns * cellWidth + (columns - 1) * GAP;
  const usedHeight = rows * cellHeight + (rows - 1) * GAP;
  // The grid is centred in the room below the header; the parent has already been grown to fit it.
  const originX = parent.x + Math.max(PAD, (parent.width - usedWidth) / 2);
  const originY = parent.y + HEADER + Math.max(PAD, (parent.height - HEADER - usedHeight) / 2);
  children.forEach((child, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const key = `${parentKey}${PATH_SEPARATOR}${child.property.id}`;
    const box = {
      x: originX + column * (cellWidth + GAP),
      y: originY + row * (cellHeight + GAP),
      width: cellWidth,
      height: cellHeight,
    };
    out.push({
      id: key,
      propertyId: child.property.id,
      name: child.property.name,
      blockId: parentKey,
      parentBlockId: parentKey,
      parentPartId: parentKey,
      typeId: child.property.typeId,
      typeBlockId: child.property.typeId,
      aggregation: child.property.kind === 'reference' ? 'reference' : 'composite',
      multiplicity: multiplicityText(child.property),
      satisfiedReqIds: [],
      ...box,
    });
    placeChildren(key, box, child.children, out);
  });
}

function multiplicityText(property: PropertyDefinition): string {
  const { lower, upper } = property.multiplicity;
  if (lower === 1 && upper === 1) return '1';
  return lower === upper ? String(lower) : `${lower}..${upper}`;
}

/** The deepest property path any connector of the context has below a top-level part (a path of length 2 is one level down). */
export function connectorNestingDepth(repo: SysmlRepository, contextId: string): number {
  let depth = 0;
  for (const connector of Object.values(repo.connectors)) {
    if (connector.ownerId !== contextId) continue;
    for (const side of ['source', 'target'] as const) {
      const end = connectorEndOf(connector, side);
      if (end) depth = Math.max(depth, end.path.length - 1);
    }
  }
  return depth;
}

/**
 * The parts an IBD draws: the top-level parts of the context, grown where needed to hold their own
 * parts, and (when enabled) those nested parts with absolute geometry. Parts the projection derived
 * for nested connector ends (they carry a `parentPartId` and no geometry) are replaced by the laid-out ones.
 * Levels shown are `depth`, raised to the deepest nesting a connector of the context needs so no
 * connector is left without its end.
 */
export function layoutIbdNestedParts(
  repo: SysmlRepository,
  contextId: string,
  parts: readonly PartData[],
  options: NestedPartOptions,
): PartData[] {
  const topLevel = parts.filter(part => !part.parentPartId);
  if (!options.enabled) return topLevel.slice();
  const depth = Math.min(
    MAX_NESTED_PART_DEPTH,
    Math.max(options.depth ?? DEFAULT_NESTED_PART_DEPTH, connectorNestingDepth(repo, contextId)),
  );
  const result: PartData[] = [];
  const nested: PartData[] = [];
  for (const part of topLevel) {
    if (part.blockId !== contextId || !part.typeId) {
      result.push(part);
      continue;
    }
    const tree = buildTree(repo, part.typeId, depth, new Set());
    const needed = sizeOfNode(tree, MIN_WIDTH, MIN_HEIGHT);
    const grown = tree.length === 0
      ? part
      : { ...part, width: Math.max(part.width, needed.width), height: Math.max(part.height, needed.height) };
    result.push(grown);
    placeChildren(part.id, grown, tree, nested);
  }
  return [...result, ...nested];
}

/** Parts of the IBD that are drawn: top-level ones of the context, and the nested ones inside them. */
export function isDrawnInIbd(part: PartData, contextId: string): boolean {
  return part.blockId === contextId || Boolean(part.parentPartId);
}
