import { describe, it, expect } from 'vitest';
import {
  normalizeVector3,
  computeRelativeAngleAxis,
} from './vlabFrameKinematics';

const PI = Math.PI;

describe('normalizeVector3', () => {
  it('normalizes a well-defined vector', () => {
    const result = normalizeVector3([0, 3, 4]);
    expect(result.unit[0]).toBeCloseTo(0, 10);
    expect(result.unit[1]).toBeCloseTo(0.6, 10);
    expect(result.unit[2]).toBeCloseTo(0.8, 10);
    expect(result.magnitude).toBeCloseTo(5, 10);
    expect(result.defined).toBe(true);
  });

  it('flags a zero vector as undefined', () => {
    const result = normalizeVector3([0, 0, 0]);
    expect(result.unit).toEqual([0, 0, 0]);
    expect(result.magnitude).toBeCloseTo(0, 10);
    expect(result.defined).toBe(false);
  });
});

describe('computeRelativeAngleAxis', () => {
  it('computes a quarter turn about Y', () => {
    const result = computeRelativeAngleAxis([0, 0, 0], [0, PI / 2, 0]);
    expect(result.angle).toBeCloseTo(PI / 2, 10);
    expect(result.axis[0]).toBeCloseTo(0, 8);
    expect(result.axis[1]).toBeCloseTo(1, 8);
    expect(result.axis[2]).toBeCloseTo(0, 8);
    expect(result.axisDefined).toBe(true);
  });

  it('flags coincident orientations as a zero, undefined-axis rotation', () => {
    const result = computeRelativeAngleAxis([0, 0, 0], [0, 0, 0]);
    expect(result.angle).toBeCloseTo(0, 10);
    expect(result.axis).toEqual([0, 0, 0]);
    expect(result.axisDefined).toBe(false);
  });

  it('handles the half-turn (PI) singularity about Z', () => {
    const result = computeRelativeAngleAxis([0, 0, 0], [0, 0, PI]);
    expect(Number.isFinite(result.angle)).toBe(true);
    expect(result.angle).toBeCloseTo(PI, 8);
    expect(Math.abs(result.axis[2])).toBeCloseTo(1, 6);
  });
});
