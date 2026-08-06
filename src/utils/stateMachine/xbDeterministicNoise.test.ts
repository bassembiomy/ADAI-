import { describe, expect, it } from 'vitest';
import { nextGaussianPair, nextXorShift32 } from './xbDeterministicNoise';

function takeUniforms(seed: number, count: number): { states: number[]; uniforms: number[] } {
  const states: number[] = [];
  const uniforms: number[] = [];
  let s = seed | 0;
  for (let i = 0; i < count; i += 1) {
    const result = nextXorShift32(s);
    states.push(result.state);
    uniforms.push(result.uniform);
    s = result.state;
  }
  return { states, uniforms };
}

function takeGaussians(seed: number, count: number): number[] {
  const values: number[] = [];
  let s = seed | 0;
  for (let i = 0; i < count; i += 1) {
    const result = nextGaussianPair(s);
    values.push(result.gaussian);
    s = result.state;
  }
  return values;
}

describe('nextXorShift32', () => {
  it('matches the xorshift32 golden vector', () => {
    const { states, uniforms } = takeUniforms(0x6d2b79f5, 4);
    expect(states).toEqual([0x40aec71f, 0x91e00c19, 0x9c0fe128, 0x6570f69d]);
    const expectedUniforms = states.map((s) => (s + 0.5) / 4294967296);
    expect(uniforms).toEqual(expectedUniforms);
  });

  it('rejects zero seed and replaces with deterministic magic', () => {
    const zeroResult = nextXorShift32(0);
    const magicResult = nextXorShift32(0x6d2b79f5);
    expect(zeroResult.state).toBe(magicResult.state);
    expect(zeroResult.uniform).toBe(magicResult.uniform);
  });
});

describe('nextGaussianPair', () => {
  it('never passes zero to log during Box-Muller conversion', () => {
    expect(takeGaussians(1, 1000).every(Number.isFinite)).toBe(true);
  });

  it('returns a spare normal value and advances state by two uniforms', () => {
    const result = nextGaussianPair(0x6d2b79f5);
    expect(result.hasSpare).toBe(true);
    expect(typeof result.spare).toBe('number');
    expect(Number.isFinite(result.spare)).toBe(true);
    const after = nextXorShift32(0x6d2b79f5);
    const after2 = nextXorShift32(after.state);
    expect(result.state).toBe(after2.state);
  });

  it('produces equal traces for equal seeds', () => {
    const a = takeGaussians(1234, 50);
    const b = takeGaussians(1234, 50);
    expect(a).toEqual(b);
  });
});
