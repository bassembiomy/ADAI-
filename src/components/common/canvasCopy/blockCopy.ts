/**
 * Block copy shared by X-Bridges, V-Lab and OPM, with Simulink behaviour: independent deep copies, unique ids and names,
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

/** Where a canvas keeps the name and the nesting of its nodes. */
export interface NodeShape {
  getLabel: (node: CopyNode) => string | undefined;
  /** Sets the new name on a copy (the original is given so a name mirrored elsewhere can follow). */
  setLabel: (copy: CopyNode, label: string, original: CopyNode) => void;
  /** The id of the container a node sits in; empty, null or 'root' means the top level. */
  getParent: (node: CopyNode) => string | null | undefined;
  /** Points a copied descendant at the copy of its container. */
  remapParent: (copy: CopyNode, source: CopyNode, idMap: Record<string, string>) => void;
  idPrefix: (node: CopyNode) => string;
  /** True when descendants of a copied container also get unique names (Simulink); false when their names are scoped to the container. */
  renameNested: boolean;
  /** True when the node data always carries its own id. */
  syncDataId: boolean;
}

const dataParent = (node: CopyNode): string | null | undefined => node.data?.parentId;

export const XBRIDGES_NODE_SHAPE: NodeShape = {
  getLabel: (n) => (typeof n.data?.label === 'string' ? n.data.label : undefined),
  setLabel: (copy, label, original) => {
    copy.data.label = label;
    if (label !== original.data?.label && copy.data.params && copy.data.params.name === original.data?.label) {
      copy.data.params.name = label;
    }
  },
  getParent: dataParent,
  remapParent: (copy, source, idMap) => {
    copy.data.parentId = idMap[source.data?.parentId] ?? source.data?.parentId;
  },
  idPrefix: (n) => String(n.data?.type || 'block'),
  renameNested: true,
  syncDataId: true,
};

/** V-Lab blocks keep the same fields as X-Bridges blocks; parameters may be `{ value }` objects, which the deep clone handles. */
export const VLAB_NODE_SHAPE: NodeShape = { ...XBRIDGES_NODE_SHAPE };

/** OPM things: the name is data.name and the nesting is the React Flow parentId (mirrored in data.parentId). */
export const OPM_NODE_SHAPE: NodeShape = {
  getLabel: (n) => (typeof n.data?.name === 'string' ? n.data.name : undefined),
  setLabel: (copy, label) => { copy.data.name = label; },
  getParent: (n) => n.parentId ?? n.data?.parentId,
  remapParent: (copy, source, idMap) => {
    const parent = source.parentId ?? source.data?.parentId;
    const mapped = idMap[parent] ?? parent;
    if (source.parentId !== undefined) copy.parentId = mapped;
    if (source.data && 'parentId' in source.data) copy.data.parentId = mapped;
  },
  idPrefix: (n) => String(n.type || 'node'),
  renameNested: false,
  syncDataId: false,
};

export interface CopyOptions {
  /** Where the canvas keeps names and nesting; X-Bridges when omitted. */
  shape?: NodeShape;
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

const parentOf = (node: CopyNode, shape: NodeShape): string => shape.getParent(node) || 'root';

/** The ids to copy: the sources plus all their descendants, without repeating a source nested in another source. */
function collectIds(nodes: CopyNode[], sourceIds: string[], shape: NodeShape): { topIds: string[]; allIds: Set<string> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const wanted = new Set(sourceIds.filter((id) => byId.has(id)));
  const hasSelectedAncestor = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let parent = byId.get(id) ? shape.getParent(byId.get(id)!) ?? undefined : undefined;
    while (parent && parent !== 'root' && !seen.has(parent)) {
      if (wanted.has(parent)) return true;
      seen.add(parent);
      const up = byId.get(parent);
      parent = up ? shape.getParent(up) ?? undefined : undefined;
    }
    return false;
  };
  const topIds = [...wanted].filter((id) => !hasSelectedAncestor(id));
  const allIds = new Set(topIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (!allIds.has(n.id) && allIds.has(parentOf(n, shape)) && parentOf(n, shape) !== 'root') {
        allIds.add(n.id);
        grew = true;
      }
    }
  }
  return { topIds, allIds };
}

/** A deep snapshot (same ids) of the blocks, their descendants and the lines between them, for a clipboard. */
export function snapshotBlocks<N extends CopyNode, E extends CopyEdge>(
  nodes: N[], edges: E[], sourceIds: string[], shape: NodeShape = XBRIDGES_NODE_SHAPE,
): { nodes: N[]; edges: E[] } {
  const { allIds } = collectIds(nodes, sourceIds, shape);
  return {
    nodes: nodes.filter((n) => allIds.has(n.id)).map((n) => cloneDeepKeepFunctions(n)),
    edges: edges.filter((e) => allIds.has(e.source) && allIds.has(e.target)).map((e) => cloneDeepKeepFunctions(e)),
  };
}

export function copyBlocks<N extends CopyNode, E extends CopyEdge>(
  nodes: N[], edges: E[], sourceIds: string[], options: CopyOptions,
): CopyResult<N, E> {
  const shape = options.shape ?? XBRIDGES_NODE_SHAPE;
  const { topIds, allIds } = collectIds(nodes, sourceIds, shape);
  const topSet = new Set(topIds);
  const sources = nodes.filter((n) => allIds.has(n.id));
  const taken = new Set<string>(options.reservedLabels ?? []);
  for (const n of nodes) { const l = shape.getLabel(n); if (l) taken.add(l); }

  const idMap: Record<string, string> = {};
  for (const n of sources) idMap[n.id] = `${shape.idPrefix(n)}-${nextSuffix()}`;

  const newNodes = sources.map((source) => {
    const id = idMap[source.id];
    const isTop = topSet.has(source.id);
    const copy = cloneDeepKeepFunctions(source) as N;
    copy.id = id;
    copy.selected = isTop;
    if (shape.syncDataId || 'id' in copy.data) copy.data.id = id;
    if ('selected' in copy.data) copy.data.selected = isTop;
    if (!isTop) shape.remapParent(copy, source, idMap);
    if (isTop) {
      copy.position = { x: source.position.x + options.offset.x, y: source.position.y + options.offset.y };
    }
    const sourceLabel = shape.getLabel(source);
    if (sourceLabel && (isTop || shape.renameNested)) {
      const label = uniqueBlockLabel(sourceLabel, taken);
      taken.add(label);
      shape.setLabel(copy, label, source);
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
