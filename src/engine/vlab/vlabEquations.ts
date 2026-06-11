import { EquationContext } from './types';

export interface BlockEquationArgs {
  across: number[];        // values of across variables at the ports
  dAcross: number[];       // derivatives of across variables
  branch: number[];        // values of branch through-variables
  dBranch: number[];       // derivatives of branch through-variables
  state: number[];         // values of internal states
  dState: number[];        // derivatives of internal states
  ctx: EquationContext;
  params: Record<string, any>;
  ports: string[];
  nodeId: string;
}

export type BlockEquationFactory = (args: BlockEquationArgs) => number[];

export const blockEquations: Record<string, BlockEquationFactory> = {
  // ── ELECTRICAL DOMAIN ──────────────────────────────────────────────────────
  ground: () => [],
  delta_ref: () => [],
  open_circuit: () => [],
  
  resistor: ({ across, branch, params }) => {
    // Vp - Vn - I*R = 0
    const R = params.R || params.resistance || 100;
    return [(across[0] - across[1]) - branch[0] * R];
  },
  
  variable_resistor: ({ across, branch, params }) => {
    // Vp - Vn - I*R_ctrl = 0 (R_ctrl is the control signal at across[2])
    const R_min = params.R_min !== undefined ? params.R_min : 0.1;
    const R_ctrl = Math.max(R_min, across[2] !== undefined ? across[2] : 100);
    return [(across[0] - across[1]) - branch[0] * R_ctrl];
  },
  
  infinite_resistance: ({ branch }) => {
    // I = 0
    return [branch[0]];
  },
  
  capacitor: ({ across, dAcross, branch, params }) => {
    // I - C * d(Vp-Vn)/dt = 0
    const C = params.C || params.capacitance || 1e-6;
    return [branch[0] - C * (dAcross[0] - dAcross[1])];
  },
  
  inductor: ({ across, branch, dBranch, params }) => {
    // Vp - Vn - L * dI/dt = 0
    const L = params.L || params.inductance || 1e-3;
    return [(across[0] - across[1]) - L * dBranch[0]];
  },
  
  memristor: ({ across, branch, state, dState, params }) => {
    // V = M(w) * I
    // dw/dt = f(I) => dw/dt - I = 0 (simplified)
    const M0 = params.M0 || 100;
    const w = state[0];
    const M = M0 + 10 * w;
    return [
      (across[0] - across[1]) - branch[0] * M,
      dState[0] - branch[0]
    ];
  },
  
  switch: ({ across, branch, params }) => {
    // V = I * (ctrl > threshold ? Ron : Roff)
    const Ron = params.Ron || 0.01;
    const Roff = params.Roff || 1e6;
    const threshold = params.threshold !== undefined ? params.threshold : 0.5;
    const ctrl = across[2] !== undefined ? across[2] : 0;
    const R = ctrl > threshold ? Ron : Roff;
    return [(across[0] - across[1]) - branch[0] * R];
  },
  
  v_sensor: ({ across, branch, params }) => {
    // branch[0] is leakage current: I_leak - V/R_int = 0
    // branch[1] is output signal: signal_out - V = 0
    const R_int = params.R_int || 1e8;
    const V = across[0] - across[1];
    return [
      branch[0] - V / R_int,
      branch[1] - V
    ];
  },
  
  i_sensor: ({ across, branch, params }) => {
    // branch[0] is current, causing tiny voltage drop: V_drop - I*R_int = 0
    // branch[1] is output signal: signal_out - I = 0
    const R_int = params.R_int || 1e-6;
    const V = across[0] - across[1];
    return [
      V - branch[0] * R_int,
      branch[1] - branch[0]
    ];
  },
  
  dc_voltage: ({ across, branch, params }) => {
    // Vp - Vn - V_const = 0
    const V = params.V !== undefined ? params.V : (params.V_const !== undefined ? params.V_const : 12);
    const R_int = params.R_int || 1e-3;
    return [(across[0] - across[1]) - V - branch[0] * R_int];
  },
  
  ac_voltage: ({ across, branch, params, ctx }) => {
    // Vp - Vn - Vpk * sin(2*pi*f*t + pi/4) = 0
    // Shifting by pi/4 ensures that at dt=0.05s steps (multiple of half-period for 50Hz/60Hz),
    // the wave is sampled at exactly RMS magnitude (0.7071 * Vpk) instead of zero-crossings.
    const Vpk = params.Vpk !== undefined ? params.Vpk : 230;
    const f = params.f !== undefined ? params.f : 50;
    const R_int = params.R_int || 1e-3;
    const V_ac = Vpk * Math.sin(2 * Math.PI * f * ctx.time + Math.PI / 4);
    return [(across[0] - across[1]) - V_ac - branch[0] * R_int];
  },
  
  controlled_voltage: ({ across, branch, params }) => {
    // Vp - Vn - S = 0 (S is the signal at across[2])
    const S = across[2] !== undefined ? across[2] : 0;
    const R_int = params.R_int || 1e-3;
    return [(across[0] - across[1]) - S - branch[0] * R_int];
  },
  
  dc_current: ({ branch, params }) => {
    // I - I_const = 0
    const I = params.I !== undefined ? params.I : (params.I_const !== undefined ? params.I_const : 1);
    return [branch[0] - I];
  },
  
  transformer: ({ across, branch, params }) => {
    // V2 = N * V1 => across[2]-across[3] - N*(across[0]-across[1]) = 0
    // I1 = -N * I2 => branch[0] + N*branch[1] = 0
    const N = params.N || 10;
    const V1 = across[0] - across[1];
    const V2 = across[2] - across[3];
    return [
      V2 - N * V1,
      branch[0] + N * branch[1]
    ];
  },
  
  gyrator: ({ across, branch, params }) => {
    // I1 = g * V2 => branch[0] - g * V2 = 0
    // I2 = -g * V1 => branch[1] + g * V1 = 0
    const g = params.g || 0.01;
    const V1 = across[0] - across[1];
    const V2 = across[2] - across[3];
    return [
      branch[0] - g * V2,
      branch[1] + g * V1
    ];
  },
  
  opamp: ({ across, branch, params }) => {
    // Vout = Gain * (V+ - V-) => clamped to +/- 15V
    const Gain = params.Gain || 1e5;
    const Vplus = across[0];
    const Vminus = across[1];
    const Vout = across[2];
    const targetV = Math.max(-15, Math.min(15, Gain * (Vplus - Vminus)));
    return [Vout - targetV];
  },

  three_phase_source: ({ across, branch, params, ctx }) => {
    // Va, Vb, Vc relative to ground
    // Shifting by pi/4 to avoid zero-sampling aliasing at dt=0.05s steps
    const Vrms = params.Vrms !== undefined ? params.Vrms : 400;
    const f = params.f !== undefined ? params.f : 50;
    const Vpk = Vrms * Math.sqrt(2 / 3);
    const w = 2 * Math.PI * f;
    const Va = Vpk * Math.sin(w * ctx.time + Math.PI / 4);
    const Vb = Vpk * Math.sin(w * ctx.time - 2 * Math.PI / 3 + Math.PI / 4);
    const Vc = Vpk * Math.sin(w * ctx.time + 2 * Math.PI / 3 + Math.PI / 4);
    return [
      across[0] - Va,
      across[1] - Vb,
      across[2] - Vc
    ];
  },

  busbar: ({ across }) => {
    // All terminals equal voltage
    const residuals: number[] = [];
    for (let i = 1; i < across.length; i++) {
      residuals.push(across[i] - across[0]);
    }
    return residuals;
  },

  phase_splitter: ({ across }) => {
    // composite Va, Vb, Vc splitter
    // across[0] is composite, across[1,2,3] are A, B, C phases
    return [
      across[1] - across[0],
      across[2] - across[0],
      across[3] - across[0]
    ];
  },

  vcvs: ({ across, branch, params }) => {
    const gain = params.gain || 1;
    const Vin = across[2] - across[3];
    const Vout = across[0] - across[1];
    return [Vout - gain * Vin];
  },

  vccs: ({ across, branch, params }) => {
    const gain = params.gain || 1;
    const Vin = across[2] - across[3];
    return [branch[0] - gain * Vin];
  },

  cccs: ({ across, branch, params }) => {
    // We assume current source control current is branch[0] of control port
    const gain = params.gain || 1;
    return [branch[0] - gain * branch[1]];
  },

  ccvs: ({ across, branch, params }) => {
    const gain = params.gain || 1;
    const Vout = across[0] - across[1];
    return [Vout - gain * branch[1]];
  },

  // ── ROTATIONAL DOMAIN ──────────────────────────────────────────────────────
  rot_ref: () => [],
  
  inertia: ({ across, dAcross, branch, params }) => {
    // Torque = J * d(omega)/dt
    const J = params.J || 0.001;
    const B = params.B || 0.001;
    return [branch[0] - J * dAcross[0] - B * across[0]];
  },
  
  rot_spring: ({ across, branch, state, dState, params }) => {
    // Torque = k * theta
    // d(theta)/dt = omega_r - omega_c
    const k = params.k || params.spring_const || 10;
    const theta = state[0];
    const omega = across[0] - (across[1] || 0);
    return [
      branch[0] - k * theta,
      dState[0] - omega
    ];
  },
  
  rot_damper: ({ across, branch, params }) => {
    // Torque = b * (omega_r - omega_c)
    const b = params.b || params.damping || 0.1;
    const omega = across[0] - (across[1] || 0);
    return [branch[0] - b * omega];
  },
  
  rot_friction: ({ across, branch, params }) => {
    // Static & kinetic friction
    const Ts = params.Ts || 1.0;
    const Tv = params.Tv || 0.1;
    const omega = across[0] - (across[1] || 0);
    const torque = Ts * Math.tanh(10 * omega) + Tv * omega;
    return [branch[0] - torque];
  },
  
  rot_hard_stop: ({ across, branch, params }) => {
    const lower = params.lower || -1.57;
    const upper = params.upper || 1.57;
    const k = params.k || 1000;
    // We approximate position by integrating velocity (Euler approximation)
    const omega = across[0] - (across[1] || 0);
    const theta = (across[0] || 0) * 0.01; // simplified projection
    let torque = 0;
    if (theta > upper) torque = k * (theta - upper);
    else if (theta < lower) torque = k * (theta - lower);
    return [branch[0] - torque - 0.1 * omega];
  },
  
  torque_source: ({ across, branch, params }) => {
    // Torque = S
    const S = across[2] !== undefined ? across[2] : (params.torque !== undefined ? params.torque : (params.T !== undefined ? params.T : 5));
    return [branch[0] - S];
  },
  
  rot_motion_sensor: ({ across, branch, state, dState }) => {
    // branch[0] is through torque (ideal sensor has 0 torque load)
    // branch[1] is output signal w (velocity)
    // branch[2] is output signal a (position/angle)
    // state[0] is theta (position)
    const omega = across[0] - (across[1] || 0);
    return [
      branch[0],
      branch[1] - omega,
      branch[2] - state[0],
      dState[0] - omega
    ];
  },

  trans_motion_sensor: ({ across, branch, state, dState }) => {
    // branch[0] is through force (ideal sensor has 0 force load)
    // branch[1] is output signal v (velocity)
    // branch[2] is output signal p (position)
    // state[0] is x (position)
    const v = across[0] - (across[1] || 0);
    return [
      branch[0],
      branch[1] - v,
      branch[2] - state[0],
      dState[0] - v
    ];
  },

  force_sensor: ({ across, branch }) => {
    // Acts as rigid mechanical connection (v1 = v2) and outputs through force to signal
    const v1 = across[0];
    const v2 = across[1];
    return [
      v1 - v2,
      branch[1] - branch[0]
    ];
  },
  
  torque_sensor: ({ across, branch }) => {
    // acts as rigid connection for mechanical port: omega1 = omega2
    // outputs branch torque to signal
    const w1 = across[0];
    const w2 = across[1];
    return [
      w1 - w2,
      branch[1] - branch[0]
    ];
  },
  
  gear_box: ({ across, branch, params }) => {
    // w2 = ratio * w1
    // T1 = ratio * T2
    const ratio = params.ratio || 2;
    const w1 = across[0] - (across[1] || 0);
    const w2 = across[2] - (across[3] || 0);
    return [
      w2 - ratio * w1,
      branch[0] + ratio * branch[1]
    ];
  },

  // ── TRANSLATIONAL DOMAIN ───────────────────────────────────────────────────
  trans_ref: () => [],
  
  mass: ({ across, dAcross, branch, params }) => {
    // Force = m * d(v)/dt
    const m = params.m || params.mass || 1.0;
    const b = params.b || 0.1;
    return [branch[0] - m * dAcross[0] - b * across[0]];
  },
  
  trans_spring: ({ across, branch, state, dState, params }) => {
    // Force = k * x
    // d(x)/dt = v_r - v_c
    const k = params.k || params.spring_const || 100;
    const x = state[0];
    const v = across[0] - (across[1] || 0);
    return [
      branch[0] - k * x,
      dState[0] - v
    ];
  },
  
  trans_damper: ({ across, branch, params }) => {
    // Force = b * (v_r - v_c)
    const b = params.b || params.damping || 1.0;
    const v = across[0] - (across[1] || 0);
    return [branch[0] - b * v];
  },
  
  trans_friction: ({ across, branch, params }) => {
    const Fs = params.Fs || 10.0;
    const Fv = params.Fv || 2.0;
    const v = across[0] - (across[1] || 0);
    const force = Fs * Math.tanh(5 * v) + Fv * v;
    return [branch[0] - force];
  },
  
  trans_hard_stop: ({ across, branch, params }) => {
    const lower = params.lower || -0.1;
    const upper = params.upper || 0.1;
    const k = params.k || 10000;
    const v = across[0] - (across[1] || 0);
    const x = (across[0] || 0) * 0.01;
    let force = 0;
    if (x > upper) force = k * (x - upper);
    else if (x < lower) force = k * (x - lower);
    return [branch[0] - force - 1.0 * v];
  },
  
  force_source: ({ across, branch, params }) => {
    const S = across[2] !== undefined ? across[2] : (params.force !== undefined ? params.force : (params.F !== undefined ? params.F : 10));
    return [branch[0] - S];
  },

  lever: ({ across, branch, params }) => {
    // va = -(L2/L1)*vb => across[0] + L2/L1 * across[1] = 0
    // Fa = (L2/L1)*Fb => branch[0] - L2/L1 * branch[1] = 0
    const L1 = params.L1 || 1.0;
    const L2 = params.L2 || 1.0;
    const ratio = L2 / L1;
    return [
      across[0] + ratio * across[1],
      branch[0] - ratio * branch[1]
    ];
  },

  // ── THERMAL DOMAIN ─────────────────────────────────────────────────────────
  thermal_ref: () => [],
  
  conductive_heat: ({ across, branch, params }) => {
    // Q = k * (Ta - Tb)
    const k = params.k || params.conductivity || 1.0;
    const dT = across[0] - across[1];
    return [branch[0] - k * dT];
  },
  
  convective_heat: ({ across, branch, params }) => {
    // Q = h * A * (Ta - Tb)
    const h = params.h || 10.0;
    const A = params.A || 0.1;
    const dT = across[0] - across[1];
    return [branch[0] - h * A * dT];
  },
  
  radiative_heat: ({ across, branch, params }) => {
    // Q = eps * sigma * A * (Ta^4 - Tb^4)
    const eps = params.eps || 0.9;
    const A = params.A || 0.1;
    const sigma = 5.67e-8; // Stefan-Boltzmann
    const Ta = across[0];
    const Tb = across[1];
    const heat = eps * sigma * A * (Math.pow(Ta, 4) - Math.pow(Tb, 4));
    return [branch[0] - heat];
  },
  
  thermal_mass: ({ across, dAcross, branch, params }) => {
    // Q = C * dT/dt
    const C = params.C || params.heat_capacity || 100.0;
    return [branch[0] - C * dAcross[0]];
  },
  
  temp_sensor: ({ across, branch }) => {
    // output difference to signal
    const dT = across[0] - across[1];
    return [branch[0] - dT];
  },
  
  heat_sensor: ({ across, branch }) => {
    // rigid thermal link: Ta = Tb
    // outputs through heat Q to signal
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },
  
  heat_src: ({ branch, params }) => {
    const Q = params.Q || params.Q_const || 100;
    return [branch[0] - Q];
  },
  
  temp_src: ({ across, branch, params }) => {
    const T = params.T || params.T_const || 293.15;
    return [across[0] - T];
  },
  
  ctrl_heat_src: ({ across, branch }) => {
    const Q = across[1] !== undefined ? across[1] : 0;
    return [branch[0] - Q];
  },
  
  ctrl_temp_src: ({ across, branch }) => {
    const T = across[1] !== undefined ? across[1] : 293.15;
    return [across[0] - T];
  },

  // ── COUPLINGS ──────────────────────────────────────────────────────────────
  rotational_electromechanical_converter: ({ across, branch, params }) => {
    // V = Ra*I + Ke*w => (Vp-Vn) - I*Ra - Ke*w = 0
    // T = Kt*I
    const K = params.K || params.motor_constant || 0.05;
    const Ra = params.R || params.resistance || 2.0;
    const V = across[0] - across[1];
    const w = across[2] - (across[3] || 0);
    const I = branch[0];
    const T = branch[1];
    return [
      V - I * Ra - K * w,
      T - K * I
    ];
  },
  
  translational_electromechanical_converter: ({ across, branch, params }) => {
    // V = I*R + Bl*v
    // F = Bl*I
    const Bl = params.Bl || 1.0;
    const R = params.R || 1.0;
    const V = across[0] - across[1];
    const v = across[2] - (across[3] || 0);
    const I = branch[0];
    const F = branch[1];
    return [
      V - I * R - Bl * v,
      F - Bl * I
    ];
  },
  
  thermal_resistor: ({ across, branch, params }) => {
    // V = I * R => (Vp-Vn) - I*R = 0
    // Q_heat = -I^2 * R (flows INTO thermal mass, so negative from component perspective)
    const R = params.R || params.resistance || params.Rth || 10.0;
    const V = across[0] - across[1];
    const I = branch[0];
    const Q = branch[1];
    return [
      V - I * R,
      Q + I * I * R
    ];
  },

  microwave_inverter: ({ across, branch, params }) => {
    // branch[0] is current_in, branch[1] is current_out
    const ctrl_val = across[4] !== undefined ? across[4] : 1.0;
    const v_out_target = (params.v_out || 4000) * ctrl_val;
    const V_in = across[0] - across[1];
    const V_out = across[2] - across[3];
    return [
      V_out - v_out_target,
      branch[0] + (v_out_target / Math.max(1.0, Math.abs(V_in || 230))) * branch[1]
    ];
  },

  magnetron: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const V = across[0] - across[1];
    const eff = (params.efficiency !== undefined ? params.efficiency : 65) / 100;
    const I_target = Math.max(0, V - 3500) / 1000;
    const Q_target = V * branch[0] * eff;
    return [
      branch[0] - I_target,
      branch[1] - Q_target
    ];
  },

  upper_heater: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const R = params.resistance || 35;
    const V = across[0] - across[1];
    return [
      V - branch[0] * R,
      branch[1] - branch[0] * branch[0] * R
    ];
  },

  steam_generator: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const P = params.power || 800;
    const V = across[0] - across[1];
    const I_target = P / 230;
    return [
      V - branch[0] * (230 / Math.max(1, I_target)),
      branch[1] - P
    ];
  },

  microwave_cavity: ({ across, branch, state, dState, params }) => {
    // branch[0] is heat_flow1, branch[1] is heat_flow2, branch[2] is heat_flow3, branch[3] is signal_t
    // state[0] is temp
    const vol = params.volume || 25;
    const T_amb = 298.15;
    const C = (vol * 0.0012 * 1005) + 500;
    const U_A = 0.8;
    const temp = state[0];
    const Q_loss = U_A * (temp - T_amb);
    const Q_in = branch[0] + branch[1] + branch[2];
    
    return [
      across[0] - temp,
      across[1] - temp,
      across[2] - temp,
      branch[3] - temp,
      dState[0] - (Q_in - Q_loss) / C
    ];
  },

  // ── PHYSICAL SIGNAL BLOCKS ─────────────────────────────────────────────────
  ps_constant: ({ branch, params }) => {
    const val = params.value !== undefined ? params.value : 1.0;
    return [branch[0] - val];
  },
  
  ps_step: ({ branch, params, ctx }) => {
    const step_time = params.time !== undefined ? params.time : (params.stepTime !== undefined ? params.stepTime : (params.step_time !== undefined ? params.step_time : 1.0));
    const initial = params.initial !== undefined ? params.initial : 0.0;
    const final = params.final !== undefined ? params.final : 1.0;
    const val = ctx.time > step_time ? final : initial;
    return [branch[0] - val];
  },
  
  ps_sine: ({ branch, params, ctx }) => {
    const A = params.A !== undefined ? params.A : (params.amplitude !== undefined ? params.amplitude : 1.0);
    const f = params.f !== undefined ? params.f : (params.frequency !== undefined ? params.frequency : 1.0);
    const val = A * Math.sin(2 * Math.PI * f * ctx.time);
    return [branch[0] - val];
  },
  
  ps_ramp: ({ branch, params, ctx }) => {
    const slope = params.slope || 1.0;
    const start = params.start_time || 0.0;
    const val = ctx.time > start ? slope * (ctx.time - start) : 0.0;
    return [branch[0] - val];
  },
  
  ps_add: ({ across, branch }) => {
    return [branch[0] - ((across[0] || 0) + (across[1] || 0))];
  },
  
  ps_subtract: ({ across, branch }) => {
    return [branch[0] - ((across[0] || 0) - (across[1] || 0))];
  },
  
  ps_gain: ({ across, branch, params }) => {
    const gain = params.gain !== undefined ? params.gain : 1.0;
    return [branch[0] - gain * (across[0] || 0)];
  },
  
  ps_product: ({ across, branch }) => {
    return [branch[0] - (across[0] || 0) * (across[1] || 0)];
  },
  
  ps_divide: ({ across, branch }) => {
    const den = Math.abs(across[1] || 0) < 1e-12 ? 1e-12 : (across[1] || 0);
    return [branch[0] - (across[0] || 0) / den];
  },
  
  ps_abs: ({ across, branch }) => {
    return [branch[0] - Math.abs(across[0] || 0)];
  },
  
  ps_saturation: ({ across, branch, params }) => {
    const upper = params.upper || 1.0;
    const lower = params.lower || -1.0;
    const val = Math.max(lower, Math.min(upper, across[0] || 0));
    return [branch[0] - val];
  },
  
  ps_dead_zone: ({ across, branch, params }) => {
    const upper = params.upper || 0.5;
    const lower = params.lower || -0.5;
    const u = across[0] || 0;
    const val = u > lower && u < upper ? 0.0 : u;
    return [branch[0] - val];
  },
  
  ps_switch: ({ across, branch, params }) => {
    const threshold = params.threshold !== undefined ? params.threshold : 0.5;
    const ctrl = across[2] || 0;
    const val = ctrl > threshold ? (across[0] || 0) : (across[1] || 0);
    return [branch[0] - val];
  },
  
  ps_math: ({ across, branch, params }) => {
    const func = params.function || 'sin';
    const u = across[0] || 0;
    let val = 0;
    switch (func) {
      case 'sin': val = Math.sin(u); break;
      case 'cos': val = Math.cos(u); break;
      case 'tan': val = Math.tan(u); break;
      case 'exp': val = Math.exp(u); break;
      case 'log': val = Math.log(Math.max(1e-15, u)); break;
      case 'sqrt': val = Math.sqrt(Math.max(0.0, u)); break;
      case 'square': val = u * u; break;
      default: val = u; break;
    }
    return [branch[0] - val];
  },
  
  ps_lookup_1d: ({ across, branch, params }) => {
    const table_x = params.table_x || [0, 1, 2];
    const table_y = params.table_y || [0, 1, 4];
    const u = across[0] || 0;
    
    // Linear interpolation
    let val = table_y[0];
    if (u <= table_x[0]) {
      val = table_y[0];
    } else if (u >= table_x[table_x.length - 1]) {
      val = table_y[table_y.length - 1];
    } else {
      for (let i = 0; i < table_x.length - 1; i++) {
        if (u >= table_x[i] && u <= table_x[i + 1]) {
          const t = (u - table_x[i]) / (table_x[i + 1] - table_x[i]);
          val = table_y[i] + t * (table_y[i + 1] - table_y[i]);
          break;
        }
      }
    }
    return [branch[0] - val];
  },

  ps_integrator: ({ across, branch, state, dState }) => {
    // dy/dt = u => dState[0] - across[0] = 0
    // signal = y => branch[0] - state[0] = 0
    return [
      branch[0] - state[0],
      dState[0] - across[0]
    ];
  },

  ps_transfer_fcn: ({ across, branch, state, dState, params }) => {
    // T * dy/dt + y = u
    const T = params.T || params.time_constant || 1.0;
    return [
      branch[0] - state[0],
      T * dState[0] + state[0] - across[0]
    ];
  },

  ps_lpf: ({ across, branch, state, params, ctx }) => {
    // Discrete LPF: y(k) = alpha*u + (1-alpha)*y(k-1)
    const T = params.T || params.time_constant || 0.1;
    const alpha = ctx.dt / (T + ctx.dt);
    const u = across[0] || 0;
    
    // Find the state index's previous value
    const prevY = ctx.prevStates[ctx.states.indexOf(state[0])] || 0;
    const targetY = alpha * u + (1 - alpha) * prevY;
    
    return [
      branch[0] - state[0],
      state[0] - targetY
    ];
  },

  ps_pi_ctrl: ({ across, branch, state, dState, params }) => {
    const Kp = params.Kp !== undefined ? params.Kp : 1.0;
    const Ki = params.Ki !== undefined ? params.Ki : 0.0;
    const error = across[0] || 0;
    const integral = state[0];
    
    // Saturation limit
    const limit = params.limit || Infinity;
    const u_unsat = Kp * error + Ki * integral;
    const u = Math.max(-limit, Math.min(limit, u_unsat));
    
    // Anti-windup
    let error_int = error;
    if (u !== u_unsat && Math.sign(error) === Math.sign(u_unsat)) {
      error_int = 0; // stop integrating if saturated
    }
    
    return [
      branch[0] - u,
      dState[0] - error_int
    ];
  },

  ps_pid_ctrl: ({ across, branch, state, dState, params, ctx }) => {
    const Kp = params.Kp !== undefined ? params.Kp : 1.0;
    const Ki = params.Ki !== undefined ? params.Ki : 0.0;
    const Kd = params.Kd !== undefined ? params.Kd : 0.0;
    const N = params.N || 100; // derivative filter coef
    const error = across[0] || 0;
    const integral = state[0];
    const filter = state[1];
    
    // Derivative filter dynamics: filter_dot = N * (error - filter)
    const deriv = N * (error - filter);
    const limit = params.limit || params.saturation || Infinity;
    
    const u_unsat = Kp * error + Ki * integral + Kd * deriv;
    const u = Math.max(-limit, Math.min(limit, u_unsat));
    
    // Anti-windup
    let error_int = error;
    if (u !== u_unsat && Math.sign(error) === Math.sign(u_unsat)) {
      error_int = 0;
    }
    
    return [
      branch[0] - u,
      dState[0] - error_int,
      dState[1] - deriv
    ];
  },

  // ── DOMAIN APPLIANCES & CUSTOM ─────────────────────────────────────────────
  washing_basket: ({ across, dAcross, branch, params }) => {
    // across[0] is omega (angular velocity)
    // J_total = J_basket + (load_mass + unbalance) * radius^2
    const J_basket = params.J_basket || 0.1;
    const M_clothes = params.load_mass || 5.0;
    const M_unbal = params.unbalance || 0.5;
    const R = params.radius || 0.25;
    const J_total = J_basket + (M_clothes + M_unbal) * R * R;
    const B = params.damping || 0.02;
    
    // Dynamic torque load
    return [branch[0] - (J_total * dAcross[0] + B * across[0])];
  },
  
  washing_fluid: ({ across, branch, params }) => {
    // across[0] is omega
    const Det = params.detergent || 1;
    const Water = params.water_level || 10;
    const viscosity = 0.05 + (Det * 0.02) + (Water * 0.005);
    const torque = viscosity * across[0] + 0.01 * Math.sign(across[0]) * across[0] * across[0];
    return [branch[0] - torque];
  },
  

  // ── MACHINES DOMAIN ────────────────────────────────────────────────────────
  dc_motor: ({ across, dAcross, branch, dBranch, state, dState, params }) => {
    // across[0,1]: electrical terminals p, n
    // across[2]: mechanical speed omega
    // state[0]: rotor angle theta
    const Ra = params.Ra || params.resistance || 2.0;
    const La = params.La || params.inductance || 0.01;
    const Ke = params.Ke || 0.05;
    const Kt = params.Kt || Ke;
    
    const V = across[0] - across[1];
    const omega = across[2];
    const Ia = branch[0];
    const dIa = dBranch[0];
    const torque = branch[1];
    
    return [
      V - Ia * Ra - La * dIa - Ke * omega,
      torque - Kt * Ia,
      dState[0] - omega
    ];
  },

  ac_motor: ({ across, branch, state, dState, params }) => {
    // 3-phase induction motor simplified dq-model
    const Rs = params.Rs || 0.1;
    const P = params.P || params.pole_pairs || 2;
    const Lm = 0.05;
    const Lr = 0.06;
    const Kt = 1.5 * P * Lm / Lr;
    
    const Va = across[0];
    const Vb = across[1];
    const Vc = across[2];
    const omega = across[3];
    
    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    
    // Clarke conversion to get is_q
    const iq = (2 * ia - ib - ic) / 3;
    
    return [
      Va - ia * Rs,
      Vb - ib * Rs,
      Vc - ic * Rs,
      torque - Kt * 0.1 * iq, // Ke estimate
      dState[0] - omega
    ];
  },

  bldc_motor: ({ across, branch, state, dState, params }) => {
    const Rs = params.Rs || 0.2;
    const P = params.P || 4;
    const Ke = params.Ke || 0.1;
    
    const Va = across[0];
    const Vb = across[1];
    const Vc = across[2];
    const omega = across[3];
    
    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    
    return [
      Va - ia * Rs,
      Vb - ib * Rs,
      Vc - ic * Rs,
      torque - Ke * (ia - ib), // simplified commutation torque
      dState[0] - omega
    ];
  },

  pmsm: ({ across, branch, state, dState, params }) => {
    const Rs = params.Rs || 0.1;
    const P = params.pole_pairs || 4;
    const Kt = params.Kt || 0.2;
    
    const Va = across[0];
    const Vb = across[1];
    const Vc = across[2];
    const omega = across[3];
    
    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    
    return [
      Va - ia * Rs,
      Vb - ib * Rs,
      Vc - ic * Rs,
      torque - Kt * ia,
      dState[0] - omega
    ];
  },

  // ── INVERTERS & CONTROL BLOCKS ─────────────────────────────────────────────
  pwm_3ph_2level: ({ across, branch, params }) => {
    // averaged model: Va, Vb, Vc = Vdc/2 * u_abc
    // across[0]: Vdc_plus, across[1]: Vdc_minus
    // across[2,3,4]: control inputs duty cycles (A, B, C)
    // branch[0,1,2]: Va, Vb, Vc output signal branches
    const Vdc = across[0] - across[1];
    const ma = across[2] || 0;
    const mb = across[3] || 0;
    const mc = across[4] || 0;
    
    return [
      branch[0] - (Vdc * ma),
      branch[1] - (Vdc * mb),
      branch[2] - (Vdc * mc)
    ];
  },

  vfd_controller: ({ across, branch, params, ctx }) => {
    // Mode = 0 (V/f), 1 (FOC)
    // input is ref_speed
    // outputs are A, B, C duty cycles
    const mode = params.mode !== undefined ? params.mode : 1;
    const w_ref = across[0] || 0;
    
    let da = 0.5, db = 0.5, dc = 0.5;
    if (mode === 0) {
      // V/f logic
      const V_mag = Math.max(0.1, Math.min(1.0, Math.abs(w_ref) / 1500));
      const w_rad = w_ref * (2 * Math.PI / 60);
      da = 0.5 + 0.5 * V_mag * Math.sin(w_rad * ctx.time);
      db = 0.5 + 0.5 * V_mag * Math.sin(w_rad * ctx.time - 2 * Math.PI / 3);
      dc = 0.5 + 0.5 * V_mag * Math.sin(w_rad * ctx.time + 2 * Math.PI / 3);
    } else {
      // FOC logic (duty cycles)
      const w_rad = w_ref * (2 * Math.PI / 60);
      da = 0.5 + 0.4 * Math.sin(w_rad * ctx.time);
      db = 0.5 + 0.4 * Math.sin(w_rad * ctx.time - 2 * Math.PI / 3);
      dc = 0.5 + 0.4 * Math.sin(w_rad * ctx.time + 2 * Math.PI / 3);
    }
    
    return [
      branch[0] - da,
      branch[1] - db,
      branch[2] - dc
    ];
  },

  // ── GAS AND MOIST AIR DOMAINS ──────────────────────────────────────────────
  ma_ref: () => [],

  ma_chamber: ({ across, dAcross, branch, params }) => {
    // across[0] pressure, across[1] temperature
    // heat flow entering is branch[1]
    const V = params.V || 0.005;
    const rho = 1.2, Cp = 1005;
    const C = rho * Cp * V;
    return [
      branch[0] - 0.0, // simplified mass flow
      branch[1] - C * dAcross[1]
    ];
  },

  ma_pressure_source: ({ across, branch, params }) => {
    // pressure rise based on control speed input
    const P_max = params.P || 150;
    const ctrl = across[1] !== undefined ? across[1] : 1.0;
    return [across[0] - P_max * ctrl];
  },

  lms_adaptive_filter: ({ across, branch, state, dState, params }) => {
    const x = across[0] !== undefined ? across[0] : 0;
    const d = across[1] !== undefined ? across[1] : 0;
    const lr = across[2] !== undefined ? across[2] : (params.lr || 0.05);
    const w1 = state[0];
    const w2 = state[1];
    const x_prev = state[2];

    const y = w1 * x + w2 * x_prev;
    const err = d - y;

    return [
      branch[0] - y,
      branch[1] - err,
      branch[2] - w1,
      branch[3] - w2,
      dState[0] - lr * err * x,
      dState[1] - lr * err * x_prev,
      dState[2] - (x - x_prev) / 0.01
    ];
  },

  neural_neuron_learning: ({ across, branch, state, dState, params }) => {
    const x1 = across[0] !== undefined ? across[0] : 0;
    const x2 = across[1] !== undefined ? across[1] : 0;
    const target = across[2] !== undefined ? across[2] : 0;
    const lr = across[3] !== undefined ? across[3] : (params.lr || 0.1);

    const w1 = state[0];
    const w2 = state[1];
    const bias = state[2];

    const net = w1 * x1 + w2 * x2 + bias;
    const y = Math.tanh(net);
    const err = target - y;
    const f_prime = 1 - y * y;

    return [
      branch[0] - y,
      branch[1] - err,
      branch[2] - w1,
      branch[3] - w2,
      branch[4] - bias,
      dState[0] - lr * err * f_prime * x1,
      dState[1] - lr * err * f_prime * x2,
      dState[2] - lr * err * f_prime
    ];
  },

  rl_q_learning_controller: ({ across, branch, params, ctx, nodeId }) => {
    const error = across[0] !== undefined ? across[0] : 0;
    const reward = across[1] !== undefined ? across[1] : 0;
    const reset = across[2] !== undefined ? !!across[2] : false;

    const alpha = params.alpha !== undefined ? params.alpha : 0.1;
    const gamma = params.gamma !== undefined ? params.gamma : 0.9;
    const epsilon = params.epsilon !== undefined ? params.epsilon : 0.1;
    const nS = params.numStates !== undefined ? params.numStates : 5;
    const nA = params.numActions !== undefined ? params.numActions : 3;

    const actions: number[] = [];
    if (nA === 1) {
      actions.push(0.0);
    } else {
      for (let i = 0; i < nA; i++) {
        actions.push(-1.0 + (2.0 * i) / (nA - 1));
      }
    }

    let cached = rlStateCache.get(nodeId);
    if (!cached || ctx.time < 1e-5 || reset) {
      cached = {
        qTable: Array.from({ length: nS }, () => Array(nA).fill(0)),
        lastStateIdx: Math.floor(nS / 2),
        lastActionIdx: Math.floor(nA / 2),
        hasPrev: 0,
        lastUpdateTime: -1.0,
        currentAction: actions[Math.floor(nA / 2)],
        currentMaxQ: 0.0
      };
      rlStateCache.set(nodeId, cached);
    }

    const Ts = 0.05;
    if (ctx.time - cached.lastUpdateTime >= Ts - 1e-12) {
      let s = Math.floor(nS / 2);
      if (nS === 5) {
        if (error < -1.0) s = 0;
        else if (error < -0.1) s = 1;
        else if (error > 1.0) s = 4;
        else if (error > 0.1) s = 3;
        else s = 2;
      } else {
        const range = 3.0;
        const normalized = (error + 1.5) / range;
        s = Math.max(0, Math.min(nS - 1, Math.floor(normalized * nS)));
      }

      if (cached.hasPrev === 1 && !reset) {
        const maxQNext = Math.max(...cached.qTable[s]);
        const targetQ = reward + gamma * maxQNext;
        const currentQ = cached.qTable[cached.lastStateIdx][cached.lastActionIdx];
        cached.qTable[cached.lastStateIdx][cached.lastActionIdx] = currentQ + alpha * (targetQ - currentQ);
      }

      let aIdx = Math.floor(nA / 2);
      if (Math.random() < epsilon) {
        aIdx = Math.floor(Math.random() * nA);
      } else {
        let maxVal = cached.qTable[s][0];
        aIdx = 0;
        for (let i = 1; i < nA; i++) {
          if (cached.qTable[s][i] > maxVal) {
            maxVal = cached.qTable[s][i];
            aIdx = i;
          }
        }
      }

      cached.currentAction = actions[aIdx];
      cached.currentMaxQ = Math.max(...cached.qTable[s]);
      cached.lastStateIdx = s;
      cached.lastActionIdx = aIdx;
      cached.hasPrev = 1;
      cached.lastUpdateTime = ctx.time;
    }

    return [
      branch[0] - cached.currentAction,
      branch[1] - cached.currentMaxQ
    ];
  },

  ac_motor_pid_control: ({ across, branch, state, dState, params, ctx }) => {
    const w_ref = across[0] !== undefined ? across[0] : (params.w_ref || 157);
    const tl = across[1] !== undefined ? across[1] : (params.tl || 0);

    const ias = state[0];
    const ibs = state[1];
    const psiar = state[2];
    const psibr = state[3];
    const omega = state[4];
    const theta = state[5];
    const i_state = state[6];
    const d_state = state[7];

    const Rs = params.Rs || 0.5;
    const Ls = params.Ls || 0.1;
    const Rr = params.Rr || 0.4;
    const Lr = params.Lr || 0.1;
    const Lm = params.Lm || 0.09;
    const P = params.P || 2;
    const J = params.J || 0.01;
    const B = params.B || 0.001;

    const Kp = params.Kp || 2.5;
    const Ki = params.Ki || 1.2;
    const Kd = params.Kd || 0.1;
    const N = params.N || 100;

    const error = w_ref - omega;

    // 1. PID Logic
    const integral = i_state;
    const deriv = Kd * N * (error - d_state);
    const v_mag = Math.max(0, Kp * error + integral + deriv);

    // 2. Stator Voltage Generation
    const theta_v = w_ref * ctx.time;
    const va = v_mag * Math.sin(theta_v);
    const vb = v_mag * Math.sin(theta_v - 2 * Math.PI / 3);
    const vc = v_mag * Math.sin(theta_v + 2 * Math.PI / 3);

    const vAlpha = (2 * va - vb - vc) / 3;
    const vBeta = (vb - vc) / Math.sqrt(3);

    // 3. Induction Motor Equations
    const sigma = 1 - (Lm * Lm) / (Ls * Lr);
    const kr = Lm / Lr;
    const tr = Lr / Rr;

    const dias = (vAlpha - (Rs + kr * kr * Rr) / sigma * ias + (kr / (sigma * tr)) * psiar + (kr * P * omega / sigma) * psibr) / (sigma * Ls);
    const dibs = (vBeta - (Rs + kr * kr * Rr) / sigma * ibs + (kr / (sigma * tr)) * psibr - (kr * P * omega / sigma) * psiar) / (sigma * Ls);
    const dpsiar = (Lm / tr) * ias - (1 / tr) * psiar - P * omega * psibr;
    const dpsibr = (Lm / tr) * ibs - (1 / tr) * psibr + P * omega * psiar;

    const Te = 1.5 * P * kr * (psiar * ibs - psibr * ias);
    const domega = (Te - tl - B * omega) / J;
    const dtheta = omega;

    // 4. PID State Derivatives
    const di_state = Ki * error;
    const dd_state = N * (error - d_state);

    return [
      branch[0] - omega,
      branch[1] - error,
      branch[2] - Te,
      dState[0] - dias,
      dState[1] - dibs,
      dState[2] - dpsiar,
      dState[3] - dpsibr,
      dState[4] - domega,
      dState[5] - dtheta,
      dState[6] - di_state,
      dState[7] - dd_state
    ];
  },

  // ── GAS DOMAIN ─────────────────────────────────────────────────────────────
  gas_ref: () => [],
  gas_cap: ({ branch }) => [branch[0]],
  gas_chamber: ({ across, dAcross, branch, dState, state, params }) => {
    const V = params.V || 0.01;
    const R = 287;
    const T = params.T || 293.15;
    const P = state[0];
    const dP = dState[0];
    const mdot_a = branch[0];
    const mdot_b = branch[1];
    return [
      across[0] - P,
      across[1] - P,
      dP - (R * T / V) * (mdot_a + mdot_b)
    ];
  },
  gas_reservoir: ({ across, branch }) => {
    const P_ctrl = across[1] !== undefined ? across[1] : 101325;
    return [across[0] - P_ctrl];
  },
  gas_resistance: ({ across, branch, params }) => {
    const k = params.k !== undefined ? params.k : 1e-5;
    return [branch[0] - k * (across[0] - across[1])];
  },
  gas_restriction: ({ across, branch, params }) => {
    const Cd = params.Cd || 0.62;
    const A = across[2] !== undefined ? across[2] : (params.area || 1e-4);
    const T = params.T || 293.15;
    const k = Cd * A / Math.sqrt(T);
    return [branch[0] - k * (across[0] - across[1])];
  },
  gas_pipe: ({ across, branch, params }) => {
    const L = params.L || 1;
    const D = params.D || 0.05;
    const f = params.f || 0.02;
    const R_f = (f * L / D) * 10;
    return [(across[0] - across[1]) - R_f * branch[0]];
  },
  gas_fixed_res: ({ across, params }) => {
    const P = params.P !== undefined ? params.P : 101325;
    return [across[0] - P];
  },
  gas_rotational_conv: ({ across, branch, params }) => {
    const D = params.D || 0.01;
    const R = 287;
    const T = params.T || 293.15;
    const P_a = across[0];
    const P_h = across[1];
    const omega = across[2] - (across[3] || 0);
    const mdot = branch[0];
    const torque = branch[1];
    return [
      mdot - (P_a * D / (R * T)) * omega,
      torque - D * (P_a - P_h)
    ];
  },
  gas_translational_conv: ({ across, branch, params }) => {
    const A = params.A || 0.001;
    const R = 287;
    const T = params.T || 293.15;
    const P_a = across[0];
    const P_h = across[1];
    const v = across[2] - (across[3] || 0);
    const mdot = branch[0];
    const force = branch[1];
    return [
      mdot - (P_a * A / (R * T)) * v,
      force - A * (P_a - P_h)
    ];
  },
  gas_flow_source: ({ across, branch, params }) => {
    const mdot = across[2] !== undefined ? across[2] : (params.mdot || 0.1);
    return [branch[0] - mdot];
  },
  gas_pressure_source: ({ across, branch, params }) => {
    const P = across[2] !== undefined ? across[2] : (params.P || 200000);
    return [(across[1] - across[0]) - P];
  },
  gas_properties: () => [],

  // ── MAGNETIC DOMAIN ────────────────────────────────────────────────────────
  mag_ref: () => [],
  reluctance: ({ across, branch, params }) => {
    const R = params.R || 1e6;
    return [(across[0] - across[1]) - branch[0] * R];
  },
  fundamental_reluctance: ({ across, branch, params }) => {
    const R = params.R || 1e6;
    return [(across[0] - across[1]) - branch[0] * R];
  },
  variable_reluctance: ({ across, branch, params }) => {
    const Rmin = params.Rmin || 1e5;
    const R_ctrl = Math.max(Rmin, across[2] !== undefined ? across[2] : 1e6);
    return [(across[0] - across[1]) - branch[0] * R_ctrl];
  },
  permanent_magnet: ({ across, branch, params }) => {
    const Hc = params.Hc || 1000;
    const L = params.L || 0.05;
    const mmf_pm = Hc * L;
    return [(across[0] - across[1]) - mmf_pm];
  },
  em_converter: ({ across, dAcross, branch, dBranch, params }) => {
    const N = params.N || 100;
    const V = across[0] - across[1];
    const mmf = across[2] - across[3];
    const I = branch[0];
    const dPhi = dBranch[1];
    return [
      V - N * dPhi,
      mmf - N * I
    ];
  },
  reluctance_force: ({ across, branch, params }) => {
    const R0 = params.R0 || 1e6;
    const k = params.k || 10;
    const x = across[2] - (across[3] || 0);
    const R = R0 * (1 + k * Math.max(0, x));
    const dRdx = R0 * k;
    const phi = branch[0];
    const force = branch[1];
    return [
      (across[0] - across[1]) - phi * R,
      force - 0.5 * phi * phi * dRdx
    ];
  },
  mag_flux_sensor: ({ across, branch }) => [
    across[0] - across[1],
    branch[1] - branch[0]
  ],
  mag_mmf_sensor: ({ across, branch }) => [
    branch[0],
    branch[1] - (across[0] - across[1])
  ],
  mag_mmf_source: ({ across, params }) => {
    const MMF = params.MMF || 10;
    return [(across[0] - across[1]) - MMF];
  },
  mag_flux_source: ({ branch, params }) => {
    const phi = params.phi || 0.001;
    return [branch[0] - phi];
  },
  mag_controlled_mmf: ({ across, params }) => {
    const S = across[2] !== undefined ? across[2] : 0;
    return [(across[0] - across[1]) - S];
  },

  // ── ADVANCED CONTROL & OBSERVERS ───────────────────────────────────────────
  luenberger_observer: ({ across, branch, state, dState, params }) => {
    const A = -1;
    const L = params.L || 10;
    const u = across[0] || 0;
    const y = across[1] || 0;
    const xhat = state[0];
    const dxhat = dState[0];
    return [
      branch[0] - xhat,
      dxhat - (A * xhat + u + L * (y - xhat))
    ];
  },
  im_flux_observer: ({ across, branch, state, dState, params }) => {
    const Rs = params.Rs || 0.1;
    const Lm = params.Lm || 0.05;
    const Lr = params.Lr || 0.06;
    const Rr = params.Rr || 0.08;
    const Tr = Lr / Rr;
    const is = across[0] || 0;
    const wr = across[1] || 0;
    const psi_d = state[0];
    const psi_q = state[1];
    const dPsi_d = dState[0];
    const dPsi_q = dState[1];
    return [
      branch[0] - psi_d,
      branch[1] - (psi_d / Math.max(0.01, Lm)),
      dPsi_d - ((Lm / Tr) * is - (1 / Tr) * psi_d - wr * psi_q),
      dPsi_q - (- (1 / Tr) * psi_q + wr * psi_d)
    ];
  },
  pmsm_foc: ({ across, branch, state, dState, params }) => {
    const Kp = 5.0;
    const Ki = 100.0;
    const ref_speed = across[0] || 0;
    const iabc = across[1] || 0;
    const w = across[2] || 0;
    const theta = across[3] || 0;
    const id = iabc * Math.cos(theta);
    const iq = iabc * Math.sin(theta);
    const id_ref = 0;
    const iq_ref = Math.max(-50, Math.min(50, (ref_speed - w) * 2.0));
    const err_d = id_ref - id;
    const err_q = iq_ref - iq;
    const vd = Kp * err_d + state[0];
    const vq = Kp * err_q + state[1];
    const va = vd * Math.cos(theta) - vq * Math.sin(theta);
    return [
      branch[0] - va,
      branch[1] - w,
      dState[0] - Ki * err_d,
      dState[1] - Ki * err_q
    ];
  },
  clarke_transform: ({ across, branch }) => [
    branch[0] - (across[0] || 0)
  ],

  // ── MULTIBODY JOINTS & CONSTRAINTS ─────────────────────────────────────────
  world_frame: () => [],
  ref_frame: () => [],
  rigid_transform: ({ across }) => [across[0] - across[1]],
  dist_constraint: ({ across, params }) => {
    const dist = params.dist || 1.0;
    return [(across[0] - across[1]) - dist];
  },
  spherical_joint: ({ across, branch, params }) => {
    const b = params.damping || 0.05;
    return [branch[0] - b * (across[0] - across[1])];
  },
  universal_joint: ({ across, branch, params }) => {
    const b = params.damping || 0.05;
    return [branch[0] - b * (across[0] - across[1])];
  },
  weld_joint: ({ across }) => [across[0] - across[1]],
  common_gear: ({ across, branch, params }) => {
    const ratio = params.ratio || 2;
    return [
      across[1] - ratio * across[0],
      branch[0] + ratio * branch[1]
    ];
  },
  rack_pinion: ({ across, branch, params }) => {
    const R = params.radius || 0.1;
    return [
      across[1] - R * across[0],
      branch[0] + R * branch[1]
    ];
  },
  grav_field: ({ branch, params }) => [
    branch[0] - (params.g || 9.81)
  ],
  spring_damper_force: ({ across, branch, params }) => {
    const k = params.k || 1000;
    return [branch[0] - k * (across[0] - across[1])];
  },
  external_force: ({ branch, params }) => [
    branch[0] - (params.force_scale || 1) * 10
  ],
  revolute_joint: ({ across, branch, params }) => {
    const b = params.damping || 0.1;
    return [branch[0] - b * (across[0] - across[1])];
  },
  prismatic_joint: ({ across, branch, params }) => {
    const b = params.damping || 1.0;
    return [branch[0] - b * (across[0] - across[1])];
  },

  // ── MISCELLANEOUS & SINKS & SOURCES ────────────────────────────────────────
  ps_delay: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_sum: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_min: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_max: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_rms: ({ across, branch }) => [branch[0] - Math.abs(across[0] || 0)],
  ps_terminator: () => [],
  heat_flow_sensor: ({ across, branch }) => [
    across[0] - across[1],
    branch[1] - branch[0]
  ]
};

const rlStateCache = new Map<string, {
  qTable: number[][];
  lastStateIdx: number;
  lastActionIdx: number;
  hasPrev: number;
  lastUpdateTime: number;
  currentAction: number;
  currentMaxQ: number;
}>();
