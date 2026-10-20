// Crank-angle single-zone cylinder model shared by the CI / SI Cylinder (Wiebe) blocks.
// Spec: docs/powertrain/engine-calibration-spec.md section 1. Pure functions, no XBlock code.
// References: Heywood 1988 (Internal Combustion Engine Fundamentals); Wiebe 1970; Woschni 1967;
// Chen & Flynn 1965; Douaud & Eyzat 1978; Livengood & Wu 1955.

export interface EngineGeometry { B: number; S: number; L: number; CR: number; Ncyl: number; IVC: number; EVO: number }

export interface CycleOptions {
  LHV: number; aw: number; mw: number; gamma: number; R: number; etaComb: number; etaTrap: number;
  wallHeat: 'Woschni' | 'Adiabatic'; Twall: number; dTheta: number;
  cf: { A: number; B: number; C: number; D: number };
  afrStoich: number; cpB: number; ON: number;
  /** Knee of the dissociation approximation [K]; default 2400. */
  Tknee?: number;
  /** Slope of the flame temperature rise above Tknee (0..1); default 0.35. */
  sDiss?: number;
  /** NOx calibration factor; default 1. */
  kNOx?: number;
}

export interface OperatingPoint {
  N: number; mf: number; theta0: number; dThetaComb: number; Pivc: number; Tivc: number; Pexh: number; phi?: number;
}

export interface TraceSample { theta: number; p: number; T: number; V: number; xb: number }

export interface CycleResult {
  pMax: number; thetaPmax: number; imepGross: number; pmep: number; imep: number; fmep: number; bmep: number;
  Tbrake: number; Pbrake: number; bsfc: number; etaTh: number; Texh: number; pEVO: number; TEVO: number;
  noxGPerKWh: number; knockIndex: number; fuelFlw: number; trace?: TraceSample[];
}

const DEG = Math.PI / 180;

export function validateGeometry(g: EngineGeometry): void {
  if (!(g.B > 0)) throw new Error('B (bore) must be > 0');
  if (!(g.S > 0)) throw new Error('S (stroke) must be > 0');
  if (!(g.L > 0)) throw new Error('L (connecting rod length) must be > 0');
  if (!(g.L > g.S / 2)) throw new Error('L (connecting rod length) must be greater than S/2 (crank radius)');
  if (!(g.CR > 1)) throw new Error('CR (compression ratio) must be > 1');
  if (!(g.Ncyl >= 1)) throw new Error('Ncyl (number of cylinders) must be >= 1');
  if (!(g.IVC < g.EVO)) throw new Error('IVC must be smaller than EVO');
}

const dispVol = (g: EngineGeometry): number => Math.PI * g.B * g.B * g.S / 4;

/** Cylinder volume [m^3] at crank angle thetaDeg (0 = firing TDC). Slider-crank, spec section 1. */
export function cylinderVolume(g: EngineGeometry, thetaDeg: number): number {
  const a = g.S / 2, th = thetaDeg * DEG;
  const Vc = dispVol(g) / (g.CR - 1);
  return Vc + (Math.PI * g.B * g.B / 4) * (g.L + a - a * Math.cos(th) - Math.sqrt(g.L * g.L - (a * Math.sin(th)) ** 2));
}

/** Analytic dV/dtheta [m^3/deg]. */
export function cylinderVolumeRate(g: EngineGeometry, thetaDeg: number): number {
  const a = g.S / 2, th = thetaDeg * DEG;
  const s = Math.sin(th), c = Math.cos(th);
  const root = Math.sqrt(g.L * g.L - a * a * s * s);
  return (Math.PI * g.B * g.B / 4) * (a * s + a * a * s * c / root) * DEG;
}

/** Burned mass fraction (single Wiebe): 0 before theta0, 1 - exp(-aw) after the burn duration. */
export function wiebeFraction(theta: number, theta0: number, dThetaComb: number, aw: number, mw: number): number {
  if (theta < theta0) return 0;
  const u = Math.min((theta - theta0) / dThetaComb, 1);
  return 1 - Math.exp(-aw * Math.pow(u, mw + 1));
}

/** Analytic d(x_b)/dtheta [1/deg]; 0 outside [theta0, theta0 + dThetaComb). */
export function wiebeRate(theta: number, theta0: number, dThetaComb: number, aw: number, mw: number): number {
  if (theta < theta0 || theta >= theta0 + dThetaComb) return 0;
  const u = (theta - theta0) / dThetaComb;
  return Math.exp(-aw * Math.pow(u, mw + 1)) * aw * (mw + 1) * Math.pow(u, mw) / dThetaComb;
}

/** Chen-Flynn friction mean effective pressure [Pa]. */
export function chenFlynnFmep(cf: { A: number; B: number; C: number; D: number }, pMax: number, Sp: number): number {
  return cf.A + cf.B * pMax + cf.C * Sp + cf.D * Sp * Sp;
}

/** Douaud-Eyzat autoignition delay [s]; p in Pa, Tu in K. */
export function douaudEyzatTau(ON: number, p: number, Tu: number): number {
  return 17.68e-3 * Math.pow(ON / 100, 3.402) * Math.pow(p / 101325, -1.7) * Math.exp(3800 / Tu);
}

export function runEngineCycle(
  geom: EngineGeometry, op: OperatingPoint, opts: CycleOptions, flags: { trace?: boolean } = {},
): CycleResult {
  validateGeometry(geom);
  const { N, mf, theta0, dThetaComb, Pivc, Tivc, Pexh } = op;
  const { LHV, aw, mw, gamma, R, etaComb, etaTrap, Twall, dTheta, cf, afrStoich, cpB, ON } = opts;
  const finite = (name: string, v: number) => { if (!Number.isFinite(v)) throw new Error(`${name} must be finite`); };
  finite('N', N); finite('mf', mf); finite('theta0', theta0); finite('dThetaComb', dThetaComb);
  finite('Pivc', Pivc); finite('Tivc', Tivc); finite('Pexh', Pexh);
  if (!(N > 0)) throw new Error('N must be > 0');
  if (mf < 0) throw new Error('mf must be >= 0');
  if (!(dThetaComb > 0)) throw new Error('dThetaComb must be > 0');
  if (!(Pivc > 0)) throw new Error('Pivc (P_map) must be > 0');
  if (!(Tivc > 0)) throw new Error('Tivc (T_map) must be > 0');
  if (!(Pexh > 0)) throw new Error('Pexh must be > 0');
  if (!(dTheta > 0)) throw new Error('dTheta must be > 0');
  if (!(aw > 0)) throw new Error('aw must be > 0');
  if (!(mw >= 0)) throw new Error('mw must be >= 0');
  if (!(gamma > 1)) throw new Error('gamma must be > 1');
  if (!(R > 0)) throw new Error('R must be > 0');
  if (!(etaTrap > 0)) throw new Error('etaTrap must be > 0');
  if (!(etaComb >= 0)) throw new Error('etaComb must be >= 0');
  if (!(afrStoich > 0)) throw new Error('afrStoich must be > 0');
  if (!(opts.wallHeat === 'Woschni' || opts.wallHeat === 'Adiabatic')) throw new Error('wallHeat must be Woschni or Adiabatic');

  const { B, S, Ncyl, IVC, EVO } = geom;
  const Vd = dispVol(geom), Vc = Vd / (geom.CR - 1), Ap = Math.PI * B * B / 4;
  const V = (th: number) => cylinderVolume(geom, th);
  const dV = (th: number) => cylinderVolumeRate(geom, th);
  const Vivc = V(IVC);
  const m = etaTrap * Pivc * Vivc / (R * Tivc);
  const Qtot = etaComb * mf * LHV;
  const Sp = 2 * S * N / 60;
  const woschni = opts.wallHeat === 'Woschni';
  const wBase = 2.28 * Sp;
  const cComb = 0.00324 * Vd * Tivc / (Pivc * Vivc);
  const ex = (gamma - 1) / gamma;

  const f = (th: number, p: number): number => {
    const Vt = V(th);
    let dQw = 0;
    if (woschni) {
      if (!(p > 0)) throw new Error('cylinder pressure became non-positive; check inputs');
      const T = p * Vt / (m * R);
      let w = wBase;
      if (Qtot > 0 && th >= theta0) {
        const pMot = Pivc * Math.pow(Vivc / Vt, gamma);
        w += cComb * Math.max(0, p - pMot);
      }
      const h = 3.26 * Math.pow(B, -0.2) * Math.pow(p / 1000, 0.8) * Math.pow(T, -0.55) * Math.pow(w, 0.8);
      const A = Math.PI * B * B / 2 + Math.PI * B * (Vt - Vc) / Ap;
      dQw = h * A * (T - Twall) / (6 * N);
    }
    return ((gamma - 1) / Vt) * (Qtot * wiebeRate(th, theta0, dThetaComb, aw, mw) - dQw) - gamma * (p / Vt) * dV(th);
  };

  const nSteps = Math.max(1, Math.ceil((EVO - IVC) / dTheta - 1e-9));
  const ths = new Float64Array(nSteps + 1), ps = new Float64Array(nSteps + 1);
  ths[0] = IVC; ps[0] = Pivc;
  let W = 0, pMax = Pivc, thPmax = IVC, p = Pivc;
  for (let k = 0; k < nSteps; k++) {
    const th = ths[k];
    const thNext = k === nSteps - 1 ? EVO : IVC + (k + 1) * dTheta;
    const h = thNext - th;
    const k1 = f(th, p), k2 = f(th + h / 2, p + h / 2 * k1), k3 = f(th + h / 2, p + h / 2 * k2), k4 = f(thNext, p + h * k3);
    const pn = p + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    if (!Number.isFinite(pn) || pn <= 0) throw new Error('cylinder pressure integration failed; check inputs');
    W += (p + pn) / 2 * (V(thNext) - V(th));
    p = pn; ths[k + 1] = thNext; ps[k + 1] = pn;
    if (pn > pMax) { pMax = pn; thPmax = thNext; }
  }
  const pEVO = p;
  const TEVO = pEVO * V(EVO) / (m * R);
  const imepGross = W / Vd;
  const pmep = Pexh - Pivc;
  const imep = imepGross - pmep;
  const fmep = chenFlynnFmep(cf, pMax, Sp);
  const bmep = imep - fmep;
  const Tbrake = bmep * Vd * Ncyl / (4 * Math.PI);
  const Pbrake = Tbrake * 2 * Math.PI * N / 60;
  const fuelFlw = mf * Ncyl * N / 120;
  const bsfc = Pbrake > 0 ? 3.6e9 * fuelFlw / Pbrake : 0;
  const etaTh = mf > 0 ? (W - pmep * Vd) / (mf * LHV) : 0;
  const Texh = TEVO * Math.pow(Pexh / pEVO, ex);

  // NOx: thermal-NO rate of burned elements (Heywood eq. 11.10), spec section 1.
  let noxGPerKWh = 0;
  if (mf > 0 && Pbrake > 0) {
    const phi = op.phi ?? afrStoich * mf / m;
    const xO2 = Math.max(0.005, 0.21 * (1 - phi));
    const fst = 1 / afrStoich;
    const dTf = fst * LHV / ((1 + fst) * cpB);
    const Ru = 8.314e6; // Pa*cm^3/(mol*K)
    const Tknee = opts.Tknee ?? 2400, sDiss = opts.sDiss ?? 0.35, kNOx = opts.kNOx ?? 1;
    let moles = 0;
    for (let k = 0; k < nSteps; k++) {
      const dx = wiebeFraction(ths[k + 1], theta0, dThetaComb, aw, mw) - wiebeFraction(ths[k], theta0, dThetaComb, aw, mw);
      if (!(dx > 0)) continue;
      const dm = mf * dx;
      const pk = ps[k + 1];
      const Tf0 = Tivc * Math.pow(pk / Pivc, ex) + dTf;
      const Tf = Tf0 <= Tknee ? Tf0 : Tknee + sDiss * (Tf0 - Tknee);
      let n = 0; // mol NO in this element
      for (let j = k + 1; j < nSteps; j++) {
        const Tb = Tf * Math.pow(ps[j] / pk, ex);
        const c = ps[j] / (Ru * Tb);
        const O2N2 = xO2 * c * 0.73 * c;
        const Vb = dm * (1 + afrStoich) * R * Tb / ps[j] * 1e6; // cm^3
        const ce = Math.sqrt(20.3 * Math.exp(-21650 / Tb) * O2N2);
        const cNO = n / Vb;
        const kf = 6e16 / Math.sqrt(Tb) * Math.exp(-69090 / Tb) * Math.sqrt(xO2 * c) * (0.73 * c);
        const dt = (ths[j + 1] - ths[j]) / (6 * N);
        const r = ce > 0 ? 1 - (cNO / ce) ** 2 : 0;
        const nOld = n;
        n += kf * Math.max(r, 0) * Vb * dt;
        // concentration cannot exceed the equilibrium value at the end of the step
        const Tb2 = Tf * Math.pow(ps[j + 1] / pk, ex);
        const c2 = ps[j + 1] / (Ru * Tb2);
        const Vb2 = dm * (1 + afrStoich) * R * Tb2 / ps[j + 1] * 1e6;
        const ce2 = Math.sqrt(20.3 * Math.exp(-21650 / Tb2) * xO2 * c2 * 0.73 * c2);
        n = Math.min(n, Math.max(nOld, Math.max(ce, ce2) * Math.max(Vb, Vb2))); // NO is frozen, never destroyed
      }
      moles += n;
    }
    const mNO = moles * 0.030; // kg per cycle per cylinder
    noxGPerKWh = kNOx * 3.6e9 * (mNO * Ncyl * N / 120) / Pbrake;
  }

  // Knock integral (Livengood-Wu with Douaud-Eyzat), IVC to end of combustion or EVO.
  let knockIndex = 0;
  const thEnd = Math.min(EVO, theta0 + dThetaComb);
  if (thEnd > IVC) {
    const integrand = (j: number): number => {
      const Tu = Tivc * Math.pow(ps[j] / Pivc, ex);
      return 1 / douaudEyzatTau(ON, ps[j], Tu);
    };
    let prev = integrand(0);
    for (let j = 1; j <= nSteps && ths[j - 1] < thEnd; j++) {
      const full = ths[j] <= thEnd;
      const thB = full ? ths[j] : thEnd;
      const cur = full ? integrand(j) : prev + (integrand(j) - prev) * ((thEnd - ths[j - 1]) / (ths[j] - ths[j - 1]));
      knockIndex += (prev + cur) / 2 * ((thB - ths[j - 1]) / (6 * N));
      prev = integrand(j);
    }
  }

  const res: CycleResult = {
    pMax, thetaPmax: thPmax, imepGross, pmep, imep, fmep, bmep, Tbrake, Pbrake, bsfc, etaTh, Texh, pEVO, TEVO,
    noxGPerKWh, knockIndex, fuelFlw,
  };
  if (flags.trace) {
    res.trace = Array.from(ths, (th, i) => {
      const Vt = V(th);
      return { theta: th, p: ps[i], T: ps[i] * Vt / (m * R), V: Vt, xb: wiebeFraction(th, theta0, dThetaComb, aw, mw) };
    });
  }
  return res;
}
