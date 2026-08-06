import type { XBSemanticStateSlot } from './xbSemanticModel';

export type XBNoiseStateSlotRole = 'rng_state' | 'spare_normal' | 'has_spare_normal';

export interface XBNoiseStateSlot extends XBSemanticStateSlot {
  readonly role: XBNoiseStateSlotRole;
}

export interface XBNextUniformResult {
  readonly state: number;
  readonly uniform: number;
}

export interface XBNextGaussianResult {
  readonly state: number;
  readonly gaussian: number;
  readonly hasSpare: boolean;
}

const XORSHIFT_MAGIC = 0x6d2b79f5;
const MAX_UINT32 = 0xffffffff;
const UNIFORM_SCALE = 1 / 4294967296;

export function nextXorShift32(state: number): XBNextUniformResult {
  let s = state | 0;
  if (s === 0) s = XORSHIFT_MAGIC;
  s = (s ^ (s << 13)) >>> 0;
  s = (s ^ (s >>> 17)) >>> 0;
  s = (s ^ (s << 5)) >>> 0;
  return { state: s, uniform: (s + 0.5) * UNIFORM_SCALE };
}

export interface XBNextGaussianResult {
  readonly state: number;
  readonly gaussian: number;
  readonly spare: number;
  readonly hasSpare: boolean;
}

export function nextGaussianPair(state: number): XBNextGaussianResult {
  let s = state | 0;
  if (s === 0) s = XORSHIFT_MAGIC;
  const { state: s1, uniform: u1 } = nextXorShift32(s);
  const { state: s2, uniform: u2 } = nextXorShift32(s1);
  const r = Math.sqrt(-2.0 * Math.log(u1));
  const g = r * Math.sin(2.0 * Math.PI * u2);
  const spare = r * Math.cos(2.0 * Math.PI * u2);
  return { state: s2, gaussian: g, spare, hasSpare: true };
}
