import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SysmlRepository, UseCaseRelationshipKind } from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import { impactSeverity } from '../../engine/sysml/mutations';
import { computeImpactHash, type SysmlCommandResult, type SysmlEditorCommand } from '../../services/sysmlCommandGateway';
import {
  buildAssignSubjectsCommand,
  buildCreateExtensionPointCommand,
  buildCreateUseCaseRelationshipCommand,
  type UseCaseRelationshipInput,
} from '../../services/sysmlUseCaseCommands';
import {
  ACTOR_SIZE,
  SUBJECT_HEADER_HEIGHT,
  SUBJECT_SIZE,
  USE_CASE_RELATIONSHIP_TOOLS,
  USE_CASE_SIZE,
  buildUseCaseDiagramView,
  proposeSubjectAssignments,
  subjectMemberIds,
  useCaseMinHeight,
  withBoundsOverrides,
  type Point,
  type Rect,
  type SubjectAssignmentProposal,
  type UseCaseEdgeView,
  type UseCaseNodeView,
} from '../../features/sysml/useCaseDiagramView';
import { createActor, createSubject, createUseCase } from '../../features/modelExplorer/adapters/modelExplorerFactories';
import { diagramFrameLabel } from '../../features/sysml/diagramFrame';
import { resolveSysmlReferenceLabel, sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';

export interface UseCaseWorkspaceProps {
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

type Tool = 'select' | 'actor' | 'useCase' | 'subject' | UseCaseRelationshipKind;
type CreationTool = 'actor' | 'useCase' | 'subject';
interface Viewport { x: number; y: number; k: number }

const GRID = 10;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const snap = (value: number) => Math.round(value / GRID) * GRID;
const isCreationTool = (tool: Tool): tool is CreationTool => tool === 'actor' || tool === 'useCase' || tool === 'subject';
const isRelationshipTool = (tool: Tool): tool is UseCaseRelationshipKind => !isCreationTool(tool) && tool !== 'select';

interface DragState {
  mode: 'move' | 'resize' | 'pan';
  startClient: Point;
  startWorld: Point;
  viewportStart: Viewport;
  /** Full rectangles of every element being moved (or the one being resized). */
  origins: Record<string, Rect>;
  resizeKind?: UseCaseNodeView['kind'];
  resizeExtensionPoints?: number;
  moved: boolean;
  delta: Point;
}

interface ExtendPrompt {
  sourceId: string;
  targetId: string;
  candidates: Array<{ id: string; label: string }>;
  chosenId: string;
  newName: string;
  condition: string;
}

interface PendingDeletion {
  ids: string[];
  command: SysmlEditorCommand;
  impact: NonNullable<SysmlCommandResult['impact']>;
}

function fit(text: string, widthPx: number, fontSize: number): string {
  const maxChars = Math.max(3, Math.floor(widthPx / (fontSize * 0.56)));
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function minSize(kind: UseCaseNodeView['kind'], extensionPoints: number): { width: number; height: number } {
  switch (kind) {
    case 'subject': return { width: 160, height: 120 };
    case 'requirement': return { width: 100, height: 40 };
    case 'useCase': return { width: 100, height: useCaseMinHeight(extensionPoints) };
    default: return ACTOR_SIZE;
  }
}

function resizedRect(drag: DragState, id: string): Rect {
  const origin = drag.origins[id];
  const min = minSize(drag.resizeKind ?? 'useCase', drag.resizeExtensionPoints ?? 0);
  return {
    x: origin.x,
    y: origin.y,
    width: Math.max(min.width, snap(origin.width + drag.delta.x)),
    height: Math.max(min.height, snap(origin.height + drag.delta.y)),
  };
}

function dragOverrides(drag: DragState): Record<string, Rect> {
  if (drag.mode === 'pan') return {};
  if (drag.mode === 'resize') {
    const id = Object.keys(drag.origins)[0];
    return id ? { [id]: resizedRect(drag, id) } : {};
  }
  return Object.fromEntries(Object.entries(drag.origins).map(([id, origin]) => [
    id,
    { ...origin, x: snap(origin.x + drag.delta.x), y: snap(origin.y + drag.delta.y) },
  ]));
}

function ActorFigure({ node, selected }: { node: UseCaseNodeView; selected: boolean }) {
  const { x, y, width, height } = node.bounds;
  const cx = x + width / 2;
  const stroke = selected ? 'var(--sysml-sem-selection)' : 'var(--sysml-block-stroke)';
  const shoulder = y + 34;
  const hip = y + 62;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill="transparent" />
      <circle cx={cx} cy={y + 13} r={10} fill="var(--sysml-block-fill)" stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
      <path d={`M${cx},${y + 23} L${cx},${hip} M${cx - 20},${shoulder} L${cx + 20},${shoulder} M${cx},${hip} L${cx - 16},${y + 88} M${cx},${hip} L${cx + 16},${y + 88}`} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeLinecap="round" />
      <text x={cx} y={y + height - 6} textAnchor="middle" fontSize={13} fill="var(--sysml-block-text)">{fit(node.label, width + 40, 13)}</text>
    </g>
  );
}

function UseCaseEllipse({ node, selected }: { node: UseCaseNodeView; selected: boolean }) {
  const { x, y, width, height } = node.bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const stroke = selected ? 'var(--sysml-sem-selection)' : 'var(--sysml-block-stroke)';
  const count = node.extensionPoints.length;
  const nameY = count > 0 ? y + height * 0.34 : cy + 4;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={width / 2} ry={height / 2} fill="var(--sysml-block-fill)" stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
      <text x={cx} y={nameY} textAnchor="middle" fontSize={13} fill="var(--sysml-block-text)">{fit(node.label, width * 0.72, 13)}</text>
      {count > 0 && (
        <g>
          <line x1={x + width * 0.16} x2={x + width * 0.84} y1={nameY + 8} y2={nameY + 8} stroke="var(--sysml-block-divider)" />
          <text x={cx} y={nameY + 20} textAnchor="middle" fontSize={10} fill="var(--sysml-block-subtext)">extension points</text>
          {node.extensionPoints.map((point, index) => (
            <text key={point.id} x={cx} y={nameY + 34 + index * 16} textAnchor="middle" fontSize={11} fill="var(--sysml-block-text)">
              {fit(point.location ? `${point.label} (${point.location})` : point.label, width * 0.62, 11)}
            </text>
          ))}
        </g>
      )}
    </g>
  );
}

function SubjectRectangle({ node, selected }: { node: UseCaseNodeView; selected: boolean }) {
  const { x, y, width, height } = node.bounds;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill="var(--sysml-block-fill)" fillOpacity={0.45} stroke={selected ? 'var(--sysml-sem-selection)' : 'var(--sysml-block-stroke)'} strokeWidth={selected ? 2 : 1.5} />
      <line x1={x} x2={x + width} y1={y + SUBJECT_HEADER_HEIGHT} y2={y + SUBJECT_HEADER_HEIGHT} stroke="var(--sysml-block-divider)" />
      <text x={x + width / 2} y={y + 20} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--sysml-block-text)">{fit(node.label, width - 16, 13)}</text>
    </g>
  );
}

function RequirementBox({ node, selected }: { node: UseCaseNodeView; selected: boolean }) {
  const { x, y, width, height } = node.bounds;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill="var(--sysml-requirement-fill)" stroke={selected ? 'var(--sysml-sem-selection)' : 'var(--sysml-block-stroke)'} strokeWidth={selected ? 2 : 1.5} />
      <text x={x + width / 2} y={y + 20} textAnchor="middle" fontSize={10} fill="var(--sysml-block-meta)">«requirement»</text>
      <text x={x + width / 2} y={y + 40} textAnchor="middle" fontSize={13} fill="var(--sysml-block-text)">{fit(node.label, width - 12, 13)}</text>
    </g>
  );
}

function EdgeShape({ edge, selected }: { edge: UseCaseEdgeView; selected: boolean }) {
  const stroke = selected ? 'var(--sysml-sem-selection)' : 'var(--sysml-block-stroke)';
  const marker = edge.head === 'openArrow' ? `url(#uc-open${selected ? '-sel' : ''})`
    : edge.head === 'hollowTriangle' ? `url(#uc-tri${selected ? '-sel' : ''})` : undefined;
  const lines = [edge.keyword, ...edge.noteLines].filter(Boolean);
  return (
    <g>
      <line x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} stroke="transparent" strokeWidth={14} />
      <line
        x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y}
        stroke={stroke} strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={edge.lineStyle === 'dashed' ? '7 5' : undefined}
        markerEnd={marker}
      />
      {lines.map((line, index) => (
        <text
          key={index} x={edge.labelAt.x} y={edge.labelAt.y - 6 + index * 13} textAnchor="middle" fontSize={11}
          fill={index === 0 && edge.keyword ? 'var(--sysml-block-meta)' : 'var(--sysml-block-subtext)'}
          stroke="var(--surface-canvas)" strokeWidth={3} paintOrder="stroke"
        >{line}</text>
      ))}
    </g>
  );
}

export function UseCaseWorkspace({
  repository, diagramId, diagramPresentations, onExecute, onNavigate, onSelect, authorizedBaselineIds = [],
}: UseCaseWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 20, y: 20, k: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [extendPrompt, setExtendPrompt] = useState<ExtendPrompt | null>(null);
  const [proposals, setProposals] = useState<SubjectAssignmentProposal[]>([]);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [message, setMessage] = useState('');
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);
  const [extensionPointDraft, setExtensionPointDraft] = useState('');

  const presentation = diagramPresentations[diagramId];
  const baseView = useMemo(() => buildUseCaseDiagramView(repository, presentation), [repository, presentation]);
  const overrides = useMemo(() => (drag && drag.moved ? dragOverrides(drag) : {}), [drag]);
  const view = useMemo(
    () => (Object.keys(overrides).length > 0 ? buildUseCaseDiagramView(repository, withBoundsOverrides(presentation, overrides, diagramId)) : baseView),
    [repository, presentation, overrides, baseView, diagramId],
  );

  const nodeIds = useMemo(() => new Set(view.nodes.map(node => node.id)), [view]);
  const edgeIds = useMemo(() => new Set(view.edges.map(edge => edge.id)), [view]);
  const liveSelection = useMemo(() => selected.filter(id => nodeIds.has(id) || edgeIds.has(id)), [selected, nodeIds, edgeIds]);
  const ownerId = repository.diagrams[diagramId]?.ownerId || 'model';
  const frameLabel = diagramFrameLabel(repository, diagramId);
  const nameOf = useCallback((id: string) => resolveSysmlReferenceLabel(repository, id), [repository]);

  useEffect(() => { onSelect?.(liveSelection); }, [liveSelection.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proposals go stale once the repository already agrees with them.
  const liveProposals = useMemo(
    () => proposals.filter(p => repository.useCases[p.useCaseId] && repository.useCases[p.useCaseId].subjectId !== p.toSubjectId),
    [proposals, repository],
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

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------
  const placeElement = useCallback((which: CreationTool, world: Point) => {
    const existing = (record: Record<string, { name: string }> | undefined) => Object.values(record ?? {}).map(item => item.name);
    const size = which === 'actor' ? ACTOR_SIZE : which === 'subject' ? SUBJECT_SIZE : USE_CASE_SIZE;
    const element = which === 'actor'
      ? createActor({ ownerId, existingNames: existing(repository.actors) })
      : which === 'subject'
        ? createSubject({ ownerId, existingNames: existing(repository.subjects) })
        : createUseCase({ ownerId, existingNames: existing(repository.useCases) });
    const presentationBounds = { x: snap(world.x - size.width / 2), y: snap(world.y - size.height / 2), width: size.width, height: size.height };
    const result = execute({ type: 'createAndPresent', element, diagramId, presentation: presentationBounds }, `The ${which} could not be created.`);
    if (result.committed) {
      setSelected([element.id]);
      setTool('select');
    }
  }, [diagramId, execute, ownerId, repository]);

  const addExisting = useCallback((elementId: string) => {
    if (!elementId) return;
    const index = view.nodes.length;
    const result = execute({
      type: 'addToDiagram', diagramId, elementIds: [elementId],
      coordinates: { [elementId]: { x: 60 + (index % 4) * 230, y: 60 + Math.floor(index / 4) * 150 } },
    }, 'The element could not be shown on this diagram.');
    if (result.committed) setSelected([elementId]);
  }, [diagramId, execute, view.nodes.length]);

  const addableElements = useMemo(() => {
    const shown = new Set(presentation?.elementIds ?? []);
    const rows = (record: Record<string, { id: string; name: string }> | undefined, label: string) =>
      Object.values(record ?? {}).filter(item => !shown.has(item.id)).map(item => ({ id: item.id, label: `${sysmlObjectLabel(item, label)} (${label})` }));
    return [
      ...rows(repository.actors, 'Actor'),
      ...rows(repository.subjects, 'Subject'),
      ...rows(repository.useCases, 'Use Case'),
      ...rows(repository.requirements, 'Requirement'),
    ];
  }, [repository, presentation]);

  const createRelationship = useCallback((input: UseCaseRelationshipInput) => {
    const plan = buildCreateUseCaseRelationshipCommand(repository, input);
    if (!plan.ok) {
      if (plan.needsExtensionPoint) {
        setExtendPrompt({
          sourceId: input.sourceId,
          targetId: input.targetId,
          candidates: plan.needsExtensionPoint.candidates,
          chosenId: plan.needsExtensionPoint.candidates[0]?.id ?? '',
          newName: plan.needsExtensionPoint.candidates.length === 0 ? 'extensionPoint' : '',
          condition: input.condition ?? '',
        });
        return;
      }
      setMessage(plan.diagnostics.map(d => d.message).join(' '));
      return;
    }
    const result = execute(plan.command, 'The relationship was rejected.');
    if (result.committed) {
      setExtendPrompt(null);
      setPendingSource(null);
      setTool('select');
      const createdId = plan.command.type === 'createElement' ? plan.command.element.id
        : plan.command.type === 'batch' ? (plan.command.commands[plan.command.commands.length - 1] as { element?: { id: string } }).element?.id : undefined;
      if (createdId) setSelected([createdId]);
    }
  }, [execute, repository]);

  const confirmExtend = () => {
    if (!extendPrompt) return;
    const newName = extendPrompt.newName.trim();
    createRelationship({
      kind: 'extend',
      sourceId: extendPrompt.sourceId,
      targetId: extendPrompt.targetId,
      condition: extendPrompt.condition,
      ...(newName ? { newExtensionPointName: newName } : { extensionPointId: extendPrompt.chosenId }),
    });
  };

  // -------------------------------------------------------------------------
  // Pointer handling
  // -------------------------------------------------------------------------
  const handleEndpointClick = (id: string) => {
    if (!isRelationshipTool(tool)) return;
    if (!pendingSource) {
      setPendingSource(id);
      setMessage(`Choose the target for the ${USE_CASE_RELATIONSHIP_TOOLS.find(t => t.kind === tool)?.label ?? 'relationship'}.`);
      return;
    }
    if (pendingSource === id) {
      setPendingSource(null);
      return;
    }
    createRelationship({ kind: tool, sourceId: pendingSource, targetId: id });
  };

  const startMove = (event: React.PointerEvent, node: UseCaseNodeView) => {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const nextSelection = additive
      ? (liveSelection.includes(node.id) ? liveSelection.filter(id => id !== node.id) : [...liveSelection, node.id])
      : (liveSelection.includes(node.id) ? liveSelection : [node.id]);
    setSelected(nextSelection);
    if (additive) return;
    const movingIds = new Set<string>(nextSelection.filter(id => nodeIds.has(id)));
    for (const id of [...movingIds]) for (const memberId of subjectMemberIds(view, id)) movingIds.add(memberId);
    const origins: Record<string, Rect> = {};
    for (const candidate of view.nodes) if (movingIds.has(candidate.id)) origins[candidate.id] = { ...candidate.bounds };
    const startWorld = toWorld(event.clientX, event.clientY);
    setDrag({ mode: 'move', startClient: { x: event.clientX, y: event.clientY }, startWorld, viewportStart: viewport, origins, moved: false, delta: { x: 0, y: 0 } });
  };

  const onNodePointerDown = (event: React.PointerEvent, node: UseCaseNodeView) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (isCreationTool(tool)) {
      const world = toWorld(event.clientX, event.clientY);
      placeElement(tool, world);
      return;
    }
    if (isRelationshipTool(tool)) {
      handleEndpointClick(node.id);
      return;
    }
    startMove(event, node);
  };

  const onResizePointerDown = (event: React.PointerEvent, node: UseCaseNodeView) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    setDrag({
      mode: 'resize', startClient: { x: event.clientX, y: event.clientY }, startWorld: toWorld(event.clientX, event.clientY), viewportStart: viewport,
      origins: { [node.id]: { ...node.bounds } }, resizeKind: node.kind, resizeExtensionPoints: node.extensionPoints.length, moved: false, delta: { x: 0, y: 0 },
    });
  };

  const onEdgePointerDown = (event: React.PointerEvent, edge: UseCaseEdgeView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    setSelected(additive ? (liveSelection.includes(edge.id) ? liveSelection.filter(id => id !== edge.id) : [...liveSelection, edge.id]) : [edge.id]);
  };

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (isCreationTool(tool)) {
      placeElement(tool, toWorld(event.clientX, event.clientY));
      return;
    }
    if (isRelationshipTool(tool)) {
      setPendingSource(null);
      return;
    }
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
    const commands = Object.entries(finalOverrides).map(([elementId, rect]) => ({
      type: 'updatePresentation' as const, diagramId, elementId,
      presentation: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }));
    if (commands.length === 0) return;
    const result = execute(commands.length === 1 ? commands[0] : { type: 'batch', commands }, 'The layout change was rejected.');
    if (!result.committed) return;
    // Geometry proposes; nothing about subject membership changes until confirmed.
    const previewView = buildUseCaseDiagramView(repository, withBoundsOverrides(presentation, finalOverrides, diagramId));
    const movedIds = Object.keys(finalOverrides);
    const touchesSubject = movedIds.some(id => previewView.nodes.find(node => node.id === id)?.kind === 'subject');
    setProposals(proposeSubjectAssignments(previewView, touchesSubject ? {} : { useCaseIds: movedIds }));
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
  const removeFromDiagram = () => {
    if (liveSelection.length === 0) return;
    const result = execute({ type: 'removeFromDiagram', diagramId, elementIds: liveSelection }, 'The selection could not be removed.');
    if (result.committed) setSelected([]);
  };

  const deleteFromModel = () => {
    if (liveSelection.length === 0) return;
    const command: SysmlEditorCommand = { type: 'deleteElements', elementIds: [...liveSelection], authorizedBaselineIds: [...authorizedBaselineIds] };
    const result = onExecute(command);
    if (result.committed) {
      setSelected([]);
      setMessage('');
    } else if (result.impact) {
      setPendingDeletion({ ids: [...liveSelection], command, impact: result.impact });
    } else {
      report(result, 'The selection could not be deleted.');
    }
  };

  const confirmDeletion = () => {
    if (!pendingDeletion) return;
    const result = onExecute({ ...pendingDeletion.command, confirmedImpactHash: computeImpactHash(pendingDeletion.impact) } as SysmlEditorCommand);
    if (result.committed) {
      setSelected([]);
      setMessage('');
    } else report(result, 'The selection could not be deleted.');
    setPendingDeletion(null);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeFromDiagram();
    } else if (event.key === 'Escape') {
      setTool('select');
      setPendingSource(null);
      setExtendPrompt(null);
      setMessage('');
    }
  };

  const fitToContent = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || view.nodes.length === 0) {
      setViewport({ x: 20, y: 20, k: 1 });
      return;
    }
    const minX = Math.min(...view.nodes.map(n => n.bounds.x));
    const minY = Math.min(...view.nodes.map(n => n.bounds.y));
    const maxX = Math.max(...view.nodes.map(n => n.bounds.x + n.bounds.width));
    const maxY = Math.max(...view.nodes.map(n => n.bounds.y + n.bounds.height));
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY))));
    setViewport({ k, x: 40 - minX * k + (rect.width - 80 - (maxX - minX) * k) / 2, y: 40 - minY * k + (rect.height - 80 - (maxY - minY) * k) / 2 });
  };

  const zoomBy = (factor: number) => setViewport(current => ({ ...current, k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor)) }));

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------
  const singleId = liveSelection.length === 1 ? liveSelection[0] : undefined;
  const singleNode = singleId ? view.nodes.find(node => node.id === singleId) : undefined;
  const singleEdge = singleId ? view.edges.find(edge => edge.id === singleId) : undefined;
  const selectedElement = singleId
    ? (repository.actors[singleId] ?? repository.subjects[singleId] ?? repository.useCases[singleId] ?? repository.requirements[singleId] ?? repository.relationships[singleId])
    : undefined;
  const currentName = (selectedElement as { name?: string } | undefined)?.name ?? '';
  const draftValue = nameDraft && nameDraft.id === singleId ? nameDraft.value : currentName;
  const canRenameNode = Boolean(singleNode && singleNode.kind !== 'requirement');
  const commitName = () => {
    if (!singleId || !nameDraft || nameDraft.id !== singleId) return;
    const value = nameDraft.value.trim();
    setNameDraft(null);
    if (value === currentName || (singleNode && !value)) return;
    execute({ type: 'updateElement', elementId: singleId, patch: { name: value } }, 'The name could not be changed.');
  };

  const addExtensionPoint = () => {
    if (!singleNode || singleNode.kind !== 'useCase') return;
    const command = buildCreateExtensionPointCommand(repository, singleNode.id, extensionPointDraft);
    if (!command) return;
    const result = execute(command, 'The extension point was rejected.');
    if (result.committed) setExtensionPointDraft('');
  };

  const applyProposals = () => {
    const command = buildAssignSubjectsCommand(liveProposals);
    if (!command) return;
    const result = execute(command, 'The subject assignment was rejected.');
    if (result.committed) setProposals([]);
  };

  const toolButton = (id: Tool, label: string, hint: string) => (
    <button
      key={id} type="button" aria-pressed={tool === id} title={hint}
      onClick={() => { setTool(id); setPendingSource(null); setMessage(''); }}
      className={`rounded border px-2 py-1 text-xs ${tool === id ? 'border-orange-600 bg-orange-950/50 text-orange-200' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
    >{label}</button>
  );

  const blocked = pendingDeletion ? impactSeverity(pendingDeletion.impact, authorizedBaselineIds) === 'blocked' : false;
  const cursor = isCreationTool(tool) || isRelationshipTool(tool) ? 'crosshair' : drag?.mode === 'pan' ? 'grabbing' : 'grab';

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]" aria-label="Use Case Diagram workspace" data-testid="usecase-workspace">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)] p-2">
        <h2 className="mr-2 text-xs font-semibold" data-testid="usecase-frame-label">{frameLabel ?? 'Use Case Diagram'}</h2>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Use Case palette">
          {toolButton('select', 'Select', 'Select, move and resize; drag the background to pan')}
          {toolButton('actor', 'Actor', 'Click the canvas to place an Actor')}
          {toolButton('useCase', 'Use Case', 'Click the canvas to place a Use Case')}
          {toolButton('subject', 'Subject', 'Click the canvas to place a Subject rectangle')}
          <button
            type="button" disabled={singleNode?.kind !== 'useCase'} onClick={addExtensionPoint}
            title="Add an extension point to the selected Use Case"
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
          >Extension Point</button>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Use Case relationships">
          {USE_CASE_RELATIONSHIP_TOOLS.map(item => toolButton(item.kind, item.label, `Click the source, then the target (${item.label})`))}
        </div>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-neutral-400">
          Show existing
          <select
            aria-label="Add existing element to this diagram" value="" onChange={event => addExisting(event.target.value)}
            className="max-w-[180px] rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-xs"
          >
            <option value="">{addableElements.length ? 'Choose element…' : 'Nothing to add'}</option>
            {addableElements.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
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
        aria-label="Use Case canvas" role="application" data-testid="usecase-canvas"
      >
        <svg
          ref={svgRef} width="100%" height="100%" style={{ cursor, touchAction: 'none', display: 'block' }}
          onPointerDown={onBackgroundPointerDown}
        >
          <defs>
            {[['uc-open', 'var(--sysml-block-stroke)'], ['uc-open-sel', 'var(--sysml-sem-selection)']].map(([id, color]) => (
              <marker key={id} id={id} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M1,1 L11,6 L1,11" fill="none" stroke={color} strokeWidth="1.5" />
              </marker>
            ))}
            {[['uc-tri', 'var(--sysml-block-stroke)'], ['uc-tri-sel', 'var(--sysml-sem-selection)']].map(([id, color]) => (
              <marker key={id} id={id} viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M1,1 L13,7 L1,13 Z" fill="var(--sysml-block-fill)" stroke={color} strokeWidth="1.5" />
              </marker>
            ))}
          </defs>
          <rect width="100%" height="100%" fill="transparent" />
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
            {view.nodes.filter(node => node.kind === 'subject').map(node => (
              <g key={node.id} data-testid={`uc-node-${node.kind}`} data-label={node.label} onPointerDown={event => onNodePointerDown(event, node)} onDoubleClick={() => onNavigate?.(node.id)}>
                <SubjectRectangle node={node} selected={liveSelection.includes(node.id)} />
              </g>
            ))}
            {view.edges.map(edge => (
              <g key={edge.id} data-testid="uc-edge" data-kind={edge.relationshipKind} onPointerDown={event => onEdgePointerDown(event, edge)}>
                <EdgeShape edge={edge} selected={liveSelection.includes(edge.id)} />
              </g>
            ))}
            {view.nodes.filter(node => node.kind !== 'subject').map(node => (
              <g
                key={node.id} data-testid={`uc-node-${node.kind}`} data-label={node.label} data-pending-source={pendingSource === node.id || undefined}
                onPointerDown={event => onNodePointerDown(event, node)} onDoubleClick={() => onNavigate?.(node.id)}
              >
                {node.kind === 'actor' && <ActorFigure node={node} selected={liveSelection.includes(node.id)} />}
                {node.kind === 'useCase' && <UseCaseEllipse node={node} selected={liveSelection.includes(node.id)} />}
                {node.kind === 'requirement' && <RequirementBox node={node} selected={liveSelection.includes(node.id)} />}
                {pendingSource === node.id && (
                  <rect x={node.bounds.x - 4} y={node.bounds.y - 4} width={node.bounds.width + 8} height={node.bounds.height + 8} fill="none" stroke="var(--sysml-sem-selection)" strokeDasharray="4 3" />
                )}
              </g>
            ))}
            {singleNode && singleNode.kind !== 'actor' && tool === 'select' && (
              <rect
                data-testid="uc-resize-handle" x={singleNode.bounds.x + singleNode.bounds.width - 6} y={singleNode.bounds.y + singleNode.bounds.height - 6}
                width={12} height={12} fill="var(--sysml-sem-selection)" style={{ cursor: 'nwse-resize' }}
                onPointerDown={event => onResizePointerDown(event, singleNode)}
              />
            )}
          </g>
        </svg>
        {view.nodes.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-neutral-500" data-testid="usecase-empty">
            This Use Case diagram is empty. Choose Actor, Use Case or Subject in the palette and click the canvas,<br />or use “Show existing” to add elements already in the model.
          </p>
        )}
      </div>

      <footer className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] p-2 text-xs" aria-live="polite">
        {!repository.diagrams[diagramId] && (
          <p className="mb-1 text-amber-300" data-testid="usecase-no-diagram">No Use Case diagram is open. Create one from the Model Explorer on the Model or a Package.</p>
        )}
        {view.missingElementIds.length > 0 && (
          <div className="mb-1 flex items-center gap-2 text-amber-300">
            <span>{view.missingElementIds.length} shown element(s) no longer exist in the model.</span>
            <button type="button" className="rounded border border-amber-700 px-2 py-0.5" onClick={() => execute({ type: 'removeFromDiagram', diagramId, elementIds: view.missingElementIds }, 'The stale symbols could not be removed.')}>Remove stale symbols</button>
          </div>
        )}

        {liveProposals.length > 0 && (
          <div role="alertdialog" aria-label="Confirm subject assignment" className="mb-1 rounded border border-sky-700 bg-sky-950/40 p-2" data-testid="subject-proposal">
            <ul className="mb-1 list-disc pl-4">
              {liveProposals.map(p => (
                <li key={p.useCaseId}>
                  {p.toSubjectId
                    ? `Make “${nameOf(p.useCaseId)}” a use case of subject “${nameOf(p.toSubjectId)}”.`
                    : `Remove “${nameOf(p.useCaseId)}” from subject “${nameOf(p.fromSubjectId ?? '')}”.`}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" className="rounded border border-sky-600 px-2 py-0.5" onClick={applyProposals}>Apply</button>
              <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={() => setProposals([])}>Keep as drawn only</button>
            </div>
          </div>
        )}

        {extendPrompt && (
          <div role="dialog" aria-label="Choose extension point" className="mb-1 rounded border border-violet-700 bg-violet-950/40 p-2" data-testid="extend-prompt">
            <p className="mb-1">«extend» needs an extension point on “{nameOf(extendPrompt.targetId)}”.</p>
            {extendPrompt.candidates.length > 0 && (
              <label className="mr-3">Existing{' '}
                <select
                  aria-label="Existing extension point" value={extendPrompt.chosenId}
                  onChange={event => setExtendPrompt({ ...extendPrompt, chosenId: event.target.value, newName: '' })}
                  className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
                >
                  {extendPrompt.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
                </select>
              </label>
            )}
            <label className="mr-3">{extendPrompt.candidates.length > 0 ? 'or new' : 'New'}{' '}
              <input
                aria-label="New extension point name" value={extendPrompt.newName}
                onChange={event => setExtendPrompt({ ...extendPrompt, newName: event.target.value })}
                className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
              />
            </label>
            <label>Condition{' '}
              <input
                aria-label="Extend condition" value={extendPrompt.condition}
                onChange={event => setExtendPrompt({ ...extendPrompt, condition: event.target.value })}
                className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
              />
            </label>
            <div className="mt-1 flex gap-2">
              <button type="button" className="rounded border border-violet-600 px-2 py-0.5" onClick={confirmExtend}>Create «extend»</button>
              <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={() => { setExtendPrompt(null); setPendingSource(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {pendingDeletion && (
          <div role="alertdialog" aria-label="Confirm deletion from model" className="mb-1 rounded border border-amber-700 bg-amber-950/40 p-2" data-testid="delete-confirm">
            <p>
              Delete from the model? This removes {pendingDeletion.impact.deletedElementIds.length} element(s)
              {pendingDeletion.impact.removedRelationshipIds.length ? ` and ${pendingDeletion.impact.removedRelationshipIds.length} relationship(s)` : ''}
              {pendingDeletion.impact.affectedPresentationIds?.length ? `, and ${pendingDeletion.impact.affectedPresentationIds.length} diagram presentation(s)` : ''}.
              {blocked ? ' This affects a protected baseline that has not been authorized.' : ''}
            </p>
            <div className="mt-1 flex gap-2">
              <button type="button" disabled={blocked} className="rounded border border-red-700 px-2 py-0.5 text-red-200 disabled:opacity-40" onClick={confirmDeletion}>Confirm delete</button>
              <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={() => setPendingDeletion(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2" data-testid="usecase-inspector">
          {liveSelection.length === 0 && <span className="text-neutral-500">Nothing selected. Delete removes the selection from this diagram only.</span>}
          {singleNode && (
            <>
              <span className="text-neutral-400">{singleNode.kind === 'useCase' ? 'Use Case' : singleNode.kind === 'actor' ? 'Actor' : singleNode.kind === 'subject' ? 'Subject' : 'Requirement'}</span>
              {canRenameNode ? (
                <input
                  aria-label="Name" value={draftValue}
                  onChange={event => setNameDraft({ id: singleNode.id, value: event.target.value })}
                  onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                  className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
                />
              ) : <strong>{singleNode.label}</strong>}
              {singleNode.kind === 'useCase' && (
                <>
                  <input
                    aria-label="Extension point name" placeholder="extension point name" value={extensionPointDraft}
                    onChange={event => setExtensionPointDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') addExtensionPoint(); }}
                    className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
                  />
                  <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={addExtensionPoint}>Add extension point</button>
                  {singleNode.subjectId && <span className="text-neutral-400">Subject: {nameOf(singleNode.subjectId)}</span>}
                </>
              )}
              <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={() => onNavigate?.(singleNode.id)}>Open</button>
            </>
          )}
          {singleEdge && (
            <>
              <span className="text-neutral-400">{singleEdge.keyword || (singleEdge.relationshipKind === 'useCaseAssociation' ? 'Association' : 'Generalization')}</span>
              <span>{nameOf(singleEdge.sourceId)} → {nameOf(singleEdge.targetId)}</span>
              {singleEdge.relationshipKind === 'extend' && (
                <label>Condition{' '}
                  <input
                    aria-label="Condition" value={draftValue}
                    onChange={event => setNameDraft({ id: singleEdge.id, value: event.target.value })}
                    onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                    className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
                  />
                </label>
              )}
            </>
          )}
          {liveSelection.length > 1 && <span>{liveSelection.length} items selected</span>}
          {liveSelection.length > 0 && (
            <>
              <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={removeFromDiagram}>Remove from diagram</button>
              <button type="button" className="rounded border border-red-800 px-2 py-0.5 text-red-300 hover:bg-red-950" onClick={deleteFromModel}>Delete from model…</button>
            </>
          )}
        </div>
        {message && <p data-testid="usecase-message" className="mt-1 text-neutral-300">{message}</p>}
      </footer>
    </section>
  );
}
