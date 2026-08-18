import type { XBMappingV1 } from './xbModel';
import type { ModelDiagnostic } from './smModel';

/** A resolved Inport/Outport port that a state-machine variable may bind to. */
export interface XBBoundaryTarget {
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly label: string;
}

type UnknownRecord = Record<string, unknown>;

export interface XBLegacyBoundaryRepairResult {
  readonly model: unknown;
  readonly diagnostics: readonly ModelDiagnostic[];
}

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
  if (isRecord(node.params)) {
    const p = nonEmptyString(node.params.smVarId);
    if (p !== null) return p;
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
  JSON.stringify([blockId, portId, direction]);

const isCompleteXBBoundaryMapping = (mapping: XBMappingV1): boolean =>
  nonEmptyString(mapping.smVarId) !== null
  && nonEmptyString(mapping.blockId) !== null
  && nonEmptyString(mapping.portId) !== null
  && (mapping.direction === 'in' || mapping.direction === 'out');

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
    const resolved = resolvePorts(value, spec.collection);
    const ports = resolved.length > 0
      ? resolved
      : [{ id: direction === 'out' ? 'out' : 'in', direction: spec.portDirection }];
    for (const port of ports) {
      const portId = nonEmptyString(port.id);
      if (portId === null) continue;
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
 * Mirrors canonical mappings into legacy `data.params.smVarId` or canonical
 * `parameters.smVarId`. Stale boundary metadata is removed so it cannot be
 * re-imported as an additional mapping after a save/reload. Input nodes are
 * never mutated; nodes that change are shallow-cloned along the updated path.
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
    const type = resolveNodeType(node);
    if (type !== 'Inport' && type !== 'Outport') return node;
    const smVarId = smVarIdByBlock.get(blockId);
    const currentSmVarId = resolveSmVarId(node);
    if (smVarId === undefined && currentSmVarId === null) return node;
    if (smVarId !== undefined && currentSmVarId === smVarId) return node;

    if (smVarId !== undefined && isRecord(node.data)) {
      const params = isRecord(node.data.params) ? node.data.params : {};
      return {
        ...node,
        data: { ...node.data, params: { ...params, smVarId } },
      };
    }
    if (smVarId !== undefined && isRecord(node.parameters)) {
      return { ...node, parameters: { ...node.parameters, smVarId } };
    }
    if (smVarId === undefined && isRecord(node.data) && isRecord(node.data.params)) {
      const { smVarId: _staleSmVarId, ...params } = node.data.params;
      return { ...node, data: { ...node.data, params } };
    }
    if (smVarId === undefined && isRecord(node.parameters)) {
      const { smVarId: _staleSmVarId, ...parameters } = node.parameters;
      return { ...node, parameters };
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
    if (isCompleteXBBoundaryMapping(mapping)
      && targetKeys.has(targetKey(mapping.blockId, mapping.portId, mapping.direction))) {
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

/**
 * Restores legacy mappings that retained a variable and direction but lost
 * their boundary target. A target is inferred only when exactly one matching
 * Inport or Outport port exists; anything ambiguous remains untouched so the
 * model adapter can fail closed.
 */
export const repairLegacyXBBoundaryMappings = (
  input: unknown,
  validVariableIds: ReadonlySet<string>,
): XBLegacyBoundaryRepairResult => {
  if (!isRecord(input) || !Array.isArray(input.nodes) || !Array.isArray(input.mappings)) {
    return { model: input, diagnostics: [] };
  }

  const diagnostics: ModelDiagnostic[] = [];
  const targetsByDirection = {
    in: listXBBoundaryTargets(input.nodes, 'in'),
    out: listXBBoundaryTargets(input.nodes, 'out'),
  };
  const mappings = input.mappings.map((mapping, index) => {
    if (!isRecord(mapping)) return mapping;

    const smVarId = nonEmptyString(mapping.smVarId);
    const direction = mapping.direction;
    const blockId = nonEmptyString(mapping.blockId);
    const portId = nonEmptyString(mapping.portId);
    if (smVarId === null || (direction !== 'in' && direction !== 'out')) {
      return mapping;
    }
    if (blockId !== null && portId !== null) {
      return mapping;
    }

    if (!validVariableIds.has(smVarId)) {
      diagnostics.push({
        code: 'XB_MODEL_INVALID',
        message: `Mapping at index ${index} references unknown state-machine variable '${smVarId}'.`,
        severity: 'error',
      });
      return mapping;
    }

    const candidates = targetsByDirection[direction].filter((target) =>
      (blockId === null || target.blockId === blockId)
      && (portId === null || target.portId === portId));
    if (candidates.length !== 1) {
      const boundaryType = direction === 'in' ? 'input' : 'output';
      const blockType = direction === 'in' ? 'Inport' : 'Outport';
      diagnostics.push({
        code: 'XB_MODEL_INVALID',
        message: `Mapping at index ${index} cannot infer an ${boundaryType} boundary because ${candidates.length} compatible ${blockType} ports exist.`,
        severity: 'error',
      });
      return mapping;
    }

    return createXBBoundaryMapping(smVarId, candidates[0]);
  });

  const coveredBlocks = new Set<string>();
  const explicitDirections = new Set<'in' | 'out'>();
  for (const mapping of mappings) {
    if (!isRecord(mapping)) continue;
    if (mapping.direction === 'in' || mapping.direction === 'out') {
      explicitDirections.add(mapping.direction);
    }
    const blockId = nonEmptyString(mapping.blockId);
    const portId = nonEmptyString(mapping.portId);
    if (blockId !== null && portId !== null) coveredBlocks.add(blockId);
  }

  for (const value of input.nodes) {
    if (!isRecord(value)) continue;
    const blockId = nonEmptyString(value.id);
    if (blockId === null || coveredBlocks.has(blockId)) continue;
    const type = resolveNodeType(value);
    if (type !== 'Inport' && type !== 'Outport') continue;
    const smVarId = resolveSmVarId(value);
    if (smVarId === null || !validVariableIds.has(smVarId)) continue;
    const direction = type === 'Inport' ? 'in' : 'out';
    if (explicitDirections.has(direction)) continue;
    const candidates = listXBBoundaryTargets([value], direction);
    if (candidates.length !== 1) continue;
    mappings.push(createXBBoundaryMapping(smVarId, candidates[0]));
    coveredBlocks.add(blockId);
  }

  return {
    model: { ...input, mappings },
    diagnostics,
  };
};
