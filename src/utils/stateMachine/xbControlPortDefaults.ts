import type { XBEdgeV1, XBNodeV1, XBPersistedModelV1 } from './xbModel';

/**
 * Control input ports with a default value (Simulink: Enable/Reset of a PID block) may stay unconnected.
 * The default comes from the persisted port (`type: 'control'` with a numeric/boolean `value`) or, for ports of
 * models persisted without it, from the block type's contract. Data inputs never have a default.
 */
const TYPE_PORT_DEFAULTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  PID_BASIC: { enable: 1, reset: 0 },
  PID_CONTROLLER: { enable: 1, reset: 0 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const defaultForPort = (node: XBNodeV1, port: Record<string, unknown>): number | null => {
  const id = port.id;
  if (typeof id !== 'string') return null;
  if (port.type === 'control' && (typeof port.value === 'number' || typeof port.value === 'boolean')) {
    return Number(port.value);
  }
  if (port.type !== undefined && port.type !== 'control' && port.type !== 'auto') return null;
  const fromType = TYPE_PORT_DEFAULTS[node.type]?.[id];
  return fromType ?? null;
};

/**
 * Drive every undriven scalar control input that has a default with a generated Constant, so the validator,
 * the semantic model, the interpreter and the generated C all use the default value.
 */
export const materializeXBControlPortDefaults = (model: XBPersistedModelV1): XBPersistedModelV1 => {
  const driven = new Set<string>();
  for (const edge of model.edges) driven.add(`${edge.targetNodeId}:${edge.targetPortId}`);
  for (const mapping of model.mappings) {
    if (mapping.direction === 'in') driven.add(`${mapping.blockId}:${mapping.portId}`);
  }
  const usedIds = new Set<string>(model.nodes.map((node) => node.id));
  const extraNodes: XBNodeV1[] = [];
  const extraEdges: XBEdgeV1[] = [];

  for (const node of model.nodes) {
    const inputs = node.parameters.inputs;
    if (!Array.isArray(inputs)) continue;
    for (const raw of inputs) {
      if (!isRecord(raw) || typeof raw.id !== 'string') continue;
      if (raw.direction !== undefined && raw.direction !== 'input') continue;
      if (raw.shape !== undefined && raw.shape !== 'scalar') continue;
      if (driven.has(`${node.id}:${raw.id}`)) continue;
      const value = defaultForPort(node, raw);
      if (value === null) continue;

      let constantId = `${node.id}$default_${raw.id}`;
      while (usedIds.has(constantId)) constantId += '_';
      usedIds.add(constantId);
      const outputPort: Record<string, unknown> = { id: 'out', direction: 'output', shape: 'scalar' };
      if (raw.dataType !== undefined) outputPort.dataType = raw.dataType;
      if (raw.numericType !== undefined) outputPort.numericType = raw.numericType;
      extraNodes.push({
        id: constantId,
        type: 'Constant',
        ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
        parameters: { value, inputs: [], outputs: [outputPort] },
      } as unknown as XBNodeV1);
      extraEdges.push({
        id: `${constantId}$edge`,
        sourceNodeId: constantId,
        sourcePortId: 'out',
        targetNodeId: node.id,
        targetPortId: raw.id,
      } as XBEdgeV1);
    }
  }
  if (extraNodes.length === 0) return model;
  return { ...model, nodes: [...model.nodes, ...extraNodes], edges: [...model.edges, ...extraEdges] };
};
