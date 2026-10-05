import { describe, it, expect, vi } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock, type VLabPort } from '../../../utils/vlabLibrary';
import { DAEAssembler } from '../DAEAssembler';
import { VLabPhysicsEngine } from '../vlabPhysics';
import {
  ANY_DOMAIN_BLOCKS, MEASUREMENT_SINK_BLOCKS, TRANSPARENT_BLOCKS, checkEdgeSet, validateConnection,
  type ConnectionResult, type RuleEdge, type RuleNode,
} from '../vlabConnectionRules';
import {
  SEMANTIC_OPTIONAL_INPUTS, TopologyValidationError, assertValidTopology, requiredPortsOf, validateTopology,
} from '../vlabTopologyValidation';
import {
  DERIVED_REQUIRED_CONSERVING_PORTS, DERIVED_REQUIRED_SIGNAL_INPUTS, ILL_POSED_CONSERVING_BLOCKS,
} from '../vlabRequiredPorts';
import { buildDomainFixture } from '../vlabDomainFixture';
import { buildContexts } from './contractChecks';
import { ANY_DOMAIN_BLOCKS as CONTRACT_ANY_BLOCKS } from './blockClassification';
import {
  CONFLICT_IS_INPUT, CONFLICT_IS_OUTPUT, DRIVEN_BY_NAME_BUT_INPUT, NO_DIRECTION_PORTS, READ_BUT_OUTPUT,
  SILENT_IS_INPUT, SILENT_IS_OUTPUT, resolveDirection, tracePortDirections,
} from './portDirections';
import { deriveRequiredTables } from './requiredPorts';
import { UNSUPPORTED_BLOCKS } from '../vlabStructure';
import { normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';
import { LEARNING_LABS, reconstructLabNodes } from '../../../components/vlab/VLabWorkspace';

/**
 * WP-07: deterministic connection validation (F-027, F-028, F-030).
 * Everything here goes through the ONE rules module (vlabConnectionRules); there is no second validator.
 */

const libBlocks: VLabBlock[] = VLAB_LIBRARY.flatMap(d => d.blocks);
const blockById = new Map(libBlocks.map(b => [b.id, b]));
const CONSERVING = ['electrical', 'thermal', 'translational', 'rotational', 'magnetic', 'gas', 'fluid', 'isothermal_liquid', 'frame'];

const canon = (d?: string) => { const x = (d ?? '').toLowerCase(); return x === 'multibodyframe' ? 'frame' : x; };
const isSpecialBlock = (id: string) => TRANSPARENT_BLOCKS.has(id) || ANY_DOMAIN_BLOCKS.has(id) || MEASUREMENT_SINK_BLOCKS.has(id);

// cons:<domain> | sig:out | sig:in | property | any | transparent, plus (WP-09c) a suffix ':wN' for a width-N signal port and
// ':composite' for a composite three-phase electrical port
type PortClass = string;
const classOf = (block: VLabBlock, p: VLabPort): PortClass => {
  if (TRANSPARENT_BLOCKS.has(block.id)) return 'transparent';
  const d = canon(p.domain);
  if (d === 'any') return 'any';
  const suffix = p.composite ? ':composite' : (p.width ?? 1) > 1 ? `:w${p.width}` : '';
  if (d === 'physical') return (p.direction === 'out' ? 'sig:out' : 'sig:in') + suffix;
  if (d === 'beltproperty') return 'property';
  return `cons:${d}${suffix}`;
};
const partsOf = (c: PortClass): { base: string; suffix: string } => {
  const m = c.match(/^(.*?)(:w\d+|:composite)?$/)!;
  return { base: m[1], suffix: m[2] ?? '' };
};

/** first ordinary port of each class found in the library (not on a special block) */
const REPS = new Map<PortClass, { block: VLabBlock; port: VLabPort }>();
for (const b of libBlocks) {
  if (isSpecialBlock(b.id)) continue;
  for (const p of b.ports) if (!REPS.has(classOf(b, p))) REPS.set(classOf(b, p), { block: b, port: p });
}
for (const id of ['ps_simulink_conv']) { const b = blockById.get(id)!; REPS.set('any', { block: b, port: b.ports[0] }); }
{ const b = blockById.get('solver_config')!; REPS.set('transparent', { block: b, port: b.ports[0] }); }

const mkNode = (id: string, type: string, extra: Record<string, any> = {}): RuleNode => ({ id, type: 'default', data: { type, label: `${type}#${id}`, ...extra } });
const h = (nodeId: string, portId: string) => `${nodeId}-${portId}`;

const connect = (a: { id: string; type: string; port: string }, b: { id: string; type: string; port: string }, edges: RuleEdge[] = [], extraNodes: RuleNode[] = []): ConnectionResult => {
  const nodes = [mkNode(a.id, a.type), mkNode(b.id, b.type), ...extraNodes];
  return validateConnection(nodes, edges, { source: a.id, sourceHandle: h(a.id, a.port), target: b.id, targetHandle: h(b.id, b.port) });
};

/** both drag directions must give the same answer */
const both = (a: { id: string; type: string; port: string }, b: { id: string; type: string; port: string }, edges: RuleEdge[] = [], extra: RuleNode[] = []) => {
  const ab = connect(a, b, edges, extra); const ba = connect(b, a, edges, extra);
  return { ab, ba };
};
const sameOutcome = (x: ConnectionResult, y: ConnectionResult) => {
  if (x.valid !== y.valid) return false;
  if (x.valid && y.valid) return JSON.stringify(x.edge) === JSON.stringify(y.edge) && x.duplicate === y.duplicate;
  if (!x.valid && !y.valid) return JSON.stringify(x.diagnostic) === JSON.stringify(y.diagnostic) && x.message === y.message;
  return false;
};

// ──────────────────────────────────────────────────────────────────────────
describe('F-030: signal direction metadata on Physical ports', () => {
  const contexts = buildContexts();

  it('every Physical port of a non-transparent block has a direction; no other port has one', () => {
    const missing: string[] = []; const stray: string[] = [];
    for (const b of libBlocks) for (const p of b.ports) {
      const key = `${b.id}.${p.id}`;
      const physical = canon(p.domain) === 'physical';
      if (physical && !p.direction && !(key in NO_DIRECTION_PORTS)) missing.push(key);
      if (!physical && p.direction) stray.push(key);
      if (physical && p.direction && key in NO_DIRECTION_PORTS) stray.push(`${key} (transparent port must stay undirected)`);
    }
    expect(missing).toEqual([]);
    expect(stray).toEqual([]);
  });

  it('library direction == equation-trace derivation + documented tier-2 decisions (ratchet, cannot drift)', () => {
    const wrong: string[] = []; let unresolved = 0; const counts = { in: 0, out: 0, none: 0, tier1: 0, tier2: 0 };
    for (const ctx of contexts) {
      for (const t of tracePortDirections(ctx)) {
        const want = resolveDirection(t);
        const have = ctx.block.ports.find(p => p.id === t.port)!.direction;
        if (want === undefined) { counts.none++; if (!(`${t.block}.${t.port}` in NO_DIRECTION_PORTS)) unresolved++; }
        else { counts[want]++; (t.verdict === want ? counts.tier1++ : counts.tier2++); }
        if (want !== have) wrong.push(`${t.block}.${t.port}: library ${have} vs derived ${want} (${t.verdict})`);
      }
    }
    expect(unresolved).toBe(0);
    expect(wrong).toEqual([]);
    // sanity: the table is not trivially empty and tier 1 (the equation) decides the large majority
    expect(counts.in).toBeGreaterThan(150); expect(counts.out).toBeGreaterThan(150); expect(counts.tier1).toBeGreaterThan(counts.tier2);
  });

  it('every tier-2 decision is still backed by the trace evidence it was made on (stale entries fail)', () => {
    const verdicts = new Map<string, string>();
    for (const ctx of contexts) for (const t of tracePortDirections(ctx)) verdicts.set(`${t.block}.${t.port}`, t.verdict);
    const check = (list: string[], expected: string[]) => list.filter(k => !expected.includes(verdicts.get(k) ?? 'missing')).map(k => `${k}: ${verdicts.get(k)}`);
    expect(check(CONFLICT_IS_INPUT, ['read+driven'])).toEqual([]);
    expect(check(CONFLICT_IS_OUTPUT, ['read+driven'])).toEqual([]);
    expect(check(DRIVEN_BY_NAME_BUT_INPUT, ['out'])).toEqual([]);
    expect(check(READ_BUT_OUTPUT, ['in'])).toEqual([]);
    expect(check(SILENT_IS_INPUT, ['silent'])).toEqual([]);
    expect(check(SILENT_IS_OUTPUT, ['silent'])).toEqual([]);
    expect(Object.keys(NO_DIRECTION_PORTS).filter(k => !verdicts.has(k))).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('connection rules: every class pair, both drag directions', () => {
  const classes = [...REPS.keys()].sort();

  it('the library yields every conserving domain, signal in/out, property, any and transparent', () => {
    for (const d of CONSERVING) expect(classes, `cons:${d}`).toContain(`cons:${d}`);
    expect(classes).toEqual(expect.arrayContaining(['sig:in', 'sig:out', 'property', 'any', 'transparent']));
  });

  const expectedCode = (a: PortClass, b: PortClass): string | 'ok' => {
    if (a === 'transparent' || b === 'transparent') return 'ok';
    // WP-09c: the Simulink-PS converters carry one scalar: a vector / composite port behind them is a width error
    if (a === 'any' || b === 'any') return (a === 'any' ? partsOf(b) : partsOf(a)).suffix ? 'width-mismatch' : 'ok';
    const pa = partsOf(a); const pb = partsOf(b);
    if (pa.base.startsWith('sig:') && pb.base.startsWith('sig:')) {
      if (pa.base === 'sig:out' && pb.base === 'sig:out') return 'output-to-output';
      if (pa.base === 'sig:in' && pb.base === 'sig:in') return 'input-to-input';
      return pa.suffix === pb.suffix ? 'ok' : 'width-mismatch'; // WP-09c: widths must match exactly
    }
    if (pa.base !== pb.base) return 'domain-mismatch';
    return pa.suffix === pb.suffix ? 'ok' : 'composite-mismatch'; // WP-09c: a composite port meets only a composite port
  };

  it('every domain x direction combination gives the documented answer, identically for A->B and B->A', () => {
    const bad: string[] = [];
    for (const ca of classes) for (const cb of classes) {
      const ra = REPS.get(ca)!; const rb = REPS.get(cb)!;
      const { ab, ba } = both({ id: 'A', type: ra.block.id, port: ra.port.id }, { id: 'B', type: rb.block.id, port: rb.port.id });
      const want = expectedCode(ca, cb);
      const got = ab.valid ? 'ok' : ab.diagnostic.code;
      if (got !== want) bad.push(`${ca} -> ${cb}: want ${want}, got ${got}`);
      if (!sameOutcome(ab, ba)) bad.push(`${ca} <-> ${cb}: A->B and B->A differ`);
    }
    expect(bad).toEqual([]);
  });

  it('the normalised edge puts the signal output at the source, whichever end the user dragged from', () => {
    const out = REPS.get('sig:out')!; const inp = REPS.get('sig:in')!;
    const { ab, ba } = both({ id: 'A', type: out.block.id, port: out.port.id }, { id: 'B', type: inp.block.id, port: inp.port.id });
    expect(ab.valid && ba.valid).toBe(true);
    if (ab.valid && ba.valid) {
      expect(ab.edge).toEqual({ source: 'A', sourceHandle: h('A', out.port.id), target: 'B', targetHandle: h('B', inp.port.id) });
      expect(ba.edge).toEqual(ab.edge);
    }
  });

  it('conserving ports are bidirectional: ordering is deterministic, fan-out is unlimited', () => {
    const r = REPS.get('cons:electrical')!;
    const wires: RuleEdge[] = [];
    const nodes: RuleNode[] = [mkNode('hub', r.block.id)];
    for (let i = 0; i < 6; i++) nodes.push(mkNode(`n${i}`, r.block.id));
    for (let i = 0; i < 6; i++) {
      const res = validateConnection(nodes, wires, { source: `n${i}`, sourceHandle: h(`n${i}`, r.port.id), target: 'hub', targetHandle: h('hub', r.port.id) });
      expect(res.valid).toBe(true);
      if (res.valid) wires.push({ id: `w${i}`, ...res.edge });
    }
    expect(wires).toHaveLength(6);
    expect(wires.every(w => w.target === 'hub' || w.source === 'hub')).toBe(true);
    expect(checkEdgeSet(nodes, wires)).toEqual([]);
  });

  it('handles written in the legacy `<port>_s/_t` form resolve to the same exact port', () => {
    const out = REPS.get('sig:out')!; const inp = REPS.get('sig:in')!;
    const nodes = [mkNode('A', out.block.id), mkNode('B', inp.block.id)];
    const legacy = validateConnection(nodes, [], { source: 'A', sourceHandle: `${out.port.id}_s`, target: 'B', targetHandle: `${inp.port.id}_t` });
    const editor = validateConnection(nodes, [], { source: 'A', sourceHandle: h('A', out.port.id), target: 'B', targetHandle: h('B', inp.port.id) });
    expect(legacy.valid && editor.valid).toBe(true);
    // ports whose real id ends in `_s` are not mangled (pmsm_foc.vdc_s)
    const foc = validateConnection([mkNode('src', 'ps_constant'), mkNode('foc', 'pmsm_foc')], [], { source: 'src', sourceHandle: 'y_s', target: 'foc', targetHandle: 'foc-vdc_s' });
    expect(foc.valid).toBe(true);
    if (foc.valid) expect(foc.edge.targetHandle).toBe('foc-vdc_s');
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('connection rules: every block\'s ports once, against a compatible and an incompatible counterpart', () => {
  const counterpartFor = (cls: PortClass, want: 'compatible' | 'incompatible' | 'width', block: VLabBlock): { cls: PortClass; code: string } | null => {
    if (cls === 'transparent' || cls === 'any') return null;
    const { base, suffix } = partsOf(cls);
    if (MEASUREMENT_SINK_BLOCKS.has(block.id) && base === 'sig:in') {
      // scope / probe input: only a signal output is compatible (of any width: one trace per channel)
      if (want === 'width') return null;
      return want === 'compatible' ? { cls: 'sig:out', code: 'ok' } : { cls: 'cons:electrical', code: 'scope-needs-measurable-output' };
    }
    if (want === 'width') {
      // WP-09c: the same wiring with a width (or composite-ness) that differs from this port's
      if (base === 'sig:out' || base === 'sig:in') return { cls: (base === 'sig:out' ? 'sig:in' : 'sig:out') + (suffix ? '' : ':w3'), code: 'width-mismatch' };
      if (base === 'cons:electrical') return { cls: suffix ? 'cons:electrical' : 'cons:electrical:composite', code: 'composite-mismatch' };
      return null;
    }
    if (base === 'sig:out') return want === 'compatible' ? { cls: 'sig:in' + suffix, code: 'ok' } : { cls: 'sig:out' + suffix, code: 'output-to-output' };
    if (base === 'sig:in') return want === 'compatible' ? { cls: 'sig:out' + suffix, code: 'ok' } : { cls: 'sig:in' + suffix, code: 'input-to-input' };
    if (base === 'property') return want === 'compatible' ? { cls: 'property', code: 'ok' } : { cls: 'cons:electrical', code: 'domain-mismatch' };
    return want === 'compatible' ? { cls, code: 'ok' } : { cls: base === 'cons:electrical' ? 'cons:thermal' : 'cons:electrical', code: 'domain-mismatch' };
  };

  it('compatible counterparts are accepted and incompatible ones rejected, with the same outcome in both drag directions', () => {
    const bad: string[] = []; let checked = 0;
    for (const b of libBlocks) for (const p of b.ports) {
      const cls = classOf(b, p);
      for (const want of ['compatible', 'incompatible', 'width'] as const) {
        const cp = counterpartFor(cls, want, b);
        if (!cp) continue;
        const rep = REPS.get(cp.cls);
        if (!rep) { bad.push(`no representative for ${cp.cls}`); continue; }
        checked++;
        const A = { id: 'dut', type: b.id, port: p.id }; const B = { id: 'peer', type: rep.block.id, port: rep.port.id };
        const { ab, ba } = both(A, B);
        const got = ab.valid ? 'ok' : ab.diagnostic.code;
        if (got !== cp.code) bad.push(`${b.id}.${p.id} (${cls}) vs ${cp.cls}: want ${cp.code}, got ${got}`);
        if (!sameOutcome(ab, ba)) bad.push(`${b.id}.${p.id} vs ${cp.cls}: A->B and B->A differ`);
        if (!ab.valid) {
          const d = ab.diagnostic;
          const ids = new Set(['dut', 'peer']);
          const portsOk = (d.blockId === 'dut' && d.portId === p.id) || (d.blockId === 'peer' && d.portId === rep.port.id);
          if (!ids.has(d.blockId) || !portsOk) bad.push(`${b.id}.${p.id}: diagnostic names ${d.blockId}.${d.portId}`);
          if (!d.reason || !d.expectedDomain || !d.actualDomain) bad.push(`${b.id}.${p.id}: diagnostic incomplete`);
          if (d.code === 'domain-mismatch' && d.expectedDomain === d.actualDomain) bad.push(`${b.id}.${p.id}: domain-mismatch with equal domains`);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(bad.slice(0, 20).join('\n')).toBe('');
  });

  it('the same domain is required case-insensitively on exact port ids (labels never matter)', () => {
    const a: RuleNode = { id: 'x', type: 'default', data: { type: 'custom_block_x', label: 'THERMAL (looks wrong)', ports: [{ id: 'q', domain: 'ELECTRICAL' }] } };
    const b: RuleNode = { id: 'y', type: 'default', data: { type: 'custom_block_y', label: 'Electrical', ports: [{ id: 'q', domain: 'electrical' }] } };
    const ok = validateConnection([a, b], [], { source: 'x', sourceHandle: 'x-q', target: 'y', targetHandle: 'y-q' });
    expect(ok.valid).toBe(true);
    const c: RuleNode = { id: 'z', type: 'default', data: { type: 'custom_block_z', label: 'Electrical', ports: [{ id: 'q', domain: 'Thermal' }] } };
    const bad = validateConnection([a, c], [], { source: 'x', sourceHandle: 'x-q', target: 'z', targetHandle: 'z-q' });
    expect(bad.valid).toBe(false);
    if (!bad.valid) expect(bad.diagnostic).toMatchObject({ code: 'domain-mismatch', expectedDomain: 'electrical', actualDomain: 'thermal' });
  });

  it('`Any` is accepted only on the documented allow-list (single source with the WP-03 contract)', () => {
    expect([...ANY_DOMAIN_BLOCKS].sort()).toEqual([...CONTRACT_ANY_BLOCKS].sort());
    const res = REPS.get('cons:electrical')!;
    const conv = connect({ id: 'r', type: res.block.id, port: res.port.id }, { id: 'c', type: 'ps_simulink_conv', port: 'in' });
    expect(conv.valid).toBe(true);
    const rogue: RuleNode = { id: 'g', type: 'default', data: { type: 'custom_gas_block', label: 'g', ports: [{ id: 'q', domain: 'Any' }] } };
    const bad = validateConnection([mkNode('r', res.block.id), rogue], [], { source: 'r', sourceHandle: h('r', res.port.id), target: 'g', targetHandle: 'g-q' });
    expect(bad.valid).toBe(false);
    if (!bad.valid) expect(bad.diagnostic.code).toBe('wildcard-not-allowed');
  });

  it('a port id that does not exist on a known block is rejected with a diagnostic naming block and port', () => {
    const r = connect({ id: 'r', type: 'resistor', port: 'nope' }, { id: 'g', type: 'ground', port: 'a' });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.diagnostic).toMatchObject({ blockId: 'r', portId: 'nope', code: 'unknown-port' });
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('signal fan-in / fan-out', () => {
  const nodes = [mkNode('c1', 'ps_constant'), mkNode('c2', 'ps_constant'), mkNode('g1', 'ps_gain'), mkNode('g2', 'ps_gain'), mkNode('add', 'ps_add')];
  const wire = (id: string, s: string, sp: string, t: string, tp: string): RuleEdge => ({ id, source: s, sourceHandle: h(s, sp), target: t, targetHandle: h(t, tp) });

  it('one output may drive many inputs', () => {
    const edges: RuleEdge[] = [wire('e1', 'c1', 'y', 'g1', 'u')];
    const res = validateConnection(nodes, edges, { source: 'c1', sourceHandle: h('c1', 'y'), target: 'g2', targetHandle: h('g2', 'u') });
    expect(res.valid).toBe(true);
    const more = validateConnection(nodes, edges, { source: 'c1', sourceHandle: h('c1', 'y'), target: 'add', targetHandle: h('add', 'u1') });
    expect(more.valid).toBe(true);
  });

  it('an input accepts exactly one source: the second is rejected in either drag direction, naming the input', () => {
    const edges: RuleEdge[] = [wire('e1', 'c1', 'y', 'g1', 'u')];
    const fwd = validateConnection(nodes, edges, { source: 'c2', sourceHandle: h('c2', 'y'), target: 'g1', targetHandle: h('g1', 'u') });
    const rev = validateConnection(nodes, edges, { source: 'g1', sourceHandle: h('g1', 'u'), target: 'c2', targetHandle: h('c2', 'y') });
    for (const r of [fwd, rev]) {
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.diagnostic).toMatchObject({ blockId: 'g1', portId: 'u', code: 'input-already-driven', otherBlockId: 'c2', otherPortId: 'y' });
    }
    expect(sameOutcome(fwd, rev)).toBe(true);
  });

  it('re-wiring the identical wire is an idempotent duplicate, not a second source', () => {
    const edges: RuleEdge[] = [wire('e1', 'c1', 'y', 'g1', 'u')];
    const again = validateConnection(nodes, edges, { source: 'g1', sourceHandle: h('g1', 'u'), target: 'c1', targetHandle: h('c1', 'y') });
    expect(again.valid).toBe(true);
    if (again.valid) expect(again.duplicate).toBe(true);
  });

  it('out->out and in->in are rejected', () => {
    expect(connect({ id: 'c1', type: 'ps_constant', port: 'y' }, { id: 'g1', type: 'ps_gain', port: 'y' }).valid).toBe(false);
    expect(connect({ id: 'g1', type: 'ps_gain', port: 'u' }, { id: 'g2', type: 'ps_gain', port: 'u' }).valid).toBe(false);
  });

  it('a loaded model with two sources on one input is flagged by the edge-set check (and only the extra wire)', () => {
    const edges: RuleEdge[] = [wire('e1', 'c1', 'y', 'g1', 'u'), wire('e2', 'c2', 'y', 'g1', 'u')];
    const d = checkEdgeSet(nodes, edges);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ blockId: 'g1', portId: 'u', code: 'input-already-driven', edgeId: 'e2' });
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('scope / probe inputs accept only measurable signal outputs', () => {
  const sinks: [string, string][] = [['scope', 'in1'], ['vlab_probe', 'in']];

  for (const [sinkType, sinkPort] of sinks) {
    it(`${sinkType}.${sinkPort}: accepts a Physical output, rejects conserving, Frame and signal-input ports`, () => {
      const sink = { id: 'sink', type: sinkType, port: sinkPort };
      const okOut = both(sink, { id: 's', type: 'v_sensor', port: 'v' });
      expect(okOut.ab.valid && okOut.ba.valid).toBe(true);
      expect(sameOutcome(okOut.ab, okOut.ba)).toBe(true);

      const rejects: [string, string, string][] = [
        ['resistor', 'p', 'electrical'], ['thermal_mass', 'a', 'thermal'], ['mass', 'p', 'translational'],
        ['world_frame', libraryBlock('world_frame').ports[0].id, 'frame'], ['ps_gain', 'u', 'physical'],
      ];
      for (const [type, port] of rejects) {
        const { ab, ba } = both(sink, { id: 'x', type, port });
        expect(ab.valid, `${type}.${port}`).toBe(false);
        if (!ab.valid) expect(ab.diagnostic.code).toBe('scope-needs-measurable-output');
        expect(sameOutcome(ab, ba), `${type}.${port}`).toBe(true);
      }
    });
  }

  it('a scope channel takes one source; the same channel cannot be wired twice, another channel can', () => {
    const nodes = [mkNode('sc', 'scope', { ports: [{ id: 'in1', domain: 'Physical' }, { id: 'in2', domain: 'Physical' }], params: { numSignals: { value: 2 } } }), mkNode('s1', 'v_sensor'), mkNode('s2', 'v_sensor')];
    const first = validateConnection(nodes, [], { source: 's1', sourceHandle: 's1-v', target: 'sc', targetHandle: 'sc-in1' });
    expect(first.valid).toBe(true);
    const edges: RuleEdge[] = [{ id: 'e1', source: 's1', sourceHandle: 's1-v', target: 'sc', targetHandle: 'sc-in1' }];
    const second = validateConnection(nodes, edges, { source: 's2', sourceHandle: 's2-v', target: 'sc', targetHandle: 'sc-in1' });
    expect(second.valid).toBe(false);
    const other = validateConnection(nodes, edges, { source: 's2', sourceHandle: 's2-v', target: 'sc', targetHandle: 'sc-in2' });
    expect(other.valid).toBe(true);
    // `in_2` (alias written by older tests/files) is the same channel as in2
    const alias = validateConnection(nodes, edges, { source: 's2', sourceHandle: 's2-v', target: 'sc', targetHandle: 'in_2_t' });
    expect(alias.valid).toBe(true);
  });

  it('domain-transparent blocks (solver_config, conn_label) join any network', () => {
    for (const [type, port] of [['solver_config', 'a'], ['conn_label', 'a']] as const) {
      for (const cls of ['cons:electrical', 'cons:thermal', 'sig:out', 'sig:in'] as const) {
        const rep = REPS.get(cls)!;
        const { ab, ba } = both({ id: 't', type, port }, { id: 'p', type: rep.block.id, port: rep.port.id });
        expect(ab.valid && ba.valid, `${type} vs ${cls}`).toBe(true);
        expect(sameOutcome(ab, ba)).toBe(true);
      }
    }
  });
});

function libraryBlock(id: string): VLabBlock { return blockById.get(id)!; }

// ──────────────────────────────────────────────────────────────────────────
describe('pre-simulation topology validation (before the engine assembles or solves)', () => {
  const N = (id: string, type: string, params: Record<string, any> = {}): Node =>
    ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, label: `${type}-${id}`, params } }) as any;
  const E = (id: string, s: string, sh: string, t: string, th: string): Edge => ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as any;

  it('derived required-port tables equal a fresh derivation from the equations / Jacobian (ratchet)', () => {
    const fresh = deriveRequiredTables();
    expect(DERIVED_REQUIRED_SIGNAL_INPUTS).toEqual(fresh.signal);
    expect(DERIVED_REQUIRED_CONSERVING_PORTS).toEqual(fresh.conserving);
    expect([...ILL_POSED_CONSERVING_BLOCKS]).toEqual(fresh.illPosed);
  });

  it('every required port exists with the right kind, and every semantic exemption is a real, still-derived required input', () => {
    for (const [type, ports] of Object.entries(DERIVED_REQUIRED_SIGNAL_INPUTS)) for (const p of ports) {
      const port = blockById.get(type)?.ports.find(x => x.id === p);
      expect(port?.direction, `${type}.${p}`).toBe('in');
    }
    for (const [type, ports] of Object.entries(DERIVED_REQUIRED_CONSERVING_PORTS)) for (const p of ports) {
      const port = blockById.get(type)?.ports.find(x => x.id === p);
      expect(CONSERVING.includes(canon(port?.domain)) && canon(port?.domain) !== 'frame', `${type}.${p}`).toBe(true);
    }
    for (const k of SEMANTIC_OPTIONAL_INPUTS) {
      const [type, port] = k.split('.');
      expect(DERIVED_REQUIRED_SIGNAL_INPUTS[type] ?? [], `exemption ${k} is stale`).toContain(port);
    }
  });

  it('`inputOrParam` fallbacks are optional; raw reads are required', () => {
    expect(requiredPortsOf('force_source').signal).toEqual([]);          // s -> parameter F when unwired
    expect(requiredPortsOf('controlled_voltage').signal).toEqual([]);    // s -> 0 default via inputOrParam
    expect(requiredPortsOf('variable_resistor').signal).toEqual([]);
    expect(requiredPortsOf('ps_gain').signal).toEqual(['u']);
    expect(requiredPortsOf('ps_add').signal).toEqual(['u1', 'u2']);
    expect(requiredPortsOf('nmos').signal).toEqual(['g']);
    expect(requiredPortsOf('dc_current').conserving).toEqual(['p']);     // open ideal current source is singular
    expect(requiredPortsOf('resistor')).toEqual({ signal: [], conserving: [] });
  });

  it('an unconnected REQUIRED signal input / conserving port is reported with block, port and reason', () => {
    const nodes = [N('const', 'ps_constant', { value: 1 }), N('gain', 'ps_gain'), N('src', 'dc_current'), N('gnd', 'ground')];
    const edges = [E('e1', 'src', 'src-n', 'gnd', 'gnd-a')];
    const r = validateTopology(nodes, edges);
    expect(r.valid).toBe(false);
    const byBlock = Object.fromEntries(r.diagnostics.map(d => [`${d.blockId}.${d.portId}`, d]));
    expect(byBlock['gain.u']).toMatchObject({ code: 'unconnected-required-port', expectedDomain: 'physical', actualDomain: 'unconnected' });
    expect(byBlock['src.p']).toMatchObject({ code: 'unconnected-required-port', expectedDomain: 'electrical' });
    expect(byBlock['gain.u'].reason).toMatch(/silently read 0/);
    expect(byBlock['src.p'].reason).toMatch(/structurally singular/);
    // optional ports and unwired outputs are not reported
    expect(Object.keys(byBlock).filter(k => k.startsWith('const.'))).toEqual([]);
  });

  it('connecting the required ports makes the same model valid, and it solves', () => {
    const nodes = [N('const', 'ps_constant', { value: 2 }), N('gain', 'ps_gain', { K: 3 })];
    const edges = [E('e1', 'const', 'const-y', 'gain', 'gain-u')];
    expect(validateTopology(nodes, edges)).toEqual({ valid: true, diagnostics: [] });
    const state = new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01);
    expect(state.x.every(Number.isFinite)).toBe(true);
  });

  it('old saved files with invalid wires load, validate to diagnostics, and never crash', () => {
    // saved by an older editor: electrical->thermal wire, two sources on one input, scope on a conserving port, dangling edge, unknown block
    const nodes = [
      N('v', 'dc_voltage'), N('tm', 'thermal_mass'), N('c1', 'ps_constant'), N('c2', 'ps_constant'), N('g', 'ps_gain'),
      N('r', 'resistor'), N('sc', 'scope'), N('mystery', 'block_from_the_future'),
    ];
    const edges = [
      E('bad1', 'v', 'v-p', 'tm', 'tm-a'),
      E('f1', 'c1', 'c1-y', 'g', 'g-u'), E('f2', 'c2', 'c2-y', 'g', 'g-u'),
      E('s1', 'r', 'r-p', 'sc', 'sc-in1'),
      E('d1', 'r', 'r-n', 'deleted_block', 'x-p'),
      E('u1', 'mystery', 'mystery-out', 'r', 'r-n'),
    ];
    const migrated = normalizeLegacyVLabGraph(nodes as any, edges as any);
    let report: ReturnType<typeof validateTopology> | undefined;
    expect(() => { report = validateTopology(migrated.nodes as Node[], migrated.edges as Edge[]); }).not.toThrow();
    const codes = report!.diagnostics.map(d => d.code);
    expect(codes).toEqual(expect.arrayContaining(['domain-mismatch', 'input-already-driven', 'scope-needs-measurable-output']));
    const edgeIds = report!.diagnostics.map(d => d.edgeId);
    expect(edgeIds).toEqual(expect.arrayContaining(['bad1', 'f2', 's1']));
    expect(edgeIds).not.toContain('d1');
    expect(edgeIds).not.toContain('u1');
    for (const d of report!.diagnostics) {
      expect(d.blockId).toBeTruthy(); expect(d.reason).toBeTruthy(); expect(d.expectedDomain).toBeTruthy(); expect(d.actualDomain).toBeTruthy();
    }
  });

  it('the engine fails fast with the diagnostic BEFORE assembling anything (no silent zero, no hang)', () => {
    const nodes = [N('gain', 'ps_gain'), N('v', 'dc_voltage'), N('tm', 'thermal_mass')];
    const edges = [E('bad', 'v', 'v-p', 'tm', 'tm-a')];
    const assemble = vi.spyOn(DAEAssembler.prototype, 'assemble');
    const t0 = Date.now();
    try {
      const engine = new VLabPhysicsEngine();
      expect(() => engine.simulateStep(nodes, edges, null, 0.01)).toThrow(TopologyValidationError);
      try { engine.simulateStep(nodes, edges, null, 0.01); } catch (e: any) {
        expect(e).toBeInstanceOf(TopologyValidationError);
        expect(e.message).toMatch(/Invalid V-Lab topology: \d+ problem\(s\)/);
        expect(e.message).toMatch(/Cannot connect/);
        expect(e.message).toMatch(/Required port "u" of "ps_gain-gain"/);
        expect(e.diagnostics.length).toBeGreaterThanOrEqual(2);
      }
      expect(assemble).not.toHaveBeenCalled();
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(() => assertValidTopology(nodes, edges)).toThrow(TopologyValidationError);
    } finally { assemble.mockRestore(); }
  });

  it('subsystems are flattened first: edges to a subsystem shell are not misreported, the inner wiring is checked', () => {
    const nodes = [
      N('src', 'ps_constant', { value: 1 }),
      { ...N('sub', 'subsystem'), data: { type: 'subsystem', label: 'S', params: {} } } as Node,
      { ...N('in1', 'inport'), data: { type: 'inport', parentId: 'sub', params: {} } } as Node,
      { ...N('out1', 'outport'), data: { type: 'outport', parentId: 'sub', params: {} } } as Node,
      { ...N('gain', 'ps_gain'), data: { type: 'ps_gain', parentId: 'sub', params: {} } } as Node,
      N('sink', 'ps_terminator'),
    ];
    const edges = [
      E('x1', 'src', 'src-y', 'sub', 'sub-in1'),
      E('i1', 'in1', 'in1-out', 'gain', 'gain-u'),
      E('i2', 'gain', 'gain-y', 'out1', 'out1-in'),
      E('x2', 'sub', 'sub-out1', 'sink', 'sink-u'),
    ];
    expect(validateTopology(nodes, edges)).toEqual({ valid: true, diagnostics: [] });
    // break the inner wiring: gain.u no longer fed -> required port reported on the flattened graph
    const broken = validateTopology(nodes, edges.filter(e => e.id !== 'i1'));
    expect(broken.diagnostics.some(d => d.code === 'unconnected-required-port' && d.blockId === 'gain')).toBe(true);
  });

  it('every shipped learning lab passes the same validation the Run button applies', () => {
    const bad: string[] = [];
    for (const lab of LEARNING_LABS as any[]) {
      const r = validateTopology(reconstructLabNodes(lab.nodes), lab.edges);
      if (!r.valid) bad.push(`${lab.id}: ${r.diagnostics.map(d => d.reason).join(' | ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('the domain-correct single-block fixture of EVERY library block passes topology validation (F-028)', () => {
    const bad: string[] = [];
    for (const b of libBlocks) {
      const params: Record<string, any> = {};
      for (const [k, v] of Object.entries(b.params || {})) params[k] = (v as any).value;
      const { nodes, edges } = buildDomainFixture(b, params);
      const r = validateTopology(nodes, edges);
      // an explicitly unsupported block (WP-09a) is reported by its own diagnostic and nothing else
      const unsupported = !!UNSUPPORTED_BLOCKS[b.id];
      const other = r.diagnostics.filter(d => !(unsupported && d.code === 'unsupported-block' && d.blockId === 'dut'));
      if (other.length) bad.push(`${b.id}: ${other.map(d => d.reason).join(' | ')}`);
      if (unsupported) expect(r.diagnostics.filter(d => d.code === 'unsupported-block').map(d => d.blockId)).toEqual(['dut']);
    }
    expect(bad).toEqual([]);
  });

  it('there is exactly one rules implementation: the workspace and the engine import vlabConnectionRules, nothing re-implements it', async () => {
    const fs = await import('node:fs');
    const ws = fs.readFileSync('src/components/vlab/VLabWorkspace.tsx', 'utf8');
    expect(ws).toMatch(/from '..\/..\/engine\/vlab\/vlabConnectionRules'/);
    expect(ws).not.toMatch(/areDomainsCompatible|isDomainBridge|isWildcardDomain|isUniversalBlock/);
    const topo = fs.readFileSync('src/engine/vlab/vlabTopologyValidation.ts', 'utf8');
    expect(topo).toMatch(/from '.\/vlabConnectionRules'/);
    expect(topo).toMatch(/checkEdgeSet/);
    const phys = fs.readFileSync('src/engine/vlab/vlabPhysics.ts', 'utf8');
    expect(phys).toMatch(/assertValidTopology\(nodes, edges\)/);
    expect(phys.indexOf('assertValidTopology(nodes, edges)')).toBeLessThan(phys.indexOf('this.assembler.assemble(nodes, edges)'));
  });
});
