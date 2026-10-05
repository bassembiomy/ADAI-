/**
 * WP-03: per-block catalog contract checks, shared by contract.test.ts and the expected-failure generator
 * (scripts/vlab_review/genContractExpectedFailures.ts). Pure analysis of the live tree; nothing here fixes a block.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VLAB_LIBRARY, type VLabBlock } from '../../../utils/vlabLibrary';
import { blockEquations } from '../vlabEquations';
import {
  REPO_ROOT, assembleSingleBlock, libraryDefaults, parseDaeCaseLabels, routeToScope, traceBlock,
  type SingleBlockAssembly, type Trace,
} from './contractInventory';
import {
  ANY_DOMAIN_BLOCKS, BLOCK_CLASSIFICATION, CONSERVING_DOMAINS, KNOWN_PORT_DOMAINS, ORPHAN_EQUATION_KEYS,
  ENGINE_CONSUMED_PARAMS, PARAM_ALIASES, UTILITY_REASONS,
} from './blockClassification';

export const CHECK_IDS = [
  'unique-ids', 'classification', 'port-domains', 'equation-factory', 'params-hidden', 'params-dead',
  'dae-allocation', 'scope-routing', 'equation-doc',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_TITLES: Record<CheckId, string> = {
  'unique-ids': 'unique block id and unique port ids',
  'classification': 'explicit class; utility has reason and no conserving ports',
  'port-domains': 'every port has an explicit, known domain (no fallback)',
  'equation-factory': 'exactly one equation factory (and at most one DAE case)',
  'params-hidden': 'every param the equation reads is exposed or a documented alias',
  'params-dead': 'every exposed param is read by the equation',
  'dae-allocation': 'DAE branches/states allocated == consumed; residual length == allocated unknowns',
  'scope-routing': 'every signal output port is reachable by a scope through the real routing path',
  'equation-doc': 'library equation text is specific (not generic or missing)',
};

export type WpId =
  | 'WP-06a' | 'WP-06b' | 'WP-08' | 'WP-09' | 'WP-19a'
  | 'WP-10' | 'WP-11' | 'WP-12' | 'WP-13' | 'WP-13b' | 'WP-14' | 'WP-15' | 'WP-16' | 'WP-17' | 'WP-18' | 'WP-19' | 'WP-20' | 'WP-21';

export const ALL_WPS: WpId[] = [
  'WP-06a', 'WP-06b', 'WP-08', 'WP-09', 'WP-19a',
  'WP-10', 'WP-11', 'WP-12', 'WP-13', 'WP-13b', 'WP-14', 'WP-15', 'WP-16', 'WP-17', 'WP-18', 'WP-19', 'WP-20', 'WP-21',
];

export type ExpectedFailures = Record<string, Partial<Record<CheckId, WpId>>>;

export interface BlockContext {
  group: string;
  block: VLabBlock;
  trace: Trace | null;
  assembly: SingleBlockAssembly;
  /** ports the equation never reads as `across`, resolved to physical-signal domain, not on the left edge */
  signalOutputPorts: string[];
}

const GENERIC_EQUATION = /governing\s+(physical\s+|dae\s+)?equation\s*$/i;
export const isGenericText = (s: string | undefined) => !!s && GENERIC_EQUATION.test(s.trim());

let cache: BlockContext[] | null = null;

export function buildContexts(): BlockContext[] {
  if (cache) return cache;
  const out: BlockContext[] = [];
  for (const d of VLAB_LIBRARY) {
    for (const block of d.blocks) {
      const ids = block.ports.map(p => p.id);
      const trace = traceBlock(block.id, libraryDefaults(block), ids);
      const assembly = assembleSingleBlock(block);
      const read = new Set<number>(trace ? [...trace.across, ...trace.dAcross] : []);
      const signalOutputPorts = block.ports
        .filter((p, i) => assembly.portDomains[p.id] === 'physical' && !read.has(i) &&
          (BLOCK_CLASSIFICATION[block.id] === 'source' ? p.pos === 'right' : p.pos !== 'left'))
        .map(p => p.id);
      out.push({ group: d.type, block, trace, assembly, signalOutputPorts });
    }
  }
  cache = out;
  return out;
}

const idCounts = (): Map<string, number> => {
  const m = new Map<string, number>();
  for (const d of VLAB_LIBRARY) for (const b of d.blocks) m.set(b.id, (m.get(b.id) ?? 0) + 1);
  return m;
};

/** Returns the list of problems per check; an empty list means the check passes. */
export function evaluateBlock(ctx: BlockContext): Record<CheckId, string[]> {
  const { block, trace, assembly } = ctx;
  const res = Object.fromEntries(CHECK_IDS.map(c => [c, [] as string[]])) as Record<CheckId, string[]>;

  // 1. unique ids
  if ((idCounts().get(block.id) ?? 0) !== 1) res['unique-ids'].push(`block id appears ${idCounts().get(block.id)} times in VLAB_LIBRARY`);
  const seenPorts = new Set<string>();
  for (const p of block.ports) {
    if (seenPorts.has(p.id)) res['unique-ids'].push(`duplicate port id "${p.id}"`);
    seenPorts.add(p.id);
  }

  // 2. classification
  const cls = BLOCK_CLASSIFICATION[block.id];
  if (!cls) res['classification'].push('block has no entry in blockClassification.ts');
  if (cls === 'utility') {
    if (!UTILITY_REASONS[block.id]?.trim()) res['classification'].push('utility block has no written reason');
  }
  if (cls === 'utility' || cls === 'signal') {
    for (const p of block.ports) {
      if (p.domain && CONSERVING_DOMAINS.has(p.domain.toLowerCase())) {
        res['classification'].push(`${cls} block owns conserving-domain port "${p.id}" (${p.domain}); it is physical`);
      }
    }
  }

  // 3. explicit domains
  for (const p of block.ports) {
    if (!p.domain) { res['port-domains'].push(`port "${p.id}" has no explicit domain`); continue; }
    const d = p.domain.toLowerCase();
    if (!KNOWN_PORT_DOMAINS.has(d)) res['port-domains'].push(`port "${p.id}" has unknown domain "${p.domain}"`);
    if (d === 'any' && !ANY_DOMAIN_BLOCKS.has(block.id)) res['port-domains'].push(`port "${p.id}" uses wildcard domain "Any"`);
  }

  // 4. exactly one equation factory
  if (typeof blockEquations[block.id] !== 'function') res['equation-factory'].push('no equation factory');
  const sameName = Object.keys(blockEquations).filter(k => k.toLowerCase() === block.id.toLowerCase());
  const extra = sameName.filter(k => k !== block.id && !(k in ORPHAN_EQUATION_KEYS));
  if (extra.length) res['equation-factory'].push(`undocumented duplicate factory keys: ${extra.join(', ')}`);
  const daeCount = parseDaeCaseLabels().filter(l => l === block.id).length;
  if (daeCount > 1) res['equation-factory'].push(`${daeCount} DAEAssembler case labels for this block`);

  // 5. params
  if (trace && !trace.threw) {
    const libKeys = Object.keys(block.params || {});
    const aliases = PARAM_ALIASES[block.id] ?? {};
    const hidden = [...trace.params].filter(k => !libKeys.includes(k) && !(k in aliases));
    if (hidden.length) res['params-hidden'].push(`equation reads params not exposed by the library: ${hidden.join(', ')}`);
    const aliasTargets = new Set(Object.entries(aliases).filter(([k]) => trace.params.has(k)).map(([, v]) => v));
    // utility blocks are non-simulating: their params are configuration consumed by the UI/engine, not by an equation
    const engineConsumed = new Set((ENGINE_CONSUMED_PARAMS[block.id] ?? []).flatMap(e => e.params));
    const dead = cls === 'utility' ? [] : libKeys.filter(k => !trace.params.has(k) && !aliasTargets.has(k) && !engineConsumed.has(k));
    if (dead.length) res['params-dead'].push(`library params never read by the equation: ${dead.join(', ')}`);
  } else if (trace?.threw) {
    res['params-hidden'].push('equation threw while traced; param reads unknown');
  }

  // 6. DAE allocation
  if (!assembly.assembled) {
    res['dae-allocation'].push(`single-block assembly failed: ${assembly.error}`);
  } else {
    const alloc = assembly.allocatedBranches + assembly.allocatedStates;
    if (assembly.equationCount !== alloc) res['dae-allocation'].push(`equationCount ${assembly.equationCount} != allocated ${alloc}`);
    if (assembly.residualError) res['dae-allocation'].push(`equation threw for correctly sized args: ${assembly.residualError}`);
    else if (blockEquations[block.id] && assembly.residualLength !== alloc) {
      res['dae-allocation'].push(`equation returns ${assembly.residualLength} residuals but DAE allocates ${alloc} unknowns (${assembly.allocatedBranches} branch + ${assembly.allocatedStates} state)`);
    }
    if (trace && !trace.threw) {
      const bRead = new Set([...trace.branch, ...trace.dBranch]);
      const sRead = new Set([...trace.state, ...trace.dState]);
      const bOver = [...bRead].filter(i => i >= assembly.allocatedBranches);
      const sOver = [...sRead].filter(i => i >= assembly.allocatedStates);
      if (bOver.length) res['dae-allocation'].push(`equation reads branch index ${bOver.join(',')} but only ${assembly.allocatedBranches} allocated`);
      if (sOver.length) res['dae-allocation'].push(`equation reads state index ${sOver.join(',')} but only ${assembly.allocatedStates} allocated`);
    }
  }

  // 7. scope routing of signal outputs
  if (cls !== 'utility') {
    for (const portId of ctx.signalOutputPorts) {
      const r = routeToScope(block, portId);
      if (r.routing !== 'ok') res['scope-routing'].push(`output port "${portId}": ${r.routing}${r.detail ? ` (${r.detail})` : ''}`);
    }
  }

  // 9. equation documentation
  if (!block.equation?.trim()) res['equation-doc'].push('library block has no equation text');
  else if (isGenericText(block.equation)) res['equation-doc'].push(`generic equation label: "${block.equation}"`);
  if (isGenericText(block.description)) res['equation-doc'].push(`generic description label: "${block.description}"`);

  return res;
}

// ── WP routing for expected failures ──
const JOINTS = new Set(['revolute_joint', 'prismatic_joint', 'spherical_joint', 'universal_joint', 'weld_joint']);
const MULTIBODY_CATEGORIES = new Set(['Belts & Cables', 'Frames & Transforms', 'Constraints', 'Forces & Torques', 'Joints', 'Gears', 'Multibody Utilities']);
const GEAR_CONVERTER = new Set([
  'common_gear', 'rack_pinion', 'rotational_electromechanical_converter', 'translational_electromechanical_converter',
  'belt_end', 'belt_spool', 'pulley', 'belt_properties', 'rot_multibody_interface', 'trans_multibody_interface',
]);

export function portsWp(ctx: BlockContext): WpId {
  const cat = ctx.block.category ?? '';
  if (['Electrical', 'Magnetic', 'Thermal'].includes(ctx.group)) return 'WP-06a';
  if (ctx.group === 'Physical' && !MULTIBODY_CATEGORIES.has(cat)) return 'WP-06a';
  return 'WP-06b';
}

export function equationWp(ctx: BlockContext): WpId {
  const { group, block } = ctx;
  const cat = block.category ?? '';
  if (JOINTS.has(block.id)) return 'WP-19a';
  if (GEAR_CONVERTER.has(block.id)) return 'WP-13b';
  switch (group) {
    case 'Electrical':
      if (cat === 'Semiconductors' || block.id === 'switch') return 'WP-11';
      if (['Machines', 'Couplings'].includes(cat)) return 'WP-12';
      if (cat === 'Utilities') return 'WP-20';
      return 'WP-10';
    case 'Magnetic': return 'WP-16';
    case 'Gas': return 'WP-18';
    case 'Thermal': return 'WP-15';
    case 'Fluid': case 'Fluid / Steam': case 'Isothermal Liquid': return 'WP-17';
    case 'Mechanical':
      return /^(rot_|inertia|torque_|ang_vel|gear_box)/.test(block.id) ? 'WP-13' : 'WP-14';
    case 'Physical':
      if (['Constraints', 'Forces & Torques', 'Frames & Transforms', 'Multibody Utilities'].includes(cat)) return 'WP-19';
      if (block.id === 'pwm_3ph_2level') return 'WP-12';
      return 'WP-20';
    default: return 'WP-21';
  }
}

export function wpFor(ctx: BlockContext, check: CheckId): WpId | null {
  switch (check) {
    case 'port-domains': return portsWp(ctx);
    // WP-08 fixed every alias/hidden/meaningless parameter; what remains is a physical parameter the published
    // equation needs, owned by the block's domain WP.
    case 'params-hidden': case 'params-dead': return equationWp(ctx);
    case 'dae-allocation': case 'scope-routing': return JOINTS.has(ctx.block.id) ? 'WP-19a' : 'WP-09';
    case 'equation-doc': return equationWp(ctx);
    default: return null; // unique-ids, classification, equation-factory must pass today; never expected to fail
  }
}

// ── Library-wide statistics for docs/vlab-review/contract-status.md ──
export function countUnsafeNumericFallbacks(): number {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src/engine/vlab/vlabEquations.ts'), 'utf8');
  return (src.match(/params\.\w+\s*\|\|/g) ?? []).length;
}

export function libraryStats() {
  const blocks = VLAB_LIBRARY.flatMap(d => d.blocks);
  const ports = blocks.flatMap(b => b.ports);
  const noDomainPorts = ports.filter(p => !p.domain);
  const noDomainBlocks = blocks.filter(b => b.ports.some(p => !p.domain));
  const genericBlocks = blocks.filter(b => isGenericText(b.equation) || isGenericText(b.description));
  const noEquationText = blocks.filter(b => !b.equation?.trim());
  return {
    blocks: blocks.length,
    ports: ports.length,
    noDomainPorts: noDomainPorts.length,
    noDomainBlocks: noDomainBlocks.length,
    genericLabels: genericBlocks.length,
    noEquationText: noEquationText.length,
    unsafeFallbacks: countUnsafeNumericFallbacks(),
  };
}
