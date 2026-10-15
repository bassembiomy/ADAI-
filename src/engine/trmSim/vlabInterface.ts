// WP-04: static V-Lab interface (signals, conserving ports, parameters) of a canvas. Contract: plan §2.2
import { blockTypeOf, libraryBlock, portIdFromHandle } from '../vlab/vlabConnectionRules';
import type { VLabPort } from '../../utils/vlabLibrary';
import { formatChannelLabel } from '../../utils/scopeUtils';
import { formatSimTarget } from './simTarget';

export interface VlabQuantity { quantity: string; unit: string }
export interface VlabInterfaceSignal {
  target: string; blockId: string; portId: string; name: string;
  kind: 'signal' | 'conserving'; direction: 'stimulus' | 'observe'; domain: string;
  quantity?: string; unit?: string; across?: VlabQuantity; through?: VlabQuantity;
  width: number; channelNames: string[]; connected: boolean;
}
export interface VlabInterfaceParameter {
  target: string; blockId: string; key: string; name: string; value: number | string | undefined;
  unit?: string; min?: number; max?: number; exclusiveMin?: boolean; exclusiveMax?: boolean; nonZero?: boolean;
}
export interface VlabInterfaceDiagnostic { code: 'UNKNOWN_BLOCK'; blockId: string; message: string }
export interface VlabInterface {
  canvas: string; signals: VlabInterfaceSignal[]; parameters: VlabInterfaceParameter[]; diagnostics: VlabInterfaceDiagnostic[];
}

const CONSERVING: Record<string, { across: VlabQuantity; through: VlabQuantity }> = {
  electrical: { across: { quantity: 'voltage', unit: 'V' }, through: { quantity: 'current', unit: 'A' } },
  rotational: { across: { quantity: 'angular velocity', unit: 'rad/s' }, through: { quantity: 'torque', unit: 'N*m' } },
  translational: { across: { quantity: 'velocity', unit: 'm/s' }, through: { quantity: 'force', unit: 'N' } },
  thermal: { across: { quantity: 'temperature', unit: 'K' }, through: { quantity: 'heat flow', unit: 'W' } },
  magnetic: { across: { quantity: 'magnetomotive force', unit: 'A' }, through: { quantity: 'flux rate', unit: 'Wb/s' } },
  gas: { across: { quantity: 'pressure', unit: 'Pa' }, through: { quantity: 'mass flow', unit: 'kg/s' } },
  fluid: { across: { quantity: 'pressure', unit: 'Pa' }, through: { quantity: 'mass flow', unit: 'kg/s' } },
  'isothermal liquid': { across: { quantity: 'pressure', unit: 'Pa' }, through: { quantity: 'mass flow', unit: 'kg/s' } },
};

const unwrap = (v: unknown): number | string | undefined => {
  if (v !== null && typeof v === 'object' && 'value' in (v as any)) return unwrap((v as any).value);
  return typeof v === 'number' || typeof v === 'string' ? v : undefined;
};

export function extractVlabInterface(input: { canvas: string; nodes: readonly unknown[]; edges?: readonly unknown[] }): VlabInterface {
  const { canvas } = input;
  const edges = (input.edges ?? []) as any[];
  const out: VlabInterface = { canvas, signals: [], parameters: [], diagnostics: [] };

  for (const raw of input.nodes) {
    const node = raw as any;
    if (!node || typeof node.id !== 'string') continue;
    const blockId: string = node.id;
    const block = libraryBlock(blockTypeOf(node));
    if (!block) {
      out.diagnostics.push({ code: 'UNKNOWN_BLOCK', blockId, message: `Block "${blockId}" (type "${blockTypeOf(node)}") is not in the V-Lab library` });
      continue;
    }
    const data = node.data ?? {};
    const label: string = data.label || data.name || block.name || blockId;

    const ports: VLabPort[] = [...block.ports];
    if (Array.isArray(data.ports)) {
      for (const p of data.ports) if (p && typeof p.id === 'string' && !ports.some(q => q.id === p.id)) ports.push(p);
    }

    for (const port of ports) {
      const touches = edges.some(e =>
        (e.source === node.id && portIdFromHandle(node, e.sourceHandle) === port.id) ||
        (e.target === node.id && portIdFromHandle(node, e.targetHandle) === port.id));
      const isSignal = port.domain === 'Physical' || port.direction !== undefined;
      const domain = port.domain ?? '';
      const sig: VlabInterfaceSignal = {
        target: formatSimTarget({ domain: 'vlab', canvas, kind: 'port', blockId, portId: port.id }),
        blockId, portId: port.id,
        name: formatChannelLabel(label, port.label ?? port.id, port.quantity, port.unit),
        kind: isSignal ? 'signal' : 'conserving',
        direction: isSignal && port.direction === 'in' ? 'stimulus' : 'observe',
        domain,
        width: port.width ?? 1,
        channelNames: port.channelNames ?? [],
        connected: touches,
      };
      if (isSignal) {
        if (port.quantity !== undefined) sig.quantity = port.quantity;
        if (port.unit !== undefined) sig.unit = port.unit;
      } else {
        const c = CONSERVING[domain.toLowerCase()];
        if (c) { sig.across = { ...c.across }; sig.through = { ...c.through }; }
      }
      out.signals.push(sig);
    }

    const instParams: Record<string, unknown> = data.params && typeof data.params === 'object' ? data.params : {};
    const keys = [...Object.keys(block.params ?? {})];
    for (const k of Object.keys(instParams)) if (!keys.includes(k)) keys.push(k);
    for (const key of keys) {
      const spec = block.params?.[key];
      const value = Object.prototype.hasOwnProperty.call(instParams, key) ? unwrap(instParams[key]) : spec?.value;
      const p: VlabInterfaceParameter = {
        target: formatSimTarget({ domain: 'vlab', canvas, kind: 'param', blockId, name: key }),
        blockId, key,
        name: spec && spec.unit ? `${label}.${spec.label} [${spec.unit}]` : `${label}.${spec?.label ?? key}`,
        value,
      };
      if (spec) {
        if (spec.unit) p.unit = spec.unit;
        if (spec.min !== undefined) p.min = spec.min;
        if (spec.max !== undefined) p.max = spec.max;
        if (spec.exclusiveMin !== undefined) p.exclusiveMin = spec.exclusiveMin;
        if (spec.exclusiveMax !== undefined) p.exclusiveMax = spec.exclusiveMax;
        if (spec.nonZero !== undefined) p.nonZero = spec.nonZero;
      }
      out.parameters.push(p);
    }
  }
  return out;
}
