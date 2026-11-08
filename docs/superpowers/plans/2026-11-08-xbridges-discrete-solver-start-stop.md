# X-Bridges: discrete solver and Simulink-style start/stop time

Planner/tester: Opus. Executor: Sonnet.
Acceptance tests: `src/engine/xbridges/discreteSolver.test.ts`, `src/utils/stateMachine/xbDiscreteSolver.test.ts`.

## Baseline (before this work)

| Area | Finding |
|---|---|
| Solver settings | The X-Bridges toolbar solver, step and end time live only in React state. They are never saved: every X-Bridges state is created with `solver: { kind: 'euler', stepSeconds: 0.01 }` (App.tsx) and `handleXBridgesSave` stores nodes, edges and mappings only. Code generation never sees the user's choice. |
| Discrete solver (simulation) | `'discrete'` exists since the diagnostics work but runs `stepEuler`, so it would integrate continuous states in the live canvas. The live compile has no solver options, so `CONTINUOUS_STATES_WITH_DISCRETE_SOLVER` and the step-multiple check only run in `Solvers.runFixedStep`. |
| Discrete solver (code generation) | `XBSolverKind = 'euler' \| 'rk4'`; the adapter and validator reject anything else; the C generator treats any non-Euler kind as RK4. |
| Start/stop time | No start time. "End time" is an optional limit (blank = unlimited). No `inf`, no Simulink default of 10 s, no auto step. Discrete sample hits are scheduled from the start time, not on the absolute grid n·Ts. |

## Simulink behaviour followed

- Configuration Parameters > Solver: **Start time** (default 0), **Stop time** (default 10, `inf` allowed), solver type,
  **Fixed-step size** (`auto` or a number).
- Discrete solver (FixedStepDiscrete): no continuous states allowed; with `auto` step the step is the model's
  fundamental sample time (greatest common divisor of the discrete sample times).
- Fixed-step `auto` with no discrete rates: (stop − start)/50; with an infinite stop time 0.2 s.
- Sample hits are at t = n·Ts (n integer) — the grid does not move with the start time.
- Stop time before start time is an error.

## Work packages

### WP1 — simulation configuration module (`src/engine/xbridges/simulationConfig.ts`)
`XSimulationConfig`, `DEFAULT_SIMULATION_CONFIG`, `parseTimeInput`, `resolveSimulationConfig` exactly as the header of
`discreteSolver.test.ts` states. Diagnostics: `START_TIME_INVALID`, `STOP_TIME_BEFORE_START`, `FIXED_STEP_INVALID`
(errors). GCD of sample times computed robustly for decimal values (e.g. scaled rationals), reading `sampleTime` and
`sample_time` like `getBlockSampleTime` in `modelChecks.ts`.

### WP2 — engine and solvers
- `Solvers.stepDiscrete(engine, t, dt)`: outputs + discrete updates, no derivatives, no integration. `'discrete'` uses it
  in `runFixedStep` and in the live canvas.
- `runFixedStep`: resolves `fixedStep: 'auto'` through `resolveSimulationConfig` and stores the number in
  `engine.options.fixedStep`; adds config diagnostics to `engine.diagnostics`; refuses `stopTime = Infinity` with
  `STOP_TIME_INFINITE_BATCH` (error); returns without simulating on any error.
- Sample hits on the absolute grid: first hit at the smallest n·Ts ≥ startTime (with a 1e-9 tolerance), for every solver.

### WP3 — workspace UI (`src/components/xbridges/XbridgesWorkspace.tsx`)
- Toolbar fields **Start time**, **Stop time** (default `10`, accepts `inf`), **Fixed step** (`auto` or number) beside
  the solver selector, replacing "Time step (Δt)" / "End time". Invalid text is flagged on the field.
- Run/Reset start at the start time; the run stops exactly at the stop time; the live step uses the resolved step.
- The live compile (main thread and worker) receives the solver options, so solver-specific checks and the config
  diagnostics appear in the Diagnostics panel and block a run on error. Extend the worker protocol for the options.
- `'discrete'` steps with `Solvers.stepDiscrete` in both live loops (main thread and worker).
- Labs that set `solverType` / `fixedStep` keep working.

### WP4 — persistence
- `onSave(nodes, edges, mappings, simulation)` passes `{ solver, startTime, stopTime, fixedStep }`.
- App stores it on the X-Bridges model as `simulation` (restored into the toolbar when the workspace opens) and, for an
  X-Bridges state of the state machine, sets `xBridgesModel.solver = { kind, stepSeconds }` with
  `kind` = `'euler'` (euler/ode1), `'rk4'` (rk4/ode4) or `'discrete'`, `stepSeconds` = resolved fixed step. Other
  solvers are stored as chosen; the embedded adapter then reports that code generation supports Euler, RK4 and Discrete.
- The global (non-state) X-Bridges canvas keeps its simulation settings in the saved project too.
- Older projects without `simulation` open with the defaults.

### WP5 — embedded path (code generation)
- `XBSolverKind = 'euler' | 'rk4' | 'discrete'`; `xbModelAdapter` and `xbSemanticValidator.validateSampleTimes`
  accept it (message: Euler, RK4 or Discrete).
- `XB_DISCRETE_SOLVER_CONTINUOUS_STATE` (error) in `validateXBModel` for blocks with continuous states.
- Interpreter (`xbInterpreter.ts`, continuous integration ~line 2165) and C generator (`xbCGenerator.ts` ~line 3932):
  `'discrete'` performs and emits no continuous integration; it must not fall into the RK4 branch.
- `smReports.ts` shows the kind.

## Out of scope
Variable-step discrete solver, sample-time offsets, multitasking, and code generation for solvers other than Euler,
RK4 and Discrete.
