/**
 * Acceptance tests — final review of X-Bridges blocks against Simulink block semantics.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-final-simulink-review.md
 * Each test names the review finding (R1..R8) it covers.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';

type Conn = [string, string, string, string];
const b = (type: string, id: string, params: Record<string, unknown> = {}) => BLOCK_LIBRARY[type](id, params);
const exec = (type: string, params: Record<string, unknown>, inputs: unknown[], t = 0) => {
  const block = b(type, 'x', params);
  return block.execute(inputs as any[], block.params, block.state, t).outputs;
};
const run = (blocks: any[], conns: Conn[], options: Record<string, unknown>) => {
  const e = new XbridgesEngine({
    blocks,
    connections: conns.map(([sourceBlock, sourcePort, targetBlock, targetPort]) => ({ sourceBlock, sourcePort, targetBlock, targetPort })),
  } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.01, ...options } as any);
  expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return e;
};
const chain = (src: any, blk: any, inPort: string, outPort: string, options: Record<string, unknown>) =>
  Number(run([src, blk, b('TERMINATOR', 't')], [[src.id, src.outputs[0].id, blk.id, inPort], [blk.id, outPort, 't', 'u']], options)
    .getSignalValue(blk.id, outPort));

describe('R1 palette integrity: every palette block exists and instantiates', () => {
  const types = (XBRIDGES_CATEGORIES as any[]).flatMap((c) => (c.blocks ?? []).map((x: any) => x.type));
  it.each(types)('%s', (type) => {
    expect(typeof BLOCK_LIBRARY[type]).toBe('function');
    expect(() => BLOCK_LIBRARY[type](`${type}_1`, {})).not.toThrow();
  });
});

describe('R2 trigonometric / hyperbolic functions (MATLAB definitions)', () => {
  it('COSEC(u) = 1/sin(u)', () => {
    expect(Number(exec('COSEC', {}, [0.5])[0])).toBeCloseTo(1 / Math.sin(0.5), 12);
  });
  it('ACOSECH(u) = acsch(u) = asinh(1/u)', () => {
    expect(Number(exec('ACOSECH', {}, [2])[0])).toBeCloseTo(Math.asinh(0.5), 12);
    expect(Number(exec('ACOSECH', {}, [-0.5])[0])).toBeCloseTo(Math.asinh(-2), 12);
  });
});

describe('R3 Rate Limiter: slew rates are per second (Simulink)', () => {
  it('inherited sample time: rising 1/s limits a 0 -> 10 step to ~1 after 1 s', () => {
    expect(chain(b('Constant', 'src', { value: 10 }), b('RATE_LIMITER', 'r', { risingSlewRate: 1, fallingSlewRate: -1 }), 'u', 'y', {}))
      .toBeCloseTo(1, 1);
  });
  it('falling -2/s limits a 0 -> -10 step to ~-2 after 1 s', () => {
    expect(chain(b('Constant', 'src', { value: -10 }), b('RATE_LIMITER', 'r', { risingSlewRate: 1, fallingSlewRate: -2 }), 'u', 'y', {}))
      .toBeCloseTo(-2, 1);
  });
  it('result does not depend on the solver step', () => {
    const y = (fixedStep: number) => chain(b('Constant', 'src', { value: 10 }), b('RATE_LIMITER', 'r', { risingSlewRate: 1, fallingSlewRate: -1 }), 'u', 'y', { fixedStep });
    expect(Math.abs(y(0.01) - y(0.001))).toBeLessThan(0.02);
  });
  it('explicit discrete sample time Ts = 0.1: slew per second, updated at hits', () => {
    expect(chain(b('Constant', 'src', { value: 10 }), b('RATE_LIMITER', 'r', { risingSlewRate: 1, fallingSlewRate: -1, sampleTime: 0.1 }), 'u', 'y', {}))
      .toBeCloseTo(1, 1);
  });
});

describe('R4 Delay (palette "Unit Delay", N samples) honours its sample time', () => {
  const delayed = (stopTime: number) => chain(
    b('Step', 'src', { stepTime: 0.5, initialValue: 0, finalValue: 1 }),
    b('DELAY', 'd', { delay_length: 2, sampleTime: 0.1 }), 'u', 'y', { stopTime, fixedStep: 0.05 },
  );
  it('keeps sampleTime in its parameters', () => {
    expect(b('DELAY', 'd', { delay_length: 2, sampleTime: 0.1 }).params.sampleTime).toBe(0.1);
  });
  it('a step at 0.5 delayed by 2 samples of 0.1 s appears at 0.7, not after 2 solver steps', () => {
    expect(delayed(0.65)).toBe(0);
    expect(delayed(0.75)).toBe(1);
  });
});

describe('R5 PID: the selected controller form is honoured in continuous time', () => {
  for (const type of ['PID_BASIC', 'PID_CONTROLLER']) {
    it(`${type} mode P with Ki = 2: u = Kp*e only`, () => {
      const blk = b(type, 'p', { Kp: 1, Ki: 2, Kd: 0, mode: 'P', min: -100, max: 100 });
      const src = b('Constant', 'src', { value: 1 });
      const conns: Conn[] = type === 'PID_BASIC'
        ? [['src', 'out', 'p', 'e'], ['p', 'u', 't', 'u']]
        : [['src', 'out', 'p', 'r'], ['zero', 'out', 'p', 'y'], ['p', 'u', 't', 'u']];
      const e = run([src, b('Constant', 'zero', { value: 0 }), blk, b('TERMINATOR', 't')], conns, {});
      expect(Number(e.getSignalValue('p', 'u'))).toBeCloseTo(1, 9);
    });
  }
});

describe('R6 Relay: Output when on / Output when off (Simulink parameters)', () => {
  it('defaults to numeric 1 / 0', () => {
    expect(exec('RELAY', {}, [2])[0]).toBe(1);
    expect(exec('RELAY', {}, [-1])[0]).toBe(0);
  });
  it('uses onValue / offValue', () => {
    expect(exec('RELAY', { onValue: 5, offValue: -5 }, [2])[0]).toBe(5);
    expect(exec('RELAY', { onValue: 5, offValue: -5 }, [-1])[0]).toBe(-5);
  });
});

describe('R7 Switch: Simulink default criterion u2 >= Threshold', () => {
  it('a new Switch passes the first input when the control equals the threshold', () => {
    const sw = b('SWITCH', 's', {});
    expect(sw.params.criteria).toBe('>=');
    expect(sw.execute([10, 20, 0], sw.params, sw.state, 0).outputs[0]).toBe(10);
  });
  it('an explicit ">" criterion keeps its behaviour', () => {
    expect(exec('SWITCH', { criteria: '>' }, [10, 20, 0])[0]).toBe(20);
  });
});
