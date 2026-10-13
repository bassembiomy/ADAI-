/**
 * Activity Diagram projection (SysML 1.6 Clause 11 / UML 2.5 §15).
 *
 * Pure: repository + diagram presentation in, positioned notation out. The
 * workspace component only renders this and dispatches gateway commands.
 *
 *  - action: rounded rectangle; input pins on its top border, output pins on its
 *    bottom border; a call-behavior action shows the called activity's name.
 *  - initial: filled circle · activity final: bullseye · flow final: circle
 *    with a cross · decision/merge: diamond · fork/join: thick bar.
 *  - object node / activity parameter node: rectangle (type shown below the name).
 *  - control flow and object flow: solid line with an open arrowhead; a guard is
 *    written in square brackets at the middle of the edge.
 *  - swimlanes: vertical partition columns in partition order. A node's lane is
 *    stored on the partition; geometry only *proposes* a lane (never silently).
 */
import type {
  ActivityDefinition, ActivityNode, ActivityNodeKind, SysmlRepository,
} from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import {
  ACTIVITY_NODE_KIND_LABELS, findInActivity, nodeLabel, resolveActivityEndpoint,
} from '../../engine/sysml/activity';
import { allocationNamesByElement } from '../../engine/sysml/allocation';
import { sysmlObjectLabel } from './sysmlDisplayLabel';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export type ActivityNodeShape = 'roundedRect' | 'filledCircle' | 'bullseye' | 'crossCircle' | 'diamond' | 'bar' | 'rect';

export const LANE_WIDTH = 260;
export const LANE_HEADER_HEIGHT = 44;
export const LANE_MIN_HEIGHT = 520;
export const PIN_SIZE = 12;

export const ACTIVITY_NODE_SHAPES: Record<ActivityNodeKind, ActivityNodeShape> = {
  action: 'roundedRect',
  initial: 'filledCircle',
  activityFinal: 'bullseye',
  flowFinal: 'crossCircle',
  decision: 'diamond',
  merge: 'diamond',
  fork: 'bar',
  join: 'bar',
  objectNode: 'rect',
  activityParameterNode: 'rect',
};

export const ACTIVITY_NODE_SIZES: Record<ActivityNodeKind, { width: number; height: number }> = {
  action: { width: 140, height: 56 },
  initial: { width: 24, height: 24 },
  activityFinal: { width: 30, height: 30 },
  flowFinal: { width: 24, height: 24 },
  decision: { width: 40, height: 40 },
  merge: { width: 40, height: 40 },
  fork: { width: 100, height: 10 },
  join: { width: 100, height: 10 },
  objectNode: { width: 120, height: 48 },
  activityParameterNode: { width: 120, height: 48 },
};

/** The palette, in the order the toolbar offers it. */
export const ACTIVITY_PALETTE: ReadonlyArray<{ kind: ActivityNodeKind; label: string }> =
  (['action', 'initial', 'activityFinal', 'flowFinal', 'decision', 'merge', 'fork', 'join', 'objectNode', 'activityParameterNode'] as ActivityNodeKind[])
    .map(kind => ({ kind, label: ACTIVITY_NODE_KIND_LABELS[kind] }));

export interface ActivityPinView {
  id: string;
  label: string;
  direction: 'in' | 'out';
  typeLabel?: string;
  bounds: Rect;
}

export interface ActivityNodeView {
  id: string;
  kind: ActivityNodeKind;
  label: string;
  shape: ActivityNodeShape;
  bounds: Rect;
  pins: ActivityPinView[];
  /** Secondary text: the called behavior (actions) or the held type (object nodes). */
  detail?: string;
  /** «allocate» targets, by name; shown under the node. */
  allocatedTo: string[];
  /** Stored partition (swimlane) membership. */
  partitionId?: string;
  /** False when the diagram has no stored position and the node was auto-placed. */
  placed: boolean;
}

export interface ActivityLaneView {
  id: string;
  label: string;
  /** Name of the Block/part this lane represents, when set. */
  representsLabel?: string;
  allocatedTo: string[];
  index: number;
  /** Full lane column, header included. */
  bounds: Rect;
}

export interface ActivityEdgeView {
  id: string;
  kind: 'controlFlow' | 'objectFlow';
  sourceId: string;
  targetId: string;
  /** `[guard]`, empty when none. */
  guardLabel: string;
  start: Point;
  end: Point;
  labelAt: Point;
}

export interface ActivityDiagramView {
  activityId?: string;
  activityLabel: string;
  lanes: ActivityLaneView[];
  nodes: ActivityNodeView[];
  edges: ActivityEdgeView[];
  /** Presented ids that no longer resolve to a node of the activity. */
  missingElementIds: string[];
  /** Nodes of the activity that this diagram does not show yet. */
  hiddenNodeIds: string[];
  canvasSize: { width: number; height: number };
}

const center = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

export function rectContains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** The activity a diagram documents: the diagram's context, falling back to its owner. */
export function activityOfDiagram(repo: SysmlRepository, diagramId: string): ActivityDefinition | undefined {
  const diagram = repo.diagrams[diagramId];
  const id = diagram?.contextElementId ?? diagram?.ownerId;
  const definition = id ? repo.definitions[id] : undefined;
  return definition?.kind === 'activity' ? definition : undefined;
}

/** Action width grows so that its pins never overlap. */
export function actionMinWidth(node: Pick<ActivityNode, 'pins'>): number {
  const perEdge = Math.max(
    (node.pins ?? []).filter(pin => pin.direction === 'in').length,
    (node.pins ?? []).filter(pin => pin.direction === 'out').length,
  );
  return Math.max(ACTIVITY_NODE_SIZES.action.width, perEdge * (PIN_SIZE + 14) + 20);
}

function pinViews(
  repo: SysmlRepository,
  node: ActivityNode,
  bounds: Rect,
): ActivityPinView[] {
  const result: ActivityPinView[] = [];
  for (const direction of ['in', 'out'] as const) {
    const pins = (node.pins ?? []).filter(pin => pin.direction === direction);
    pins.forEach((pin, index) => {
      const cx = bounds.x + (bounds.width * (index + 1)) / (pins.length + 1);
      const cy = direction === 'in' ? bounds.y : bounds.y + bounds.height;
      result.push({
        id: pin.id,
        label: pin.name?.trim() || (direction === 'in' ? 'in' : 'out'),
        direction,
        ...(pin.typeId ? { typeLabel: sysmlObjectLabel(repo.definitions[pin.typeId], 'Type') } : {}),
        bounds: { x: cx - PIN_SIZE / 2, y: cy - PIN_SIZE / 2, width: PIN_SIZE, height: PIN_SIZE },
      });
    });
  }
  return result;
}

function detailOf(repo: SysmlRepository, activity: ActivityDefinition, node: ActivityNode): string | undefined {
  if (node.kind === 'action' && node.behaviorId) {
    return `«call» ${sysmlObjectLabel(repo.definitions[node.behaviorId], repo.definitions[node.behaviorId]?.kind === 'interaction' ? 'Interaction' : 'Activity')}`;
  }
  if (node.kind === 'objectNode' || node.kind === 'activityParameterNode') {
    const parameter = (activity.parameters ?? []).find(candidate => candidate.id === node.parameterId);
    const typeId = node.typeId || parameter?.typeId;
    const typeText = typeId ? `: ${sysmlObjectLabel(repo.definitions[typeId], 'Type')}` : '';
    return node.kind === 'activityParameterNode' ? `«parameter»${typeText}` : typeText || undefined;
  }
  return undefined;
}

/** Free grid slot (or lane slot) for presented nodes that have no stored position yet. */
export function autoPosition(
  kind: ActivityNodeKind,
  index: number,
  lane?: Pick<ActivityLaneView, 'bounds'>,
): Point {
  const size = ACTIVITY_NODE_SIZES[kind];
  if (lane) {
    return {
      x: lane.bounds.x + (lane.bounds.width - size.width) / 2,
      y: lane.bounds.y + LANE_HEADER_HEIGHT + 30 + index * 90,
    };
  }
  return { x: 60 + (index % 4) * 190, y: LANE_HEADER_HEIGHT + 40 + Math.floor(index / 4) * 110 };
}

export function buildActivityDiagramView(
  repo: SysmlRepository,
  diagramId: string,
  presentation: DiagramPresentation | undefined,
): ActivityDiagramView {
  const activity = activityOfDiagram(repo, diagramId);
  if (!activity) {
    return { activityLabel: '', lanes: [], nodes: [], edges: [], missingElementIds: [], hiddenNodeIds: [], canvasSize: { width: 800, height: LANE_MIN_HEIGHT } };
  }
  const allocation = allocationNamesByElement(repo);
  const partitionOf = new Map<string, string>();
  for (const partition of activity.partitions ?? []) {
    for (const nodeId of partition.nodeIds ?? []) if (!partitionOf.has(nodeId)) partitionOf.set(nodeId, partition.id);
  }

  const presentedIds = presentation?.elementIds ?? [];
  const nodeById = new Map((activity.nodes ?? []).map(node => [node.id, node]));
  const missingElementIds: string[] = [];
  const presentedNodes: ActivityNode[] = [];
  for (const id of presentedIds) {
    const node = nodeById.get(id);
    if (node) presentedNodes.push(node);
    else if (!findInActivity(activity, id) && !repo.relationships?.[id]) missingElementIds.push(id);
  }

  // Lanes first: node auto-placement and lane proposals both depend on them.
  const lanes: ActivityLaneView[] = (activity.partitions ?? []).map((partition, index) => ({
    id: partition.id,
    label: partition.name?.trim() || 'Partition',
    ...(partition.representsId ? { representsLabel: sysmlObjectLabel(repo.definitions[partition.representsId] ?? repo.usages[partition.representsId]
      ?? Object.values(repo.definitions).flatMap(def => def.kind === 'block' ? def.properties : []).find(property => property.id === partition.representsId), 'Block') } : {}),
    allocatedTo: allocation.get(partition.id)?.allocatedTo ?? [],
    index,
    bounds: { x: index * LANE_WIDTH, y: 0, width: LANE_WIDTH, height: LANE_MIN_HEIGHT },
  }));
  const laneById = new Map(lanes.map(lane => [lane.id, lane]));

  const laneCounts = new Map<string, number>();
  let freeIndex = 0;
  const nodes: ActivityNodeView[] = presentedNodes.map(node => {
    const stored = presentation?.presentations?.[node.id]?.bounds;
    const size = ACTIVITY_NODE_SIZES[node.kind];
    const minWidth = node.kind === 'action' ? actionMinWidth(node) : size.width;
    const partitionId = partitionOf.get(node.id);
    const lane = partitionId ? laneById.get(partitionId) : undefined;
    const hasStored = stored?.x !== undefined && stored?.y !== undefined;
    let fallback: Point = { x: 0, y: 0 };
    if (!hasStored) {
      if (lane) {
        const slot = laneCounts.get(lane.id) ?? 0;
        laneCounts.set(lane.id, slot + 1);
        fallback = autoPosition(node.kind, slot, lane);
      } else {
        fallback = autoPosition(node.kind, freeIndex);
        freeIndex += 1;
      }
    }
    const bounds: Rect = {
      x: stored?.x ?? fallback.x,
      y: stored?.y ?? fallback.y,
      width: Math.max(stored?.width ?? size.width, minWidth),
      height: stored?.height ?? size.height,
    };
    const detail = detailOf(repo, activity, node);
    return {
      id: node.id,
      kind: node.kind,
      label: nodeLabel(node),
      shape: ACTIVITY_NODE_SHAPES[node.kind],
      bounds,
      pins: pinViews(repo, node, bounds),
      ...(detail ? { detail } : {}),
      allocatedTo: allocation.get(node.id)?.allocatedTo ?? [],
      ...(partitionId ? { partitionId } : {}),
      placed: hasStored,
    };
  });

  // Lane height follows the content so the columns always enclose their nodes.
  const bottom = Math.max(0, ...nodes.map(node => node.bounds.y + node.bounds.height + 80));
  const laneHeight = Math.max(LANE_MIN_HEIGHT, bottom);
  for (const lane of lanes) lane.bounds = { ...lane.bounds, height: laneHeight };

  const endpointGeometry = new Map<string, { node: ActivityNodeView; rect: Rect; isPin: boolean }>();
  for (const node of nodes) {
    endpointGeometry.set(node.id, { node, rect: node.bounds, isPin: false });
    for (const pin of node.pins) endpointGeometry.set(pin.id, { node, rect: pin.bounds, isPin: true });
  }

  const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000');
  const pairCounts = new Map<string, number>();
  const shownEdges = (activity.edges ?? []).filter(edge => endpointGeometry.has(edge.sourceId) && endpointGeometry.has(edge.targetId));
  for (const edge of shownEdges) pairCounts.set(pairKey(edge.sourceId, edge.targetId), (pairCounts.get(pairKey(edge.sourceId, edge.targetId)) ?? 0) + 1);
  const pairSeen = new Map<string, number>();

  const edges: ActivityEdgeView[] = shownEdges.map(edge => {
    const source = endpointGeometry.get(edge.sourceId)!;
    const target = endpointGeometry.get(edge.targetId)!;
    const key = pairKey(edge.sourceId, edge.targetId);
    const seen = pairSeen.get(key) ?? 0;
    pairSeen.set(key, seen + 1);
    const total = pairCounts.get(key) ?? 1;
    const spread = (seen - (total - 1) / 2) * 14;
    const sc = center(source.rect);
    const tc = center(target.rect);
    const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1;
    const sign = edge.sourceId < edge.targetId ? 1 : -1;
    const ox = (-(tc.y - sc.y) / len) * spread * sign;
    const oy = ((tc.x - sc.x) / len) * spread * sign;
    const start = clipToShape(source.isPin ? 'rect' : source.node.shape, source.rect, { x: tc.x + ox, y: tc.y + oy });
    const end = clipToShape(target.isPin ? 'rect' : target.node.shape, target.rect, { x: sc.x + ox, y: sc.y + oy });
    return {
      id: edge.id,
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      guardLabel: edge.guard?.trim() ? `[${edge.guard.trim()}]` : '',
      start,
      end,
      labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  });

  const hiddenNodeIds = (activity.nodes ?? []).map(node => node.id).filter(id => !presentedIds.includes(id));
  const maxX = Math.max(lanes.length * LANE_WIDTH, ...nodes.map(node => node.bounds.x + node.bounds.width + 60), 800);
  return {
    activityId: activity.id,
    activityLabel: sysmlObjectLabel(activity, 'Activity'),
    lanes,
    nodes,
    edges,
    missingElementIds,
    hiddenNodeIds,
    canvasSize: { width: maxX, height: laneHeight },
  };
}

/** Point where the line from the shape's centre towards `toward` leaves the shape. */
export function clipToShape(shape: ActivityNodeShape, rect: Rect, toward: Point): Point {
  const c = center(rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  if (shape === 'filledCircle' || shape === 'bullseye' || shape === 'crossCircle') {
    const radius = Math.min(halfW, halfH);
    const length = Math.hypot(dx, dy);
    return { x: c.x + (dx / length) * radius, y: c.y + (dy / length) * radius };
  }
  if (shape === 'diamond') {
    const t = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Presentation with some elements' bounds replaced (live drag preview and
 * "which lane would this land in"). Never mutates its input.
 */
export function withBoundsOverrides(
  presentation: DiagramPresentation | undefined,
  overrides: Record<string, Rect>,
  diagramId = '',
): DiagramPresentation {
  const base: DiagramPresentation = presentation ?? { elementIds: [], presentations: {} };
  const presentations = { ...base.presentations };
  for (const [id, bounds] of Object.entries(overrides)) {
    const existing = presentations[id];
    presentations[id] = existing
      ? { ...existing, bounds: { ...existing.bounds, ...bounds } }
      : { id: `preview:${id}`, diagramId, semanticElementId: id, bounds: { ...bounds } };
  }
  return { ...base, presentations };
}

// ---------------------------------------------------------------------------
// Swimlane membership: geometry proposes, the gateway commits
// ---------------------------------------------------------------------------

/** The lane whose column contains the horizontal centre of `rect`. */
export function laneContaining(rect: Rect, lanes: ReadonlyArray<Pick<ActivityLaneView, 'id' | 'bounds'>>): string | undefined {
  const x = center(rect).x;
  return lanes.find(lane => x >= lane.bounds.x && x < lane.bounds.x + lane.bounds.width)?.id;
}

export interface LaneAssignmentProposal {
  nodeId: string;
  /** Partition currently storing the node. */
  fromPartitionId?: string;
  /** Partition implied by the geometry; undefined means "remove from its swimlane". */
  toPartitionId?: string;
}

/**
 *  - a node drawn inside a lane that is not its partition → assign to that lane;
 *  - a node that belongs to a partition but is drawn outside every lane → unassign.
 * Initial/final nodes are treated like any other node.
 */
export function proposeLaneAssignments(
  view: Pick<ActivityDiagramView, 'nodes' | 'lanes'>,
  options: { nodeIds?: Iterable<string> } = {},
): LaneAssignmentProposal[] {
  if (view.lanes.length === 0) return [];
  const only = options.nodeIds ? new Set(options.nodeIds) : undefined;
  const proposals: LaneAssignmentProposal[] = [];
  for (const node of view.nodes) {
    if (only && !only.has(node.id)) continue;
    const derived = laneContaining(node.bounds, view.lanes);
    if (derived && derived !== node.partitionId) {
      proposals.push({ nodeId: node.id, fromPartitionId: node.partitionId, toPartitionId: derived });
    } else if (!derived && node.partitionId) {
      proposals.push({ nodeId: node.id, fromPartitionId: node.partitionId });
    }
  }
  return proposals;
}

/** A node's name for messages, looked up in the activity (never an id). */
export function activityNodeName(repo: SysmlRepository, activityId: string, nodeId: string): string {
  const activity = repo.definitions[activityId];
  if (activity?.kind !== 'activity') return 'Node';
  const endpoint = resolveActivityEndpoint(activity, nodeId);
  if (endpoint?.pin) return endpoint.pin.name?.trim() || 'Pin';
  return endpoint ? nodeLabel(endpoint.node) : 'Node';
}
