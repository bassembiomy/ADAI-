import { BLOCK_LIBRARY } from '../BlockDefinitions';
import type { ModelSpec } from './model';

/** Deterministic PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scalar, well-conditioned library blocks. */
export const DEFAULT_RANDOM_GRAPH_TYPES: string[] = [
  'Constant', 'GAIN', 'Sum', 'PRODUCT', 'Abs', 'UnaryNeg', 'SATURATION', 'SIN', 'COS', 'UNIT_DELAY', 'Integrator', 'TERMINATOR',
];

const STATEFUL_NO_FEEDTHROUGH = new Set(['UNIT_DELAY', 'Integrator']);

function paramsFor(type: string, rnd: () => number): Record<string, unknown> | undefined {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  switch (type) {
    case 'Constant': return { value: r2(rnd() * 4 - 2) };
    case 'GAIN': return { gain: r2(0.25 + rnd() * 1.75) * (rnd() < 0.5 ? -1 : 1) };
    case 'Sum': return { signs: rnd() < 0.5 ? '++' : '+-' };
    case 'SATURATION': { const lo = r2(0.5 + rnd() * 2); return { lowerLimit: -lo, upperLimit: r2(lo + 0.5 + rnd() * 2) }; }
    case 'UNIT_DELAY': return { initialCondition: r2(rnd() * 2 - 1), sampleTime: 0.1 };
    case 'Integrator': return { initialCondition: r2(rnd() * 2 - 1) };
    default: return undefined;
  }
}

/**
 * Random DAG of feed-through blocks plus feedback edges only into stateful, non-feed-through blocks
 * (UNIT_DELAY, Integrator), so there is never an algebraic loop. Every input is driven exactly once.
 */
export function randomGraph(seed: number, opts: { blocks?: number; types?: string[] } = {}): ModelSpec {
  const n = opts.blocks ?? 12;
  const types = opts.types ?? DEFAULT_RANDOM_GRAPH_TYPES;
  if (!Number.isInteger(n) || n < 1) throw new Error(`randomGraph: invalid block count ${n}`);
  if (types.length === 0) throw new Error('randomGraph: no block types');
  for (const t of types) if (typeof BLOCK_LIBRARY[t] !== 'function') throw new Error(`randomGraph: unknown block type '${t}'`);
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

  const sourceTypes = types.filter((t) => BLOCK_LIBRARY[t]('p', {}).inputs.length === 0 && BLOCK_LIBRARY[t]('p', {}).outputs.length > 0);
  const blocks: ModelSpec['blocks'] = [];
  for (let i = 0; i < n; i++) {
    let type = pick(types);
    // Block 0 needs no earlier source: it must be an input-free source (e.g. Constant) when one exists.
    if (i === 0 && sourceTypes.length > 0) type = pick(sourceTypes);
    blocks.push({ id: `b${i}`, type, params: paramsFor(type, rnd) });
  }

  const info = blocks.map((b) => BLOCK_LIBRARY[b.type](b.id, b.params ?? {}));
  const wires: string[] = [];
  for (let i = 0; i < n; i++) {
    const feedback = STATEFUL_NO_FEEDTHROUGH.has(blocks[i].type);
    for (const inp of info[i].inputs) {
      // Candidates: earlier blocks with outputs; stateful blocks may also take any block (feedback).
      const cands: number[] = [];
      for (let j = 0; j < n; j++) {
        if (info[j].outputs.length === 0) continue;
        if (j < i || (feedback && j !== i) || (feedback && j === i)) cands.push(j);
      }
      if (cands.length === 0) throw new Error(`randomGraph: no source available for ${blocks[i].id}.${inp.id}`);
      const j = pick(cands);
      const out = pick(info[j].outputs);
      wires.push(`b${j}.${out.id} -> b${i}.${inp.id}`);
    }
  }
  return { blocks, wires };
}
