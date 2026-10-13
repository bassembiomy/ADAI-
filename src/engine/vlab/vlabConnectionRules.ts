/**
 * V-Lab connection rules: the single source of truth for "may port A be wired to port B".
 *
 * Used by VLabWorkspace.onConnect (interactive wiring) and by vlabTopologyValidation (pre-simulation re-check
 * of loaded models). Pure: no React, no solver. Ports are identified by exact port id, never by label text.
 *
 * Rules (Simscape conventions: through-variable positive A->B, across = v_A - v_B):
 *  - Same canonical domain required (case-insensitive; Frame == MultibodyFrame). `Any` only on the documented
 *    allow-list (ANY_DOMAIN_BLOCKS). Domain-transparent utility blocks (TRANSPARENT_BLOCKS) are exempt.
 *  - Conserving ports (and the belt-property link) are bidirectional nodes: fan-out is unlimited.
 *  - Physical (signal) ports carry a direction: out -> in only. One output may drive many inputs; an input accepts
 *    exactly one source. out->out and in->in are rejected.
 *  - Scope / probe inputs accept only a measurable signal output (Physical `out`), never a conserving or Frame port.
 *    A scope is width-agnostic: a width-N signal shows N traces (WP-09c). A probe passes one scalar through.
 *  - Vector ports (WP-09c): two signal ports connect only when their widths are EXACTLY equal (no broadcast, no truncation);
 *    a composite three-phase electrical port connects only to another composite port (vlabVectorPorts.ts).
 *  - Dragging A->B and B->A yields the identical normalised edge (source = the signal output; otherwise the
 *    lexicographically smaller block/port) and the identical diagnostic.
 */
import { VLAB_LIBRARY, type VLabBlock } from '../../utils/vlabLibrary';
import { portShape, type PortShape } from './vlabVectorPorts';

export type PortDirection = 'in' | 'out';
export type PortKind = 'conserving' | 'signal' | 'property' | 'any' | 'transparent';

export interface RuleNode {
  id: string;
  type?: string;
  data?: any;
}

export interface RuleEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** `Any` is a Simulink<->PS boundary wildcard and is only legal on these converters (shared with the WP-03 contract). */
export const ANY_DOMAIN_BLOCKS: ReadonlySet<string> = new Set(['ps_simulink_conv', 'simulink_ps_conv']);

/**
 * Blocks that are domain transparent: the connection carries whatever the other end is, so the rules neither
 * compare domains nor direction. solver_config attaches to a node of any network, conn_label names a
 * net, subsystem/inport/outport are containers that are flattened away before assembly.
 */
export const TRANSPARENT_BLOCKS: ReadonlySet<string> = new Set([
  'solver_config', 'solver_configuration', 'conn_label',
  'subsystem', 'Subsystem', 'inport', 'Inport', 'outport', 'Outport',
]);

/** Measurement sinks: only a measurable signal output may drive them. */
export const MEASUREMENT_SINK_BLOCKS: ReadonlySet<string> = new Set(['scope', 'vlab_probe']);

const CONSERVING_DOMAINS = new Set([
  'electrical', 'thermal', 'translational', 'rotational', 'magnetic', 'fluid', 'gas', 'isothermal_liquid', 'frame',
]);

export const canonicalDomain = (d?: string | null): string => {
  const x = (d ?? '').trim().toLowerCase();
  return x === 'multibodyframe' ? 'frame' : x;
};

export interface ResolvedPort {
  nodeId: string;
  blockType: string;
  blockLabel: string;
  portId: string;
  /** canonical lower-case domain */
  domain: string;
  kind: PortKind;
  /** signal ports only */
  direction?: PortDirection;
  /** number of channels (1 = scalar). A composite three-phase port has width 3. WP-09c */
  width: number;
  channelNames: string[];
  composite?: 'three_phase';
}

export type ConnectionCode =
  | 'domain-mismatch' | 'output-to-output' | 'input-to-input' | 'input-already-driven'
  | 'scope-needs-measurable-output' | 'unknown-port' | 'unknown-domain' | 'wildcard-not-allowed' | 'unconnected-required-port'
  // WP-08: numeric parameter that is not a finite number / violates its physical bound (vlabParams.ts)
  | 'invalid-parameter' | 'parameter-out-of-range'
  // WP-09a: block listed in vlabStructure.UNSUPPORTED_BLOCKS (the diagnostic names the missing specification)
  | 'unsupported-block'
  // WP-09c: signal widths differ / composite three-phase port wired to a scalar port
  | 'width-mismatch' | 'composite-mismatch'
  // WP-15: an ideal across sensor (MMF / temperature / voltage) wired in series between two blocks
  | 'sensor-in-series';

export interface ConnectionDiagnostic {
  blockId: string;
  portId: string;
  expectedDomain: string;
  actualDomain: string;
  reason: string;
  code: ConnectionCode;
  /** the opposite end of the rejected wire, when there is one */
  otherBlockId?: string;
  otherPortId?: string;
  /** parameter diagnostics only (code 'invalid-parameter' | 'parameter-out-of-range') */
  param?: string;
  raw?: unknown;
  /** width diagnostics only (code 'width-mismatch' | 'composite-mismatch'): width the port expects vs the width wired to it */
  expectedWidth?: number;
  actualWidth?: number;
}

export interface NormalizedConnection {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export type ConnectionResult =
  | { valid: true; edge: NormalizedConnection; duplicate: boolean }
  | { valid: false; diagnostic: ConnectionDiagnostic; message: string };

// ── library lookup ──
let libraryIndex: Map<string, VLabBlock> | null = null;
export const libraryBlock = (type: string): VLabBlock | undefined => {
  if (!libraryIndex) {
    libraryIndex = new Map();
    for (const d of VLAB_LIBRARY) for (const b of d.blocks) libraryIndex.set(b.id, b);
  }
  return libraryIndex.get(type);
};

export const blockTypeOf = (n: RuleNode): string => n.data?.type || n.type || n.data?.blockId || '';
const labelOf = (n: RuleNode): string => n.data?.label || blockTypeOf(n) || n.id;

/** Known port ids of a node: library first, then the instance's own (dynamic scope channels, custom ports). */
const knownPortIds = (n: RuleNode): string[] => {
  const ids = new Set<string>();
  libraryBlock(blockTypeOf(n))?.ports.forEach(p => ids.add(p.id));
  if (Array.isArray(n.data?.ports)) n.data.ports.forEach((p: any) => p?.id && ids.add(p.id));
  return [...ids];
};

/**
 * Port id behind a handle. Handles are `<nodeId>-<portId>` (editor), `<portId>_s|_t` (legacy) or the bare id.
 * An exact known port id always wins over suffix stripping, so ports that really end in `_s`/`_t` (vdc_s) survive.
 */
export function portIdFromHandle(node: RuleNode, handle?: string | null): string | undefined {
  const known = knownPortIds(node);
  const type = blockTypeOf(node);
  const h = (handle ?? '').trim();
  if (!h) {
    // legacy default used by the assembler for an edge without a handle
    if (known.includes('p')) return 'p';
    if (type === 'scope') return 'in1';
    return undefined;
  }
  const dropSuffix = (s: string) => s.replace(/_[st]$/, '');
  const dropPrefix = (s: string) => (s.startsWith(node.id + '-') || s.startsWith(node.id + '_') ? s.slice(node.id.length + 1) : s);
  // exact known ids first (a port may be called `src` on a block called `src`, or end in `_s`), then legacy forms
  const candidates = [h, dropSuffix(h), dropPrefix(h), dropSuffix(dropPrefix(h)), dropPrefix(dropSuffix(h))];
  for (const c of candidates) if (known.includes(c)) return c;
  const legacy = dropSuffix(dropPrefix(h));
  if (MEASUREMENT_SINK_BLOCKS.has(type)) {
    const m = legacy.match(/^in[_-]?(\d+)$/); // `in_1`, `in-1` are aliases of the scope channel `in1`
    if (m) return `in${m[1]}`;
  }
  return legacy;
}

export type PortLookup =
  | { ok: true; port: ResolvedPort }
  | { ok: false; unverifiable: boolean; diagnostic?: ConnectionDiagnostic };

/** Resolve the port a handle points at. `unverifiable` = the block type is unknown, so nothing can be said. */
export function resolvePort(node: RuleNode, handle?: string | null): PortLookup {
  const type = blockTypeOf(node);
  const lib = libraryBlock(type);
  const portId = portIdFromHandle(node, handle);
  const label = labelOf(node);
  const fail = (code: ConnectionCode, reason: string, domain = 'unknown'): PortLookup => ({
    ok: false, unverifiable: false,
    diagnostic: { blockId: node.id, portId: portId ?? '', expectedDomain: domain, actualDomain: 'unknown', reason, code },
  });

  if (TRANSPARENT_BLOCKS.has(type)) {
    return { ok: true, port: { nodeId: node.id, blockType: type, blockLabel: label, portId: portId ?? '', domain: 'transparent', kind: 'transparent', width: 1, channelNames: [] } };
  }

  const dataPort = Array.isArray(node.data?.ports) ? node.data.ports.find((p: any) => p?.id === portId) : undefined;
  const libPort = lib?.ports.find(p => p.id === portId);
  const synthScope = MEASUREMENT_SINK_BLOCKS.has(type) && !!portId && /^in\d*$/.test(portId);

  if (!libPort && !dataPort && !synthScope) {
    if (!lib && !node.data?.domain) return { ok: false, unverifiable: true };
    if (lib) return fail('unknown-port', `Block "${label}" (${type}) has no port "${portId ?? '(none)'}".`);
    if (!lib && node.data?.domain) {
      // unknown block type that only declares a block-level domain: use it for every port
      return makeResolved(node, type, label, portId ?? '', node.data.domain, undefined, fail, { width: 1, channelNames: [] });
    }
    return { ok: false, unverifiable: true };
  }

  const domain = libPort?.domain ?? dataPort?.domain ?? (synthScope ? 'Physical' : undefined) ?? node.data?.domain;
  // width / composite metadata comes from the LIBRARY; an instance copy only fills in for a block the library does not know
  let shape: PortShape;
  try { shape = portShape(libPort ?? dataPort, `Port "${portId}" of "${label}" (${type})`); }
  catch (e) { return fail('unknown-domain', e instanceof Error ? e.message : String(e)); }
  let direction: PortDirection | undefined = libPort?.direction ?? dataPort?.direction;
  if (synthScope) direction = 'in';
  return makeResolved(node, type, label, portId!, domain, direction, fail, shape);
}

function makeResolved(
  node: RuleNode, type: string, label: string, portId: string, rawDomain: string | undefined,
  direction: PortDirection | undefined,
  fail: (code: ConnectionCode, reason: string, domain?: string) => PortLookup,
  shape: PortShape,
): PortLookup {
  const domain = canonicalDomain(rawDomain);
  if (!domain) return fail('unknown-domain', `Port "${portId}" of "${label}" (${type}) has no domain.`);
  let kind: PortKind;
  if (domain === 'any') {
    if (!ANY_DOMAIN_BLOCKS.has(type)) return fail('wildcard-not-allowed', `Port "${portId}" of "${label}" (${type}) uses the wildcard domain Any, which only the Simulink-PS converters may use.`, 'any');
    kind = 'any';
  } else if (domain === 'physical') kind = 'signal';
  else if (domain === 'beltproperty') kind = 'property';
  else if (CONSERVING_DOMAINS.has(domain)) kind = 'conserving';
  else return fail('unknown-domain', `Port "${portId}" of "${label}" (${type}) has unknown domain "${rawDomain}".`, domain);
  if (shape.composite && domain !== 'electrical') {
    return fail('unknown-domain', `Port "${portId}" of "${label}" (${type}) is a three-phase composite port but has domain "${rawDomain}"; only Electrical ports can be composite.`, domain);
  }
  if (shape.width > 1 && kind !== 'signal' && !shape.composite) {
    return fail('unknown-domain', `Port "${portId}" of "${label}" (${type}) declares width ${shape.width} but is a ${domain} port; only Physical signal ports (and composite three-phase Electrical ports) can be wider than 1.`, domain);
  }
  return {
    ok: true,
    port: {
      nodeId: node.id, blockType: type, blockLabel: label, portId, domain, kind, direction: kind === 'signal' ? direction : undefined,
      width: shape.width, channelNames: shape.channelNames, composite: shape.composite,
    },
  };
}

const isMeasurementInput = (p: ResolvedPort) => MEASUREMENT_SINK_BLOCKS.has(p.blockType) && p.direction === 'in';
const portKey = (p: { nodeId: string; portId: string }) => `${p.nodeId}\u0000${p.portId}`;

/** Normalisation order: signal outputs first, undirected next, signal inputs last, ties lexicographic. */
const orderOf = (p: ResolvedPort) => (p.direction === 'out' ? 0 : p.direction === 'in' ? 2 : 1);
function ordered(a: ResolvedPort, b: ResolvedPort): [ResolvedPort, ResolvedPort] {
  const oa = orderOf(a); const ob = orderOf(b);
  if (oa !== ob) return oa < ob ? [a, b] : [b, a];
  return portKey(a) <= portKey(b) ? [a, b] : [b, a];
}

const describe = (p: ResolvedPort) => `${p.composite ? 'composite three-phase ' : ''}${p.domain} port (${p.blockLabel})`;
const widthText = (p: ResolvedPort) => (p.composite ? 'composite three-phase (a, b, c)' : p.width === 1 ? 'scalar (width 1)' : `width ${p.width}`);

function reject(code: ConnectionCode, x: ResolvedPort, y: ResolvedPort, reason: string, widths?: { expected: number; actual: number }): ConnectionResult {
  const diagnostic: ConnectionDiagnostic = {
    blockId: y.nodeId, portId: y.portId, expectedDomain: x.domain, actualDomain: y.domain, reason, code,
    otherBlockId: x.nodeId, otherPortId: x.portId,
    ...(widths ? { expectedWidth: widths.expected, actualWidth: widths.actual } : {}),
  };
  return { valid: false, diagnostic, message: reason };
}

/** Pairwise rules (domain, direction, measurement sinks). Fan-in is checked against the edge set separately. */
export function checkPortPair(a: ResolvedPort, b: ResolvedPort): { ok: true; source: ResolvedPort; target: ResolvedPort } | Extract<ConnectionResult, { valid: false }> {
  const [x, y] = ordered(a, b);
  const bad = (code: ConnectionCode, reason: string, widths?: { expected: number; actual: number }) =>
    reject(code, x, y, reason, widths) as Extract<ConnectionResult, { valid: false }>;

  if (x.kind === 'transparent' || y.kind === 'transparent') return { ok: true, source: x, target: y };

  const sink = isMeasurementInput(x) ? x : isMeasurementInput(y) ? y : undefined;
  if (sink) {
    const other = sink === x ? y : x;
    if (!(other.kind === 'signal' && other.direction === 'out') && other.kind !== 'any') {
      return bad('scope-needs-measurable-output',
        `${sink.blockType === 'scope' ? 'Scope' : 'Probe'} inputs accept only a measurable signal output (a Physical output port), not a ${other.domain} ${other.kind === 'signal' ? 'signal input' : 'conserving'} port (${other.blockLabel}). Use a sensor block to measure it.`);
    }
  }

  if (x.kind === 'any' || y.kind === 'any') {
    // WP-09c: the Simulink-PS converters carry ONE scalar; a vector / composite port behind them is a width error
    const other = x.kind === 'any' ? y : x;
    if (other.kind !== 'any' && (other.width !== 1 || other.composite)) {
      return bad('width-mismatch',
        `Cannot connect ${other.blockLabel}.${other.portId} (${widthText(other)}) to the Simulink-PS converter ${(x.kind === 'any' ? x : y).blockLabel}: converters carry one scalar signal (expected width 1, got width ${other.width}). ` +
        `Split the vector first.`, { expected: 1, actual: other.width });
    }
    return { ok: true, source: x, target: y };
  }

  if (x.domain !== y.domain) {
    return bad('domain-mismatch', `Cannot connect ${describe(x)} to ${describe(y)}. Use a domain converter block.`);
  }

  // WP-09c: a composite three-phase port meets only another composite port (phase_splitter bridges to the scalar phases)
  if (!!x.composite !== !!y.composite) {
    const comp = x.composite ? x : y; const scalar = x.composite ? y : x;
    return bad('composite-mismatch',
      `Cannot connect the three-phase composite port ${comp.blockLabel}.${comp.portId} to the scalar ${scalar.domain} port ${scalar.blockLabel}.${scalar.portId}: ` +
      `a composite port connects only to another composite port (expected width ${comp.width}, got width ${scalar.width}). ` +
      `Use a Phase Splitter to reach the individual phases a, b, c.`, { expected: comp.width, actual: scalar.width });
  }

  if (x.kind === 'signal' && y.kind === 'signal') {
    if (x.direction === 'out' && y.direction === 'out') {
      return bad('output-to-output', `Cannot connect signal output (${x.blockLabel}.${x.portId}) to signal output (${y.blockLabel}.${y.portId}): two outputs would drive the same signal.`);
    }
    if (x.direction === 'in' && y.direction === 'in') {
      return bad('input-to-input', `Cannot connect signal input (${x.blockLabel}.${x.portId}) to signal input (${y.blockLabel}.${y.portId}): neither end produces the signal.`);
    }
    // WP-09c: widths must match exactly. Scope inputs are width-agnostic (one trace per channel); a probe passes ONE scalar through.
    if (!(sink && sink.blockType === 'scope') && x.width !== y.width) {
      // after ordering, y is the signal input (or, for an undirected pair, the lexicographically later port): it defines the expected width
      return bad('width-mismatch',
        `Cannot connect ${x.blockLabel}.${x.portId} (${widthText(x)}) to ${y.blockLabel}.${y.portId} (${widthText(y)}): signal widths must match exactly ` +
        `(expected width ${y.width} at ${y.blockLabel}.${y.portId}, got width ${x.width}); there is no implicit broadcast or truncation. ` +
        `Use a Mux / Demux or a splitter block to change the width.`, { expected: y.width, actual: x.width });
    }
  }
  return { ok: true, source: x, target: y };
}

// ── edge-set bookkeeping (fan-in) ──
interface ResolvedEdge { edge: RuleEdge; index: number; a: ResolvedPort; b: ResolvedPort }

function resolveEdge(nodesById: Map<string, RuleNode>, edge: RuleEdge, index: number): ResolvedEdge | null {
  const sn = nodesById.get(edge.source); const tn = nodesById.get(edge.target);
  if (!sn || !tn) return null;
  const sa = resolvePort(sn, edge.sourceHandle); const ta = resolvePort(tn, edge.targetHandle);
  if (!sa.ok || !ta.ok) return null;
  return { edge, index, a: sa.port, b: ta.port };
}

const isSignalInput = (p: ResolvedPort) => p.kind === 'signal' && p.direction === 'in';



const toMap = (nodes: RuleNode[]) => new Map(nodes.map(n => [n.id, n]));

/**
 * Validate one proposed wire against the nodes and the edges that already exist.
 * Returns the normalised edge (identical for A->B and B->A) or a structured diagnostic.
 */
export function validateConnection(
  nodes: RuleNode[],
  edges: RuleEdge[],
  conn: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
): ConnectionResult {
  const byId = toMap(nodes);
  const sn = byId.get(conn.source); const tn = byId.get(conn.target);
  const unknownNode = (id: string, h?: string | null): ConnectionResult => ({
    valid: false,
    diagnostic: { blockId: id, portId: h ?? '', expectedDomain: 'unknown', actualDomain: 'unknown', reason: `Block "${id}" does not exist.`, code: 'unknown-port' },
    message: `Block "${id}" does not exist.`,
  });
  if (!sn) return unknownNode(conn.source, conn.sourceHandle);
  if (!tn) return unknownNode(conn.target, conn.targetHandle);

  const sa = resolvePort(sn, conn.sourceHandle); const ta = resolvePort(tn, conn.targetHandle);
  for (const r of [sa, ta]) if (!r.ok && r.diagnostic) return { valid: false, diagnostic: r.diagnostic, message: r.diagnostic.reason };

  const handles = new Map<string, string | null | undefined>();
  const pair = (sa.ok && ta.ok) ? checkPortPair(sa.port, ta.port) : null;
  if (sa.ok) handles.set(portKey(sa.port), conn.sourceHandle);
  if (ta.ok) handles.set(portKey(ta.port), conn.targetHandle);

  if (pair && 'valid' in pair) return pair;

  if (!(sa.ok && ta.ok)) {
    // an unverifiable (unknown block type) end: keep the user's drag order, nothing to normalise against
    return { valid: true, duplicate: false, edge: { source: conn.source, sourceHandle: conn.sourceHandle || '', target: conn.target, targetHandle: conn.targetHandle || '' } };
  }
  const { source, target } = pair as { ok: true; source: ResolvedPort; target: ResolvedPort };
  const edge: NormalizedConnection = {
    source: source.nodeId, sourceHandle: handles.get(portKey(source)) || `${source.nodeId}-${source.portId}`,
    target: target.nodeId, targetHandle: handles.get(portKey(target)) || `${target.nodeId}-${target.portId}`,
  };

  const existing = edges.map((e, i) => resolveEdge(byId, e, i)).filter((r): r is ResolvedEdge => !!r);
  const duplicate = existing.some(r => {
    const k = [portKey(r.a), portKey(r.b)].sort().join('|');
    return k === [portKey(source), portKey(target)].sort().join('|');
  });
  // fan-in: a signal input accepts exactly one source
  for (const input of [source, target].filter(isSignalInput)) {
    const other = input === source ? target : source;
    for (const r of existing) {
      const ends = [r.a, r.b];
      const hit = ends.find(p => portKey(p) === portKey(input));
      if (!hit) continue;
      const far = ends.find(p => p !== hit) ?? hit;
      if (portKey(far) === portKey(other)) continue;
      const reason = `Input ${input.blockLabel}.${input.portId} is already driven by ${far.blockLabel}.${far.portId}; a signal input accepts exactly one source. Disconnect the existing wire first.`;
      return reject('input-already-driven', other, input, reason);
    }
  }
  return { valid: true, edge, duplicate };
}

export interface EdgeSetDiagnostic extends ConnectionDiagnostic { edgeId?: string }

/**
 * Re-run the pairwise rules on every edge of a loaded graph and flag fan-in (an input with two sources).
 * Edges to missing blocks and to unknown block types are skipped (nothing can be verified about them).
 * Unknown ports of KNOWN blocks and invalid pairs are reported.
 */
export function checkEdgeSet(nodes: RuleNode[], edges: RuleEdge[]): EdgeSetDiagnostic[] {
  const byId = toMap(nodes);
  const out: EdgeSetDiagnostic[] = [];
  const inputSources = new Map<string, { far: ResolvedPort; edgeId?: string }[]>();
  edges.forEach((e, i) => {
    const sn = byId.get(e.source); const tn = byId.get(e.target);
    if (!sn || !tn) return;
    const sa = resolvePort(sn, e.sourceHandle); const ta = resolvePort(tn, e.targetHandle);
    for (const r of [sa, ta]) if (!r.ok && r.diagnostic) { out.push({ ...r.diagnostic, edgeId: e.id ?? `#${i}` }); }
    if (!sa.ok || !ta.ok) return;
    const res = checkPortPair(sa.port, ta.port);
    if ('valid' in res) { out.push({ ...res.diagnostic, edgeId: e.id ?? `#${i}` }); return; }
    for (const [input, far] of [[sa.port, ta.port], [ta.port, sa.port]] as const) {
      if (!isSignalInput(input)) continue;
      const k = portKey(input);
      const list = inputSources.get(k) ?? [];
      if (!list.some(x => portKey(x.far) === portKey(far))) list.push({ far, edgeId: e.id ?? `#${i}` });
      inputSources.set(k, list);
    }
  });
  for (const [k, list] of inputSources) {
    if (list.length < 2) continue;
    const [nodeId, portId] = k.split('\u0000');
    const node = byId.get(nodeId)!;
    const first = list[0].far;
    for (const extra of list.slice(1)) {
      out.push({
        blockId: nodeId, portId, expectedDomain: 'physical', actualDomain: 'physical', code: 'input-already-driven', edgeId: extra.edgeId,
        otherBlockId: extra.far.nodeId, otherPortId: extra.far.portId,
        reason: `Input ${labelOf(node)}.${portId} has ${list.length} sources (${list.map(x => `${x.far.blockLabel}.${x.far.portId}`).join(', ')}); a signal input accepts exactly one source (first: ${first.blockLabel}.${first.portId}).`,
      });
    }
  }
  return out;
}

export const formatDiagnostic = (d: ConnectionDiagnostic): string => d.reason;
