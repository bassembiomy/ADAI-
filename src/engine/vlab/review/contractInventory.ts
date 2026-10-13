/**
 * Shared V-Lab contract-inventory primitives (WP-01 inventory script, WP-03 contract tests).
 * Read-only analysis: source parsing of DAEAssembler/VLabSymbols and Proxy-recorded
 * equation traces. No side effects at import time.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node } from '@xyflow/react';
import { blockEquations, type BlockEquationArgs } from '../vlabEquations';
import { DAEAssembler } from '../DAEAssembler';
import type { VLabBlock } from '../../../utils/vlabLibrary';
import { widthOf } from '../vlabVectorPorts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const readSource = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// ── DAEAssembler: the single `switch (blockType)` that allocates branches/states ──
export interface DaeCase { branches: string[]; states: string[]; }

export function parseDae(): Map<string, DaeCase> {
  const lines = readSource('src/engine/vlab/DAEAssembler.ts').split('\n');
  const start = lines.findIndex(l => /switch \(blockType\) \{/.test(l));
  const map = new Map<string, DaeCase>();
  let labels: string[] = [];
  let body: string[] = [];
  const flush = () => {
    if (!labels.length) return;
    const text = body.join('\n');
    const branches = [...text.matchAll(/branches\.push\(\{ name: ([^,]+),/g)].map(m => m[1].replace(/['"`]/g, ''));
    const states = [...text.matchAll(/states\.push\(([^)]*)\)/g)]
      .flatMap(m => m[1].split(',').map(s => s.trim().replace(/['"`]/g, '')).filter(Boolean));
    for (const l of labels) map.set(l, { branches, states });
    labels = []; body = [];
  };
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^default:/.test(t)) { flush(); break; }
    const m = t.match(/^case '([^']+)':\s*(\{)?$/);
    if (m) {
      if (body.length) flush();
      labels.push(m[1]);
    } else if (labels.length) body.push(lines[i]);
  }
  flush();
  return map;
}

/** Every `case '<id>':` label of the allocation switch, in source order (duplicates preserved). */
export function parseDaeCaseLabels(): string[] {
  const lines = readSource('src/engine/vlab/DAEAssembler.ts').split('\n');
  const start = lines.findIndex(l => /switch \(blockType\) \{/.test(l));
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^default:/.test(t)) break;
    const m = t.match(/^case '([^']+)':/);
    if (m) out.push(m[1]);
  }
  return out;
}

// ── VLabSymbols: type keys of RawSymbolRenderer's switch ──
export function parseSymbols(): Set<string> {
  const src = readSource('src/components/vlab/VLabSymbols.tsx');
  const a = src.indexOf('export const RawSymbolRenderer');
  const b = src.indexOf('export const UnknownSymbolGlyph');
  const seg = src.slice(a, b);
  return new Set([...seg.matchAll(/case '([^']+)':/g)].map(m => m[1]));
}

// ── Recording proxies ──
export interface Trace {
  across: Set<number>; dAcross: Set<number>;
  branch: Set<number>; dBranch: Set<number>;
  state: Set<number>; dState: Set<number>;
  params: Set<string>;
  /** the equation threw while being traced (reads are then incomplete) */
  threw: boolean;
}

/** `widths[i] > 1`: port i is a vector (WP-09c); the equation reads an array of that width, not a scalar. */
const idxProxy = (rec: Set<number>, widths: number[] = []) => new Proxy([] as any[], {
  get(_t, p) {
    if (typeof p === 'string' && /^\d+$/.test(p)) {
      rec.add(Number(p));
      const w = widths[Number(p)] ?? 1;
      return w > 1 ? new Array(w).fill(1) : 1;
    }
    if (p === 'length') return 16;
    if (p === Symbol.iterator) return function* () { for (let i = 0; i < 16; i++) { rec.add(i); yield 1; } };
    const v = (Array.prototype as any)[p as any];
    return typeof v === 'function' ? v.bind([1, 1, 1, 1, 1, 1, 1, 1]) : v;
  },
});

export function traceBlock(id: string, defaults: Record<string, any>, portIds: string[], widths: number[] = []): Trace | null {
  const fn = blockEquations[id];
  if (!fn) return null;
  const t: Trace = { across: new Set(), dAcross: new Set(), branch: new Set(), dBranch: new Set(), state: new Set(), dState: new Set(), params: new Set(), threw: false };
  const params = new Proxy({ ...defaults }, {
    get(target, p) { if (typeof p === 'string') { t.params.add(p); return (target as any)[p]; } return undefined; },
    has(target, p) { if (typeof p === 'string') t.params.add(p); return p in target; },
  });
  const ctx: any = { dt: 1e-3, time: 0, parameters: {}, prevStates: [], states: [], stateDerivatives: [], order: 1 };
  try {
    fn({
      across: idxProxy(t.across, widths), dAcross: idxProxy(t.dAcross, widths), branch: idxProxy(t.branch) as any, dBranch: idxProxy(t.dBranch) as any,
      state: idxProxy(t.state) as any, dState: idxProxy(t.dState) as any, ctx, params, ports: portIds, nodeId: id,
    } as any);
  } catch {
    t.threw = true;
  }
  return t;
}

export const sortedNums = (s: Set<number>) => [...s].sort((a, b) => a - b);

// ── Real DAEAssembler on a one-block system ──
export interface SingleBlockAssembly {
  assembled: boolean;
  error?: string;
  allocatedBranches: number;
  allocatedStates: number;
  /** ComponentEquation.equationCount for the block */
  equationCount: number;
  /** length of the array the equation factory returns for correctly sized args (-1 = threw / no factory) */
  residualLength: number;
  residualError?: string;
  /** rows of the equation result that are not finite at the nominal (all-zero) evaluation point (WP-09b, F-045) */
  nonFiniteRows: number[];
  systemSize: number;
  variableNames: string[];
  /** domain the assembler actually resolved for each library port (lower case), read from its Across variable names */
  portDomains: Record<string, string>;
}

export const libraryDefaults = (b: VLabBlock): Record<string, any> => {
  const d: Record<string, any> = {};
  for (const [k, v] of Object.entries(b.params || {})) d[k] = v.value;
  return d;
};

const FRAME_DOMAINS = new Set(['frame', 'multibodyframe']);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dutNode = (b: VLabBlock) =>
  ({ id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type: b.id, params: libraryDefaults(b), ports: b.ports } }) as unknown as Node;

/** Run `fn` with console.error/warn muted (the assembler logs on purpose for degenerate input). */
function quiet<T>(fn: () => T): T {
  const e = console.error; const w = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
}

function resolvePortDomains(b: VLabBlock, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of b.ports) {
    const re = new RegExp(`^Across_dut_${escRe(p.id)}(?:_(?:Px|Py|Pz|Rx|Ry|Rz|ch\\d+|ph[abc]))?_\\((.+)\\)$`);
    for (const n of names) {
      const m = n.match(re);
      if (m) { out[p.id] = m[1]; break; }
    }
  }
  return out;
}

/**
 * Assemble `[dut]` alone through the real DAEAssembler and compare what it allocated
 * with what the block's equation factory returns when handed arrays of exactly that size.
 */
export function assembleSingleBlock(b: VLabBlock): SingleBlockAssembly {
  const base: SingleBlockAssembly = {
    assembled: false, allocatedBranches: 0, allocatedStates: 0, equationCount: 0, residualLength: -1, nonFiniteRows: [], systemSize: 0, variableNames: [], portDomains: {},
  };
  try {
    const sys = quiet(() => new DAEAssembler().assemble([dutNode(b)], []));
    const comp = sys.components.find(c => c.blockId === 'dut');
    const names = sys.variableNames;
    const allocatedBranches = names.filter(n => n.startsWith('dut_branch_')).length;
    const allocatedStates = names.filter(n => n.startsWith('dut_state_')).length;
    const portDomains = resolvePortDomains(b, names);
    const out: SingleBlockAssembly = {
      ...base, assembled: true, allocatedBranches, allocatedStates, portDomains,
      equationCount: comp?.equationCount ?? 0, systemSize: sys.systemSize, variableNames: names,
    };
    const fn = blockEquations[b.id];
    if (fn) {
      const portIds = b.ports.map(p => p.id);
      const zeros = (n: number) => new Array(n).fill(0);
      const widthOfPort = (id: string) => widthOf(b.ports.find(p => p.id === id));
      const across = portIds.map(id => (FRAME_DOMAINS.has(portDomains[id] ?? '') ? zeros(6) : widthOfPort(id) > 1 ? zeros(widthOfPort(id)) : 0));
      const ctx: any = { dt: 1e-3, time: 0, parameters: {}, prevStates: zeros(sys.systemSize), states: zeros(sys.systemSize), stateDerivatives: zeros(sys.systemSize), order: 1 };
      try {
        const res = quiet(() => fn({
          across, dAcross: across.map(a => (Array.isArray(a) ? zeros(a.length) : 0)),
          branch: zeros(allocatedBranches), dBranch: zeros(allocatedBranches),
          state: zeros(allocatedStates), dState: zeros(allocatedStates),
          ctx, params: libraryDefaults(b), ports: portIds, nodeId: 'dut', connectedPorts: [],
        } as BlockEquationArgs));
        out.residualLength = Array.isArray(res) ? res.length : -1;
        if (Array.isArray(res)) out.nonFiniteRows = res.flatMap((v, i) => (typeof v === 'number' && Number.isFinite(v) ? [] : [i]));
      } catch (e: any) {
        out.residualError = String(e?.message ?? e);
      }
    }
    return out;
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e) };
  }
}

// ── Scope routing through the real assembler ──
export type ScopeRouting = 'ok' | 'unrouted' | 'dead-signal-node' | 'assembly-error';
export interface ScopeRoutingResult { routing: ScopeRouting; variable?: string; detail?: string; }

/**
 * Wire `dut.<portId>` to `scope.in1` exactly as the editor does (`<port>_s` -> `in1_t`), assemble, and
 * decide whether the scope channel is bound to a variable that carries this port's value:
 *  - a DUT branch variable (signal output branch), or
 *  - a conserving across node (potential/pressure/temperature/... of the connected net), or
 *  - a physical-signal node that is actually driven by a DUT signal branch.
 * A physical-signal node with no driving branch is pinned to 0 by the assembler: the scope reads a silent zero.
 */
export function routeToScope(b: VLabBlock, portId: string): ScopeRoutingResult {
  const scope = { id: 'scope', type: 'default', position: { x: 300, y: 0 }, data: { type: 'scope' } } as unknown as Node;
  const edge = { id: 'e', source: 'dut', sourceHandle: `${portId}_s`, target: 'scope', targetHandle: 'in1_t' } as any;
  try {
    const sys = quiet(() => new DAEAssembler().assemble([dutNode(b), scope], [edge]));
    // a width-N output is routed when EVERY component has a variable (WP-09c); component 0 alone is never enough
    const binding = sys.scopeChannels?.get('scope')?.[0];
    const comps = binding && binding.width > 1 ? binding.indices : [(sys.scopeOutputs.get('scope') ?? [])[0]];
    if (comps.some(i => i === undefined || i < 0)) return { routing: 'unrouted', detail: 'scope channel 1 has no variable' };
    const idx = comps[0];
    const name = sys.variableNames[idx];
    if (comps.every(i => sys.variableNames[i].startsWith('dut_branch_'))) return { routing: 'ok', variable: name };
    const m = name.match(/^Across_(.+?)(?:_(?:Px|Py|Pz|Rx|Ry|Rz|ch\d+|ph[abc]))?_\((.+)\)$/);
    if (!m) return { routing: 'unrouted', variable: name, detail: 'scope bound to a non-port variable' };
    const [, root, domain] = m;
    if (domain !== 'physical') return { routing: 'ok', variable: name };
    const kn = sys.kirchhoffNodes.find(k => k.nodeId === root);
    const driven = !!kn && kn.throughIndices.some(i => sys.variableNames[i].startsWith('dut_branch_'));
    return driven
      ? { routing: 'ok', variable: name }
      : { routing: 'dead-signal-node', variable: name, detail: 'physical-signal node has no driving DUT signal branch (reads constant 0)' };
  } catch (e: any) {
    return { routing: 'assembly-error', detail: String(e?.message ?? e) };
  }
}
