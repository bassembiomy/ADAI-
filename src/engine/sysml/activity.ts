import type {
  ActivityDefinition, ActivityEdge, ActivityNode, ActivityNodeKind, ActivityPin, SysmlRepository,
} from './model';
import type { SysmlDiagnostic } from './validation';
import { isSameOrSubtype } from './policy';
import { resolvePartLike } from './partOccurrences';

/**
 * SysML 1.6 Clause 11 (UML activities), Cameo core set. Pure rules over the
 * nested content of an `ActivityDefinition`; no execution or simulation.
 *
 * Severity policy: an `updateElement` is rejected on any staged error, so a
 * rule is an *error* only when the editor can prevent the violation at the
 * moment an edge/node is added. Rules that are naturally incomplete while a
 * diagram is being drawn (arity, guards, missing initial node) are warnings.
 */

const error = (code: string, elementId: string, propertyPath: string, message: string): SysmlDiagnostic =>
  ({ code, severity: 'error', elementId, propertyPath, message });
const warning = (code: string, elementId: string, propertyPath: string, message: string): SysmlDiagnostic =>
  ({ code, severity: 'warning', elementId, propertyPath, message });

export const ACTIVITY_NODE_KIND_LABELS: Record<ActivityNodeKind, string> = {
  action: 'Action',
  initial: 'Initial Node',
  activityFinal: 'Activity Final',
  flowFinal: 'Flow Final',
  decision: 'Decision',
  merge: 'Merge',
  fork: 'Fork',
  join: 'Join',
  objectNode: 'Object Node',
  activityParameterNode: 'Activity Parameter',
};

export const ACTIVITY_NODE_KINDS = Object.keys(ACTIVITY_NODE_KIND_LABELS) as ActivityNodeKind[];

/** Every nested id of an activity (nodes, pins, edges, partitions, parameters). */
export function activityNestedIds(activity: ActivityDefinition): string[] {
  return [
    ...(activity.nodes ?? []).flatMap(node => [node.id, ...(node.pins ?? []).map(pin => pin.id)]),
    ...(activity.edges ?? []).map(edge => edge.id),
    ...(activity.partitions ?? []).map(partition => partition.id),
    ...(activity.parameters ?? []).map(parameter => parameter.id),
  ];
}

export function isActivityDefinition(value: unknown): value is ActivityDefinition {
  return Boolean(value) && (value as { kind?: string }).kind === 'activity';
}

export function listActivities(repo: SysmlRepository): ActivityDefinition[] {
  return Object.values(repo.definitions).filter(isActivityDefinition);
}

export type ActivityElementKind = 'node' | 'pin' | 'edge' | 'partition' | 'parameter';
export interface ActivityElementRef {
  activity: ActivityDefinition;
  elementKind: ActivityElementKind;
  id: string;
  name: string;
  nodeKind?: ActivityNodeKind;
  /** For a pin: the action that owns it. */
  nodeId?: string;
}

/** Locates a nested activity element anywhere in the repository. */
export function findActivityElement(repo: SysmlRepository, id: string): ActivityElementRef | undefined {
  for (const activity of listActivities(repo)) {
    const inside = findInActivity(activity, id);
    if (inside) return inside;
  }
  return undefined;
}

export function findInActivity(activity: ActivityDefinition, id: string): ActivityElementRef | undefined {
  for (const node of activity.nodes ?? []) {
    if (node.id === id) return { activity, elementKind: 'node', id, name: nodeLabel(node), nodeKind: node.kind };
    const pin = (node.pins ?? []).find(candidate => candidate.id === id);
    if (pin) return { activity, elementKind: 'pin', id, name: pin.name?.trim() || 'Pin', nodeId: node.id };
  }
  const edge = (activity.edges ?? []).find(candidate => candidate.id === id);
  if (edge) return { activity, elementKind: 'edge', id, name: edge.kind === 'objectFlow' ? 'Object Flow' : 'Control Flow' };
  const partition = (activity.partitions ?? []).find(candidate => candidate.id === id);
  if (partition) return { activity, elementKind: 'partition', id, name: partition.name?.trim() || 'Partition' };
  const parameter = (activity.parameters ?? []).find(candidate => candidate.id === id);
  if (parameter) return { activity, elementKind: 'parameter', id, name: parameter.name?.trim() || 'Parameter' };
  return undefined;
}

export function nodeLabel(node: Pick<ActivityNode, 'kind' | 'name'>): string {
  return node.name?.trim() || ACTIVITY_NODE_KIND_LABELS[node.kind] || 'Node';
}

export const CONTROL_NODE_KINDS: ReadonlySet<ActivityNodeKind> = new Set(['initial', 'activityFinal', 'flowFinal', 'decision', 'merge', 'fork', 'join']);
export const OBJECT_NODE_KINDS: ReadonlySet<ActivityNodeKind> = new Set(['objectNode', 'activityParameterNode']);

export interface ActivityEndpoint {
  id: string;
  node: ActivityNode;
  pin?: ActivityPin;
}

/** Resolves an edge endpoint id to the node or the pin (with its action). */
export function resolveActivityEndpoint(activity: ActivityDefinition, id: string): ActivityEndpoint | undefined {
  for (const node of activity.nodes ?? []) {
    if (node.id === id) return { id, node };
    const pin = (node.pins ?? []).find(candidate => candidate.id === id);
    if (pin) return { id, node, pin };
  }
  return undefined;
}

export function isObjectEndpoint(endpoint: ActivityEndpoint): boolean {
  return Boolean(endpoint.pin) || OBJECT_NODE_KINDS.has(endpoint.node.kind);
}

/** The type carried by an object endpoint: the pin's, an object node's, or a bound parameter's. */
export function endpointTypeId(activity: ActivityDefinition, endpoint: ActivityEndpoint): string | undefined {
  if (endpoint.pin) return endpoint.pin.typeId || undefined;
  if (endpoint.node.kind === 'activityParameterNode') {
    const parameter = (activity.parameters ?? []).find(candidate => candidate.id === endpoint.node.parameterId);
    return endpoint.node.typeId || parameter?.typeId || undefined;
  }
  return endpoint.node.typeId || undefined;
}

export interface ActivityEdgeCheck { code: string; message: string; }

/**
 * Pure legality check for one edge against the activity it would join. Used by
 * both the repository validation and the editor's command builders, so the
 * canvas never offers a connection the rules would reject.
 */
export function checkActivityEdge(
  repo: SysmlRepository,
  activity: ActivityDefinition,
  edge: Pick<ActivityEdge, 'kind' | 'sourceId' | 'targetId'>,
): ActivityEdgeCheck | undefined {
  const source = resolveActivityEndpoint(activity, edge.sourceId);
  const target = resolveActivityEndpoint(activity, edge.targetId);
  if (!source || !target) return { code: 'ACTIVITY_EDGE_ENDPOINT_MISSING', message: 'An activity edge must connect two nodes or pins of the same activity.' };
  if (source.id === target.id) return { code: 'ACTIVITY_EDGE_SELF', message: 'An activity edge cannot connect a node to itself.' };
  if (edge.kind === 'controlFlow') {
    if (source.pin || target.pin) return { code: 'CONTROL_FLOW_INTO_PIN', message: 'A control flow cannot start or end at a pin; use an object flow.' };
  } else {
    if (!isObjectEndpoint(source) || !isObjectEndpoint(target)) {
      return { code: 'OBJECT_FLOW_ENDPOINT', message: 'An object flow connects object nodes, activity parameter nodes or action pins; use a control flow for other nodes.' };
    }
    if (source.pin && source.pin.direction !== 'out') return { code: 'OBJECT_FLOW_PIN_DIRECTION', message: 'An object flow can only leave an output pin.' };
    if (target.pin && target.pin.direction !== 'in') return { code: 'OBJECT_FLOW_PIN_DIRECTION', message: 'An object flow can only enter an input pin.' };
    const sourceType = endpointTypeId(activity, source);
    const targetType = endpointTypeId(activity, target);
    if (sourceType && targetType && !isSameOrSubtype(repo, sourceType, targetType)) {
      return { code: 'OBJECT_FLOW_TYPE_MISMATCH', message: 'The source type is not the same as, or a subtype of, the target type.' };
    }
  }
  if (source.node.kind === 'activityFinal' || source.node.kind === 'flowFinal') {
    return { code: 'FINAL_NODE_HAS_OUTGOING', message: 'A final node cannot have outgoing edges.' };
  }
  if (target.node.kind === 'initial') {
    return { code: 'INITIAL_NODE_HAS_INCOMING', message: 'An initial node cannot have incoming edges.' };
  }
  return undefined;
}

function resolvesAsType(repo: SysmlRepository, typeId: string): boolean {
  const type = repo.definitions[typeId];
  return Boolean(type && (type.kind === 'valueType' || type.kind === 'enumeration' || type.kind === 'block'
    || type.kind === 'signal' || type.kind === 'interface'));
}

/** A partition may represent a Block or one of its part/reference properties. */
/** An action may call an Activity or an Interaction (UML CallBehaviorAction). */
export function isCallableBehavior(repo: SysmlRepository, id: string): boolean {
  const kind = repo.definitions[id]?.kind;
  return kind === 'activity' || kind === 'interaction';
}

export interface ActivityBehaviorEdit { activityId: string; nodes: ActivityNode[]; nodeIds: string[] }

/**
 * Edits that stop actions calling a behavior that is going away: the action
 * stays and becomes opaque, instead of keeping a dangling call that fails
 * validation for every later edit. Activities that are themselves going away are skipped.
 */
export function clearCalledBehaviorReferences(repo: SysmlRepository, gone: ReadonlySet<string>): ActivityBehaviorEdit[] {
  const edits: ActivityBehaviorEdit[] = [];
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'activity' || gone.has(definition.id)) continue;
    const nodeIds: string[] = [];
    const nodes = (definition.nodes ?? []).map(node => {
      if (!node.behaviorId || !gone.has(node.behaviorId)) return node;
      nodeIds.push(node.id);
      const { behaviorId: _removed, ...rest } = node;
      return rest as ActivityNode;
    });
    if (nodeIds.length > 0) edits.push({ activityId: definition.id, nodes, nodeIds });
  }
  return edits;
}

export function resolvesAsPartitionOwner(repo: SysmlRepository, id: string): boolean {
  if (repo.definitions[id]?.kind === 'block') return true;
  if (repo.usages[id]?.kind === 'part') return true;
  if (id.includes('/') && resolvePartLike(repo, id)?.kind === 'part') return true;
  return Object.values(repo.definitions).some(definition => definition.kind === 'block'
    && definition.properties.some(property => property.id === id && (property.kind === 'part' || property.kind === 'reference')));
}

export function validateActivity(repo: SysmlRepository, activity: ActivityDefinition): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const nodes = activity.nodes ?? [];
  const edges = activity.edges ?? [];
  const name = activity.name?.trim() || 'Activity';
  const incoming = new Map<string, ActivityEdge[]>();
  const outgoing = new Map<string, ActivityEdge[]>();
  const push = (map: Map<string, ActivityEdge[]>, key: string, edge: ActivityEdge) => map.set(key, [...(map.get(key) ?? []), edge]);

  const initials = nodes.filter(node => node.kind === 'initial');
  if (initials.length > 1) {
    diagnostics.push(error('MULTIPLE_INITIAL_NODES', activity.id, 'nodes', `Activity ${name} has ${initials.length} initial nodes; it may have at most one`));
  } else if (initials.length === 0 && nodes.length > 0) {
    diagnostics.push(warning('ACTIVITY_NO_INITIAL_NODE', activity.id, 'nodes', `Activity ${name} has no initial node`));
  }

  const parameterIds = new Set((activity.parameters ?? []).map(parameter => parameter.id));
  (activity.parameters ?? []).forEach((parameter, index) => {
    if (parameter.typeId && !resolvesAsType(repo, parameter.typeId)) {
      diagnostics.push(error('MISSING_ACTIVITY_PARAMETER_TYPE', parameter.id, `parameters.${index}.typeId`, `Parameter ${parameter.name || 'Parameter'} of ${name} has a type that does not exist`));
    }
  });

  for (const node of nodes) {
    const label = nodeLabel(node);
    const path = `nodes.${nodes.indexOf(node)}`;
    if (node.kind === 'action' && node.behaviorId && !isCallableBehavior(repo, node.behaviorId)) {
      diagnostics.push(error('MISSING_CALLED_BEHAVIOR', node.id, `${path}.behaviorId`, `Action ${label} in ${name} calls a behavior that does not exist`));
    }
    if (node.kind !== 'action' && (node.behaviorId || (node.pins?.length ?? 0) > 0)) {
      diagnostics.push(error('ACTIVITY_NODE_INVALID_FEATURE', node.id, path, `${ACTIVITY_NODE_KIND_LABELS[node.kind]} ${label} in ${name} cannot have a called behavior or pins`));
    }
    if ((node.kind === 'objectNode' || node.kind === 'activityParameterNode') && node.typeId && !resolvesAsType(repo, node.typeId)) {
      diagnostics.push(error('MISSING_OBJECT_NODE_TYPE', node.id, `${path}.typeId`, `${label} in ${name} has a type that does not exist`));
    }
    if (node.kind === 'activityParameterNode' && (!node.parameterId || !parameterIds.has(node.parameterId))) {
      diagnostics.push(error('MISSING_ACTIVITY_PARAMETER', node.id, `${path}.parameterId`, `${label} in ${name} is not bound to a parameter of the activity`));
    }
    for (const pin of node.pins ?? []) {
      if (pin.typeId && !resolvesAsType(repo, pin.typeId)) {
        diagnostics.push(error('MISSING_PIN_TYPE', pin.id, `${path}.pins`, `Pin ${pin.name || 'Pin'} of ${label} in ${name} has a type that does not exist`));
      }
    }
  }

  const seenPairs = new Set<string>();
  edges.forEach((edge, index) => {
    const path = `edges.${index}`;
    const verdict = checkActivityEdge(repo, activity, edge);
    if (verdict) {
      diagnostics.push(error(verdict.code, edge.id, path, `${edge.kind === 'objectFlow' ? 'Object flow' : 'Control flow'} in ${name}: ${verdict.message}`));
    }
    const pairKey = `${edge.kind}|${edge.sourceId}|${edge.targetId}`;
    if (seenPairs.has(pairKey)) {
      diagnostics.push(error('DUPLICATE_ACTIVITY_EDGE', edge.id, path, `${name} already has this ${edge.kind === 'objectFlow' ? 'object' : 'control'} flow between the same two ends`));
    }
    seenPairs.add(pairKey);
    const source = resolveActivityEndpoint(activity, edge.sourceId);
    const target = resolveActivityEndpoint(activity, edge.targetId);
    // Edges leaving/entering a pin count towards the owning action's arity only for tokens, not control nodes.
    if (source) push(outgoing, source.node.id, edge);
    if (target) push(incoming, target.node.id, edge);
  });

  for (const node of nodes) {
    const label = nodeLabel(node);
    const ins = incoming.get(node.id) ?? [];
    const outs = outgoing.get(node.id) ?? [];
    switch (node.kind) {
      case 'decision':
        if (outs.length < 2) diagnostics.push(warning('DECISION_NEEDS_BRANCHES', node.id, 'edges', `Decision ${label} in ${name} needs at least two outgoing edges`));
        else {
          for (const edge of outs) {
            if (!edge.guard?.trim()) diagnostics.push(warning('DECISION_MISSING_GUARD', edge.id, 'guard', `An outgoing edge of decision ${label} in ${name} has no guard`));
          }
        }
        if (ins.length !== 1) diagnostics.push(warning('DECISION_INCOMING_ARITY', node.id, 'edges', `Decision ${label} in ${name} should have exactly one incoming edge`));
        break;
      case 'merge':
        if (ins.length < 2 || outs.length !== 1) diagnostics.push(warning('MERGE_ARITY', node.id, 'edges', `Merge ${label} in ${name} needs at least two incoming edges and exactly one outgoing edge`));
        break;
      case 'fork':
        if (ins.length !== 1 || outs.length < 2) diagnostics.push(warning('FORK_ARITY', node.id, 'edges', `Fork ${label} in ${name} needs exactly one incoming edge and at least two outgoing edges`));
        break;
      case 'join':
        if (ins.length < 2 || outs.length !== 1) diagnostics.push(warning('JOIN_ARITY', node.id, 'edges', `Join ${label} in ${name} needs at least two incoming edges and exactly one outgoing edge`));
        break;
      default:
        break;
    }
  }

  const nodeIds = new Set(nodes.map(node => node.id));
  const claimed = new Map<string, string>();
  (activity.partitions ?? []).forEach((partition, index) => {
    const path = `partitions.${index}`;
    const label = partition.name?.trim() || 'Partition';
    if (partition.representsId && !resolvesAsPartitionOwner(repo, partition.representsId)) {
      diagnostics.push(error('MISSING_PARTITION_REPRESENTS', partition.id, `${path}.representsId`, `Partition ${label} in ${name} represents an element that does not exist (expected a Block or part)`));
    }
    for (const nodeId of partition.nodeIds ?? []) {
      if (!nodeIds.has(nodeId)) {
        diagnostics.push(error('PARTITION_NODE_MISSING', partition.id, `${path}.nodeIds`, `Partition ${label} in ${name} lists a node that does not exist`));
      } else if (claimed.has(nodeId) && claimed.get(nodeId) !== partition.id) {
        diagnostics.push(warning('NODE_IN_MULTIPLE_PARTITIONS', nodeId, `${path}.nodeIds`, `A node in ${name} is placed in more than one swimlane`));
      }
      claimed.set(nodeId, partition.id);
    }
  });
  return diagnostics;
}

export function validateActivities(repo: SysmlRepository): SysmlDiagnostic[] {
  return listActivities(repo).flatMap(activity => validateActivity(repo, activity));
}

/** The repository with `next` swapped in, for validating a candidate before it is committed. */
export function withActivity(repo: SysmlRepository, next: ActivityDefinition): SysmlRepository {
  return { ...repo, definitions: { ...repo.definitions, [next.id]: next } };
}
