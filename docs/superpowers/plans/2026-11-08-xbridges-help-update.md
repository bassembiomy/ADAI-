# X-Bridges help update

Planner/tester: Opus. Executor: Sonnet. Acceptance tests: `src/help/xbridgesHelp.test.ts` and the existing
`src/help/helpCoverage.test.ts` (live UI evidence), plus the rest of `src/help`.

## Why

The last rounds changed X-Bridges substantially (Constant output data type, 37 simulation diagnostics, discrete
solver, start/stop/fixed step, saved solver settings, block fixes R1–R9, embedded discrete solver and control-port
defaults). Help has no X-Bridges diagnostic reference at all, no solver/timing chapter, generated toolbar topics that
still describe "Unlimited"/time-step fields, block texts that do not mention the new behaviour and errors, a stale
code-generation guide, and out-of-date live-UI coverage evidence.

## Work packages

### WP1 — diagnostic guidance (`src/help/diagnosticGuidance.ts`)
`XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE` and `XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE`: exactly one entry per code the
implementation emits (the test extracts them from source). Each entry: `Error: ` / `Warning: ` / `Info: ` as the
source uses it, what it means, the Simulink rule it follows where there is one, and how to fix it. Read the emitting
code for every entry; do not guess. Severity must match the source.

### WP2 — chapters (`src/help/moduleTopics.ts` `ADDITIONAL_HELP_TOPICS`, category X-Bridges)
- `xbridges-simulation` — sections `solvers` (every option of the workspace solver selector: what it is, fixed or
  variable step, stiff or not, when to use it), `timing` (Start Time default 0, Stop Time default 10 and `inf`,
  Fixed Step `auto`: greatest common divisor of the discrete sample times, else (stop − start)/50, 0.2 for `inf`;
  batch runs need a finite stop time; Fixed Step locked to the chart Tick inside a state machine), `discrete-solver`,
  `sample-times` (hits at n·Ts, zero-order hold between hits and during solver stages, continuous signals sampled at
  hits, Rate Transition warning, mixing s- and z-domain blocks), `saving` (what is saved and restored; Euler, RK4 and
  Discrete reach code generation; other solvers are reported), `errors` (`diagnosticReference` of WP1 simulation
  guidance).
- `xbridges-code-generation` — sections `solver-kinds`, `data-types` (Constant "Output data type", range checks),
  `control-ports` (unconnected PID Enable/Reset use defaults; data inputs must be driven), `discrete-integrator`
  (forward/backward Euler and Tustin difference equations, direct feedthrough, algebraic loops), `errors`.
- Every section: body > 80 characters and `sources` that exist. Add both to `xbridges-ref` `related`, and update the
  `xbridges-ref` steps text (`src/help/referenceTopics.ts`) to mention the solver pane and Diagnostics.

### WP3 — block help (`src/help/blockGuidance.ts`, `blockParameterGuidance.ts`)
Make each block's help state its current behaviour and the diagnostics it can raise: Constant (output_type, range
codes), Product/Divide (IEEE Inf/NaN, DIVIDE_BY_ZERO), inverse trig and hyperbolic (MATH_DOMAIN_ERROR and domain),
logic gates (LOGIC_NAN_INPUT), Cosecant, ACOSECH, Rate Limiter (per second, elapsed time), Relay (onValue/offValue),
Switch (`>=` default and criteria), Delay (sampleTime, N sample periods), Discrete Integrator (sample_time, methods,
direct feedthrough), transfer function / ZPK (TF_IMPROPER, leading coefficient), Saturation / Dead Zone / Rate Limiter
/ PID limits (LIMITS_INVALID), State Space (dimension code), PID (mode honoured in continuous and discrete time,
PID_FILTER_COEFFICIENT_INVALID). Review the rest of the Simulink-equivalent families for statements contradicted by
the code and correct them.

### WP4 — toolbar and UI topics
Give Start Time, Stop Time and Fixed Step their own `data-help-feature` ids with accurate generated topics
(no "Unlimited"), make the solver selector topic name the Discrete solver, and keep the Constant "Output data type"
field covered. Use the repository's own help tooling (`scripts/help/*`, `src/help/uiFeatureTopics.ts`,
`liveUiTopics.ts`, `docs/help/*.json`, `docs/help/audit/*`) and regenerate the live UI evidence so
`helpCoverage.test.ts` passes. Review every newly detected control; mark nothing as reviewed without help that matches it.

### WP5 — code generation guide
Update `docs/XBRIDGES_EMBEDDED_CODEGEN.md`: Discrete solver kind, Constant `output_type`, control-port defaults
(Enable/Reset), discrete integrator methods (forward/backward Euler, Tustin) and the new codes.

## Rules
Help text describes only what the code does; read the code for every statement. No invented codes, defaults or
options. Keep the existing style of each file.
