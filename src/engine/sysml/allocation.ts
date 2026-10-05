import type { SysmlRepository, SysmlRelationship } from './model';
import { sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';
import { findActivityElement, listActivities } from './activity';
import { findInteractionElement, interactionNestedIds, listInteractions } from './interaction';
import { derivedDepthOneParts, resolvePartLike } from './partOccurrences';

/**
 * SysML 1.6 Clause 15: «allocate» relates any named element (the client, "allocatedFrom")
 * to any other (the supplier, "allocatedTo"). This module answers allocation queries and
 * builds the allocation matrix. It is pure: nothing here mutates the repository.
 */

export type AllocationElementKind =
  | 'block' | 'interface' | 'valueType' | 'enumeration' | 'signal' | 'constraintBlock'
  | 'part' | 'port' | 'requirement' | 'verificationCase'
  | 'useCase' | 'actor' | 'subject' | 'package'
  | 'activity' | 'action' | 'partition'
  | 'interaction' | 'lifeline' | 'message';

export interface AllocationElementRef {
  id: string;
  name: string;
  kind: AllocationElementKind;
}

export interface AllocationLink {
  relationshipId: string;
  element: AllocationElementRef;
}

export const ALLOCATION_KIND_LABELS: Record<AllocationElementKind, string> = {
  block: 'Block', interface: 'Interface', valueType: 'Value Type', enumeration: 'Enumeration', signal: 'Signal',
  constraintBlock: 'Constraint Block', part: 'Part', port: 'Port', requirement: 'Requirement',
  verificationCase: 'Verification Case', useCase: 'Use Case', actor: 'Actor', subject: 'Subject', package: 'Package',
  activity: 'Activity', action: 'Action', partition: 'Swimlane',
  interaction: 'Interaction', lifeline: 'Lifeline', message: 'Message',
};

export const ALL_ALLOCATION_KINDS = Object.keys(ALLOCATION_KIND_LABELS) as AllocationElementKind[];
/** Default matrix axes: behaviour-like things on the rows, structure on the columns. */
export const DEFAULT_ALLOCATION_ROW_KINDS: AllocationElementKind[] = ['activity', 'useCase', 'block'];
export const DEFAULT_ALLOCATION_COLUMN_KINDS: AllocationElementKind[] = ['block', 'part'];

export interface AllocationMatrixOptions {
  rowKinds?: readonly AllocationElementKind[];
  columnKinds?: readonly AllocationElementKind[];
}

export interface AllocationMatrix {
  rows: AllocationElementRef[];
  columns: AllocationElementRef[];
  /** Relationship ids per cell; key = `allocationCellKey(rowId, columnId)`. Rows are the allocatedFrom side. */
  cells: Record<string, string[]>;
  coverage: {
    rowCount: number;
    allocatedRowCount: number;
    unallocatedRowIds: string[];
    columnCount: number;
    allocatedColumnCount: number;
    unallocatedColumnIds: string[];
  };
}

export function allocationCellKey(rowId: string, columnId: string): string {
  return `${rowId}\u0001${columnId}`;
}

function ref(id: string, value: { name?: string }, kind: AllocationElementKind): AllocationElementRef {
  return { id, name: sysmlObjectLabel(value as { name?: string }, ALLOCATION_KIND_LABELS[kind]), kind };
}

function byName(a: AllocationElementRef, b: AllocationElementRef): number {
  return a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
}

/** Resolves an id to a named element that may take part in an allocation. */
export function resolveAllocationElement(repo: SysmlRepository, id: string): AllocationElementRef | undefined {
  const definition = repo.definitions[id];
  if (definition) {
    switch (definition.kind) {
      case 'block': case 'interface': case 'valueType': case 'enumeration': case 'signal': case 'constraintBlock': case 'activity': case 'interaction':
        return ref(id, definition, definition.kind);
      default: return undefined;
    }
  }
  // Activity actions and swimlanes are nested in their Activity; other nested ids are not allocatable.
  const nested = findActivityElement(repo, id);
  if (nested) {
    if (nested.elementKind === 'node' && nested.nodeKind === 'action') return ref(id, { name: nested.name }, 'action');
    if (nested.elementKind === 'partition') return ref(id, { name: nested.name }, 'partition');
    return undefined;
  }
  // Lifelines and messages are nested in their Interaction.
  const sequenceElement = findInteractionElement(repo, id);
  if (sequenceElement) {
    if (sequenceElement.elementKind === 'lifeline') return ref(id, { name: sequenceElement.name }, 'lifeline');
    if (sequenceElement.elementKind === 'message') return ref(id, { name: sequenceElement.name }, 'message');
    return undefined;
  }
  const usage = resolvePartLike(repo, id);
  if (usage) return ref(id, usage, usage.kind === 'port' ? 'port' : 'part');
  if (repo.requirements[id]) return ref(id, repo.requirements[id], 'requirement');
  if (repo.verificationCases[id]) return ref(id, repo.verificationCases[id], 'verificationCase');
  if (repo.useCases?.[id]) return ref(id, repo.useCases[id], 'useCase');
  if (repo.actors?.[id]) return ref(id, repo.actors[id], 'actor');
  if (repo.subjects?.[id]) return ref(id, repo.subjects[id], 'subject');
  if (repo.packages[id]) return ref(id, repo.packages[id], 'package');
  return undefined;
}

export function listAllocationElements(repo: SysmlRepository, kinds: readonly AllocationElementKind[]): AllocationElementRef[] {
  const wanted = new Set(kinds);
  const ids = new Set<string>([
    ...Object.keys(repo.definitions), ...Object.keys(repo.usages), ...Object.keys(repo.requirements),
    ...Object.keys(repo.verificationCases), ...Object.keys(repo.useCases ?? {}), ...Object.keys(repo.actors ?? {}),
    ...Object.keys(repo.subjects ?? {}), ...Object.keys(repo.packages),
    // Format 5: parts are Block properties, so they are listed from there.
    ...derivedDepthOneParts(repo).map(part => part.id),
  ]);
  for (const activity of listActivities(repo)) {
    for (const node of activity.nodes ?? []) if (node.kind === 'action') ids.add(node.id);
    for (const partition of activity.partitions ?? []) ids.add(partition.id);
  }
  for (const interaction of listInteractions(repo)) {
    for (const id of interactionNestedIds(interaction)) ids.add(id);
  }
  const result: AllocationElementRef[] = [];
  for (const id of ids) {
    const element = resolveAllocationElement(repo, id);
    if (element && wanted.has(element.kind)) result.push(element);
  }
  return result.sort(byName);
}

export function allocationRelationships(repo: SysmlRepository): SysmlRelationship[] {
  return Object.values(repo.relationships).filter(relationship => relationship.kind === 'allocation');
}

function links(repo: SysmlRepository, pick: (relationship: SysmlRelationship) => [string, string]): (id: string) => AllocationLink[] {
  return id => {
    const result: AllocationLink[] = [];
    for (const relationship of allocationRelationships(repo)) {
      const [own, other] = pick(relationship);
      if (own !== id) continue;
      const element = resolveAllocationElement(repo, other);
      if (element) result.push({ relationshipId: relationship.id, element });
    }
    return result.sort((a, b) => byName(a.element, b.element) || a.relationshipId.localeCompare(b.relationshipId));
  };
}

/** Elements this one is allocated to («allocate» supplier side), sorted by name. */
export function allocatedTo(repo: SysmlRepository, id: string): AllocationLink[] {
  return links(repo, relationship => [relationship.sourceId, relationship.targetId])(id);
}

/** Elements allocated to this one («allocate» client side), sorted by name. */
export function allocatedFrom(repo: SysmlRepository, id: string): AllocationLink[] {
  return links(repo, relationship => [relationship.targetId, relationship.sourceId])(id);
}

export function buildAllocationMatrix(repo: SysmlRepository, options: AllocationMatrixOptions = {}): AllocationMatrix {
  const rows = listAllocationElements(repo, options.rowKinds ?? DEFAULT_ALLOCATION_ROW_KINDS);
  const columns = listAllocationElements(repo, options.columnKinds ?? DEFAULT_ALLOCATION_COLUMN_KINDS);
  const rowIds = new Set(rows.map(row => row.id));
  const columnIds = new Set(columns.map(column => column.id));
  const cells: Record<string, string[]> = {};
  const allocatedRows = new Set<string>();
  const allocatedColumns = new Set<string>();
  for (const relationship of allocationRelationships(repo)) {
    if (!rowIds.has(relationship.sourceId) || !columnIds.has(relationship.targetId)) continue;
    const key = allocationCellKey(relationship.sourceId, relationship.targetId);
    (cells[key] ??= []).push(relationship.id);
    allocatedRows.add(relationship.sourceId);
    allocatedColumns.add(relationship.targetId);
  }
  for (const key of Object.keys(cells)) cells[key].sort();
  return {
    rows, columns, cells,
    coverage: {
      rowCount: rows.length,
      allocatedRowCount: allocatedRows.size,
      unallocatedRowIds: rows.filter(row => !allocatedRows.has(row.id)).map(row => row.id),
      columnCount: columns.length,
      allocatedColumnCount: allocatedColumns.size,
      unallocatedColumnIds: columns.filter(column => !allocatedColumns.has(column.id)).map(column => column.id),
    },
  };
}

export interface AllocationNames { allocatedFrom: string[]; allocatedTo: string[]; }

/** One pass over the allocations: sorted, de-duplicated names for every element that has any. */
export function allocationNamesByElement(repo: SysmlRepository): Map<string, AllocationNames> {
  const result = new Map<string, AllocationNames>();
  const entry = (id: string) => {
    let value = result.get(id);
    if (!value) { value = { allocatedFrom: [], allocatedTo: [] }; result.set(id, value); }
    return value;
  };
  for (const relationship of allocationRelationships(repo)) {
    const source = resolveAllocationElement(repo, relationship.sourceId);
    const target = resolveAllocationElement(repo, relationship.targetId);
    if (!source || !target) continue;
    entry(relationship.sourceId).allocatedTo.push(target.name);
    entry(relationship.targetId).allocatedFrom.push(source.name);
  }
  for (const value of result.values()) {
    value.allocatedFrom = [...new Set(value.allocatedFrom)].sort((a, b) => a.localeCompare(b));
    value.allocatedTo = [...new Set(value.allocatedTo)].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

/** Text lines of a BDD «allocatedFrom» / «allocatedTo» compartment; empty when there is nothing to show. */
export function formatAllocationCompartment(label: 'allocatedFrom' | 'allocatedTo', names: readonly string[]): string[] {
  if (!names.length) return [];
  return [`«${label}»`, ...names.map(name => `  ${name}`)];
}
