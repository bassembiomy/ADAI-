import { describe, expect, it } from 'vitest';
import { normalizePidParameters } from './xbPidContract';
import type { XBSolverConfig } from './xbModel';

describe('normalizePidParameters', () => {
  const solver: XBSolverConfig = {
    kind: 'euler',
    stepSeconds: 0.1,
  };

  it('normalizes defaults without truthy-value loss', () => {
    expect(normalizePidParameters({ Kp: 0, Ki: 0, Kd: 0, min: -1, max: 1 }, solver).kp).toBe(0);
  });

  it.each([
    { min: 2, max: 1 }, { sampleTime: 0 }, { N: -1 }, { method: 'unknown' },
  ])('rejects invalid PID parameters %#', parameters => {
    expect(() => normalizePidParameters(parameters as any, solver)).toThrow();
  });

  it('falls back to solver step size for missing sample time', () => {
    const params = normalizePidParameters({}, solver);
    expect(params.sampleTime).toBe(0.1);
  });

  it('parses fully specified parameters', () => {
    const p = normalizePidParameters({
      mode: 'discrete',
      Kp: 1.5,
      Ki: 2.5,
      Kd: 3.5,
      N: 50,
      b: 0.8,
      c: 0.9,
      LowerSaturationLimit: -10,
      UpperSaturationLimit: 10,
      method: 'Trapezoidal',
      sampleTime: 0.05
    }, solver);

    expect(p).toEqual({
      mode: 'discrete',
      kp: 1.5,
      ki: 2.5,
      kd: 3.5,
      filterN: 50,
      beta: 0.8,
      gamma: 0.9,
      minimum: -10,
      maximum: 10,
      method: 'Trapezoidal',
      sampleTime: 0.05,
    });
  });
});
