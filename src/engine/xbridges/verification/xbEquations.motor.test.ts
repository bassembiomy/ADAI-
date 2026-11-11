/**
 * WP-08 - gates V2/V3 for power electronics, PWM and modulation, motor control, torque optimisation and the
 * motor transforms. Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3, 4.2, 9).
 *
 * Oracles (written here, never taken from the code under test):
 *  - Motor Control Blockset conventions: amplitude-invariant Clarke, d-axis aligned with phase a Park;
 *  - closed forms: two-level inverter phase-to-neutral voltages, H-bridge, SPWM / carrier comparison duty,
 *    SVPWM dwell times T1 = k Ts sin(60 deg - th), T2 = k Ts sin(th), min-max zero-sequence injection;
 *  - physical invariants: balanced sets sum to zero, induction motor below synchronous speed, load lowers speed;
 *  - hand-evaluated documented laws (scalar V/f); field weakening by properties only.
 * Failures of the product are pinned with it.fails and a provisional finding id (XBV-0xx, renumbered by the controller).
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, runModel } from '../testkit';

const near = (actual: number, expected: number, tol: number, what = '') =>
  expect(Math.abs(actual - expected), `${what} got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);

/** One block instance with the state threaded through execute (the state object is mutated or replaced as the engine does). */
const make = (type: string, params: Record<string, unknown> = {}) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  let state = b.state;
  return {
    block: b,
    call: (inputs: unknown[], t = 0): number[] => {
      const r = b.execute(inputs as never, b.params, state, t);
      if (r.nextState !== undefined) state = r.nextState;
      return (r.outputs as unknown[]).map(Number);
    },
  };
};
const once = (type: string, inputs: unknown[], params: Record<string, unknown> = {}, t = 0) => make(type, params).call(inputs, t);

const TWO_PI = 2 * Math.PI;
const balanced = (th: number) => [Math.cos(th), Math.cos(th - TWO_PI / 3), Math.cos(th + TWO_PI / 3)];

// ---------------------------------------------------------------------------------------------------------------
describe('1. Clarke / Park / inverse transforms (Motor Control Blockset, amplitude invariant, d aligned with phase a)', () => {
  it('CLARKE_TRANSFORM: alpha = a, beta = (a + 2b)/sqrt(3) for a balanced set', () => {
    for (const th of [0, 0.3, 1.1, 2.5, -1.7, 4.0]) {
      const [a, b, c] = balanced(th);
      const [al, be] = once('CLARKE_TRANSFORM', [a, b, c]);
      near(al, a, 1e-12, 'alpha');
      near(be, (a + 2 * b) / Math.sqrt(3), 1e-12, 'beta');
      near(be, Math.sin(th), 1e-12, 'beta = sin(theta) for the cosine set');
    }
  });
  it('CLARKE_TRANSFORM power-invariant mode scales the amplitude-invariant result by sqrt(3/2)', () => {
    const [a, b, c] = balanced(0.8);
    const [al, be] = once('CLARKE_TRANSFORM', [a, b, c], { mode: 'power_invariant' });
    near(al, Math.sqrt(1.5) * Math.cos(0.8), 1e-12);
    near(be, Math.sqrt(1.5) * Math.sin(0.8), 1e-12);
  });
  it('PARK_TRANSFORM: d = alpha cos + beta sin, q = -alpha sin + beta cos (hand values)', () => {
    const [d, q] = once('PARK_TRANSFORM', [2, 3, Math.PI / 2]);
    near(d, 3, 1e-12);
    near(q, -2, 1e-12);
    const [d0, q0] = once('PARK_TRANSFORM', [2, 3, 0]);
    near(d0, 2, 1e-12);
    near(q0, 3, 1e-12);
  });
  it('Clarke then Park of a balanced cosine set gives d = 1, q = 0 for any theta', () => {
    for (const th of [0, 0.3, 1.9, -2.2, 3.14, 5.5, 12.0]) {
      const [a, b, c] = balanced(th);
      const [al, be] = once('CLARKE_TRANSFORM', [a, b, c]);
      const [d, q] = once('PARK_TRANSFORM', [al, be, th]);
      near(d, 1, 1e-12, `d @ ${th}`);
      near(q, 0, 1e-12, `q @ ${th}`);
    }
  });
  it('INVERSE_PARK: alpha = d cos - q sin, beta = d sin + q cos (hand values)', () => {
    const [al, be] = once('INVERSE_PARK', [2, 3, Math.PI / 2]);
    near(al, -3, 1e-12);
    near(be, 2, 1e-12);
  });
  it('inverse Park then inverse Clarke returns the balanced a, b, c; Park then inverse Park is identity', () => {
    for (const th of [0, 0.3, 1.9, -2.2, 5.5]) {
      const [al, be] = once('INVERSE_PARK', [1, 0, th]);
      const [a, b, c] = once('INVERSE_CLARKE', [al, be]);
      const e = balanced(th);
      near(a, e[0], 1e-12); near(b, e[1], 1e-12); near(c, e[2], 1e-12);
      const [d, q] = once('PARK_TRANSFORM', [0.7, -1.3, th]);
      const [al2, be2] = once('INVERSE_PARK', [d, q, th]);
      near(al2, 0.7, 1e-12); near(be2, -1.3, 1e-12);
    }
  });
  it('INVERSE_CLARKE: va = alpha, vb = -alpha/2 + sqrt(3)/2 beta, vc = -alpha/2 - sqrt(3)/2 beta; sum 0', () => {
    const [a, b, c] = once('INVERSE_CLARKE', [0.4, -0.9]);
    near(a, 0.4, 1e-12);
    near(b, -0.2 - (Math.sqrt(3) / 2) * 0.9, 1e-12);
    near(c, -0.2 + (Math.sqrt(3) / 2) * 0.9, 1e-12);
    near(a + b + c, 0, 1e-12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('2. VOLTAGE_REFERENCE_GENERATOR (documented phase origin: sine, va = A sin(2 pi f t))', () => {
  const T = 1 / 50;
  const gen = (t: number) => once('VOLTAGE_REFERENCE_GENERATOR', [50], { amplitude: 1 }, t);
  it('sum of the three phases is 0 at every t', () => {
    for (let k = 0; k <= 400; k++) {
      const t = k * 0.0007;
      const [a, b, c] = gen(t);
      near(a + b + c, 0, 1e-12, `t=${t}`);
    }
  });
  it('phases are 120 degrees apart: vb(t) = va(t - T/3), vc(t) = va(t - 2T/3)', () => {
    for (let k = 0; k <= 200; k++) {
      const t = k * 0.0013;
      const [, vb, vc] = gen(t);
      near(vb, gen(t - T / 3)[0], 1e-12, `vb t=${t}`);
      near(vc, gen(t - (2 * T) / 3)[0], 1e-12, `vc t=${t}`);
    }
  });
  it('phase origin: va(0) = 0 and va(T/4) = 1 (sine); peak is 1', () => {
    near(gen(0)[0], 0, 1e-12);
    near(gen(T / 4)[0], 1, 1e-12);
    let peak = 0;
    for (let k = 0; k < 2000; k++) peak = Math.max(peak, ...gen((k * T) / 2000).map(Math.abs));
    near(peak, 1, 1e-6);
    expect(peak).toBeLessThanOrEqual(1 + 1e-12);
  });
  it('amplitude parameter scales the output', () => {
    near(once('VOLTAGE_REFERENCE_GENERATOR', [50], { amplitude: 230 * Math.SQRT2 }, T / 4)[0], 230 * Math.SQRT2, 1e-9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('3-4. SINGLE_PHASE_H_BRIDGE and THREE_PHASE_INVERTER (ideal)', () => {
  it('H-bridge: vout = (g1 - g2) (vdc_p - vdc_n) for the four gate states, Vdc 400 / 0', () => {
    for (const g1 of [0, 1]) for (const g2 of [0, 1]) {
      near(once('SINGLE_PHASE_H_BRIDGE', [400, 0, g1, g2])[0], (g1 - g2) * 400, 1e-12, `g=${g1}${g2}`);
    }
  });
  it('H-bridge uses the difference vdc_p - vdc_n', () => {
    near(once('SINGLE_PHASE_H_BRIDGE', [410, 10, 1, 0])[0], 400, 1e-12);
    near(once('SINGLE_PHASE_H_BRIDGE', [410, 10, 0, 1])[0], -400, 1e-12);
  });
  // Oracle: van = Vdc/3 (2Sa - Sb - Sc), vbn = Vdc/3 (2Sb - Sa - Sc), vcn = Vdc/3 (2Sc - Sa - Sb) (Mohan, Power Electronics, 8.3).
  it('THREE_PHASE_INVERTER: phase-to-neutral voltages for all 8 switching states (Vdc 400)', () => {
    for (let s = 0; s < 8; s++) {
      const Sa = (s >> 2) & 1, Sb = (s >> 1) & 1, Sc = s & 1;
      const [a, b, c] = once('THREE_PHASE_INVERTER', [400, 0, Sa, Sb, Sc]);
      const k = 400 / 3;
      near(a, k * (2 * Sa - Sb - Sc), 1e-9, `van state ${s}`);
      near(b, k * (2 * Sb - Sa - Sc), 1e-9, `vbn state ${s}`);
      near(c, k * (2 * Sc - Sa - Sb), 1e-9, `vcn state ${s}`);
      near(a + b + c, 0, 1e-9, `sum state ${s}`);
    }
  });
  it('THREE_PHASE_INVERTER: states 000 and 111 give 0; Vdc is vdc_p - vdc_n', () => {
    for (const s of [0, 1]) once('THREE_PHASE_INVERTER', [410, 10, s, s, s]).forEach((v) => near(v, 0, 1e-12));
    const [a] = once('THREE_PHASE_INVERTER', [410, 10, 1, 0, 0]);
    near(a, (2 * 400) / 3, 1e-9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('5. PWM_GENERATOR (triangle carrier 50 Hz, 1000 samples per carrier period)', () => {
  const T = 1 / 50;
  const samples = (duty: number): number[] => {
    const m = make('PWM_GENERATOR', { frequency: 50, carrierType: 'triangle' });
    const out: number[] = [];
    for (let k = 0; k < 1000; k++) out.push(m.call([duty], (k * T) / 1000)[0]);
    return out;
  };
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  for (const d of [0.1, 0.5, 0.9]) {
    it(`average over one carrier period equals duty ${d} (2/1000)`, () => {
      near(mean(samples(d)), d, 2 / 1000);
    });
  }
  it('duty 0 gives always 0', () => {
    expect(samples(0).every((x) => x === 0)).toBe(true);
  });
  // Simulink PWM Generator: a duty cycle of 100 % keeps the output at 1 for the whole period. The block compares
  // duty > carrier (strict); at the peak sample the accumulated phase is 0.49999999999999994 so it holds today, but the
  // comparison is only safe by floating-point luck (carrier = 1 exactly at phase 0.5).
  it('duty 1 gives always 1', () => {
    expect(samples(1).every((x) => x === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('6. THREE_PHASE_PWM (SPWM, 50 Hz carrier)', () => {
  const T = 1 / 50;
  const gateSeq = (vref: number, port = 0): number[] => {
    const m = make('THREE_PHASE_PWM', { frequency: 50, method: 'SPWM' });
    const out: number[] = [];
    for (let k = 0; k < 1000; k++) out.push(m.call([vref, vref, vref], (k * T) / 1000)[port]);
    return out;
  };
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  for (const v of [-0.5, 0, 0.8]) {
    it(`average duty over a carrier period = (1 + v_ref)/2 for v_ref ${v} (2/1000)`, () => {
      for (const port of [0, 1, 2]) near(mean(gateSeq(v, port)), (1 + v) / 2, 2 / 1000, `gate ${port}`);
    });
  }
  it('v_ref above 1 is saturated (gate always 1), below -1 gate always 0', () => {
    expect(gateSeq(1.5).every((x) => x === 1)).toBe(true);
    expect(gateSeq(-1.5).every((x) => x === 0)).toBe(true);
  });
  // Simulink: gate = 1 when v_ref > carrier with a symmetric triangle carrier in [-1, 1]; the pulse is therefore
  // symmetric about the carrier period centre: gate(t) = gate(T - t). The block compares with a sawtooth (the phase).
  // v_ref values chosen off the 1000-point sample grid of the carrier: -0.5 and 0.5 equal the triangle exactly at
  // k = 125/875 and 375/625, where rounding alone breaks the symmetry even for a correct block (WP-08 verifier).
  it.fails('XBV-070: THREE_PHASE_PWM compares against a triangle carrier: gate pattern symmetric about the period centre', () => {
    for (const v of [-0.47, 0.53]) {
      const g = gateSeq(v);
      for (let k = 1; k < 1000; k++) expect(g[k], `v_ref ${v}, k=${k}`).toBe(g[1000 - k]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('7. SVPWM_CORE (Ts 1e-4, Vdc 400)', () => {
  const core = (mag: number, angDeg: number) => {
    const a = (angDeg * Math.PI) / 180;
    return once('SVPWM_CORE', [mag * Math.cos(a), mag * Math.sin(a)], { Ts: 1e-4, Vdc: 400 });
  };
  it('|V| = 100 at 30 degrees: sector 1, t1 = t2 = sqrt(3) Ts |V|/Vdc sin(30 deg), t0 = Ts - t1 - t2', () => {
    const [sec, t1, t2, t0] = core(100, 30);
    const e = Math.sqrt(3) * 1e-4 * 0.25 * 0.5;
    expect(sec).toBe(1);
    near(t1, e, 1e-15, 't1');
    near(t2, e, 1e-15, 't2');
    near(t0, 1e-4 - 2 * e, 1e-15, 't0');
  });
  it('general angle in sector: t1 = k Ts sin(60 - th), t2 = k Ts sin(th) (th = 12 degrees in sector 3)', () => {
    const [sec, t1, t2, t0] = core(120, 132);
    const k = (Math.sqrt(3) * 120) / 400;
    const th = (12 * Math.PI) / 180;
    expect(sec).toBe(3);
    near(t1, 1e-4 * k * Math.sin(Math.PI / 3 - th), 1e-15);
    near(t2, 1e-4 * k * Math.sin(th), 1e-15);
    near(t0, 1e-4 - t1 - t2, 1e-15);
  });
  it('sector = floor(angle/60 deg) + 1 for angles 10..350 step 20', () => {
    for (let a = 10; a <= 350; a += 20) expect(core(100, a)[0], `angle ${a}`).toBe(Math.floor(a / 60) + 1);
  });
  it('zero vector: t1 = t2 = 0, t0 = Ts', () => {
    const [, t1, t2, t0] = core(0, 0);
    near(t1, 0, 1e-15); near(t2, 0, 1e-15); near(t0, 1e-4, 1e-15);
  });
  // Over-modulation (SVPWM literature, e.g. Holtz 1992): when t1 + t2 > Ts, scale t1' = t1 Ts/(t1+t2),
  // t2' = t2 Ts/(t1+t2), t0 = 0, preserving the ratio t1:t2. The block clamps only t0 to 0 and leaves t1 + t2 > Ts.
  it.fails('XBV-071: SVPWM_CORE over-modulation (|V| = 300 at 30 deg) scales t1, t2 so that t1 + t2 = Ts and t0 = 0', () => {
    const [, t1, t2, t0] = core(300, 30);
    near(t1 + t2, 1e-4, 1e-15, 't1+t2');
    near(t0, 0, 1e-15, 't0');
    near(t1 / t2, 1, 1e-12, 'ratio');
  });
  it('over-modulation: t0 is 0 and never negative', () => {
    expect(core(300, 30)[3]).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('8. ZERO_SEQUENCE_INJECTION (min-max)', () => {
  it('v_mod = v + v0 with v0 = -(max + min)/2 for the balanced set at theta = 0.3', () => {
    const v = balanced(0.3);
    const v0 = -(Math.max(...v) + Math.min(...v)) / 2;
    const out = once('ZERO_SEQUENCE_INJECTION', v);
    out.forEach((o, i) => near(o, v[i] + v0, 1e-12, `phase ${i}`));
  });
  it('peak of the modulated set for amplitude 1 is sqrt(3)/2', () => {
    let peak = 0;
    for (let k = 0; k < 36000; k++) {
      const out = once('ZERO_SEQUENCE_INJECTION', balanced((k * TWO_PI) / 36000));
      peak = Math.max(peak, ...out.map(Math.abs));
    }
    near(peak, Math.sqrt(3) / 2, 1e-6);
    expect(peak).toBeLessThanOrEqual(Math.sqrt(3) / 2 + 1e-12);
  });
  it('line-to-line differences are unchanged by the injection', () => {
    const v = balanced(1.2);
    const o = once('ZERO_SEQUENCE_INJECTION', v);
    near(o[0] - o[1], v[0] - v[1], 1e-12);
    near(o[1] - o[2], v[1] - v[2], 1e-12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('9. SIX_STEP_COMMUTATION', () => {
  const hall = (code: string) => once('SIX_STEP_COMMUTATION', code.split('').map(Number));
  const [AH, AL, BH, BL, CH, CL] = [0, 1, 2, 3, 4, 5];
  const valid = ['101', '100', '110', '010', '011', '001'];
  it('each valid Hall state turns on exactly one high-side and one low-side switch, in different phases', () => {
    for (const code of valid) {
      const g = hall(code);
      const high = [g[AH], g[BH], g[CH]], low = [g[AL], g[BL], g[CL]];
      expect(high.reduce((s, x) => s + x, 0), `${code} high`).toBe(1);
      expect(low.reduce((s, x) => s + x, 0), `${code} low`).toBe(1);
      expect(high.indexOf(1), `${code} same phase`).not.toBe(low.indexOf(1));
      g.forEach((x) => expect([0, 1]).toContain(x));
    }
  });
  it('the six valid states give six distinct patterns', () => {
    expect(new Set(valid.map((c) => hall(c).join(''))).size).toBe(6);
  });
  it('in rotation order each step turns one switch off and one on (6-step sequence, cyclic)', () => {
    for (const order of [valid, [...valid].reverse()]) {
      for (let i = 0; i < 6; i++) {
        const a = hall(order[i]), b = hall(order[(i + 1) % 6]);
        const changed = a.filter((x, k) => x !== b[k]).length;
        expect(changed, `${order[i]} -> ${order[(i + 1) % 6]}`).toBe(2);
      }
    }
  });
  it('invalid Hall states 000 and 111 turn all switches off', () => {
    expect(hall('000')).toEqual([0, 0, 0, 0, 0, 0]);
    expect(hall('111')).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('10. MTPA_CONTROLLER (Ld 0.01, Lq 0.02, psi_m 0.1, pole pairs P = 1 passed explicitly)', () => {
  // The factory has no pole-pair parameter today (it hard-codes 2); P = 1 is passed so that a fix that adds the
  // parameter makes the pins flip (WP-08 verifier).
  const Ld = 0.01, Lq = 0.02, psi = 0.1, p = 1;
  const torque = (id: number, iq: number) => 1.5 * p * (psi * iq + (Ld - Lq) * id * iq);
  const mtpa = (te: number) => once('MTPA_CONTROLLER', [te], { Ld, Lq, psi_m: psi, P: p });
  it('te_ref = 0 gives id = iq = 0', () => {
    const [id, iq] = mtpa(0);
    near(id, 0, 1e-15); near(iq, 0, 1e-15);
  });
  it('negative te_ref gives negative iq and the same id as |te_ref|', () => {
    for (const te of [1, 3, 5]) {
      const [idp, iqp] = mtpa(te), [idn, iqn] = mtpa(-te);
      expect(iqp).toBeGreaterThan(0);
      expect(iqn).toBeLessThan(0);
      near(idn, idp, 1e-12, 'id');
      near(iqn, -iqp, 1e-12, 'iq');
    }
  });
  // Te = 1.5 p (psi_m iq + (Ld - Lq) id iq) (Krause / MCB PMSM torque). The block hard-codes 2 pole pairs and
  // id = -0.2 |iq|, so the returned currents do not produce te_ref for p = 1 (nor for p = 2).
  it.fails('XBV-072: MTPA_CONTROLLER returned (id, iq) produce te_ref = 1, 3, 5 (1e-9 relative)', () => {
    for (const te of [1, 3, 5]) {
      const [id, iq] = mtpa(te);
      near(torque(id, iq), te, 1e-9 * te, `te_ref ${te}`);
    }
  });
  // MTPA optimality: on the constant-torque curve through the returned point, the norm is minimal there.
  it.fails('XBV-073: MTPA_CONTROLLER (id, iq) is the minimum-current point of its constant-torque curve (id +/- 1e-3 raises |i|)', () => {
    for (const te of [1, 3, 5]) {
      const [id, iq] = mtpa(te);
      const T = torque(id, iq);
      const norm = (i: number) => Math.hypot(i, T / (1.5 * p * (psi + (Ld - Lq) * i)));
      const n0 = Math.hypot(id, iq);
      expect(norm(id + 1e-3), `te ${te} +`).toBeGreaterThan(n0);
      expect(norm(id - 1e-3), `te ${te} -`).toBeGreaterThan(n0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('11. FIELD_WEAKENING', () => {
  // Only properties of any voltage-limiting field-weakening law are checked (limits, no weakening below v_max,
  // monotone weakening above it). The exact PI law is not a plan section 3 oracle (it would be copied from the
  // factory), so per-value checks wait for the Simulink/MCB reference in WP-15.
  const params = { v_max: 300, Kp: 0.1, Ki: 1, id_min: -20, id_max: 10 };
  const seq = (vmag: (k: number) => number, idBase: number, n: number, dt: number, extra = {}) => {
    const m = make('FIELD_WEAKENING', { ...params, ...extra });
    const out: number[] = [];
    for (let k = 1; k <= n; k++) out.push(m.call([vmag(k), idBase], k * dt)[0]);
    return out;
  };
  it('id_ref stays within [id_min, id_max] for a sweep of v_mag', () => {
    const o = seq((k) => 150 + 5 * k + 200 * Math.sin(k / 7), 5, 400, 0.01);
    o.forEach((x, k) => {
      expect(x, `k=${k}`).toBeGreaterThanOrEqual(-20);
      expect(x, `k=${k}`).toBeLessThanOrEqual(10);
    });
  });
  it('id_base above id_max is limited to id_max', () => {
    near(seq(() => 100, 50, 3, 0.01)[2], 10, 1e-12);
  });
  it('v_mag below v_max held: id_ref does not go below id_base', () => {
    seq(() => 200, 5, 100, 0.01).forEach((x) => expect(x).toBeGreaterThanOrEqual(5 - 1e-12));
  });
  it('v_mag above v_max held: id_ref decreases monotonically until id_min', () => {
    const o = seq(() => 400, 5, 100, 0.01);
    for (let k = 1; k < o.length; k++) expect(o[k], `k=${k}`).toBeLessThanOrEqual(o[k - 1] + 1e-12);
    expect(o[0]).toBeLessThan(5);
    near(o[o.length - 1], -20, 1e-12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('12. AC_INDUCTION_MOTOR (rk4, dt 1e-4; P = pole pairs: torque 1.5 P ..., electrical speed P omega)', () => {
  const P = 2;
  const motor = (amp: number, tl: number, stop: number) => runModel(buildModel({
    blocks: [
      { id: 'f', type: 'Constant', params: { value: 50 } },
      { id: 'g', type: 'VOLTAGE_REFERENCE_GENERATOR', params: { amplitude: amp } },
      { id: 'l', type: 'Constant', params: { value: tl } },
      { id: 'm', type: 'AC_INDUCTION_MOTOR', params: { P } },
    ],
    wires: ['f.out -> g.f', 'g.va -> m.va', 'g.vb -> m.vb', 'g.vc -> m.vc', 'l.out -> m.tl'],
  }), { solver: 'rk4', dt: 1e-4, stopTime: stop, probes: ['m.ia', 'm.ib', 'm.ic', 'm.omega', 'm.te', 'm.theta'] });
  const col = (r: ReturnType<typeof motor>, p: string) => r.signals[p].map(Number);
  const wSync = (TWO_PI * 50) / P; // mechanical synchronous speed, rad/s

  it('(a) zero supply, zero load from rest: all states and outputs stay 0', () => {
    const r = motor(0, 0, 0.2);
    expect(r.t.length).toBeGreaterThan(100);
    for (const p of ['m.ia', 'm.ib', 'm.ic', 'm.omega', 'm.te', 'm.theta']) col(r, p).forEach((x) => near(x, 0, 1e-12, p));
  });
  const free = motor(230 * Math.SQRT2, 0, 2);
  it('(b) balanced 50 Hz, 230 V rms: after 2 s speed is positive and below synchronous speed 2 pi 50 / P', () => {
    const w = col(free, 'm.omega');
    const wEnd = w[w.length - 1];
    expect(wEnd).toBeGreaterThan(0);
    expect(wEnd).toBeLessThan(wSync);
    expect(Number.isFinite(wEnd)).toBe(true);
  });
  it('(b) torque is positive on average while accelerating (J dw/dt = Te - B w, speed grows over the first 0.3 s)', () => {
    const w = col(free, 'm.omega'), te = col(free, 'm.te'), t = free.t;
    const n = t.findIndex((x) => x >= 0.3);
    expect(w[n]).toBeGreaterThan(w[0]);
    expect(te.slice(0, n).reduce((s, x) => s + x, 0) / n).toBeGreaterThan(0);
  });
  it('(c) a load torque lowers the steady speed (higher slip) and the speed stays positive', () => {
    const loaded = motor(230 * Math.SQRT2, 3, 2);
    const w0 = col(free, 'm.omega'), w1 = col(loaded, 'm.omega');
    expect(w1[w1.length - 1]).toBeGreaterThan(0);
    expect(w1[w1.length - 1]).toBeLessThan(w0[w0.length - 1]);
  });
  it('(d) ia + ib + ic = 0 at every sample (1e-9 relative to |i|)', () => {
    const a = col(free, 'm.ia'), b = col(free, 'm.ib'), c = col(free, 'm.ic');
    a.forEach((x, k) => {
      const scale = Math.max(1, Math.abs(x), Math.abs(b[k]), Math.abs(c[k]));
      expect(Math.abs(x + b[k] + c[k])).toBeLessThanOrEqual(1e-9 * scale);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('13. IM_SCALAR_CONTROL (v_f_ratio 4, boost 10, rated_f 50; documented V = Vf f + Vboost, f = w_ref / 2 pi)', () => {
  const T25 = 1 / 25;
  const w25 = TWO_PI * 25;
  const ctl = (w: number, t: number) => once('IM_SCALAR_CONTROL', [w], { v_f_ratio: 4, boost: 10, rated_f: 50 }, t);
  it('amplitude = boost + v_f_ratio f = 110 V at f = 25 Hz (w_ref = 2 pi 25 rad/s): va(T/4) = 110, vb = vc = -55', () => {
    const [a, b, c] = ctl(w25, T25 / 4);
    near(a, 110, 1e-9); near(b, -55, 1e-9); near(c, -55, 1e-9);
  });
  it('balanced: sum 0, rms-derived amplitude constant, phases 120 degrees apart (vb(t) = va(t - T/3))', () => {
    for (let k = 0; k < 200; k++) {
      const t = k * 0.0007;
      const [a, b, c] = ctl(w25, t);
      near(a + b + c, 0, 1e-9, `sum t=${t}`);
      near(Math.sqrt((2 / 3) * (a * a + b * b + c * c)), 110, 1e-9, `amp t=${t}`);
      near(b, ctl(w25, t - T25 / 3)[0], 1e-9, `vb t=${t}`);
      near(c, ctl(w25, t - (2 * T25) / 3)[0], 1e-9, `vc t=${t}`);
    }
  });
  it('w_ref = 0 gives a constant balanced set of the boost amplitude 10 (sum 0)', () => {
    const [a, b, c] = ctl(0, 0.123);
    near(a + b + c, 0, 1e-12);
    near(Math.sqrt((2 / 3) * (a * a + b * b + c * c)), 10, 1e-12);
  });
  it('amplitude follows the line at 50 Hz: 4 * 50 + 10 = 210 V', () => {
    const [a] = ctl(TWO_PI * 50, 1 / 200);
    near(a, 210, 1e-9);
  });
});

describe('PWM edge cases (controller review)', () => {
  // Oracle: duty 1 means always on (Simulink PWM: compare >= carrier, or duty 1 saturates on). The 50 Hz triangle
  // carrier reaches 1 at t = 0.01 s; a strict 'duty > carrier' turns the output off there.
  it.fails('XBV-074: PWM_GENERATOR with duty 1 stays on at the carrier peak (t = 0.01 s at 50 Hz)', () => {
    const b = BLOCK_LIBRARY['PWM_GENERATOR']('x', { frequency: 50, carrierType: 'triangle' });
    expect(Number(b.execute([1] as never, b.params, b.state, 0.01).outputs[0])).toBe(1);
  });
});
