/**
 * Block copy for X-Bridges with Simulink behaviour: independent deep copies, unique ids and names,
 * the lines between copied blocks, and subsystems copied together with their contents.
 */

export interface CopyNode {
  id: string;
  position: { x: number; y: number };
  selected?: boolean;
  data: Record<string, any>;
  [key: string]: any;
}

export interface CopyEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: any;
}

export interface CopyOptions {
  /** Offset added to the position of the top-level copies. */
  offset: { x: number; y: number };
  /** Extra names that are already taken (for example the names in the diagram a clipboard is pasted into). */
  reservedLabels?: Iterable<string>;
}

export interface CopyResult<N extends CopyNode = CopyNode, E extends CopyEdge = CopyEdge> {
  nodes: N[];
  edges: E[];
  idMap: Record<string, string>;
}

/** Deep clone that keeps functions (callbacks such as onUpdate) and other non-plain objects by reference. */
export function cloneDeepKeepFunctions<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneDeepKeepFunctions(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = cloneDeepKeepFunctions((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

let idCounter = 0;
const nextSuffix = () => `${Date.now()}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Simulink naming: Gain -> Gain1 -> Gain2. A name that is still free is returned unchanged. */
export function uniqueBlockLabel(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base;
  const stem = base.replace(/\d+$/, '');
  let n = 1;
  while (existing.has(`${stem}${n}`)) n++;
  return `${stem}${n}`;
}

const parentOf = (node: CopyNode): string => node.data?.parentId || 'root';

/** The ids to copy: the sources plus all their descendants, without repeating a source nested in another source. */
function collectIds(nodes: CopyNode[], sourceIds: string[]): { topIds: string[]; allIds: Set<string> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const wanted = new Set(sourceIds.filter((id) => byId.has(id)));
  const hasSelectedAncestor = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let parent = byId.get(id)?.data?.parentId as string | undefined;
    while (parent && parent !== 'root' && !seen.has(parent)) {
      if (wanted.has(parent)) return true;
      seen.add(parent);
      parent = byId.get(parent)?.data?.parentId;
    }
    return false;
  };
  const topIds = [...wanted].filter((id) => !hasSelectedAncestor(id));
  const allIds = new Set(topIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (!allIds.has(n.id) && allIds.has(parentOf(n)) && parentOf(n) !== 'root') {
        allIds.add(n.id);
        grew = true;
      }
    }
  }
  return { topIds, allIds };
}

/** A deep snapshot (same ids) of the blocks, their descendants and the lines between them, for a clipboard. */
export function snapshotBlocks<N extends CopyNode, E extends CopyEdge>(
  nodes: N[], edges: E[], sourceIds: string[],
): { nodes: N[]; edges: E[] } {
  const { allIds } = collectIds(nodes, sourceIds);
  return {
    nodes: nodes.filter((n) => allIds.has(n.id)).map((n) => cloneDeepKeepFunctions(n)),
    edges: edges.filter((e) => allIds.has(e.source) && allIds.has(e.target)).map((e) => cloneDeepKeepFunctions(e)),
  };
}

export function copyBlocks<N extends CopyNode, E extends CopyEdge>(
  nodes: N[], edges: E[], sourceIds: string[], options: CopyOptions,
): CopyResult<N, E> {
  const { topIds, allIds } = collectIds(nodes, sourceIds);
  const topSet = new Set(topIds);
  const sources = nodes.filter((n) => allIds.has(n.id));
  const taken = new Set<string>(options.reservedLabels ?? []);
  for (const n of nodes) if (typeof n.data?.label === 'string') taken.add(n.data.label);

  const idMap: Record<string, string> = {};
  for (const n of sources) idMap[n.id] = `${n.data?.type || 'block'}-${nextSuffix()}`;

  const newNodes = sources.map((source) => {
    const id = idMap[source.id];
    const isTop = topSet.has(source.id);
    const copy = cloneDeepKeepFunctions(source) as N;
    copy.id = id;
    copy.selected = isTop;
    copy.data.id = id;
    if ('selected' in copy.data) copy.data.selected = isTop;
    if (!isTop) copy.data.parentId = idMap[source.data?.parentId] ?? source.data?.parentId;
    if (isTop) {
      copy.position = { x: source.position.x + options.offset.x, y: source.position.y + options.offset.y };
    }
    if (typeof source.data?.label === 'string' && source.data.label) {
      const label = uniqueBlockLabel(source.data.label, taken);
      taken.add(label);
      copy.data.label = label;
      if (label !== source.data.label && copy.data.params && copy.data.params.name === source.data.label) {
        copy.data.params.name = label;
      }
    }
    return copy;
  });

  const newEdges = edges
    .filter((e) => allIds.has(e.source) && allIds.has(e.target))
    .map((e) => {
      const copy = cloneDeepKeepFunctions(e) as E;
      copy.id = `edge-${nextSuffix()}`;
      copy.source = idMap[e.source];
      copy.target = idMap[e.target];
      if ('selected' in copy) (copy as CopyEdge).selected = false;
      return copy;
    });

  return { nodes: newNodes, edges: newEdges, idMap };
}
