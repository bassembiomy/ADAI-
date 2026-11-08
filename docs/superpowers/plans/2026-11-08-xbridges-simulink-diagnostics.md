# X-Bridges: Simulink-equivalent diagnostics and s/z-domain constraints

Planner/tester: Opus. Executor: Sonnet. Acceptance tests: `src/engine/xbridges/simulinkDiagnostics.test.ts`.

## Goal

Every model, parameter, math and logic error that Simulink reports for the block families X-Bridges has
(sources, math, logic, continuous `s`, discrete `z`, discontinuities, PID, state space) is reported by
X-Bridges before or during simulation, and a single model can mix continuous (s-domain) and discrete
(z-domain) blocks with Simulink's semantics. Diagnostics go through `XbridgesEngine.diagnostics`, which the
workspace already shows in the Diagnostics panel; any `error` from `compile()` stops the run.

The codes are X-Bridges codes. The column "Simulink equivalent" names the Simulink diagnostic or rule
they follow; message text is ours, not copied from MathWorks.

## Baseline findings (before this work)

| Finding | Effect |
|---|---|
| `PRODUCT` divide replaces a zero divisor by 1 (`Number(val) \|\| 1`) | 4/0 returns 4, no warning |
| `PRODUCT` divide starts the reduce from `ins[0]` and divides by `ins[0]` again | 3/4 returns 0.25 |
| `INTEGRATOR_DISCRETE` stores `sample_time`, the scheduler reads `sampleTime` | integrates every solver step, not at Ts; a z→s staircase is lost |
| `TRANSFER_FUNCTION` / `DISCRETE_TRANSFER_FUNCTION` use `den[0] \|\| 1` | a zero leading coefficient is silently replaced |
| No proper/causal check on transfer functions | improper TF silently simulated |
| No limit-order checks (Saturation, Dead Zone, PID, Rate Limiter) | inverted limits silently simulated |
| No sample-time validation in the simulation engine | negative/NaN Ts accepted |
| `ode113`, `ode23s`, `ode15s` in the type but rejected; no discrete solver | a pure z-domain model cannot be declared as such |
| Compile errors do not stop `Solvers.runFixedStep` | simulation runs on an invalid model |

## Diagnostic catalog

### A. Connectivity (compile)
| Code | Severity | Simulink equivalent | Rule |
|---|---|---|---|
| `UNCONNECTED_INPUT_PORT` | warning | Unconnected block input ports | data input port with no line; ports of type `control` (Enable/Reset with defaults) are exempt |
| `UNCONNECTED_OUTPUT_PORT` | warning | Unconnected block output ports | output with no line; ports of type `measurement` are exempt |

### B. Sample time and solver (compile)
| Code | Severity | Simulink equivalent | Rule |
|---|---|---|---|
| `INVALID_SAMPLE_TIME` | error | Invalid sample time | `sampleTime`/`sample_time` must be -1 (inherited), 0 (continuous) or finite > 0 |
| `DISCRETE_BLOCK_CONTINUOUS_SAMPLE_TIME` | error | discrete block with continuous sample time | discrete-only blocks (`DISCRETE_TRANSFER_FUNCTION`, `INTEGRATOR_DISCRETE`, `UNIT_DELAY`, `DISCRETE_IMPULSE`, ...) cannot have Ts = 0 |
| `SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP` | error | fixed-step size is not a factor of a discrete sample time | fixed-step solvers: every Ts > 0 is an integer multiple of `fixedStep` (relative tolerance 1e-9) |
| `CONTINUOUS_STATES_WITH_DISCRETE_SOLVER` | error | discrete solver with continuous states | new solver `'discrete'` (fixed-step, no continuous states) |
| `RATE_TRANSITION_REQUIRED` | warning | multi-rate data transfer without Rate Transition | discrete Ts1 feeding discrete Ts2 ≠ Ts1 directly |

`compile()` reads `engine.options` when set; `Solvers.runFixedStep` sets it first and returns without
simulating when `compile()` reports any `error`.

### C. Parameter constraints (compile)
| Code | Severity | Simulink equivalent | Rule |
|---|---|---|---|
| `TF_DENOMINATOR_LEADING_ZERO` | error | leading denominator coefficient must be non-zero | TF and discrete TF |
| `TF_IMPROPER` | error | transfer function must be proper / causal | numerator order ≤ denominator order (TF, discrete TF); #zeros ≤ #poles (ZPK) |
| `PARAMETER_NOT_FINITE` | error | parameter is NaN/Inf | TF/ZPK coefficients, gains, limits |
| `LIMITS_INVALID` | error | lower limit must be ≤ upper limit | Saturation, Dead Zone (start ≤ end), PID min ≤ max, Rate Limiter rising ≥ falling |
| `PID_FILTER_COEFFICIENT_INVALID` | error | filter coefficient N must be > 0 | PID with a derivative term |
| `DELAY_LENGTH_INVALID` | error | delay length must be a positive integer | `DELAY` |
| `STATE_SPACE_DIMENSION_MISMATCH` | error | A, B, C, D dimensions inconsistent | A n×n, B n×m, C p×n, D p×m |

### D. Runtime math and logic (once per block per run)
| Code | Severity | Simulink equivalent | Rule |
|---|---|---|---|
| `DIVIDE_BY_ZERO` | warning | division by zero | Product divide / VectorDiv: IEEE result (±Inf/NaN), not a replaced divisor |
| `MATH_DOMAIN_ERROR` | warning | function input outside domain | ASIN/ACOS \|u\|>1, ACOSH u<1, ATANH \|u\|>1, ASEC/ACOSEC \|u\|<1, ACOTH \|u\|<1, ASECH u∉(0,1] |
| `LOGIC_NAN_INPUT` | error | NaN cannot be converted to logical | AND, OR, NOT, NAND, NOR, XOR |

### E. s/z integration in one model
Discrete blocks update only at sample hits k·Ts, hold their output between hits (zero-order hold) and sample
continuous signals at the hit. Tests lock: 1/s, 1/(s+1), Ts/(z−1), 0.1/(z−0.9), z→s (staircase integral
0.45) and s→z (unit delay of a ramp).

## Out of scope (reported, not implemented)
Zero-crossing detection diagnostics, multitasking execution, minimum step size violation for variable-step
solvers, fixed-point parameter precision loss on blocks other than Constant, and the solvers `ode113`,
`ode23s`, `ode15s` (still rejected with `UNSUPPORTED_SOLVER`).
