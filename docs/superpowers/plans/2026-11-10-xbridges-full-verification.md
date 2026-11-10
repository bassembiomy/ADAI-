# X-Bridges full verification plan (blocks, ports, equations, UI, simulation, solvers, C code, state machine)

Branch: `automative`. Baseline: `6b0b19d`. Status: plan only — no test or production code is changed by this commit.

## 0. User mandate
2026-11-10: "Make a full implementation plan for testing the X-Bridges module: its equations, ports, UI, simulation
and solvers, and every corner case in all the blocks, to make sure it works like Simulink in modelling and
simulation, and that code generation is correct and aligned with the state machine perfectly."

What this plan commits to:
- **Every block in `BLOCK_LIBRARY`** gets a contract, an equation oracle and a corner-case battery. No block is
  "covered" by being merely instantiated.
- **"Like Simulink" is measured, not claimed** (§2): each block is compared to a stated oracle with a stated
  tolerance, and each block ends with a per-gate verdict in a ledger.
- **One behaviour, four executions**: the canvas engine, the worker, the state-machine interpreter and the generated
  C must agree on the same model, step for step (§7).
- Tests are written first and are never weakened, skipped or deleted to get green. A failing test is a finding
  (§9), fixed in its own commit with the Simulink rule it follows.

## 1. Baseline (measured on `6b0b19d`, scripts in §8 WP-00 reproduce every number)

| Fact | Value |
| --- | --- |
| Block factories in `BLOCK_LIBRARY` (`src/engine/xbridges/BlockDefinitions.ts:916`) | 289 (45 are `PT_*`) |
| Blocks on the canvas palette (`XBRIDGES_CATEGORIES`, 30 categories) | 228 |
| Library blocks not on the palette (reachable from labs, files, agent, DOE, TRM) | 62 |
| Ports in the catalogue / ports with a unit | 1267 / 374 |
| Blocks with an `equation` text / without | 116 / 173 |
| Stateful blocks / with `evaluateDerivatives` / with `ZeroCrossingFn` / with `updateDiscrete` | 107 / 41 / 4 / 2 |
| Blocks with dynamic inputs / outputs | 14 / 1 |
| Entries in `XB_CAPABILITIES` / `codegen: true` | 288 / 100 |
| Blocks named in any test file / in an engine-level test / in no test at all | 213 / 141 / 76 |
| Palette blocks with no engine-level test | 100 |
| Solvers offered on the canvas | 9: `euler`, `ode2`, `ode3`, `rk4`, `ode5`, `ode23`, `ode45`, `ode14x`, `ode23tb` |
| Playwright specs that run an X-Bridges model | 1 (`tests/e2e/xbridges-run-engine.spec.ts`) |

Findings that shape the plan:
- **F1 Three independent implementations of block math.** Canvas: `BlockDefinitions.ts` `execute` /
  `evaluateDerivatives` driven by `XbridgesEngine` + `Solvers`/`AdaptiveSolver`/`StiffSolver`. State machine
  simulation: `src/utils/stateMachine/xbInterpreter.ts` (own block math, no import of `BLOCK_LIBRARY`). C:
  `xbCGenerator.ts`. Existing conformance pairs interpreter ↔ C (26 case ids each). **Nothing pairs the canvas
  engine with the interpreter**, so a block can simulate one way on the canvas and another way inside a state.
- **F2 The solver dispatch is written four times**: `XbridgesWorkspace.tsx:1932` (run loop), `:2742` (single
  step), `xbridgesWorker.ts:138`, `Solvers.ts:495`. Each must be proven to pick the same stepper.
- **F3 Canvas "adaptive" solvers are called with the fixed step** (`AdaptiveSolver.stepODE23/45(engine, t,
  fixedStep)`, `stepODE23TB(..., 1e-3, 1e-6)` with hard-coded tolerances). Whether error control is active on the
  canvas, and what the user's tolerance means, has no test.
- **F4 `SolverOptions.solver` admits `ode113`, `ode23s`, `ode15s`**, which no dispatcher implements
  (`UNSUPPORTED_SOLVER`). The contract must be pinned by a test.
- **F5 Only 4 blocks declare zero crossings** (`Step`, `PT_DISC_CLUTCH`, `PT_AUTOMATED_MANUAL_TRANSMISSION`,
  `PT_DUAL_CLUTCH_TRANSMISSION`). `SATURATION`, `DEADZONE`, `RELAY`, `SWITCH`, `Abs`, `RATE_LIMITER`, hit-style
  logic and PWM carriers do not; with variable-step solvers Simulink locates these events and X-Bridges will not.
- **F6 Palette entry with no factory**: `COSEC` is in both palettes (`BlockDefinitions.ts:11657`,
  `XbridgesLibrary.ts:316`) and in `XB_CAPABILITIES`, but `BLOCK_LIBRARY` has no `COSEC` key, so the drop is a silent
  no-op (`XbridgesWorkspace.tsx:2171`). `SUM_JUNCTION` likewise has a capability and no factory.
- **F7 Two palettes** (`BlockDefinitions.ts` for the canvas, `src/utils/xbridges/XbridgesLibrary.ts` for help and the
  AI catalogue) with no test that they list the same blocks.
- **F8 Connection checks are warnings only** (`XbridgesEngine.validateConnections`): type, unit, frame, data type,
  sample rate and dimension mismatches never stop a run. Simulink errors on dimension and data-type mismatch.
- **F9 `docs/XBRIDGES_EMBEDDED_CODEGEN.md` lists ~40 embedded-capable types; the registry has 100.** The document
  and the registry must be reconciled by a test, not by hand.
- **F10 The embedded path allows only `euler`/`rk4`, fixed step, no algebraic loops**
  (`XB_ALGEBRAIC_LOOP_UNSUPPORTED`), max vector 16, max matrix 8; the canvas allows more. Each limit needs a test
  on both sides of the boundary.
- **F11 No Simulink in this environment** (no MATLAB; `npm ci` is blocked by `cdn.sheetjs.com`, so suites run on
  the user's machine or CI). MATLAB R2024b is on the user's Windows machine (powertrain plan F11).

## 2. Definition of "works like Simulink": eight gates per block

A block is **verified** only when every applicable gate is `pass` in the ledger
(`docs/xbridges-verification/ledger.json`); a gate that does not apply is `n/a` with the reason.

| Gate | Claim | Automatic check |
| --- | --- | --- |
| **V1 Contract** | Ports (id, name, direction, order, type, unit, dimensions), parameters (name, default, type), state shape, flags (`isStateful`, `directFeedthrough`, dynamic I/O) match the committed contract snapshot | `xbContract.test.ts` |
| **V2 Equation** | Outputs equal an oracle computed independently of the block code (§3) over the stimulus set | `xbEquations.<family>.test.ts` |
| **V3 Corner cases** | The universal battery (§4.1) and the family battery (§4.2) pass | `xbCorners.<family>.test.ts` |
| **V4 Time behaviour** | Sample time, zero-order hold, initial condition, reset, enable, direct feedthrough and state update order follow the Simulink rule for that block class | `xbTiming.test.ts` |
| **V5 Solver behaviour** | For continuous blocks: correct order of convergence, tolerance obeyed, events located (§5) | `xbSolvers.*.test.ts` |
| **V6 Execution parity** | Canvas engine = worker = state-machine interpreter on the same model and step (§7) | `xbTriParity.test.ts` |
| **V7 Code parity** | For `codegen: true`: generated C99, compiled with `gcc -std=c99 -Wall -Wextra -Werror -pedantic`, equals the interpreter per step; for `codegen: false`: generation stops with `XB_BLOCK_NOT_CODEGEN_CAPABLE` and the stated reason | `xbCodeParity.test.ts` |
| **V8 UI** | The block can be dropped, wired, parameterised, saved, reopened and run from the canvas, and its symbol, handles and properties panel show the V1 contract | Playwright + component tests (§6) |

Plus a Simulink golden gate **G** where a Simulink counterpart exists (§3.3): `pass`, `pending` (goldens not yet
produced) or `n/a` (ADIA-only block: robot vacuum, DEM/CFD, fuzzy surface viewer, learning blocks).

Tolerances (same as the powertrain plan §4 so both ledgers read alike):
- algebraic outputs: rel 1e-12 / abs 1e-12 against closed form; rel 1e-9 against Simulink;
- continuous states, fixed step, same solver and `dt`: rel 1e-6 against Simulink, and the theoretical order against
  the analytic solution (§5);
- variable step at shared output times: rel 1e-3 with both sides at `RelTol` 1e-6;
- event time within one step (fixed) or `zeroTol` (variable); values after the event rel 1e-4;
- interpreter ↔ C: bit-exact for integer, fixed-point and boolean signals; ≤ 1 ULP of the target float type for
  float32/float64 elementary arithmetic; ≤ 4 ULP where `libm` is called;
- canvas ↔ interpreter: rel 1e-12 for the same solver and step.

## 3. Oracles (where the expected numbers come from)

A test never computes its expectation by calling the code under test.

1. **Closed form** — every static block (math, trig, logic, bitwise, routing, matrix, transforms, lookup,
   discontinuities): expectation written in the test from the definition, for scalars, vectors and matrices.
2. **Analytic dynamics** — integrators, transfer functions, state space, zero-pole-gain, filters, PID: step, ramp
   and sine responses from the closed-form solution (e.g. first order `1 − e^{−t/τ}`; second order under-, critically
   and over-damped; discrete blocks from the difference equation evaluated in exact rational arithmetic in the test).
3. **Simulink goldens** — `scripts/xbridges-verification/xb_goldens.m` (written here, run on the user's MATLAB
   through the existing Antigravity route): one harness per block built with `add_block`, the block's stimulus set,
   `ode4` fixed step and `ode45`, CSV + `params.json` committed under `tests/fixtures/xbridges/goldens/<type>/`.
   `xbSimulinkParity.test.ts` iterates only the goldens present; missing goldens are `G: pending` in the ledger,
   never a skipped test. A type ↔ Simulink library path map (`docs/xbridges-verification/simulink-map.json`) says
   which blocks have a counterpart and which parameter names correspond.
4. **Reference integrator** — for nonlinear continuous blocks without a closed form (motors, observers, powertrain):
   a test-local RK4 at `dt/64` with Richardson extrapolation, plus invariants (energy balance, conservation, steady
   state from the algebraic equations).
5. **Metamorphic properties** — where no number is known: linearity (`f(a·u) = a·f(u)` for linear blocks),
   superposition, time invariance (shifted stimulus → shifted response), commutativity/associativity of `Sum`/
   `PRODUCT`/logic, inverse pairs (`CLARKE`∘`INVERSE_CLARKE`, `PARK`∘`INVERSE_PARK`, `MUX`∘`DEMUX`,
   `MatrixMul`∘`MatrixSolve`, `sin`∘`asin` on the principal branch), vector result = element-wise scalar result,
   subsystem = same blocks flattened.

## 4. Corner-case matrix

### 4.1 Universal battery (generated for all 289 blocks from the contract; `xbCorners.universal.test.ts`)

| # | Case | Expected |
| --- | --- | --- |
| U1 | Default construction `BLOCK_LIBRARY[k](id, {})` | no throw; ids unique; every port has id, name, direction, type |
| U2 | `execute` with all inputs unconnected | defined outputs of the declared shape, no throw |
| U3 | Inputs `0`, `-0`, `±1`, `±Number.MAX_VALUE`, `Number.MIN_VALUE`, `±1e-300`, `±1e300` | finite result or a block `error`; never a silent `NaN` |
| U4 | Inputs `NaN`, `±Infinity` | propagates as IEEE or raises `NUMERICAL_INSTABILITY`; never turns into a plausible finite number |
| U5 | Wrong value kind (boolean, string, `null`, `undefined`, object, nested array) on each input | block `error` or documented coercion; no throw that kills the run |
| U6 | Scalar / vector `[n]` (n = 1, 2, 3, 16, 17) / matrix (1×1, 1×n, n×1, 8×8, 9×9) / empty `[]` / ragged matrix | per declared shapes: correct broadcast, or a dimension error |
| U7 | Every numeric parameter at 0, negative, fractional, huge, `NaN`, numeric string, MATLAB-style string (`[1 2;3 4]`) | valid where physical; otherwise block `error`; **no `||` default that turns a legitimate 0 into the default** |
| U8 | Every enum parameter: each declared value, wrong case, unknown value | each value changes behaviour as documented; unknown → error |
| U9 | Determinism: two fresh instances, same inputs, 1000 steps | identical outputs (seeded noise included) |
| U10 | Purity: `execute` must not mutate `inputs`, `params` or the incoming `state` | deep-equal before/after |
| U11 | State round trip: `nextState` survives `JSON` + `structuredClone` (worker snapshot, save/reopen) | resumed run = uninterrupted run |
| U12 | Reset: after `reset`, outputs equal a fresh instance at `t = start` | equal |
| U13 | Non-zero start time, `t` at `1e6` s, 10^6 consecutive steps | no drift in sample hits (integer tick scheduling), no growth in state size or memory |
| U14 | Declared flags are true: a block marked not direct-feedthrough has outputs independent of the current input; a block with `evaluateDerivatives` returns a derivative with the state's shape; `discreteStateKeys` are never integrated | property test |
| U15 | Dynamic I/O blocks: 1, 2, 16 ports; remove a connected port; reorder | outputs and port ids stay consistent |
| U16 | Label, id and parameter values with spaces, unicode, quotes, C keywords, 200 characters | run unaffected; C identifiers legal and unique (`smCIdentifierPolicy`) |

### 4.2 Family batteries (Simulink rules each family must reproduce)

| Family (palette category) | Blocks | Specific cases |
| --- | --- | --- |
| Sources | `Constant`, `Step`, `Clock`, `WaveformGen`, noise | step exactly at a sample hit, between hits, at `t0`, step time < `t0`; initial = final; vector step times; waveform phase, duty 0/100 %, frequency 0, Nyquist; `Clock` under each solver's minor steps; noise seed, sample time, statistics (mean, variance, whiteness) and bit-exact equality with C (`xbDeterministicNoise`) |
| Element-wise math, reductions | `Sum`, `GAIN`, `PRODUCT`, `Vector*`, `Abs`, `UnaryNeg`, `SumElements`, `Mean`, `Max` | sign strings (`+-+`, `|` spacers), one-input `Sum` as reduction, divide by 0 and 0/0, `0^0`, negative base with fractional power, gain as scalar/vector/matrix (element-wise vs matrix `K*u` vs `u*K`), integer overflow per data type (saturate vs wrap), empty reduction, `Max` ties and `NaN` handling |
| Linear algebra | `MatrixMul`, `Transpose`, `MatrixConcat`, `MatrixDiag`, `SubMatrix`, `MatrixSolve`, `Inverse`, `Determinant`, `IdentityMatrix` | non-conformable sizes, singular and near-singular (cond 1e12, 1e16), 1×1, non-square, index out of range, 0-based vs 1-based indices, row- vs column-major in C |
| Trigonometric / hyperbolic (24) | `SIN` … `ACOSECH` | degrees vs radians, exact values at multiples of π/6, poles (`tan π/2`, `cot 0`, `sec π/2`), domain edges (`asin ±1`, `acos` outside [−1, 1], `acosh < 1`, `atanh ±1`), odd/even symmetry, large arguments (1e8 rad), `libm` parity in C |
| Continuous | `Integrator`, `INTEGRATOR_CONTINUOUS`, `INTEGRATOR`, `DERIVATIVE`, `TRANSFER_FUNCTION`, `STATE_SPACE`, `ZERO_POLE_GAIN`, `LAPLACE_TRANSFORM`, filters | initial condition scalar/vector; limits and anti-windup; external reset (rising, falling, either, level) and state port; improper and non-proper transfer functions (must error); leading zeros in numerator/denominator; denominator `[0 …]`; pole-zero cancellation; repeated and complex poles; unstable plant; `D ≠ 0` direct feedthrough inside a loop; MIMO state space with dimension errors; derivative of a step (Simulink linear-extrapolation rule), filtered derivative |
| Discrete & delay | `UNIT_DELAY`, `MEMORY`, `DELAY`, `INTEGRATOR_DISCRETE`, `DISCRETE_TRANSFER_FUNCTION`, `MOVING_AVERAGE` | initial condition; delay length 0, 1, N, non-integer, negative; sample time inherited (−1), 0, equal to the step, non-multiple of the step (must be rejected as Simulink does for fixed step), offset; forward Euler / backward Euler / trapezoidal forms; `MEMORY` on minor steps; rate transition between two discrete rates and between continuous and discrete; multirate hit ordering at coincident hits |
| Discontinuities | `SATURATION`, `DEADZONE`, `RATE_LIMITER`, `RELAY` | upper < lower (error), equal limits, input exactly on a limit, vector limits, rate limiter first step and negative slew, relay hysteresis with switch-on = switch-off and with chattering input; event location with variable step (F5) |
| Lookup tables | `LOOKUP_1D/2D/ND`, `PRELOOKUP`, `INTERP_PRELOOKUP` | on a breakpoint, between, below first, above last; linear / flat / nearest / clip / linear extrapolation; non-monotonic and repeated breakpoints (error), single-point table, size mismatch, `NaN` in the table; index search parity (binary vs linear, last-interval rule at the top breakpoint) |
| Buses | `BUS_CREATOR`, `BUS_SELECTOR` | nested buses, duplicate element names, missing element, mixed shapes, bus through a delay, bus into a scope, bus across a subsystem boundary |
| Control | `PID_BASIC`, `PID_CONTROLLER`, `KALMAN_FILTER`, `MPC_CONTROLLER`, `STATE_SPACE`, root locus | P/PI/PD/PID forms, parallel vs ideal, `Kd` filter `N`, output saturation with clamping and back-calculation anti-windup, bumpless reset, `Ki = 0`, discrete form selection; Kalman with singular `R`, non-observable pair, covariance symmetry and positive-definiteness over 10^5 steps; MPC infeasible and horizon 1; root-locus roots vs `roots()` |
| Power electronics, PWM, motor control, torque optimisation | bridges, `PWM_GENERATOR`, `THREE_PHASE_PWM`, `SVPWM_*`, `SIX_STEP_COMMUTATION`, Clarke/Park, `AC_INDUCTION_MOTOR`, `IM_*`, `MTPA_*`, `FIELD_WEAKENING`, observers | modulation index 0, 1, over-modulation; carrier edge exactly on a sample; dead time; sector boundaries (every 60°) and duty sums; amplitude- vs power-invariant transform scaling and angle convention (pinned against Simulink Motor Control Blockset); zero speed, reversal, locked rotor, zero DC link; flux weakening entry/exit; observer convergence and zero-speed behaviour; power balance `P_elec = P_mech + losses` |
| Signal processing & observers | filters, estimators | cut-off 0, at Nyquist, above Nyquist; DC gain and −3 dB point; window length 1; group delay |
| Routing & control flow | `SWITCH`, `MUX`, `DEMUX`, `IF_ELSE`, `SWITCH_CASE`, `TERMINATOR`, `Inport`, `Outport`, `Subsystem` | threshold equality (`>=` vs `>` vs `~= 0`), control exactly at threshold, mixed widths, demux split vectors, unmatched case/default, nested subsystems 5 deep, same block ids in two subsystems, unconnected subsystem ports, port reorder |
| Logic, bitwise, sequential | gates, shifts, flip-flops, `Register`, `Counter` | non-boolean inputs (non-zero is true), n-ary gates, single-input `XOR`; shift by 0, word length, more than word length, negative; signed vs unsigned shift; bit width 1 and 32, overflow; counter wrap, up/down, reset priority; flip-flop edge exactly on a sample, set and reset together, initial `Q` |
| Sinks | `Scope` | scalar, vector, matrix, bus; decimation; 10^6 points; `NaN` gaps; multiple scopes; scope inside a subsystem |
| Fuzzy | MF blocks, rules, FIS, defuzzification, fuzzy PID | membership at vertices and outside support, degenerate shapes (`a = b`), no rule fired, all rules fired, each defuzzification against hand calculation, surface viewer without configuration (`MISSING_FIS_CONFIG`) |
| Learning, optimisation, DOE | LMS/NLMS, neuron, Q-learning, `DOE_*`, `MPC` | step size 0, divergence bound, seed determinism, convergence to the known optimum, DOE equation parsing with missing factors |
| Navigation, robot vacuum, DEM/CFD (ADIA-only) | 60+ blocks, 36 with no test today | U1–U16, physical invariants (bounded pose, energy non-increasing without input, mass conservation, particle count), closed-loop lab runs stay finite for 60 s |
| Powertrain (`PT_*`, 45) | existing `powertrain/` suites | this plan does not duplicate the powertrain G1–G5 gates; it adds U1–U16, V6 and V8 for them and records the powertrain ledger verdict |

## 5. Solver and engine verification

### 5.1 Solvers (`xbSolvers.order.test.ts`, `xbSolvers.adaptive.test.ts`, `xbSolvers.stiff.test.ts`)
- **Order of convergence** for each fixed-step method on `ẋ = −x`, a harmonic oscillator, a nonlinear logistic
  problem and a time-dependent forcing `ẋ = cos t`: halve `dt` five times; the observed order must be 1 (`euler`),
  2 (`ode2`), 3 (`ode3`), 4 (`rk4`), 5 (`ode5`) within ±0.15; `ode14x` order equals its extrapolation order.
- **Butcher tableau check**: one step on `ẋ = f(t)` polynomials of degree p integrates exactly up to the method's
  order and not above — catches a wrong coefficient that an order test on one problem can hide.
- **Adaptive (`ode23`, `ode45`)**: global error scales with `RelTol`; `AbsTol` governs near zero; `maxStep` and
  `minStep` are honoured; step rejected and retried; `outputTimes` hit exactly; stop time hit exactly (no overshoot,
  no missing last sample); stiff-detection diagnostic fires on a stiff problem; canvas per-step entry point (F3)
  either controls error or the UI says "fixed step" — the test pins which.
- **Stiff (`ode14x`, `ode23tb`)**: Van der Pol μ = 1000, Robertson kinetics, a linear system with eigenvalues
  −1 and −1e6: stable at steps where explicit methods blow up; Newton failure → diagnostic, not `NaN`.
- **Contract**: every name in `SolverOptions.solver` either runs or returns `UNSUPPORTED_SOLVER` (F4); the four
  dispatchers (F2) select the same stepper for every name — one table-driven test imports all four paths.
- **Edge inputs**: `dt = 0`, negative, `NaN`, larger than the stop time, `stop < start`, `stop = start`,
  10^7 steps, start time ≠ 0, time accumulation error (`t_n` must equal `t0 + n·dt` computed by multiplication, not
  repeated addition, to 1 ULP).

### 5.2 Engine semantics (`xbEngine.*.test.ts`)
- **Execution order**: sorted order is a valid topological order for every model in the corpus (§7.3); changing
  node insertion order or ids never changes results; non-direct-feedthrough blocks break loops; outputs of stateful
  blocks are read before their update (Simulink output/update split) — checked on a two-delay swap ring.
- **Algebraic loops**: scalar and vector loops, a loop through a subsystem, two coupled loops, a loop with no
  solution, a loop with two solutions (starts from the previous value), a discontinuous loop; Gauss-Seidel →
  Newton hand-over; `ALGEBRAIC_LOOP` warning and `ALGEBRAIC_LOOP_NOT_CONVERGED` error; `algTol`/`algMaxPasses`/
  `maxIter` honoured; result equals the analytic fixed point.
- **Sample times and multirate**: ZOH between hits; hits by integer tick; two rates with a non-integer ratio;
  discrete block inside a variable-step run (solver must land on every hit); hybrid `updateDiscrete` called exactly
  once per major step and never on minor steps (extends `hybridUpdate.test.ts`).
- **Zero crossings**: event bracketed to `zeroTol`; two events in one step; an event at `t0` and at the stop time;
  touching zero without crossing; chattering (Zeno) terminates with a diagnostic; state is consistent after the
  event. F5 blocks are tested for the Simulink behaviour and recorded as findings where they miss it.
- **Subsystems**: flattened result = hand-flattened model; nested; an empty subsystem; unconnected ports; engine
  flatten (`XbridgesEngine.flatten`) = state-machine flatten (`xbSubsystemFlattener`).
- **Diagnostics**: every `ModelDiagnostic.code` the engine can emit has a test that provokes it and one that proves
  a clean model does not: `SIGNAL_TYPE_MISMATCH`, `UNIT_INCONSISTENCY`, `FRAME_INCONSISTENCY`, `DATA_TYPE_MISMATCH`,
  `SAMPLE_RATE_MISMATCH`, `DIMENSION_MISMATCH`, `MISSING_FIS_CONFIG`, `ALGEBRAIC_LOOP`,
  `ALGEBRAIC_LOOP_NOT_CONVERGED`, `NUMERICAL_INSTABILITY`, `BLOCK_RUNTIME_FAULT`, `UNSUPPORTED_SOLVER`. F8
  (warning vs Simulink error) is decided with the user (§10) and then pinned.
- **Malformed models**: dangling edge, edge to a missing port, two drivers on one input, self-loop on a
  direct-feedthrough block, duplicate block ids, unknown block type, legacy edge keys (`source`/`targetHandle`),
  0 blocks, 10 000 blocks (time and memory budget).
- **Worker**: `step`, `batch`, `compile`, `cancel`, `reset` (`xbridgesWorkerProtocol.ts`): worker result = main
  thread result bit for bit; cancel mid-batch leaves a resumable snapshot; a block exception is reported and the
  worker stays alive; snapshot of every stateful block round-trips (U11).

## 6. UI verification

Component tests (vitest + Testing Library, `src/components/xbridges/*.test.tsx`) and Playwright
(`tests/e2e/xbridges/*.spec.ts`, `--trace off`).

| Area | Checks |
| --- | --- |
| Palette | every palette entry has a factory (F6) and drops a node; both palettes list the same types (F7); search finds each block by label and alias; category expand/collapse persists; 62 library-only blocks are listed in the ledger with where they are reachable from |
| Node (`XBlockNode.tsx`) | **parametrised over all 228 palette blocks**: one handle per port in contract order and position, port labels, symbol rendered (Lucide or `PtSymbol`), no overlap at default size, light and dark theme (`npm run lint:theme`); dynamic-port blocks add/remove handles and keep edges attached |
| Wiring | output→input only; one driver per input; fan-out; reconnect; delete node removes its edges; type/unit/dimension mismatch shows the engine diagnostic on the edge; edge styles (orthogonal, bezier, straight); snap; right-drag copy; copy/paste/duplicate keep parameters and get new ids; undo/redo over every edit type |
| Properties panel (`XbridgesPropertiesPanel.tsx`) | **parametrised over all blocks**: every contract parameter has an editor of the right kind; edits reach `params` with the right type (0, negatives and fractions are accepted — extends `xbridgesWorkspaceInputs.test.tsx`); invalid text shows an error and does not corrupt the model; matrix/vector entry in MATLAB style; enum popups rebuild ports for variant blocks; edit during a run uses `patchBlockParams` and takes effect at the next step |
| Simulation controls | Run, Pause, Resume, Stop, Single Step, stop-time limit, step-size input (0, negative, text), each of the 9 solvers selectable and actually used (spy on the stepper), solver change mid-run, diagnostics panel lists compile and runtime diagnostics and selects the offending block, run with errors is refused with a message |
| Scope (`XbridgesScopeWindow.tsx`), root locus | plotted samples = engine samples (value and time) for scalar, vector, matrix, bus; autoscale, zoom, cursors, legend, export; open/close during a run; many scopes; root-locus window roots = engine roots |
| Subsystems | create from selection, enter, breadcrumb back, rename ports, nested, delete; results unchanged by grouping |
| Persistence | save → close → reopen in the unmodified app: nodes, edges, parameters, solver, step, subsystems and state-machine mappings identical; `.adia` round trip; old-format files load (`legacy edge keys`); Save & Exit inside a state returns mappings (`reconcileXBBoundaryMappings`) |
| Labs | every built-in lab loads, compiles with no error diagnostic and runs 5 s without console errors (generalises `xbridges-run-engine.spec.ts`) |
| Responsiveness | 500-block model: drag stays under the freeze-gate budget (`tests/performance/no-renderer-blocking.spec.ts`), run does not block the renderer |
| Accessibility | keyboard: delete, copy, paste, undo, run/stop shortcuts; focus order in the properties panel; contrast in both themes |

## 7. Code generation and state-machine alignment

### 7.1 Per-block code parity (V7)
- Generator: for each `codegen: true` type × each declared shape (`shapes`, `inputShapes`, `outputShapes`) × each
  numeric type (`boolean`, `int8/16/32`, `uint8/16/32`, fixed-point with every rounding and overflow policy,
  `float32`) build the smallest model `Inport → block → Outport`, drive it with the §4 stimulus set for 1000 ticks,
  run `xbInterpreter`, generate C, compile, run, compare per tick (§2 tolerances).
- The registry is closed by tests: every `codegen: true` type has ≥ 1 paired case that actually executes (no id in
  `XB_C_CONFORMANCE_CASE_IDS` without a running case); every `codegen: false` type has a `reason` and stops
  generation; every library type has a capability entry; every capability entry has a factory (F6); the capability
  table in `docs/XBRIDGES_EMBEDDED_CODEGEN.md` is generated from the registry and diffed (F9).
- Compile matrix: `gcc` and `clang`, `-O0` and `-O2`, `-std=c99 -Wall -Wextra -Werror -pedantic -Wconversion
  -Wdouble-promotion -Wshadow`; `-fsanitize=undefined,address` run; float32 target with and without FMA
  (`-ffp-contract=off`); the existing target-compile runner for the bundled ARM toolchain where present.
- Static properties of the generated C: no dynamic allocation, no recursion, no variable-length arrays, bounded
  loops, no unused state, every state slot initialised in `SM_Reset()`, identifiers legal and unique (U16),
  deterministic output (generate twice → identical bytes), `src/security/generatedCodeVerifier.cjs` passes.
- Limits on both sides (F10): vector 16 / 17, matrix 8 / 9, `MatrixSolve` bound 1…8, `PID_BASIC` without a positive
  sample time, continuous `STATE_SPACE`, variable-step solver, algebraic loop, float64/float16 on the production
  profile, missing math library → the exact diagnostic code, never truncated or silently changed code.

### 7.2 Alignment with the state machine (`xbStateMachineAlignment.test.ts`, extends `smDifferential.test.ts`)
One scenario corpus, three executions (state-machine simulator, standalone runtime, compiled C), compared per tick
on state configuration, every mapped variable and every X-Bridges state slot:
- **Ordering in a tick**: input mapping read → X-Bridges step → output mapping written → guards evaluated →
  transition → entry/exit actions; a guard that reads an X-Bridges output in the same tick sees the same value in
  all three executions.
- **Lifecycle**: entry initialises, `reset` vs `retain` memory policy, exit and re-entry, self-transition, internal
  transition, shallow and deep history with each policy, `SM_Reset()`, X-Bridges in a parent state while a child is
  active, X-Bridges in two orthogonal regions, in a nested composite, in a state entered and left in the same tick.
- **Timing**: base tick vs solver step (substep count), step that does not divide the tick (rejected), discrete
  sample time as a multiple of the step, first hit on entry, hit counters across exit/re-entry under both policies,
  `after(n)` and X-Bridges time in the same state, tick counter wrap.
- **Boundary mappings** (`xbBoundaryMappings.ts`): scalar, vector and matrix variables; type conversion at the
  boundary; unmapped Inport/Outport; two mappings to one port; mapping to a deleted variable or block; rename;
  input and output mapped to the same variable (the `x → x + 1` case of the embedded guide).
- **Numeric fault policy**: `signal-only` vs `escalate` on divide by zero, overflow with `error` policy, `NaN`.
- **Events**: an X-Bridges output crossing a guard threshold fires the transition in the same tick in all three.
- **Scale**: 50 states each owning an X-Bridges model; generated code size and static RAM reported and budgeted.
- **AUTOSAR path**: the same corpus through `npm run verify:autosar` — runnable step equals the plain C step.

### 7.3 Canvas ↔ state-machine parity (V6, closes F1)
- `xbTriParity.test.ts`: for every block type both paths support, the same graph, solver (`euler`, `rk4`) and step
  run in `XbridgesEngine` (main thread and worker) and in `xbInterpreter`; outputs equal per step. Differences are
  findings: either one implementation is wrong against the §3 oracle, or the difference is intended and is written
  into the block's help.
- **Model corpus** shared by §5.2, §7.1, §7.2 and §7.3 (`tests/fixtures/xbridges/models/`): the built-in labs, the
  AI benchmark corpus (`generalXbridgesCorpus.ts`), hand-written reference loops (PI speed loop, FOC current loop,
  buck converter average model, cruise control), and seeded random graphs from a generator that respects port
  shapes (200 graphs per run, failing seed printed and saved as a regression fixture).

## 8. Work packages

Loop as in the powertrain plan: the planner (main session) writes the acceptance tests and reviews; an executor
subagent implements harnesses and fixes; MATLAB work goes to the user's machine. One WP per commit. Exec: P =
planner, E = executor, M = MATLAB on the user's machine.

| WP | Scope | Exec | Deps |
| --- | --- | --- | --- |
| 00 | Setup: ledger `docs/xbridges-verification/ledger.json` (one row per block, gates V1–V8 + G), `scripts/xbridges-verification/inventory.ts` (reproduces §1), baseline run of every existing X-Bridges suite on the user's machine, `npm run test:xbridges` script, loop skill and executor agent files | P | — |
| 01 | V1 contract snapshot for 289 blocks + catalogue closure tests (F6, F7, capability closure, every block has `equation` and help entry, every port has a unit or an explicit `unitless`) | P + E | 00 |
| 02 | Test kit `src/engine/xbridges/testkit/`: model builder, stimulus sets, oracle helpers, reference integrator, tolerance comparators, random graph generator, C compile-and-run helper reused from `smCHarness` | E | 00 |
| 03 | Universal battery U1–U16 over all blocks | P + E | 01, 02 |
| 04 | V2/V3: sources, element-wise math, reductions, trig/hyperbolic (≈ 45 blocks) | P + E | 03 |
| 05 | V2/V3: linear algebra, routing, logic, bitwise, sequential, sinks (≈ 45) | P + E | 03 |
| 06 | V2/V3/V4: continuous, discrete & delay, discontinuities, lookup, buses (≈ 35) | P + E | 03 |
| 07 | V2/V3/V4: control, signal processing & observers, optimisation & modelling (≈ 25) | P + E | 06 |
| 08 | V2/V3: power electronics, PWM, motor control, torque optimisation (≈ 30) | P + E | 06 |
| 09 | V2/V3: fuzzy (12), learning (27) | P + E | 03 |
| 10 | V2/V3: navigation, robot vacuum, DEM/CFD (≈ 65, invariants and closed-loop runs) | P + E | 03 |
| 11 | Powertrain: U1–U16, V6, V8 for the 45 `PT_*` blocks; import powertrain ledger verdicts | P + E | 03 |
| 12 | Solvers §5.1 | P + E | 02 |
| 13 | Engine semantics §5.2 (order, loops, multirate, zero crossings, subsystems, diagnostics, malformed models) | P + E | 02 |
| 14 | Worker parity and protocol §5.2 | P + E | 13 |
| 15 | Simulink goldens: `simulink-map.json`, `xb_goldens.m`, `xbSimulinkParity.test.ts`; goldens for every mapped block | P + M | 04–08 |
| 16 | V6 canvas ↔ interpreter parity + model corpus §7.3 | P + E | 04–08, 13 |
| 17 | V7 per-block code parity, registry closure, compile matrix, static properties, limits §7.1 | P + E | 16 |
| 18 | State-machine alignment §7.2 (incl. AUTOSAR path) | P + E | 17 |
| 19 | UI component tests §6 (palette, node, wiring, properties panel — parametrised over all blocks) | P + E | 01 |
| 20 | UI end-to-end §6 (controls, scope, subsystems, persistence, labs, responsiveness, accessibility) | P + E | 19 |
| 21 | Fix loop for every finding (§9), one commit per finding, each with its failing test first | E, P reviews | as found |
| 22 | CI workflow `.github/workflows/xbridges-verification.yml` (vitest suites, C compile matrix, Playwright), nightly random-graph run with seed rotation, mutation run on `BlockDefinitions.ts`, `Solvers.ts`, `xbInterpreter.ts`, `xbCGenerator.ts` | E | 03–20 |
| 23 | Close-out: generated report `docs/xbridges-verification/report.md` (per block × gate, findings fixed/open, mutation score, coverage), help updated with every documented difference from Simulink | P | 21, 22 |

Order of execution: 00 → 01, 02 → 03 → (04–11, 12, 13, 19 in parallel) → 14, 15, 16 → 17 → 18, 20 → 22 → 23, with
21 running alongside from the first finding.

## 9. Findings and fixes
- Every failing acceptance test becomes a finding `XBV-nnn` in the ledger: block, gate, expected (oracle and
  source), actual, severity (S1 wrong number in simulation or C / S2 crash or silent no-op / S3 diagnostic or UI /
  S4 documentation).
- The failing test is committed first, marked as an expected failure tied to the finding id (`it.fails`, which turns
  red as soon as the defect is fixed — never `skip`). The fix commit removes the marker and nothing else in the test.
- A fix follows the Simulink rule cited in the finding; if ADIA deliberately differs, the difference is written
  into the block's help and the test pins the ADIA behaviour, with the user's decision recorded.
- Engine or generator changes outside the block under fix need the planner's review of every hunk and a re-run of
  V6 and V7 for the whole catalogue.
- F1–F10 are entered as the first findings in WP-00.

## 10. Exit criteria
1. Ledger: every one of the 289 blocks has every applicable gate `pass`; no gate is empty.
2. No open S1 or S2 finding; S3/S4 open only with the user's written acceptance.
3. Simulink gate **G**: `pass` for every block with a Simulink counterpart, or `pending` only for blocks whose
   goldens the user has not yet run (listed in the report).
4. Statement and branch coverage ≥ 95 % on `src/engine/xbridges/*.ts` (non-powertrain), `xbInterpreter.ts`,
   `xbCGenerator.ts`, `xbSemanticBuilder.ts`, `xbSemanticValidator.ts`; mutation score ≥ 80 % on the four files of
   WP-22; uncovered lines listed with a reason.
5. Generated C: zero warnings under the §7.1 flags on `gcc` and `clang`, clean under UBSan/ASan, on the whole
   corpus.
6. 1000 random graphs × 3 executions with no divergence.
7. `tsc --noEmit`, `npm run lint:theme`, `npm run test:workers`, `npm run test:sm:verification`,
   `npm run verify:sm:codegen`, `npm run verify:autosar` and the powertrain suites still green.
8. The app is run unmodified: every lab runs, one model per palette category is built by hand on the canvas, saved,
   reopened and generated to C.

## 11. Suites
- `npm run test:xbridges` (added in WP-00): `vitest run src/engine/xbridges src/components/xbridges
  src/services/xbridgesWorkerClient.test.ts src/utils/stateMachine/xb*.test.ts --reporter=dot`
- Code and state machine: `npm run test:sm:verification && npm run verify:sm:codegen && npm run verify:autosar`
- UI: `npx playwright test tests/e2e/xbridges --project=chromium --trace off`
- Never the whole `src/utils` directory in one run (a state-machine test creates and deletes build folders).

## 12. Decisions needed from the user
1. **F8**: should dimension and data-type mismatches on a connection stop the run (Simulink) or stay warnings?
2. **F5**: add zero-crossing detection to `SATURATION`, `DEADZONE`, `RELAY`, `SWITCH`, `Abs`, PWM carriers (Simulink
   behaviour with variable-step solvers), or document X-Bridges as sample-accurate only for those blocks?
3. **F3/F4**: should `ode23`/`ode45`/`ode23tb` control error on the canvas with user tolerances, and should
   `ode113`/`ode15s`/`ode23s` be implemented or removed from `SolverOptions`?
4. **Simulink goldens**: confirm MATLAB R2024b with Simulink, Control System, DSP System, Motor Control Blockset
   and Fuzzy Logic Toolbox is available for WP-15; blocks whose toolbox is missing stay on oracles 1, 2, 4 and 5.
5. **ADIA-only blocks** (robot vacuum, DEM/CFD, learning; ≈ 90): verified by invariants and closed-loop runs only —
   confirm that is the intended bar, since no Simulink reference exists for them.
