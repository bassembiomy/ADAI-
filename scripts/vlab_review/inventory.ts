/**
 * V-Lab inventory & cross-reference (WP-01). Read-only analysis.
 * Run: npx tsx scripts/vlab_review/inventory.ts   (or npm run vlab:inventory)
 * Outputs (deterministic): docs/vlab-review/inventory.json, docs/vlab-review/inventory-gaps.md
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VLAB_LIBRARY } from '../../src/utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from '../../src/engine/vlab/vlabComponentDefinitions';
import { blockEquations } from '../../src/engine/vlab/vlabEquations';
import { HELP_DATA } from '../../src/HelpData';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'vlab-review');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ── DAEAssembler: the single `switch (blockType)` that allocates branches/states ──
interface DaeCase { branches: string[]; states: string[]; }
function parseDae(): Map<string, DaeCase> {
  const lines = read('src/engine/vlab/DAEAssembler.ts').split('\n');
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

// ── VLabSymbols: type keys of RawSymbolRenderer's switch ──
function parseSymbols(): Set<string> {
  const src = read('src/components/vlab/VLabSymbols.tsx');
  const a = src.indexOf('export const RawSymbolRenderer');
  const b = src.indexOf('export const UnknownSymbolGlyph');
  const seg = src.slice(a, b);
  return new Set([...seg.matchAll(/case '([^']+)':/g)].map(m => m[1]));
}

// ── Recording proxies ──
interface Trace { across: Set<number>; dAcross: Set<number>; branch: Set<number>; dBranch: Set<number>; state: Set<number>; dState: Set<number>; params: Set<string>; }
const idxProxy = (rec: Set<number>) => new Proxy([] as any[], {
  get(_t, p) {
    if (typeof p === 'string' && /^\d+$/.test(p)) { rec.add(Number(p)); return 1; }
    if (p === 'length') return 16;
    if (p === Symbol.iterator) return function* () { for (let i = 0; i < 16; i++) { rec.add(i); yield 1; } };
    const v = (Array.prototype as any)[p as any];
    return typeof v === 'function' ? v.bind([1, 1, 1, 1, 1, 1, 1, 1]) : v;
  },
});
function traceBlock(id: string, defaults: Record<string, any>, portIds: string[]): Trace | null {
  const fn = blockEquations[id];
  if (!fn) return null;
  const t: Trace = { across: new Set(), dAcross: new Set(), branch: new Set(), dBranch: new Set(), state: new Set(), dState: new Set(), params: new Set() };
  const params = new Proxy({ ...defaults }, {
    get(target, p) { if (typeof p === 'string') { t.params.add(p); return (target as any)[p]; } return undefined; },
    has(target, p) { if (typeof p === 'string') t.params.add(p); return p in target; },
  });
  const ctx: any = { dt: 1e-3, time: 0, parameters: {}, prevStates: [], states: [], stateDerivatives: [], order: 1 };
  try {
    fn({
      across: idxProxy(t.across), dAcross: idxProxy(t.dAcross), branch: idxProxy(t.branch) as any, dBranch: idxProxy(t.dBranch) as any,
      state: idxProxy(t.state) as any, dState: idxProxy(t.dState) as any, ctx, params, ports: portIds, nodeId: id,
    } as any);
  } catch {
    return { ...t, params: t.params, across: new Set(['threw' as any]) } as any;
  }
  return t;
}
const sortedNums = (s: Set<number>) => [...s].sort((a, b) => a - b);

// ── Collect ──
const dae = parseDae();
const symbols = parseSymbols();
const eqKeys = new Set(Object.keys(blockEquations));
const defKeys = new Set(Object.keys(VLAB_COMPONENT_DEFINITIONS));
const helpText = Object.values(HELP_DATA).map(h => JSON.stringify(h)).join('\n').toLowerCase();
const helpTopicKeys = new Set(Object.keys(HELP_DATA));
const mentionsInHelp = (id: string, name: string) => {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = (s: string) => new RegExp(`(^|[^a-z0-9_])${esc(s.toLowerCase())}($|[^a-z0-9_])`);
  return re(id).test(helpText) || re(name).test(helpText) || helpTopicKeys.has(id);
};

type Row = any;
const inv: Record<string, Row> = {};
const libIds: string[] = [];
const dupIds: string[] = [];
for (const dom of VLAB_LIBRARY) {
  for (const b of dom.blocks) {
    if (inv[b.id]) { dupIds.push(b.id); continue; }
    libIds.push(b.id);
    const defaults: Record<string, any> = {};
    for (const [k, v] of Object.entries(b.params || {})) defaults[k] = v.value;
    const portIds = b.ports.map(p => p.id);
    const tr = traceBlock(b.id, defaults, portIds);
    const threw = !!tr && (tr.across as Set<any>).has('threw');
    let portsRead: string[] | 'unknown' | null = null;
    let paramsRead: string[] | 'unknown' | null = null;
    let trace: any = null;
    if (!tr) { portsRead = null; paramsRead = null; }
    else if (threw) { portsRead = 'unknown'; paramsRead = 'unknown'; }
    else {
      const idx = new Set<number>([...tr.across, ...tr.dAcross]);
      portsRead = [...idx].sort((a, b) => a - b).map(i => portIds[i] ?? `#${i}(out-of-range)`);
      paramsRead = [...tr.params].sort(cmp);
      trace = { branchIdx: sortedNums(tr.branch), dBranchIdx: sortedNums(tr.dBranch), stateIdx: sortedNums(tr.state), dStateIdx: sortedNums(tr.dState) };
    }
    const d = dae.get(b.id);
    inv[b.id] = {
      name: b.name,
      category: b.category ?? null,
      domainGroup: dom.type,
      ports: b.ports.map(p => ({ id: p.id, pos: p.pos, domain: p.domain ?? null, unit: p.unit ?? null, label: p.label ?? null })),
      params: Object.entries(b.params || {}).sort((a, c) => cmp(a[0], c[0])).map(([name, v]) => ({ name, unit: v.unit, default: v.value })),
      hasEquation: eqKeys.has(b.id),
      hasDefinition: defKeys.has(b.id),
      daeCase: d ? { branches: d.branches, states: d.states } : null,
      hasSymbol: symbols.has(b.id),
      hasHelp: mentionsInHelp(b.id, b.name),
      portsReadByEquation: portsRead,
      paramsReadByEquation: paramsRead,
      equationTrace: trace,
      simscapeAnalog: null,
    };
  }
}
const sortedInv: Record<string, Row> = {};
for (const k of Object.keys(inv).sort(cmp)) sortedInv[k] = inv[k];

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(sortedInv, null, 2) + '\n');

// ── Gap report ──
const ids = Object.keys(sortedInv);
const W = (rows: string[]) => rows.join('\n');
const list = (xs: string[]) => (xs.length ? xs.map(x => `\`${x}\``).join(', ') : '_none_');
const SIGNALISH = /scope|display|to_workspace|from_workspace|inport|outport|subsystem|constant|gain|sum|product|integrator|derivative|mux|demux|switch_signal|saturation|step|ramp|sine|pulse|clock|probe|logger|terminator|goto|from_|bus|delay|filter|lookup|math|logic|compare|relational|pid|controller/i;
const noEq = ids.filter(i => !sortedInv[i].hasEquation);
const classify = (id: string) => {
  const r = sortedInv[id];
  if (/^(subsystem|inport|outport)$/i.test(id)) return 'subsystem/port';
  if (/scope|display|logger|probe|workspace/i.test(id)) return 'scope/sink';
  if (r.daeCase) return 'DAE-special (handled in DAEAssembler switch)';
  if (r.ports.every((p: any) => ['in', 'out', 'y', 'u'].includes(p.id) || /^(in|out)/.test(p.id))) return 'signal (all ports in*/out*)';
  if (SIGNALISH.test(id)) return 'signal/composite (name heuristic)';
  return 'genuinely missing (review)';
};
const orphanEq = [...eqKeys].filter(k => !sortedInv[k]).sort(cmp);
const portNoDomain = ids.filter(i => sortedInv[i].ports.some((p: any) => p.domain == null));
const portNoDomainFull = ids.filter(i => sortedInv[i].ports.length && sortedInv[i].ports.every((p: any) => p.domain == null));
const unreadPorts: string[] = [];
const deadParams: string[] = [];
const hidden: string[] = [];
const unknownTrace: string[] = [];
for (const i of ids) {
  const r = sortedInv[i];
  if (!r.hasEquation) continue;
  if (r.portsReadByEquation === 'unknown') { unknownTrace.push(i); continue; }
  const unread = r.ports.map((p: any) => p.id).filter((p: string) => !r.portsReadByEquation.includes(p));
  if (unread.length) unreadPorts.push(`| \`${i}\` | ${unread.map((x: string) => `\`${x}\``).join(', ')} | ${r.portsReadByEquation.map((x: string) => `\`${x}\``).join(', ') || '_none_'} |`);
  const pn = r.params.map((p: any) => p.name);
  const dead = pn.filter((p: string) => !r.paramsReadByEquation.includes(p));
  if (dead.length) deadParams.push(`| \`${i}\` | ${dead.map((x: string) => `\`${x}\``).join(', ')} |`);
  const hid = r.paramsReadByEquation.filter((p: string) => !pn.includes(p));
  if (hid.length) hidden.push(`| \`${i}\` | ${hid.map((x: string) => `\`${x}\``).join(', ')} |`);
}
const noSym = ids.filter(i => !sortedInv[i].hasSymbol);
const noHelp = ids.filter(i => !sortedInv[i].hasHelp);
const noDef = ids.filter(i => !sortedInv[i].hasDefinition);
const defOrphan = [...defKeys].filter(k => !sortedInv[k]).sort(cmp);
const daeNoLib = [...dae.keys()].filter(k => !sortedInv[k]).sort(cmp);
const daeNoEq = [...dae.keys()].filter(k => !eqKeys.has(k)).sort(cmp);
const eqNoDae = ids.filter(i => sortedInv[i].hasEquation && !sortedInv[i].daeCase);
const symOrphan = [...symbols].filter(k => !sortedInv[k]).sort(cmp);
const byClass: Record<string, string[]> = {};
for (const i of noEq) (byClass[classify(i)] ||= []).push(i);
const domainCount: Record<string, number> = {};
for (const i of ids) domainCount[sortedInv[i].domainGroup] = (domainCount[sortedInv[i].domainGroup] || 0) + 1;

const md = W([
  '# V-Lab inventory gaps (generated by scripts/vlab_review/inventory.ts, do not hand-edit)',
  '',
  '## Why the counts differ',
  `- Library = ${ids.length} unique block ids (${VLAB_LIBRARY.reduce((n, d) => n + d.blocks.length, 0)} entries${dupIds.length ? `, duplicate ids: ${dupIds.join(', ')}` : ''}). Component definitions (${defKeys.size}) are help/LaTeX text only, so ${noDef.length} library blocks lack one and ${defOrphan.length} definitions have no library block.`,
  `- Equations (${eqKeys.size} keys in \`blockEquations\`) cover ${ids.length - noEq.length} library blocks; ${noEq.length} library blocks have none and ${orphanEq.length} keys are orphans (aliases/legacy casings).`,
  `- DAEAssembler has ${dae.size} \`case\` labels in one \`switch (blockType)\`. It does not hold equations. It only allocates extra unknowns (branch currents/forces/fluxes, signal-output branches, internal states). Blocks without a case get no branch and no state, so their equation may only use across values.`,
  `- Symbols: ${symbols.size} type keys in RawSymbolRenderer; ${noSym.length} library blocks fall through to \`UnknownSymbolGlyph\` (see F-006).`,
  '',
  '## Counts',
  '| Item | Count |', '|---|---|',
  `| Library blocks (unique) | ${ids.length} |`,
  ...Object.keys(domainCount).sort(cmp).map(d => `| &nbsp;&nbsp;domain group ${d} | ${domainCount[d]} |`),
  `| Component definitions | ${defKeys.size} |`,
  `| blockEquations keys | ${eqKeys.size} |`,
  `| DAEAssembler case labels | ${dae.size} |`,
  `| Symbol type keys | ${symbols.size} |`,
  `| HELP_DATA topics (topic-level only, no per-block pages) | ${helpTopicKeys.size} |`,
  `| Library block without equation | ${noEq.length} |`,
  `| Orphan equation (no library block) | ${orphanEq.length} |`,
  `| Blocks with a port lacking \`domain\` | ${portNoDomain.length} (all ports lack it: ${portNoDomainFull.length}) |`,
  `| Blocks with library ports never read | ${unreadPorts.length} |`,
  `| Blocks with dead params | ${deadParams.length} |`,
  `| Blocks reading a param not exposed (incl. aliases) | ${hidden.length} |`,
  `| Library block without symbol | ${noSym.length} |`,
  `| Library block with no help mention | ${noHelp.length} |`,
  `| Equation trace threw (unknown) | ${unknownTrace.length} |`,
  '',
  '## Library block without equation',
  ...Object.keys(byClass).sort(cmp).flatMap(c => [`### ${c} (${byClass[c].length})`, list(byClass[c]), '']),
  '## Orphan equations (key in blockEquations, no library block)',
  list(orphanEq), '',
  '## Ports without a domain',
  `Library ports carry no \`domain\` field for these blocks; the domain is only implied by the group. All-ports-missing blocks: ${portNoDomainFull.length}. Partially missing: ${portNoDomain.length - portNoDomainFull.length}.`,
  '',
  `Partially missing: ${list(portNoDomain.filter(i => !portNoDomainFull.includes(i)))}`,
  '',
  `Fully missing: ${list(portNoDomainFull)}`, '',
  '## Library ports never read by the equation',
  'Port index i of `across`/`dAcross` is mapped to library port i (assumes the assembler orders across values by library ports). Reads of `branch`/`state` are indices into DAE-allocated unknowns, not ports (see `equationTrace` in inventory.json). Signal-output ports written via DAE branches are also reported here, so cross-check with the DAE case.',
  '', '| Block | Unread ports | Ports read |', '|---|---|---|', ...unreadPorts, '',
  '## Dead params (in library, never read by the equation)',
  '| Block | Dead params |', '|---|---|', ...deadParams, '',
  '## Hidden params (read by the equation, not in library; aliases such as `resistance` are expected noise)',
  '| Block | Params read but not exposed |', '|---|---|', ...hidden, '',
  '## Equation trace failed (unknown)',
  list(unknownTrace), '',
  '## No symbol (falls back to UnknownSymbolGlyph, answers F-006)',
  list(noSym), '',
  '## Symbol keys with no library block',
  list(symOrphan), '',
  '## No help mention (id or name never appears in any HELP_DATA topic)',
  list(noHelp), '',
  '## Definitions',
  `Library blocks without definition (${noDef.length}): ${list(noDef)}`, '',
  `Definitions without library block (${defOrphan.length}): ${list(defOrphan)}`, '',
  '## DAEAssembler cross-reference',
  `Cases with no library block (${daeNoLib.length}): ${list(daeNoLib)}`, '',
  `Cases with no equation (${daeNoEq.length}): ${list(daeNoEq)}`, '',
  `Blocks with equation but no DAE case (${eqNoDae.length}; fine for across-only blocks): ${list(eqNoDae)}`, '',
]);
fs.writeFileSync(path.join(OUT, 'inventory-gaps.md'), md);
console.log(`inventory: ${ids.length} blocks, ${eqKeys.size} equations, ${dae.size} dae cases, ${noSym.length} no-symbol`);
