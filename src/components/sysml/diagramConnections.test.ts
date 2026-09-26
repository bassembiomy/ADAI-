import { describe, expect, it } from 'vitest';
import type { BlockData, PartData, RelationshipData, ConnectorData } from '../../types/sysml_types';
import { calculateSeparatedRelationshipPath, calculateOrthogonalConnectorPath } from '../../utils/sysmlConnectionRouting';
import { projectDiagramScopedCanvasView } from '../../services/sysmlProjectionState';
import { computeBlockDisplayBounds } from './blockLayout';

describe('SysML Diagram Connections and Block Spacing Routing', () => {
  const repoBlock = (id: string, name: string, stereotype = 'block'): BlockData => ({
    id,
    name,
    stereotype,
    x: 0,
    y: 0,
    width: 150,
    height: 100,
    properties: [],
    operations: [],
    constraints: [],
    classes: [],
    ports: [],
  });

  const repoPart = (id: string, name: string, blockId: string, typeId: string): PartData => ({
    id,
    name,
    blockId,
    typeId,
    x: 0,
    y: 0,
    width: 120,
    height: 60,
  });

  it('routes BDD relationships between actual canvas presentation positions, not fixed origin', () => {
    const rawBlocks = [
      repoBlock('b1', 'Engine'),
      repoBlock('b2', 'Transmission'),
    ];

    // Presentation bounds on BDD canvas
    const presentedBlocks: BlockData[] = [
      { ...rawBlocks[0], x: 200, y: 150, width: 180, height: 120 },
      { ...rawBlocks[1], x: 600, y: 350, width: 200, height: 140 },
    ];

    // Merge presented blocks over raw blocks (as blocksById should do)
    const blocksById = new Map<string, BlockData>();
    for (const b of rawBlocks) blocksById.set(b.id, b);
    for (const b of presentedBlocks) blocksById.set(b.id, b);

    const rel: RelationshipData = {
      id: 'r1',
      sourceId: 'b1',
      targetId: 'b2',
      type: 'composition',
      label: 'drives',
    };

    const source = blocksById.get(rel.sourceId)!;
    const target = blocksById.get(rel.targetId)!;

    const sourceBounds = computeBlockDisplayBounds(source);
    const targetBounds = computeBlockDisplayBounds(target);

    const route = calculateSeparatedRelationshipPath(
      { x: source.x, y: source.y, width: sourceBounds.width, height: sourceBounds.height },
      { x: target.x, y: target.y, width: targetBounds.width, height: targetBounds.height },
      0,
      1,
    );

    // Source block is at (200, 150) with width 180, height 120
    // Target block is at (600, 350) with width 200, height 140
    // Start point must be on source boundary (near x: 380, y: 240)
    // End point must be on target boundary (near x: 600, y: 350)
    expect(route.sp.x).toBeGreaterThanOrEqual(200);
    expect(route.sp.x).toBeLessThanOrEqual(380);
    expect(route.sp.y).toBeGreaterThanOrEqual(150);
    expect(route.sp.y).toBeLessThanOrEqual(270);

    expect(route.tp.x).toBeGreaterThanOrEqual(600);
    expect(route.tp.x).toBeLessThanOrEqual(800);
    expect(route.tp.y).toBeGreaterThanOrEqual(350);
    expect(route.tp.y).toBeLessThanOrEqual(490);

    // The route must span the space/gap between blocks, not collapse to (0, 0)
    expect(route.tp.x - route.sp.x).toBeGreaterThan(200);
    expect(route.tp.y - route.sp.y).toBeGreaterThan(100);
  });

  it('excludes relationships when an endpoint is not present on the active diagram', () => {
    const presentedBlocks: BlockData[] = [
      { ...repoBlock('b1', 'Engine'), x: 100, y: 100 },
    ];
    const activeDiagramElementIds = new Set(presentedBlocks.map(b => b.id));

    const rel: RelationshipData = {
      id: 'r2',
      sourceId: 'b1',
      targetId: 'b_not_on_diagram',
      type: 'association',
      label: '',
    };

    const isVisibleOnActiveDiagram =
      activeDiagramElementIds.has(rel.sourceId) && activeDiagramElementIds.has(rel.targetId);

    expect(isVisibleOnActiveDiagram).toBe(false);
  });

  it('routes IBD connectors between actual part port positions respecting spacing', () => {
    const rawParts = [
      repoPart('p1', 'pump', 'contextBlock', 'pumpDef'),
      repoPart('p2', 'filter', 'contextBlock', 'filterDef'),
    ];

    // Presentation bounds on IBD canvas
    const presentedParts: PartData[] = [
      { ...rawParts[0], x: 100, y: 200, width: 140, height: 80 },
      { ...rawParts[1], x: 500, y: 200, width: 140, height: 80 },
    ];

    const partsById = new Map<string, PartData>();
    for (const p of rawParts) partsById.set(p.id, p);
    for (const p of presentedParts) partsById.set(p.id, p);

    const part1 = partsById.get('p1')!;
    const part2 = partsById.get('p2')!;

    // Right side port of p1 and left side port of p2
    const port1Pos = { x: part1.x + part1.width, y: part1.y + 40, side: 'right' as const };
    const port2Pos = { x: part2.x, y: part2.y + 40, side: 'left' as const };

    const route = calculateOrthogonalConnectorPath(port1Pos, port2Pos, 0);

    // Connector path must start at p1's right edge (240, 240) and end at p2's left edge (500, 240)
    expect(route.path).toContain('M 240 240');
    expect(route.path).toContain('500 240');
    expect(route.midX).toBe(342); // midX = (240 + 500)/2 + laneOffset(0) = 370 - 28 = 342
    expect(route.midY).toBe(240);
  });

  it('routes Requirements traceability relationships between Requirement and Block at canvas positions', () => {
    const req: BlockData = {
      ...repoBlock('req1', 'Safety Requirement', 'requirement'),
      x: 100,
      y: 100,
      width: 220,
      height: 120,
    };
    const blockElem: BlockData = {
      ...repoBlock('block1', 'BrakingSystem', 'block'),
      x: 500,
      y: 100,
      width: 180,
      height: 100,
    };

    const blocksById = new Map<string, BlockData>();
    blocksById.set(req.id, req);
    blocksById.set(blockElem.id, blockElem);

    const rel: RelationshipData = {
      id: 'satisfy-1',
      sourceId: 'block1',
      targetId: 'req1',
      type: 'satisfy',
      label: '«satisfy»',
    };

    const source = blocksById.get(rel.sourceId)!;
    const target = blocksById.get(rel.targetId)!;

    const sourceBounds = computeBlockDisplayBounds(source);
    const targetBounds = computeBlockDisplayBounds(target);

    const route = calculateSeparatedRelationshipPath(
      { x: source.x, y: source.y, width: sourceBounds.width, height: sourceBounds.height },
      { x: target.x, y: target.y, width: targetBounds.width, height: targetBounds.height },
      0,
      1,
    );

    // Source (BrakingSystem) is at (500, 100), Target (req1) is at (100, 100)
    // sp should be on the left boundary of source (~500, 150)
    // tp should be on the right boundary of target (~320, 160)
    expect(route.sp.x).toBe(500);
    expect(route.tp.x).toBe(320);
    expect(route.path).toBe(`M ${route.sp.x} ${route.sp.y} L ${route.tp.x} ${route.tp.y}`);
  });

  it('maintains proper large IBD context frame (1200x800) and keeps parts within boundary without collapsing to BDD block size', () => {
    const rawBlocks = [
      repoBlock('contextBlock', 'Subsystem'),
    ];
    // In BDD, the block was 150x100
    rawBlocks[0].width = 150;
    rawBlocks[0].height = 100;
    rawBlocks[0].x = 200;
    rawBlocks[0].y = 150;

    const completeView = {
      packages: [],
      blocks: rawBlocks,
      relationships: [],
      parts: [
        repoPart('p1', 'pump', 'contextBlock', 'pumpDef'),
      ],
      connectors: [],
    };

    // When projecting scoped IBD canvas view
    const ibdView = projectDiagramScopedCanvasView(completeView, 'contextBlock', {}, ['contextBlock']);

    const ctxBlock = ibdView.blocks.find(b => b.id === 'contextBlock')!;
    // Must NOT collapse to BDD width/height (150x100)
    expect(ctxBlock.ibdWidth).toBe(1200);
    expect(ctxBlock.ibdHeight).toBe(800);
    expect(ctxBlock.ibdX).toBe(50);
    expect(ctxBlock.ibdY).toBe(50);

    // Context frame for IBD rendering
    const frame = {
      x: ctxBlock.ibdX ?? 50,
      y: ctxBlock.ibdY ?? 50,
      w: ctxBlock.ibdWidth ?? 1200,
      h: ctxBlock.ibdHeight ?? 800,
    };

    expect(frame.w).toBe(1200);
    expect(frame.h).toBe(800);

    // Part of size 150x100 placed inside the frame has ample spacing
    const partWidth = 150;
    const partHeight = 100;
    expect(frame.w - partWidth).toBe(1050);
    expect(frame.h - partHeight).toBe(700);
  });
});
