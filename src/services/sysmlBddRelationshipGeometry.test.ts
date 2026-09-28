import { describe, expect, it } from 'vitest';
import {
  resolveBddPropertyRelationshipGeometry,
  type BddBlockLayout,
} from './sysmlBddRelationshipGeometry';

describe('sysmlBddRelationshipGeometry', () => {
  const blocks: BddBlockLayout[] = [
    {
      id: 'block-vehicle',
      name: 'Vehicle',
      x: 100,
      y: 150,
      width: 200,
      height: 180,
      properties: [
        {
          id: 'prop-engine',
          name: 'engine',
          typeId: 'block-engine',
          typeName: 'Engine',
          localY: 60, // explicitly nonzero local Y
        },
        {
          id: 'prop-wheel',
          name: 'wheels',
          typeId: 'block-wheel',
          typeName: 'Wheel',
          // default row index 1: 45 + 1 * 12 + 6 = 63
        },
      ],
    },
    {
      id: 'block-engine',
      name: 'Engine',
      x: 400,
      y: 200,
      width: 160,
      height: 120,
      properties: [],
    },
    {
      id: 'block-wheel',
      name: 'Wheel',
      x: 50,
      y: 400,
      width: 140,
      height: 100,
      properties: [],
    },
  ];

  it('resolves actual property row coordinate as source and target block boundary at nonzero origin, zoom, and pan', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-engine',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'block-engine',
      blocks,
      viewport: {
        panX: 50,
        panY: 30,
        zoom: 1.5,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostic).toBeUndefined();

    // Owner origin: (100, 150), width: 200. Target is to the right (x=400 > 100+200/2)
    // Source X must be owner right boundary: 100 + 200 = 300
    // Source Y must be owner Y + localY: 150 + 60 = 210
    expect(result.source).toEqual({ x: 300, y: 210 });

    // Target block is at (400, 200), width: 160, height: 120
    // Target left boundary is x = 400
    expect(result.target?.x).toBe(400);
    // Target Y must be on target boundary (between y=200 and y=320)
    expect(result.target?.y).toBeGreaterThanOrEqual(200);
    expect(result.target?.y).toBeLessThanOrEqual(320);

    // Screen coordinates with zoom=1.5, pan=(50, 30):
    // screenSource = (300 * 1.5 + 50, 210 * 1.5 + 30) = (500, 345)
    expect(result.screenSource).toEqual({ x: 500, y: 345 });
    expect(result.screenTarget?.x).toBeCloseTo(400 * 1.5 + 50);

    // Path must start at source and end at target
    expect(result.path).toBe(`M ${result.source!.x} ${result.source!.y} L ${result.target!.x} ${result.target!.y}`);
  });

  it('resolves property with default row index when localY is omitted', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-wheel',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'block-wheel',
      blocks,
    });

    expect(result.ok).toBe(true);
    // prop-wheel is index 1 -> localRowY = 45 + 1 * 12 + 6 = 63
    // Vehicle y = 150 -> sourceY = 213
    // Wheel center x = 50 + 70 = 120 < Vehicle center x = 100 + 100 = 200
    // So target is to the left -> source exits left edge: x = 100
    expect(result.source).toEqual({ x: 100, y: 213 });
    expect(result.target).toBeDefined();
    // Never fabricated (0, 0)
    expect(result.source).not.toEqual({ x: 0, y: 0 });
    expect(result.target).not.toEqual({ x: 0, y: 0 });
  });

  it('rejects self-link with SELF_LINK_NOT_ALLOWED and never returns (0,0)', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-engine',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'block-vehicle',
      blocks,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('SELF_LINK_NOT_ALLOWED');
    expect(result.source).toBeUndefined();
    expect(result.target).toBeUndefined();
    expect(result.source).not.toEqual({ x: 0, y: 0 });
  });

  it('rejects stale owner ID with STALE_OWNER_ID and never returns (0,0)', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-engine',
      ownerBlockId: 'nonexistent-owner',
      targetBlockId: 'block-engine',
      blocks,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('STALE_OWNER_ID');
    expect(result.source).toBeUndefined();
    expect(result.target).toBeUndefined();
  });

  it('rejects stale target ID with STALE_TARGET_ID and never returns (0,0)', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-engine',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'nonexistent-target',
      blocks,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('STALE_TARGET_ID');
    expect(result.source).toBeUndefined();
    expect(result.target).toBeUndefined();
  });

  it('rejects absent property row with PROPERTY_NOT_FOUND and never returns (0,0)', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-missing',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'block-engine',
      blocks,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('PROPERTY_NOT_FOUND');
    expect(result.source).toBeUndefined();
    expect(result.target).toBeUndefined();
  });

  it('supports safe owner compartment fallback when requested and never returns (0,0)', () => {
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-missing',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'block-engine',
      blocks,
      allowFallback: true,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('PROPERTY_NOT_FOUND');
    // Fallback anchors to owner compartment header: (100 + 200, 150 + 45) = (300, 195)
    expect(result.source).toEqual({ x: 300, y: 195 });
    expect(result.target?.x).toBe(400);
    expect(result.source).not.toEqual({ x: 0, y: 0 });
    expect(result.target).not.toEqual({ x: 0, y: 0 });
  });

  it('rejects property type mismatch with PROPERTY_TYPE_MISMATCH and never returns (0,0)', () => {
    // Attempt to drop 'engine' (typed by Engine) onto 'Wheel'
    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'prop-engine',
      ownerBlockId: 'block-vehicle',
      targetBlockId: 'block-wheel',
      blocks,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('PROPERTY_TYPE_MISMATCH');
    expect(result.source).toBeUndefined();
    expect(result.target).toBeUndefined();
  });

  it('rejects degenerate/unresolvable coordinates with GEOMETRY_UNRESOLVABLE', () => {
    const degenerateBlocks: BddBlockLayout[] = [
      {
        id: 'block-bad',
        x: NaN,
        y: Infinity,
        properties: [{ id: 'p1', typeId: 'b2' }],
      },
      {
        id: 'b2',
        x: 100,
        y: 100,
      },
    ];

    const result = resolveBddPropertyRelationshipGeometry({
      propertyId: 'p1',
      ownerBlockId: 'block-bad',
      targetBlockId: 'b2',
      blocks: degenerateBlocks,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic?.code).toBe('GEOMETRY_UNRESOLVABLE');
    expect(result.source).toBeUndefined();
    expect(result.target).toBeUndefined();
  });
});
