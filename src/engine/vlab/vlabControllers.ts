/**
 * WP-20b: controllers, estimators, motor / converter controllers and learning blocks of the Physical library, implemented from the
 * published algorithms (every equation cites its source; nothing here is a placeholder gain any more).
 *
 *  - General controllers: Simulink "PID Controller" (parallel form, derivative filter, output saturation, back-calculation
 *    anti-windup), state feedback u = Nr r - K x, Slotine and Li sliding mode u = -k sat(s/phi), Smith predictor (O. J. M. Smith,
 *    "Closer control of loops with dead time", Chem. Eng. Prog. 53(5), 1957), Luenberger observer (Luenberger 1966).
 *  - Motor / converter controllers: Clarke -> Park -> PI with decoupling feed-forward -> inverse Park (Vas, "Vector Control of AC
 *    Machines", 1990; Krause, Wasynczuk, Sudhoff, "Analysis of Electric Machinery"), Takahashi-Noguchi direct torque control,
 *    scalar V/f, six-step Hall commutation (Krishnan, "Permanent Magnet Synchronous and Brushless DC Motor Drives"), per-phase
 *    hysteresis current control, quadrature decoding, resolver-to-digital type II tracking loop (Boyes, Analog Devices AD2S1200).
 *  - Learning blocks: LMS (Widrow and Hoff 1960) and tabular epsilon-greedy Q-learning (Watkins and Dayan 1992).
 *
 * Discrete memory (sampled controllers, relays, counters, the Q-table) is NEVER a module-level cache: it is the committed vector of
 * the block in the state's history (vlabHistory.committedMemory). The equation computes its outputs from that vector and the current
 * inputs; the block's recorder (`controllerHistory`) advances the vector with the SAME function from the accepted solution. A new run
 * starts from `initial(params)`; two runs never share memory and a rejected attempt can not change it.
 *
 * Conventions: through variables are positive A -> B, SI units, three-phase quantities are amplitude invariant (Clarke 2/3), dq
 * frame "Aligned with A" (d axis on phase a at theta = 0, the frame of the `pmsm` block), phase sequence a, b, c = sin(th),
 * sin(th - 2 pi/3), sin(th + 2 pi/3). The three-phase / dq / abc ports are width-N vectors (vlabVectorPorts).
 * Every numeric parameter is read through numericParam BEFORE any branch (so the parameter trace sees it in every mode).
 */
import type { BlockEquationArgs, BlockEquationFactory } from './vlabEquations';
import { numericParam, parseNumeric, unwrapParam, vectorParam, VLabParamError } from './vlabParams';
import { scalarInput, vectorInput } from './vlabVectorPorts';
import { committedMemory, historyAt, type BlockHistorySpec } from './vlabHistory';

/** Time resolution of the discontinuous / sampled blocks: an event is taken at t >= k Ts - SIGNAL_TIME_QUANTUM / 2 [s]. */
export const SIGNAL_TIME_QUANTUM = 1e-9;
/** Logic threshold of the physical-signal logic inputs (reset, Z index): high when > 0.5. */
const LOGIC_THRESHOLD = 0.5;

const TWO_PI = 2 * Math.PI;
const SQRT3 = Math.sqrt(3);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── argument helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A port that is wired to another block (direct unit-test calls without `connectedPorts` assume every port is wired). */
export const portWired = (a: Pick<BlockEquationArgs, 'ports' | 'connectedPorts'>, id: string): boolean =>
  a.ports.includes(id) && (!a.connectedPorts || a.connectedPorts.includes(id));
/** Optional scalar input: the port value when wired, `fallback` when open (an open port must not be read: the assembler hands 0). */
const optScalar = (a: BlockEquationArgs, id: string, fallback: number): number => (portWired(a, id) ? scalarInput(a, id) : fallback);
const optVector = (a: BlockEquationArgs, id: string, width: number, fallback: number[]): number[] =>
  (portWired(a, id) ? vectorInput(a, id, width) : fallback);
/** d/dt of the signal at a scalar input port (discretised by the solver stencil, WP-20b sliding mode). */
const derivativeOf = (a: BlockEquationArgs, id: string): number => {
  const i = a.ports.indexOf(id);
  const v = i >= 0 ? a.dAcross[i] : 0;
  return typeof v === 'number' ? v : 0;
};

const paramError = (param: string, reason: string): never => {
  throw new VLabParamError([{ blockId: '', param, raw: undefined, code: 'invalid-parameter', reason: `Parameter "${param}": ${reason}.` }]);
};

/** `rows` x `cols` numeric matrix written as text ("[0 1; -1 -1]") or as an array of rows; a wrong shape is a parameter diagnostic. */
const matrixParam = (params: Record<string, any> | undefined, key: string, fallback: number[][], rows: number, cols: number, port: string): number[][] => {
  const v = unwrapParam(params?.[key]);
  let raw: unknown[][] = [];
  if (Array.isArray(v)) raw = v.map(r => (Array.isArray(r) ? r : [r]));
  else if (v !== undefined && v !== null) {
    raw = String(v).replace(/[[\]]/g, ' ').split(/[;\n]+/).map(r => r.trim()).filter(Boolean).map(r => r.split(/[\s,]+/).filter(Boolean));
  }
  const m: number[][] = raw.length === 0 ? fallback : raw.map(r => r.map(item => {
    const p = parseNumeric(item);
    if (p.kind !== 'ok') return paramError(key, `matrix element ${JSON.stringify(item)} is not a number`);
    return p.value;
  }));
  if (m.length !== rows || m.some(r => r.length !== cols)) {
    paramError(key, `must be a ${rows}x${cols} matrix (the width of ${port} is fixed), got ${m.length}x${m[0]?.length ?? 0}`);
  }
  return m;
};

// ── three-phase transforms (amplitude invariant, frame aligned with phase a) ───────────────────────────────────────────────────
const clarke = ([a, b, c]: number[]): [number, number] => [(2 / 3) * (a - b / 2 - c / 2), (b - c) / SQRT3];
const parkAligned = (al: number, be: number, th: number): [number, number] => {
  const c = Math.cos(th), s = Math.sin(th);
  return [al * c + be * s, -al * s + be * c];
};
const invParkAligned = (d: number, q: number, th: number): [number, number] => {
  const c = Math.cos(th), s = Math.sin(th);
  return [d * c - q * s, d * s + q * c];
};
const invClarke = (al: number, be: number): [number, number, number] => [al, -al / 2 + (SQRT3 / 2) * be, -al / 2 - (SQRT3 / 2) * be];
/** abc -> dq in the frame at electrical angle th (d on phase a at th = 0) */
export const abcToDq = (abc: number[], th: number): [number, number] => { const [al, be] = clarke(abc); return parkAligned(al, be, th); };
/** dq -> abc (zero sequence 0) */
export const dqToAbc = (d: number, q: number, th: number): [number, number, number] => { const [al, be] = invParkAligned(d, q, th); return invClarke(al, be); };

/** Circular voltage limit |v| <= vmax (Infinity = unlimited): the vector is scaled, its direction kept. */
const limitCircle = (vd: number, vq: number, vmax: number): [number, number] => {
  const m = Math.hypot(vd, vq);
  const lim = Math.abs(vmax);
  if (!(m > lim)) return [vd, vq];
  const s = lim / m;
  return [vd * s, vq * s];
};
/** Back-calculation gain of the Simulink PID Controller default, Kb = Ki / Kp (0 for a pure integral controller). */
const backCalcGain = (Kp: number, Ki: number): number => (Kp > 0 ? Ki / Kp : 0);

// ── sampled memory ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Index k of the sample grid k Ts the time `t` has reached (the time event of the sample is taken at t >= k Ts - quantum / 2). */
export const sampleIndex = (t: number, ts: number): number => Math.floor((t + SIGNAL_TIME_QUANTUM / 2) / ts);
const requirePositive = (name: string, v: number): number => (v > 0 ? v : paramError(name, 'must be greater than 0'));

/** Sample period [s] of the blocks that update on a fixed grid: the solver cuts its step at every k Ts (vlabPhysics). */
export const SAMPLE_PERIODS: Record<string, (params: Record<string, any>) => number> = {
  lms_adaptive_filter: p => numericParam(p, 'ts', 0.01),
  rl_q_learning_controller: p => numericParam(p, 'ts', 0.05),
  hysteresis_ctrl_3ph: p => numericParam(p, 'ts', 2e-5),
  im_dtc_ctrl: p => numericParam(p, 'ts', 5e-5),
  quad_decoder: p => numericParam(p, 'ts', 1e-3),
};
/** Blocks with an external reset input (level, high when > 0.5): the solver locates the edge (vlabPhysics). */
export const RESET_BLOCKS = new Set([
  'ps_pi_ctrl', 'ps_pid_ctrl', 'dcdc_ctrl', 'dc_current_ctrl', 'dc_voltage_ctrl', 'velocity_ctrl', 'bldc_current_ctrl',
  'bldc_pwm_ctrl', 'pmsm_curr_ctrl', 'im_curr_ctrl',
]);

interface Stepped { out: number[]; mem: number[] }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// General controllers
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const resetHigh = (a: BlockEquationArgs): boolean => optScalar(a, 'reset', 0) > LOGIC_THRESHOLD;

/**
 * Discrete PI, Simulink PID Controller (parallel form) with output saturation and back-calculation anti-windup:
 *   v = Kp e + I,  u = clamp(v, -limit, limit),  dI/dt = Ki e + Kb (u - v)
 * The integral state I is the integral TERM (units of u). With Kb = 0 the integrator winds up (no anti-windup); the Simulink
 * default is Kb = Ki / Kp. External reset (level, > 0.5) holds I = 0.
 */
const psPi: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 1);
  const Ki = numericParam(a.params, 'Ki', 10);
  const limit = Math.abs(numericParam(a.params, 'limit', 1));
  const Kb = numericParam(a.params, 'Kb', 10);
  const e = scalarInput(a, 'e');
  const rst = resetHigh(a);
  const I = a.state[0];
  const v = Kp * e + I;
  const u = clamp(v, -limit, limit);
  return [a.branch[0] - u, rst ? I : a.dState[0] - (Ki * e + Kb * (u - v))];
};

/**
 * Discrete PID, parallel form with derivative filter (Simulink PID Controller): U = (Kp + Ki/s + Kd N s/(s + N)) E, i.e.
 *   F: dF/dt = N (e - F),   D = Kd N (e - F) = Kd dF/dt,   v = Kp e + I + D,   u = clamp(v, -limit, limit),
 *   dI/dt = Ki e + Kb (u - v)  (back-calculation anti-windup).   External reset (level) holds I = 0, F = e.
 */
const psPid: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 1);
  const Ki = numericParam(a.params, 'Ki', 2);
  const Kd = numericParam(a.params, 'Kd', 0.1);
  const N = numericParam(a.params, 'N', 100);
  const limit = Math.abs(numericParam(a.params, 'limit', 240));
  const Kb = numericParam(a.params, 'Kb', 2);
  const e = scalarInput(a, 'e');
  const rst = resetHigh(a);
  const [I, F] = a.state;
  const v = Kp * e + I + Kd * N * (e - F);
  const u = clamp(v, -limit, limit);
  return [
    a.branch[0] - u,
    rst ? I : a.dState[0] - (Ki * e + Kb * (u - v)),
    rst ? F - e : a.dState[1] - N * (e - F),
  ];
};

/** State feedback u = Nr r - K x (K = 1 x 2 gain row of the width-2 state vector x; Nr = reference gain). */
const psStateFeedback: BlockEquationFactory = (a) => {
  const K = vectorParam(a.params, 'K', [1, 2]);
  const Nr = numericParam(a.params, 'Nr', 1);
  if (K.length !== 2) paramError('K', `has ${K.length} gain(s) but the state port x is a 2-element vector`);
  const r = scalarInput(a, 'r');
  const x = vectorInput(a, 'x', 2);
  return [a.branch[0] - (Nr * r - K[0] * x[0] - K[1] * x[1])];
};

/**
 * Sliding-mode controller (Slotine and Li, "Applied Nonlinear Control", ch. 7), relative degree 2: error e = y - r, sliding
 * surface s = de/dt + lambda e, boundary-layer control law u = -k sat(s / phi) (phi = 0: the ideal u = -k sign(s)).
 */
const psSlidingMode: BlockEquationFactory = (a) => {
  const lambda = numericParam(a.params, 'lambda', 1);
  const k = numericParam(a.params, 'k', 10);
  const phi = numericParam(a.params, 'boundary_layer', 0.05);
  const r = scalarInput(a, 'r');
  const y = scalarInput(a, 'y');
  const s = (derivativeOf(a, 'y') - derivativeOf(a, 'r')) + lambda * (y - r);
  const sat = phi > 0 ? clamp(s / phi, -1, 1) : Math.sign(s);
  return [a.branch[0] - (-k * sat)];
};

/**
 * Smith predictor (O. J. M. Smith, 1957) around a PI controller. The internal model (gain Km, lag tau, dead time theta) gives the
 * delay-free prediction ym and its delayed copy ym(t - theta); the controller acts on the compensated feedback
 *   e_c = r - (y + ym - ym(t - theta)),   u = Kp e_c + I,   dI/dt = Ki e_c,   tau dym/dt + ym = Km u.
 * With a perfect model y + ym - ym(t - theta) = ym: the loop sees the delay-free plant and y is its response shifted by theta.
 * ym(t - theta) is the committed history of the state ym (vlabHistory).
 */
const psSmithPredictor: BlockEquationFactory = (a) => {
  const tau = numericParam(a.params, 'tau', 0.1);
  const theta = numericParam(a.params, 'theta', 0.1);
  const Km = numericParam(a.params, 'Km', 1);
  const Kp = numericParam(a.params, 'Kp', 1);
  const Ki = numericParam(a.params, 'Ki', 10);
  if (theta < 0) paramError('theta', 'a dead time cannot be negative');
  const r = scalarInput(a, 'r');
  const y = scalarInput(a, 'y');
  const [ym, I] = a.state;
  const ymDelayed = historyAt(a.ctx, a.nodeId, a.ctx.time - theta, [ym], [0])[0];
  const ec = r - (y + ym - ymDelayed);
  const u = a.branch[0];
  return [
    u - (Kp * ec + I),
    requirePositive('tau', tau) * a.dState[0] - (Km * u - ym),
    a.dState[1] - Ki * ec,
  ];
};

/** Luenberger observer (Luenberger 1966) of a 2-state plant: dx^/dt = A x^ + B u + L (y - C x^). */
const luenbergerObserver: BlockEquationFactory = (a) => {
  const A = matrixParam(a.params, 'A', [[0, 1], [-1, -1]], 2, 2, 'xhat');
  const B = vectorParam(a.params, 'B', [0, 1]);
  const C = vectorParam(a.params, 'C', [1, 0]);
  const L = vectorParam(a.params, 'L', [10, 10]);
  for (const [name, v] of [['B', B], ['C', C], ['L', L]] as const) {
    if (v.length !== 2) paramError(name, `has ${v.length} element(s) but the state estimate xhat is a 2-element vector`);
  }
  const u = scalarInput(a, 'u');
  const y = scalarInput(a, 'y');
  const [x0, x1] = a.state;
  const innovation = y - (C[0] * x0 + C[1] * x1);
  return [
    a.branch[0] - x0,
    a.branch[1] - x1,
    a.dState[0] - (A[0][0] * x0 + A[0][1] * x1 + B[0] * u + L[0] * innovation),
    a.dState[1] - (A[1][0] * x0 + A[1][1] * x1 + B[1] * u + L[1] * innovation),
  ];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Learning blocks
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** LMS memory: [k of the last sample, w1, w2, x(k-1), y, err] (weights AFTER the last update) */
const lmsInitial = (): number[] => [-1, 0, 0, 0, 0, 0];

/**
 * 2-tap LMS adaptive filter (Widrow and Hoff 1960), one update per sample k of period Ts:
 *   y(k) = w1(k) x(k) + w2(k) x(k-1),   e(k) = d(k) - y(k),   w(k+1) = w(k) + mu e(k) [x(k), x(k-1)]
 * Between samples the outputs are held. The weights shown are those after the update of the latest sample.
 */
const lmsStep = (a: BlockEquationArgs): Stepped => {
  const ts = requirePositive('ts', numericParam(a.params, 'ts', 0.01));
  const lrParam = numericParam(a.params, 'lr', 0.05);
  const x = scalarInput(a, 'x');
  const d = scalarInput(a, 'd');
  const mu = optScalar(a, 'lr', lrParam);
  const mem = committedMemory(a.ctx, a.nodeId, lmsInitial());
  const k = sampleIndex(a.ctx.time, ts);
  if (k <= mem[0]) return { out: [mem[4], mem[5], mem[1], mem[2]], mem };
  const [w1, w2, xPrev] = [mem[1], mem[2], mem[3]];
  const y = w1 * x + w2 * xPrev;
  const err = d - y;
  const w1n = w1 + mu * err * x;
  const w2n = w2 + mu * err * xPrev;
  return { out: [y, err, w1n, w2n], mem: [k, w1n, w2n, x, y, err] };
};
const lms: BlockEquationFactory = (a) => {
  const { out } = lmsStep(a);
  return out.map((v, i) => a.branch[i] - v);
};

interface RlConfig { alpha: number; gamma: number; epsilon: number; nS: number; nA: number; ts: number; seed: number }
const rlConfig = (params: Record<string, any>): RlConfig => {
  // at least one state / action (the rounded value of a fractional entry)
  const nS = Math.max(1, Math.round(numericParam(params, 'numStates', 5)));
  const nA = Math.max(1, Math.round(numericParam(params, 'numActions', 3)));
  return {
    alpha: numericParam(params, 'alpha', 0.1), gamma: numericParam(params, 'gamma', 0.9), epsilon: numericParam(params, 'epsilon', 0.1),
    nS, nA, ts: requirePositive('ts', numericParam(params, 'ts', 0.05)), seed: Math.round(numericParam(params, 'seed', 1)) >>> 0,
  };
};
const rlActions = (nA: number): number[] => (nA === 1 ? [0] : Array.from({ length: nA }, (_, i) => -1 + (2 * i) / (nA - 1)));
const RL_HEADER = 7;
/** Q-learning memory: [k, last state, last action, has previous, action, max_a Q(s,a), rng state, Q(0,0) .. Q(nS-1,nA-1)] */
const rlInitial = (params: Record<string, any>): number[] => {
  const c = rlConfig(params);
  return [-1, Math.floor(c.nS / 2), Math.floor(c.nA / 2), 0, rlActions(c.nA)[Math.floor(c.nA / 2)], 0, c.seed, ...new Array(c.nS * c.nA).fill(0)];
};
/** mulberry32 (one 32-bit word of state), uniform in [0, 1): deterministic for a seed, the state travels in the memory vector. */
const mulberry32 = (state: number): { value: number; state: number } => {
  const next = (state + 0x6D2B79F5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
};

/**
 * Tabular epsilon-greedy Q-learning (Watkins and Dayan 1992; Sutton and Barto ch. 6) on the sample grid k Ts:
 *   s(k) = bin(error),  Q(s(k-1), a(k-1)) += alpha (R(k) + gamma max_a Q(s(k), a) - Q(s(k-1), a(k-1))),
 *   a(k) = random action with probability epsilon (a seeded PRNG), else argmax_a Q(s(k), a) (lowest index on ties).
 * States: nS = 5 bins split at -1, -0.1, 0.1, 1 (otherwise nS uniform bins over [-1.5, 1.5]); actions: nA values evenly spaced in
 * [-1, 1]. Outputs (held between samples): the selected action and max_a Q(s(k), a). Reset (level > 0.5) clears the Q-table and
 * re-seeds the PRNG. Everything lives in the committed memory vector, so a run is a function of (parameters, seed, inputs).
 */
const rlStep = (a: BlockEquationArgs): Stepped => {
  const c = rlConfig(a.params);
  const error = scalarInput(a, 'error');
  const reward = scalarInput(a, 'reward');
  const reset = optScalar(a, 'reset', 0) > LOGIC_THRESHOLD;
  const mem = committedMemory(a.ctx, a.nodeId, rlInitial(a.params));
  const k = sampleIndex(a.ctx.time, c.ts);
  if (k <= mem[0] && !reset) return { out: [mem[4], mem[5]], mem };
  const actions = rlActions(c.nA);
  const q = mem.slice(RL_HEADER);
  let [, lastS, lastA, hasPrev, , , rng] = mem;
  if (reset) { q.fill(0); hasPrev = 0; rng = c.seed; }
  let s: number;
  if (c.nS === 5) s = error < -1 ? 0 : error < -0.1 ? 1 : error > 1 ? 4 : error > 0.1 ? 3 : 2;
  else s = clamp(Math.floor(((error + 1.5) / 3) * c.nS), 0, c.nS - 1);
  const row = (i: number) => q.slice(i * c.nA, (i + 1) * c.nA);
  if (hasPrev === 1) {
    const target = reward + c.gamma * Math.max(...row(s));
    const cur = q[lastS * c.nA + lastA];
    q[lastS * c.nA + lastA] = cur + c.alpha * (target - cur);
  }
  const u1 = mulberry32(rng);
  const u2 = mulberry32(u1.state);
  rng = u2.state;
  let aIdx: number;
  if (u1.value < c.epsilon) aIdx = Math.min(c.nA - 1, Math.floor(u2.value * c.nA));
  else {
    const qs = row(s);
    aIdx = 0;
    for (let i = 1; i < c.nA; i++) if (qs[i] > qs[aIdx]) aIdx = i;
  }
  const maxQ = Math.max(...row(s));
  return { out: [actions[aIdx], maxQ], mem: [k, s, aIdx, 1, actions[aIdx], maxQ, rng, ...q] };
};
const rl: BlockEquationFactory = (a) => rlStep(a).out.map((v, i) => a.branch[i] - v);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Estimators
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Induction-machine rotor-flux observer, current model in the stationary frame (Krause et al. ch. 4-5; Vas 1990), amplitude
 * invariant, rotor electrical speed w_e = P wr, Tr = Lr / Rr:
 *   d psi_r/dt = -psi_r / Tr + j w_e psi_r + (Lm / Tr) i_s     (psi_r = psi_alpha + j psi_beta, i_s = Clarke(iabc))
 * Outputs: imr = |psi_r| / Lm, theta = atan2(psi_beta, psi_alpha), the stator current in field coordinates (i_sd, i_sq) =
 * Park(i_s, theta) and the synchronous speed we = w_e + (Lm / Tr) i_sq / |psi_r| (slip relation; w_e while |psi_r| = 0).
 */
const imFluxObserver: BlockEquationFactory = (a) => {
  const Lm = numericParam(a.params, 'Lm', 0.05);
  const Lr = numericParam(a.params, 'Lr', 0.06);
  const Rr = numericParam(a.params, 'Rr', 0.08);
  const P = numericParam(a.params, 'P', 2);
  const iabc = vectorInput(a, 'iabc', 3);
  const wr = scalarInput(a, 'wr');
  const Tr = Lr / Rr;
  const we = P * wr;
  const [ia, ib] = clarke(iabc);
  const [pa, pb] = a.state;
  const mag = Math.hypot(pa, pb);
  const theta = Math.atan2(pb, pa);
  const [isd, isq] = parkAligned(ia, ib, theta);
  const slip = mag > 1e-12 ? (Lm / Tr) * isq / mag : 0;
  return [
    a.branch[0] - isd,
    a.branch[1] - isq,
    a.branch[2] - (Lm !== 0 ? mag / Lm : 0),
    a.branch[3] - theta,
    a.branch[4] - (we + slip),
    a.dState[0] - (-pa / Tr - we * pb + (Lm / Tr) * ia),
    a.dState[1] - (-pb / Tr + we * pa + (Lm / Tr) * ib),
  ];
};

/** PMSM torque estimator: tau = 1.5 p (lambda iq + (Ld - Lq) id iq) (Krause et al. ch. 5; the `pmsm` block). */
const pmsmTorqueEstimator: BlockEquationFactory = (a) => {
  const p = numericParam(a.params, 'pole_pairs', 4);
  const flux = numericParam(a.params, 'flux', 0.1);
  const Ld = numericParam(a.params, 'Ld', 0.005);
  const Lq = numericParam(a.params, 'Lq', 0.005);
  const [id, iq] = vectorInput(a, 'idq', 2);
  return [a.branch[0] - 1.5 * p * (flux * iq + (Ld - Lq) * id * iq)];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PMSM / induction machine vector control
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * dq current regulator: v = Kp (i* - i) + I + v_ff, circular voltage limit |v| <= v_max (port, when wired), back-calculation
 * anti-windup dI/dt = Ki e + Kb (v_lim - v) with Kb = Ki / Kp, external reset (level) holds I = 0. The decoupling terms
 * (-w Lq iq, w (Ld id + lambda) / the induction-machine equivalents) arrive through the feed-forward input vdq_ff.
 */
const dqCurrentController = (defaultKp: number): BlockEquationFactory => (a) => {
  const Kp = numericParam(a.params, 'Kp', defaultKp);
  const Ki = numericParam(a.params, 'Ki', 100);
  const iRef = vectorInput(a, 'idq_ref', 2);
  const i = vectorInput(a, 'idq', 2);
  const ff = optVector(a, 'vdq_ff', 2, [0, 0]);
  const vmax = portWired(a, 'v_max') ? scalarInput(a, 'v_max') : Infinity;
  const rst = resetHigh(a);
  const [Id, Iq] = a.state;
  const Kb = backCalcGain(Kp, Ki);
  const ed = iRef[0] - i[0], eq = iRef[1] - i[1];
  const vd = Kp * ed + Id + ff[0], vq = Kp * eq + Iq + ff[1];
  const [ld, lq] = limitCircle(vd, vq, vmax);
  return [
    a.branch[0] - ld,
    a.branch[1] - lq,
    rst ? Id : a.dState[0] - (Ki * ed + Kb * (ld - vd)),
    rst ? Iq : a.dState[1] - (Ki * eq + Kb * (lq - vq)),
  ];
};

/**
 * PMSM field-oriented control (Vas 1990; Krause et al. ch. 5; Simscape "Field-Oriented Control"): torque reference ->
 *   id* = 0,  iq* = tau* / (1.5 p (lambda + (Ld - Lq) id*)),   (id, iq) = Park(Clarke(iabc), theta_e = p theta),  w_e = p w
 *   v_d = Kp e_d + I_d + Rs id* - w_e Lq iq,   v_q = Kp e_q + I_q + Rs iq* + w_e (Ld id + lambda)      (PI + decoupling feed-forward)
 *   |v| <= vdc / 2 (linear range of sinusoidal PWM: the inverter m_abc has no zero-sequence injection), dI/dt = Ki e + Kb (v_lim - v),
 *   Kb = Ki / Kp,   m_abc = clamp(InvPark(v) / (vdc / 2), -1, 1)
 * `th_s` and `w_s` are the mechanical rotor angle / speed (the `rot_motion_sensor` outputs). g is the m_abc modulation vector of
 * the two-level inverter (pwm_3ph_2level.vabc); vis is the commanded torque-producing current iq*.
 */
const pmsmFoc: BlockEquationFactory = (a) => {
  const Rs = numericParam(a.params, 'Rs', 0.1);
  const Kp = numericParam(a.params, 'Kp', 5);
  const Ki = numericParam(a.params, 'Ki', 100);
  const p = numericParam(a.params, 'pole_pairs', 4);
  const Ld = numericParam(a.params, 'Ld', 0.005);
  const Lq = numericParam(a.params, 'Lq', 0.005);
  const flux = numericParam(a.params, 'flux', 0.1);
  const tauRef = scalarInput(a, 'ref');
  const iabc = vectorInput(a, 'iabc_s', 3);
  const w = scalarInput(a, 'w_s');
  const th = scalarInput(a, 'th_s');
  const vdc = scalarInput(a, 'vdc_s');
  const we = p * w;
  const idRef = 0;
  const kt = 1.5 * p * (flux + (Ld - Lq) * idRef);
  const iqRef = kt !== 0 ? tauRef / kt : 0;
  const [id, iq] = abcToDq(iabc, p * th);
  const [Id, Iq] = a.state;
  const ed = idRef - id, eq = iqRef - iq;
  const vd = Kp * ed + Id + Rs * idRef - we * Lq * iq;
  const vq = Kp * eq + Iq + Rs * iqRef + we * (Ld * id + flux);
  const [ld, lq] = limitCircle(vd, vq, Math.max(vdc, 0) / 2);
  const Kb = backCalcGain(Kp, Ki);
  const m = dqToAbc(ld, lq, p * th).map(v => (vdc > 0 ? clamp(v / (vdc / 2), -1, 1) : 0));
  return [
    a.branch[0] - m[0], a.branch[1] - m[1], a.branch[2] - m[2], a.branch[3] - iqRef,
    a.dState[0] - (Ki * ed + Kb * (ld - vd)),
    a.dState[1] - (Ki * eq + Kb * (lq - vq)),
  ];
};

const PMSM_SCAN = 801; // odd: id = 0 is a grid point (exact MTPA of a non-salient machine)
interface PmsmReference { id: number; iq: number; torque: number; limit: number }
/**
 * Torque -> (id, iq) map of a PMSM for |tau| = `torque`: the minimum-current point of the feasible set
 *   F = { id^2 + iq^2 <= Imax^2,  w_e^2 [(Ld id + lambda)^2 + (Lq iq)^2] <= Vmax^2 },   tau = 1.5 p iq (lambda + (Ld - Lq) id)
 * (MTPA while the voltage limit is inactive, field weakening on the voltage ellipse above base speed; Morimoto et al., IEEE Trans.
 * Ind. Appl. 30(4), 1994; Pan and Liaw 1989). Beyond the largest torque of F the request is limited to it: `limit`.
 */
export function pmsmCurrentReference(
  torque: number, we: number, vmax: number, p: number, flux: number, Ld: number, Lq: number, imax: number,
): PmsmReference {
  const kt = 1.5 * p;
  const dL = Ld - Lq;
  const iqMax = (id: number): number => {
    const cur = imax * imax - id * id;
    if (cur < 0) return -1;
    let m = Math.sqrt(cur);
    if (Number.isFinite(vmax) && we > 0) {
      const vlim = vmax / we;
      const room = vlim * vlim - (Ld * id + flux) ** 2;
      if (room < 0) return -1;
      if (Lq > 0) m = Math.min(m, Math.sqrt(room) / Lq);
    }
    return m;
  };
  const slope = (id: number) => kt * (flux + dL * id); // d tau / d iq at fixed id
  const maxTorqueAt = (id: number): number => { const m = iqMax(id); return m < 0 || slope(id) <= 0 ? -1 : slope(id) * m; };
  const grid = (j: number) => imax * (2 * j / (PMSM_SCAN - 1) - 1);
  // largest torque of the feasible set
  let bestJ = -1, bestT = -1;
  for (let j = 0; j < PMSM_SCAN; j++) { const t = maxTorqueAt(grid(j)); if (t > bestT) { bestT = t; bestJ = j; } }
  if (bestJ < 0 || bestT <= 0) return { id: 0, iq: 0, torque: 0, limit: 0 };
  const golden = (f: (x: number) => number, lo: number, hi: number): number => {
    const g = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
    for (let it = 0; it < 80; it++) {
      if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); }
      else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); }
    }
    return (lo + hi) / 2;
  };
  const idAtMax = golden(id => -maxTorqueAt(id), grid(Math.max(0, bestJ - 1)), grid(Math.min(PMSM_SCAN - 1, bestJ + 1)));
  const limit = Math.max(bestT, maxTorqueAt(idAtMax));
  if (torque >= limit) {
    const id = maxTorqueAt(idAtMax) >= bestT ? idAtMax : grid(bestJ);
    return { id, iq: iqMax(id), torque: limit, limit };
  }
  const cost = (id: number): number => {
    const s = slope(id);
    if (s <= 0 || iqMax(id) < 0) return Infinity;
    const iq = torque / s;
    return iq <= iqMax(id) ? id * id + iq * iq : Infinity;
  };
  let jMin = -1, cMin = Infinity;
  for (let j = 0; j < PMSM_SCAN; j++) { const c = cost(grid(j)); if (c < cMin) { cMin = c; jMin = j; } }
  if (jMin < 0) return { id: 0, iq: 0, torque: 0, limit };
  let id = grid(jMin);
  if (jMin > 0 && jMin < PMSM_SCAN - 1) {
    const refined = golden(cost, grid(jMin - 1), grid(jMin + 1));
    if (cost(refined) <= cMin) id = refined;
  }
  return { id, iq: torque / slope(id), torque, limit };
}

/**
 * PMSM current reference generator: tau* -> (id*, iq*) by MTPA / field weakening within the current limit Imax and the voltage
 * limit Vmax = vdc / 2 (sinusoidal-PWM range, as the FOC blocks) at the electrical speed w_e = p |w| (see pmsmCurrentReference). Outputs the limited torque
 * reference and the torque limit tau_lim(w, vdc). An open vdc = no voltage limit, an open w_mech = standstill.
 */
const pmsmRefGen: BlockEquationFactory = (a) => {
  const Ld = numericParam(a.params, 'Ld', 0.005);
  const Lq = numericParam(a.params, 'Lq', 0.005);
  const flux = numericParam(a.params, 'flux', 0.1);
  const p = numericParam(a.params, 'pole_pairs', 4);
  const imax = Math.abs(numericParam(a.params, 'i_max', 30));
  const tq = scalarInput(a, 'tq_ref');
  const w = optScalar(a, 'w_mech', 0);
  const vdc = portWired(a, 'vdc') ? scalarInput(a, 'vdc') : Infinity;
  const sign = tq < 0 ? -1 : 1;
  const r = pmsmCurrentReference(Math.abs(tq), p * Math.abs(w), Math.max(vdc, 0) / 2, p, flux, Ld, Lq, imax);
  return [
    a.branch[0] - r.id, a.branch[1] - sign * r.iq, a.branch[2] - sign * r.torque, a.branch[3] - r.limit,
  ];
};

/**
 * Voltage-feedback field weakening (Morimoto 1994; the PI form of the Simscape field-weakening controller): the d-axis current
 * is reduced while the stator voltage |v_dq| exceeds the limit v_margin v_max,
 *   e = v_margin v_max - |v_dq|,  d = clamp(Kp e + I, -id_fw_max, 0),  dI/dt = Ki e + Kb (d - (Kp e + I)),  id_fw = id* + d,  iq_fw = iq*
 * An open v_max disables the loop (d = 0).
 */
const pmsmFieldWeakening: BlockEquationFactory = (a) => {
  const margin = numericParam(a.params, 'v_margin', 0.95);
  const Kp = numericParam(a.params, 'Kp', 0.5);
  const Ki = numericParam(a.params, 'Ki', 50);
  const idFwMax = Math.abs(numericParam(a.params, 'id_fw_max', 20));
  const idq = vectorInput(a, 'idq_ref', 2);
  const vdq = optVector(a, 'vdq', 2, [0, 0]);
  const active = portWired(a, 'v_max');
  const vmax = active ? scalarInput(a, 'v_max') : 0;
  const I = a.state[0];
  const e = margin * vmax - Math.hypot(vdq[0], vdq[1]);
  const un = Kp * e + I;
  const d = active ? clamp(un, -idFwMax, 0) : 0;
  return [
    a.branch[0] - (idq[0] + d), a.branch[1] - idq[1],
    active ? a.dState[0] - (Ki * e + backCalcGain(Kp, Ki) * (d - un)) : a.dState[0],
  ];
};

/**
 * Induction-machine rotor-flux-oriented control, indirect field orientation (Vas 1990; Krause et al. ch. 15), mode 1:
 *   psi_r* = Lm imr*,  tau* = clamp(Kp_w (w* - wr) + I_w, +-T_max),  id* = imr*,  iq* = (2/3)(1/P)(Lr/Lm) tau* / psi_r*
 *   slip: w_sl = (Rr/Lr) iq* / id*,   field angle: d theta_f/dt = P wr + w_sl   (w_e = P wr + w_sl)
 *   (id, iq) = Park(Clarke(iabc), theta_f),  v_d = Kp_i e_d + I_d - w_e sigma Ls iq,  v_q = Kp_i e_q + I_q + w_e (sigma Ls id + (Lm/Lr) psi_r*)
 *   |v| <= vdc / 2 (sinusoidal-PWM linear range), back-calculation anti-windup on every PI (Kb = Ki / Kp), sigma = 1 - Lm^2/(Ls Lr)
 * Mode 0 is open-loop scalar V/f: w_e = P w*, |v| = v_f_ratio |w_e| / (2 pi) (limited to vdc / 2), no current feedback.
 * Outputs: g = m_abc = clamp(v_abc / (vdc/2)) for the inverter, vabc = |v| (the amplitude of the phase voltage reference set) and
 * vis = tau*. The speed reference is wr_ref [rad/s] (open: target_rpm), vdc open: v_dc; an open iabc / wr reads 0.
 */
const imFocCtrl: BlockEquationFactory = (a) => {
  const Lm = numericParam(a.params, 'Lm', 0.05);
  const Rr = numericParam(a.params, 'Rr', 0.08);
  const Lr = numericParam(a.params, 'Lr', 0.06);
  const Ls = numericParam(a.params, 'Ls', 0.06);
  const P = numericParam(a.params, 'P', 2);
  const mode = numericParam(a.params, 'mode', 1);
  const vf = numericParam(a.params, 'v_f_ratio', 4.4);
  const targetRpm = numericParam(a.params, 'target_rpm', 1500);
  const vdcParam = numericParam(a.params, 'v_dc', 600);
  const imrParam = numericParam(a.params, 'imr_ref', 10);
  const Kpw = numericParam(a.params, 'Kp_w', 0.5);
  const Kiw = numericParam(a.params, 'Ki_w', 2);
  const tMax = Math.abs(numericParam(a.params, 'T_max', 20));
  const Kpi = numericParam(a.params, 'Kp_i', 5);
  const Kii = numericParam(a.params, 'Ki_i', 100);
  const wRef = optScalar(a, 'wr_ref', (targetRpm * TWO_PI) / 60);
  const imrRef = optScalar(a, 'imr_ref', imrParam);
  const iabc = optVector(a, 'iabc', 3, [0, 0, 0]);
  const wr = optScalar(a, 'wr', 0);
  const vdc = optScalar(a, 'vdc', vdcParam);
  const [theta, Iw, Id, Iq] = a.state;
  const vLimit = Math.max(vdc, 0) / 2;
  const sigma = 1 - (Lm * Lm) / (Ls * Lr);
  const psiRef = Lm * imrRef;
  let tauUn = 0, tau = 0, we = 0, ed = 0, eq = 0, vd = 0, vq = 0, ld = 0, lq = 0;
  const foc = Math.round(mode) !== 0; // mode 0 = open-loop V/f, any other value = field-oriented control
  if (foc) {
    tauUn = Kpw * (wRef - wr) + Iw;
    tau = clamp(tauUn, -tMax, tMax);
    const idRef = imrRef;
    const iqRef = imrRef > 0 && Lm !== 0 && P !== 0 ? ((2 / 3) * (1 / P) * (Lr / Lm) * tau) / psiRef : 0;
    const slip = idRef !== 0 && Lr !== 0 ? (Rr / Lr) * iqRef / idRef : 0;
    we = P * wr + slip;
    const [id, iq] = abcToDq(iabc, theta);
    ed = idRef - id; eq = iqRef - iq;
    vd = Kpi * ed + Id - we * sigma * Ls * iq;
    vq = Kpi * eq + Iq + we * (sigma * Ls * id + (Lr !== 0 ? (Lm / Lr) * psiRef : 0));
    [ld, lq] = limitCircle(vd, vq, vLimit);
  } else {
    we = P * wRef;
    [ld, lq] = limitCircle(vf * Math.abs(we) / TWO_PI, 0, vLimit);
  }
  const m = dqToAbc(ld, lq, theta).map(v => (vdc > 0 ? clamp(v / (vdc / 2), -1, 1) : 0));
  const Kbw = backCalcGain(Kpw, Kiw), Kbi = backCalcGain(Kpi, Kii);
  return [
    a.branch[0] - m[0], a.branch[1] - m[1], a.branch[2] - m[2],
    a.branch[3] - Math.hypot(ld, lq),
    a.branch[4] - tau,
    a.dState[0] - we,
    foc ? a.dState[1] - (Kiw * (wRef - wr) + Kbw * (tau - tauUn)) : a.dState[1],
    foc ? a.dState[2] - (Kii * ed + Kbi * (ld - vd)) : a.dState[2],
    foc ? a.dState[3] - (Kii * eq + Kbi * (lq - vq)) : a.dState[3],
  ];
};

/**
 * Scalar V/f control (Mohan et al. "Electric Drives", constant volts-per-hertz; Bose, "Modern Power Electronics and AC Drives"):
 * the phase-voltage amplitude follows the frequency, V(f) = V_boost + (V_rated - V_boost) |f| / f_rated up to f_rated and V_rated
 * above it (field weakening), V_rated = v_f_ratio f_rated [V peak]; the boost compensates the stator drop at low speed.
 *   d theta / d t = 2 pi f_ref,   v_abc = V(f) [sin th, sin(th - 2 pi/3), sin(th + 2 pi/3)]
 */
const imScalarCtrl: BlockEquationFactory = (a) => {
  const ratio = numericParam(a.params, 'v_f_ratio', 4.4);
  const fRated = numericParam(a.params, 'f_rated', 50);
  const boost = numericParam(a.params, 'v_boost', 0);
  requirePositive('f_rated', fRated);
  const f = scalarInput(a, 'f_ref');
  const th = a.state[0];
  const vRated = ratio * fRated;
  const amp = Math.abs(f) >= fRated ? vRated : boost + (vRated - boost) * Math.abs(f) / fRated;
  return [
    a.branch[0] - amp * Math.sin(th),
    a.branch[1] - amp * Math.sin(th - TWO_PI / 3),
    a.branch[2] - amp * Math.sin(th + TWO_PI / 3),
    a.dState[0] - TWO_PI * f,
  ];
};

// Takahashi-Noguchi switching table of the two-level inverter: sector k (1..6, sector 1 centred on the alpha axis), voltage vector
// V_k = (2/3) Vdc e^{j (k-1) 60 deg} with the switch states S(V1..V6) = 100, 110, 010, 011, 001, 101.
const VECTOR_STATES: [number, number, number][] = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]];
const cyclicVector = (k: number, offset: number): [number, number, number] => VECTOR_STATES[(((k - 1 + offset) % 6) + 6) % 6];
/** DTC memory: [k, flux comparator, Sa, Sb, Sc] */
const dtcInitial = (): number[] => [-1, 1, 0, 0, 0];
/**
 * Induction-machine direct torque control (Takahashi and Noguchi, IEEE Trans. Ind. Appl. 22(5), 1986; Buja and Kazmierkowski, IEEE
 * Trans. Ind. Electron. 51(4), 2004). Estimators from the measured vabc / iabc (amplitude-invariant Clarke):
 *   d psi_s/dt = v_s - Rs i_s (voltage model, states psi_alpha, psi_beta),   tau = 1.5 P (psi_alpha i_beta - psi_beta i_alpha)
 * Hysteresis comparators (flux: 2 levels with memory, torque: 3 levels) and the switching table, evaluated once per sample Ts:
 *   flux up (psi* - |psi| > h_psi):   torque up -> V_{k+1}, hold -> zero vector, down -> V_{k-1}
 *   flux down (psi* - |psi| < -h_psi): torque up -> V_{k+2}, hold -> zero vector, down -> V_{k-2}
 * with the flux sector k from the angle of psi_s. The zero vector is V0 / V7 (fewer commutations). g = 2 S - 1 in {-1, +1} per leg.
 */
const dtcStep = (a: BlockEquationArgs): Stepped => {
  const psiParam = numericParam(a.params, 'flux_ref', 0.8);
  const P = numericParam(a.params, 'P', 2);
  const fluxBand = numericParam(a.params, 'flux_band', 0.02);
  const tqBand = numericParam(a.params, 'tq_band', 1);
  const ts = requirePositive('ts', numericParam(a.params, 'ts', 5e-5));
  const psiRef = optScalar(a, 'flux_ref', psiParam);
  const tqRef = scalarInput(a, 'tq_ref');
  const [ia, ib] = clarke(vectorInput(a, 'iabc', 3));
  const [pa, pb] = a.state;
  const mem = committedMemory(a.ctx, a.nodeId, dtcInitial());
  const k = sampleIndex(a.ctx.time, ts);
  if (k <= mem[0]) return { out: [2 * mem[2] - 1, 2 * mem[3] - 1, 2 * mem[4] - 1], mem };
  const mag = Math.hypot(pa, pb);
  const torque = 1.5 * P * (pa * ib - pb * ia);
  const eFlux = psiRef - mag, eTq = tqRef - torque;
  const dFlux = eFlux > fluxBand / 2 ? 1 : eFlux < -fluxBand / 2 ? 0 : mem[1];
  const dTq = eTq > tqBand / 2 ? 1 : eTq < -tqBand / 2 ? -1 : 0;
  let angle = Math.atan2(pb, pa);
  if (angle < 0) angle += TWO_PI;
  const sector = (Math.floor((angle + Math.PI / 6) / (Math.PI / 3)) % 6) + 1;
  let S: [number, number, number];
  if (dTq === 0) S = mem[2] + mem[3] + mem[4] >= 2 ? [1, 1, 1] : [0, 0, 0];
  else S = cyclicVector(sector, dFlux === 1 ? dTq : 2 * dTq);
  return { out: S.map(v => 2 * v - 1), mem: [k, dFlux, S[0], S[1], S[2]] };
};
const imDtcCtrl: BlockEquationFactory = (a) => {
  const { out } = dtcStep(a);
  const Rs = numericParam(a.params, 'Rs', 0.1);
  const [va, vb] = clarke(vectorInput(a, 'vabc', 3));
  const [ia, ib] = clarke(vectorInput(a, 'iabc', 3));
  return [
    a.branch[0] - out[0], a.branch[1] - out[1], a.branch[2] - out[2],
    a.dState[0] - (va - Rs * ia),
    a.dState[1] - (vb - Rs * ib),
  ];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BLDC / DC / converter controllers
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Six-step (120 degree) commutation table, Hall code = 4 Ha + 2 Hb + Hc, pattern (a, b, c) = +1 upper switch, -1 lower switch,
 * 0 floating (Krishnan ch. 9; Simscape "Six-Step Commutation"). Forward sequence of the energised pair as the electrical angle
 * advances: A+B- (101), A+C- (100), B+C- (110), B+A- (010), C+A- (011), C+B- (001); the codes 000 / 111 are invalid (all floating).
 * Consistent with the trapezoidal back-EMF of `bldc_motor` for Hall A high over 30..210 deg, B over 150..330 deg, C over 270..90 deg.
 * dir < 0 reverses the polarity (torque direction).
 */
const HALL_FORWARD: Record<number, [number, number, number]> = {
  5: [1, -1, 0], 4: [1, 0, -1], 6: [0, 1, -1], 2: [-1, 1, 0], 3: [-1, 0, 1], 1: [0, -1, 1],
};
export const sixStepPattern = (hall: number, dir: number): [number, number, number] => {
  const base = HALL_FORWARD[Math.round(hall)] ?? [0, 0, 0];
  const s = dir < 0 ? -1 : 1;
  return [base[0] === 0 ? 0 : base[0] * s, base[1] === 0 ? 0 : base[1] * s, base[2] === 0 ? 0 : base[2] * s];
};
const bldcCommutation: BlockEquationFactory = (a) => {
  const p = sixStepPattern(scalarInput(a, 'hall'), optScalar(a, 'dir', 1));
  return [a.branch[0] - p[0], a.branch[1] - p[1], a.branch[2] - p[2]];
};
const triangularCarrier = (time: number, f: number): number => { const ph = (time * f) % 1; return ph < 0.5 ? 2 * ph : 2 - 2 * ph; };

/** BLDC current controller: PI on the DC-link current error, u = clamp(Kp e + I, +-v_max) [V], vabc = pattern(hall, dir) u. */
const bldcCurrentCtrl: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 1);
  const Ki = numericParam(a.params, 'Ki', 10);
  const vmax = Math.abs(numericParam(a.params, 'v_max', 24));
  const e = scalarInput(a, 'is_ref') - scalarInput(a, 'is');
  const pat = sixStepPattern(scalarInput(a, 'hall'), optScalar(a, 'dir', 1));
  const rst = resetHigh(a);
  const I = a.state[0];
  const v = Kp * e + I;
  const u = clamp(v, -vmax, vmax);
  return [
    a.branch[0] - pat[0] * u, a.branch[1] - pat[1] * u, a.branch[2] - pat[2] * u,
    rst ? I : a.dState[0] - (Ki * e + backCalcGain(Kp, Ki) * (u - v)),
  ];
};

/**
 * BLDC current controller with PWM: the PI output u = clamp(Kp e + I, -1, 1) is the modulation of the energised pair; the leg duty
 * d_k = (1 + pattern_k u) / 2 (a floating phase sits at mid-rail, d = 1/2, so it carries no current) is compared with the triangular
 * carrier of frequency `freq` (Mohan ch. 8): g_k = +1 (upper switch on) if d_k >= carrier(t), else -1. g is the m_abc vector of the
 * two-level inverter.
 */
const bldcPwmCtrl: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 0.1);
  const Ki = numericParam(a.params, 'Ki', 10);
  const freq = numericParam(a.params, 'freq', 20000);
  const e = scalarInput(a, 'is_ref') - scalarInput(a, 'is');
  const pat = sixStepPattern(scalarInput(a, 'hall'), optScalar(a, 'dir', 1));
  const rst = resetHigh(a);
  const I = a.state[0];
  const v = Kp * e + I;
  const u = clamp(v, -1, 1);
  const carrier = triangularCarrier(a.ctx.time, freq);
  const g = pat.map(p => ((1 + p * u) / 2 >= carrier ? 1 : -1));
  return [
    a.branch[0] - g[0], a.branch[1] - g[1], a.branch[2] - g[2],
    rst ? I : a.dState[0] - (Ki * e + backCalcGain(Kp, Ki) * (u - v)),
  ];
};

/** DC-DC voltage controller: duty = clamp(ff + Kp e + I, 0, 1), e = v_ref - v (Erickson and Maksimovic ch. 9), back-calculation anti-windup. */
const dcdcCtrl: BlockEquationFactory = (a) => {
  const vrefParam = numericParam(a.params, 'v_ref', 48);
  const Kp = numericParam(a.params, 'Kp', 0.01);
  const Ki = numericParam(a.params, 'Ki', 1);
  const e = optScalar(a, 'v_ref', vrefParam) - scalarInput(a, 'v');
  const ff = optScalar(a, 'ff', 0);
  const rst = resetHigh(a);
  const I = a.state[0];
  const v = ff + Kp * e + I;
  const u = clamp(v, 0, 1);
  return [a.branch[0] - u, rst ? I : a.dState[0] - (Ki * e + backCalcGain(Kp, Ki) * (u - v))];
};

/** DC voltage controller: duty = clamp(Kp e + I, 0, 1), e = v_ref - v, back-calculation anti-windup. */
const dcVoltageCtrl: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 0.5);
  const Ki = numericParam(a.params, 'Ki', 5);
  const e = scalarInput(a, 'v_ref') - scalarInput(a, 'v');
  const rst = resetHigh(a);
  const I = a.state[0];
  const v = Kp * e + I;
  const u = clamp(v, 0, 1);
  return [a.branch[0] - u, rst ? I : a.dState[0] - (Ki * e + backCalcGain(Kp, Ki) * (u - v))];
};

/** DC current controller (armature): v_ref = clamp(Kp e + I, +-v_max), e = i_ref - i, v_max = the port when wired, else the parameter. */
const dcCurrentCtrl: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 1);
  const Ki = numericParam(a.params, 'Ki', 10);
  const vmaxParam = numericParam(a.params, 'v_max', 240);
  const vmax = Math.abs(optScalar(a, 'v_max', vmaxParam));
  const e = scalarInput(a, 'i_ref') - scalarInput(a, 'i');
  const rst = resetHigh(a);
  const I = a.state[0];
  const v = Kp * e + I;
  const u = clamp(v, -vmax, vmax);
  return [a.branch[0] - u, rst ? I : a.dState[0] - (Ki * e + backCalcGain(Kp, Ki) * (u - v))];
};

/**
 * Velocity controller (Simscape "Velocity Controller"): tq_unsat = Kp e + I, e = w_ref - w_mech. The saturated torque tq_sat,
 * when wired, closes the back-calculation anti-windup loop dI/dt = Ki e + Kb (tq_sat - tq_unsat), Kb = Ki / Kp.
 */
const velocityCtrl: BlockEquationFactory = (a) => {
  const Kp = numericParam(a.params, 'Kp', 1);
  const Ki = numericParam(a.params, 'Ki', 2);
  const e = scalarInput(a, 'w_ref') - scalarInput(a, 'w_mech');
  const rst = resetHigh(a);
  const I = a.state[0];
  const un = Kp * e + I;
  const back = portWired(a, 'tq_sat') ? backCalcGain(Kp, Ki) * (scalarInput(a, 'tq_sat') - un) : 0;
  return [a.branch[0] - un, rst ? I : a.dState[0] - (Ki * e + back)];
};

/**
 * Per-phase hysteresis current control (Kazmierkowski and Malesani, IEEE Trans. Ind. Electron. 45(5), 1998): on the sample grid Ts
 * each phase is a relay with memory and total band `band`, e_k = iabc_ref,k - iabc,k:
 *   s_k = +1 if e_k > band/2,  -1 if e_k < -band/2,  else the previous s_k (initially -1).
 * s is the m_abc vector of the two-level inverter (+1 upper switch on): the phase current stays within ref +- band/2 up to the
 * overshoot of one sample.
 */
const hysteresisInitial = (): number[] => [-1, -1, -1, -1];
const hysteresisStep = (a: BlockEquationArgs): Stepped => {
  const band = numericParam(a.params, 'band', 0.1);
  const ts = requirePositive('ts', numericParam(a.params, 'ts', 2e-5));
  const ref = vectorInput(a, 'iabc_ref', 3);
  const i = vectorInput(a, 'iabc', 3);
  const mem = committedMemory(a.ctx, a.nodeId, hysteresisInitial());
  const k = sampleIndex(a.ctx.time, ts);
  if (k <= mem[0]) return { out: [mem[1], mem[2], mem[3]], mem };
  const s = [0, 1, 2].map(j => {
    const e = ref[j] - i[j];
    return e > band / 2 ? 1 : e < -band / 2 ? -1 : mem[1 + j];
  });
  return { out: s, mem: [k, s[0], s[1], s[2]] };
};
const hysteresisCtrl: BlockEquationFactory = (a) => hysteresisStep(a).out.map((v, i) => a.branch[i] - v);

/**
 * PFC rectifier controller, dq current control (Mohan ch. 18; Blaabjerg et al., IEEE Trans. Ind. Electron. 2004), signals in per
 * unit of the modulator range (Vdc / 2). Grid angle theta = atan2(v_beta, v_alpha) of the sensed voltage; (vd, vq) and (id, iq) =
 * Park(Clarke(.), theta). Outer loop: id* = Kp_v (vdc* - vdc) + I (I' = Ki_v (vdc* - vdc)); reactive reference iq* = -q_ref (unity
 * power factor for q_ref = 0). Inner proportional loop with grid-voltage feed-forward, for L di/dt = v_grid - v_conv:
 *   v_conv,dq = v_dq - Kp_i (i*_dq - i_dq),   vabc_ref = clamp(InvPark(v_conv,dq, theta), -1, 1).   vis = id*.
 */
const pfcRectifierCtrl: BlockEquationFactory = (a) => {
  const KpV = numericParam(a.params, 'Kp_v', 0.1);
  const KiV = numericParam(a.params, 'Ki_v', 2);
  const KpI = numericParam(a.params, 'Kp_i', 1);
  const vdcRef = scalarInput(a, 'vdc_ref');
  const vdc = scalarInput(a, 'vdc_sens');
  const qRef = optScalar(a, 'q_ref', 0);
  const vabc = vectorInput(a, 'vabc_sens', 3);
  const iabc = vectorInput(a, 'iabc_sens', 3);
  const [val, vbe] = clarke(vabc);
  const theta = Math.atan2(vbe, val);
  const [vd, vq] = parkAligned(val, vbe, theta);
  const [id, iq] = abcToDq(iabc, theta);
  const e = vdcRef - vdc;
  const idRef = KpV * e + a.state[0];
  const iqRef = -qRef;
  const m = dqToAbc(vd - KpI * (idRef - id), vq - KpI * (iqRef - iq), theta).map(v => clamp(v, -1, 1));
  return [a.branch[0] - m[0], a.branch[1] - m[1], a.branch[2] - m[2], a.branch[3] - idRef, a.dState[0] - KiV * e];
};

/**
 * Cycloconverter controller, cosine-wave crossing method (Pelly, "Thyristor Phase-Controlled Converters and Cycloconverters", 1971;
 * Mohan ch. 6): the firing angle that makes the converter output follow r sin(theta_o),
 *   cos(alpha) = r sin(theta_o + phase),   r = m clamp(v_ref, 0, 1),   d theta_o / d t = 2 pi f_ref,
 * is output on `p` in degrees (the `alpha` input of thyristor_6pulse). The bank follows the polarity of the output current icyc
 * (circulating-current free): when the polarity changes the bank is blocked for bank_limit seconds, then the other bank takes over;
 * vis = +1 positive bank, -1 negative bank, 0 blocked. An open icyc selects the positive bank. vabc and vcyc are not used by this
 * open-loop law. Memory: [bank, time the opposite polarity was first seen (-1 = none)].
 */
const cycloStep = (a: BlockEquationArgs): Stepped => {
  const m = numericParam(a.params, 'm', 0.8);
  const bankLimit = numericParam(a.params, 'bank_limit', 0.1);
  const phase = numericParam(a.params, 'phase_deg', 0);
  const vref = scalarInput(a, 'v_ref');
  const th = a.state[0];
  const icyc = optScalar(a, 'icyc', 0);
  const mem = committedMemory(a.ctx, a.nodeId, [1, -1]);
  const r = m * clamp(vref, 0, 1);
  const alpha = Math.acos(clamp(r * Math.sin(th + (phase * Math.PI) / 180), -1, 1));
  const desired = icyc >= 0 ? 1 : -1;
  const t = a.ctx.time;
  if (desired === mem[0]) return { out: [alpha, mem[0]], mem: [mem[0], -1] };
  const since = mem[1] < 0 ? t : mem[1];
  if (t - since >= bankLimit - 1e-12) return { out: [alpha, desired], mem: [desired, -1] };
  return { out: [alpha, 0], mem: [mem[0], since] };
};
const cycloconverterCtrl: BlockEquationFactory = (a) => {
  const { out } = cycloStep(a);
  return [a.branch[0] - out[0], a.branch[1] - out[1], a.dState[0] - TWO_PI * scalarInput(a, 'f_ref')];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Encoders
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Quadrature decoder memory: [k of the last velocity sample, A level, B level (-1 = not yet seen), count, count at the last velocity sample, vel, Z level] */
const quadInitial = (): number[] => [-1, -1, -1, 0, 0, 0, 0];
/** Gray index of the encoder state (A, B): 00 -> 0, 10 -> 1, 11 -> 2, 01 -> 3 */
const gray = (A: number, B: number): number => (A === 0 ? (B === 0 ? 0 : 3) : (B === 0 ? 1 : 2));
/**
 * Quadrature (incremental encoder) decoder, 4x counting: every edge of A or B changes the count by +-1 along the Gray sequence
 * 00 -> 10 -> 11 -> 01 -> 00 (A leads B: +1; the reverse sequence: -1; a double change is a missed edge and is not counted).
 * A rising edge of Z (the index pulse, level > 0.5) clears the count. pos = 2 pi count / (4 ppr). The velocity is the M method over
 * the sample period Ts: vel = 2 pi Delta count / (4 ppr Ts), held between samples. Levels are the inputs > 0.5; the first sample
 * only latches the levels.
 */
const quadStep = (a: BlockEquationArgs): Stepped => {
  const ppr = requirePositive('ppr', numericParam(a.params, 'ppr', 1024));
  const ts = requirePositive('ts', numericParam(a.params, 'ts', 1e-3));
  const A = optScalar(a, 'a', 0) > LOGIC_THRESHOLD ? 1 : 0;
  const B = optScalar(a, 'b', 0) > LOGIC_THRESHOLD ? 1 : 0;
  const Z = optScalar(a, 'z', 0) > LOGIC_THRESHOLD ? 1 : 0;
  const mem = committedMemory(a.ctx, a.nodeId, quadInitial());
  const scale = TWO_PI / (4 * ppr);
  let [kv, , , count, countAtVel, vel] = mem;
  const [, pa, pb, , , , pz] = mem;
  if (pa >= 0) {
    const diff = (gray(A, B) - gray(pa, pb) + 4) % 4;
    if (diff === 1) count += 1;
    else if (diff === 3) count -= 1;
    if (Z === 1 && pz === 0) { countAtVel -= count; count = 0; } // index: the count restarts, the velocity window keeps its increment
  }
  const k = sampleIndex(a.ctx.time, ts);
  if (k > kv) {
    vel = kv < 0 ? 0 : (scale * (count - countAtVel)) / ((k - kv) * ts);
    kv = k; countAtVel = count;
  }
  return { out: [vel, scale * count], mem: [kv, A, B, count, countAtVel, vel, Z] };
};
const quadDecoder: BlockEquationFactory = (a) => quadStep(a).out.map((v, i) => a.branch[i] - v);

/**
 * Resolver-to-digital converter, type II tracking loop (Boyes, "Synchro and resolver conversion", Analog Devices 1980; AD2S1200).
 * Resolver inputs vx = vp sin(theta), vy = vp cos(theta) (transformation ratio 1) on the carrier vp = E sin(w_c t) of peak vp_pk and
 * frequency `freq`. Synchronous demodulation of the angle error and a low pass at freq / 5:
 *   eps = 2 (vx cos(phi) - vy sin(phi)) vp / vp_pk^2  (mean sin(theta - phi)),   d e_f/dt = 2 pi (freq/5) (eps - e_f)
 * Type II loop of bandwidth w_n = 2 pi `bandwidth` and damping 1/sqrt(2):  d w/dt = w_n^2 e_f,  d phi / dt = w + 2 zeta w_n e_f
 * so the error obeys e'' + 2 zeta w_n e' + w_n^2 e = theta'' (zero steady-state error for a ramp angle). ang = phi (unwrapped), vel = w.
 */
const resolverToDigital: BlockEquationFactory = (a) => {
  const freq = requirePositive('freq', numericParam(a.params, 'freq', 10000));
  const bandwidth = requirePositive('bandwidth', numericParam(a.params, 'bandwidth', 100));
  const vpPk = requirePositive('vp_pk', numericParam(a.params, 'vp_pk', 1));
  const vp = scalarInput(a, 'vp');
  const vx = scalarInput(a, 'vx');
  const vy = scalarInput(a, 'vy');
  const [phi, omega, ef] = a.state;
  const eps = (2 * (vx * Math.cos(phi) - vy * Math.sin(phi)) * vp) / (vpPk * vpPk);
  const wn = TWO_PI * bandwidth;
  const zeta = Math.SQRT1_2;
  return [
    a.branch[0] - omega,
    a.branch[1] - phi,
    a.dState[0] - (omega + 2 * zeta * wn * ef),
    a.dState[1] - wn * wn * ef,
    a.dState[2] - TWO_PI * (freq / 5) * (eps - ef),
  ];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// registries
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const controllerEquations: Record<string, BlockEquationFactory> = {
  ps_pi_ctrl: psPi,
  ps_pid_ctrl: psPid,
  ps_state_feedback: psStateFeedback,
  ps_sliding_mode: psSlidingMode,
  ps_smith_predictor: psSmithPredictor,
  luenberger_observer: luenbergerObserver,
  lms_adaptive_filter: lms,
  rl_q_learning_controller: rl,
  im_flux_observer: imFluxObserver,
  pmsm_tq_est: pmsmTorqueEstimator,
  pmsm_curr_ctrl: dqCurrentController(2),
  im_curr_ctrl: dqCurrentController(1),
  pmsm_foc: pmsmFoc,
  pmsm_ref_gen: pmsmRefGen,
  pmsm_field_weakening: pmsmFieldWeakening,
  im_foc_ctrl: imFocCtrl,
  im_scalar_ctrl: imScalarCtrl,
  im_dtc_ctrl: imDtcCtrl,
  bldc_commutation: bldcCommutation,
  bldc_current_ctrl: bldcCurrentCtrl,
  bldc_pwm_ctrl: bldcPwmCtrl,
  dcdc_ctrl: dcdcCtrl,
  dc_voltage_ctrl: dcVoltageCtrl,
  dc_current_ctrl: dcCurrentCtrl,
  velocity_ctrl: velocityCtrl,
  hysteresis_ctrl_3ph: hysteresisCtrl,
  pfc_rectifier_ctrl: pfcRectifierCtrl,
  cycloconverter_ctrl: cycloconverterCtrl,
  quad_decoder: quadDecoder,
  resolver_to_digital: resolverToDigital,
};

const discrete = (initial: (p: Record<string, any>) => number[], step: (a: BlockEquationArgs) => Stepped): BlockHistorySpec => ({
  span: () => 0,
  first: 'initial',
  initial,
  record: a => step(a).mem,
});

/** What the discrete blocks remember (committed after every accepted step, see the file header). */
export const controllerHistory: Record<string, BlockHistorySpec> = {
  lms_adaptive_filter: discrete(lmsInitial, lmsStep),
  rl_q_learning_controller: discrete(rlInitial, rlStep),
  hysteresis_ctrl_3ph: discrete(hysteresisInitial, hysteresisStep),
  im_dtc_ctrl: discrete(dtcInitial, dtcStep),
  quad_decoder: discrete(quadInitial, quadStep),
  cycloconverter_ctrl: discrete(() => [1, -1], cycloStep),
  // the Smith predictor looks back theta seconds at its model output ym (state 0)
  ps_smith_predictor: { span: p => Math.max(0, numericParam(p, 'theta', 0.1)), record: a => [a.state[0]], first: 'state' },
};
