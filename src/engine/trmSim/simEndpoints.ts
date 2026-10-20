/**
 * Project-level simulation endpoints (WP-05): the `sim:` ids a requirement can be linked to,
 * derived from a project payload or from live app state.
 */
import type { ExternalSemanticEndpoint } from '../sysml/semanticEndpointIndex';
import { projectStateEndpoints } from '../sysml/workers/projectIoPayload';
import { buildSimExternalElements, type SimModelSources } from './simExternalElements';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function projectSimSources(payload: unknown): SimModelSources {
  const p: Rec = isRec(payload) ? payload : {};
  const states = arr(p.states).filter(isRec);
  const sources: SimModelSources = {
    stateMachine: {
      states: states as any,
      junctions: arr(p.junctions).filter(isRec) as any,
      transitions: arr(p.transitions).filter(isRec) as any,
      variables: arr(p.variables).filter(isRec) as any,
    },
  };
  const xbridges: { canvas: string; nodes: readonly unknown[] }[] = [];
  const globalNodes = arr(p.globalXBridgesNodes);
  if (globalNodes.length > 0) xbridges.push({ canvas: 'global', nodes: globalNodes });
  for (const s of states) {
    if (s.isXBridges !== true || typeof s.id !== 'string' || !isRec(s.xBridgesModel)) continue;
    const nodes = arr(s.xBridgesModel.nodes);
    if (nodes.length > 0) xbridges.push({ canvas: `state:${s.id}`, nodes });
  }
  if (xbridges.length > 0) sources.xbridges = xbridges;
  const vlabNodes = arr(p.vlabNodes);
  if (vlabNodes.length > 0) sources.vlab = [{ canvas: 'global', nodes: vlabNodes }];
  return sources;
}

export function buildSimEndpoints(sources: SimModelSources): Map<string, ExternalSemanticEndpoint> {
  const out = new Map<string, ExternalSemanticEndpoint>();
  for (const e of buildSimExternalElements(sources)) {
    if (e.id.startsWith('sim:')) out.set(e.id, { id: e.id, name: e.name, family: 'simulationTarget' });
  }
  return out;
}

export function projectExternalEndpoints(payload: unknown): Map<string, ExternalSemanticEndpoint> {
  const merged = projectStateEndpoints(isRec(payload) ? payload.states : undefined);
  for (const [id, e] of buildSimEndpoints(projectSimSources(payload))) merged.set(id, e);
  return merged;
}

export function projectExternalEndpointSignature(payload: unknown): string {
  return JSON.stringify([...projectExternalEndpoints(payload)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
