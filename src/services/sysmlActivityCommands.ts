import type {
  ActivityDefinition, ActivityEdge, ActivityNode, ActivityNodeKind, ActivityParameter, ActivityPartitionGroup, ActivityPin,
  SysmlRepository,
} from '../engine/sysml/model';
import type { DiagramPresentation } from '../engine/sysml/presentationState';
import {
  ACTIVITY_NODE_KIND_LABELS, activityNestedIds, checkActivityEdge, findInActivity, isObjectEndpoint, nodeLabel,
  resolveActivityEndpoint, resolvesAsPartitionOwner, validateActivity, withActivity,
} from '../engine/sysml/activity';
import { interactionNestedIds } from '../engine/sysml/interaction';
import { ACTIVITY_NODE_SIZES, type LaneAssignmentProposal } from '../features/sysml/activityDiagramView';
import { generateId } from '../features/modelExplorer/adapters/modelExplorerFactories';
import type { SysmlEditorCommand, SysmlMutationCommand } from './sysmlCommandGateway';

/**
 * Pure command builders for activity content. Every builder returns ONE gateway
 * command (a plain `updateElement` carrying the next arrays, or a `batch` that
 * also touches the diagram presentation), so each user action is one undo step.
 * The pure rules run first: a builder never returns a command that would add an
 * error the activity did not already have.
 */

export interface ActivityPlanDiagnostic { code: string; message: string }
export type ActivityCommandPlan =
  | { ok: true; command: SysmlEditorCommand; createdIds: string[] }
  | { ok: false; diagnostics: ActivityPlanDiagnostic[] };

const fail = (code: string, message: string): ActivityCommandPlan => ({ ok: false, diagnostics: [{ code, message }] });

function activityOf(repo: SysmlRepository, activityId: string): ActivityDefinition | undefined {
  const definition = repo.definitions[activityId];
  return definition?.kind === 'activity' ? definition : undefined;
}

/** Every id already used in the repository, nested ones included. */
export function knownIds(repo: SysmlRepository): Set<string> {
  const ids = new Set<string>();
  for (const collection of [
    repo.packages, repo.diagrams, repo.definitions, repo.usages, repo.connectors, repo.relationships, repo.requirements,
    repo.verificationCases, repo.evidence, repo.baselines, repo.artifacts, repo.actors ?? {}, repo.subjects ?? {},
    repo.useCases ?? {}, repo.extensionPoints ?? {}, repo.diagramReferences ?? {},
  ]) for (const id of Object.keys(collection)) ids.add(id);
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind === 'block') [...definition.properties, ...definition.ports].forEach(feature => ids.add(feature.id));
    if (definition.kind === 'constraintBlock') definition.parameters.forEach(parameter => ids.add(parameter.id));
    if (definition.kind === 'activity') activityNestedIds(definition).forEach(id => ids.add(id));
    if (definition.kind === 'interaction') interactionNestedIds(definition).forEach(id => ids.add(id));
  }
  return ids;
}

export function freshId(repo: SysmlRepository, prefix: string, requested?: string, extra: Iterable<string> = []): string {
  const taken = knownIds(repo);
  for (const id of extra) taken.add(id);
  if (requested) return requested;
  let id = generateId(prefix);
  while (taken.has(id)) id = generateId(prefix);
  return id;
}

export function uniqueName(base: string, names: Iterable<string>): string {
  const taken = new Set(names);
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

/** Errors the candidate has that the current activity does not (so legacy faults never block unrelated edits). */
function introducedErrors(repo: SysmlRepository, current: ActivityDefinition, next: ActivityDefinition): ActivityPlanDiagnostic[] {
  const key = (d: { code: string; elementId?: string }) => `${d.code}|${d.elementId ?? ''}`;
  const before = new Set(validateActivity(repo, current).filter(d => d.severity === 'error').map(key));
  return validateActivity(withActivity(repo, next), next)
    .filter(d => d.severity === 'error' && !before.has(key(d)))
    .map(d => ({ code: d.code, message: d.message }));
}

function commit(
  repo: SysmlRepository,
  current: ActivityDefinition,
  patch: Partial<Pick<ActivityDefinition, 'nodes' | 'edges' | 'partitions' | 'parameters' | 'name'>>,
  createdIds: string[],
  extra: SysmlMutationCommand[] = [],
  extraBefore: SysmlMutationCommand[] = [],
): ActivityCommandPlan {
  const next: ActivityDefinition = { ...current, ...patch };
  const errors = introducedErrors(repo, current, next);
  if (errors.length > 0) return { ok: false, diagnostics: errors };
  const update: SysmlMutationCommand = { type: 'updateElement', elementId: current.id, patch: patch as Record<string, unknown> };
  const commands = [...extraBefore, update, ...extra];
  return { ok: true, command: commands.length === 1 ? update : { type: 'batch', commands }, createdIds };
}

/** Relationships (e.g. «allocate») that end on any of `ids`; removing the nested element would orphan them. */
function relationshipsTouching(repo: SysmlRepository, ids: ReadonlySet<string>): string[] {
  return Object.values(repo.relationships)
    .filter(relationship => ids.has(relationship.sourceId) || ids.has(relationship.targetId))
    .map(relationship => relationship.id);
}

const blockedByRelationships = (what: string): ActivityCommandPlan =>
  fail('ACTIVITY_ELEMENT_HAS_RELATIONSHIPS', `${what} is the end of a relationship (for example «allocate»). Delete that relationship first.`);

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface AddActivityNodeInput {
  activityId: string;
  kind: ActivityNodeKind;
  name?: string;
  id?: string;
  typeId?: string;
  behaviorId?: string;
  /** activityParameterNode: bind to this existing parameter instead of creating one. */
  parameterId?: string;
  /** Show the node on this Activity Diagram at `position`. */
  diagramId?: string;
  position?: { x: number; y: number };
  /** Add the node to this swimlane in the same command. */
  partitionId?: string;
  /** Test seam. */
  newParameterId?: string;
}

export function buildAddActivityNodeCommand(repo: SysmlRepository, input: AddActivityNodeInput): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity) return fail('ACTIVITY_NOT_FOUND', 'The activity does not exist.');
  if (!ACTIVITY_NODE_KIND_LABELS[input.kind]) return fail('INVALID_NODE_KIND', 'That kind of node is not supported.');
  const nodes = activity.nodes ?? [];
  const nodeId = freshId(repo, 'anode', input.id);
  let parameters = activity.parameters ?? [];
  let parameterId = input.parameterId;
  let name = input.name?.trim() ?? '';
  const createdIds = [nodeId];

  if (input.kind === 'activityParameterNode') {
    if (parameterId && !parameters.some(parameter => parameter.id === parameterId)) {
      return fail('MISSING_ACTIVITY_PARAMETER', 'The parameter does not exist in this activity.');
    }
    if (!parameterId) {
      const parameter: ActivityParameter = {
        id: freshId(repo, 'aparam', input.newParameterId, [nodeId]),
        name: name || uniqueName('parameter', parameters.map(candidate => candidate.name)),
        direction: 'in',
        ...(input.typeId ? { typeId: input.typeId } : {}),
      };
      parameters = [...parameters, parameter];
      parameterId = parameter.id;
      createdIds.push(parameter.id);
    }
    name = name || (parameters.find(parameter => parameter.id === parameterId)?.name ?? '');
  } else if (input.kind === 'action' || input.kind === 'objectNode') {
    name = name || uniqueName(input.kind === 'action' ? 'Action' : 'Object', nodes.filter(node => node.kind === input.kind).map(node => node.name));
  }

  const node: ActivityNode = {
    id: nodeId,
    kind: input.kind,
    name,
    ...(input.kind === 'action' && input.behaviorId ? { behaviorId: input.behaviorId } : {}),
    ...(input.kind === 'action' ? { pins: [] } : {}),
    ...((input.kind === 'objectNode' || input.kind === 'activityParameterNode') && input.typeId ? { typeId: input.typeId } : {}),
    ...(input.kind === 'activityParameterNode' && parameterId ? { parameterId } : {}),
  };
  const partitions = input.partitionId
    ? (activity.partitions ?? []).map(partition => partition.id === input.partitionId
      ? { ...partition, nodeIds: [...partition.nodeIds, nodeId] } : partition)
    : undefined;
  if (input.partitionId && !(activity.partitions ?? []).some(partition => partition.id === input.partitionId)) {
    return fail('PARTITION_NOT_FOUND', 'The swimlane does not exist.');
  }

  const extra: SysmlMutationCommand[] = [];
  if (input.diagramId) {
    const size = ACTIVITY_NODE_SIZES[input.kind];
    const position = input.position ?? { x: 80, y: 80 };
    extra.push({
      type: 'addToDiagram',
      diagramId: input.diagramId,
      elementIds: [nodeId],
      coordinates: { [nodeId]: { x: position.x, y: position.y, width: size.width, height: size.height } },
    });
  }
  return commit(
    repo,
    activity,
    { nodes: [...nodes, node], ...(parameters !== activity.parameters ? { parameters } : {}), ...(partitions ? { partitions } : {}) },
    createdIds,
    extra,
  );
}

export interface NodeBounds { x: number; y: number; width?: number; height?: number }

/** One command that stores new positions for nodes on a diagram (presentation only). */
export function buildMoveActivityNodesCommand(diagramId: string, moves: Record<string, NodeBounds>): SysmlEditorCommand | undefined {
  const commands: SysmlMutationCommand[] = Object.entries(moves).map(([elementId, bounds]) => ({
    type: 'updatePresentation', diagramId, elementId, presentation: { ...bounds },
  }));
  if (commands.length === 0) return undefined;
  return commands.length === 1 ? commands[0] : { type: 'batch', commands };
}

export function buildRemoveActivityNodeCommand(
  repo: SysmlRepository,
  input: { activityId: string; nodeId: string; diagramPresentations?: Record<string, DiagramPresentation> },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const node = activity?.nodes.find(candidate => candidate.id === input.nodeId);
  if (!activity || !node) return fail('NODE_NOT_FOUND', 'The node does not exist.');
  const endpointIds = new Set([node.id, ...(node.pins ?? []).map(pin => pin.id)]);
  if (relationshipsTouching(repo, endpointIds).length > 0) return blockedByRelationships(nodeLabel(node));
  const presentingDiagrams = Object.entries(input.diagramPresentations ?? {})
    .filter(([, presentation]) => presentation.elementIds.includes(node.id))
    .map(([diagramId]) => diagramId);
  return commit(repo, activity, {
    nodes: activity.nodes.filter(candidate => candidate.id !== node.id),
    edges: activity.edges.filter(edge => !endpointIds.has(edge.sourceId) && !endpointIds.has(edge.targetId)),
    partitions: activity.partitions.map(partition => partition.nodeIds.includes(node.id)
      ? { ...partition, nodeIds: partition.nodeIds.filter(id => id !== node.id) } : partition),
  }, [], [], presentingDiagrams.map(diagramId => ({ type: 'removeFromDiagram' as const, diagramId, elementIds: [node.id] })));
}

export interface UpdateActivityNodeInput {
  activityId: string;
  nodeId: string;
  /** `null` clears. */
  behaviorId?: string | null;
  typeId?: string | null;
  parameterId?: string | null;
  name?: string;
}

export function buildUpdateActivityNodeCommand(repo: SysmlRepository, input: UpdateActivityNodeInput): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const node = activity?.nodes.find(candidate => candidate.id === input.nodeId);
  if (!activity || !node) return fail('NODE_NOT_FOUND', 'The node does not exist.');
  const next: ActivityNode = { ...node };
  const apply = <K extends 'behaviorId' | 'typeId' | 'parameterId'>(key: K, value: string | null | undefined) => {
    if (value === undefined) return;
    if (value === null || value === '') delete next[key]; else (next as unknown as Record<string, unknown>)[key] = value;
  };
  apply('behaviorId', input.behaviorId);
  apply('typeId', input.typeId);
  apply('parameterId', input.parameterId);
  if (input.name !== undefined) next.name = input.name.trim();
  return commit(repo, activity, { nodes: activity.nodes.map(candidate => candidate.id === node.id ? next : candidate) }, []);
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

export function buildAddActivityPinCommand(
  repo: SysmlRepository,
  input: { activityId: string; nodeId: string; direction: ActivityPin['direction']; name?: string; typeId?: string; id?: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const node = activity?.nodes.find(candidate => candidate.id === input.nodeId);
  if (!activity || !node) return fail('NODE_NOT_FOUND', 'The node does not exist.');
  if (node.kind !== 'action') return fail('ACTIVITY_NODE_INVALID_FEATURE', 'Only an action can have pins.');
  const pin: ActivityPin = {
    id: freshId(repo, 'apin', input.id),
    name: input.name?.trim() || uniqueName(input.direction === 'in' ? 'in' : 'out', (node.pins ?? []).map(candidate => candidate.name)),
    direction: input.direction,
    ...(input.typeId ? { typeId: input.typeId } : {}),
  };
  return commit(repo, activity, {
    nodes: activity.nodes.map(candidate => candidate.id === node.id ? { ...candidate, pins: [...(candidate.pins ?? []), pin] } : candidate),
  }, [pin.id]);
}

export function buildUpdateActivityPinCommand(
  repo: SysmlRepository,
  input: { activityId: string; pinId: string; name?: string; typeId?: string | null },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const found = activity ? findInActivity(activity, input.pinId) : undefined;
  if (!activity || found?.elementKind !== 'pin') return fail('PIN_NOT_FOUND', 'The pin does not exist.');
  return commit(repo, activity, {
    nodes: activity.nodes.map(node => ({
      ...node,
      ...(node.pins?.some(pin => pin.id === input.pinId) ? {
        pins: node.pins.map(pin => {
          if (pin.id !== input.pinId) return pin;
          const next: ActivityPin = { ...pin };
          if (input.name !== undefined) next.name = input.name.trim();
          if (input.typeId !== undefined) { if (input.typeId) next.typeId = input.typeId; else delete next.typeId; }
          return next;
        }),
      } : {}),
    })),
  }, []);
}

export function buildRemoveActivityPinCommand(repo: SysmlRepository, input: { activityId: string; pinId: string }): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const found = activity ? findInActivity(activity, input.pinId) : undefined;
  if (!activity || found?.elementKind !== 'pin') return fail('PIN_NOT_FOUND', 'The pin does not exist.');
  if (relationshipsTouching(repo, new Set([input.pinId])).length > 0) return blockedByRelationships(found.name);
  return commit(repo, activity, {
    nodes: activity.nodes.map(node => node.pins?.some(pin => pin.id === input.pinId)
      ? { ...node, pins: node.pins.filter(pin => pin.id !== input.pinId) } : node),
    edges: activity.edges.filter(edge => edge.sourceId !== input.pinId && edge.targetId !== input.pinId),
  }, []);
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/** The flow kind a connection between two ends must have: pins and object nodes carry object flows. */
export function inferEdgeKind(activity: ActivityDefinition, sourceId: string, targetId: string): ActivityEdge['kind'] {
  const source = resolveActivityEndpoint(activity, sourceId);
  const target = resolveActivityEndpoint(activity, targetId);
  if (source && target && (isObjectEndpoint(source) || isObjectEndpoint(target))) return 'objectFlow';
  return 'controlFlow';
}

export function buildAddActivityEdgeCommand(
  repo: SysmlRepository,
  input: { activityId: string; sourceId: string; targetId: string; kind?: ActivityEdge['kind']; guard?: string; id?: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity) return fail('ACTIVITY_NOT_FOUND', 'The activity does not exist.');
  const kind = input.kind ?? inferEdgeKind(activity, input.sourceId, input.targetId);
  const verdict = checkActivityEdge(repo, activity, { kind, sourceId: input.sourceId, targetId: input.targetId });
  if (verdict) return fail(verdict.code, verdict.message);
  const edge: ActivityEdge = {
    id: freshId(repo, 'aedge', input.id),
    kind,
    sourceId: input.sourceId,
    targetId: input.targetId,
    ...(input.guard?.trim() ? { guard: input.guard.trim() } : {}),
  };
  return commit(repo, activity, { edges: [...(activity.edges ?? []), edge] }, [edge.id]);
}

export function buildRemoveActivityEdgeCommand(repo: SysmlRepository, input: { activityId: string; edgeId: string }): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity || !activity.edges.some(edge => edge.id === input.edgeId)) return fail('EDGE_NOT_FOUND', 'The flow does not exist.');
  return commit(repo, activity, { edges: activity.edges.filter(edge => edge.id !== input.edgeId) }, []);
}

export function buildSetEdgeGuardCommand(
  repo: SysmlRepository,
  input: { activityId: string; edgeId: string; guard: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity || !activity.edges.some(edge => edge.id === input.edgeId)) return fail('EDGE_NOT_FOUND', 'The flow does not exist.');
  const guard = input.guard.trim();
  return commit(repo, activity, {
    edges: activity.edges.map(edge => {
      if (edge.id !== input.edgeId) return edge;
      const { guard: _previous, ...rest } = edge;
      return guard ? { ...rest, guard } : rest;
    }),
  }, []);
}

// ---------------------------------------------------------------------------
// Rename, parameters
// ---------------------------------------------------------------------------

/** Renames the activity itself, a node, a pin, a swimlane or a parameter (one command). */
export function buildRenameActivityElementCommand(
  repo: SysmlRepository,
  input: { activityId: string; elementId: string; name: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity) return fail('ACTIVITY_NOT_FOUND', 'The activity does not exist.');
  const name = input.name.trim();
  if (input.elementId === activity.id) return commit(repo, activity, { name }, []);
  const found = findInActivity(activity, input.elementId);
  if (!found || found.elementKind === 'edge') return fail('ELEMENT_NOT_FOUND', 'That element cannot be renamed.');
  switch (found.elementKind) {
    case 'node':
      return commit(repo, activity, { nodes: activity.nodes.map(node => node.id === input.elementId ? { ...node, name } : node) }, []);
    case 'pin':
      return buildUpdateActivityPinCommand(repo, { activityId: activity.id, pinId: input.elementId, name });
    case 'partition':
      return commit(repo, activity, { partitions: activity.partitions.map(partition => partition.id === input.elementId ? { ...partition, name } : partition) }, []);
    default:
      return commit(repo, activity, { parameters: activity.parameters.map(parameter => parameter.id === input.elementId ? { ...parameter, name } : parameter) }, []);
  }
}

export function buildAddActivityParameterCommand(
  repo: SysmlRepository,
  input: { activityId: string; name?: string; direction?: ActivityParameter['direction']; typeId?: string; id?: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity) return fail('ACTIVITY_NOT_FOUND', 'The activity does not exist.');
  const parameter: ActivityParameter = {
    id: freshId(repo, 'aparam', input.id),
    name: input.name?.trim() || uniqueName('parameter', (activity.parameters ?? []).map(candidate => candidate.name)),
    direction: input.direction ?? 'in',
    ...(input.typeId ? { typeId: input.typeId } : {}),
  };
  return commit(repo, activity, { parameters: [...(activity.parameters ?? []), parameter] }, [parameter.id]);
}

// ---------------------------------------------------------------------------
// Swimlanes (partitions)
// ---------------------------------------------------------------------------

export function buildAddPartitionCommand(
  repo: SysmlRepository,
  input: { activityId: string; name?: string; representsId?: string; id?: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity) return fail('ACTIVITY_NOT_FOUND', 'The activity does not exist.');
  const partitions = activity.partitions ?? [];
  const partition: ActivityPartitionGroup = {
    id: freshId(repo, 'apart', input.id),
    name: input.name?.trim() || uniqueName('Swimlane', partitions.map(candidate => candidate.name)),
    ...(input.representsId ? { representsId: input.representsId } : {}),
    nodeIds: [],
  };
  return commit(repo, activity, { partitions: [...partitions, partition] }, [partition.id]);
}

export function buildRemovePartitionCommand(repo: SysmlRepository, input: { activityId: string; partitionId: string }): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const partition = activity?.partitions.find(candidate => candidate.id === input.partitionId);
  if (!activity || !partition) return fail('PARTITION_NOT_FOUND', 'The swimlane does not exist.');
  if (relationshipsTouching(repo, new Set([partition.id])).length > 0) return blockedByRelationships(partition.name || 'The swimlane');
  return commit(repo, activity, { partitions: activity.partitions.filter(candidate => candidate.id !== partition.id) }, []);
}

/** Sets (or clears, with `undefined`) the Block or part a swimlane represents: allocation in swimlane form. */
export function buildSetPartitionRepresentsCommand(
  repo: SysmlRepository,
  input: { activityId: string; partitionId: string; representsId?: string },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  if (!activity || !activity.partitions.some(partition => partition.id === input.partitionId)) return fail('PARTITION_NOT_FOUND', 'The swimlane does not exist.');
  if (input.representsId && !resolvesAsPartitionOwner(repo, input.representsId)) {
    return fail('MISSING_PARTITION_REPRESENTS', 'A swimlane can represent a Block or one of its parts.');
  }
  return commit(repo, activity, {
    partitions: activity.partitions.map(partition => {
      if (partition.id !== input.partitionId) return partition;
      const { representsId: _previous, ...rest } = partition;
      return input.representsId ? { ...rest, representsId: input.representsId } : rest;
    }),
  }, []);
}

/** Moves a swimlane one column left (-1) or right (+1). */
export function buildMovePartitionCommand(
  repo: SysmlRepository,
  input: { activityId: string; partitionId: string; direction: -1 | 1 },
): ActivityCommandPlan {
  const activity = activityOf(repo, input.activityId);
  const index = activity?.partitions.findIndex(partition => partition.id === input.partitionId) ?? -1;
  if (!activity || index < 0) return fail('PARTITION_NOT_FOUND', 'The swimlane does not exist.');
  const target = index + input.direction;
  if (target < 0 || target >= activity.partitions.length) return fail('PARTITION_AT_EDGE', 'The swimlane is already at the edge.');
  const partitions = [...activity.partitions];
  [partitions[index], partitions[target]] = [partitions[target], partitions[index]];
  return commit(repo, activity, { partitions }, []);
}

/** Applies confirmed lane proposals in one command: each node leaves its old swimlane and joins the new one. */
export function buildAssignNodesToPartitionsCommand(
  repo: SysmlRepository,
  activityId: string,
  proposals: readonly LaneAssignmentProposal[],
): ActivityCommandPlan {
  const activity = activityOf(repo, activityId);
  if (!activity) return fail('ACTIVITY_NOT_FOUND', 'The activity does not exist.');
  if (proposals.length === 0) return fail('NOTHING_TO_ASSIGN', 'There is no swimlane change to apply.');
  const target = new Map(proposals.map(proposal => [proposal.nodeId, proposal.toPartitionId] as const));
  const partitions = activity.partitions.map(partition => {
    const kept = partition.nodeIds.filter(id => !target.has(id));
    const added = proposals.filter(proposal => proposal.toPartitionId === partition.id).map(proposal => proposal.nodeId);
    return { ...partition, nodeIds: [...kept, ...added] };
  });
  return commit(repo, activity, { partitions }, []);
}
