import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityNodeKind, SysmlRepository } from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import { findInActivity, validateActivity } from '../../engine/sysml/activity';
import type { SysmlCommandResult, SysmlEditorCommand } from '../../services/sysmlCommandGateway';
import {
  buildAddActivityEdgeCommand,
  buildAddActivityNodeCommand,
  buildAddActivityPinCommand,
  buildAddPartitionCommand,
  buildAssignNodesToPartitionsCommand,
  buildMoveActivityNodesCommand,
  buildMovePartitionCommand,
  buildRemoveActivityEdgeCommand,
  buildRemoveActivityNodeCommand,
  buildRemoveActivityPinCommand,
  buildRemovePartitionCommand,
  buildRenameActivityElementCommand,
  buildSetEdgeGuardCommand,
  buildSetPartitionRepresentsCommand,
  buildUpdateActivityNodeCommand,
  buildUpdateActivityPinCommand,
  type ActivityCommandPlan,
} from '../../services/sysmlActivityCommands';
import { buildCreateAllocationCommand } from '../../services/sysmlAllocationCommands';
import {
  ACTIVITY_NODE_SIZES,
  ACTIVITY_PALETTE,
  LANE_HEADER_HEIGHT,
  activityNodeName,
  buildActivityDiagramView,
  proposeLaneAssignments,
  withBoundsOverrides,
  type ActivityEdgeView,
  type ActivityLaneView,
  type ActivityNodeView,
  type LaneAssignmentProposal,
  type Point,
  type Rect,
} from '../../features/sysml/activityDiagramView';
import { diagramFrameLabel } from '../../features/sysml/diagramFrame';
import { resolveSysmlReferenceLabel, sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';

export interface ActivityWorkspaceProps {
  repository: SysmlRepository;
  diagramId: string;
  diagramPresentations: Record<string, DiagramPresentation>;
  /** Runs one gateway command; every user action is exactly one command (one undo step). */
  onExecute: (command: SysmlEditorCommand) => SysmlCommandResult;
  /** Double-click: open the diagram elaborating the element, or reveal it. */
  onNavigate?: (elementId: string) => void;
  onSelect?: (ids: string[]) => void;
  authorizedBaselineIds?: readonly string[];
}

type Tool = 'select' | 'flow' | ActivityNodeKind;
interface Viewport { x: number; y: number; k: number }

const GRID = 10;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const snap = (value: number) => Math.round(value / GRID) * GRID;
const isNodeTool = (tool: Tool): tool is ActivityNodeKind => tool !== 'select' && tool !== 'flow';
const RESIZABLE: ReadonlySet<ActivityNodeKind> = new Set(['action', 'objectNode', 'activityParameterNode', 'fork', 'join']);
const MIN_SIZE: Partial<Record<ActivityNodeKind, { width: number; height: number }>> = {
  action: { width: 100, height: 40 }, objectNode: { width: 80, height: 32 }, activityParameterNode: { width: 80, height: 32 },
  fork: { width: 40, height: 8 }, join: { width: 40, height: 8 },
};

interface DragState {
  mode: 'move' | 'resize' | 'pan';
  startClient: Point;
  startWorld: Point;
  viewportStart: Viewport;
  origins: Record<string, Rect>;
  resizeKind?: ActivityNodeKind;
  moved: boolean;
  delta: Point;
}

function fit(text: string, widthPx: number, fontSize: number): string {
  const maxChars = Math.max(3, Math.floor(widthPx / (fontSize * 0.56)));
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function dragOverrides(drag: DragState): Record<string, Rect> {
  if (drag.mode === 'pan') return {};
  if (drag.mode === 'resize') {
    const id = Object.keys(drag.origins)[0];
    if (!id) return {};
    const origin = drag.origins[id];
    const min = MIN_SIZE[drag.resizeKind ?? 'action'] ?? { width: 20, height: 20 };
    return { [id]: { x: origin.x, y: origin.y, width: Math.max(min.width, snap(origin.width + drag.delta.x)), height: Math.max(min.height, snap(origin.height + drag.delta.y)) } };
  }
  return Object.fromEntries(Object.entries(drag.origins).map(([id, origin]) => [
    id, { ...origin, x: snap(origin.x + drag.delta.x), y: snap(origin.y + drag.delta.y) },
  ]));
}

const STROKE = 'var(--sysml-block-stroke)';
const FILL = 'var(--sysml-block-fill)';
const TEXT = 'var(--sysml-block-text)';
const SELECTED = 'var(--sysml-sem-selection)';

function NodeShape({ node, selected, pending }: { node: ActivityNodeView; selected: boolean; pending: boolean }) {
  const { x, y, width, height } = node.bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const stroke = selected || pending ? SELECTED : STROKE;
  const strokeWidth = selected ? 2 : 1.5;
  const radius = Math.min(width, height) / 2;
  const unnamedControl = node.shape !== 'roundedRect' && node.shape !== 'rect' && !['Initial Node', 'Activity Final', 'Flow Final', 'Decision', 'Merge', 'Fork', 'Join'].includes(node.label);
  let body: React.ReactNode;
  switch (node.shape) {
    case 'filledCircle':
      body = <circle cx={cx} cy={cy} r={radius} fill={stroke} stroke={stroke} strokeWidth={strokeWidth} />;
      break;
    case 'bullseye':
      body = (
        <g>
          <circle cx={cx} cy={cy} r={radius} fill={FILL} stroke={stroke} strokeWidth={strokeWidth} />
          <circle cx={cx} cy={cy} r={radius * 0.6} fill={stroke} />
        </g>
      );
      break;
    case 'crossCircle': {
      const d = radius * 0.55;
      body = (
        <g>
          <circle cx={cx} cy={cy} r={radius} fill={FILL} stroke={stroke} strokeWidth={strokeWidth} />
          <path d={`M${cx - d},${cy - d} L${cx + d},${cy + d} M${cx + d},${cy - d} L${cx - d},${cy + d}`} stroke={stroke} strokeWidth={strokeWidth} />
        </g>
      );
      break;
    }
    case 'diamond':
      body = <polygon points={`${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`} fill={FILL} stroke={stroke} strokeWidth={strokeWidth} />;
      break;
    case 'bar':
      body = <rect x={x} y={y} width={width} height={height} fill={stroke} stroke={stroke} strokeWidth={strokeWidth} />;
      break;
    case 'rect':
      body = <rect x={x} y={y} width={width} height={height} fill={FILL} stroke={stroke} strokeWidth={strokeWidth} />;
      break;
    default:
      body = <rect x={x} y={y} width={width} height={height} rx={14} fill={FILL} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  return (
    <g>
      {body}
      {node.shape === 'roundedRect' && (
        <g>
          <text x={cx} y={node.detail ? cy - 3 : cy + 4} textAnchor="middle" fontSize={13} fill={TEXT}>{fit(node.label, width - 16, 13)}</text>
          {node.detail && <text x={cx} y={cy + 13} textAnchor="middle" fontSize={10} fill="var(--sysml-block-subtext)">{fit(node.detail, width - 12, 10)}</text>}
        </g>
      )}
      {node.shape === 'rect' && (
        <g>
          <text x={cx} y={node.detail ? cy - 3 : cy + 4} textAnchor="middle" fontSize={13} fill={TEXT}>{fit(node.label, width - 12, 13)}</text>
          {node.detail && <text x={cx} y={cy + 13} textAnchor="middle" fontSize={10} fill="var(--sysml-block-subtext)">{fit(node.detail, width - 8, 10)}</text>}
        </g>
      )}
      {unnamedControl && <text x={cx} y={y + height + 14} textAnchor="middle" fontSize={11} fill={TEXT}>{fit(node.label, 120, 11)}</text>}
      {node.allocatedTo.length > 0 && (
        <text x={cx} y={y + height + (unnamedControl ? 27 : 14) + (node.pins.some(pin => pin.direction === 'out') ? 12 : 0)} textAnchor="middle" fontSize={10} fill="var(--sysml-block-meta)">
          {fit(`«allocate» ${node.allocatedTo.join(', ')}`, Math.max(width, 140), 10)}
        </text>
      )}
    </g>
  );
}

function PinShape({ pin, selected, pending }: { pin: ActivityNodeView['pins'][number]; selected: boolean; pending: boolean }) {
  const { x, y, width, height } = pin.bounds;
  const label = pin.typeLabel ? `${pin.label}: ${pin.typeLabel}` : pin.label;
  return (
    <g data-testid="activity-pin" data-label={pin.label}>
      <rect x={x} y={y} width={width} height={height} fill={FILL} stroke={selected || pending ? SELECTED : STROKE} strokeWidth={selected ? 2 : 1.5} />
      <text x={x + width / 2} y={pin.direction === 'in' ? y - 4 : y + height + 11} textAnchor="middle" fontSize={9} fill="var(--sysml-block-subtext)">{fit(label, 90, 9)}</text>
    </g>
  );
}

function EdgeShape({ edge, selected }: { edge: ActivityEdgeView; selected: boolean }) {
  const stroke = selected ? SELECTED : STROKE;
  return (
    <g>
      <line x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} stroke="transparent" strokeWidth={14} />
      <line
        x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} stroke={stroke} strokeWidth={selected ? 2 : 1.5}
        markerEnd={`url(#act-open${selected ? '-sel' : ''})`}
      />
      {edge.guardLabel && (
        <text x={edge.labelAt.x + 4} y={edge.labelAt.y - 6} fontSize={11} fill="var(--sysml-block-subtext)" stroke="var(--surface-canvas)" strokeWidth={3} paintOrder="stroke">{edge.guardLabel}</text>
      )}
    </g>
  );
}

function LaneShape({ lane, selected }: { lane: ActivityLaneView; selected: boolean }) {
  const { x, y, width, height } = lane.bounds;
  const second = [lane.representsLabel ? `«represents» ${lane.representsLabel}` : '', lane.allocatedTo.length ? `«allocate» ${lane.allocatedTo.join(', ')}` : ''].filter(Boolean).join('  ');
  return (
    <g data-testid="activity-lane" data-label={lane.label}>
      <rect x={x} y={y} width={width} height={height} fill="transparent" stroke={selected ? SELECTED : STROKE} strokeWidth={selected ? 2 : 1} />
      <rect x={x} y={y} width={width} height={LANE_HEADER_HEIGHT} fill={FILL} fillOpacity={0.55} stroke={selected ? SELECTED : STROKE} strokeWidth={selected ? 2 : 1} />
      <text x={x + width / 2} y={y + (second ? 18 : 26)} textAnchor="middle" fontSize={13} fontWeight={600} fill={TEXT}>{fit(lane.label, width - 16, 13)}</text>
      {second && <text x={x + width / 2} y={y + 34} textAnchor="middle" fontSize={10} fill="var(--sysml-block-meta)">{fit(second, width - 12, 10)}</text>}
    </g>
  );
}

export function ActivityWorkspace({
  repository, diagramId, diagramPresentations, onExecute, onNavigate, onSelect,
}: ActivityWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 20, y: 20, k: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [proposals, setProposals] = useState<LaneAssignmentProposal[]>([]);
  const [message, setMessage] = useState('');
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);
  const [guardDraft, setGuardDraft] = useState<{ id: string; value: string } | null>(null);

  const presentation = diagramPresentations[diagramId];
  const diagram = repository.diagrams[diagramId];
  const activityId = diagram?.contextElementId ?? diagram?.ownerId ?? '';
  const activity = repository.definitions[activityId]?.kind === 'activity' ? repository.definitions[activityId] : undefined;

  const baseView = useMemo(() => buildActivityDiagramView(repository, diagramId, presentation), [repository, diagramId, presentation]);
  const overrides = useMemo(() => (drag && drag.moved ? dragOverrides(drag) : {}), [drag]);
  const view = useMemo(
    () => (Object.keys(overrides).length > 0 ? buildActivityDiagramView(repository, diagramId, withBoundsOverrides(presentation, overrides, diagramId)) : baseView),
    [repository, diagramId, presentation, overrides, baseView],
  );

  const selectableIds = useMemo(() => new Set([
    ...view.nodes.map(node => node.id),
    ...view.nodes.flatMap(node => node.pins.map(pin => pin.id)),
    ...view.edges.map(edge => edge.id),
    ...view.lanes.map(lane => lane.id),
  ]), [view]);
  const liveSelection = useMemo(() => selected.filter(id => selectableIds.has(id)), [selected, selectableIds]);
  const frameLabel = diagramFrameLabel(repository, diagramId);
  const nameOf = useCallback((id: string) => resolveSysmlReferenceLabel(repository, id), [repository]);

  useEffect(() => { onSelect?.(liveSelection); }, [liveSelection.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeIds = useMemo(() => new Set(view.nodes.map(node => node.id)), [view]);
  const liveProposals = useMemo(() => {
    const stored = new Map<string, string | undefined>();
    for (const partition of activity?.kind === 'activity' ? activity.partitions : []) for (const id of partition.nodeIds) stored.set(id, partition.id);
    return proposals.filter(p => nodeIds.has(p.nodeId) && stored.get(p.nodeId) !== p.toPartitionId);
  }, [proposals, activity, nodeIds]);

  const diagnostics = useMemo(
    () => (activity?.kind === 'activity' ? validateActivity(repository, activity).filter(d => d.severity !== 'info') : []),
    [repository, activity],
  );

  // Wheel zoom around the cursor needs a non-passive listener to prevent page scroll.
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setViewport(current => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const ratio = k / current.k;
        return { k, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number, vp: Viewport = viewport): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left ?? 0) - vp.x) / vp.k, y: (clientY - (rect?.top ?? 0) - vp.y) / vp.k };
  }, [viewport]);

  const report = useCallback((result: SysmlCommandResult, fallback: string) => {
    setMessage(result.diagnostics.filter(d => d.severity === 'error').map(d => d.message).join(' ') || fallback);
  }, []);

  const execute = useCallback((command: SysmlEditorCommand, failure: string): SysmlCommandResult => {
    const result = onExecute(command);
    if (!result.committed) report(result, failure);
    else setMessage('');
    return result;
  }, [onExecute, report]);

  /** Runs a pure plan: a refused plan never reaches the gateway. */
  const executePlan = useCallback((plan: ActivityCommandPlan, failure: string): SysmlCommandResult | undefined => {
    if (!plan.ok) {
      setMessage(plan.diagnostics.map(d => d.message).join(' ') || failure);
      return undefined;
    }
    return execute(plan.command, failure);
  }, [execute]);

  /** Geometry proposes lane membership for `ids`; nothing is stored until the user confirms. */
  const proposeFor = useCallback((result: SysmlCommandResult, ids: string[]) => {
    const nextView = buildActivityDiagramView(result.repository, diagramId, result.diagramPresentations?.[diagramId]);
    setProposals(proposeLaneAssignments(nextView, { nodeIds: ids }));
  }, [diagramId]);

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------
  const placeNode = useCallback((kind: ActivityNodeKind, world: Point) => {
    const size = ACTIVITY_NODE_SIZES[kind];
    const plan = buildAddActivityNodeCommand(repository, {
      activityId, kind, diagramId,
      position: { x: snap(world.x - size.width / 2), y: snap(world.y - size.height / 2) },
    });
    const result = executePlan(plan, `The ${kind} could not be created.`);
    if (result?.committed && plan.ok) {
      setSelected([plan.createdIds[0]]);
      setTool('select');
      proposeFor(result, [plan.createdIds[0]]);
    }
  }, [activityId, diagramId, executePlan, proposeFor, repository]);

  const addExisting = useCallback((nodeId: string) => {
    if (!nodeId) return;
    const index = view.nodes.length;
    const result = execute({
      type: 'addToDiagram', diagramId, elementIds: [nodeId],
      coordinates: { [nodeId]: { x: 60 + (index % 4) * 190, y: 90 + Math.floor(index / 4) * 110 } },
    }, 'The node could not be shown on this diagram.');
    if (result.committed) setSelected([nodeId]);
  }, [diagramId, execute, view.nodes.length]);

  const addPartition = () => {
    const plan = buildAddPartitionCommand(repository, { activityId });
    const result = executePlan(plan, 'The swimlane could not be created.');
    if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
  };

  const connect = (sourceId: string, targetId: string) => {
    const plan = buildAddActivityEdgeCommand(repository, { activityId, sourceId, targetId });
    const result = executePlan(plan, 'The flow was rejected.');
    if (result?.committed) {
      setPendingSource(null);
      setTool('select');
      if (plan.ok) setSelected([plan.createdIds[0]]);
    }
  };

  // -------------------------------------------------------------------------
  // Pointer handling
  // -------------------------------------------------------------------------
  const handleFlowEndpoint = (id: string) => {
    if (!pendingSource) {
      setPendingSource(id);
      setMessage('Choose the target of the flow.');
      return;
    }
    if (pendingSource === id) {
      setPendingSource(null);
      return;
    }
    connect(pendingSource, id);
  };

  const startMove = (event: React.PointerEvent, node: ActivityNodeView) => {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const nextSelection = additive
      ? (liveSelection.includes(node.id) ? liveSelection.filter(id => id !== node.id) : [...liveSelection, node.id])
      : (liveSelection.includes(node.id) ? liveSelection : [node.id]);
    setSelected(nextSelection);
    if (additive) return;
    const origins: Record<string, Rect> = {};
    for (const candidate of view.nodes) if (nextSelection.includes(candidate.id)) origins[candidate.id] = { ...candidate.bounds };
    setDrag({ mode: 'move', startClient: { x: event.clientX, y: event.clientY }, startWorld: toWorld(event.clientX, event.clientY), viewportStart: viewport, origins, moved: false, delta: { x: 0, y: 0 } });
  };

  const onNodePointerDown = (event: React.PointerEvent, node: ActivityNodeView) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (isNodeTool(tool)) { placeNode(tool, toWorld(event.clientX, event.clientY)); return; }
    if (tool === 'flow') { handleFlowEndpoint(node.id); return; }
    startMove(event, node);
  };

  const onPinPointerDown = (event: React.PointerEvent, pinId: string) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (tool === 'flow') { handleFlowEndpoint(pinId); return; }
    if (tool === 'select') setSelected([pinId]);
  };

  const onResizePointerDown = (event: React.PointerEvent, node: ActivityNodeView) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    setDrag({
      mode: 'resize', startClient: { x: event.clientX, y: event.clientY }, startWorld: toWorld(event.clientX, event.clientY), viewportStart: viewport,
      origins: { [node.id]: { ...node.bounds } }, resizeKind: node.kind, moved: false, delta: { x: 0, y: 0 },
    });
  };

  const onEdgePointerDown = (event: React.PointerEvent, edge: ActivityEdgeView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    setSelected([edge.id]);
  };

  const onLanePointerDown = (event: React.PointerEvent, lane: ActivityLaneView) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (isNodeTool(tool)) { placeNode(tool, toWorld(event.clientX, event.clientY)); return; }
    if (tool === 'flow') { setPendingSource(null); return; }
    setSelected([lane.id]);
  };

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (isNodeTool(tool)) { placeNode(tool, toWorld(event.clientX, event.clientY)); return; }
    if (tool === 'flow') { setPendingSource(null); return; }
    setSelected([]);
    setDrag({ mode: 'pan', startClient: { x: event.clientX, y: event.clientY }, startWorld: { x: 0, y: 0 }, viewportStart: viewport, origins: {}, moved: false, delta: { x: 0, y: 0 } });
  };

  const onPointerMove = (event: { clientX: number; clientY: number }) => {
    if (!drag) return;
    const dxClient = event.clientX - drag.startClient.x;
    const dyClient = event.clientY - drag.startClient.y;
    if (!drag.moved && Math.hypot(dxClient, dyClient) < 3) return;
    if (drag.mode === 'pan') {
      setViewport({ ...drag.viewportStart, x: drag.viewportStart.x + dxClient, y: drag.viewportStart.y + dyClient });
      setDrag({ ...drag, moved: true });
      return;
    }
    const world = toWorld(event.clientX, event.clientY, drag.viewportStart);
    setDrag({ ...drag, moved: true, delta: { x: world.x - drag.startWorld.x, y: world.y - drag.startWorld.y } });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const finished = drag;
    setDrag(null);
    if (finished.mode === 'pan' || !finished.moved) return;
    const finalOverrides = dragOverrides(finished);
    const command = buildMoveActivityNodesCommand(diagramId, Object.fromEntries(
      Object.entries(finalOverrides).map(([id, rect]) => [id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }]),
    ));
    if (!command) return;
    const result = execute(command, 'The layout change was rejected.');
    if (!result.committed) return;
    if (finished.mode === 'move') proposeFor(result, Object.keys(finalOverrides));
  };

  // Drag tracking lives on the window instead of using pointer capture, so the
  // click/double-click that follows a gesture still reaches the symbol.
  const dragHandlers = useRef({ move: onPointerMove, up: onPointerUp });
  dragHandlers.current = { move: onPointerMove, up: onPointerUp };
  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return undefined;
    const move = (event: PointerEvent) => dragHandlers.current.move(event);
    const up = () => dragHandlers.current.up();
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragActive]);

  // -------------------------------------------------------------------------
  // Selection actions
  // -------------------------------------------------------------------------
  const selectedNodes = view.nodes.filter(node => liveSelection.includes(node.id));
  const singleId = liveSelection.length === 1 ? liveSelection[0] : undefined;
  const singleNode = singleId ? view.nodes.find(node => node.id === singleId) : undefined;
  const singleEdge = singleId ? view.edges.find(edge => edge.id === singleId) : undefined;
  const singleLane = singleId ? view.lanes.find(lane => lane.id === singleId) : undefined;
  const singlePin = singleId ? view.nodes.flatMap(node => node.pins.map(pin => ({ ...pin, nodeId: node.id }))).find(pin => pin.id === singleId) : undefined;
  const activityDef = activity?.kind === 'activity' ? activity : undefined;
  const sourceNode = singleNode ?? (singlePin ? view.nodes.find(node => node.id === singlePin.nodeId) : undefined);

  const removeFromDiagram = () => {
    if (selectedNodes.length === 0) return;
    const result = execute({ type: 'removeFromDiagram', diagramId, elementIds: selectedNodes.map(node => node.id) }, 'The selection could not be removed.');
    if (result.committed) setSelected([]);
  };

  const deleteFromModel = () => {
    if (singleEdge) {
      const result = executePlan(buildRemoveActivityEdgeCommand(repository, { activityId, edgeId: singleEdge.id }), 'The flow could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    if (singlePin) {
      const result = executePlan(buildRemoveActivityPinCommand(repository, { activityId, pinId: singlePin.id }), 'The pin could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    if (singleLane) {
      const result = executePlan(buildRemovePartitionCommand(repository, { activityId, partitionId: singleLane.id }), 'The swimlane could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    // Several nodes: one command each so a refusal names the node that blocks it.
    for (const node of selectedNodes) {
      const result = executePlan(buildRemoveActivityNodeCommand(repository, { activityId, nodeId: node.id, diagramPresentations }), 'The node could not be deleted.');
      if (!result?.committed) return;
    }
    setSelected([]);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (singleEdge || singlePin || singleLane) deleteFromModel();
      else removeFromDiagram();
    } else if (event.key === 'Escape') {
      setTool('select');
      setPendingSource(null);
      setMessage('');
    }
  };

  const fitToContent = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || (view.nodes.length === 0 && view.lanes.length === 0)) {
      setViewport({ x: 20, y: 20, k: 1 });
      return;
    }
    const boxes = [...view.nodes.map(node => node.bounds), ...view.lanes.map(lane => lane.bounds)];
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.width));
    const maxY = Math.max(...boxes.map(b => b.y + b.height));
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY))));
    setViewport({ k, x: 40 - minX * k + (rect.width - 80 - (maxX - minX) * k) / 2, y: 40 - minY * k + (rect.height - 80 - (maxY - minY) * k) / 2 });
  };

  const zoomBy = (factor: number) => setViewport(current => ({ ...current, k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor)) }));

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------
  const nameTargetId = singleNode?.id ?? singlePin?.id ?? singleLane?.id;
  const currentName = nameTargetId && activityDef
    ? (findInActivity(activityDef, nameTargetId)?.name ?? '')
    : '';
  const storedName = singleNode ? (activityDef?.nodes.find(node => node.id === singleNode.id)?.name ?? '') : currentName;
  const draftValue = nameDraft && nameDraft.id === nameTargetId ? nameDraft.value : storedName;
  const commitName = () => {
    if (!nameTargetId || !nameDraft || nameDraft.id !== nameTargetId) return;
    const value = nameDraft.value.trim();
    setNameDraft(null);
    if (value === storedName) return;
    executePlan(buildRenameActivityElementCommand(repository, { activityId, elementId: nameTargetId, name: value }), 'The name could not be changed.');
  };

  const storedEdge = singleEdge ? activityDef?.edges.find(edge => edge.id === singleEdge.id) : undefined;
  const guardValue = guardDraft && guardDraft.id === singleEdge?.id ? guardDraft.value : storedEdge?.guard ?? '';
  const commitGuard = () => {
    if (!singleEdge || !guardDraft || guardDraft.id !== singleEdge.id) return;
    const value = guardDraft.value;
    setGuardDraft(null);
    if (value.trim() === (storedEdge?.guard ?? '')) return;
    executePlan(buildSetEdgeGuardCommand(repository, { activityId, edgeId: singleEdge.id, guard: value }), 'The guard could not be changed.');
  };

  const typeOptions = useMemo(() => Object.values(repository.definitions)
    .filter(def => def.kind === 'valueType' || def.kind === 'enumeration' || def.kind === 'block' || def.kind === 'signal' || def.kind === 'interface')
    .map(def => ({ id: def.id, label: sysmlObjectLabel(def, 'Type') }))
    .sort((a, b) => a.label.localeCompare(b.label)), [repository.definitions]);
  // An action calls an Activity or an Interaction (a scenario shown as a sequence diagram).
  const activityOptions = useMemo(() => Object.values(repository.definitions)
    .filter(def => def.kind === 'activity' || def.kind === 'interaction')
    .map(def => ({ id: def.id, label: def.kind === 'interaction' ? `${sysmlObjectLabel(def, 'Interaction')} (interaction)` : sysmlObjectLabel(def, 'Activity') }))
    .sort((a, b) => a.label.localeCompare(b.label)), [repository.definitions]);
  const blockOptions = useMemo(() => Object.values(repository.definitions)
    .filter(def => def.kind === 'block')
    .flatMap(def => def.kind === 'block'
      ? [{ id: def.id, label: sysmlObjectLabel(def, 'Block') }, ...def.properties.filter(property => property.kind === 'part' || property.kind === 'reference')
        .map(property => ({ id: property.id, label: `${sysmlObjectLabel(def, 'Block')}.${sysmlObjectLabel(property, 'Part')}` }))]
      : [])
    .sort((a, b) => a.label.localeCompare(b.label)), [repository.definitions]);
  const allocatableTargets = blockOptions.filter(option => repository.definitions[option.id]?.kind === 'block');

  const storedNode = singleNode ? activityDef?.nodes.find(node => node.id === singleNode.id) : undefined;
  const storedPin = singlePin ? activityDef?.nodes.flatMap(node => node.pins ?? []).find(pin => pin.id === singlePin.id) : undefined;
  const storedPartition = singleLane ? activityDef?.partitions.find(partition => partition.id === singleLane.id) : undefined;

  const addPin = (direction: 'in' | 'out') => {
    if (sourceNode?.kind !== 'action') return;
    const plan = buildAddActivityPinCommand(repository, { activityId, nodeId: sourceNode.id, direction });
    const result = executePlan(plan, 'The pin could not be added.');
    if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
  };

  const allocate = (targetId: string) => {
    const sourceId = singleNode?.id ?? singleLane?.id;
    if (!sourceId || !targetId) return;
    const result = execute(buildCreateAllocationCommand(repository, sourceId, targetId), 'The allocation was rejected.');
    if (result.committed) setMessage(`Allocated ${nameOf(sourceId)} to ${nameOf(targetId)}.`);
  };

  const applyProposals = () => {
    const plan = buildAssignNodesToPartitionsCommand(repository, activityId, liveProposals);
    const result = executePlan(plan, 'The swimlane assignment was rejected.');
    if (result?.committed) setProposals([]);
  };

  const toolButton = (id: Tool, label: string, hint: string) => (
    <button
      key={id} type="button" aria-pressed={tool === id} title={hint}
      onClick={() => { setTool(id); setPendingSource(null); setMessage(''); }}
      className={`rounded border px-2 py-1 text-xs ${tool === id ? 'border-orange-600 bg-orange-950/50 text-orange-200' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
    >{label}</button>
  );

  const cursor = tool !== 'select' ? 'crosshair' : drag?.mode === 'pan' ? 'grabbing' : 'grab';
  const proposalText = (p: LaneAssignmentProposal) => {
    const node = activityNodeName(repository, activityId, p.nodeId);
    return p.toPartitionId
      ? `Put “${node}” in swimlane “${nameOf(p.toPartitionId)}”.`
      : `Remove “${node}” from swimlane “${nameOf(p.fromPartitionId ?? '')}”.`;
  };
  const selectClass = 'max-w-[200px] rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-xs';
  const inputClass = 'rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5';
  const buttonClass = 'rounded border border-neutral-600 px-2 py-0.5';

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]" aria-label="Activity Diagram workspace" data-testid="activity-workspace">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)] p-2">
        <h2 className="mr-2 text-xs font-semibold" data-testid="activity-frame-label">{frameLabel ?? 'Activity Diagram'}</h2>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Activity palette">
          {toolButton('select', 'Select', 'Select, move and resize; drag the background to pan')}
          {ACTIVITY_PALETTE.map(item => toolButton(item.kind, item.label, `Click the canvas to place ${item.label}`))}
          {toolButton('flow', 'Flow', 'Click the source, then the target (control flow, or object flow between object nodes and pins)')}
          <button type="button" className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500" onClick={addPartition} title="Add a swimlane (partition)">Swimlane</button>
        </div>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-neutral-400">
          Show existing
          <select
            aria-label="Show an existing node on this diagram" value="" onChange={event => addExisting(event.target.value)}
            className={selectClass}
          >
            <option value="">{view.hiddenNodeIds.length ? 'Choose node…' : 'Nothing to add'}</option>
            {view.hiddenNodeIds.map(id => <option key={id} value={id}>{activityNodeName(repository, activityId, id)}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1" role="toolbar" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={() => zoomBy(1 / 1.2)}>−</button>
          <span className="w-10 text-center text-[11px] text-neutral-400">{Math.round(viewport.k * 100)}%</span>
          <button type="button" aria-label="Zoom in" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={() => zoomBy(1.2)}>+</button>
          <button type="button" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={fitToContent}>Fit</button>
        </div>
      </header>

      <div
        ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-hidden outline-none"
        aria-label="Activity canvas" role="application" data-testid="activity-canvas"
      >
        <svg ref={svgRef} width="100%" height="100%" style={{ cursor, touchAction: 'none', display: 'block' }} onPointerDown={onBackgroundPointerDown}>
          <defs>
            {[['act-open', STROKE], ['act-open-sel', SELECTED]].map(([id, color]) => (
              <marker key={id} id={id} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M1,1 L11,6 L1,11" fill="none" stroke={color} strokeWidth="1.5" />
              </marker>
            ))}
          </defs>
          <rect width="100%" height="100%" fill="transparent" />
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
            {view.lanes.map(lane => (
              <g key={lane.id} onPointerDown={event => onLanePointerDown(event, lane)}>
                <LaneShape lane={lane} selected={liveSelection.includes(lane.id)} />
              </g>
            ))}
            {view.edges.map(edge => (
              <g key={edge.id} data-testid="activity-edge" data-kind={edge.kind} onPointerDown={event => onEdgePointerDown(event, edge)}>
                <EdgeShape edge={edge} selected={liveSelection.includes(edge.id)} />
              </g>
            ))}
            {view.nodes.map(node => (
              <g
                key={node.id} data-testid={`activity-node-${node.kind}`} data-label={node.label} data-pending-source={pendingSource === node.id || undefined}
                onPointerDown={event => onNodePointerDown(event, node)}
                onDoubleClick={() => onNavigate?.(activityDef?.nodes.find(candidate => candidate.id === node.id)?.behaviorId ?? node.id)}
              >
                <NodeShape node={node} selected={liveSelection.includes(node.id)} pending={pendingSource === node.id} />
                {node.pins.map(pin => (
                  <g key={pin.id} onPointerDown={event => onPinPointerDown(event, pin.id)}>
                    <PinShape pin={pin} selected={liveSelection.includes(pin.id)} pending={pendingSource === pin.id} />
                  </g>
                ))}
              </g>
            ))}
            {singleNode && RESIZABLE.has(singleNode.kind) && tool === 'select' && (
              <rect
                data-testid="activity-resize-handle" x={singleNode.bounds.x + singleNode.bounds.width - 6} y={singleNode.bounds.y + singleNode.bounds.height - 6}
                width={12} height={12} fill={SELECTED} style={{ cursor: 'nwse-resize' }}
                onPointerDown={event => onResizePointerDown(event, singleNode)}
              />
            )}
          </g>
        </svg>
        {view.nodes.length === 0 && view.lanes.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-neutral-500" data-testid="activity-empty">
            This Activity diagram is empty. Choose Action, Initial Node or another node in the palette and click the canvas,<br />or use “Show existing” to add nodes already in the activity.
          </p>
        )}
      </div>

      <footer className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] p-2 text-xs" aria-live="polite">
        {!activityDef && (
          <p className="mb-1 text-amber-300" data-testid="activity-no-activity">No Activity diagram is open. Create an Activity in the Model Explorer, then create an Activity Diagram on it.</p>
        )}
        {view.missingElementIds.length > 0 && (
          <div className="mb-1 flex items-center gap-2 text-amber-300">
            <span>{view.missingElementIds.length} shown element(s) no longer exist in the activity.</span>
            <button type="button" className="rounded border border-amber-700 px-2 py-0.5" onClick={() => execute({ type: 'removeFromDiagram', diagramId, elementIds: view.missingElementIds }, 'The stale symbols could not be removed.')}>Remove stale symbols</button>
          </div>
        )}

        {liveProposals.length > 0 && (
          <div role="alertdialog" aria-label="Confirm swimlane assignment" className="mb-1 rounded border border-sky-700 bg-sky-950/40 p-2" data-testid="lane-proposal">
            <ul className="mb-1 list-disc pl-4">
              {liveProposals.map(p => <li key={p.nodeId}>{proposalText(p)}</li>)}
            </ul>
            <div className="flex gap-2">
              <button type="button" className="rounded border border-sky-600 px-2 py-0.5" onClick={applyProposals}>Apply</button>
              <button type="button" className={buttonClass} onClick={() => setProposals([])}>Keep as drawn only</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2" data-testid="activity-inspector">
          {liveSelection.length === 0 && <span className="text-neutral-500">Nothing selected. Delete removes selected nodes from this diagram only; use “Delete from model” to remove them from the activity.</span>}
          {singleNode && (
            <>
              <span className="text-neutral-400">{singleNode.kind === 'action' ? 'Action' : singleNode.kind === 'activityParameterNode' ? 'Activity Parameter' : singleNode.kind === 'objectNode' ? 'Object Node' : singleNode.label}</span>
              {(singleNode.kind === 'action' || singleNode.kind === 'objectNode' || singleNode.kind === 'activityParameterNode') ? (
                <input
                  aria-label="Name" value={draftValue}
                  onChange={event => setNameDraft({ id: singleNode.id, value: event.target.value })}
                  onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                  className={inputClass}
                />
              ) : <strong>{singleNode.label}</strong>}
              {singleNode.kind === 'action' && (
                <>
                  <label>Calls{' '}
                    <select
                      aria-label="Called behavior" className={selectClass} value={storedNode?.behaviorId ?? ''}
                      onChange={event => executePlan(buildUpdateActivityNodeCommand(repository, { activityId, nodeId: singleNode.id, behaviorId: event.target.value || null }), 'The called behavior was rejected.')}
                    >
                      <option value="">(opaque action)</option>
                      {activityOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className={buttonClass} onClick={() => addPin('in')}>Add input pin</button>
                  <button type="button" className={buttonClass} onClick={() => addPin('out')}>Add output pin</button>
                </>
              )}
              {(singleNode.kind === 'objectNode' || singleNode.kind === 'activityParameterNode') && (
                <label>Type{' '}
                  <select
                    aria-label="Type" className={selectClass} value={storedNode?.typeId ?? ''}
                    onChange={event => executePlan(buildUpdateActivityNodeCommand(repository, { activityId, nodeId: singleNode.id, typeId: event.target.value || null }), 'The type was rejected.')}
                  >
                    <option value="">(untyped)</option>
                    {typeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
              )}
              {singleNode.kind === 'action' && (
                <label>Allocate to{' '}
                  <select aria-label="Allocate action to" className={selectClass} value="" onChange={event => allocate(event.target.value)}>
                    <option value="">Choose Block…</option>
                    {allocatableTargets.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
              )}
              {singleNode.partitionId && <span className="text-neutral-400">Swimlane: {nameOf(singleNode.partitionId)}</span>}
              {singleNode.allocatedTo.length > 0 && <span className="text-neutral-400">Allocated to: {singleNode.allocatedTo.join(', ')}</span>}
            </>
          )}
          {singlePin && (
            <>
              <span className="text-neutral-400">{singlePin.direction === 'in' ? 'Input pin' : 'Output pin'}</span>
              <input
                aria-label="Name" value={draftValue}
                onChange={event => setNameDraft({ id: singlePin.id, value: event.target.value })}
                onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                className={inputClass}
              />
              <label>Type{' '}
                <select
                  aria-label="Pin type" className={selectClass} value={storedPin?.typeId ?? ''}
                  onChange={event => executePlan(buildUpdateActivityPinCommand(repository, { activityId, pinId: singlePin.id, typeId: event.target.value || null }), 'The pin type was rejected.')}
                >
                  <option value="">(untyped)</option>
                  {typeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            </>
          )}
          {singleEdge && (
            <>
              <span className="text-neutral-400">{singleEdge.kind === 'objectFlow' ? 'Object flow' : 'Control flow'}</span>
              <span>{nameOf(singleEdge.sourceId)} → {nameOf(singleEdge.targetId)}</span>
              <label>Guard{' '}
                <input
                  aria-label="Guard" value={guardValue}
                  onChange={event => setGuardDraft({ id: singleEdge.id, value: event.target.value })}
                  onBlur={commitGuard} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                  className={inputClass}
                />
              </label>
            </>
          )}
          {singleLane && (
            <>
              <span className="text-neutral-400">Swimlane</span>
              <input
                aria-label="Name" value={draftValue}
                onChange={event => setNameDraft({ id: singleLane.id, value: event.target.value })}
                onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                className={inputClass}
              />
              <label>Represents{' '}
                <select
                  aria-label="Swimlane represents" className={selectClass} value={storedPartition?.representsId ?? ''}
                  onChange={event => executePlan(buildSetPartitionRepresentsCommand(repository, { activityId, partitionId: singleLane.id, representsId: event.target.value || undefined }), 'The swimlane could not be changed.')}
                >
                  <option value="">(nothing)</option>
                  {blockOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label>Allocate to{' '}
                <select aria-label="Allocate swimlane to" className={selectClass} value="" onChange={event => allocate(event.target.value)}>
                  <option value="">Choose Block…</option>
                  {allocatableTargets.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <button type="button" className={buttonClass} onClick={() => executePlan(buildMovePartitionCommand(repository, { activityId, partitionId: singleLane.id, direction: -1 }), 'The swimlane could not be moved.')}>Move left</button>
              <button type="button" className={buttonClass} onClick={() => executePlan(buildMovePartitionCommand(repository, { activityId, partitionId: singleLane.id, direction: 1 }), 'The swimlane could not be moved.')}>Move right</button>
            </>
          )}
          {liveSelection.length > 1 && <span>{liveSelection.length} items selected</span>}
          {selectedNodes.length > 0 && (
            <button type="button" className={buttonClass} onClick={removeFromDiagram}>Remove from diagram</button>
          )}
          {liveSelection.length > 0 && (
            <button type="button" className="rounded border border-red-800 px-2 py-0.5 text-red-300 hover:bg-red-950" onClick={deleteFromModel}>
              {singleEdge ? 'Delete flow' : singlePin ? 'Delete pin' : singleLane ? 'Delete swimlane' : 'Delete from model'}
            </button>
          )}
        </div>

        {diagnostics.length > 0 && (
          <ul className="mt-1 max-h-24 overflow-auto text-[11px]" data-testid="activity-diagnostics" aria-label="Activity diagnostics">
            {diagnostics.slice(0, 8).map((d, index) => (
              <li key={`${d.code}-${d.elementId}-${index}`} className={d.severity === 'error' ? 'text-red-300' : 'text-amber-300'}>{d.message}</li>
            ))}
            {diagnostics.length > 8 && <li className="text-neutral-400">…and {diagnostics.length - 8} more</li>}
          </ul>
        )}
        {message && <p data-testid="activity-message" className="mt-1 text-neutral-300">{message}</p>}
      </footer>
    </section>
  );
}
