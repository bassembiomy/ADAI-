import { EquationContext } from './types';
import { computeAbsoluteReferencePressure, computeEffectivePortPressure } from '../../utils/hydraulicUnits';
import {
  evaluateDOEModel,
  evaluateLegacyDOEEquation,
  evaluateDOEModelDetailed,
  evaluateLegacyDOEEquationDetailed
} from '../doe/modelEvaluator';

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
  subsystem: () => [],
  Subsystem: () => [],
  inport: () => [],
  Inport: () => [],
  outport: () => [],
  Outport: () => [],
  
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
  
  diode: ({ across, branch, params }) => {
    const Ron = params.Ron || 0.01;
    const Roff = params.Roff || 1e6;
    const Vf = params.Vf !== undefined ? params.Vf : 0.7;
    const Is = params.Is || 1e-12;
    const n = params.n || 1.0;
    const Vt = 0.02585; // thermal voltage at 300K
    const V = across[0] - across[1];
    
    // Smooth approximation for switch conductance
    const smooth = 0.5 * (1 + Math.tanh((V - Vf) / (n * Vt)));
    const R = Ron * smooth + Roff * (1 - smooth);
    return [(V - Vf * smooth) - branch[0] * R];
  },
  
  nmos: ({ across, branch, params }) => {
    // across[0] = Vd, across[1] = Vs, across[2] = Vg
    const kn = params.kn || 0.5;
    const Vth = params.Vth || 2.0;
    const lambda = params.lambda || 0.01;
    
    const Vgs = across[2] - across[1];
    const Vds = across[0] - across[1];
    const Vov = Vgs - Vth;
    
    let Id_target = 0;
    if (Vov > 0) {
      if (Vds < Vov) {
        Id_target = kn * (Vov * Vds - 0.5 * Vds * Vds) * (1 + lambda * Vds);
      } else {
        Id_target = 0.5 * kn * Vov * Vov * (1 + lambda * Vds);
      }
    }
    
    // Smooth transition at threshold Vgs = Vth
    const smooth = 0.5 * (1 + Math.tanh(Vov * 5));
    const Id = Id_target * smooth;
    return [branch[0] - Id];
  },
  
  igbt: ({ across, branch, params }) => {
    // across[0] = Vc, across[1] = Ve, across[2] = Vg
    const Vge_th = params.Vge_th || 5.5;
    const Vce_sat = params.Vce_sat || 1.5;
    const Rd = params.Rd || 0.05;
    const Roff = params.Roff || 1e6;
    
    const Vge = across[2] - across[1];
    const Vce = across[0] - across[1];
    
    const gate = 0.5 * (1 + Math.tanh((Vge - Vge_th) * 2));
    const Ic_on = Math.max(0, Vce - Vce_sat) / Rd;
    const Ic_off = Vce / Roff;
    
    return [branch[0] - (gate * Ic_on + (1 - gate) * Ic_off)];
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
    // Q = k * (Ta - Tb) or (k * A / L) * (Ta - Tb)
    const rawK = params.k ?? params.conductivity ?? 1.0;
    const k = (params.A !== undefined && params.L !== undefined && Number(params.L) !== 0)
      ? (Number(rawK) * Number(params.A) / Number(params.L))
      : Number(rawK);
    const dT = across[0] - across[1];
    return [branch[0] - k * dT];
  },
  
  convective_heat: ({ across, branch, params }) => {
    // Q = h * A * (Ta - Tb)
    const h = params.h ?? 10.0;
    const A = params.A ?? 0.1;
    const dT = across[0] - across[1];
    return [branch[0] - h * A * dT];
  },
  
  radiative_heat: ({ across, branch, params }) => {
    // Q = eps * sigma * A * (Ta^4 - Tb^4)
    const eps = params.eps ?? 0.9;
    const A = params.A ?? 0.1;
    const sigma = 5.67e-8; // Stefan-Boltzmann
    const Ta = across[0];
    const Tb = across[1];
    const heat = eps * sigma * A * (Math.pow(Ta, 4) - Math.pow(Tb, 4));
    return [branch[0] - heat];
  },
  
  thermal_mass: ({ across, dAcross, branch, params }) => {
    // Q = C * dT/dt
    const rawC = Number(params.C ?? params.heat_capacity ?? 100.0);
    const C = Math.max(1e-6, isNaN(rawC) ? 100.0 : rawC);
    return [branch[0] - C * dAcross[0]];
  },
  
  temp_sensor: ({ across, branch, ports }) => {
    // across[0]: T_a, across[1]: T_b
    // branch[0]: heat_flow through sensor, branch[1]: output signal
    const Ta = across[0] ?? 0;
    const Tb = across[1] ?? 0;
    return [
      branch[0],             // zero heat flow
      branch[1] - (Ta - Tb)  // output signal = Ta - Tb
    ];
  },
  
  heat_sensor: (args) => blockEquations.heat_flow_sensor(args),
  
  heat_src: ({ branch, params }) => {
    const Q = params.Q ?? params.Q_const ?? 100;
    return [branch[0] - Q];
  },
  
  temp_src: ({ across, branch, params }) => {
    const T = params.T ?? params.T_const ?? 293.15;
    return [across[0] - T];
  },
  
  ctrl_heat_src: ({ across, branch, ports }) => {
    const sIdx = ports ? ports.indexOf('s') : -1;
    const Q = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[2] !== undefined ? across[2] : (across[1] ?? 0));
    return [branch[0] - Q];
  },
  
  ctrl_temp_src: ({ across, branch, ports }) => {
    const sIdx = ports ? ports.indexOf('s') : -1;
    const S = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[2] !== undefined ? across[2] : 293.15);
    const Ta = across[0] ?? 0;
    const Tb = (ports && ports.includes('b') && across[1] !== undefined) ? across[1] : 0;
    return [(Ta - Tb) - S];
  },

  // ── COUPLINGS ──────────────────────────────────────────────────────────────
  rotational_electromechanical_converter: ({ across, branch, params }) => {
    // V = Ra*I + Ke*w => (Vp-Vn) - I*Ra - Ke*w = 0
    // T = -Kt*I (power-preserving convention: electrical in = mechanical out)
    const K = params.K || params.motor_constant || 0.05;
    const Ra = params.R || params.resistance || 2.0;
    const V = across[0] - across[1];
    const w = across[2] - (across[3] || 0);
    const I = branch[0];
    const T = branch[1];
    return [
      V - I * Ra - K * w,
      T + K * I
    ];
  },
  
  translational_electromechanical_converter: ({ across, branch, params }) => {
    // V = I*R + Bl*v
    // F = -Bl*I
    const Bl = params.Bl || 1.0;
    const R = params.R || 1.0;
    const V = across[0] - across[1];
    const v = across[2] - (across[3] || 0);
    const I = branch[0];
    const F = branch[1];
    return [
      V - I * R - Bl * v,
      F + Bl * I
    ];
  },
  
  thermal_resistor: ({ across, branch, params }) => {
    // V = I * R => (Vp-Vn) - I*R = 0
    // Q_heat = I^2 * R (flows OUT of the component into the thermal node)
    const R = params.R ?? params.resistance ?? params.Rth ?? 10.0;
    const V = across[0] - across[1];
    const I = branch[0];
    const Q = branch[1];
    return [
      V - I * R,
      Q - I * I * R
    ];
  },

  microwave_inverter: ({ across, branch, params }) => {
    // branch[0] is current_in, branch[1] is current_out
    const ctrl_val = across[2] !== undefined ? across[2] : 1.0;
    const v_out_target = (params.v_out || 4000) * ctrl_val;
    const v_in_nom = params.v_in || 230;
    const V_out = across[1];
    // Use the nominal input voltage for the ideal power-balance relation.
    // Dividing by the instantaneous AC voltage caused runaway input current
    // near zero-crossings and made the microwave temperature unstable.
    return [
      V_out - v_out_target,
      branch[0] + (v_out_target / v_in_nom) * branch[1]
    ];
  },

  magnetron: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const V = across[0] - across[1];
    const P_rated = params.power_rating || 900;
    const eff = (params.efficiency !== undefined ? params.efficiency : 65) / 100;
    const V_nom = params.v_nominal !== undefined ? params.v_nominal : 4000;
    // Electrical power follows the documented P = P_rated * (V/V_nom)^2
    // characteristic, so at the nominal 4000 V the magnetron draws its
    // rated power and outputs P_rated * efficiency as heat (≈585 W for 900 W, 65%).
    const power_factor = Math.pow(V / Math.max(1, V_nom), 2);
    const P_elec = P_rated * power_factor;
    const I = P_elec / Math.max(1, Math.abs(V));
    const Q = P_rated * eff * power_factor;
    return [
      branch[0] - I,
      branch[1] - Q
    ];
  },

  upper_heater: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const V = across[0] - across[1];
    const R = params.resistance || 35.0;
    const eff = params.efficiency || 0.9;
    const I = V / R;
    const Q = I * I * R * eff;
    return [
      branch[0] - I,
      branch[1] - Q
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
    const getVal = (p: any, fallback: number): number => {
      if (p === undefined || p === null) return fallback;
      if (typeof p === 'number') return p;
      if (typeof p === 'object' && typeof p.value === 'number') return p.value;
      const num = parseFloat(p);
      return isNaN(num) ? fallback : num;
    };

    const vol = getVal(params.volume, 25);
    const maxTempC = getVal(params.max_temp, 250);
    const maxTempK = maxTempC > 350 ? maxTempC : maxTempC + 273.15;
    const T_amb_C = getVal(params.ambient_temp, 25);
    const T_amb = T_amb_C > 200 ? T_amb_C : T_amb_C + 273.15;

    // Thermal mass: air + cavity walls + optional food/water load.
    // Without a food load the cavity has very little thermal capacitance,
    // which is unphysical and causes the temperature to rise without limit.
    const food_mass = getVal(params.food_mass, 0.5); // kg
    const food_cp = getVal(params.food_cp, 4184);    // J/(kg*K), water approx.
    const wall_mass = getVal(params.wall_mass, 2.0); // kg
    const wall_cp = getVal(params.wall_cp, 460);     // J/(kg*K), steel approx.
    const C_air = vol * 0.0012 * 1005;
    const C = C_air + wall_mass * wall_cp + food_mass * food_cp;

    // Heat loss based on cavity surface area (cube approximation) so that
    // larger 55 L cavities lose heat faster than smaller 25 L ones.
    const V_m3 = vol * 1e-3;
    const side = Math.pow(V_m3, 1 / 3);
    const A = 6 * side * side;
    const h_conv = getVal(params.h_conv, 10); // W/(m^2*K) natural convection
    const eps = getVal(params.eps, 0.85);     // emissivity
    const sigma = 5.67e-8;
    const U_A = h_conv * A;

    const temp = state[0] > 1.0 ? state[0] : T_amb;

    // Convective loss + Stefan-Boltzmann radiation loss
    const Q_conv = U_A * (temp - T_amb);
    const Q_rad = eps * sigma * A * (Math.pow(temp, 4) - Math.pow(T_amb, 4));
    const Q_loss = Q_conv + Q_rad;

    // Thermal safety cutout: smoothly reduce heat input as the cavity
    // temperature approaches the safety limit. A hard step discontinuity
    // caused DAE solver convergence failures in Simscape-style models.
    const Q_raw = branch[0] + branch[1] + branch[2];
    const cutoff_width = 3.0; // K
    const cutoff = 0.5 * (1.0 + Math.tanh((maxTempK - temp) / cutoff_width));
    const Q_in = Q_raw * cutoff;

    return [
      across[0] - temp,
      across[1] - temp,
      across[2] - temp,
      branch[3] - temp,
      dState[0] - (Q_in - Q_loss) / C
    ];
  },

  // ── PHYSICAL SIGNAL BLOCKS ─────────────────────────────────────────────────
  constant: ({ branch, params }) => {
    const val = params.value !== undefined ? (params.value?.value !== undefined ? params.value.value : params.value) : 1.0;
    return [branch[0] - val];
  },

  ps_constant: ({ branch, params }) => {
    const val = params.value !== undefined ? (params.value?.value !== undefined ? params.value.value : params.value) : 1.0;
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
    
    // Dynamic torque load and physical output vis signal
    return [
      branch[0] - (J_total * dAcross[0] + B * across[0]),
      branch[1] - across[0]
    ];
  },
  
  washing_fluid: ({ across, branch, params }) => {
    // across[0] is omega
    const Det = params.detergent || 1;
    const Water = params.water_level || 10;
    const viscosity = 0.05 + (Det * 0.02) + (Water * 0.005);
    const torque = viscosity * across[0] + 0.01 * Math.sign(across[0]) * across[0] * across[0];
    return [
      branch[0] - torque,
      branch[1] - torque
    ];
  },
  

  // ── MACHINES DOMAIN ────────────────────────────────────────────────────────
  dc_motor: ({ across, dAcross, branch, dBranch, state, dState, params }) => {
    // across[0,1]: electrical terminals p, n
    // across[2]: mechanical speed omega
    // state[0]: rotor angle theta
    // state[1]: mechanical speed omega (true state)
    const Ra = params.Ra || params.resistance || 2.0;
    const La = params.La || params.inductance || 0.01;
    const Ke = params.Ke || 0.05;
    const Kt = params.Kt || Ke;
    const J = params.J || params.inertia || 0.01;
    const B = params.B || params.damping || 0.001;
    
    const V = across[0] - across[1];
    const Ia = branch[0];
    const dIa = dBranch[0];
    const torque = branch[1];
    
    return [
      V - Ia * Ra - La * dIa - Ke * state[1],            // branch[0]: current
      across[2] - state[1],                              // branch[1]: torque (link port across to speed state)
      dState[0] - state[1],                              // state[0]: theta
      torque - (Kt * Ia - J * dState[1] - B * state[1])  // state[1]: omega
    ];
  },

  ac_motor: ({ across, branch, state, dState, params, ctx }) => {
    // 3-phase induction motor simplified dq-model
    // state[0]: theta, state[1]: omega
    const Rs = params.Rs || 0.1;
    const P = params.P || params.pole_pairs || 2;
    const Lm = 0.05;
    const Lr = 0.06;
    const Kt = 1.5 * P * Lm / Lr;
    const J = params.J || params.inertia || 0.05;
    const B = params.B || params.damping || 0.005;
    
    const Va = across[0] - across[3];
    const Vb = across[1] - across[3];
    const Vc = across[2] - across[3];
    
    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    
    // Clarke conversion of actual voltages to get instantaneous Valpha, Vbeta
    const Valpha = (2 * Va - Vb - Vc) / 3;
    const Vbeta = (Vb - Vc) / Math.sqrt(3);
    const Vmag = Math.sqrt(Valpha * Valpha + Vbeta * Vbeta);
    
    // Read the grid frequency from global parameters (written by the controller/inverter)
    const w_sync = ctx.parameters['grid_freq'] !== undefined ? ctx.parameters['grid_freq'] : 314.159;
    
    // Electromagnetic torque is proportional to stator voltage magnitude, slip frequency
    const slip_speed = w_sync / P - state[1];
    const Te = Kt * 0.15 * Vmag * slip_speed;
    
    return [
      Va - ia * Rs,                                      // branch[0]: ia
      Vb - ib * Rs,                                      // branch[1]: ib
      Vc - ic * Rs,                                      // branch[2]: ic
      across[4] - state[1],                              // branch[3]: torque (link port across to speed state)
      dState[0] - state[1],                              // state[0]: theta
      torque - (Te - J * dState[1] - B * state[1])       // state[1]: omega (torque equation)
    ];
  },

  bldc_motor: ({ across, branch, state, dState, params, ctx }) => {
    // state[0]: theta, state[1]: omega
    const Rs = params.Rs || 0.2;
    const P = params.P || 4;
    const Ke = params.Ke || 0.1;
    const J = params.J || params.inertia || 0.02;
    const B = params.B || params.damping || 0.002;
    
    const Va = across[0] - across[3];
    const Vb = across[1] - across[3];
    const Vc = across[2] - across[3];
    
    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    
    // Clarke conversion of actual voltages to get instantaneous Valpha, Vbeta
    const Valpha = (2 * Va - Vb - Vc) / 3;
    const Vbeta = (Vb - Vc) / Math.sqrt(3);
    const Vmag = Math.sqrt(Valpha * Valpha + Vbeta * Vbeta);
    
    const w_sync = ctx.parameters['grid_freq'] !== undefined ? ctx.parameters['grid_freq'] : 314.159;
    
    // Synchronous torque coupling
    const slip_speed = w_sync / P - state[1];
    const Te = Ke * 0.15 * Vmag * slip_speed;
    
    return [
      Va - ia * Rs,                                      // branch[0]: ia
      Vb - ib * Rs,                                      // branch[1]: ib
      Vc - ic * Rs,                                      // branch[2]: ic
      across[4] - state[1],                              // branch[3]: torque
      dState[0] - state[1],                              // state[0]: theta
      torque - (Te - J * dState[1] - B * state[1])       // state[1]: omega
    ];
  },

  pmsm: ({ across, branch, state, dState, params, ctx }) => {
    // state[0]: theta, state[1]: omega
    const Rs = params.Rs || 0.1;
    const P = params.pole_pairs || 4;
    const Kt = params.Kt || 0.2;
    const J = params.J || params.inertia || 0.02;
    const B = params.B || params.damping || 0.002;
    
    const Va = across[0] - across[3];
    const Vb = across[1] - across[3];
    const Vc = across[2] - across[3];
    
    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    
    // Clarke conversion of actual voltages to get instantaneous Valpha, Vbeta
    const Valpha = (2 * Va - Vb - Vc) / 3;
    const Vbeta = (Vb - Vc) / Math.sqrt(3);
    const Vmag = Math.sqrt(Valpha * Valpha + Vbeta * Vbeta);
    
    const w_sync = ctx.parameters['grid_freq'] !== undefined ? ctx.parameters['grid_freq'] : 314.159;
    
    // Synchronous torque coupling
    const slip_speed = w_sync / P - state[1];
    const Te = Kt * 0.15 * Vmag * slip_speed;
    
    return [
      Va - ia * Rs,                                      // branch[0]: ia
      Vb - ib * Rs,                                      // branch[1]: ib
      Vc - ic * Rs,                                      // branch[2]: ic
      across[4] - state[1],                              // branch[3]: torque
      dState[0] - state[1],                              // state[0]: theta
      torque - (Te - J * dState[1] - B * state[1])       // state[1]: omega
    ];
  },

  // ── INVERTERS & CONTROL BLOCKS ─────────────────────────────────────────────
  pwm_3ph_2level: ({ across, branch, params, ctx }) => {
    // across[0]: vabc (Physical control input: can be v_mag or w_ref)
    // across[1]: p (DC+), across[2]: n (DC-)
    // across[3]: a (Phase A), across[4]: b (Phase B), across[5]: c (Phase C)
    // branch[0]: current_a, branch[1]: current_b, branch[2]: current_c (through variables)
    
    const ctrl = across[0] !== undefined ? across[0] : 0.5;
    const Vp = across[1];
    const Vn = across[2];
    const Vdc = Vp - Vn;
    
    let ma = 0.5, mb = 0.5, mc = 0.5;
    let w_rad = 314.159;
    
    // Auto-detect control mode based on magnitude
    if (Math.abs(ctrl) > 10.0) {
      // Input is speed reference (RPM or rad/s)
      w_rad = ctrl > 100 ? ctrl * (2 * Math.PI / 60) : ctrl; // RPM to rad/s if large
      ma = 0.5 + 0.4 * Math.sin(w_rad * ctx.time);
      mb = 0.5 + 0.4 * Math.sin(w_rad * ctx.time - 2 * Math.PI / 3);
      mc = 0.5 + 0.4 * Math.sin(w_rad * ctx.time + 2 * Math.PI / 3);
    } else {
      // Input is duty cycle or voltage magnitude (e.g. from PID)
      const v_mag = Math.max(0.0, Math.min(1.0, ctrl));
      w_rad = 314.159; // Nominal 50Hz
      ma = 0.5 + 0.4 * v_mag * Math.sin(w_rad * ctx.time);
      mb = 0.5 + 0.4 * v_mag * Math.sin(w_rad * ctx.time - 2 * Math.PI / 3);
      mc = 0.5 + 0.4 * v_mag * Math.sin(w_rad * ctx.time + 2 * Math.PI / 3);
    }
    
    if (ctx.parameters['grid_freq'] === undefined) {
      ctx.parameters['grid_freq'] = w_rad;
    }
    
    const Va_target = Vn + Vdc * ma;
    const Vb_target = Vn + Vdc * mb;
    const Vc_target = Vn + Vdc * mc;
    
    const R_out = 1e-3;
    return [
      (across[3] - Va_target) - branch[0] * R_out,
      (across[4] - Vb_target) - branch[1] * R_out,
      (across[5] - Vc_target) - branch[2] * R_out
    ];
  },

  vfd_controller: ({ across, branch, params, ctx, ports }) => {
    const wRefIdx = ports.findIndex(p => p.toLowerCase().startsWith('w') && p.toLowerCase().includes('ref'));
    const w_ref = (wRefIdx !== -1 && across[wRefIdx] !== undefined) ? across[wRefIdx] : 1500;
    const w_rad = w_ref * (2 * Math.PI / 60);
    ctx.parameters['grid_freq'] = w_rad;
    const V_mag = Math.max(0.1, Math.min(1.0, Math.abs(w_ref) / 1500));

    const isPhysicalOutput = (pId: string) => {
      const id = pId.toLowerCase();
      return ['g', 'vabc', 'vis', 'y', 'out'].includes(id) || id.startsWith('out') || id.startsWith('signal');
    };
    const outputs = ports.filter(isPhysicalOutput);
    const residuals = outputs.map((outPort, idx) => {
      const id = outPort.toLowerCase();
      if (id === 'vabc') return branch[idx] - V_mag;
      if (id === 'g') return branch[idx] - 1.0;
      return branch[idx] - 0.0;
    });
    return residuals;
  },

  im_foc_ctrl: ({ across, branch, params, ctx, ports }) => {
    const wRefIdx = ports.findIndex(p => p.toLowerCase().startsWith('w') && p.toLowerCase().includes('ref'));
    const w_ref_val = (wRefIdx !== -1 && across[wRefIdx] !== undefined) ? across[wRefIdx] : undefined;
    const w_ref = w_ref_val !== undefined ? w_ref_val : (params.target_rpm ? params.target_rpm : 1500);
    const w_rad = w_ref * (2 * Math.PI / 60);
    ctx.parameters['grid_freq'] = w_rad;

    const isPhysicalOutput = (pId: string) => {
      const id = pId.toLowerCase();
      return ['g', 'vabc', 'vis', 'y', 'out'].includes(id) || id.startsWith('out') || id.startsWith('signal');
    };
    const outputs = ports.filter(isPhysicalOutput);
    const residuals = outputs.map((outPort, idx) => {
      const id = outPort.toLowerCase();
      if (id === 'vabc') return branch[idx] - 1.0;
      if (id === 'g') return branch[idx] - 1.0;
      return branch[idx] - 0.0;
    });
    return residuals;
  },

  // ── GAS AND MOIST AIR DOMAINS ──────────────────────────────────────────────
  ma_ref: () => [],

  ma_chamber: ({ across, branch, state, dState, params }) => {
    // across[0]: P_a (Fluid), across[1]: P_b (Fluid), across[2]: T_h (Thermal)
    // branch[0]: mass_flow at port a, branch[1]: heat_flow at port h
    const getNumber = (value: unknown, fallback: number): number => {
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const V = getNumber(params.V, 0.005);
    const T_amb = getNumber(params.ambient_temp, 25) + 273.15;
    const rho = 1.2, Cp = 1005;
    const airCapacity = rho * Cp * V;
    const wallCapacity = getNumber(params.wall_mass, 2.0) * getNumber(params.wall_cp, 460);
    const loadCapacity = getNumber(params.food_mass, 0.5) * getNumber(params.food_cp, 4184);
    const C = Math.max(1e-6, getNumber(params.heat_capacity, airCapacity + wallCapacity + loadCapacity));
    const temp = state[0] > 1.0 ? state[0] : T_amb;
    
    // Physical heat loss to the ambient environment (convection/conduction through basket walls)
    const k_loss = getNumber(params.k_loss, 8.5); // W/K, realistic overall heat loss coefficient
    const heat_loss = k_loss * (temp - T_amb);
    const maxTempK = getNumber(params.max_temp, 220) + 273.15;
    const cutoffWidth = 3.0;
    const cutoff = 0.5 * (1.0 + Math.tanh((maxTempK - temp) / cutoffWidth));
    const heat_input = branch[1] * cutoff;
    
    return [
      branch[0] - 0.0,
      heat_input + C * dState[0] + heat_loss, /* heat entering chamber = C * dT/dt + heat_loss */
      across[2] - temp
    ];
  },

  ma_pressure_source: ({ across, branch, params }) => {
    // Pb - Pa - P_max * ctrl = 0
    const P_max = params.P || 150;
    const ctrl = across[2] !== undefined ? across[2] : 1.0;
    const Pa = across[0];
    const Pb = across[1];
    return [(Pb - Pa) - P_max * ctrl];
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
    const nS = Math.max(1, Math.round(Number(params.numStates) || 5));
    const nA = Math.max(1, Math.round(Number(params.numActions) || 3));

    const actions: number[] = [];
    if (nA === 1) {
      actions.push(0.0);
    } else {
      for (let i = 0; i < nA; i++) {
        actions.push(-1.0 + (2.0 * i) / (nA - 1));
      }
    }

    let cached = rlStateCache.get(nodeId);
    if (!cached || cached.qTable.length !== nS || cached.qTable[0]?.length !== nA || ctx.time < 1e-5 || reset) {
      cached = {
        qTable: Array.from({ length: nS }, () => Array(nA).fill(0)),
        lastStateIdx: Math.floor(nS / 2),
        lastActionIdx: Math.floor(nA / 2),
        hasPrev: 0,
        lastUpdateTime: -1.0,
        currentAction: actions[Math.floor(nA / 2)] ?? 0,
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
        const maxQNext = Math.max(...(cached.qTable[s] ?? [0]));
        const targetQ = reward + gamma * maxQNext;
        const currentQ = cached.qTable[cached.lastStateIdx]?.[cached.lastActionIdx] ?? 0;
        if (cached.qTable[cached.lastStateIdx]) {
          cached.qTable[cached.lastStateIdx][cached.lastActionIdx] = currentQ + alpha * (targetQ - currentQ);
        }
      }

      let aIdx = Math.floor(nA / 2);
      const pseudoRand = Math.abs(Math.sin((ctx.time + 0.001) * 12345.67 + s * 987.65)) % 1;
      if (pseudoRand < epsilon) {
        aIdx = Math.floor(pseudoRand * nA) % nA;
      } else {
        let maxVal = cached.qTable[s]?.[0] ?? 0;
        aIdx = 0;
        for (let i = 1; i < nA; i++) {
          if ((cached.qTable[s]?.[i] ?? 0) > maxVal) {
            maxVal = cached.qTable[s][i];
            aIdx = i;
          }
        }
      }

      cached.currentAction = actions[aIdx] ?? 0;
      cached.currentMaxQ = Math.max(...(cached.qTable[s] ?? [0]));
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
  gas_reservoir: ({ across, branch, params }) => {
    const P_ctrl = across[1] === undefined ? (params.P ?? 101325) : across[1];
    return [across[0] - P_ctrl];
  },
  gas_resistance: ({ across, branch, params }) => {
    const k = params.k !== undefined ? params.k : 1e-5;
    return [branch[0] - k * (across[0] - across[1])];
  },
  gas_restriction: ({ across, branch, params }) => {
    const Cd = params.Cd || 0.62;
    const A = across[2] === undefined ? (params.area ?? 1e-4) : across[2];
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
    const deltaP = P_a - P_h;
    return [
      mdot - (P_a * D / (R * T)) * omega,
      torque - D * deltaP
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
    const deltaP = P_a - P_h;
    return [
      mdot - (P_a * A / (R * T)) * v,
      force - A * deltaP
    ];
  },
  gas_flow_source: ({ across, branch, params }) => {
    const mdot = across[2] === undefined ? (params.mdot ?? 0.1) : across[2];
    return [branch[0] - mdot];
  },
  gas_pressure_source: ({ across, branch, params }) => {
    const P = across[2] === undefined ? (params.P ?? 200000) : across[2];
    return [(across[1] - across[0]) - P];
  },
  gas_pressure_sensor: ({ across, branch }) => [branch[0], branch[1] - across[0]],
  gas_flow_sensor: ({ across, branch }) => [across[0] - across[1], branch[1] + branch[0]],
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
  variable_reluctance: ({ across, branch, params, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const ctrlIdx = ports ? ports.indexOf('ctrl') : 2;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const ctrlVal = (ctrlIdx !== -1 && across[ctrlIdx] !== undefined) ? across[ctrlIdx] : (across[2] !== undefined ? across[2] : undefined);
    const Rmin = params.Rmin !== undefined ? Number(params.Rmin) : 1e5;
    const R_ctrl = Math.max(Rmin, ctrlVal !== undefined ? Number(ctrlVal) : 1e6);
    return [(Vn - Vs) - branch[0] * R_ctrl];
  },
  permanent_magnet: ({ across, branch, params, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const Hc = Number(params.Hc ?? 1000);
    const Lm = Number(params.Lm ?? params.L ?? 0.05);
    const Rm = Number(params.Rm ?? 0);
    const phi = branch[0] ?? 0;
    const mmf_pm = Hc * Lm - phi * Rm;
    return [(Vn - Vs) - mmf_pm];
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
  reluctance_force: ({ across, branch, params, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const rIdx = ports ? ports.indexOf('r') : 2;
    const cIdx = ports ? ports.indexOf('c') : 3;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const xr = (rIdx !== -1 && across[rIdx] !== undefined) ? across[rIdx] : (across[2] ?? 0);
    const xc = (cIdx !== -1 && across[cIdx] !== undefined) ? across[cIdx] : (across[3] ?? 0);

    const R0 = Number(params.R0 ?? 1e6);
    const K = Number(params.K ?? (params.k !== undefined ? R0 * Number(params.k) : 1e7));
    const x = xr - xc;
    const R = R0 + K * Math.max(0, x);
    const dRdx = K;
    const phi = branch[0] ?? 0;
    const force = branch[1] ?? 0;
    return [
      (Vn - Vs) - phi * R,
      force - 0.5 * phi * phi * dRdx
    ];
  },
  mag_flux_sensor: ({ across, branch, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const fluxThru = branch[0] ?? 0;
    const sigPhi = branch[1] !== undefined ? branch[1] : fluxThru;
    return [
      Vn - Vs,
      sigPhi - fluxThru
    ];
  },
  mag_mmf_sensor: ({ across, branch, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const fluxThru = branch[0] ?? 0;
    const sigF = branch[1] !== undefined ? branch[1] : (Vn - Vs);
    return [
      fluxThru,
      sigF - (Vn - Vs)
    ];
  },
  mag_mmf_source: ({ across, params }) => {
    const MMF = params.MMF || 10;
    return [(across[0] - across[1]) - MMF];
  },
  mag_flux_source: ({ branch, params }) => {
    const phi = params.phi || 0.001;
    return [branch[0] - phi];
  },
  mag_controlled_mmf: ({ across, params, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const srcIdx = ports ? (ports.indexOf('src') !== -1 ? ports.indexOf('src') : ports.indexOf('s_in')) : 2;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const S = (srcIdx !== -1 && across[srcIdx] !== undefined) ? across[srcIdx] : (across[2] !== undefined ? across[2] : (params.MMF ?? 0));
    return [(Vn - Vs) - S];
  },

  // ── ADVANCED CONTROL & OBSERVERS ───────────────────────────────────────────
  luenberger_observer: ({ across, branch, state, dState, params }) => {
    const A = -1;
    let L = 10;
    if (typeof params.L === 'number') {
      L = Number.isFinite(params.L) ? params.L : 10;
    } else if (typeof params.L === 'string') {
      const parsed = parseFloat(params.L.replace(/[[\];]/g, ' ').trim());
      if (Number.isFinite(parsed)) L = parsed;
    } else if (Array.isArray(params.L) && typeof params.L[0] === 'number') {
      L = params.L[0];
    }
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
    const Kp = params.Kp !== undefined ? (typeof params.Kp === 'object' && params.Kp !== null ? Number(params.Kp.value) : Number(params.Kp)) : 5.0;
    const Ki = params.Ki !== undefined ? (typeof params.Ki === 'object' && params.Ki !== null ? Number(params.Ki.value) : Number(params.Ki)) : 100.0;
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
  ],

  // ── FLUID / PNEUMATIC DOMAIN ────────────────────────────────────────────────
  fluid_ref: () => [],

  fluid_resistance: ({ across, branch, params }) => {
    const Rf = params.Rf || 1e5;
    return [(across[0] - across[1]) - branch[0] * Rf];
  },

  orifice: ({ across, branch, params }) => {
    const Cd = params.Cd || 0.6;
    const A = params.A || 1e-4;
    const rho = params.rho || 1.2;
    const dP = across[0] - across[1];
    const mdot = Cd * A * Math.sqrt(2 * rho * Math.abs(dP)) * Math.sign(dP);
    return [branch[0] - mdot];
  },

  fluid_capacitance: ({ across, dAcross, branch, params }) => {
    const Cf = params.Cf || 1e-5;
    return [branch[0] - Cf * dAcross[0]];
  },

  fluid_inertance: ({ across, branch, dBranch, params }) => {
    const Li = params.Li || 100;
    return [(across[0] - across[1]) - Li * dBranch[0]];
  },

  pressure_source: ({ across, branch, params }) => {
    const P = params.P || 101325;
    return [across[0] - P];
  },

  ctrl_pressure_source: ({ across, ports }) => {
    const ctrlIndex = ports.indexOf('ctrl');
    const P = ctrlIndex >= 0 && across[ctrlIndex] !== undefined ? across[ctrlIndex] : 101325;
    return [across[0] - P];
  },

  mass_flow_source: ({ branch, params }) => {
    const mdot = params.mdot || 0.01;
    return [branch[0] - mdot];
  },

  check_valve: ({ across, branch, params }) => {
    const Rf = params.Rf || 1e3;
    const dP = across[0] - across[1];
    const g = 0.5 * (1 + Math.tanh(dP * 1000));
    return [branch[0] - g * dP / Rf];
  },

  relief_valve: ({ across, branch, params }) => {
    const P_set = params.P_set || 5e5;
    const Rf_open = params.Rf_open || 1e2;
    const Rf_closed = params.Rf_closed || 1e10;
    const dP = across[0] - across[1];
    const open = 0.5 * (1 + Math.tanh((across[0] - P_set) * 1e-4));
    const R = Rf_open * open + Rf_closed * (1 - open);
    return [dP - branch[0] * R];
  },

  steam_generator_fluid: ({ across, branch, params }) => {
    const P = across[0];
    const T_sat = 100 + (P - 101325) / 3600;
    const h_fg = (2257 - 2.175 * Math.max(0, T_sat - 100)) * 1000;
    const Q_in = across[2] !== undefined ? across[2] : (params.Q || 1000);
    const mdot_steam = Math.max(0, Q_in / h_fg);
    return [branch[0] - mdot_steam];
  },

  steam_accumulator: ({ across, dAcross, branch, params }) => {
    const V = params.V || 0.5;
    const P = across[0];
    const rho_steam = 0.6 + (P - 101325) * 4e-6;
    const Cf = V * 1e-3 * rho_steam / 1e5;
    return [
      across[0] - across[1],
      branch[0] - branch[1] - Cf * dAcross[0]
    ];
  },

  steam_nozzle: ({ across, branch, params }) => {
    const Cd = params.Cd || 0.5;
    const d = params.d || 0.5e-3;
    const A = Math.PI * d * d / 4;
    const P_upstream = across[0];
    const P_downstream = across[1];
    const rho = 0.6;
    const dP = Math.max(0, P_upstream - P_downstream);
    const mdot = Cd * A * Math.sqrt(2 * rho * dP);
    return [branch[0] - mdot];
  },

  pressure_sensor: ({ across, branch }) => {
    // An ideal pressure sensor has zero hydraulic flow and exposes the
    // measured pressure through its physical signal output branch.
    return [branch[0], branch[1] - across[0]];
  },

  flow_sensor: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },

  // ── ISOTHERMAL LIQUID DOMAIN ───────────────────────────────────────────────
  hydraulic_reference_il: () => [],
  reservoir_il: () => [],

  pump_il: ({ across, branch, params }) => {
    const dp = Number(params?.pressure_rise?.value ?? params?.pressure_rise ?? 200000);
    return [(across[1] - across[0]) - dp];
  },

  pipe_il: ({ across, branch, params }) => {
    const R = Number(params?.R?.value ?? params?.R ?? 100000);
    return [(across[0] - across[1]) - branch[0] * R];
  },

  restriction_il: ({ across, branch, params }) => {
    const Cd = Number(params?.Cd?.value ?? params?.Cd ?? 0.6);
    const A = Number(params?.area?.value ?? params?.area ?? 1e-4);
    const rho = Number(params?.rho?.value ?? params?.rho ?? 1000);
    const dp = across[0] - across[1];
    const mdot = Cd * A * Math.sqrt(2 * rho * Math.max(1e-9, Math.abs(dp))) * Math.sign(dp);
    return [branch[0] - mdot];
  },

  // ── SIMULATION & UTILITIES ──────────────────────────────────────────────────
  scope: () => [],
  solver_config: () => [],
  mech_config: () => [],
  ps_simulink_conv: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  simulink_ps_conv: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  vlab_probe: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  conn_label: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  doe_custom: ({ across, branch, params, nodeId, ctx }) => {
    let deployment = params?.deploymentModel || params?.deployment;
    if (typeof deployment === 'object' && deployment !== null && 'value' in deployment) {
      deployment = deployment.value;
    }
    if (typeof deployment === 'string') {
      try {
        deployment = JSON.parse(deployment);
      } catch {
        deployment = null;
      }
    }

    let y = NaN;
    if (deployment && deployment.schemaVersion === 1) {
      const res = evaluateDOEModelDetailed(deployment, across);
      if (!res.success) {
        if (params) params._runtimeDiagnostic = res.diagnostic;
        if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = res.diagnostic;
        y = NaN;
      } else {
        if (params) params._runtimeDiagnostic = null;
        y = res.value;
      }
    } else {
      const eq = params?.equation?.value || params?.equation || '';
      if (eq) {
        const factorNames = across.map((_, i) => `X${i + 1}`);
        const res = evaluateLegacyDOEEquationDetailed(eq, factorNames, across);
        if (!res.success) {
          if (params) params._runtimeDiagnostic = res.diagnostic;
          if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = res.diagnostic;
          y = NaN;
        } else {
          if (params) params._runtimeDiagnostic = null;
          y = res.value;
        }
      } else {
        const diag = {
          code: 'MISSING_MODEL_PAYLOAD',
          severity: 'error' as const,
          message: 'doe_custom block has no deployment model or equation configured.'
        };
        if (params) params._runtimeDiagnostic = diag;
        if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = diag;
        y = NaN;
      }
    }
    return [branch[0] - y];
  },

  ps_demux_3: ({ across, branch }) => {
    const u = across[0] || 0;
    return [
      branch[0] - u,
      branch[1] - u,
      branch[2] - u
    ];
  },

  // ── MATH & SIGNAL PROCESSING ────────────────────────────────────────────────
  ps_lookup_2d: ({ across, branch }) => {
    const x = across[0] || 0;
    const y = across[1] || 0;
    return [branch[0] - x * y];
  },

  ps_integrator_gen: ({ across, branch, state, dState }) => {
    return [
      dState[0] - (across[0] || 0),
      branch[0] - state[0]
    ];
  },

  ps_moving_avg: ({ across, branch, state, dState, params }) => {
    const T = params.T || 0.1;
    return [
      dState[0] - ((across[0] || 0) - state[0]) / T,
      branch[0] - state[0]
    ];
  },

  ps_sr_flipflop: ({ across, branch, state, dState }) => {
    const S = across[0] || 0;
    const R = across[1] || 0;
    const Q = state[0] || 0;
    return [
      dState[0] - (S * (1 - Q) - R * Q),
      branch[0] - Q,
      branch[1] - (1 - Q)
    ];
  },

  ps_sample_hold: ({ across, branch, state, dState }) => {
    const u = across[0] || 0;
    const trig = across[1] || 0;
    const holdVal = state[0] || 0;
    const dHold = trig > 0.5 ? (u - holdVal) * 1e3 : 0.0;
    return [
      dState[0] - dHold,
      branch[0] - holdVal
    ];
  },

  ps_smith_predictor: ({ across, branch, state, dState, params }) => {
    const T = params.delay || 0.1;
    return [
      dState[0] - ((across[0] || 0) - state[0]) / T,
      branch[0] - state[0]
    ];
  },

  ps_sine_3phase: ({ branch, params, ctx }) => {
    const Vpk = params.Vpk || 325;
    const f = params.f || 50;
    const w = 2 * Math.PI * f;
    return [
      branch[0] - Vpk * Math.sin(w * ctx.time),
      branch[1] - Vpk * Math.sin(w * ctx.time - 2 * Math.PI / 3),
      branch[2] - Vpk * Math.sin(w * ctx.time + 2 * Math.PI / 3)
    ];
  },

  ps_second_order_filter: ({ across, branch, state, dState, params }) => {
    const wn = params.wn || 100;
    const zeta = params.zeta || 0.707;
    const u = across[0] || 0;
    return [
      dState[0] - state[1],
      dState[1] - (wn * wn * u - 2 * zeta * wn * state[1] - wn * wn * state[0]),
      branch[0] - state[0]
    ];
  },

  ps_state_feedback: ({ across, branch, params }) => {
    const x = across[0] || 0;
    let K = 1.0;
    if (typeof params.K === 'number') {
      K = Number.isFinite(params.K) ? params.K : 1.0;
    } else if (typeof params.K === 'string') {
      const parsed = parseFloat(params.K.replace(/[[\]]/g, '').trim());
      if (Number.isFinite(parsed)) K = parsed;
    } else if (Array.isArray(params.K) && typeof params.K[0] === 'number') {
      K = params.K[0];
    }
    return [branch[0] - (-K * x)];
  },

  ps_sliding_mode: ({ across, branch, params }) => {
    const s = across[0] || 0;
    const eta = params.eta || 1.0;
    const limit = params.boundary_layer || 0.05;
    const sat = Math.max(-1.0, Math.min(1.0, s / limit));
    return [branch[0] - (-eta * sat)];
  },

  ps_stair_gen: ({ branch, params, ctx }) => {
    const step_time = params.step_time || 1.0;
    const step_val = params.step_val || 1.0;
    const steps = Math.floor(ctx.time / step_time);
    return [branch[0] - (steps * step_val)];
  },

  ps_washout: ({ across, branch, state, dState, params }) => {
    const T = params.T || 0.1;
    const u = across[0] || 0;
    const y = u - (state[0] || 0);
    return [
      dState[0] - y / T,
      branch[0] - y
    ];
  },

  // ── MATH TRANSFORMS ─────────────────────────────────────────────────────────
  inv_clarke_transform: ({ across, branch }) => {
    const alpha = across[0] || 0;
    const beta = across[1] || 0;
    const zero = across[2] || 0;
    return [
      branch[0] - (alpha + zero),
      branch[1] - (-0.5 * alpha + Math.sqrt(3)/2 * beta + zero),
      branch[2] - (-0.5 * alpha - Math.sqrt(3)/2 * beta + zero)
    ];
  },

  park_transform: ({ across, branch }) => {
    const a = across[0] || 0;
    const b = across[1] || 0;
    const c = across[2] || 0;
    const theta = across[3] || 0;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const alpha = (2*a - b - c)/3;
    const beta = (b - c)/Math.sqrt(3);
    const zero = (a + b + c)/3;
    return [
      branch[0] - (alpha * cos + beta * sin),
      branch[1] - (-alpha * sin + beta * cos),
      branch[2] - zero
    ];
  },

  inv_park_transform: ({ across, branch }) => {
    const d = across[0] || 0;
    const q = across[1] || 0;
    const zero = across[2] || 0;
    const theta = across[3] || 0;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const alpha = d * cos - q * sin;
    const beta = d * sin + q * cos;
    return [
      branch[0] - (alpha + zero),
      branch[1] - (-0.5 * alpha + Math.sqrt(3)/2 * beta + zero),
      branch[2] - (-0.5 * alpha - Math.sqrt(3)/2 * beta + zero)
    ];
  },

  sym_comp_transform: ({ across, branch }) => {
    const a = across[0] || 0;
    const b = across[1] || 0;
    const c = across[2] || 0;
    const pos = (a - 0.5*b - 0.5*c)/3;
    const neg = (a + 0.5*b + 0.5*c)/3;
    const zero = (a + b + c)/3;
    return [
      branch[0] - pos,
      branch[1] - neg,
      branch[2] - zero
    ];
  },

  inv_sym_comp_transform: ({ across, branch }) => {
    const pos = across[0] || 0;
    const neg = across[1] || 0;
    const zero = across[2] || 0;
    return [
      branch[0] - (pos + neg + zero),
      branch[1] - (-0.5*pos - 0.5*neg + zero),
      branch[2] - (-0.5*pos - 0.5*neg + zero)
    ];
  },

  quad_decoder: ({ across, branch, state, dState }) => {
    return [
      dState[0] - 0,
      branch[0] - (state[0] || 0),
      branch[1] - 0
    ];
  },

  resolver_to_digital: ({ across, branch, state, dState }) => {
    const s = across[0] || 0;
    const c = across[1] || 0;
    const theta = Math.atan2(s, c);
    return [
      dState[0] - 0,
      branch[0] - theta,
      branch[1] - 0
    ];
  },

  // ── BLDC & POWER ELECTRONICS CONTROL ────────────────────────────────────────
  bldc_commutation: ({ across, branch }) => {
    const theta = across[0] || 0;
    const ha = Math.sin(theta) > 0 ? 1 : 0;
    const hb = Math.sin(theta - 2*Math.PI/3) > 0 ? 1 : 0;
    const hc = Math.sin(theta + 2*Math.PI/3) > 0 ? 1 : 0;
    return [
      branch[0] - ha,
      branch[1] - hb,
      branch[2] - hc
    ];
  },

  bldc_current_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 5.0];
  },

  bldc_pwm_ctrl: ({ across, branch }) => {
    const ctrl = across[0] || 0;
    return [branch[0] - Math.max(0, Math.min(1.0, ctrl))];
  },

  dcdc_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - Math.max(0.01, Math.min(0.99, 0.5 + error * 0.1))];
  },

  pfc_rectifier_ctrl: ({ across, branch }) => {
    const V_out = across[0] || 0;
    const V_ref = across[1] || 0;
    const I_ac = across[2] || 0;
    const duty = (V_ref - V_out) * 0.05 + Math.abs(I_ac) * 0.01;
    return [branch[0] - Math.max(0, Math.min(0.95, duty))];
  },

  cycloconverter_ctrl: ({ across, branch, ctx }) => {
    const f_out = across[0] || 10;
    const w = 2 * Math.PI * f_out;
    const firing_angle = 45 + 30 * Math.sin(w * ctx.time);
    return [branch[0] - firing_angle];
  },

  pwm_3ph_3level: ({ across, branch, ctx }) => {
    const ctrl = across[0] || 0.5;
    const w = ctx.parameters['grid_freq'] || 314.159;
    const ma = 0.5 + 0.4 * ctrl * Math.sin(w * ctx.time);
    const mb = 0.5 + 0.4 * ctrl * Math.sin(w * ctx.time - 2*Math.PI/3);
    const mc = 0.5 + 0.4 * ctrl * Math.sin(w * ctx.time + 2*Math.PI/3);
    return [
      branch[0] - ma,
      branch[1] - mb,
      branch[2] - mc
    ];
  },

  pwm_vienna: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [
      branch[0] - Math.max(0, Math.min(1.0, error * 0.1)),
      branch[1] - Math.max(0, Math.min(1.0, error * 0.1)),
      branch[2] - Math.max(0, Math.min(1.0, error * 0.1))
    ];
  },

  thyristor_6pulse: ({ across, branch, ctx }) => {
    const alpha = across[0] || 30;
    const alpha_rad = alpha * Math.PI / 180;
    const w = 2 * Math.PI * 50;
    const t_mod = ctx.time % (1/50);
    const g1 = t_mod > (alpha_rad / w) ? 1 : 0;
    return [
      branch[0] - g1,
      branch[1] - g1,
      branch[2] - g1,
      branch[3] - g1,
      branch[4] - g1,
      branch[5] - g1
    ];
  },

  thyristor_12pulse: ({ across, branch, ctx }) => {
    const alpha = across[0] || 30;
    const alpha_rad = alpha * Math.PI / 180;
    const w = 2 * Math.PI * 50;
    const t_mod = ctx.time % (1/50);
    const g1 = t_mod > (alpha_rad / w) ? 1 : 0;
    return new Array(12).fill(0).map((_, i) => branch[i] - g1);
  },

  dc_current_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 2.0];
  },

  dc_voltage_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 5.0];
  },

  hysteresis_ctrl_3ph: ({ across, branch }) => {
    const error_a = (across[0] || 0) - (across[3] || 0);
    const error_b = (across[1] || 0) - (across[4] || 0);
    const error_c = (across[2] || 0) - (across[5] || 0);
    return [
      branch[0] - (error_a > 0.05 ? 1.0 : (error_a < -0.05 ? 0.0 : 0.5)),
      branch[1] - (error_b > 0.05 ? 1.0 : (error_b < -0.05 ? 0.0 : 0.5)),
      branch[2] - (error_c > 0.05 ? 1.0 : (error_c < -0.05 ? 0.0 : 0.5))
    ];
  },

  velocity_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 10.0];
  },

  im_scalar_ctrl: ({ across, branch }) => {
    const w_ref = across[0] || 1500;
    const V_mag = Math.max(0.1, Math.min(1.0, Math.abs(w_ref) / 1500));
    return [
      branch[0] - V_mag,
      branch[1] - w_ref
    ];
  },

  im_dtc_ctrl: ({ across, branch }) => {
    const error_tq = (across[0] || 0) - (across[1] || 0);
    const error_flux = (across[2] || 0) - (across[3] || 0);
    return [
      branch[0] - (error_tq > 5 ? 1 : (error_tq < -5 ? -1 : 0)),
      branch[1] - (error_flux > 0.01 ? 1 : 0)
    ];
  },

  im_curr_ctrl: ({ across, branch }) => {
    const error_d = (across[0] || 0) - (across[1] || 0);
    const error_q = (across[2] || 0) - (across[3] || 0);
    return [
      branch[0] - error_d * 2.0,
      branch[1] - error_q * 2.0
    ];
  },

  pmsm_curr_ctrl: ({ across, branch }) => {
    const error_d = (across[0] || 0) - (across[1] || 0);
    const error_q = (across[2] || 0) - (across[3] || 0);
    return [
      branch[0] - error_d * 2.0,
      branch[1] - error_q * 2.0
    ];
  },

  pmsm_ref_gen: ({ across, branch }) => {
    const tq_ref = across[1] || 0;
    return [
      branch[0] - 0.0,
      branch[1] - tq_ref * 0.5
    ];
  },

  pmsm_field_weakening: ({ across, branch }) => {
    const speed = across[0] || 0;
    const limit = 200;
    const id_fw = speed > limit ? -(speed - limit) * 0.1 : 0.0;
    return [branch[0] - id_fw];
  },

  pmsm_tq_est: ({ across, branch }) => {
    const iq = across[1] || 0;
    const Kt = 0.2;
    return [branch[0] - (Kt * iq)];
  },

  // ── MECHANICAL & MULTIBODY ──────────────────────────────────────────────────
  ang_vel_source: ({ across, params }) => {
    const w = params.w !== undefined ? params.w : 50;
    return [across[0] - across[1] - w];
  },

  wheel_axle: ({ across, branch, params }) => {
    const R = params.radius || params.R || 0.3;
    const w = across[0] - across[1];
    const v = across[2] - (across[3] || 0);
    const T = branch[0];
    const F = branch[1];
    return [
      v - w * R,
      T + F * R
    ];
  },

  rot_multibody_interface: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },

  trans_multibody_interface: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },

  belt_properties: () => [],
  belt_end: ({ branch }) => [branch[0] - 0],

  belt_spool: ({ across, branch, params }) => {
    const R = params.radius || 0.1;
    const w = across[0];
    const v = across[1];
    return [
      v - w * R,
      branch[0] + branch[1] * R
    ];
  },

  pulley: ({ across, branch, params }) => {
    const ratio = params.ratio || 1.0;
    const w1 = across[0];
    const w2 = across[1];
    return [
      w2 - w1 * ratio,
      branch[0] + branch[1] * ratio
    ];
  },

  angle_constraint: ({ across, branch, params }) => {
    const limit = params.limit || Math.PI;
    const theta = across[0];
    return [branch[0] - (theta > limit ? (theta - limit) * 1e4 : (theta < -limit ? (theta + limit) * 1e4 : 0))];
  },

  // ── GAS AND MOIST AIR DOMAINS ──────────────────────────────────────────────
  gas_inf_resistance: ({ branch }) => [branch[0]],

  ma_pipe: ({ across, branch, params }) => {
    const f = params.resistance || 1.0;
    const Pa = across[0];
    const Pb = across[1];
    return [Pb - Pa - f * branch[0]];
  },

  ma_separator: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[0] - branch[1]
    ];
  },

  ma_rot_conv: ({ across, branch, params }) => {
    const h0 = params.h0 || 5.0;
    const k = params.k || 0.1;
    const w = across[0];
    const Ta = across[1];
    const Tb = across[2];
    const Q = branch[0];
    const h = h0 + k * Math.abs(w);
    return [Q - h * (Ta - Tb)];
  },

  ma_trans_conv: ({ across, branch, params }) => {
    const h0 = params.h0 || 5.0;
    const k = params.k || 0.1;
    const v = across[0];
    const Ta = across[1];
    const Tb = across[2];
    const Q = branch[0];
    const h = h0 + k * Math.abs(v);
    return [Q - h * (Ta - Tb)];
  },

  ma_flow_sensor: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },

  ma_selector: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[0] - branch[1]
    ];
  },

  ma_moisture_sensor: ({ branch }) => {
    return [branch[0] - 0.5];
  },

  ma_pt_sensor: ({ across, branch }) => {
    return [
      branch[0] - (across[0] || 101325),
      branch[1] - (across[1] || 293.15)
    ];
  },

  ma_thermo_sensor: ({ branch }) => {
    return [branch[0] - 1000];
  },

  ma_moisture_source: ({ branch, params }) => {
    const S = params.flow || 0.01;
    return [branch[0] - S];
  },

  ma_flow_source: ({ branch, params }) => {
    const S = params.flow || 0.01;
    return [branch[0] - S];
  },

  ma_properties: () => []
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
