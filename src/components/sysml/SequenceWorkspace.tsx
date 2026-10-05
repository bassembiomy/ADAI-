import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CombinedFragmentOperator, InteractionMessageSort, SysmlRepository } from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import type { SemanticEndpointContext } from '../../engine/sysml/semanticEndpointIndex';
import { signalTriggerCoverage, type TriggerTransition } from '../../engine/sysml/interactionTriggers';
import {
  FOUND_ENDPOINT, FRAGMENT_OPERATORS, LOST_ENDPOINT, MESSAGE_SORTS, MESSAGE_SORT_LABELS, blockOperations, lifelineBlock, operationName, validateInteraction,
} from '../../engine/sysml/interaction';
import type { SysmlCommandResult, SysmlEditorCommand } from '../../services/sysmlCommandGateway';
import {
  buildAddFragmentCommand,
  buildAddFragmentOperandCommand,
  buildAddInteractionMessageCommand,
  buildAddInteractionUseCommand,
  buildAddLifelineCommand,
  buildAddStateInvariantCommand,
  buildAddInteractionConstraintCommand,
  buildRemoveInteractionConstraintCommand,
  buildUpdateInteractionConstraintCommand,
  buildRemoveStateInvariantCommand,
  buildUpdateStateInvariantCommand,
  buildMoveInteractionMessageCommand,
  buildMoveLifelineCommand,
  buildRemoveFragmentCommand,
  buildRemoveFragmentOperandCommand,
  buildRemoveInteractionMessageCommand,
  buildRemoveInteractionUseCommand,
  buildRemoveLifelineCommand,
  buildRenameInteractionElementCommand,
  buildSetFragmentOperatorCommand,
  buildSetLifelineRepresentsCommand,
  buildSetOperandGuardCommand,
  buildUpdateInteractionMessageCommand,
  buildUpdateInteractionUseCommand,
  LIFELINE_CANDIDATE_GROUP_LABELS,
  buildCreateOperationForMessageCommand,
  buildCreateSignalForMessageCommand,
  listLifelineCandidates,
  listMessageConnectors,
  listReferableInteractions,
  listSignalCandidates,
  type InteractionCommandPlan,
  type LifelineCandidateGroup,
} from '../../services/sysmlInteractionCommands';
import {
  ACTIVATION_WIDTH,
  HEAD_HEIGHT,
  buildSequenceDiagramView,
  insertionIndexForY,
  nearestMessageIndex,
  type FragmentView,
  type LifelineView,
  type MessageView,
  type StateInvariantView,
  type ConstraintView,
  type UseView,
} from '../../features/sysml/sequenceDiagramView';
import { interactionToPlantUml } from '../../features/plantuml/adapters/sysmlInteractionToPlantUml';
import { diagramFrameLabel } from '../../features/sysml/diagramFrame';
import { resolveSysmlReferenceLabel, sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';

export interface SequenceWorkspaceProps {
  repository: SysmlRepository;
  diagramId: string;
  /** Unused: a Sequence Diagram is laid out from its Interaction. Kept so every workspace has the same props. */
  diagramPresentations?: Record<string, DiagramPresentation>;
  /** Runs one gateway command; every user action is exactly one command (one undo step). */
  onExecute: (command: SysmlEditorCommand) => SysmlCommandResult;
  /** Double-click: reveal the element a lifeline represents. */
  onNavigate?: (elementId: string) => void;
  onSelect?: (ids: string[]) => void;
  /** Elements selected when the workspace mounts (e.g. arriving from "Shown in Sequence Diagrams"). */
  initialSelection?: string[];
  /** States of the state machine editor, which lives outside the repository (names for state invariants). */
  endpoints?: SemanticEndpointContext;
  /** Transitions of the state machine editor, read to tell whether a received Signal names a trigger. */
  transitions?: readonly TriggerTransition[];
}

type Tool = 'select' | 'lost' | 'found' | InteractionMessageSort;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const STROKE = 'var(--sysml-block-stroke)';
const FILL = 'var(--sysml-block-fill)';
const TEXT = 'var(--sysml-block-text)';
const SUBTEXT = 'var(--sysml-block-subtext)';
const SELECTED = 'var(--sysml-sem-selection)';

function fit(text: string, widthPx: number, fontSize: number): string {
  const maxChars = Math.max(3, Math.floor(widthPx / (fontSize * 0.56)));
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function LifelineShape({ lifeline, selected, pending }: { lifeline: LifelineView; selected: boolean; pending: boolean }) {
  const { x, y, width, height } = lifeline.head;
  const stroke = selected || pending ? SELECTED : STROKE;
  return (
    <g data-testid="sequence-lifeline" data-label={lifeline.label}>
      <rect x={lifeline.centerX - 20} y={lifeline.lineTop} width={40} height={Math.max(lifeline.lineBottom - lifeline.lineTop, 10)} fill="transparent" />
      <line x1={lifeline.centerX} y1={lifeline.lineTop} x2={lifeline.centerX} y2={lifeline.lineBottom} stroke={stroke} strokeWidth={selected ? 2 : 1} strokeDasharray="6 5" />
      <rect x={x} y={y} width={width} height={height} fill={FILL} stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
      {lifeline.isActor && <text x={lifeline.centerX} y={y + 16} textAnchor="middle" fontSize={10} fill={SUBTEXT}>«actor»</text>}
      <text x={lifeline.centerX} y={lifeline.isActor ? y + 35 : lifeline.typeLabel ? y + 19 : y + height / 2 + 4} textAnchor="middle" fontSize={13} fill={TEXT}>{fit(lifeline.label, width - 12, 13)}</text>
      {lifeline.typeLabel && <text x={lifeline.centerX} y={y + 36} textAnchor="middle" fontSize={11} fill={SUBTEXT}>{fit(`: ${lifeline.typeLabel}`, width - 12, 11)}</text>}
      {lifeline.allocatedTo.length > 0 && (
        <text x={lifeline.centerX} y={y - 6} textAnchor="middle" fontSize={10} fill="var(--sysml-block-meta)">{fit(`«allocate» ${lifeline.allocatedTo.join(', ')}`, 180, 10)}</text>
      )}
      {lifeline.destroyedAtY !== undefined && (
        <path
          d={`M${lifeline.centerX - 9},${lifeline.destroyedAtY - 9} L${lifeline.centerX + 9},${lifeline.destroyedAtY + 9} M${lifeline.centerX + 9},${lifeline.destroyedAtY - 9} L${lifeline.centerX - 9},${lifeline.destroyedAtY + 9}`}
          stroke={stroke} strokeWidth={2}
        />
      )}
    </g>
  );
}

function MessageShape({ message, selected }: { message: MessageView; selected: boolean }) {
  const stroke = selected ? SELECTED : STROKE;
  const points = message.points.map(point => `${point.x},${point.y}`).join(' ');
  const marker = `url(#seq-${message.head}${selected ? '-sel' : ''})`;
  return (
    <g>
      <polyline points={points} fill="none" stroke="transparent" strokeWidth={16} />
      <polyline
        points={points} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={message.dashed ? '7 5' : undefined} markerEnd={marker}
      />
      {message.text && (
        <text x={message.labelAt.x} y={message.labelAt.y} textAnchor={message.isSelf ? 'start' : 'middle'} fontSize={12} fill={TEXT} stroke="var(--surface-canvas)" strokeWidth={3} paintOrder="stroke">
          {fit(message.text, 200, 12)}
        </text>
      )}
      {message.circleAt && <circle cx={message.circleAt.x} cy={message.circleAt.y} r={5} fill={stroke} data-testid="sequence-lost-found-end" />}
      {message.allocatedTo.length > 0 && (
        <text x={message.labelAt.x} y={message.labelAt.y + 25} textAnchor={message.isSelf ? 'start' : 'middle'} fontSize={10} fill="var(--sysml-block-meta)">
          {fit(`«allocate» ${message.allocatedTo.join(', ')}`, 200, 10)}
        </text>
      )}
    </g>
  );
}

/** A `ref` frame: the referenced interaction drawn as a labelled box over the lifelines it covers. */
function UseShape({ use, selected }: { use: UseView; selected: boolean }) {
  const { x, y, width, height } = use.bounds;
  const stroke = selected ? SELECTED : STROKE;
  return (
    <g data-testid="sequence-use" data-refers-to={use.refersToLabel}>
      <rect x={x} y={y} width={width} height={height} fill={FILL} stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
      <path d={`M${x},${y} H${x + 36} V${y + 8} L${x + 29},${y + 16} H${x}`} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.25} />
      <text x={x + 8} y={y + 12} fontSize={10} fontWeight={600} fill={TEXT}>ref</text>
      <text x={x + width / 2} y={y + height / 2 + 6} textAnchor="middle" fontSize={13} fill={TEXT}>{fit(use.text, width - 24, 13)}</text>
    </g>
  );
}

/** A state invariant: the lifeline's object is in this state at this point. */
function InvariantShape({ invariant, selected }: { invariant: StateInvariantView; selected: boolean }) {
  const { x, y, width, height } = invariant.bounds;
  const stroke = selected ? SELECTED : STROKE;
  return (
    <g data-testid="sequence-state-invariant" data-state={invariant.text} data-resolved={invariant.resolved}>
      <rect x={x} y={y} width={width} height={height} rx={height / 2} ry={height / 2} fill={FILL} stroke={stroke} strokeWidth={selected ? 2 : 1.25} strokeDasharray={invariant.resolved ? undefined : '4 3'} />
      <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" fontSize={12} fill={invariant.resolved ? TEXT : SUBTEXT}>{fit(invariant.text, width - 14, 12)}</text>
    </g>
  );
}

/** A time or duration constraint: a bracket beside the lifelines with its expression. */
function ConstraintShape({ constraint, selected }: { constraint: ConstraintView; selected: boolean }) {
  const stroke = selected ? SELECTED : STROKE;
  const { x, yFrom, yTo } = constraint;
  const isSpan = yTo > yFrom;
  return (
    <g data-testid="sequence-constraint" data-kind={constraint.kind} data-text={constraint.text}>
      <rect x={x - 8} y={yFrom - 8} width={90} height={Math.max(yTo - yFrom, 0) + 16} fill="transparent" />
      {isSpan
        ? <path d={`M${x - 6},${yFrom} H${x} V${yTo} H${x - 6}`} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.25} />
        : <line x1={x - 6} y1={yFrom} x2={x + 6} y2={yFrom} stroke={stroke} strokeWidth={selected ? 2 : 1.25} />}
      <text x={x + 8} y={(yFrom + yTo) / 2 + 4} fontSize={11} fill={TEXT}>{fit(constraint.text, 64, 11)}</text>
    </g>
  );
}

function FragmentShape({ fragment, selected }: { fragment: FragmentView; selected: boolean }) {
  const { x, y, width, height } = fragment.bounds;
  const stroke = selected ? SELECTED : STROKE;
  const tabWidth = Math.max(44, fragment.operator.length * 8 + 20);
  return (
    <g data-testid="sequence-fragment" data-operator={fragment.operator}>
      <rect x={x} y={y} width={width} height={height} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.25} pointerEvents="none" />
      <path d={`M${x},${y} H${x + tabWidth} V${y + 10} L${x + tabWidth - 8},${y + 20} H${x} Z`} fill={FILL} stroke={stroke} strokeWidth={selected ? 2 : 1.25} />
      <text x={x + 8} y={y + 14} fontSize={11} fontWeight={600} fill={TEXT}>{fragment.operator}</text>
      {fragment.operands.map(operand => (
        <g key={operand.index}>
          {operand.index > 0 && <line x1={x} y1={operand.top} x2={x + width} y2={operand.top} stroke={stroke} strokeDasharray="6 4" />}
          {operand.guardLabel && <text x={x + tabWidth + 8} y={operand.top + 14} fontSize={11} fill={SUBTEXT}>{fit(operand.guardLabel, width - tabWidth - 16, 11)}</text>}
        </g>
      ))}
    </g>
  );
}

export function SequenceWorkspace({ repository, diagramId, onExecute, onNavigate, onSelect, initialSelection, endpoints, transitions }: SequenceWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string[]>(() => initialSelection ?? []);
  const [zoom, setZoom] = useState(1);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [withReply, setWithReply] = useState(true);
  const [asyncBars, setAsyncBars] = useState(false);
  const [message, setMessage] = useState('');
  const [drag, setDrag] = useState<{ id: string; startY: number; y: number; moved: boolean } | null>(null);
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);
  const [argsDraft, setArgsDraft] = useState<{ id: string; value: string } | null>(null);
  const [guardDraft, setGuardDraft] = useState<{ key: string; value: string } | null>(null);

  const diagram = repository.diagrams[diagramId];
  const interactionId = diagram?.contextElementId ?? diagram?.ownerId ?? '';
  const interactionDef = repository.definitions[interactionId]?.kind === 'interaction' ? repository.definitions[interactionId] : undefined;
  const interaction = interactionDef?.kind === 'interaction' ? interactionDef : undefined;

  const view = useMemo(() => buildSequenceDiagramView(repository, diagramId, endpoints, { asyncExecutionBars: asyncBars }), [repository, diagramId, endpoints, asyncBars]);
  const frameLabel = diagramFrameLabel(repository, diagramId);
  const nameOf = useCallback((id: string) => resolveSysmlReferenceLabel(repository, id), [repository]);

  const selectableIds = useMemo(() => new Set([
    ...view.lifelines.map(lifeline => lifeline.id),
    ...view.messages.map(entry => entry.id),
    ...view.fragments.map(fragment => fragment.id),
    ...view.uses.map(use => use.id),
    ...view.stateInvariants.map(invariant => invariant.id),
    ...view.constraints.map(constraint => constraint.id),
  ]), [view]);
  const liveSelection = useMemo(() => selected.filter(id => selectableIds.has(id)), [selected, selectableIds]);
  useEffect(() => { onSelect?.(liveSelection); }, [liveSelection.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const diagnostics = useMemo(
    () => (interaction ? validateInteraction(repository, interaction, endpoints).filter(d => d.severity !== 'info') : []),
    [repository, interaction, endpoints],
  );

  const execute = useCallback((command: SysmlEditorCommand, failure: string): SysmlCommandResult => {
    const result = onExecute(command);
    if (!result.committed) setMessage(result.diagnostics.filter(d => d.severity === 'error').map(d => d.message).join(' ') || failure);
    else setMessage('');
    return result;
  }, [onExecute]);

  /** Runs a pure plan: a refused plan never reaches the gateway. */
  const executePlan = useCallback((plan: InteractionCommandPlan, failure: string): SysmlCommandResult | undefined => {
    if (!plan.ok) {
      setMessage(plan.diagnostics.map(d => d.message).join(' ') || failure);
      return undefined;
    }
    return execute(plan.command, failure);
  }, [execute]);

  const toWorldY = useCallback((clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    return (clientY - (rect?.top ?? 0)) / zoom;
  }, [zoom]);

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------
  const addLifeline = () => {
    const plan = buildAddLifelineCommand(repository, { interactionId });
    const result = executePlan(plan, 'The lifeline could not be created.');
    if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
  };

  const placeMessage = (sort: InteractionMessageSort, sourceId: string, targetId: string, clientY?: number) => {
    const count = view.messages.length;
    // Clicking a lifeline line inserts at that height; clicking a head appends.
    const atIndex = clientY === undefined ? count : insertionIndexForY(view.messages, toWorldY(clientY));
    const plan = buildAddInteractionMessageCommand(repository, {
      interactionId, sort, sourceLifelineId: sourceId, targetLifelineId: targetId,
      atIndex, withReply: withReply && sort === 'synchCall',
    });
    const result = executePlan(plan, 'The message was rejected.');
    if (result?.committed) {
      setPendingSource(null);
      setTool('select');
      if (plan.ok) setSelected([plan.createdIds[0]]);
    }
  };

  const onLifelinePointerDown = (event: React.PointerEvent, lifeline: LifelineView, onHead: boolean) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (tool === 'select') {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      setSelected(current => additive ? (current.includes(lifeline.id) ? current.filter(id => id !== lifeline.id) : [...current, lifeline.id]) : [lifeline.id]);
      return;
    }
    // Lost and found messages need one click: the other end is not a lifeline.
    if (tool === 'lost' || tool === 'found') {
      const atY = onHead ? undefined : event.clientY;
      if (tool === 'lost') placeMessage('asynchCall', lifeline.id, LOST_ENDPOINT, atY);
      else placeMessage('asynchCall', FOUND_ENDPOINT, lifeline.id, atY);
      return;
    }
    if (!pendingSource) {
      setPendingSource(lifeline.id);
      setMessage('Choose the lifeline that receives the message.');
      return;
    }
    placeMessage(tool, pendingSource, lifeline.id, onHead ? undefined : event.clientY);
  };

  const onMessagePointerDown = (event: React.PointerEvent, entry: MessageView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) {
      setSelected(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id]);
      return;
    }
    setSelected([entry.id]);
    setDrag({ id: entry.id, startY: event.clientY, y: entry.y, moved: false });
  };

  const onFragmentPointerDown = (event: React.PointerEvent, fragment: FragmentView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    setSelected([fragment.id]);
  };

  const onUsePointerDown = (event: React.PointerEvent, use: UseView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    setSelected([use.id]);
  };

  const onInvariantPointerDown = (event: React.PointerEvent, invariant: StateInvariantView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    setSelected([invariant.id]);
  };

  const onConstraintPointerDown = (event: React.PointerEvent, constraint: ConstraintView) => {
    event.stopPropagation();
    if (event.button !== 0 || tool !== 'select') return;
    setSelected([constraint.id]);
  };

  const onBackgroundPointerDown = () => {
    if (tool === 'select') setSelected([]);
    else { setPendingSource(null); }
  };

  // Drag to reorder: tracking lives on the window so a gesture ending outside the canvas still completes.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const reorder = useRef<(id: string, y: number) => void>(() => {});
  reorder.current = (id, y) => {
    const toIndex = nearestMessageIndex(view.messages, y);
    const fromIndex = view.messages.findIndex(entry => entry.id === id);
    if (toIndex === fromIndex) return;
    executePlan(buildMoveInteractionMessageCommand(repository, { interactionId, messageId: id, toIndex }), 'The message could not be moved.');
  };
  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return undefined;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      if (!current.moved && Math.abs(event.clientY - current.startY) < 4) return;
      setDrag({ ...current, moved: true, y: toWorldY(event.clientY) });
    };
    const up = () => {
      const current = dragRef.current;
      setDrag(null);
      if (current?.moved) reorder.current(current.id, current.y);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragActive, toWorldY]);

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------
  const selectedMessages = view.messages.filter(entry => liveSelection.includes(entry.id));
  const singleId = liveSelection.length === 1 ? liveSelection[0] : undefined;
  const singleLifeline = singleId ? view.lifelines.find(lifeline => lifeline.id === singleId) : undefined;
  const singleMessage = singleId ? view.messages.find(entry => entry.id === singleId) : undefined;
  const singleFragment = singleId ? view.fragments.find(fragment => fragment.id === singleId) : undefined;
  const singleUse = singleId ? view.uses.find(use => use.id === singleId) : undefined;
  const storedUse = singleUse ? interaction?.uses?.find(use => use.id === singleUse.id) : undefined;
  const singleConstraint = singleId ? view.constraints.find(constraint => constraint.id === singleId) : undefined;
  const storedConstraint = singleConstraint ? interaction?.constraints?.find(constraint => constraint.id === singleConstraint.id) : undefined;
  const singleInvariant = singleId ? view.stateInvariants.find(invariant => invariant.id === singleId) : undefined;
  const storedInvariant = singleInvariant ? interaction?.stateInvariants?.find(invariant => invariant.id === singleInvariant.id) : undefined;
  // The states a state invariant can name (the state machine editor's states).
  const stateOptions = useMemo(
    () => [...(endpoints?.externalEndpoints?.values() ?? [])].filter(endpoint => endpoint.family === 'state').map(endpoint => ({ id: endpoint.id, label: endpoint.name?.trim() || 'State' })).sort((a, b) => a.label.localeCompare(b.label)),
    [endpoints],
  );
  const storedLifeline = singleLifeline ? interaction?.lifelines.find(lifeline => lifeline.id === singleLifeline.id) : undefined;
  const storedMessage = singleMessage ? interaction?.messages.find(entry => entry.id === singleMessage.id) : undefined;
  const storedFragment = singleFragment ? interaction?.fragments.find(fragment => fragment.id === singleFragment.id) : undefined;

  const deleteSelection = () => {
    if (singleConstraint) {
      const result = executePlan(buildRemoveInteractionConstraintCommand(repository, { interactionId, constraintId: singleConstraint.id }), 'The constraint could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    if (singleInvariant) {
      const result = executePlan(buildRemoveStateInvariantCommand(repository, { interactionId, invariantId: singleInvariant.id }), 'The state invariant could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    if (singleUse) {
      const result = executePlan(buildRemoveInteractionUseCommand(repository, { interactionId, useId: singleUse.id }), 'The ref frame could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    if (singleFragment) {
      const result = executePlan(buildRemoveFragmentCommand(repository, { interactionId, fragmentId: singleFragment.id }), 'The fragment could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    if (singleLifeline) {
      const result = executePlan(buildRemoveLifelineCommand(repository, { interactionId, lifelineId: singleLifeline.id }), 'The lifeline could not be deleted.');
      if (result?.committed) setSelected([]);
      return;
    }
    // Several messages: one command each, so a refusal names the message that blocks it.
    for (const entry of selectedMessages) {
      const stillThere = interaction?.messages.some(candidate => candidate.id === entry.id);
      if (!stillThere) continue;
      const result = executePlan(buildRemoveInteractionMessageCommand(repository, { interactionId, messageId: entry.id }), 'The message could not be deleted.');
      if (!result?.committed) return;
    }
    setSelected([]);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if ((event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'SELECT') return;
      event.preventDefault();
      if (singleFragment || singleUse || singleInvariant || singleConstraint || selectedMessages.length > 0) deleteSelection();
    } else if (event.key === 'Escape') {
      setTool('select');
      setPendingSource(null);
      setMessage('');
    }
  };

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------
  const nameTargetId = singleLifeline?.id ?? singleMessage?.id;
  const storedName = singleLifeline ? storedLifeline?.name ?? '' : storedMessage?.name ?? '';
  const nameValue = nameDraft && nameDraft.id === nameTargetId ? nameDraft.value : storedName;
  const commitName = () => {
    if (!nameTargetId || !nameDraft || nameDraft.id !== nameTargetId) return;
    const value = nameDraft.value.trim();
    setNameDraft(null);
    if (value === storedName) return;
    executePlan(buildRenameInteractionElementCommand(repository, { interactionId, elementId: nameTargetId, name: value }), 'The name could not be changed.');
  };
  const argsValue = argsDraft && argsDraft.id === singleMessage?.id ? argsDraft.value : storedMessage?.arguments ?? '';
  const commitArgs = () => {
    if (!singleMessage || !argsDraft || argsDraft.id !== singleMessage.id) return;
    const value = argsDraft.value;
    setArgsDraft(null);
    if (value.trim() === (storedMessage?.arguments ?? '')) return;
    executePlan(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, arguments: value }), 'The arguments could not be changed.');
  };

  const lifelineCandidates = useMemo(() => listLifelineCandidates(repository, interactionId), [repository, interactionId]);
  // Signals the receiving Block accepts come first.
  const signalCandidates = useMemo(
    () => (storedMessage ? listSignalCandidates(repository, interactionId, storedMessage.targetLifelineId) : []),
    [repository, interactionId, storedMessage],
  );

  // The operations the receiving lifeline's Block offers (inherited ones included).
  const targetOperations = useMemo(() => {
    const target = storedMessage ? interaction?.lifelines.find(lifeline => lifeline.id === storedMessage.targetLifelineId) : undefined;
    const block = target ? lifelineBlock(repository, target) : undefined;
    return block ? blockOperations(repository, block) : undefined;
  }, [repository, interaction, storedMessage]);

  // The connectors that join the parts the selected message's lifelines stand for.
  const messageConnectors = useMemo(
    () => (storedMessage ? listMessageConnectors(repository, interactionId, storedMessage.sourceLifelineId, storedMessage.targetLifelineId) : []),
    [repository, interactionId, storedMessage],
  );

  // Information only: does the state the receiver is in have a transition that names this Signal?
  const triggerCoverage = useMemo(
    () => (storedMessage && interaction && transitions ? signalTriggerCoverage(repository, interaction, transitions).find(entry => entry.messageId === storedMessage.id) : undefined),
    [repository, interaction, transitions, storedMessage],
  );

  // Interactions a ref frame may refer to (never this one, never a loop).
  const referableInteractions = useMemo(() => listReferableInteractions(repository, interactionId), [repository, interactionId]);

  const addConstraint = (kind: 'time' | 'duration') => {
    const [first, second] = selectedMessages.map(entry => entry.id);
    const plan = buildAddInteractionConstraintCommand(repository, { interactionId, kind, fromMessageId: first, ...(kind === 'duration' ? { toMessageId: second } : {}) });
    const result = executePlan(plan, 'The constraint could not be created.');
    if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
  };

  const addFragment = (operator: CombinedFragmentOperator) => {
    const ids = selectedMessages.map(entry => entry.id);
    const plan = buildAddFragmentCommand(repository, { interactionId, operator, messageIds: ids });
    const result = executePlan(plan, 'The fragment could not be created.');
    if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
  };

  const toolButton = (id: Tool, label: string, hint: string) => (
    <button
      key={id} type="button" aria-pressed={tool === id} title={hint}
      onClick={() => { setTool(id); setPendingSource(null); setMessage(''); }}
      className={`rounded border px-2 py-1 text-xs ${tool === id ? 'border-orange-600 bg-orange-950/50 text-orange-200' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
    >{label}</button>
  );

  const cursor = tool === 'select' ? (drag?.moved ? 'grabbing' : 'default') : 'crosshair';
  const selectClass = 'max-w-[200px] rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-xs';
  const inputClass = 'rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5';
  const buttonClass = 'rounded border border-neutral-600 px-2 py-0.5';
  const dragSlotY = drag?.moved ? view.messages[nearestMessageIndex(view.messages, drag.y)]?.y : undefined;
  const messageIndex = singleMessage ? view.messages.findIndex(entry => entry.id === singleMessage.id) : -1;
  const endName = (id: string) => id === LOST_ENDPOINT ? 'lost' : id === FOUND_ENDPOINT ? 'found' : nameOf(id);
  const sourceName = singleMessage ? endName(singleMessage.sourceLifelineId) : '';
  const targetName = singleMessage ? endName(singleMessage.targetLifelineId) : '';
  const zoomBy = (factor: number) => setZoom(current => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor)));

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]" aria-label="Sequence Diagram workspace" data-testid="sequence-workspace">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)] p-2">
        <h2 className="mr-2 text-xs font-semibold" data-testid="sequence-frame-label">{frameLabel ?? 'Sequence Diagram'}</h2>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Sequence palette">
          {toolButton('select', 'Select', 'Select; drag a message up or down to reorder it')}
          <button type="button" className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500" onClick={addLifeline} title="Add a lifeline" disabled={!interaction}>Lifeline</button>
          {MESSAGE_SORTS.map(sort => toolButton(sort, MESSAGE_SORT_LABELS[sort], `Click the sending lifeline, then the receiving lifeline (${MESSAGE_SORT_LABELS[sort]})`))}
          {toolButton('lost', 'Lost', 'Click the sending lifeline: the message is never received')}
          {toolButton('found', 'Found', 'Click the receiving lifeline: the sender is unknown')}
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={withReply} onChange={event => setWithReply(event.target.checked)} />
            Add the reply with a synchronous call
          </label>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={asyncBars} onChange={event => setAsyncBars(event.target.checked)} />
            Execution bars for asynchronous calls
          </label>
        </div>
        <button
          type="button" disabled={!interaction} title="Download this interaction as PlantUML text (one way; it is not imported back)"
          className="ml-auto rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
          onClick={() => {
            try {
              const source = interactionToPlantUml(repository, interactionId, endpoints);
              const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = `${(sysmlObjectLabel(interaction, 'Interaction') || 'interaction').replace(/[^a-z0-9_-]+/gi, '_')}.puml`;
              anchor.click();
              URL.revokeObjectURL(url);
              setMessage('PlantUML source exported.');
            } catch {
              setMessage('PlantUML source could not be exported.');
            }
          }}
        >Export PlantUML</button>
        <label className="flex items-center gap-1 text-[11px] text-neutral-400">
          Ref frame
          <select
            aria-label="Add a ref frame to another interaction" value="" disabled={!interaction || referableInteractions.length === 0}
            onChange={event => {
              if (!event.target.value) return;
              const plan = buildAddInteractionUseCommand(repository, { interactionId, refersToId: event.target.value });
              const result = executePlan(plan, 'The ref frame could not be added.');
              if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
            }}
            className={selectClass}
          >
            <option value="">{referableInteractions.length ? 'Refer to…' : 'No other interaction'}</option>
            {referableInteractions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={selectedMessages.length !== 1} title="Select one message, then mark it with a time constraint" onClick={() => addConstraint('time')} className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50">Time constraint</button>
        <button type="button" disabled={selectedMessages.length !== 2} title="Select two messages, then span them with a duration constraint" onClick={() => addConstraint('duration')} className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50">Duration constraint</button>
        <label className="flex items-center gap-1 text-[11px] text-neutral-400">
          Combined fragment
          <select
            aria-label="Enclose the selected messages in a combined fragment" value="" disabled={selectedMessages.length === 0}
            onChange={event => { if (event.target.value) addFragment(event.target.value as CombinedFragmentOperator); }}
            className={selectClass}
          >
            <option value="">{selectedMessages.length ? 'Choose operator…' : 'Select messages first'}</option>
            {FRAGMENT_OPERATORS.map(operator => <option key={operator} value={operator}>{operator}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1" role="toolbar" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={() => zoomBy(1 / 1.2)}>−</button>
          <span className="w-10 text-center text-[11px] text-neutral-400">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={() => zoomBy(1.2)}>+</button>
          <button type="button" className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={() => setZoom(1)}>Reset</button>
        </div>
      </header>

      <div
        tabIndex={0} onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto outline-none"
        aria-label="Sequence canvas" role="application" data-testid="sequence-canvas"
      >
        <svg
          ref={svgRef} width={view.canvasSize.width * zoom} height={view.canvasSize.height * zoom}
          style={{ cursor, touchAction: 'none', display: 'block' }} onPointerDown={onBackgroundPointerDown}
        >
          <defs>
            {[['seq-filled', STROKE, true], ['seq-filled-sel', SELECTED, true], ['seq-open', STROKE, false], ['seq-open-sel', SELECTED, false]].map(([id, color, filled]) => (
              <marker key={String(id)} id={String(id)} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                {filled
                  ? <path d="M1,1 L11,6 L1,11 Z" fill={String(color)} stroke={String(color)} strokeWidth="1" />
                  : <path d="M1,1 L11,6 L1,11" fill="none" stroke={String(color)} strokeWidth="1.5" />}
              </marker>
            ))}
          </defs>
          <rect width="100%" height="100%" fill="transparent" />
          <g transform={`scale(${zoom})`}>
            {view.fragments.map(fragment => (
              <g key={fragment.id} onPointerDown={event => onFragmentPointerDown(event, fragment)}>
                <FragmentShape fragment={fragment} selected={liveSelection.includes(fragment.id)} />
              </g>
            ))}
            {view.lifelines.map(lifeline => (
              <g
                key={lifeline.id} data-pending-source={pendingSource === lifeline.id || undefined}
                onDoubleClick={() => { const represents = interaction?.lifelines.find(candidate => candidate.id === lifeline.id)?.representsId; if (represents) onNavigate?.(represents); }}
              >
                <g onPointerDown={event => onLifelinePointerDown(event, lifeline, false)}>
                  <LifelineShape lifeline={lifeline} selected={liveSelection.includes(lifeline.id)} pending={pendingSource === lifeline.id} />
                </g>
                <rect
                  data-testid="sequence-lifeline-head" data-label={lifeline.label}
                  x={lifeline.head.x} y={lifeline.head.y} width={lifeline.head.width} height={HEAD_HEIGHT} fill="transparent"
                  onPointerDown={event => onLifelinePointerDown(event, lifeline, true)}
                />
              </g>
            ))}
            {view.uses.map(use => (
              <g
                key={use.id} onPointerDown={event => onUsePointerDown(event, use)}
                onDoubleClick={() => onNavigate?.(use.refersToId)}
              >
                <UseShape use={use} selected={liveSelection.includes(use.id)} />
              </g>
            ))}
            {view.constraints.map(constraint => (
              <g key={constraint.id} onPointerDown={event => onConstraintPointerDown(event, constraint)}>
                <ConstraintShape constraint={constraint} selected={liveSelection.includes(constraint.id)} />
              </g>
            ))}
            {view.stateInvariants.map(invariant => (
              <g key={invariant.id} onPointerDown={event => onInvariantPointerDown(event, invariant)}>
                <InvariantShape invariant={invariant} selected={liveSelection.includes(invariant.id)} />
              </g>
            ))}
            {view.activations.map(bar => (
              <rect
                key={bar.callId} data-testid="sequence-activation" x={bar.bounds.x} y={bar.bounds.y} width={ACTIVATION_WIDTH} height={bar.bounds.height}
                fill={FILL} stroke={STROKE} strokeWidth={1.25} pointerEvents="none"
              />
            ))}
            {view.messages.map(entry => (
              <g
                key={entry.id} data-testid="sequence-message" data-sort={entry.sort} data-text={entry.text}
                onPointerDown={event => onMessagePointerDown(event, entry)}
                onDoubleClick={() => {
                  // A signal message opens its Signal; a call opens the Block that owns the operation.
                  const stored = interaction?.messages.find(candidate => candidate.id === entry.id);
                  if (!stored) return;
                  if (stored.sort === 'asynchSignal' && stored.signatureId) { onNavigate?.(stored.signatureId); return; }
                  const target = interaction?.lifelines.find(lifeline => lifeline.id === stored.targetLifelineId);
                  const block = target ? lifelineBlock(repository, target) : undefined;
                  if (block) onNavigate?.(block.id);
                }}
              >
                <MessageShape message={entry} selected={liveSelection.includes(entry.id)} />
              </g>
            ))}
            {dragSlotY !== undefined && (
              <line data-testid="sequence-drop-indicator" x1={0} x2={view.canvasSize.width} y1={dragSlotY} y2={dragSlotY} stroke={SELECTED} strokeDasharray="4 4" pointerEvents="none" />
            )}
          </g>
        </svg>
        {view.lifelines.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-neutral-500" data-testid="sequence-empty">
            This Sequence diagram is empty. Add a Lifeline, then choose a message kind and click the sending and receiving lifelines.
          </p>
        )}
      </div>

      <footer className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] p-2 text-xs" aria-live="polite">
        {!interaction && (
          <p className="mb-1 text-amber-300" data-testid="sequence-no-interaction">No Sequence diagram is open. Create an Interaction in the Model Explorer, then create a Sequence Diagram on it.</p>
        )}
        <div className="flex flex-wrap items-center gap-2" data-testid="sequence-inspector">
          {liveSelection.length === 0 && <span className="text-neutral-500">Nothing selected. Shift-click to select several messages, then enclose them in a combined fragment.</span>}
          {singleLifeline && (
            <>
              <span className="text-neutral-400">Lifeline</span>
              <input
                aria-label="Name" value={nameValue}
                onChange={event => setNameDraft({ id: singleLifeline.id, value: event.target.value })}
                onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                className={inputClass}
              />
              <label>Represents{' '}
                <select
                  aria-label="Lifeline represents" className={selectClass} value={storedLifeline?.representsId ?? ''}
                  onChange={event => executePlan(buildSetLifelineRepresentsCommand(repository, { interactionId, lifelineId: singleLifeline.id, representsId: event.target.value || undefined }), 'The lifeline could not be changed.')}
                >
                  <option value="">(nothing)</option>
                  {(Object.keys(LIFELINE_CANDIDATE_GROUP_LABELS) as LifelineCandidateGroup[]).map(group => {
                    const options = lifelineCandidates.filter(candidate => candidate.group === group);
                    return options.length === 0 ? null : (
                      <optgroup key={group} label={LIFELINE_CANDIDATE_GROUP_LABELS[group]}>
                        {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <button type="button" className={buttonClass} onClick={() => executePlan(buildMoveLifelineCommand(repository, { interactionId, lifelineId: singleLifeline.id, direction: -1 }), 'The lifeline could not be moved.')}>Move left</button>
              <button type="button" className={buttonClass} onClick={() => executePlan(buildMoveLifelineCommand(repository, { interactionId, lifelineId: singleLifeline.id, direction: 1 }), 'The lifeline could not be moved.')}>Move right</button>
              <label>State invariant{' '}
                <select
                  aria-label="Add a state invariant on this lifeline" className={selectClass} value="" disabled={stateOptions.length === 0}
                  onChange={event => {
                    if (!event.target.value) return;
                    const plan = buildAddStateInvariantCommand(repository, { interactionId, lifelineId: singleLifeline.id, stateId: event.target.value });
                    const result = executePlan(plan, 'The state invariant could not be added.');
                    if (result?.committed && plan.ok) setSelected([plan.createdIds[0]]);
                  }}
                >
                  <option value="">{stateOptions.length ? 'Add state…' : 'No state machine states'}</option>
                  {stateOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            </>
          )}
          {singleConstraint && storedConstraint && (
            <>
              <span className="text-neutral-400">{singleConstraint.kind === 'duration' ? 'Duration constraint' : 'Time constraint'}</span>
              <label>Expression{' '}
                <input
                  aria-label="Constraint expression"
                  value={argsDraft && argsDraft.id === singleConstraint.id ? argsDraft.value : storedConstraint.expression}
                  onChange={event => setArgsDraft({ id: singleConstraint.id, value: event.target.value })}
                  onBlur={() => {
                    if (!argsDraft || argsDraft.id !== singleConstraint.id) return;
                    const value = argsDraft.value;
                    setArgsDraft(null);
                    if (value.trim() !== storedConstraint.expression) {
                      executePlan(buildUpdateInteractionConstraintCommand(repository, { interactionId, constraintId: singleConstraint.id, expression: value }), 'The expression could not be changed.');
                    }
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                  className={inputClass}
                />
              </label>
            </>
          )}
          {singleInvariant && storedInvariant && (
            <>
              <span className="text-neutral-400">State invariant on {nameOf(singleInvariant.lifelineId)}</span>
              <label>State{' '}
                <select
                  aria-label="Invariant state" className={selectClass} value={storedInvariant.stateId}
                  onChange={event => executePlan(buildUpdateStateInvariantCommand(repository, { interactionId, invariantId: singleInvariant.id, stateId: event.target.value }), 'The state could not be changed.')}
                >
                  {!stateOptions.some(option => option.id === storedInvariant.stateId) && (
                    <option value={storedInvariant.stateId}>{singleInvariant.text}</option>
                  )}
                  {stateOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label>After{' '}
                <select
                  aria-label="Invariant follows message" className={selectClass} value={storedInvariant.afterMessageId ?? ''}
                  onChange={event => executePlan(buildUpdateStateInvariantCommand(repository, { interactionId, invariantId: singleInvariant.id, afterMessageId: event.target.value || null }), 'The state invariant could not be moved.')}
                >
                  <option value="">(start of the interaction)</option>
                  {view.messages.map(entry => <option key={entry.id} value={entry.id}>{entry.text}</option>)}
                </select>
              </label>
              {!singleInvariant.resolved && <span className="text-amber-300">This state is no longer in the state machine.</span>}
            </>
          )}
          {singleMessage && storedMessage && (
            <>
              <span className="text-neutral-400">{MESSAGE_SORT_LABELS[storedMessage.sort]}</span>
              <span>{sourceName} → {targetName}</span>
              <label>Kind{' '}
                <select
                  aria-label="Message kind" className={selectClass} value={storedMessage.sort}
                  onChange={event => executePlan(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, sort: event.target.value as InteractionMessageSort }), 'The message kind was rejected.')}
                >
                  {MESSAGE_SORTS.map(sort => <option key={sort} value={sort}>{MESSAGE_SORT_LABELS[sort]}</option>)}
                </select>
              </label>
              <input
                aria-label="Name" value={nameValue}
                onChange={event => setNameDraft({ id: singleMessage.id, value: event.target.value })}
                onBlur={commitName} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                className={inputClass}
              />
              {storedMessage.sort === 'asynchSignal' && (
                <label>Signal{' '}
                  <select
                    aria-label="Signal" className={selectClass} value={storedMessage.signatureId ?? ''}
                    onChange={event => executePlan(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, signatureId: event.target.value || null }), 'The signal was rejected.')}
                  >
                    <option value="">(none)</option>
                    {[true, false].map(received => {
                      const options = signalCandidates.filter(candidate => candidate.received === received);
                      return options.length === 0 ? null : (
                        <optgroup key={String(received)} label={received ? 'Received by this Block' : 'Other Signals'}>
                          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>
              )}
              {triggerCoverage && (
                <span className="text-neutral-400" data-testid="sequence-trigger-coverage">
                  {triggerCoverage.covered
                    ? `A transition leaving ${(stateOptions.find(option => option.id === triggerCoverage.stateId)?.label ?? 'its state')} names “${triggerCoverage.signalName}”.`
                    : `No transition leaving ${(stateOptions.find(option => option.id === triggerCoverage.stateId)?.label ?? 'its state')} names “${triggerCoverage.signalName}” (the state machine is not changed).`}
                </span>
              )}
              {storedMessage.sort === 'asynchSignal' && (
                <button
                  type="button" className={buttonClass} title="Create a new Signal and use it for this message"
                  onClick={() => executePlan(buildCreateSignalForMessageCommand(repository, { interactionId, messageId: singleMessage.id }), 'The signal could not be created.')}
                >New signal</button>
              )}
              {(storedMessage.sort === 'synchCall' || storedMessage.sort === 'asynchCall') && (
                targetOperations ? (
                  <label>Operation{' '}
                    <select
                      aria-label="Operation" className={selectClass} value={storedMessage.signatureId ?? ''}
                      onChange={event => executePlan(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, signatureId: event.target.value || null }), 'The operation was rejected.')}
                    >
                      <option value="">(none)</option>
                      {targetOperations.map(operation => <option key={operation} value={operation}>{operationName(operation)}</option>)}
                    </select>
                  </label>
                ) : (
                  <span className="text-neutral-500">Operations appear once the receiving lifeline represents a Block.</span>
                )
              )}
              {(storedMessage.sort === 'synchCall' || storedMessage.sort === 'asynchCall') && targetOperations && (
                <button
                  type="button" className={buttonClass} title="Add an operation to the receiving Block and call it"
                  onClick={() => executePlan(buildCreateOperationForMessageCommand(repository, { interactionId, messageId: singleMessage.id }), 'The operation could not be created.')}
                >New operation</button>
              )}
              {messageConnectors.length > 0 && (
                <label>Connector{' '}
                  <select
                    aria-label="Connector" className={selectClass} value={storedMessage.connectorId ?? ''}
                    onChange={event => executePlan(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, connectorId: event.target.value || null }), 'The connector was rejected.')}
                  >
                    <option value="">(none)</option>
                    {messageConnectors.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
              )}
              {storedMessage.sort !== 'reply' && storedMessage.sort !== 'createMessage' && storedMessage.sort !== 'deleteMessage' && (
                <label>Arguments{' '}
                  <input
                    aria-label="Arguments" value={argsValue}
                    onChange={event => setArgsDraft({ id: singleMessage.id, value: event.target.value })}
                    onBlur={commitArgs} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                    className={inputClass}
                  />
                </label>
              )}
              <button type="button" className={buttonClass} disabled={messageIndex <= 0} onClick={() => executePlan(buildMoveInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, toIndex: messageIndex - 1 }), 'The message could not be moved.')}>Move up</button>
              <button type="button" className={buttonClass} disabled={messageIndex < 0 || messageIndex >= view.messages.length - 1} onClick={() => executePlan(buildMoveInteractionMessageCommand(repository, { interactionId, messageId: singleMessage.id, toIndex: messageIndex + 1 }), 'The message could not be moved.')}>Move down</button>
            </>
          )}
          {singleUse && storedUse && (
            <>
              <span className="text-neutral-400">Ref frame</span>
              <label>Refers to{' '}
                <select
                  aria-label="Referenced interaction" className={selectClass} value={storedUse.refersToId}
                  onChange={event => executePlan(buildUpdateInteractionUseCommand(repository, { interactionId, useId: singleUse.id, refersToId: event.target.value }), 'The ref frame was rejected.')}
                >
                  {!referableInteractions.some(option => option.id === storedUse.refersToId) && (
                    <option value={storedUse.refersToId}>{singleUse.refersToLabel}</option>
                  )}
                  {referableInteractions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label>After{' '}
                <select
                  aria-label="Ref frame follows message" className={selectClass} value={storedUse.afterMessageId ?? ''}
                  onChange={event => executePlan(buildUpdateInteractionUseCommand(repository, { interactionId, useId: singleUse.id, afterMessageId: event.target.value || null }), 'The ref frame could not be moved.')}
                >
                  <option value="">(start of the interaction)</option>
                  {view.messages.map(entry => <option key={entry.id} value={entry.id}>{entry.text}</option>)}
                </select>
              </label>
              <label>Arguments{' '}
                <input
                  aria-label="Ref frame arguments" value={argsDraft && argsDraft.id === singleUse.id ? argsDraft.value : storedUse.arguments ?? ''}
                  onChange={event => setArgsDraft({ id: singleUse.id, value: event.target.value })}
                  onBlur={() => {
                    if (!argsDraft || argsDraft.id !== singleUse.id) return;
                    const value = argsDraft.value;
                    setArgsDraft(null);
                    if (value.trim() !== (storedUse.arguments ?? '')) {
                      executePlan(buildUpdateInteractionUseCommand(repository, { interactionId, useId: singleUse.id, arguments: value }), 'The arguments could not be changed.');
                    }
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                  className={inputClass}
                />
              </label>
              <span className="flex flex-wrap items-center gap-2" aria-label="Lifelines covered by the ref frame">
                Covers
                {view.lifelines.map(lifeline => (
                  <label key={lifeline.id} className="flex items-center gap-1">
                    <input
                      type="checkbox" checked={storedUse.coveredLifelineIds.includes(lifeline.id)}
                      onChange={event => executePlan(buildUpdateInteractionUseCommand(repository, {
                        interactionId, useId: singleUse.id,
                        coveredLifelineIds: event.target.checked
                          ? [...storedUse.coveredLifelineIds, lifeline.id]
                          : storedUse.coveredLifelineIds.filter(id => id !== lifeline.id),
                      }), 'The ref frame could not be changed.')}
                    />
                    {lifeline.label}
                  </label>
                ))}
              </span>
            </>
          )}
          {singleFragment && storedFragment && (
            <>
              <span className="text-neutral-400">Combined fragment</span>
              <label>Operator{' '}
                <select
                  aria-label="Fragment operator" className={selectClass} value={storedFragment.operator}
                  onChange={event => executePlan(buildSetFragmentOperatorCommand(repository, { interactionId, fragmentId: singleFragment.id, operator: event.target.value as CombinedFragmentOperator }), 'The operator was rejected.')}
                >
                  {FRAGMENT_OPERATORS.map(operator => <option key={operator} value={operator}>{operator}</option>)}
                </select>
              </label>
              {storedFragment.operands.map((operand, index) => {
                const key = `${storedFragment.id}:${index}`;
                const value = guardDraft && guardDraft.key === key ? guardDraft.value : operand.guard ?? '';
                return (
                  <span key={key} className="flex items-center gap-1">
                    <label>Guard {index + 1}{' '}
                      <input
                        aria-label={`Guard of operand ${index + 1}`} value={value}
                        onChange={event => setGuardDraft({ key, value: event.target.value })}
                        onBlur={() => {
                          if (!guardDraft || guardDraft.key !== key) return;
                          const next = guardDraft.value;
                          setGuardDraft(null);
                          if (next.trim() !== (operand.guard ?? '')) {
                            executePlan(buildSetOperandGuardCommand(repository, { interactionId, fragmentId: storedFragment.id, operandIndex: index, guard: next }), 'The guard could not be changed.');
                          }
                        }}
                        onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                        className={inputClass}
                      />
                    </label>
                    {storedFragment.operands.length > 1 && (
                      <button type="button" className={buttonClass} aria-label={`Remove operand ${index + 1}`} onClick={() => executePlan(buildRemoveFragmentOperandCommand(repository, { interactionId, fragmentId: storedFragment.id, operandIndex: index }), 'The operand could not be removed.')}>×</button>
                    )}
                  </span>
                );
              })}
              <button type="button" className={buttonClass} onClick={() => executePlan(buildAddFragmentOperandCommand(repository, { interactionId, fragmentId: storedFragment.id }), 'The operand could not be added.')}>Add operand</button>
            </>
          )}
          {liveSelection.length > 1 && <span>{liveSelection.length} items selected</span>}
          {liveSelection.length > 0 && (
            <button type="button" className="rounded border border-red-800 px-2 py-0.5 text-red-300 hover:bg-red-950" onClick={deleteSelection}>
              {singleConstraint ? 'Delete constraint' : singleInvariant ? 'Delete state invariant' : singleUse ? 'Delete ref frame' : singleFragment ? 'Delete fragment' : singleLifeline ? 'Delete lifeline' : 'Delete message'}
            </button>
          )}
        </div>

        {diagnostics.length > 0 && (
          <ul className="mt-1 max-h-24 overflow-auto text-[11px]" data-testid="sequence-diagnostics" aria-label="Sequence diagnostics">
            {diagnostics.slice(0, 8).map((d, index) => (
              <li key={`${d.code}-${d.elementId}-${index}`} className={d.severity === 'error' ? 'text-red-300' : 'text-amber-300'}>{d.message}</li>
            ))}
            {diagnostics.length > 8 && <li className="text-neutral-400">…and {diagnostics.length - 8} more</li>}
          </ul>
        )}
        {message && <p data-testid="sequence-message-status" className="mt-1 text-neutral-300">{message}</p>}
      </footer>
    </section>
  );
}
