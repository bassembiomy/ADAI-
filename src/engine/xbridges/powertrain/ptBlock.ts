// Uniform block construction from a PtBlockSpec. Must not import BlockDefinitions.ts.
import type { XBlock, XPort, XValue } from '../types';
import { VectorUtils } from '../VectorUtils';
import { validateParams } from './ptMath';
import type { PtBlockSpec, PtPortSpec } from './ptSpec';

export interface PtPorts { inputs: PtPortSpec[]; outputs: PtPortSpec[] }
type Params = Record<string, any>;

export interface PtBlockImpl {
  init?(p: Params): any;
  execute(ins: XValue[], p: Params, state: any, t: number): { outputs: XValue[]; nextState?: any; error?: string };
  derivatives?(ins: XValue[], p: Params, state: any, t: number): any;
  zeroCrossings?(ins: XValue[], p: Params, state: any, t: number): number[];
  portsFor?(p: Params): PtPorts;
}

const isBusPort = (p: PtPortSpec): boolean => p.unit === 'bus' || (p.dataType?.startsWith('Bus') ?? false);

export function resolvePtParams(spec: PtBlockSpec, given: Params | undefined): Params {
  const out: Params = {};
  for (const ps of spec.params) {
    const def = ps.default;
    out[ps.name] = Array.isArray(def) ? structuredClone(def) : def;
  }
  for (const [k, raw] of Object.entries(given ?? {})) {
    const ps = spec.params.find(x => x.name === k);
    if (ps && (ps.kind === 'vector' || ps.kind === 'table') && typeof raw === 'string') {
      out[k] = VectorUtils.parseMatlabArray(raw);
    } else if (ps && ps.kind === 'scalar' && typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
      out[k] = Number(raw);
    } else {
      out[k] = raw;
    }
  }
  return out;
}

function portSpecsFor(spec: PtBlockSpec, impl: PtBlockImpl, p: Params): PtPorts {
  if (spec.variants) {
    const v = spec.variants.ports[String(p[spec.variants.param])];
    if (v) return v;
  }
  if (impl.portsFor) return impl.portsFor(p);
  return { inputs: spec.inputs, outputs: spec.outputs };
}

const byIndex = (ps: PtPortSpec[]) => [...ps].sort((a, b) => a.simulinkIndex - b.simulinkIndex);

function buildPort(s: PtPortSpec): XPort {
  const bus = isBusPort(s);
  return {
    id: s.id, name: s.name, type: 'auto', direction: s.direction,
    value: bus && s.direction === 'output' ? {} : 0,
    position: s.direction === 'input' ? 'left' : 'right',
    unit: s.unit,
    ...(s.dimensions ? { dimensions: [...s.dimensions] } : {}),
    ...(bus && s.dataType ? { dataType: s.dataType } : {}),
  };
}

const zeroOutputs = (outs: PtPortSpec[]): XValue[] => byIndex(outs).map(o => (isBusPort(o) ? {} : 0));

function nonFinitePath(v: unknown): boolean {
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(nonFinitePath);
  if (v !== null && typeof v === 'object') return Object.values(v as object).some(nonFinitePath);
  return false;
}

function zeroLike(v: any): any {
  if (typeof v === 'number') return 0;
  if (Array.isArray(v)) return v.map(zeroLike);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, zeroLike(x)]));
  return v;
}

export function definePtBlock(spec: PtBlockSpec, impl: PtBlockImpl): (id: string, params?: Params) => XBlock {
  return (id, given) => {
    const params = resolvePtParams(spec, given);
    const ports = portSpecsFor(spec, impl, params);
    const cache = new WeakMap<object, { rp: Params; bad: string | null }>();
    const check = (runtime: Params): { rp: Params; bad: string | null } => {
      const key = runtime as object | null | undefined;
      const hit = key !== null && typeof key === 'object' ? cache.get(key) : undefined;
      if (hit) return hit;
      const rp = resolvePtParams(spec, runtime);
      const entry = { rp, bad: validateParams(spec.params, rp) };
      if (key !== null && typeof key === 'object') cache.set(key, entry);
      return entry;
    };
    let initState: any;
    if (impl.init) {
      try { initState = impl.init(params); } catch { initState = undefined; }
    }

    const block: XBlock = {
      id, type: spec.type, params,
      inputs: byIndex(ports.inputs).map(buildPort),
      outputs: byIndex(ports.outputs).map(buildPort),
      state: initState,
      isStateful: spec.states.length > 0,
      directFeedthrough: ports.inputs.some(p => p.feedthrough ?? true),
      equation: spec.equations.join('; '),
      description: spec.description,
      icon: 'box',
      execute: (ins, p, state, t) => {
        const { rp, bad } = check(p);
        const outs = byIndex(portSpecsFor(spec, impl, rp).outputs);
        if (bad) return { outputs: zeroOutputs(outs), error: bad };
        let r: ReturnType<PtBlockImpl['execute']>;
        try {
          r = impl.execute(ins, rp, state, t);
        } catch (e) {
          return { outputs: zeroOutputs(outs), error: e instanceof Error ? e.message : String(e) };
        }
        if (r.error) return { outputs: zeroOutputs(outs), error: r.error };
        for (let i = 0; i < r.outputs.length; i++) {
          if (nonFinitePath(r.outputs[i])) {
            return { outputs: zeroOutputs(outs), error: `Output ${outs[i]?.name ?? i} is not finite` };
          }
        }
        return r;
      },
    };
    if (impl.derivatives) {
      block.evaluateDerivatives = (ins, p, state, t) => {
        const { rp, bad } = check(p);
        if (bad) return zeroLike(state);
        return impl.derivatives!(ins, rp, state, t);
      };
    }
    if (impl.zeroCrossings) {
      block.ZeroCrossingFn = (ins, p, state, t) => {
        const { rp, bad } = check(p);
        if (bad) return [];
        return impl.zeroCrossings!(ins, rp, state, t);
      };
    }
    return block;
  };
}
