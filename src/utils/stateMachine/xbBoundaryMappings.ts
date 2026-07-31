import type { XBMappingV1 } from './xbModel';

/** A resolved Inport/Outport port that a state-machine variable may bind to. */
export interface XBBoundaryTarget {
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly label: string;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

/** Reads the block type from a canonical node or a legacy React Flow node. */
const resolveNodeType = (node: UnknownRecord): string | null => {
  const type = nonEmptyString(node.type);
  if (type !== null && type !== 'xblock') return type;
  return isRecord(node.data) ? nonEmptyString(node.data.type) : null;
};

/** Reads a port collection from canonical parameters or legacy node data. */
const resolvePorts = (
  node: UnknownRecord,
  collection: 'inputs' | 'outputs',
): readonly UnknownRecord[] => {
  const source = isRecord(node.parameters)
    ? node.parameters[collection]
    : isRecord(node.data)
      ? node.data[collection]
      : undefined;
  return Array.isArray(source) ? source.filter(isRecord) : [];
};

/** Reads the mapped variable ID from legacy params or canonical parameters. */
const resolveSmVarId = (node: UnknownRecord): string | null => {
  if (isRecord(node.data) && isRecord(node.data.params)) {
    const legacy = nonEmptyString(node.data.params.smVarId);
    if (legacy !== null) return legacy;
  }
  return isRecord(node.parameters)
    ? nonEmptyString(node.parameters.smVarId)
    : null;
};

/** Picks a display label, falling back to the stable node ID. */
const resolveLabel = (node: UnknownRecord): string => {
  if (isRecord(node.data)) {
    const label = nonEmptyString(node.data.label) ?? nonEmptyString(node.data.name);
    if (label !== null) return label;
  }
  return nonEmptyString(node.label) ?? nonEmptyString(node.id) ?? '';
};

const boundarySpec = (
  direction: 'in' | 'out',
): { type: string; collection: 'inputs' | 'outputs'; portDirection: string } => (
  direction === 'in'
    ? { type: 'Inport', collection: 'inputs', portDirection: 'input' }
    : { type: 'Outport', collection: 'outputs', portDirection: 'output' }
);

const targetKey = (blockId: string, portId: string, direction: 'in' | 'out') =>
  `${blockId}${portId}${direction}`;

/** Lists every boundary port of the requested direction, sorted by block and port. */
export const listXBBoundaryTargets = (
  nodes: readonly unknown[],
  direction: 'in' | 'out',
): readonly XBBoundaryTarget[] => {
  const spec = boundarySpec(direction);
  const targets: XBBoundaryTarget[] = [];
  for (const value of nodes) {
    if (!isRecord(value)) continue;
    const blockId = nonEmptyString(value.id);
    if (blockId === null || resolveNodeType(value) !== spec.type) continue;
    const label = resolveLabel(value);
    for (const port of resolvePorts(value, spec.collection)) {
      const portId = nonEmptyString(port.id);
      if (portId === null || port.direction !== spec.portDirection) continue;
      targets.push({ blockId, portId, direction, label });
    }
  }
  return targets.sort((a, b) =>
    a.blockId === b.blockId
      ? (a.portId < b.portId ? -1 : a.portId > b.portId ? 1 : 0)
      : (a.blockId < b.blockId ? -1 : 1));
};

/** Builds the canonical mapping record for one variable-to-target binding. */
export const createXBBoundaryMapping = (
  smVarId: string,
  target: XBBoundaryTarget,
): XBMappingV1 => ({
  smVarId,
  blockId: target.blockId,
  portId: target.portId,
  direction: target.direction,
});

/**
 * Mirrors the canonical variable ID into legacy `data.params.smVarId` or
 * canonical `parameters.smVarId`. Input nodes are never mutated; nodes that
 * change are shallow-cloned along the updated path.
 */
export const syncXBBoundaryNodeMetadata = (
  nodes: readonly any[],
  mappings: readonly XBMappingV1[],
): any[] => {
  const smVarIdByBlock = new Map<string, string>();
  for (const mapping of mappings) {
    if (!smVarIdByBlock.has(mapping.blockId)) {
      smVarIdByBlock.set(mapping.blockId, mapping.smVarId);
    }
  }

  return nodes.map((node) => {
    if (!isRecord(node)) return node;
    const blockId = nonEmptyString(node.id);
    if (blockId === null) return node;
    const smVarId = smVarIdByBlock.get(blockId);
    if (smVarId === undefined || resolveSmVarId(node) === smVarId) return node;

    if (isRecord(node.data)) {
      const params = isRecord(node.data.params) ? node.data.params : {};
      return {
        ...node,
        data: { ...node.data, params: { ...params, smVarId } },
      };
    }
    if (isRecord(node.parameters)) {
      return { ...node, parameters: { ...node.parameters, smVarId } };
    }
    return node;
  });
};

/**
 * Merges previous canonical mappings with boundary node metadata. Every
 * already-complete canonical mapping (one that still matches a resolved
 * boundary target) is preserved; a mapping is derived from node metadata only
 * when the variable exists and no canonical mapping covers that boundary block.
 */
export const reconcileXBBoundaryMappings = (
  nodes: readonly unknown[],
  previousMappings: readonly XBMappingV1[],
  validVariableIds: ReadonlySet<string>,
): readonly XBMappingV1[] => {
  const targetKeys = new Set<string>();
  for (const direction of ['in', 'out'] as const) {
    for (const target of listXBBoundaryTargets(nodes, direction)) {
      targetKeys.add(targetKey(target.blockId, target.portId, target.direction));
    }
  }

  const reconciled: XBMappingV1[] = [];
  const coveredBlocks = new Set<string>();
  for (const mapping of previousMappings) {
    if (targetKeys.has(targetKey(mapping.blockId, mapping.portId, mapping.direction))) {
      reconciled.push(mapping);
      coveredBlocks.add(mapping.blockId);
    }
  }

  for (const value of nodes) {
    if (!isRecord(value)) continue;
    const blockId = nonEmptyString(value.id);
    if (blockId === null || coveredBlocks.has(blockId)) continue;
    const type = resolveNodeType(value);
    if (type !== 'Inport' && type !== 'Outport') continue;
    const smVarId = resolveSmVarId(value);
    if (smVarId === null || !validVariableIds.has(smVarId)) continue;
    const direction = type === 'Inport' ? 'in' : 'out';
    const candidates = listXBBoundaryTargets([value], direction);
    // Repair only when the binding is unambiguous; never guess among ports.
    if (candidates.length !== 1) continue;
    const target = candidates[0];
    reconciled.push(createXBBoundaryMapping(smVarId, target));
    coveredBlocks.add(blockId);
  }
  return reconciled;
};

/** Drops mappings whose boundary block is no longer present in the node set. */
export const pruneXBBoundaryMappings = (
  mappings: readonly XBMappingV1[],
  nodes: readonly unknown[],
): readonly XBMappingV1[] => {
  const blockIds = new Set<string>();
  for (const value of nodes) {
    if (!isRecord(value)) continue;
    const id = nonEmptyString(value.id);
    if (id !== null) blockIds.add(id);
  }
  return mappings.filter((mapping) => blockIds.has(mapping.blockId));
};
