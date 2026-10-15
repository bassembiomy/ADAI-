/**
 * Lists the signals (ports) and parameters of an X-Bridges canvas so a scenario can stimulate or observe them (WP-03).
 * Reads both legacy React Flow nodes (`data.*`) and persisted nodes (`parameters.*`).
 */
import type { XBMappingV1 } from '../../utils/stateMachine/xbModel';
import { formatSimTarget } from './simTarget';

export interface XbInterfaceSignal {
  target: string;
  blockId: string;
  portId: string;
  name: string;
  portDirection: 'input' | 'output';
  direction: 'stimulus' | 'observe';
  signalType?: string;
  dataType?: string;
  unit?: string;
  width: number;
  connected: boolean;
  boundVariable?: { smVarId: string; direction: 'in' | 'out' };
}
export interface XbInterfaceParameter { target: string; blockId: string; name: string; value: unknown }
export interface XbInterface { canvas: string; signals: XbInterfaceSignal[]; parameters: XbInterfaceParameter[] }

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);

function widthOf(dimensions: unknown): number {
  if (!Array.isArray(dimensions) || dimensions.length === 0) return 1;
  let w = 1;
  for (const d of dimensions) {
    if (typeof d !== 'number' || !Number.isFinite(d)) return 1;
    w *= d;
  }
  return w;
}

export function extractXbInterface(input: {
  canvas: string;
  nodes: readonly unknown[];
  edges?: readonly unknown[];
  mappings?: readonly XBMappingV1[];
}): XbInterface {
  const { canvas } = input;
  const wired = new Set<string>();
  const wire = (blockId: unknown, portId: unknown): void => {
    const b = str(blockId);
    const p = str(portId);
    if (b !== null && p !== null) wired.add(`${b}\u0000${p}`);
  };
  for (const e of input.edges ?? []) {
    if (!isRec(e)) continue;
    wire(e.source, e.sourceHandle);
    wire(e.target, e.targetHandle);
    wire(e.sourceNodeId, e.sourcePortId);
    wire(e.targetNodeId, e.targetPortId);
  }

  const signals: XbInterfaceSignal[] = [];
  const parameters: XbInterfaceParameter[] = [];

  for (const raw of input.nodes) {
    if (!isRec(raw)) continue;
    const blockId = str(raw.id);
    if (blockId === null) continue;
    const data = isRec(raw.data) ? raw.data : undefined;
    const persisted = isRec(raw.parameters) ? raw.parameters : undefined;
    const type = (data && str(data.type)) ?? (str(raw.type) !== 'xblock' ? str(raw.type) : null);
    const label = (data && (str(data.label) ?? str(data.name))) ?? str(raw.label) ?? type ?? blockId;

    const portSource = persisted ?? data;
    for (const collection of ['inputs', 'outputs'] as const) {
      const list = portSource?.[collection];
      if (!Array.isArray(list)) continue;
      const isInput = collection === 'inputs';
      for (const p of list) {
        if (!isRec(p)) continue;
        const portId = str(p.id);
        if (portId === null) continue;
        const signal: XbInterfaceSignal = {
          target: formatSimTarget({ domain: 'xb', canvas, kind: 'port', blockId, portId }),
          blockId,
          portId,
          name: `${label}.${str(p.name) ?? portId}`,
          portDirection: isInput ? 'input' : 'output',
          direction: isInput ? 'stimulus' : 'observe',
          width: widthOf(p.dimensions),
          connected: wired.has(`${blockId}\u0000${portId}`),
        };
        const signalType = str(p.type);
        if (signalType !== null) signal.signalType = signalType;
        const dataType = str(p.dataType);
        if (dataType !== null) signal.dataType = dataType;
        const unit = str(p.unit);
        if (unit !== null) signal.unit = unit;
        const m = input.mappings?.find(x => x.blockId === blockId && x.portId === portId);
        if (m) signal.boundVariable = { smVarId: m.smVarId, direction: m.direction };
        signals.push(signal);
      }
    }

    const seen = new Set<string>();
    const addParams = (src: Rec, skip: readonly string[]): void => {
      for (const key of Object.keys(src)) {
        if (key.length === 0 || skip.includes(key) || seen.has(key)) continue;
        seen.add(key);
        parameters.push({
          target: formatSimTarget({ domain: 'xb', canvas, kind: 'param', blockId, name: key }),
          blockId,
          name: `${label}.${key}`,
          value: src[key],
        });
      }
    };
    if (data && isRec(data.params)) addParams(data.params, []);
    if (persisted) addParams(persisted, ['inputs', 'outputs', 'smVarId']);
  }

  return { canvas, signals, parameters };
}
