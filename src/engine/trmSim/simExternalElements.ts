/**
 * Builds the external-element list the traceability index links requirements to (WP-01):
 * state-machine states/junctions/transitions/variables plus X-Bridges and V-Lab blocks, ports and parameters.
 */
import type { TraceabilityExternalElement } from '../sysml/traceabilityIndex';
import { blockTypeOf, libraryBlock } from '../vlab/vlabConnectionRules';
import { formatChannelLabel } from '../../utils/scopeUtils';
import { formatSimTarget } from './simTarget';

export interface SimModelSources {
  stateMachine?: {
    states: { id: string; name?: string }[];
    junctions: { id: string; name?: string; type?: string }[];
    transitions: { id: string; sourceId: string; targetId: string }[];
    variables: { id: string; name?: string }[];
  };
  xbridges?: { canvas: string; nodes: readonly unknown[] }[];
  vlab?: { canvas: string; nodes: readonly unknown[] }[];
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);

export function buildSimExternalElements(sources: SimModelSources): TraceabilityExternalElement[] {
  const out: TraceabilityExternalElement[] = [];
  const seen = new Set<string>();
  const push = (id: string, name: string, kind: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, name, kind });
  };

  const sm = sources.stateMachine;
  if (sm) {
    const names = new Map<string, string>();
    for (const s of sm.states) {
      const n = str(s.name) ?? s.id;
      names.set(s.id, n);
      push(s.id, n, 'state');
    }
    for (const j of sm.junctions) {
      const n = str(j.name) ?? j.id;
      names.set(j.id, n);
      push(j.id, n, str(j.type) ?? 'pseudostate');
    }
    for (const t of sm.transitions) {
      const name = `${names.get(t.sourceId) ?? t.sourceId} → ${names.get(t.targetId) ?? t.targetId}`;
      push(formatSimTarget({ domain: 'sm', kind: 'transition', id: t.id }), name, 'transition');
    }
    for (const v of sm.variables) {
      push(formatSimTarget({ domain: 'sm', kind: 'variable', id: v.id }), str(v.name) ?? v.id, 'variable');
    }
  }

  for (const canvas of sources.xbridges ?? []) {
    for (const raw of canvas.nodes) {
      if (!isRec(raw)) continue;
      const blockId = str(raw.id);
      if (blockId === null) continue;
      const data = isRec(raw.data) ? raw.data : undefined;
      const parameters = isRec(raw.parameters) ? raw.parameters : undefined;
      const type = (data && str(data.type)) ?? (str(raw.type) !== 'xblock' ? str(raw.type) : null);
      const label = (data && (str(data.label) ?? str(data.name))) ?? str(raw.label) ?? type ?? blockId;
      push(formatSimTarget({ domain: 'xb', canvas: canvas.canvas, kind: 'block', blockId }), label, 'xbridgesBlock');

      const portSource = parameters ?? data;
      for (const collection of ['inputs', 'outputs'] as const) {
        const list = portSource?.[collection];
        if (!Array.isArray(list)) continue;
        for (const p of list) {
          if (!isRec(p)) continue;
          const portId = str(p.id);
          if (portId === null) continue;
          push(
            formatSimTarget({ domain: 'xb', canvas: canvas.canvas, kind: 'port', blockId, portId }),
            `${label}.${str(p.name) ?? portId}`,
            'xbridgesPort',
          );
        }
      }

      const paramKeys: string[] = [];
      if (data && isRec(data.params)) paramKeys.push(...Object.keys(data.params));
      if (isRec(raw.params)) paramKeys.push(...Object.keys(raw.params));
      if (parameters) paramKeys.push(...Object.keys(parameters));
      for (const name of paramKeys) {
        if (name === 'inputs' || name === 'outputs' || name.length === 0) continue;
        push(formatSimTarget({ domain: 'xb', canvas: canvas.canvas, kind: 'param', blockId, name }), `${label}.${name}`, 'xbridgesParameter');
      }
    }
  }

  for (const canvas of sources.vlab ?? []) {
    for (const raw of canvas.nodes) {
      if (!isRec(raw)) continue;
      const blockId = str(raw.id);
      if (blockId === null) continue;
      const data = isRec(raw.data) ? raw.data : undefined;
      const lib = libraryBlock(blockTypeOf({ id: blockId, type: str(raw.type) ?? undefined, data }));
      const label = (data && (str(data.label) ?? str(data.name))) ?? lib?.name ?? blockId;
      push(formatSimTarget({ domain: 'vlab', canvas: canvas.canvas, kind: 'block', blockId }), label, 'vlabBlock');

      const ports: { id: string; label?: string; quantity?: string; unit?: string }[] = [...(lib?.ports ?? [])];
      if (data && Array.isArray(data.ports)) {
        for (const p of data.ports) {
          if (!isRec(p)) continue;
          const id = str(p.id);
          if (id === null || ports.some(q => q.id === id)) continue;
          ports.push({ id, label: str(p.label) ?? undefined, quantity: str(p.quantity) ?? undefined, unit: str(p.unit) ?? undefined });
        }
      }
      for (const p of ports) {
        push(
          formatSimTarget({ domain: 'vlab', canvas: canvas.canvas, kind: 'port', blockId, portId: p.id }),
          formatChannelLabel(label, p.label ?? p.id, p.quantity, p.unit),
          'vlabPort',
        );
      }

      const keys = new Set<string>(Object.keys(lib?.params ?? {}));
      if (data && isRec(data.params)) Object.keys(data.params).forEach(k => keys.add(k));
      for (const name of keys) {
        if (name.length === 0) continue;
        const spec = lib?.params[name];
        const display = spec && spec.unit ? `${label}.${spec.label} [${spec.unit}]` : `${label}.${spec?.label ?? name}`;
        push(formatSimTarget({ domain: 'vlab', canvas: canvas.canvas, kind: 'param', blockId, name }), display, 'vlabParameter');
      }
    }
  }
  return out;
}
