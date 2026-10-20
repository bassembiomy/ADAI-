# Engine tuning and DoE calibration blocks (user specification, 2026-10-20)

Source: user specification given in the Claude session on 2026-10-20 ("To transition your POWERTRAIN BLOCKSET
from vehicle-level simulation to physical Engine Tuning and DoE Calibration ..."), with the user's decisions:
- Core engines: BOTH — the user's crank-angle models below ("CI/SI Cylinder (Wiebe)") AND, separately and later,
  Simulink's mean-value SI/CI Core Engine (plan WP-27) for Simulink parity.
- Scope: all blocks at once.
- Missing models (NOx, knock, turbo without maps): published models, marked as assumptions.

Equations the user's message did not contain are filled from the cited literature and marked **[filled]**.
Every block keeps parameters, inputs and outputs as the user listed them; additions are marked **[added]** with the reason.
Units at ports: SI unless the user specified otherwise (rpm, mg/stroke, deg, %, bar/MPa as listed).
All blocks live in the single "Powertrain Blockset" palette group; spec source is `user-spec`.

## 1. Crank-angle cylinder model (shared by CI and SI Cylinder)
Four-stroke, single-zone, closed cycle from IVC to EVO, integrated in crank angle theta (deg, 0 = firing TDC,
negative before TDC) with a fixed step `dTheta` (default 0.5 deg) by RK4. One full cycle is computed per block
evaluation from the current inputs (quasi-steady: the X-Bridges time step is much longer than one cycle).
- Geometry: a = S/2, Vd = pi B^2 S / 4, Vc = Vd/(CR - 1),
  V(theta) = Vc + (pi B^2/4) * (L + a - a cos(theta) - sqrt(L^2 - a^2 sin^2(theta))).
- Start (IVC): p = P_map, T = T_map, trapped mass m = eta_trap * P_map * V(IVC) / (R * T_map) **[added: eta_trap, default 1]**.
- Heat release (Wiebe): x_b = 1 - exp(-a_w * ((theta - theta0)/dTheta_comb)^(m_w + 1)) for theta0 <= theta <= theta0 + dTheta_comb,
  0 before, 1 - exp(-a_w) after (single Wiebe). Q_tot = eta_comb * m_f * LHV **[added: eta_comb, default 1]**.
  CI: theta0 = -SOI + dTheta_id (SOI deg BTDC, ignition delay input). SI: theta0 = -SA + dTheta_id (ignition delay parameter, default 5 deg).
- Energy: dp/dtheta = ((gamma - 1)/V) * (dQ/dtheta - dQw/dtheta) - gamma * (p/V) * dV/dtheta; T = p V / (m R). gamma constant parameter (default 1.35).
- Wall heat **[filled: Woschni 1967]**: h = 3.26 * B^-0.2 * (p/1000)^0.8 * T^-0.55 * w^0.8 [W/m^2K, p in kPa],
  w = 2.28 * Sp_mean (+ 0.00324 * Vd * T_IVC/(P_IVC V_IVC) * (p - p_mot) after theta0), area A = pi B^2/2 + pi B * (V - Vc)/(pi B^2/4),
  dQw/dtheta = h A (T - T_wall) / (6 N) [N rpm], parameter wallHeat: 'Woschni' | 'Adiabatic' (default 'Woschni'), T_wall default 450 K.
- Work: W_gross = integral p dV (IVC..EVO); IMEP_gross = W_gross / Vd; PMEP = P_exh - P_map **[added: P_exh input, default = ambient]**;
  IMEP = IMEP_gross - PMEP.
- Friction **[filled: Chen & Flynn 1965]**: FMEP = A_cf + B_cf * P_max + C_cf * Sp_mean + D_cf * Sp_mean^2, Sp_mean = 2 S N / 60.
  Defaults (typical, to be calibrated): A_cf = 0.25e5 Pa, B_cf = 0.005, C_cf = 0.09e5 Pa*s/m, D_cf = 0.0009e5 Pa*s^2/m^2.
- BMEP = IMEP - FMEP; T_brake = BMEP * Vd * N_cyl / (4 pi); P_brake = T_brake * 2 pi N / 60.
- Fuel: mdot_f = m_f * N_cyl * N / 120; BSFC = 3.6e9 * mdot_f / P_brake [g/kWh] when P_brake > 0, else 0.
- eta_th = (W_gross - PMEP*Vd) / (m_f * LHV) (indicated thermal efficiency, %).
- T_exh = T_EVO * (P_exh / p_EVO)^((gamma - 1)/gamma) (isentropic blowdown); P_max = max p over the cycle; also angle of P_max.
- NOx **[filled, assumption: Heywood 1988 eq. 11.10 initial thermal-NO rate, burned-element temperatures]**:
  the mass burned in each crank step k (dm_k = m_f * dx_b) forms a burned element at the stoichiometric flame temperature
  T_f,k = T_u,k + f_st * LHV / ((1 + f_st) * cp_b) (f_st = 1/AFR_stoich: 1/14.5 diesel, 1/14.7 gasoline; cp_b default 1400 J/kgK),
  T_u,k = T_IVC * (p_k/P_IVC)^((gamma-1)/gamma); afterwards T_b,k(theta) = T_f,k * (p(theta)/p_k)^((gamma-1)/gamma).
  Rate per element: d[NO]/dt = 6e16 / sqrt(T_b) * exp(-69090/T_b) * [O2]^0.5 * [N2] [mol/cm^3/s] with
  [O2] = x_O2 * p/(R_u T_b), [N2] = 0.73 * p/(R_u T_b) (mol/cm^3, R_u = 8.314e6 Pa cm^3/(mol K)), x_O2 = max(0.005, 0.21*(1 - phi)),
  phi = global equivalence ratio (CI: AFR_stoich * m_f / m_air; SI: 1/lambda). Element volume V_b,k = dm_k (1+AFR_stoich) R T_b/p.
  Integrate from formation to EVO with dt = dtheta/(6N); m_NO = 30 g/mol * sum(moles); NOx = 3.6e9 * m_NO_per_cycle_total_rate / P_brake [g/kWh]
  (0 when P_brake <= 0). Documented as an uncalibrated indicator for trends and constraints, not an emissions prediction.
  **Correction (planner review of EC-01, 2026-10-20):** the literal initial-rate model above gave ~210 g/kWh for a diesel point
  (real engine-out NOx is ~2-10 g/kWh). Two physical limits and a calibration factor are added:
  (1) dissociation: T_f,k = min(T_f,k, T_f_max), parameter T_f_max default 2650 K;
  (2) equilibrium limit per element (Heywood 1988 eq. 11.8 simplified, R1/(R2+R3) << 1):
      d[NO]/dt = rate * (1 - ([NO]/[NO]_e)^2), [NO]_e = sqrt(K_p [O2][N2]), K_p = 20.3 * exp(-21650/T_b) (Heywood 1988 table 11.1 / eq. 11.5),
      element [NO] in mol/cm^3 tracked on the element volume as it expands;
  (3) NOx = k_NOx * (model result), parameter k_NOx default 1, to be calibrated against measurements.
- Knock (SI) **[filled, assumption: Livengood-Wu integral with Douaud-Eyzat 1978]**: tau [s] = 17.68e-3 * (ON/100)^3.402 * (p/101325)^-1.7 * exp(3800/T_u),
  T_u = T_IVC * (p/P_IVC)^((gamma - 1)/gamma); I = integral dt/tau from IVC to end of combustion (dt = dtheta/(6N));
  KnockIndex = I (>= 1 means knock), KnockMargin = clamp(1 - I, 0, 1). Parameter ON (octane number, default 95).

## 2. Blocks
| Block | Type | Inputs | Outputs | Notes |
| --- | --- | --- | --- | --- |
| CI Cylinder (Wiebe) | PT_CI_CYLINDER | N rpm, m_f mg/stroke, SOI degBTDC, dTheta_comb deg, dTheta_id deg, P_map Pa, T_map K, P_exh Pa [added] | Info bus, T_brake N*m, IMEP Pa, FMEP Pa, BSFC g/kWh, T_exh K, P_max Pa, NOx g/kWh [added: DoE response the user's constraint evaluator needs] | §1; params B, S, L, N_cyl, CR, IVC, EVO, LHV (43e6), a_w (5), m_w (2), gamma, Chen-Flynn, Woschni, dTheta |
| SI Cylinder (Wiebe) | PT_SI_CYLINDER | N rpm, SA degBTDC, mdot_air kg/s, mdot_fuel kg/s, lambda [one of mdot_fuel / lambda by param fuelInput], P_map Pa [added], T_map K [added], P_exh Pa [added] | Info, T_brake, BSFC, eta_th %, T_exh, KnockIndex, KnockMargin, P_max [added], NOx [added] | m_f per stroke from mdot_fuel (or mdot_air/(AFR_stoich lambda)) * 120/(N N_cyl); burn duration and ignition delay are parameters |
| Throttle Body | PT_THROTTLE_BODY | alpha deg, P_amb Pa, P_map Pa, T_amb K | Info, mdot_th kg/s | A(alpha) = (pi D^2/4)(1 - cos(alpha + alpha0)/cos(alpha0)) + A_leak **[filled: Heywood 1988 eq. 7.x]**; compressible orifice, choked below (2/(g+1))^(g/(g-1)); reverse flow when P_map > P_amb |
| Intake Manifold | PT_INTAKE_MANIFOLD | mdot_in kg/s, N rpm, mdot_egr kg/s, T_in K [added], T_egr K [added] | Info, P_map Pa, T_map K, mdot_cyl kg/s | isothermal filling/emptying dP/dt = R T_map / V_m (mdot_in + mdot_egr - mdot_cyl), T_map = flow-weighted mix, mdot_cyl = eta_v P_map Vd_tot N / (120 R T_map); params V_m, R, eta_v, Vd_tot, P_o |
| Turbocharger | PT_TURBOCHARGER | mdot_comp kg/s [added: compressor flow], mdot_exh kg/s, T_exh K, VgtPos %, P_amb Pa [added], T_amb K [added] | Info, P_boost Pa, T_comp K, N_tc rpm, P_back Pa | parametric **[filled, assumption]**: compressor PR = (1 + eta_c sigma U^2/(cp T_amb))^(g/(g-1)), U = omega r_c; turbine effective area from VGT/wastegate position, P_back from the turbine orifice equation; J omega dot = (eta_m P_t - P_c)/omega |
| Fuel Injector | PT_FUEL_INJECTOR | P_rail MPa, P_cyl Pa, ET ms, N rpm [added: for mean flow] | Info, m_f mg/stroke, mdot_f kg/s (during injection), mdot_f_mean kg/s [added] | Bernoulli mdot = Cd n (pi d^2/4) sqrt(2 rho (P_rail - P_cyl)), 0 if P_rail <= P_cyl |
| VVT / Valvetrain | PT_VVT_VALVETRAIN | dTheta_int deg, dTheta_exh deg, N rpm [added], P_map Pa [added], P_exh Pa [added] | Info, IVC_eff deg, EVO_eff deg, RGF %, eta_v | cam profile table (lift vs crank angle), phasing shifts; overlap factor from lift-area curves; RGF = (1/CR)(P_exh/P_map)^(1/gamma) + k_ov * OF * sqrt(abs(P_exh - P_map))/(N P_map) **[filled, assumption]**; eta_v = eta_v0 * V(IVC_eff)/V(BDC) * (1 - RGF) |
| Calibration ECU | PT_CALIBRATION_ECU | N rpm, Load % (torque demand / pedal), DoE vector | Info, SOI deg, P_rail MPa, PW ms, SA deg, VgtPos %, EgrPos % | mode 1 = DoE override (pass-through by factor order), 2 = map lookup (one 2-D table per output, speed x load, bilinear, clip) |
| Calibration Map 2D | PT_CALIBRATION_MAP_2D | X_in, Y_in | Z_out | Bilinear (= 2-D Lookup Table) or Bicubic (natural cubic spline, tensor product) |
| Engine Dynamometer | PT_ENGINE_DYNO | N_set rpm, T_brake N*m, T_set N*m [added for torque mode] | Info, N_actual rpm, T_load N*m, P_dyno kW | speed mode: PI on speed error -> T_load; torque mode: T_load = T_set; (J_eng + J_dyno) omega dot = T_brake - T_load |
| Ambient Conditions | PT_AMBIENT | — | Amb bus (P, T, RH, rho), P_amb Pa, T_amb K | moist-air density (Magnus saturation pressure) |
| DoE Sweeper & Constraint Evaluator | PT_DOE_SWEEPER | Responses bus (T_brake, BSFC, P_max, T_exh, NOx) | NextPoint vector, PointIndex, Done, Info | design types Full Factorial, Latin Hypercube (seeded), Central Composite; dwell + averaging per point; hard limits; optimum (min objective, feasible) per operating point; exports to the DOE module and to ECU / Mapped Engine tables |

## 3. Verification (planner-written tests, per block)
Closed-form checks (motored adiabatic compression p_TDC = p_IVC (V_IVC/V_TDC)^gamma; ideal Otto efficiency 1 - CR^(1-gamma)
with instantaneous combustion; Wiebe end fraction; Chen-Flynn exact; manifold exponential response; choked orifice flow;
Bernoulli; dyno settling; full factorial / LHS stratification / CCD point counts), trend checks (SOI or SA advance raises P_max
and NOx; lower octane raises knock index) and a system test (CI engine on a dyno with ambient, manifold, injector and ECU, swept
by the DoE sweeper). Simulink parity (G3) does not apply to user-spec blocks.
