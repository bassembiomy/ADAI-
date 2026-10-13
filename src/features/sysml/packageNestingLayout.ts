/**
 * Package Diagram nesting (SysML 1.6 §7 / UML 2.5 §12.2.4).
 *
 * Nesting is derived, never stored: an element is drawn nested in a Package
 * symbol when its owning Package is presented on the same diagram and the
 * element's centre lies inside that symbol. When both are presented but the
 * element sits outside, the ownership is shown as a containment path (⊕).
 * Ownership itself only changes through the explicit moveElements command.
 */

export interface NestingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NestingNode extends NestingRect {
  id: string;
  ownerId?: string;
  isPackage: boolean;
}

/** Height of the package name tab + name line; members are placed below it. */
export const PACKAGE_HEADER_HEIGHT = 44;
export const PACKAGE_PADDING = 16;
const MEMBER_GAP = 24;

const center = (rect: NestingRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

export function rectContainsPoint(rect: NestingRect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** True when `node` is drawn nested inside its presented owner. */
export function isNestedInOwner(node: NestingNode, byId: ReadonlyMap<string, NestingNode>): boolean {
  if (!node.ownerId) return false;
  const owner = byId.get(node.ownerId);
  return Boolean(owner?.isPackage && rectContainsPoint(owner, center(node)));
}

/** All presented elements drawn (transitively) nested inside `packageId`. */
export function nestedDescendantIds(packageId: string, nodes: readonly NestingNode[]): string[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const result: string[] = [];
  const visit = (ownerId: string, seen: Set<string>) => {
    for (const node of nodes) {
      if (node.ownerId !== ownerId || seen.has(node.id) || !isNestedInOwner(node, byId)) continue;
      seen.add(node.id);
      result.push(node.id);
      if (node.isPackage) visit(node.id, seen);
    }
  };
  visit(packageId, new Set([packageId]));
  return result;
}

/**
 * Innermost presented Package symbol under the element's centre, excluding
 * the element itself and anything nested inside it (dropping a package into
 * its own contents would form an ownership cycle).
 */
export function findDropTargetPackage(
  elementId: string,
  rect: NestingRect,
  nodes: readonly NestingNode[],
): NestingNode | undefined {
  const excluded = new Set([elementId, ...nestedDescendantIds(elementId, nodes)]);
  const point = center(rect);
  return nodes
    .filter(node => node.isPackage && !excluded.has(node.id) && rectContainsPoint(node, point))
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
}

export interface DropOwnershipInput {
  elementId: string;
  currentOwnerId?: string;
  /** Element bounds before the drag (committed presentation). */
  before: NestingRect;
  /** Element bounds after the drag. */
  after: NestingRect;
  /** Presented nodes with their pre-drag geometry. */
  nodes: readonly NestingNode[];
  /** Owner of the diagram itself: the namespace for elements dropped on the empty canvas. */
  diagramOwnerId: string;
}

/**
 * Ownership change implied by a drop, or undefined when none is implied:
 * - dropped inside a Package symbol that is not its owner → move into it;
 * - dragged out of its owner's symbol onto the empty canvas → move to the diagram owner.
 * An element that was never nested (its owner is not presented) keeps its owner
 * when it is merely repositioned on the canvas.
 */
export function resolveDropOwnershipChange(input: DropOwnershipInput): string | undefined {
  const target = findDropTargetPackage(input.elementId, input.after, input.nodes);
  if (target) return target.id !== input.currentOwnerId ? target.id : undefined;
  const byId = new Map(input.nodes.map(node => [node.id, node]));
  const owner = input.currentOwnerId ? byId.get(input.currentOwnerId) : undefined;
  const wasNested = Boolean(owner?.isPackage && rectContainsPoint(owner, center(input.before)));
  if (wasNested && input.currentOwnerId !== input.diagramOwnerId) return input.diagramOwnerId;
  return undefined;
}

/** Containment paths (owner ⊕── owned) for presented pairs that are not drawn nested. */
export function containmentPaths(nodes: readonly NestingNode[]): Array<{ ownerId: string; ownedId: string }> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return nodes
    .filter(node => node.ownerId && byId.get(node.ownerId)?.isPackage && !isNestedInOwner(node, byId))
    .map(node => ({ ownerId: node.ownerId!, ownedId: node.id }));
}

/** Ownership depth among presented packages; outer packages draw first so nested ones stay on top. */
export function packageDrawOrder<T extends NestingNode>(packages: readonly T[]): T[] {
  const byId = new Map(packages.map(pkg => [pkg.id, pkg]));
  const depth = (pkg: T, seen = new Set<string>()): number => {
    if (!pkg.ownerId || seen.has(pkg.id)) return 0;
    const owner = byId.get(pkg.ownerId);
    if (!owner) return 0;
    seen.add(pkg.id);
    return 1 + depth(owner, seen);
  };
  return [...packages].sort((a, b) => depth(a) - depth(b));
}

/** Grid positions for members placed inside a package symbol, below its name. */
export function layoutMembersInside(
  pkg: NestingRect,
  sizes: ReadonlyArray<{ id: string; width: number; height: number }>,
  existingCount = 0,
  columns = 3,
): Record<string, NestingRect> {
  const cellWidth = Math.max(0, ...sizes.map(size => size.width)) + MEMBER_GAP;
  const cellHeight = Math.max(0, ...sizes.map(size => size.height)) + MEMBER_GAP;
  return Object.fromEntries(sizes.map((size, index) => {
    const slot = existingCount + index;
    return [size.id, {
      x: pkg.x + PACKAGE_PADDING + (slot % columns) * cellWidth,
      y: pkg.y + PACKAGE_HEADER_HEIGHT + Math.floor(slot / columns) * cellHeight,
      width: size.width,
      height: size.height,
    }];
  }));
}

/** Package bounds grown (never shrunk) so every member fits with padding. */
export function fitPackageAroundMembers(pkg: NestingRect, members: readonly NestingRect[]): NestingRect {
  if (members.length === 0) return pkg;
  const right = Math.max(pkg.x + pkg.width, ...members.map(m => m.x + m.width + PACKAGE_PADDING));
  const bottom = Math.max(pkg.y + pkg.height, ...members.map(m => m.y + m.height + PACKAGE_PADDING));
  return { x: pkg.x, y: pkg.y, width: right - pkg.x, height: bottom - pkg.y };
}
