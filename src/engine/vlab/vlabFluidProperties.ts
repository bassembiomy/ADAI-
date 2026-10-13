/**
 * Fluid property relations and flow laws of the Fluid / Isothermal Liquid / Gas / Moist Air / Steam blocks (WP-17).
 *
 * Every relation here is a PUBLISHED equation; nothing is a fitted placeholder. Sources:
 *  - Water saturation line, IAPWS-IF97 Region 4 (Wagner et al., J. Eng. Gas Turbines Power 122 (2000) 150; IAPWS R7-97(2012), eq. 29-31).
 *  - Saturated liquid / vapour density ancillaries (IAPWS R6-95(2016) / Wagner & Pruss, J. Phys. Chem. Ref. Data 31 (2002), eq. 2.6 and 2.7).
 *  - Latent heat from the Clausius-Clapeyron relation h_fg = T (v_g - v_f) dp_sat/dT (exact thermodynamics, no correlation).
 *  - Ideal gas p = rho R T, Dalton's law for moist air p = p_a + p_v, humidity ratio w = eps p_v / (p - p_v), eps = R_a / R_v = 0.622
 *    (ASHRAE Fundamentals 2017, ch. 1, eq. 12, 20, 22).
 *  - Compressible orifice flow with choking: Saint-Venant & Wantzel isentropic nozzle relations (Anderson, "Modern Compressible Flow", 3rd ed.,
 *    eq. 4.79 and 4.54), critical pressure ratio r* = (2 / (gamma + 1))^(gamma / (gamma - 1)).
 *  - Laminar / turbulent orifice blending: Simscape Isothermal Liquid "Local Restriction (IL)" (the smoothed form
 *    mdot = Cd S sqrt(2 rho) dp / (dp^2 + dp_crit^2)^(1/4) with dp_crit = pi Re_crit^2 mu^2 / (8 rho Cd^2 S)).
 *  - Darcy-Weisbach pipe friction with laminar f = 64 / Re (Hagen-Poiseuille) and the explicit Haaland turbulent friction factor
 *    (Haaland, J. Fluids Eng. 105 (1983) 89).
 * All quantities are SI.
 */

// ── gas constants ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Specific gas constant of the Gas domain (J/(kg K), air; documented in the Gas library text). */
export const R_GAS = 287;
/** Dry air and water vapour: R_u / M with R_u = 8.314462618 J/(mol K), M_a = 28.9647 g/mol, M_w = 18.01528 g/mol. */
export const R_DRY_AIR = 287.058;
export const R_WATER_VAPOUR = 461.52;
/** eps = R_a / R_v = M_w / M_a = 0.62198 (ASHRAE eq. 20 rounds this to 0.622). */
export const EPS_WATER = R_DRY_AIR / R_WATER_VAPOUR;
/** Specific heats at constant pressure of dry air and water vapour (J/(kg K), ASHRAE 2017 ch. 1). */
export const CP_DRY_AIR = 1005;
export const CP_WATER_VAPOUR = 1860;
/** Liquid water at 20 degC (kg/m^3, J/(kg K)). */
export const RHO_WATER_LIQUID = 998.2;
export const CP_WATER_LIQUID = 4182;
export const STANDARD_ATMOSPHERE = 101325;
export const WATER_CRITICAL_TEMPERATURE = 647.096;
export const WATER_CRITICAL_DENSITY = 322;

// ── water saturation line (IAPWS-IF97 Region 4) ─────────────────────────────────────────────────────────────────────
const N = [0, 0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2, 0.12020824702470e5, -0.32325550322333e7,
  0.14915108613530e2, -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849, 0.65017534844798e3];

/** Saturation pressure of water (Pa) at temperature T (K). Valid 273.15 K <= T <= 647.096 K (extrapolated smoothly below). */
export function waterSatPressure(T: number): number {
  const th = T + N[9] / (T - N[10]);
  const A = th * th + N[1] * th + N[2];
  const B = N[3] * th * th + N[4] * th + N[5];
  const C = N[6] * th * th + N[7] * th + N[8];
  return Math.pow((2 * C) / (-B + Math.sqrt(B * B - 4 * A * C)), 4) * 1e6;
}

/** Saturation temperature of water (K) at pressure P (Pa). Valid 611.213 Pa <= P <= 22.064 MPa. */
export function waterSatTemperature(P: number): number {
  const b = Math.pow(Math.max(P, 1) / 1e6, 0.25);
  const E = b * b + N[3] * b + N[6];
  const F = N[1] * b * b + N[4] * b + N[7];
  const G = N[2] * b * b + N[5] * b + N[8];
  const D = (2 * G) / (-F - Math.sqrt(F * F - 4 * E * G));
  return 0.5 * (N[10] + D - Math.sqrt((N[10] + D) * (N[10] + D) - 4 * (N[9] + N[10] * D)));
}

/** Saturated liquid density (kg/m^3), IAPWS R6-95 eq. 2.6. */
export function waterSatLiquidDensity(T: number): number {
  const t = Math.max(0, 1 - T / WATER_CRITICAL_TEMPERATURE);
  return WATER_CRITICAL_DENSITY * (1 + 1.99274064 * t ** (1 / 3) + 1.09965342 * t ** (2 / 3) - 0.510839303 * t ** (5 / 3)
    - 1.75493479 * t ** (16 / 3) - 45.5170352 * t ** (43 / 3) - 6.74694450e5 * t ** (110 / 3));
}

/** Saturated vapour density (kg/m^3), IAPWS R6-95 eq. 2.7. */
export function waterSatVapourDensity(T: number): number {
  const t = Math.max(0, 1 - T / WATER_CRITICAL_TEMPERATURE);
  return WATER_CRITICAL_DENSITY * Math.exp(-2.03150240 * t ** (2 / 6) - 2.68302940 * t ** (4 / 6) - 5.38626492 * t ** (8 / 6)
    - 17.2991605 * t ** (18 / 6) - 44.7586581 * t ** (37 / 6) - 63.9201063 * t ** (71 / 6));
}

/** Latent heat of vaporisation (J/kg) at saturation temperature T (K): Clausius-Clapeyron, h_fg = T (v_g - v_f) dp_sat/dT. */
export function waterLatentHeat(T: number): number {
  const h = 1e-3 * Math.max(1, T / 300);
  const dpdT = (waterSatPressure(T + h) - waterSatPressure(T - h)) / (2 * h);
  return T * (1 / waterSatVapourDensity(T) - 1 / waterSatLiquidDensity(T)) * dpdT;
}

export interface SaturatedSteam { T: number; hfg: number; rhoVapour: number; rhoLiquid: number }
/** Saturated steam properties at pressure P (Pa). */
export function saturatedSteamAtPressure(P: number): SaturatedSteam {
  const T = waterSatTemperature(clampSteamPressure(P));
  return { T, hfg: waterLatentHeat(T), rhoVapour: waterSatVapourDensity(T), rhoLiquid: waterSatLiquidDensity(T) };
}

/** The IF97 saturation line is defined from the triple point to 22 MPa; a Newton iterate outside it is evaluated at the nearest limit. */
const clampSteamPressure = (P: number): number => Math.min(Math.max(P, 611.213), 21.9e6);

/** d(rho_g)/dP along the saturation line (kg/(m^3 Pa)): the storage coefficient of a saturated-steam volume (central difference of the closed form). */
export function saturatedVapourDensitySlope(P: number): number {
  const Pc = clampSteamPressure(P);
  const dP = 1e-3 * Pc;
  const hi = clampSteamPressure(Pc + dP); const lo = clampSteamPressure(Pc - dP);
  return (waterSatVapourDensity(waterSatTemperature(hi)) - waterSatVapourDensity(waterSatTemperature(lo))) / (hi - lo);
}

// ── moist air ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface MoistAirState {
  /** total pressure (Pa) */ p: number;
  /** temperature (K) */ T: number;
  /** relative humidity phi = p_v / p_sat(T), 0..1 */ phi: number;
  /** vapour partial pressure (Pa) */ pv: number;
  /** humidity ratio w = m_v / m_a (kg/kg dry air) */ w: number;
  /** water-vapour mass fraction w / (1 + w) */ massFraction: number;
  /** mixture specific gas constant (J/(kg K)) = (R_a + w R_v) / (1 + w) */ R: number;
  /** mixture density (kg/m^3) = (p - p_v)/(R_a T) + p_v/(R_v T) = p / (R T) */ rho: number;
  /** mixture specific heat at constant pressure per kg of mixture (J/(kg K)) */ cp: number;
  /** mixture specific heat at constant volume per kg of mixture (J/(kg K)) = cp - R */ cv: number;
}

/**
 * Psychrometric state from (p, T, phi). The vapour partial pressure p_v = phi p_sat(T) is capped just below p so the
 * humidity ratio stays finite for any Newton iterate.
 */
export function moistAirState(p: number, T: number, phi: number): MoistAirState {
  // properties are evaluated at p >= 1 kPa (a Newton iterate in the vacuum range must not produce absurd densities / friction losses)
  const pSafe = Math.max(p, 1000);
  const Tsafe = Math.max(T, 1);
  const pv = Math.min(Math.max(0, phi) * waterSatPressure(Math.max(Tsafe, 200)), 0.999 * pSafe);
  const w = (EPS_WATER * pv) / (pSafe - pv);
  const R = (R_DRY_AIR + w * R_WATER_VAPOUR) / (1 + w);
  const cp = (CP_DRY_AIR + w * CP_WATER_VAPOUR) / (1 + w);
  return {
    p: pSafe, T: Tsafe, phi, pv, w, massFraction: w / (1 + w), R, rho: pSafe / (R * Tsafe), cp, cv: cp - R,
  };
}

/** Dynamic viscosity of air (Pa s), Sutherland's law mu = 1.458e-6 T^1.5 / (T + 110.4) (White, "Viscous Fluid Flow", eq. 1-36). */
export const airViscosity = (T: number): number => (1.458e-6 * Math.pow(Math.max(T, 1), 1.5)) / (Math.max(T, 1) + 110.4);

// ── orifice flow laws ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Pressure drop at which an orifice leaves the laminar regime: Re = mdot D_h / (S mu) reaches Re_crit with mdot = Cd S sqrt(2 rho dp)
 * and D_h = sqrt(4 S / pi):  dp_crit = pi Re_crit^2 mu^2 / (8 rho Cd^2 S).
 */
export function orificeCriticalPressureDrop(Cd: number, S: number, rho: number, mu: number, ReCrit: number): number {
  return (Math.PI * ReCrit * ReCrit * mu * mu) / (8 * rho * Cd * Cd * S);
}

/**
 * Incompressible orifice mass flow with the smooth laminar / turbulent transition (Simscape Local Restriction (IL)):
 *   mdot = Cd S sqrt(2 rho) dp / (dp^2 + dp_crit^2)^(1/4)
 * -> Cd S sqrt(2 rho |dp|) sign(dp) for |dp| >> dp_crit, and linear in dp (finite slope) at dp = 0. A closed orifice (S <= 0) passes nothing.
 */
export function orificeMassFlow(dp: number, Cd: number, S: number, rho: number, mu: number, ReCrit: number): number {
  if (!(S > 0) || !(Cd > 0) || !(rho > 0)) return 0;
  const dpCrit = orificeCriticalPressureDrop(Cd, S, rho, mu, ReCrit);
  return (Cd * S * Math.sqrt(2 * rho) * dp) / Math.pow(dp * dp + dpCrit * dpCrit, 0.25);
}

/** Critical pressure ratio of isentropic flow, r* = (2 / (gamma + 1))^(gamma / (gamma - 1)). */
export const criticalPressureRatio = (gamma: number): number => Math.pow(2 / (gamma + 1), gamma / (gamma - 1));

/** Share of the pressure ratio range that is treated as laminar (Simscape "Laminar flow pressure ratio" default 0.999). */
export const LAMINAR_PRESSURE_RATIO = 0.999;

/**
 * Mass flow of an ideal gas through an orifice from the upstream stagnation state (pUp, T) to pDn (Saint-Venant & Wantzel):
 *   subsonic (r = pDn / pUp > r*):  mdot = Cd S pUp sqrt( 2 gamma / ((gamma - 1) R T) ) sqrt( r^(2/gamma) - r^((gamma + 1)/gamma) )
 *   choked   (r <= r*):             mdot = Cd S pUp sqrt( gamma / (R T) ) (2 / (gamma + 1))^((gamma + 1) / (2 (gamma - 1)))
 * Signed: positive for pA > pB. Between the laminar pressure ratio (0.999) and 1 the flow is linear in the pressure difference, matched to the
 * turbulent value at r = 0.999, so the law has a finite slope at zero pressure difference.
 */
export function gasOrificeMassFlow(pA: number, pB: number, Cd: number, S: number, T: number, R: number, gamma: number): number {
  if (!(S > 0) || !(Cd > 0) || !(T > 0) || !(R > 0) || !(gamma > 1)) return 0;
  const pUp = Math.max(pA, pB);
  const pDn = Math.min(pA, pB);
  if (!(pUp > 0)) return 0;
  const sign = pA >= pB ? 1 : -1;
  const rStar = criticalPressureRatio(gamma);
  const r = Math.max(0, pDn) / pUp;
  const turbulent = (ratio: number) => {
    if (ratio <= rStar) return Cd * S * pUp * Math.sqrt(gamma / (R * T)) * Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
    return Cd * S * pUp * Math.sqrt((2 * gamma) / ((gamma - 1) * R * T)) * Math.sqrt(Math.max(0, Math.pow(ratio, 2 / gamma) - Math.pow(ratio, (gamma + 1) / gamma)));
  };
  if (r > LAMINAR_PRESSURE_RATIO) {
    return sign * turbulent(LAMINAR_PRESSURE_RATIO) * (1 - r) / (1 - LAMINAR_PRESSURE_RATIO);
  }
  return sign * turbulent(r);
}

// ── pipe friction ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Darcy friction factor of a circular pipe: laminar f = 64 / Re (Hagen-Poiseuille), turbulent Haaland
 * 1/sqrt(f) = -1.8 log10[ (e / (3.7 D))^1.11 + 6.9 / Re ], f = max(laminar, turbulent) (continuous; the laminar branch is linear in flow).
 */
export function darcyFrictionFactor(Re: number, relativeRoughness: number): number {
  return darcyFrictionFactorImpl(Re, relativeRoughness);
}

/**
 * Darcy-Weisbach pressure drop of a straight circular pipe, mdot signed: dp = f_eff (L / D) mdot |mdot| / (2 rho S^2), S = pi D^2 / 4,
 * with the laminar Hagen-Poiseuille law at low Reynolds number. Written with f_eff |mdot| = max(16 pi mu D, f_turb(Re) |mdot|) (the laminar
 * 64 / Re times |mdot| is the constant 16 pi mu D), so the law is linear in mdot at zero flow and has no 0/0.
 * Re = 4 |mdot| / (pi D mu).
 */
export function pipePressureDrop(mdot: number, L: number, D: number, rho: number, mu: number, fTurbulent: (Re: number) => number): number {
  if (!(D > 0) || !(rho > 0)) return 0;
  const S = (Math.PI * D * D) / 4;
  const absM = Math.abs(mdot);
  const Re = mu > 0 ? (4 * absM) / (Math.PI * D * mu) : Infinity;
  const fm = Math.max(mu > 0 ? 16 * Math.PI * mu * D : 0, fTurbulent(Re) * absM);
  return (fm * (L / D) * mdot) / (2 * rho * S * S);
}

function darcyFrictionFactorImpl(Re: number, relativeRoughness: number): number {
  const re = Math.max(Re, 1e-9);
  const laminar = 64 / re;
  const turbulent = Math.pow(-1.8 * Math.log10(Math.pow(Math.max(relativeRoughness, 0) / 3.7, 1.11) + 6.9 / re), -2);
  return Math.max(laminar, turbulent);
}
