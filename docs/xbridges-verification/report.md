# X-Bridges verification report

Generated from `docs/xbridges-verification/ledger.json` by `scripts/xbridges-verification/report.ts`. Plan: `docs/superpowers/plans/2026-11-10-xbridges-full-verification.md`. Baseline: `54b71aa`.

## Summary

- Work packages: 21 done of 29; 2 in progress; 6 to do.
- Findings: 2 open, 210 closed, merged or superseded. No fix has been made yet (fixes are WP-21).
  - S1 (wrong number in simulation or generated C): 0 open
  - S2 (crash, stop, freeze or silent no-op): 0 open
  - S3 (diagnostic, UI or convention deviation): 1 open
  - S4 (documentation): 1 open
- Decisions recorded: 17; open: 0.

## Work packages

| WP | Title | Status | Executor / verifier |
| --- | --- | --- | --- |
| WP-00 | Setup: ledger, inventory script, baseline, npm scripts, loop skill and executor agent | done | P |
| WP-01 | V1 contract snapshot and catalogue closure tests | done | H / F |
| WP-02 | Test kit | done | S / F |
| WP-03 | Universal battery U1-U16 | done | S / F |
| WP-03b | Universal battery part B: U6 shapes (incl. ragged), U8 enums, U12 reset, U13 long runs, U15 dynamic ports, U16 names | done | S / F |
| WP-04 | V2/V3 sources, element-wise math, reductions, trigonometric | done | S / F |
| WP-05 | V2/V3 linear algebra, routing, logic, bitwise, sequential, sinks | done | S / F |
| WP-06 | V2/V3/V4 continuous, discrete and delay, discontinuities, lookup, buses | done | S (tests from controller oracle spec, D7) / F |
| WP-07 | V2/V3/V4 control, signal processing and observers, optimisation and modelling | done | S (tests from controller oracle spec, D7) / F |
| WP-08 | V2/V3 power electronics, PWM, motor control, torque optimisation | done | S (tests from controller oracle spec, D7) / F |
| WP-09 | V2/V3 fuzzy, learning | done | S / F |
| WP-10 | V2/V3 navigation, robot vacuum, DEM/CFD | done | S / F |
| WP-11 | Powertrain: U1-U16, V6, V8; import powertrain ledger verdicts | done | H / F |
| WP-12 | Solvers part A: orders on 5 problems, polynomial exactness, stiff stability, algebraic loop per solver, dispatcher and argument agreement, batch edge inputs | done | S / F |
| WP-12b | Solvers part B: adaptive error control on the canvas (D3: ode23/ode45/ode23tb with RelTol/AbsTol), outputTimes and stop-time hit, maxStep/minStep, stiffness diagnostic, Van der Pol and Robertson, time accumulation (XBV-017) | todo | S / F |
| WP-13 | Engine semantics | done | S / F |
| WP-13b | Engine part B: algTol/maxIter, more rate ratios, zero crossings for D2 blocks once XBV-036 is fixed, DOE evaluator diagnostic codes (src/engine/doe) | todo | S / F |
| WP-14 | Worker parity and protocol | done | S / F |
| WP-14b | Worker part B: snapshot round trip of every stateful block through the real client (ROBOT_VACUUM_COMM), cancel mid-batch, hybrid blocks with gear-shift stimulus after XBV-047, full node params and accumulated time in the parity reference | todo | S / F |
| WP-15 | Simulink goldens | todo | M+H / F |
| WP-16 | Canvas / interpreter parity and model corpus | done | S (harness + tests from controller spec, D7) / F (Opus, D8) |
| WP-17 | Per-block code parity, registry closure, compile matrix, limits | done | S (harness + tests from controller spec, D7) / F (Opus, D8) |
| WP-17b | Code parity part B: float32 production profile (per-block parity with float32 tolerances), clang sanitizers with runtime, DiagExtract/ExtractDiag/Diag | todo | S / F |
| WP-18 | State-machine alignment incl. AUTOSAR path | done | S (tests from controller spec, D7) / F (Opus, D8) |
| WP-19 | UI component tests | done | S / F |
| WP-20 | UI end-to-end | done | S / F |
| WP-21 | Fix loop, one commit per finding | in_progress | S / H, verifier opus |
| WP-22 | CI workflow, nightly random graphs, mutation run | in_progress | H / F |
| WP-23 | Close-out report | todo | O / F |

## Gate coverage per block

| Gate | pass | fail | n/a | todo / pending / other |
| --- | --- | --- | --- | --- |
| V1 | 45 | 245 | 0 | 0 |
| V2 | 0 | 0 | 0 | 290 |
| V3 | 45 | 0 | 0 | 245 |
| V4 | 0 | 0 | 0 | 290 |
| V5 | 0 | 0 | 249 | 41 |
| V6 | 0 | 2 | 146 | 142 |
| V7 | 0 | 0 | 45 | 245 |
| V8 | 0 | 0 | 62 | 228 |
| G | 0 | 0 | 80 | 210 |

290 blocks. Per-block gate values are in the ledger; most V2-V8 cells are still 'todo' at block level because the family WPs record their evidence per finding and per test file, not per block (WP-23 final pass).

## Open findings by severity

### S3 - diagnostic, UI or convention deviation (1)

| Id | Gate | Plan ref | Summary |
| --- | --- | --- | --- |
| XBV-317 | V4 | 4.4 worker | The worker engine snapshot keeps block states but not the discrete hit indices (hitIndex / nextTick): a run 0..2 resumed 2..4 from the snapshot repeats the hit at t = 2 (discrete integrator 10 instead of 9; DELAY buffer differs). Pre-existing; the app never sends a snapshot back to the worker today, but the protocol supports it. Found by the WP-21 E8 verifier. |

### S4 - documentation (1)

| Id | Gate | Plan ref | Summary |
| --- | --- | --- | --- |
| XBV-316 | U16 | 4.1 universal battery | Generated C names that are not unique within their first 63 characters (C99 5.2.4.1) for long model ids, identical on the base: SM_ST_<enum>_Entry / _Exit / _During when the state enum name is 63 characters; SM_Data_t variable members whose ids share 63 characters (count / counter); MCAL_CH_<channel> macros. Found by the WP-21 U3 verifier; out of scope of XBV-308 (X-Bridges member names). |

## Closed, merged or superseded findings

- XBV-001 (closed): Canvas engine and state-machine interpreter are compared only by xbSimEmbeddedParity.test.ts: unit-constant input, 6 ticks, scalar, discrete solver. WP-16 measured it: 281 (type, solver) cases, 178 eq
- XBV-002 (closed): Solver dispatch is written three times: XbridgesWorkspace.tsx stepLiveSolver, xbridgesWorker.ts, Solvers.runFixedStep; no test that they agree.
- XBV-003 (closed): Canvas ode23/ode45/ode23tb are stepped with the fixed step and hard-coded tolerances; no error control. Decision D3: control error with the user's RelTol/AbsTol.
- XBV-004 (closed): SolverOptions.solver admits ode113, ode23s, ode15s that no dispatcher implements. Decision D3: remove them from the type; unknown names keep UNSUPPORTED_SOLVER.
- XBV-005 (closed): Only Step and three PT_ blocks declare zero crossings. Decision D2: add ZeroCrossingFn to SATURATION, DEADZONE, RELAY, SWITCH, Abs and the PWM carrier blocks.
- XBV-006 (closed): SUM_JUNCTION has a codegen capability and no factory; DiagExtract, ExtractDiag, Diag have a factory and no capability entry of their own.
- XBV-007 (closed): The canvas palette and the help/AI palette differ: 20 types only on the canvas palette, 55 only on the help palette (inventory.json: onCanvasPaletteOnly, onHelpPaletteOnly).
- XBV-008 (superseded by XBV-029): DIMENSION_MISMATCH and DATA_TYPE_MISMATCH on a connection are warnings. Decision D1: compile errors, as in Simulink.
- XBV-009 (closed): docs/XBRIDGES_EMBEDDED_CODEGEN.md lists about 40 embedded-capable types and two solvers; the registry has 100 and three. WP-17: the document lists 38 types, the registry has 100 codegen-capable types.
- XBV-010 (closed): Embedded limits (fixed-step euler/rk4/discrete, no algebraic loops, vector 16, matrix 8) have no test on both sides of each boundary.
- XBV-011 (closed): The parameter schema covers 74 of 290 block types; PARAMETER_* errors do not apply to the others.
- XBV-012 (closed): 174 blocks have no equation text in their factory; ratchet list in tests/fixtures/xbridges/known-gaps.json.
- XBV-013 (closed): 233 blocks have at least one port without a unit; ratchet list in tests/fixtures/xbridges/known-gaps.json.
- XBV-014 (closed): 56 blocks use port types outside XSignalType (control, object, data, load, boolean); the engine's type checks do not know them. Ratchet list in tests/fixtures/xbridges/known-gaps.json.
- XBV-015 (closed): GAIN treats gain 0 (and -0) as 1: factory uses params.gain \|\| 1 (BlockDefinitions.ts ~3783); confirmed by run, also with per-tick applyParameterUpdates: input 3 gives 3, Simulink gives 0. PRODUCT nu
- XBV-016 (closed): Stiff solvers with an algebraic loop: y = 0.5*y + 1 feeding an Integrator, dt 0.1, stop 1 (expected integral 2): ode14x gives 51.588135932457256, ode23tb 1.7999999999948573; every other solver gives a
- XBV-017 (closed): The canvas accumulates time (timeRef += stepNow) instead of t0 + n*dt; the test kit uses multiplication (plan 5.1). Against an accumulating emulation, signals differ at rounding level for 40 block typ
- XBV-018 (closed): 28 stateful blocks are sorted by the engine as non-direct-feedthrough although their output depends on the current input (DERIVATIVE, HIGH_PASS_FILTER, MOVING_AVERAGE, KALMAN_FILTER, EXTENDED_KALMAN_F
- XBV-019 (closed): 153 numeric parameters are replaced by their default when set to 0 because factories use `params.x \|\| default`; the canvas rebuilds blocks through the factory on Play, so the user's 0 is lost (GAIN.
- XBV-020 (closed): 16 blocks mutate their state (or inputs/params) in place inside execute; solver stages then see already-updated state. ROBOT_VACUUM_FUSION with x_true = 1: euler 0.99795, rk4 0.9999998, ode45 about 1 
- XBV-021 (closed): Blocks throw inside execute (stopping the run with BLOCK_RUNTIME_FAULT): on default inputs 9 (MPC_CONTROLLER default Q 2x2 vs 1 output; MatrixConcat, MatrixSolve, SubMatrix on scalars; DEM_*; ROBOT_VA
- XBV-022 (closed): Undefined outputs or unreported NaN: 5 blocks alone with unconnected inputs (DEMUX out2 undefined stops a downstream Abs), 11 blocks on finite edge inputs. Lists XBV-U2, XBV-U3. SECTOR_SELECTOR moved 
- XBV-023 (closed): 15 noise/stochastic blocks use unseeded Math.random: runs are not repeatable (Simulink noise blocks are seeded). With a fixed seed, state also survives a clone (U11 clean). List XBV-U9.
- XBV-024 (closed): PWM_GENERATOR logs to the console inside execute and uses a golden-ratio phase offset; MPC_CONTROLLER keeps a class instance in state that does not survive a clone (hidden while it throws). Found duri
- XBV-025 (closed): SECTOR_SELECTOR returns sector -3 for theta = -10 rad (closed form floor(mod(theta, 2*pi)/(pi/3)) + 1 = 3); angles below -2*pi are not wrapped. Correct on (-2*pi, 4*pi). Pinned by it.fails in xbUniver
- XBV-026 (closed): Canvas ode23tb freezes silently: the canvas and worker call StiffSolver.stepODE23TB once per output step with tolerances 1e-3/1e-6 and ignore { accepted: false }; a rejected step leaves the state unch
- XBV-027 (closed): AC_MOTOR_PID_CONTROL with defaults settles at omega = w_ref / P = 78.5 rad/s for w_ref = 157 (stator frequency fixed at w_ref, P = 2), so the PID never removes the speed error, its integral winds up a
- XBV-028 (closed): Canvas (stepLiveSolver) and worker fall back to explicit Euler for any unknown solver name, silently; the batch runner returns UNSUPPORTED_SOLVER. Decision D3: unknown names are refused. Pinned by it.
- XBV-029 (closed): DIMENSION_MISMATCH and DATA_TYPE_MISMATCH on a connection are warnings and the run continues; decision D1 (Simulink): compile errors that stop the run. Pinned by it.fails in xbDiagnostics.test.ts. Sup
- XBV-030 (closed): An algebraic loop without a solution (y = 1 + y) emits ALGEBRAIC_LOOP_NOT_CONVERGED but the run continues every step with a meaningless value; Simulink stops. Pinned in xbEngine.test.ts.
- XBV-031 (closed): The engine accepts malformed models silently: two drivers on one input port, two blocks with the same id, and an unknown block type (skipped as a no-op) give no compile error. The canvas may prevent s
- XBV-032 (closed): Run time is quadratic in the number of blocks (1000/2000/4000-block chains: 188/435/1633 ms for 10 rk4 steps; 10 000 blocks about 22 s); gatherInputs searches the connection list per input. Pinned aga
- XBV-033 (closed): Runtime diagnostics of severity error do not stop the run: a block's typed diagnostic (e.g. LOGIC_NAN_INPUT) and a block-returned error (BLOCK_RUNTIME_FAULT via result.error) are recorded but never se
- XBV-034 (closed): DOE_MODEL fault codes EXECUTION_EXCEPTION, INVALID_GMDH_LAYERS, INVALID_TAGUCHI_LEVELS, NO_MODEL_CONFIGURED, NON_FINITE_INPUT exist only in nextState.lastFault and inside one BLOCK_RUNTIME_FAULT messa
- XBV-035 (closed): Dimension checking is inactive: library factories never set port dimensions (only PT_VEHICLE_BODY_1DOF inputs do), so DIMENSION_MISMATCH cannot fire for any canvas-built model; Simulink propagates and
- XBV-036 (closed): Batch variable-step runs (Solvers.runFixedStep with ode45 or ode23) hang - no result after 60 s - as soon as they bracket a Step event: Step at 0.3, 0.5 or 0.55 s with default tolerances, or at the st
- XBV-037 (closed): Stiff-solver options (ode14x extrapolationOrder/newtonIterations, ode23tb relTol/absTol/minStep/maxStep) are not editable on the canvas; STIFF_SOLVER_INVALID_OPTION and STIFF_SOLVER_STEP_TOO_SMALL are
- XBV-038 (closed): CONSTANT_VALUE_NOT_REPRESENTABLE (a Constant value that loses precision in its data type) is a compile error that refuses the model; Simulink reports parameter precision loss as a warning by default (
- XBV-039 (closed): In canvas simulation (main thread and worker) a state-machine variable mapped to a top-level Inport never reaches the X-Bridges model: the canvas writes the value with setSignalValue and params.value,
- XBV-040 (closed): WaveformGen amplitude 0 (also freq 0, offset 0) is replaced by 1/1/0 through `\|\|` (instance of XBV-019); a 0-amplitude sine outputs a full sine. Pinned in xbEquations.math.test.ts.
- XBV-041 (closed): The Sources 'Clock' block is a 50% square-wave pulse generator (freq parameter), not the Simulink Clock (output = simulation time); a Simulink user wiring Clock as time gets a 0/1 square wave. No bloc
- XBV-042 (closed): PRODUCT works on scalars only (Number(vector) = NaN); Simulink Product multiplies/divides vectors and matrices element-wise. Pinned in xbEquations.math.test.ts.
- XBV-043 (closed): Max (element-wise, two inputs) turns NaN into 0 (Number(x) \|\| 0): Max(NaN, -3) = 0; MATLAB max ignores NaN (-3), Simulink MinMax propagates NaN. Negative values and ties are correct. Pinned in xbEqu
- XBV-044 (closed): Sum signs with the '\|' spacer before a sign ('+\|-', '\|+-', '+ -') add instead of subtract: the spacer shifts the sign positions at execute time (factory strips it for the port count only). '+-\|' w
- XBV-045 (closed): Sum with a single '+' input returns the vector unchanged; Simulink's single-input Sum sums the elements. Pinned in xbEquations.math.test.ts.
- XBV-046 (closed): All 24 trigonometric/hyperbolic blocks return NaN for a vector input; Simulink Trigonometric/Math Function blocks are element-wise. Pinned in xbEquations.math.test.ts.
- XBV-047 (closed): The canvas worker client (serializeModelForWorker) strips execute, evaluateDerivatives and ZeroCrossingFn but not updateDiscrete, so postMessage throws DataCloneError for PT_AUTOMATED_MANUAL_TRANSMISS
- XBV-048 (closed): Mean of a matrix returns the mean of all elements (3 for [1 2; 3 6]); MATLAB mean and the Simulink Mean block default (each column) give the column means [2 4]. Pinned in xbEquations.math.test.ts. (MA
- XBV-049 (closed): WaveformGen Square is amp*sign(sin(...)): 0 at t = 0 and every crossing, and +amp at t = T/2 because sin(pi) = 1.2e-16; a 50 % square wave is +amp on [0, T/2), -amp on [T/2, T). Pinned in xbEquations.
- XBV-050 (closed): VectorPow of a negative base with a non-integer exponent returns a mathjs Complex object instead of a number (e.g. (-8)^(1/3) -> {re: 1, im: 1.732}); downstream blocks receive an object. Simulink real
- XBV-051 (closed): Max and Mean throw on an empty vector (mathjs 'Cannot calculate ... of an empty array'), stopping the run. Pinned in xbEquations.math.test.ts.
- XBV-052 (closed): SubMatrix uses zero-based start/end indices (defaults 0); Simulink Submatrix uses one-based indices, so the same numbers select a different block. Pinned in xbEquations.routing.test.ts.
- XBV-053 (closed): MUX nests vector inputs ([1, [2, 3]]) instead of concatenating them into one flat vector [1 2 3] as Simulink Mux does; downstream widths and element indices are wrong. Pinned in xbEquations.routing.te
- XBV-054 (closed): Switch lacks the Simulink criterion 'u2 ~= 0' (canvas offers >, <, >=, <=) and silently passes u2 for an unknown criterion. Pinned in xbEquations.routing.test.ts.
- XBV-055 (closed): MatrixSolve (singular, inconsistent system) Inverse (singular matrix) and MatrixMul (non-conformable sizes) throw ('Solve Error: ... matrix is singular'), stopping the run instead of reporting it. Pin
- XBV-056 (closed): Register with bitWidth 32 always stores 0: the mask (1 << 32) - 1 evaluates to 0 in JavaScript. Found by the WP-05 verifier; pinned in xbEquations.routing.test.ts.
- XBV-057 (closed): ShiftLeft/ShiftRight use JavaScript shifts, which mask the count to 5 bits: 1 << 32 = 1, 16 >> 32 = 16; a negative count gives 4 << -1 = 0. Simulink Bit Shift shifts every bit out at >= word length an
- XBV-058 (closed): SWITCH_CASE with a selector outside 1..n silently routes: sel 0 returns the selector value itself, sel 3, -1 and NaN return case 1; Simulink Multiport Switch reports an error (or uses the declared def
- XBV-059 (closed): Logic and bitwise blocks are scalar-only: AND([1 0],[1 1]) = true, NOT([0 1]) = false, BitwiseAND of vectors = 0; Simulink Logical/Bitwise Operator blocks are element-wise. Found by the WP-05 verifier
- XBV-060 (closed): DEMUX does not follow the Simulink split rule: a 3-vector into 2 outputs emits 3 values instead of [1 2] and [3] (n mod p = m: m outputs of floor(n/p)+1 elements, then p-m of floor(n/p)); a scalar int
- XBV-061 (closed): MatrixSolve returns a 2x1 matrix for a 1-D b instead of x with the shape of b. Found by the WP-05 verifier; pinned in xbEquations.routing.test.ts.
- XBV-062 (closed): INTEGRATOR_CONTINUOUS is scalar-only: vector IC [1 2] with input [1 1] stays [1 2] (Number(vector) = NaN; NUMERICAL_INSTABILITY), Simulink integrates element-wise to [2 3] at t = 1. Found by the WP-06
- XBV-063 (closed): INTEGRATOR (limited/reset integrator) drops a vector initial condition (Number([1 2]) \|\| 0 = 0) and keeps a scalar state; vector integration gives 0 instead of [2 3]. Found by the WP-06 executor; pi
- XBV-064 (closed): DELAY with delay_length 0 is refused: the factory turns 0 into 1 (`\|\|`) and compile reports DELAY_LENGTH_INVALID and PARAMETER_OUT_OF_RANGE; Simulink Delay accepts 0 as direct feedthrough. Found by 
- XBV-065 (closed): SATURATION is scalar-only: a vector input or vector limits give NaN (Number(array)); Simulink Saturation is element-wise with scalar or vector limits. Found by the WP-06 executor; pinned in xbEquation
- XBV-066 (closed): A bus through UNIT_DELAY outputs scalar 0 at the first sample (IC not expanded over the bus elements), so a downstream BUS_SELECTOR raises BLOCK_RUNTIME_FAULT 'Input must be a bus signal' at t = 0. Fo
- XBV-067 (closed): Engine (canvas fixed-step loop): discontinuous sources change inside a step - the rk4 stage at t + dt already sees a Step's new value, so the plain Integrator of Step(0 -> 1 at 0.5) is off by h/6 per 
- XBV-068 (closed): MOVING_AVERAGE starts with its window filled with the first sample (3, 6, 9, 12 -> 3, 4, 6, 9); a sliding-window average with zero initial state gives 1, 3, 6, 9. Found by the WP-06 executor; pinned i
- XBV-069 (closed): INTEGRATOR with an output limit under rk4 arrives below the limit: y(0.3) = 0.29833 instead of 0.3 with limit 0.3, and with limit 0.305 it sags to 0.30333 at t = 0.5 (the saturated derivative is used 
- XBV-070 (closed): THREE_PHASE_PWM uses a sawtooth carrier (raw phase 0..1) instead of the symmetric triangle of sinusoidal PWM: the average duty is right, but pulses are left-aligned (v_ref 0.5 gives a pulse in the fir
- XBV-071 (closed): SVPWM_CORE over-modulation is not handled: only t0 is clamped to 0, so t1 + t2 exceeds Ts (\|V\| = 300 at 30 deg, Vdc 400: t1 = t2 = 6.5e-5, sum 1.3e-4 > 1e-4); the standard rule scales t1, t2 to sum 
- XBV-072 (closed): MTPA_CONTROLLER does not deliver the requested torque: it hard-codes 2 pole pairs and id = -0.2 \|iq\| and ignores Ld, Lq; for te_ref = 1 it returns iq = 3.333, id = -0.667, i.e. Te = 0.533 (p = 1) or
- XBV-073 (closed): MTPA_CONTROLLER's operating point is not the maximum-torque-per-ampere point: on its constant-torque curve d\|i\|^2/d id is about +0.75 at te_ref = 1 (should be 0). Pinned in xbEquations.motor.test.ts
- XBV-074 (closed): PWM_GENERATOR with duty 1 turns off at the carrier peak (strict 'duty > carrier'; the carrier reaches exactly 1 at t = 0.01 s at 50 Hz), so a 100 % command produces a glitch every period; a sampled ru
- XBV-075 (closed): Continuous PID_BASIC ignores enable: its integrator keeps accumulating while enable = 0 (evaluateDerivatives ignores the enable input; execute's nextState is not used for continuous blocks). Enable 0 
- XBV-076 (closed): Continuous PID_BASIC ignores reset: the integral is neither held at 0 nor cleared while reset = 1. Found by the WP-07 executor; pinned in xbEquations.control.test.ts.
- XBV-077 (closed): PID_BASIC and PID_CONTROLLER output 0 during reset (all five PID_CONTROLLER outputs 0) instead of the proportional action Kp e. Found by the WP-07 executor; pinned in xbEquations.control.test.ts.
- XBV-078 (closed): KALMAN_FILTER predicts before its first update (starts from P[-1\|-1] = P0, so the first update uses A P0 A' + Q); the Simulink Kalman Filter starts from x[0\|-1] = x0, P[0\|-1] = P0 and updates first
- XBV-079 (closed): KALMAN_FILTER applies u(n) in the same sample's prior: the first innovation is y(0) - C B u(0) instead of y(0) - C x0; the input acts one sample early. Found by the WP-07 executor; pinned in xbEquatio
- XBV-080 (closed): PID_CONTROLLER is sorted as non-direct-feedthrough (stateful, no directFeedthrough flag) although u contains Kp (beta r - y): in a closed loop it reads the plant output one stage late and the result i
- XBV-081 (closed): MPC_CONTROLLER with Nc > 1 throws on its second call (RangeError: H is Nc x Nc but the warm-start vector has length nu), so the default MPC (Nc 3) cannot run more than one step; with Nc 1 it converges
- XBV-082 (closed): SPEED_CONTROLLER and CURRENT_CONTROLLER_DQ integrate a fake 1e-6 s at their first evaluation (dt = max(1e-6, t - lastTime)), so every output is offset by Ki e 1e-6 (iq_ref(0) = 1.00001 instead of 1). 
- XBV-083 (closed): The state-machine X-Bridges interpreter ignores Sum signs and always adds (xbInterpreter.ts ~530, case 'Sum'/'SUM_JUNCTION'/'VectorAdd'): '+-' gives u1 + u2. The canvas subtracts, and the C generator 
- XBV-084 (closed): Mixed time base inside one embedded tick (interpreter and generated C): Clock, WaveformGen and UNIT_DELAY are evaluated at t_k, while Integrator, INTEGRATOR_CONTINUOUS and RATE_LIMITER publish their p
- XBV-085 (merged into XBV-084): Embedded Step switches one tick early (evaluates t + dt, xbInterpreter.ts ~994): Step at T = 1 gives 1 at t = 0.95; the canvas gives 0 (Simulink: y = final for t >= T). Found by the WP-16 executor; pi
- XBV-086 (closed): Out-of-domain inverse trig/hyperbolic and pow (ACOS, ACOSEC, ACOSH, ACOTH, ASEC, ASECH, ASIN, ATANH, VectorPow): the canvas gives NaN with MATH_DOMAIN_ERROR. In the embedded path, under the 'signal-on
- XBV-087 (closed): Bitwise and shift blocks: canvas works in signed int32 (~0 = -1), the embedded path in uint32 (4294967295). No data-type contract decides which is right; Simulink requires an integer data type on the 
- XBV-088 (closed): WHITE_NOISE / BAND_LIMITED_NOISE use different random streams on the canvas (Math.random) and in the embedded path (deterministic generator), so a model with noise never matches between the two (relat
- XBV-090 (closed): SIX_STEP_COMMUTATION: the canvas treats a Hall input as high when > 0.5, the embedded path when non-zero; results differ for inputs in (0, 0.5]. Found by the WP-16 executor; pinned in src/utils/stateM
- XBV-091 (closed): LOW_PASS_FILTER / HIGH_PASS_FILTER at fc 10 Hz, dt 0.05 (dt/tau = 3.1): the canvas output grows (\|y\| > 1.3 from step 3, explicit integration beyond its stability limit), the embedded path stays boun
- XBV-092 (closed): KALMAN_FILTER in the parity harness: canvas x_hat and kg are non-numeric and y_hat differs from the embedded path (shape handling of the default matrices). To be bisected in WP-16b. Found by the WP-16
- XBV-093 (closed): Parity gap: the embedded path refuses STATE_SPACE (continuous representation, XB_DISCRETE_REPRESENTATION_REQUIRED) and DISCRETE_TRANSFER_FUNCTION with the default initial state (XB_STATE_INITIAL_VALUE
- XBV-094 (closed): Parity gap: VectorAdd/VectorSub/VectorMul/VectorDiv are registered with a scalar shape but the embedded validator rejects scalar inputs (XB_SHAPE_MISMATCH). Found by the WP-16 executor; pinned in src/
- XBV-095 (closed): buildXBSemanticModel throws 'Invalid PID mode: PID' (xbPidContract.ts ~18) for PID_CONTROLLER with the canvas default mode 'PID' instead of returning a diagnostic. Found by the WP-16 executor; pinned 
- XBV-096 (closed): Generated C for any model with a WaveformGen and no Clock does not compile: WaveformGen reads instance->xb_controller.sim_time, a member declared only when a Clock block exists (xbCGenerator.ts ~161, 
- XBV-097 (closed): Generated C advances simulation time twice per tick when the model has continuous states: sim_time += dt is emitted in both passes of SolverSubstep (xbCGenerator.ts ~986, ~2500), so time runs at 2x; I
- XBV-098 (closed): Generated C computes waveform time as (sim_time + dt) - dt, one extra rounding: sine-driven results differ from the interpreter by 6-42 ULP (about 1e-15 absolute); both stay within 1.8e-15 of the clos
- XBV-099 (closed): The C generator throws a raw Error ('emitter requires scalar signal', xbCGenerator.ts ~500) for vector inputs to LOW_PASS_FILTER, HIGH_PASS_FILTER, MOVING_AVERAGE, IF_ELSE and SWITCH that the capabili
- XBV-100 (closed): Generated C with Bitwise/Shift blocks fails -Wall -Werror: SM_XB_ShiftLeft32 / SM_XB_ShiftRight32 are emitted but unused. Found by the WP-17 executor; pinned in src/utils/stateMachine/xbCodeParity.tes
- XBV-101 (closed): Bitwise/Shift: the interpreter works in uint32 (~0 = 4294967295), the generated C in int32 (-1), so state-machine simulation and the generated code disagree; no data-type contract decides (see XBV-087
- XBV-102 (closed): KALMAN_FILTER: interpreter (0.35195) and generated C (0.66873) disagree with each other and with the block equation (0.63694, u = y = 0.7, factory parameters). Found by the WP-17 executor; pinned in s
- XBV-103 (closed): BAND_LIMITED_NOISE: interpreter and generated C produce different streams from tick 1 (-1.03300 vs -1.00272); WHITE_NOISE agrees on both sides. Found by the WP-17 executor; pinned in src/utils/stateMa
- XBV-104 (closed): Generated C for an integrator loop fails -Wshadow (gcc and clang): 'xb_value_0_0_i_out' shadows a previous local (sm_core.c:78). Found by the WP-17 executor; pinned in src/utils/stateMachine/xbCodePar
- XBV-105 (closed): Generated C for discontinuity blocks fails -Wdouble-promotion (gcc sm_core.c:143, clang sm_core.c:100): float promoted to double in a conditional. Found by the WP-17 executor; pinned in src/utils/stat
- XBV-106 (limitation): State-machine variables are scalar only: mapping a vector (3) or matrix (2x2) X-Bridges port to an SM variable is refused (XB_MAPPING_INVALID), so plan 7.2's vector/matrix boundary mappings are not ex
- XBV-107 (closed): PRODUCT with operation 'divide' is not available in the embedded (state-machine / C) path although the canvas offers it; divide inside a state requires VectorDiv on vectors. Reported by the WP-18 exec
- XBV-108 (closed): Under the 'retain' memory policy the discrete sample-hit counter freezes while the owning state is inactive (hits at ticks 1, 3, 7, 9 across exit/re-entry); simulator, runtime and C agree, but docs/XB
- XBV-109 (closed): docs/powertrain/ledger.json has no per-block gate records ('blocks' is {} and no PT_ type appears), so the powertrain G1-G5 verdicts the plan imports do not exist; the 45 PT_* blocks are covered by 28
- XBV-110 (closed): FUZZY_MF_TRIMF shoulder: with a = b (or b = c) the membership at the shoulder vertex is 0 instead of 1 (x <= a \|\| x >= c returns 0 first); MATLAB trimf gives 1. Found by the WP-09 executor; pinned i
- XBV-111 (closed): FUZZY_MF_TRAPMF shoulder: with a = b (or c = d) the membership at the shoulder vertex is 0 instead of 1. Found by the WP-09 executor; pinned in xbEquations.fuzzy.test.ts.
- XBV-112 (closed): FUZZY_AND clips its inputs to [0, 1] and turns NaN into 0 silently (min(1.5, 2) = 1, product = 1 instead of 1.5 and 3); MATLAB does not clip. Out-of-range memberships are invalid inputs, so clipping i
- XBV-113 (closed): FUZZY_OR clips its inputs to [0, 1] without a diagnostic (max(1.5, 2) = 1 instead of 2). Found by the WP-09 executor; pinned in xbEquations.fuzzy.test.ts.
- XBV-114 (closed): FUZZY_NOT clips its input to [0, 1] without a diagnostic (1 - 1.5 gives 0 instead of -0.5). Found by the WP-09 executor; pinned in xbEquations.fuzzy.test.ts.
- XBV-115 (closed): FUZZY_RULE ignores implication 'min' (the default): weighted = strength * cons (the default branch equals the 'prod' branch); strength 0.4, cons 0.5 gives 0.2 instead of 0.4. Found by the WP-09 execut
- XBV-116 (closed): FUZZY_RULE clips antecedents to [0, 1] without a diagnostic. Found by the WP-09 executor; pinned in xbEquations.fuzzy.test.ts.
- XBV-117 (closed): FUZZY_DEFUZZIFY returns 0 for an all-zero aggregate with centroid (MATLAB: mid-range with a warning; on [0, 10] = 5) - silent wrong value. Found by the WP-09 executor; pinned in xbEquations.fuzzy.test
- XBV-118 (closed): FUZZY_DEFUZZIFY returns 0 for an all-zero aggregate with mom (mean of the range expected, 5). Found by the WP-09 executor; pinned in xbEquations.fuzzy.test.ts.
- XBV-119 (closed): FUZZY_INFERENCE_SYSTEM returns 0 when no rule fires (denominator 0) instead of the output mid-range (output range [2, 6]: 4). Found by the WP-09 executor; pinned in xbEquations.fuzzy.test.ts.
- XBV-120 (closed): FUZZY_INFERENCE_SYSTEM gives 0 membership at input shoulder vertices (trimf [-3, -3, -1] at -3), so rules on the range edge never fire (same root cause as XBV-110). Found by the WP-09 executor; pinned
- XBV-121 (closed): FUZZY_INFERENCE_SYSTEM output shoulders (NB [-1, -1, -0.5], PB at the range end) are 0 at the end point, so the defuzzified output is off: at (-0.5, -0.2) y = -0.250623 instead of -0.252217. Found by 
- XBV-122 (closed): ROBOT_VACUUM_DYNAMICS applies a hidden 0.992 slip factor in evaluateDerivatives: a straight run gives x(10) = -1.51792 instead of the kinematic -1.51 (r w t). Found by the WP-10 executor; pinned in xb
- XBV-123 (closed): ROBOT_VACUUM_DYNAMICS turning in place: theta(2) = 2.4552 instead of 2.475 (same hidden slip factor). Found by the WP-10 executor; pinned in xbEquations.robot.test.ts.
- XBV-124 (closed): ROBOT_VACUUM_THETA_STAR line-of-sight shortcuts ignore the robot radius on the grid (legs pass 0.025 m from occupied cells, 0.15 m expected); its 'inflation' parameter is unused (0.28 literal). Found 
- XBV-125 (closed): ROBOT_VACUUM_GLOBAL_PLANNER ignores the grid and the start pose and returns the goal as the only waypoint (no A* path around a barrier). Found by the WP-10 executor; pinned in xbEquations.robot.test.t
- XBV-126 (closed): ROBOT_VACUUM_ENCODER counts 185 instead of 180 for pi rad/s over 1 s at 360 cpr: with lastTime === 0 the first steps use dt 0.02 twice. Found by the WP-10 executor; pinned in xbEquations.robot.test.ts
- XBV-127 (closed): The built-in Robot Vacuum Twin lab diverges to Infinity within 3 s at the app's default rk4 step 0.02 s (motor pole about -500/s); it needs dt 0.005 s to stay finite. Found by the WP-10 executor; pinn
- XBV-128 (closed): Robot Vacuum Twin lab in mode 6 does not reach the commanded goal (1.5, 1.5): the robot stays at (0, 0). Found by the WP-10 executor; pinned in xbEquations.robot.test.ts.
- XBV-129 (closed): ROBOT_VACUUM_DYNAMICS default pose (0, 0) lies inside the x = 0 wall zone, so the robot does not move with a forward command (x(1) = 0 instead of 0.099). Found by the WP-10 executor; pinned in xbEquat
- XBV-130 (closed): DEM_DRUM uses its 4th execute argument (the simulation time) as the step size, so the angle grows quadratically: angle(2) = 20.43 instead of 12.566 for its rpm. Found by the WP-10 executor; pinned in 
- XBV-131 (closed): DEM_PARTICLE_SYSTEM uses time as dt (same cause as XBV-130): free fall vy(0.1) = -2.08 instead of -0.981. Found by the WP-10 executor; pinned in xbEquations.robot.test.ts.
- XBV-132 (closed): CFD_SPH_WATER_SOLVER never reads its stiffness, density, viscosity or smoothing-length parameters; there are no SPH pressure/viscosity forces. Found by the WP-10 executor; pinned in xbEquations.robot.
- XBV-133 (closed): ROBOT_VACUUM_DIGITAL_TWIN diverges within 2 s at rk4 dt 0.02 (finite only at 0.005). Found by the WP-10 executor; pinned in xbEquations.robot.test.ts.
- XBV-134 (closed): ROBOT_VACUUM_GLOBAL_PLANNER with no possible path returns [goal] with no failure flag. Found by the WP-10 executor; pinned in xbEquations.robot.test.ts.
- XBV-135 (closed): Properties panel renders MatrixConcat.axis, SWITCH_CASE.numCases, Scope.numSignals and Scope.bufferSize as selects, so values such as 0, -2.5 or 0.125 cannot be entered (ratchet in xbV8Ui.test.tsx). F
- XBV-136 (closed): Properties panel renders LAPLACE_TRANSFORM.mappingType (schema kind option) as free text instead of a select. Found by the WP-19 executor; pinned in src/components/xbridges/xbV8Ui.test.tsx.
- XBV-137 (closed): 463 numeric (block, parameter) pairs show no error for invalid text ('abc'): only the 74 block types in parameterSchema.ts are validated (same root as XBV-011; ratchet in xbV8Ui.test.tsx). Found by th
- XBV-138 (closed): Typing 'abc' into any numeric parameter and leaving the field stores the raw string 'abc' as the parameter value (576 numeric parameters); plan 6: invalid text must not overwrite the stored value. Fou
- XBV-139 (closed): Properties panel labels are not tied to their editors (no htmlFor, no aria-label), so screen readers cannot name the fields. Found by the WP-19 executor; pinned in src/components/xbridges/xbV8Ui.test.
- XBV-140 (closed): Canvas wiring accepts a second driver on an already-connected input: onConnect adds the edge and the workspace has no isValidConnection (XbridgesWorkspace.tsx ~2306); the canvas side of XBV-031. Found
- XBV-141 (closed): Undo after a parameter edit removes the block: updateBlock does not record history, so Ctrl+Z reverts to the state before the block was added (XbridgesWorkspace.tsx ~2862). Found by the WP-19 executor
- XBV-142 (closed): There is no redo (Ctrl+Y / Ctrl+Shift+Z) in the X-Bridges workspace. Found by the WP-19 executor; pinned in src/components/xbridges/xbV8Ui.test.tsx.
- XBV-143 (closed): A canvas run does not log a sample at the stop time: for 0..1 s at h = 0.01 the last Scope sample is t = 0.99 (y = 1.98); Simulink logs t = 1 (y = 2). Every logged sample is correct (y = 2t within 1e-
- XBV-144 (closed): Toolbar Single Step does nothing during a live run: the live run uses the worker engine, engineRef is null and stepSimulation returns immediately (XbridgesWorkspace.tsx ~2929); time stays unchanged af
- XBV-145 (closed): A block dragged from the library is placed at the centre of the pane, not where it is dropped (pointer position ignored, XbridgesWorkspace.tsx ~2379-2395). Found by the WP-20 executor (Playwright, rea
- XBV-146 (closed): Opening a saved .adia project while the X-Bridges tab is active leaves the canvas empty (also after switching tabs); opening from another tab works (src/App.tsx hydrateProject / workspaceFiles ~5765-5
- XBV-147 (closed): The Robot Vacuum Navigation & Mapping lab shows EKF error Infinity and confidence 0 % after 5 s at the default step (same stiffness class as XBV-127). Found by the WP-20 executor (Playwright, real Chr
- XBV-148 (closed): When a run ends at the stop time the Run button reappears before the status bar shows the final time: the status time is refreshed on every 4th tick and, at the end, only from the run effect's cleanup
- XBV-149 (closed): Save writes a stale model: the X-Bridges canvas reaches the project store through a 300 ms debounce (XbridgesWorkspace.tsx, debounced onSave) that every canvas change restarts, and Save does not flush
- XBV-150 (closed): Embedded PID_CONTROLLER differs from the canvas PID: the embedded side ignores setpoint weights beta and gamma (unit step, canvas defaults gamma 0: u(0) 1.1667 vs 1.0), always uses the backward-Euler 
- XBV-151 (closed): The embedded builder still refuses DELAY delay_length 0 (xbSemanticBuilder.ts ~1146 XB_DELAY_LENGTH_INVALID, diagnosticGuidance.ts) although the canvas now treats it as direct feedthrough (XBV-064, Si
- XBV-152 (closed): The per-block V6 parity case for PID_CONTROLLER is vacuous: every input port gets the same source, so r = y and e = 0; it passes without exercising the controller. Test-side gap (controller), to be re
- XBV-153 (closed): Six divisor parameters give a non-finite output without a diagnostic when set to 0 (present before WP-21): IM_FOC_CONTROL.Lm, AIR_FRYER_LEARNING_MODEL tau_h, tau_f, tau_c, tau_s, FABRIC_HARMONIC_ANALY
- XBV-157 (closed): The record of invalid parameter text is cleared when the selection changes: leaving 'abc' in a field and selecting another block lets Run start again with the last valid value and no message. Found by
- XBV-158 (closed): The worker logs the final sample at the summed time (stop time within a few ULP), the main-thread path at exactly the stop time. Found by the WP-21 batch C verifier.
- XBV-154 (closed): Embedded Mean (mean of all elements) and SubMatrix (zero-based indices) still follow the pre-WP-21 canvas rules; the canvas now gives MATLAB/Simulink column means and one-based indices (WP-21 batch D)
- XBV-155 (closed): A vector input with a scalar initial condition is not scalar-expanded for the plain Integrator (bare-number state) on any solver, and for INTEGRATOR / INTEGRATOR_CONTINUOUS on the stiff solvers ode14x
- XBV-156 (closed): The properties panel's Switch criterion dropdown (XbridgesPropertiesPanel.tsx ~1077) does not offer the new 'u2 ~= 0' criterion, and blockGuidance still documents SubMatrix indices as zero-based ('def
- XBV-159 (closed): Embedded continuous-form PID_CONTROLLER (sample time <= 0) advances its integrator and derivative-filter states with forward Euler whatever the solver: under rk4 the embedded trace equals the euler tr
- XBV-160 (closed): Embedded VectorDiv by zero publishes 0 (documented safe-zero fallback kept by batch F) while the canvas gives Inf with DIVIDE_BY_ZERO and PRODUCT divide gives Inf; D11 (NaN/Inf + fault flag) should ap
- XBV-161 (closed): Embedded ShiftLeft/ShiftRight mask the shift count to 5 bits (& 31) in interpreter and C; Simulink and the canvas (since XBV-057, WP-21 batch D) shift every bit out for counts >= 32 (0, or -1 for a ne
- XBV-162 (closed): src/utils/stateMachine/xbAccurateMath.ts says glibc sin is correctly rounded; glibc 2.39 differs from the correctly rounded value in 195 of 208k samples (verifier). The interpreter's accurateSin is co
- XBV-163 (closed): Embedded RELAY reads the previous tick's input and switches one sample late: SINE_A u(0.30) = 1.0162 >= switch-on 1, so Simulink (and the canvas, direct feedthrough since WP-21 E2) gives 1 at t = 0.3 
- XBV-164 (closed): Embedded rk4 evaluates Step at the stage times; the canvas holds discontinuous outputs at their major-step value during minor steps (Simulink, WP-21 E2 / XBV-067), so 6 rk4 corpus seeds differ by h/6 
- XBV-165 (closed): A block fault raised in a trial (minor) stage of a variable-step solver stops the run: the om501 lab with ode45 at default tolerance stops at 2.92 s with BLOCK_RUNTIME_FAULT (Intake Manifold P = -4360
- XBV-166 (closed): src/help/moduleTopics.ts still says the canvas does not adapt its step; since WP-21 E1 the canvas ode45/ode23/ode23tb control the error with RelTol/AbsTol.
- XBV-169 (closed): MatrixConcat axis 0 mixes Simulink's Vector and Multidimensional modes: scalars only give a 2x1 matrix, vectors only (or vector plus scalar) give a longer 1-D vector; the block has no mode parameter (
- XBV-167 (closed): Embedded KALMAN_FILTER still predicts before the first update (P[0\|-1] = A P0 A' + Q); the canvas follows the Simulink order (update with x[0\|-1] = x0, P0, then predict) since WP-21 batch G (XBV-078
- XBV-168 (closed): Embedded PID_BASIC / PID_CONTROLLER output 0 while reset is active; Simulink and the canvas (since XBV-077, WP-21 batch G) keep the proportional action Kp e. Pinned in xbTriParity.
- XBV-170 (closed): AC_INDUCTION_MOTOR and AC_MOTOR_PID_CONTROL stator-current equations divided the resistive and back-EMF terms by sigma once too often (sigma Ls dis/dt = vs - (Rs + kr^2 Rr) is + (kr/tau_r) psir -/+ kr
- XBV-172 (closed): A non-finite operand of ShiftLeft/ShiftRight (Inf, NaN) gives 0 without a numeric fault in the embedded path (JS ToInt32 / C helper), while the canvas raises a block error. Found by the WP-21 batch F2
- XBV-173 (closed): Help coverage is out of date after WP-21 UI and parameter changes: src/help/helpCoverage.test.ts fails on the live-UI fingerprint and on an unmapped reviewed feature (new inline controls such as the t
- XBV-171 (closed): A continuous STATE_SPACE with an explicit sampleTime > 0 held its state (evaluateDerivatives only ran for sampleTime <= 0); Simulink's continuous State-Space has no sample time and always integrates. 
- XBV-174 (closed): Embedded continuous STATE_SPACE holds its state when sampleTime > 0 (batch F2 mirrored the pre-E3 canvas); the canvas now integrates it (XBV-171). Pinned in xbTriParity.
- XBV-175 (closed): StiffSolver.derivAt (WP-21 batch I rework 2) turns a NaN derivative into 0; before, the run stopped with STIFF_SOLVER_NONFINITE. 0/0 into an Integrator now runs to the end under ode14x/ode23tb with a 
- XBV-176 (closed): VectorUtils.integrateState reads a derivative as `Number(deriv) \|\| 0`, so a NaN derivative is integrated as 0 by euler/rk4/ode45 without a diagnostic (pre-existing). Found by the WP-21 batch I verif
- XBV-177 (closed): PT_AUTOMATED_MANUAL_TRANSMISSION and PT_DUAL_CLUTCH_TRANSMISSION do not finish 1 s of simulation within 120 s under ode23tb (defaults, unit inputs); rk4 finishes quickly. Found by the WP-21 batch I sc
- XBV-178 (closed): PT_TURBOCHARGER raises BLOCK_RUNTIME_FAULT with its defaults and unit inputs under rk4 and ode23tb alike (not a solver difference; cause not investigated). Found by the WP-21 batch I scan.
- XBV-179 (closed): PT_ENGINE_DYNO under ode23tb at default tolerances differs from rk4 (0.001) by 2e-2 relative at output step 0.05 (2.8e-3 at 0.01); keyed derivatives, so error control / output interpolation rather tha
- XBV-180 (closed): Some parameterSchema 'positive' entries reject 0 although 0 is not degenerate in the block equation: ROBOT_VACUUM_MOTOR motor_R/motor_K, Lm of AC_INDUCTION_MOTOR/IM_FLUX_OBSERVER/AC_MOTOR_PID_CONTROL 
- XBV-181 (closed): After a block with recorded invalid parameter text is selected again, the properties panel shows the stored (last valid) number while the kept record still refuses the run; the Problems message names 
- XBV-182 (closed): The panel maps PT_* parameter specs to editor kinds only for min = 0 (nonnegative); specs with min > 0 or a max become plain 'number', so the panel accepts out-of-range text that the block refuses at 
- XBV-183 (closed): ode23tb with RelTol 1e-9 (now reachable from the toolbar) fails at t = 6.1e-6 with STIFF_SOLVER_STEP_TOO_SMALL on the cos(10 t) integrator; tight tolerances should take smaller steps down to the docum
- XBV-184 (closed): Live ode23tb with Relay/Switch changed mode only once per output step (errors 0.57 / 1.99 at output step 0.1). Found by the WP-21 E4 verifier.
- XBV-185 (closed): Robertson problem: ode23tb stops at step 1 with STIFF_SOLVER_NONFINITE when a Newton iterate overflows, instead of rejecting the step and retrying smaller (MATLAB ode23tb treats a failed Newton iterat
- XBV-186 (closed): Fixed-step euler, ode2, ode3, rk4, ode5 (Solvers.ts) and ode14x (StiffSolver.ts ~384) compute zcPrev = getZeroCrossings(t, statesPrev) without computeOutputs first, so gatherInputs reads the trial-end
- XBV-187 (closed): PT_AUTOMATED_MANUAL_TRANSMISSION under rk4 at 1e-3 never locks within 0.05 s (DiffTrq +-1600 chatter) and locks late (0.0115 s vs 0.0019 s) at 1e-4; same on the base. Simulink locks the clutch with a 
- XBV-188 (closed): robot_vacuum_twin: the first run in a fresh process differs from later runs in robot_nav.nav_stats and robot_slam.* (Math.random seeded), so a block keeps state across runs (module-level state not res
- XBV-189 (closed): ROBOT_VACUUM_MOTOR pwm_duty reads \|u\| <= 1 as a duty cycle and larger values as volts; the port unit is 'V' since WP-21 K (fits the labs), but one port mixes two meanings. Simulink-style: one meanin
- XBV-190 (closed): Canvas LOW_PASS_FILTER, HIGH_PASS_FILTER and MOVING_AVERAGE are not element-wise on a vector input: a 3-vector gives the scalar [0] (filters) or [null] (moving average) at step 0, while the embedded p
- XBV-191 (closed): Canvas RATE_LIMITER outputs 0 at t = 0 for a constant 0.7 input with rising/falling limits 0.1 per step; decision D12 (initial condition y(-1) = IC = 0) gives clamp(0.7, 0 +/- 0.1) = 0.1, which the em
- XBV-192 (closed): RATE_LIMITER with vector slew rates: p.risingSlewRate * dt is NaN, so limiting is silently skipped and u passes through (also on the base). Simulink Rate Limiter accepts only scalar rates; a vector ra
- XBV-193 (closed): The embedded validator refuses RATE_LIMITER vector slew rates with the generic message 'risingSlewRate must be >= 0...' instead of saying that vector rates are not supported by Generate C (the canvas 
- XBV-194 (closed): A RATE_LIMITER slew rate given as the one-element array [2] passes the embedded validator, but xbInterpreter.parameter and xbCGenerator.scalarParameter read only numbers and silently fall back to the 
- XBV-195 (closed): src/utils/stateMachine smDifferential: the state-timer Step value is [0,2,2,2] where [0,2,2,5] is expected (not an environment issue; fails on the base too). Found by the WP-21 XBV-193 verifier; root 
- XBV-196 (closed): An empty RATE_LIMITER slew rate [] / '[]' is refused by the embedded validator with the 'vector slew rates' message although it has no elements (the base silently ran it at rate 1); the message should
- XBV-197 (closed): RATE_LIMITER legacy aliases risingLimit / fallingLimit set to '' pass the embedded validator as Number('') = 0, while the readers fall back to the default 1 (interpreter = C, so no parity gap); an emp
- XBV-300 (closed): 44 blocks (CLARKE/PARK/INVERSE_* transforms, AC_MOTOR_PID_CONTROL, FIELD_ORIENTED_CONTROL, FUZZY_MF_GAUSSMF/SIGMF, ROBOT_VACUUM_*, DEM_BOND_FABRIC, LMS/NEURAL, SVPWM_CORE, ...) coerce a vector, matrix
- XBV-302 (closed): Determinant throws for non-square / vector / 1xn / nx1 / ragged input and Transpose for ragged input, instead of a dimension diagnostic (BlockDefinitions.ts / VectorUtils.ts). Found by WP-03b (xbUnive
- XBV-303 (closed): parameterSchema lists representation continuous\|discrete for TRANSFER_FUNCTION, ZERO_POLE_GAIN, LAPLACE_TRANSFORM and DISCRETE_TRANSFER_FUNCTION; the factories fix the domain (as Simulink's separate 
- XBV-305 (closed): FLUX_REFERENCE mode field_weakening gives the same output as constant (silent no-op; the code comment says not implemented, BlockDefinitions.ts ~3883). Found by WP-03b (xbUniversalB.test.ts, ratchet t
- XBV-306 (closed): MatrixDiag, Diag, DiagExtract and ExtractDiag ignore diagMode create\|extract; VectorUtils.diag decides from the input shape (silent no-op). Found by WP-03b (xbUniversalB.test.ts, ratchet tests/fixtur
- XBV-307 (closed): Discrete sample hits accumulate nextTime += Ts: with Ts 0.1 and h 0.01 from t = 0 the hit at t = 5094.2 s (tick 509420) and every later hit fire one tick late, so the outputs are wrong (XbridgesEngine
- XBV-308 (closed): Generated C member names are not unique in the first 63 characters (C99 5.2.4.1) for ids that differ only later; smCIdentifierPolicy is not applied to members (xbCGenerator.ts). Found by WP-03b (xbUni
- XBV-309 (closed): FUZZY_INFERENCE_SYSTEM.orMethod (max\|probor) is stored but never read: both give 0.083979 while andMethod changes the output (BlockDefinitions.ts ~10551). Found by WP-03b (xbUniversalB.test.ts, ratch
- XBV-310 (closed): 16 panel enums outside parameterSchema accept unknown and wrong-case values silently (CLARKE_TRANSFORM.mode runs an unknown value as power-invariant; PWM_GENERATOR.carrierType; THREE_PHASE_PWM.method;
- XBV-311 (closed): XbridgesEngine.compile first-hit margin n0 = ceil(start/Ts - 1e-6) is below the ulp of start/Ts from about 1e11 ticks (start 1.8e7 s at Ts 1e-4, 1.3e8 s at Ts 1e-3): the first hit at an on-grid start 
- XBV-312 (closed): Scope sampleTime decimation compares time - lastSampleTime with an absolute 1e-9 (BlockDefinitions.ts ~3107): at start 1e8 s, h 0.01, Ts 0.1 it logs 12000 of 20000 samples (0.2 s gaps); clean at 0, 1e
- XBV-313 (closed): PWM carrier phase += dt*f (BlockDefinitions.ts ~447) accumulates a bounded error (5e-12 after 1e6 steps from 0, 3.6e-8 at 1e8 s); a duty exactly equal to the carrier value (e.g. 0.3) can flip the gate
- XBV-314 (closed): A Scope with sampleTime 0.1 over [0, 2] logs 20 samples; Simulink logs 21 (both endpoints, t = 2 included). Same on the base. Found by the WP-21 E7 verifier.
- XBV-315 (closed): The 'positive' parameter kind rejects 0, negatives, NaN, text and empty at compile time but accepts Infinity, which then fails only at run time (for example PWM frequency). 'positive' (and 'nonnegativ

## Decisions

- **D1** (2026-11-10, F8 connection mismatches): DIMENSION_MISMATCH and DATA_TYPE_MISMATCH become compile errors that stop the run. Different discrete rates on a direct connection stay the existing RATE_TRANSITION_REQUIRED warning; nothing is inserted automatically.
- **D2** (2026-11-10, F5 zero crossings): Add ZeroCrossingFn to SATURATION, DEADZONE, RELAY, SWITCH, Abs and the PWM carrier blocks.
- **D3** (2026-11-10, F3/F4 solvers): Canvas ode23, ode45 and ode23tb control error with the user's RelTol and AbsTol inside each output step. ode113, ode15s and ode23s are removed from SolverOptions; an unknown name keeps UNSUPPORTED_SOLVER.
- **D4** (2026-11-10, Simulink goldens): Goldens for every block whose toolbox is installed in the user's MATLAB R2024b; otherwise G stays pending and the block is verified by oracles 1, 2, 4 and 5.
- **D5** (2026-11-10, ADIA-only blocks): Verified by U1-U16, conservation and bounded-state invariants and 60 s closed-loop lab runs; G is n/a.
- **D6** (2026-11-10, Loop roles): Opus controls the loop (acceptance tests, briefs, ledger, commits); Sonnet and Haiku are the executors and run the tests; Fable verifies every work package before it is committed.
- **D7** (2026-11-10, Who writes family acceptance tests): From WP-06 on, the controller writes an oracle specification per block (stimulus, closed-form expected values and their source, tolerances, Simulink rule) in the brief; the Sonnet executor turns it into the test file and pins product defects as it.fails with proposed finding ids; the controller reviews every expected value against the spec before dispatching the Fable verifier. Expected values never come from the code under test.
- **D8** (2026-11-11, Verifier model): User: take Fable out of the loop; Opus does the verification. The xbv-verifier role now runs as an independent Opus subagent (not the controller itself), with the same checks. Verdicts before this date were given by Fable.
- **D9** (2026-11-11, Embedded tick time base (XBV-084)): Start-of-tick time base in the embedded path (interpreter and generated C), adopted by the controller under the user's 'fix all findings' go-ahead (2026-11-11, recommended option, reversible): every block in tick k sees t_k, continuous and discrete states publish their value at t_k and are updated to t_{k+1} after all outputs (Simulink output-then-update order, which the canvas already follows).
- **D10** (2026-11-11, bitwise data type (XBV-087, XBV-101)): Bitwise and shift blocks work on int32 two's complement on every path (canvas, interpreter, C); the generated C performs the bit operations on uint32 casts and converts back, so every operation is defined behaviour. Adopted by the controller under the 'fix all' go-ahead; the canvas and the C already used int32, only the interpreter changes.
- **D11** (2026-11-11, out-of-domain math in the embedded path (XBV-086)): Out-of-domain inputs (acos(2), atanh(1.5), (-8)^(1/3)) publish NaN and raise the numeric fault on every path, as the canvas (NaN + MATH_DOMAIN_ERROR) and Simulink-generated C (libm returns NaN) do; the documented 'deterministic fallback 0' of the signal-only fault policy is replaced by NaN + fault flag. Adopted by the controller under the 'fix all' go-ahead.
- **D12** (2026-11-12, Rate Limiter initial condition): ADIA's Rate Limiter has an explicit initialCondition parameter (default 0) that Simulink's block lacks; it is the output before the first sample, y(-1) = IC. Ts > 0: y(0) = clamp(u(0), IC + falling Ts, IC + rising Ts); inherited/continuous sample time: y(0) = IC (no time has elapsed). This is the canvas behaviour, adopted for the embedded path.
- **D13** (2026-11-12, new diagnostic codes in WP-21): Structural compile errors MULTIPLE_DRIVERS, DUPLICATE_BLOCK_ID, UNKNOWN_BLOCK_TYPE (error) and the fuzzy warning FUZZY_EMPTY_AGGREGATE (MATLAB 'no rules fired': output mid-range) are dedicated codes rather than reuses of BLOCK_RUNTIME_FAULT / MATH_DOMAIN_ERROR; each has a recipe and guidance.
- **D14** (2026-11-15, Clock block): The Clock block outputs the simulation time (Simulink Clock; the embedded path already did). The old square-wave behaviour remains available as WaveformGen type 'Square'; no lab, example or saved model used Clock.freq. Adopted by the controller under the 'fix all' go-ahead.
- **D15** (2026-11-16, XBV-186 fixed-step zero crossings): Fixed-step solvers (euler, ode2, ode3, rk4, ode5, ode14x) do not locate zero crossings, as Simulink with 'Enable zero-crossing detection for fixed-step simulation' off (its default): a block mode changes at a major step, the output grid stays k*h, and batch runs equal the live canvas step. Variable-step ode23, ode45 and ode23tb keep event location.
- **D16** (2026-11-16, XBV-106 vector/matrix state-machine variables): Recorded as a product limitation, not fixed in WP-21: state-machine variables stay scalar; vector/matrix signals work inside an X-Bridges model and cross the state-machine boundary element by element (one scalar variable per element). Building vector/matrix variables is a feature (model, interpreter, C generator, validator, UI) estimated at 1-2 days; reversible on request.
- **D17** (2026-11-22, XBV-306 diagonal blocks): MatrixDiag, Diag, DiagExtract and ExtractDiag follow MATLAB diag: the input shape decides (a vector builds a diagonal matrix, a matrix gives its diagonal), as the embedded interpreter and generated C already did. The create/extract diagMode option is removed instead of enforced, so existing models and parity are unchanged. Reversible on request.

## Deferred items (notes for follow-up WPs)

- **WP-04b:** From the WP-04 verifier: integer overflow per data type, Gain matrix mode (K*u; ADIA only has element-wise, which is the Simulink default), exact degree values (sind(180) = 1.2e-16, tand(90) finite), Inf in Sum, PRODUCT with a single vector input (NaN, part of XBV-042).
- **WP-05b:** From the WP-05 verifier, not yet pinned: Switch scalar expansion and vector ctrl; IF_ELSE with NaN (false) and [0] (true); MatrixConcat with unequal widths returns a ragged matrix; SubMatrix clamps out-of-range ends; MatrixSolve on a rank-deficient consistent system returns one solution silently; Inverse/Determinant of a non-square matrix throw (XBV-055 family); MatrixDiag ignores diagMode (auto-detects by shape); cond 1e12/1e16; single-input XOR; clock high at step 0 counted as an edge.
- **WP-06b:** From WP-06: DERIVATIVE tau 0 or negative is replaced by 0.01 (instance of XBV-019); derivative of a Step under rk4 spikes at 83.3 (step seen at the mid stage of the previous step) - compare with Simulink Derivative in WP-15; INTERP_PRELOOKUP default table differs from LOOKUP_ND default; Flat/Nearest lookup require ExtrapMethod 'Clip' (linear extrapolation rejected) - check against Simulink.
- **WP-08b:** From WP-08: IM_SCALAR_CONTROL ignores rated_f (no constant-voltage region above rated frequency) and uses \|w_ref\| (a negative command does not reverse the phase sequence); at w_ref = 0 it outputs a DC set of amplitude 10; THREE_PHASE_INVERTER ignores its Ron and Vf parameters; SVPWM 'Holtz 1992' over-modulation rule from the executor's memory - confirm in WP-15; factory `\|\|` fallbacks such as Ts \|\| 1e-4 not probed (XBV-019 covers them).
- **WP-07b:** BAND_LIMITED_NOISE untested (Simulink: output variance = PSD / Ts); the 'trapezoidal' PID method is named 'tustin' in ADIA (trapezoidal rejected with PARAMETER_OPTION_INVALID) - naming check against Simulink; KF covariance read from nextState (P not an output).
- **WP-08b:** From the WP-08 Opus verifier: six-step test cannot detect reversed torque or a 60-degree Hall advance (no Hall alignment oracle); AC motor ia+ib+ic = 0 is structural (ic = -ia - ib), so it is not evidence; field-weakening exact law needs a Simulink/MCB reference (WP-15).
- **WP-07b:** CURRENT_CONTROLLER_DQ iMax scaling rule is taken from a factory comment, not an oracle - confirm against MCB in WP-15.
- **WP-17b:** WP-17 parity ran on float64 (EMBEDDED_TARGET); the production state-machine profile refuses float64 (supportsFloat64 = false, smSemanticValidator.ts ~42) and generates float32 - repeat the per-block parity on float32 with float32 tolerances. clang had no sanitizer runtime (UBSan with -fsanitize-trap only); DiagExtract/ExtractDiag/Diag untested (no capability, XBV-006). Workarounds used only to keep comparing numbers when a strict compile fails (unconnected Clock for XBV-096, -Wno-unused-function for XBV-100); the compile failures are pinned separately. Eleven /tmp/xb-cparity-* directories from interrupted executor runs remain (deletion needs user permission).
- **WP-18b:** WP-18: the standalone runtime shares the simulator's interpreter code, so simulator vs runtime is a weak comparison (C is the independent execution). Scenario 6 (D9) fires at tick 4 in all three executions because Integrator publishes post-update in both the interpreter and C; revisit after D9 is decided. Scale numbers (50 states, Gain + UNIT_DELAY each): sm_core.c 352,399 bytes, all .c 388,720 bytes, sizeof(ADIA_Instance_t) 2,144 bytes. AUTOSAR verify ACCEPTED, 11/11 gates.
- **WP-09b:** FIS ignores orMethod and AND 'product' in rules; FUZZY_DEFUZZIFY ignores its 'resolution' parameter (characterization test); bisector of an all-zero aggregate returns range_min (MATLAB result unconfirmed); LMS 'w' outputs are the pre-update weights (Simulink DSP LMS Wts timing unverified); RL tie rule lowest index (undocumented); LMS/neuron divergence with large lr gives silent Inf/NaN; NEURAL_NEURON_LEARNING uses tanh with bipolar targets (docs should say so).
- **WP-10b:** Smoke-only coverage (no type name in a specific test): CFD_DEM_SURROGATE_LEARNER, ROBOT_VACUUM_3D_SCENE_VIEW, ROBOT_VACUUM_3D_VIZ_COLORS, ROBOT_VACUUM_BATTERY_HUD, ROBOT_VACUUM_BATTERY_MONITOR, ROBOT_VACUUM_CAPACITY_THRESHOLD, ROBOT_VACUUM_CLIFF_HALT, ROBOT_VACUUM_COLLISION_AVOID, ROBOT_VACUUM_COLLISION_MESH, ROBOT_VACUUM_CONTINUOUS_ENERGY, ROBOT_VACUUM_COVERAGE_HEATMAP, ROBOT_VACUUM_COVERAGE_PLANNER, ROBOT_VACUUM_DIRT_DENSITY, ROBOT_VACUUM_DOCK_BEACON, ROBOT_VACUUM_DOCK_DETECT, ROBOT_VACUUM_DOCK_ICON, ROBOT_VACUUM_DOOR_CROSSING, ROBOT_VACUUM_DOOR_TRACKER, ROBOT_VACUUM_DUSTBIN_HUD, ROBOT_VACUUM_ERODE_MASK, ROBOT_VACUUM_FURNITURE_MESH, ROBOT_VACUUM_GOAL_MANAGER, ROBOT_VACUUM_HALT_ALERT, ROBOT_VACUUM_MODE_SUPERVISOR, ROBOT_VACUUM_RESUME_SCHEDULER, ROBOT_VACUUM_ROOM_SCHEDULER, ROBOT_VACUUM_ROOM_SEGMENTATION, ROBOT_VACUUM_ROOM_ZONE_COLORS, ROBOT_VACUUM_SEMANTIC_MAP, ROBOT_VACUUM_SIDE_BRUSH, ROBOT_VACUUM_SUCTION_PWM, ROBOT_VACUUM_SURFACE_ADAPTER, ROBOT_VACUUM_TERRAIN_MODEL, ROBOT_VACUUM_TOPOLOGY_RETURN, ROBOT_VACUUM_VELOCITY_PID, ROBOT_VACUUM_VISUALIZATION. Not expressible: Hertz contact exposes only K (no E*, R*), gravity fixed in DEM (no KE-conservation test), SLAM/FUSION use truth inputs, pure pursuit has no lookahead parameter, cliff_threshold unused, MOTOR_COMMAND V_bat fixed at 12, rib collisions push particle centres 0.0011 m past R - r.
- **WP-20:** Not reachable in jsdom (WP-19): real drag-to-connect and reconnect, snap and edge styles, drop at pointer position, node overlap, light/dark theme, panel resize, run and edit during a run, save and reopen. Library search is by label only (no alias search exists). XbridgesWorkspace loops forever if initialMappings or availableVariables are omitted (unstable default arrays) - check in WP-20 whether any caller can omit them.
- **WP-22:** WP-20 environment: vite fails here without the xlsx package (cdn.sheetjs.com blocked); the e2e run used a dev server started from a scratchpad vite config aliasing xlsx to a stub (outside the repo). Playwright 1.65 expects chromium_headless_shell-1254 but 1243 is installed; tests/e2e/xbridges/xbHelpers.ts falls back to /opt/pw-browsers chromium only when the default build is absent. The older tests/e2e/xbridges-run-engine.spec.ts fails here ('Executable doesn't exist') and uses a toolbar 'X-Bridges' button that this build does not show. The e2e suite takes ~11 minutes. 11 labs exist; 9 run clean; the app has no create-subsystem-from-selection command (plan 6 assumed one).
