import { describe, it, expect } from 'vitest';
import {
  normalizeVector3,
  computeRelativeAngleAxis,
} from './vlabFrameKinematics';
import { blockEquations, BlockEquationArgs } from './vlabEquations';

const PI = Math.PI;

const baseArgs = (overrides: Partial<BlockEquationArgs>): BlockEquationArgs => ({
  across: [], dAcross: [], branch: [], dBranch: [], state: [], dState: [],
  ctx: {} as any, params: {}, ports: [], nodeId: 'n1',
  ...overrides,
});

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

describe('dist_constraint equation: lambda mapped onto a 3D reaction force', () => {
  it('balances a satisfied distance constraint along the B->F direction', () => {
    const res = blockEquations.dist_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 3, 4, 0, 0, 0]],
      branch: [10, 0, 6, 8, 5, 10],
      params: { dist: 5 },
      ports: ['b', 'f', 'd', 'f_reac'],
      nodeId: 'd1',
    }));
    for (const r of res) expect(r).toBeCloseTo(0, 10);
  });

  it('drives lambda to zero when B and F coincide at a zero target', () => {
    const res = blockEquations.dist_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [7, 0, 0, 0],
      params: { dist: 0 },
      ports: ['b', 'f'],
      nodeId: 'd1',
    }));
    expect(res[0]).toBeCloseTo(7, 10);
    expect(res[1]).toBeCloseTo(0, 10);
    expect(res[2]).toBeCloseTo(0, 10);
    expect(res[3]).toBeCloseTo(0, 10);
  });

  it('throws a diagnostic error for a nonzero target with an undefined direction', () => {
    expect(() => blockEquations.dist_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [1, 0, 0, 0],
      params: { dist: 5 },
      ports: ['b', 'f'],
      nodeId: 'd1',
    }))).toThrow(/d1.*distance direction.*undefined/i);
  });
});

describe('angle_constraint equation: lambda mapped onto a 3D reaction torque', () => {
  it('balances a satisfied angle constraint along the relative rotation axis', () => {
    const res = blockEquations.angle_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, PI / 2, 0]],
      branch: [12, 0, 12, 0, 90, 12],
      params: { angle: 90 },
      ports: ['b', 'f', 'ang', 't_reac'],
      nodeId: 'a1',
    }));
    for (const r of res) expect(Math.abs(r)).toBeLessThan(1e-10);
  });

  it('drives lambda to zero when orientations coincide at a zero target', () => {
    const res = blockEquations.angle_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [9, 0, 0, 0],
      params: { angle: 0 },
      ports: ['b', 'f'],
      nodeId: 'a1',
    }));
    expect(res[0]).toBeCloseTo(9, 10);
    expect(res[1]).toBeCloseTo(0, 10);
    expect(res[2]).toBeCloseTo(0, 10);
    expect(res[3]).toBeCloseTo(0, 10);
  });

  it('throws a diagnostic error for a nonzero target with an undefined axis', () => {
    expect(() => blockEquations.angle_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [1, 0, 0, 0],
      params: { angle: 90 },
      ports: ['b', 'f'],
      nodeId: 'a1',
    }))).toThrow(/a1.*rotation axis.*undefined/i);
  });
});
