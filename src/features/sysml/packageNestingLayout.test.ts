import { describe, expect, it } from 'vitest';
import {
  PACKAGE_HEADER_HEIGHT,
  containmentPaths,
  findDropTargetPackage,
  fitPackageAroundMembers,
  layoutMembersInside,
  nestedDescendantIds,
  packageDrawOrder,
  resolveDropOwnershipChange,
  type NestingNode,
} from './packageNestingLayout';

const outer: NestingNode = { id: 'outer', ownerId: 'model', x: 0, y: 0, width: 600, height: 400, isPackage: true };
const inner: NestingNode = { id: 'inner', ownerId: 'outer', x: 20, y: 60, width: 250, height: 200, isPackage: true };
const block: NestingNode = { id: 'block', ownerId: 'inner', x: 40, y: 110, width: 100, height: 60, isPackage: false };
const loose: NestingNode = { id: 'loose', ownerId: 'outer', x: 800, y: 0, width: 100, height: 60, isPackage: false };
const nodes = [outer, inner, block, loose];

describe('packageNestingLayout', () => {
  it('derives nested descendants from ownership plus geometry', () => {
    expect(nestedDescendantIds('outer', nodes)).toEqual(['inner', 'block']);
    expect(nestedDescendantIds('inner', nodes)).toEqual(['block']);
  });

  it('draws a containment path only for an owned element shown outside its owner', () => {
    expect(containmentPaths(nodes)).toEqual([{ ownerId: 'outer', ownedId: 'loose' }]);
  });

  it('finds the innermost package under the drop point, never the element itself or its contents', () => {
    expect(findDropTargetPackage('x', { x: 50, y: 100, width: 10, height: 10 }, nodes)?.id).toBe('inner');
    expect(findDropTargetPackage('x', { x: 400, y: 300, width: 10, height: 10 }, nodes)?.id).toBe('outer');
    // Dragging 'outer' over its own nested 'inner' is not a valid target.
    expect(findDropTargetPackage('outer', { x: 50, y: 100, width: 10, height: 10 }, nodes)).toBeUndefined();
  });

  it('implies a move into a different package, a move out of a nested owner, and nothing for a plain reposition', () => {
    const base = { nodes, diagramOwnerId: 'model' };
    expect(resolveDropOwnershipChange({ ...base, elementId: 'loose', currentOwnerId: 'outer', before: loose, after: { ...loose, x: 60, y: 120 } })).toBe('inner');
    expect(resolveDropOwnershipChange({ ...base, elementId: 'block', currentOwnerId: 'inner', before: block, after: { ...block, x: 1000, y: 900 } })).toBe('model');
    expect(resolveDropOwnershipChange({ ...base, elementId: 'block', currentOwnerId: 'inner', before: block, after: { ...block, x: 50 } })).toBeUndefined();
    // Never nested before (shown outside its owner): moving it on the empty canvas keeps its owner.
    expect(resolveDropOwnershipChange({ ...base, elementId: 'loose', currentOwnerId: 'outer', before: loose, after: { ...loose, x: 900 } })).toBeUndefined();
  });

  it('orders packages outer-first', () => {
    expect(packageDrawOrder([inner, outer]).map(node => node.id)).toEqual(['outer', 'inner']);
  });

  it('places members below the package header and grows the package to fit', () => {
    const pkg = { x: 100, y: 100, width: 220, height: 140 };
    const placed = layoutMembersInside(pkg, [{ id: 'a', width: 160, height: 100 }, { id: 'b', width: 160, height: 100 }]);
    expect(placed.a.y).toBe(100 + PACKAGE_HEADER_HEIGHT);
    expect(placed.b.x).toBeGreaterThan(placed.a.x + placed.a.width);
    const grown = fitPackageAroundMembers(pkg, Object.values(placed));
    for (const member of Object.values(placed)) {
      expect(member.x + member.width).toBeLessThanOrEqual(grown.x + grown.width);
      expect(member.y + member.height).toBeLessThanOrEqual(grown.y + grown.height);
    }
    expect(fitPackageAroundMembers(pkg, [])).toEqual(pkg);
  });
});
