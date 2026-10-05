import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type ActivityDefinition, type SysmlRepository } from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import {
  ACTIVITY_NODE_SHAPES, LANE_HEADER_HEIGHT, LANE_WIDTH, PIN_SIZE, buildActivityDiagramView, clipToShape, laneContaining,
  proposeLaneAssignments, withBoundsOverrides,
} from './activityDiagramView';

const DIAGRAM = 'act-diagram';

function repoWith(activity: Partial<ActivityDefinition>): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.Real = { id: 'Real', kind: 'valueType', name: 'Real', namespace: [], ownerId: 'model' };
  repo.definitions.Pilot = { id: 'Pilot', kind: 'block', name: 'Pilot', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.definitions.act = { id: 'act', kind: 'activity', name: 'Fly', namespace: [], ownerId: 'model', parameters: [], nodes: [], edges: [], partitions: [], ...activity };
  repo.diagrams[DIAGRAM] = { id: DIAGRAM, kind: 'diagram', name: 'Fly', namespace: [], ownerId: 'act', contextElementId: 'act', diagramKind: 'activity' };
  return repo;
}

function presentation(bounds: Record<string, { x: number; y: number; width?: number; height?: number }>): DiagramPresentation {
  return {
    elementIds: Object.keys(bounds),
    presentations: Object.fromEntries(Object.entries(bounds).map(([id, rect]) => [id, { id: `p-${id}`, diagramId: DIAGRAM, semanticElementId: id, bounds: rect }])),
  };
}

describe('activity diagram notation', () => {
  it('maps every node kind to its UML symbol', () => {
    expect(ACTIVITY_NODE_SHAPES).toEqual({
      action: 'roundedRect', initial: 'filledCircle', activityFinal: 'bullseye', flowFinal: 'crossCircle',
      decision: 'diamond', merge: 'diamond', fork: 'bar', join: 'bar', objectNode: 'rect', activityParameterNode: 'rect',
    });
  });

  it('projects nodes with stored positions and falls back to an auto slot', () => {
    const repo = repoWith({ nodes: [{ id: 'a', kind: 'action', name: 'Take off' }, { id: 'i', kind: 'initial', name: '' }, { id: 'b', kind: 'action', name: 'Land' }] });
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({ a: { x: 100, y: 120 }, i: { x: 20, y: 20 }, b: { x: 0, y: 0 } }));
    const a = view.nodes.find(node => node.id === 'a')!;
    expect(a).toMatchObject({ label: 'Take off', shape: 'roundedRect', placed: true });
    expect(a.bounds).toMatchObject({ x: 100, y: 120, width: 140, height: 56 });
    expect(view.nodes.find(node => node.id === 'i')).toMatchObject({ label: 'Initial Node', shape: 'filledCircle' });

    const auto = buildActivityDiagramView(repo, DIAGRAM, { elementIds: ['a'], presentations: {} });
    expect(auto.nodes[0].placed).toBe(false);
    expect(auto.nodes[0].bounds.y).toBeGreaterThan(LANE_HEADER_HEIGHT);
  });

  it('never exposes ids as labels and reports nodes the diagram does not show', () => {
    const repo = repoWith({ nodes: [{ id: 'n-123', kind: 'decision', name: '' }, { id: 'n-456', kind: 'action', name: 'Hidden' }] });
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({ 'n-123': { x: 0, y: 0 }, ghost: { x: 0, y: 0 } }));
    expect(view.nodes[0].label).toBe('Decision');
    expect(view.hiddenNodeIds).toEqual(['n-456']);
    expect(view.missingElementIds).toEqual(['ghost']);
    expect(JSON.stringify(view.nodes.map(node => node.label))).not.toContain('n-123');
  });

  it('draws pins on action borders: inputs on top, outputs on bottom, and widens the action to fit', () => {
    const repo = repoWith({
      nodes: [{
        id: 'a', kind: 'action', name: 'Compute',
        pins: [
          { id: 'p1', name: 'x', direction: 'in', typeId: 'Real' },
          { id: 'p2', name: 'y', direction: 'in' },
          { id: 'p3', name: 'z', direction: 'in' },
          { id: 'p4', name: 'out', direction: 'out' },
        ],
      }],
    });
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({ a: { x: 100, y: 100 } }));
    const action = view.nodes[0];
    const inputs = action.pins.filter(pin => pin.direction === 'in');
    const output = action.pins.find(pin => pin.direction === 'out')!;
    expect(inputs).toHaveLength(3);
    for (const pin of inputs) expect(pin.bounds.y + PIN_SIZE / 2).toBe(action.bounds.y);
    expect(output.bounds.y + PIN_SIZE / 2).toBe(action.bounds.y + action.bounds.height);
    expect(inputs[0].typeLabel).toBe('Real');
    expect(new Set(inputs.map(pin => pin.bounds.x)).size).toBe(3);
    for (const pin of action.pins) {
      expect(pin.bounds.x).toBeGreaterThanOrEqual(action.bounds.x);
      expect(pin.bounds.x + PIN_SIZE).toBeLessThanOrEqual(action.bounds.x + action.bounds.width);
    }
  });

  it('shows the called behavior of a call-behavior action and the type of an object node', () => {
    const repo = repoWith({
      nodes: [{ id: 'a', kind: 'action', name: 'Run', behaviorId: 'other' }, { id: 'o', kind: 'objectNode', name: 'speed', typeId: 'Real' }],
    });
    repo.definitions.other = { id: 'other', kind: 'activity', name: 'Cruise', namespace: [], ownerId: 'model', parameters: [], nodes: [], edges: [], partitions: [] };
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({ a: { x: 0, y: 0 }, o: { x: 300, y: 0 } }));
    expect(view.nodes.find(node => node.id === 'a')?.detail).toBe('«call» Cruise');
    expect(view.nodes.find(node => node.id === 'o')?.detail).toBe(': Real');
  });

  it('edges run boundary to boundary, join pins to pins and carry the guard in brackets', () => {
    const repo = repoWith({
      nodes: [
        { id: 'd', kind: 'decision', name: '' },
        { id: 'a', kind: 'action', name: 'A', pins: [{ id: 'pa', name: 'in', direction: 'in' }] },
        { id: 'o', kind: 'objectNode', name: 'o', typeId: 'Real' },
      ],
      edges: [
        { id: 'e1', kind: 'controlFlow', sourceId: 'd', targetId: 'a', guard: 'ok' },
        { id: 'e2', kind: 'objectFlow', sourceId: 'o', targetId: 'pa' },
      ],
    });
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({ d: { x: 100, y: 40 }, a: { x: 60, y: 200 }, o: { x: 300, y: 40 } }));
    const e1 = view.edges.find(edge => edge.id === 'e1')!;
    expect(e1.guardLabel).toBe('[ok]');
    // Starts on the diamond's outline (below its centre), not at its centre.
    expect(e1.start.y).toBeGreaterThan(60 - 1);
    const pin = view.nodes.find(node => node.id === 'a')!.pins[0];
    const e2 = view.edges.find(edge => edge.id === 'e2')!;
    expect(e2.kind).toBe('objectFlow');
    expect(e2.end.y).toBeGreaterThanOrEqual(pin.bounds.y - 0.01);
    expect(e2.end.y).toBeLessThanOrEqual(pin.bounds.y + PIN_SIZE + 0.01);
  });

  it('does not draw an edge whose end is not on the diagram', () => {
    const repo = repoWith({
      nodes: [{ id: 'a', kind: 'action', name: 'A' }, { id: 'b', kind: 'action', name: 'B' }],
      edges: [{ id: 'e', kind: 'controlFlow', sourceId: 'a', targetId: 'b' }],
    });
    expect(buildActivityDiagramView(repo, DIAGRAM, presentation({ a: { x: 0, y: 0 } })).edges).toEqual([]);
  });

  it('clips edges to circles, diamonds and rectangles', () => {
    const rect = { x: 0, y: 0, width: 40, height: 40 };
    const right = { x: 200, y: 20 };
    expect(clipToShape('filledCircle', rect, right)).toEqual({ x: 40, y: 20 });
    expect(clipToShape('diamond', rect, right)).toEqual({ x: 40, y: 20 });
    expect(clipToShape('roundedRect', rect, { x: 20, y: 200 })).toEqual({ x: 20, y: 40 });
    const diagonal = clipToShape('diamond', rect, { x: 200, y: 200 });
    expect(diagonal.x).toBeCloseTo(30);
    expect(diagonal.y).toBeCloseTo(30);
  });

  it('shows «allocate» targets under actions and lanes', () => {
    const repo = repoWith({
      nodes: [{ id: 'a', kind: 'action', name: 'A' }],
      partitions: [{ id: 'lane', name: 'Crew', representsId: 'Pilot', nodeIds: [] }],
    });
    repo.relationships.r1 = { id: 'r1', kind: 'allocation', sourceId: 'a', targetId: 'Pilot' };
    repo.relationships.r2 = { id: 'r2', kind: 'allocation', sourceId: 'lane', targetId: 'Pilot' };
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({ a: { x: 0, y: 0 } }));
    expect(view.nodes[0].allocatedTo).toEqual(['Pilot']);
    expect(view.lanes[0]).toMatchObject({ label: 'Crew', representsLabel: 'Pilot', allocatedTo: ['Pilot'] });
  });
});

describe('swimlanes', () => {
  const lanesRepo = () => repoWith({
    nodes: [{ id: 'a', kind: 'action', name: 'A' }, { id: 'b', kind: 'action', name: 'B' }, { id: 'c', kind: 'action', name: 'C' }],
    partitions: [
      { id: 'l1', name: 'Pilot', nodeIds: ['a'] },
      { id: 'l2', name: 'System', nodeIds: [] },
    ],
  });

  it('lays partitions out as vertical columns in partition order, tall enough for the content', () => {
    const view = buildActivityDiagramView(lanesRepo(), DIAGRAM, presentation({ a: { x: 40, y: 900 } }));
    expect(view.lanes.map(lane => [lane.label, lane.bounds.x, lane.bounds.width])).toEqual([['Pilot', 0, LANE_WIDTH], ['System', LANE_WIDTH, LANE_WIDTH]]);
    expect(view.lanes[0].bounds.height).toBeGreaterThan(900);
    expect(view.lanes[1].bounds.height).toBe(view.lanes[0].bounds.height);
  });

  it('auto-places a node without a stored position inside its lane', () => {
    const view = buildActivityDiagramView(lanesRepo(), DIAGRAM, { elementIds: ['a'], presentations: {} });
    const a = view.nodes[0];
    expect(a.partitionId).toBe('l1');
    expect(laneContaining(a.bounds, view.lanes)).toBe('l1');
  });

  it('proposes lane membership from geometry and never changes it silently', () => {
    const repo = lanesRepo();
    // a (stored in l1) is dragged into l2; b is dropped into l1; c sits outside every lane.
    const view = buildActivityDiagramView(repo, DIAGRAM, presentation({
      a: { x: LANE_WIDTH + 40, y: 120 }, b: { x: 40, y: 120 }, c: { x: LANE_WIDTH * 2 + 80, y: 120 },
    }));
    const proposals = proposeLaneAssignments(view);
    expect(proposals).toEqual([
      { nodeId: 'a', fromPartitionId: 'l1', toPartitionId: 'l2' },
      { nodeId: 'b', fromPartitionId: undefined, toPartitionId: 'l1' },
    ]);
    // Stored membership is untouched by projecting.
    expect((repo.definitions.act as ActivityDefinition).partitions[0].nodeIds).toEqual(['a']);
    expect(proposeLaneAssignments(view, { nodeIds: ['b'] }).map(p => p.nodeId)).toEqual(['b']);
  });

  it('proposes leaving a swimlane when a member is dragged outside every lane', () => {
    const view = buildActivityDiagramView(lanesRepo(), DIAGRAM, presentation({ a: { x: LANE_WIDTH * 2 + 100, y: 100 } }));
    expect(proposeLaneAssignments(view)).toEqual([{ nodeId: 'a', fromPartitionId: 'l1' }]);
  });

  it('proposes nothing without lanes, and previews with bounds overrides', () => {
    const repo = repoWith({ nodes: [{ id: 'a', kind: 'action', name: 'A' }] });
    expect(proposeLaneAssignments(buildActivityDiagramView(repo, DIAGRAM, presentation({ a: { x: 0, y: 0 } })))).toEqual([]);

    const preview = withBoundsOverrides(presentation({ a: { x: 0, y: 0 } }), { a: { x: 500, y: 60, width: 140, height: 56 } }, DIAGRAM);
    const view = buildActivityDiagramView(lanesRepo(), DIAGRAM, preview);
    expect(view.nodes[0].bounds.x).toBe(500);
  });
});
