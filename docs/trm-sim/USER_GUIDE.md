# Verifying requirements by simulation (TRM)

This guide walks through the full loop: requirements in the TRM, signals from the
State Machine, X-Bridges and V-Lab models, a coupled simulation that respects the
execution order, and pass/fail evidence in the matrix. The worked example is the
closed-loop thermostat used by the automated end-to-end test
(`src/engine/trmSim/thermostatScenario.e2e.test.ts`).

## 1. The models

| Model | Element | Signal / port | Role |
| --- | --- | --- | --- |
| State machine (tick 10 ms) | variable `enable` (bool) | `sim:sm/var/enable` | input (stimulus) |
| | variable `dT` (double) | `sim:sm/var/dT` | input (fed by V-Lab) |
| | variable `heaterOn` (bool) | `sim:sm/var/heaterOn` | output |
| | state `HEATING` | `st_heating` | observed as 1 when active, else 0 |
| X-Bridges | GAIN `heaterGain` (gain 100) | `heaterGain.u` in, `heaterGain.y` out | heaterOn -> power % |
| V-Lab | `power` (PS Constant) -> `chamber` (Low-Pass Filter, T = 5 s) | `power.value` param, `chamber.y` out | thermal plant |

Chart: `OFF -> HEATING` when `enable == true && dT < 55`; `HEATING -> OFF` when `dT >= 65 || enable == false`.

## 2. Assign model signals to requirements

Open the TRM window and, on a requirement row, open **Simulate**. Under
**Linked simulation targets**, pick a target (every block, port, parameter,
variable and state of the three models is listed) and a link kind:

- **satisfy**: the model element that fulfils the requirement (for example `HEATING`).
- **verify**: the signal you measure to show it (for example `chamber.y`).
- **refine** / **trace**: weaker relations.

You can also link from the model side, in the state, X-Bridges or V-Lab properties panel.

## 3. Create a simulation test case

Press **New simulation test case**. A verification case with method
`simulation` is created for the requirement. (Before phase 2 this step did not
exist, so the panel ended at "No simulation verification case verifies this requirement.")

## 4. Define the scenario

Press **Define scenario**. Fill in:

1. **Run settings**: Duration 30 s, Step 0.01 s. The step must divide the
   duration exactly and be a whole number of state-machine ticks. Otherwise
   Save is blocked with `STEP` / `STEP_NOT_TICK_MULTIPLE`.
2. **Execution order**: State machine → X-Bridges → V-Lab (the default).
3. **Signals**: give every signal a short alias:
   `dT = chamber.y`, `heaterOn = heaterOn`, `power = heaterGain.y`, `heating = HEATING`.
4. **Stimuli**: `enable` constant 1 (also step and ramp profiles).
5. **Couplings**: connect the models to each other:
   - `heaterOn → heaterGain.u` (same step)
   - `heaterGain.y → power.value` (same step)
   - `chamber.y → dT` (**one-step delay**, because V-Lab runs after the state machine)
6. **Assertions**: one or more per requirement (pick the requirement in each row):

| Requirement | Condition | Mode |
| --- | --- | --- |
| REQ-T1 warm-up | `dT >= 60` | eventually, window 0..10 s |
| REQ-T2 regulation | `dT >= 50 && dT <= 70` | always, window 15..30 s |
| REQ-T3 over-temperature | trigger `dT >= 65`, condition `heaterOn == 0` | response within 0.2 s |
| REQ-T4 power limit | `power > 100` | never |
| REQ-T5 heater on (the `x == 1` case) | `heating == 1` | eventually |

Conditions use `== != < <= > >= && || ! + - * /`, `abs()`, `min()` and `max()`,
`true` and `false`. Booleans and active states count as 1/0. Validation runs as
you type:

- **Errors block Save**: a single `=`, an unknown alias, a window outside the
  run, a target driven twice, a coupling inside one model, and so on.
- **Warnings are shown but don't block**: `==` on a continuous signal
  (use `abs(x - v) <= tol`), or a signal used by an assertion that isn't
  linked to that assertion's requirement.

Saving adds every requirement the assertions use to the test case.

## 5. Run

Press **Run**. Every major step runs:

1. Stimuli at the start of the step.
2. For each model in the execution order, the couplings into it, then one
   step of that model in its own order. The state machine runs step/tick
   ticks, X-Bridges runs its sorted blocks, and V-Lab runs its solver.
3. A snapshot of all aliases at the end of the step.

Values a model has already produced in this step are passed on at once.
Values from a model that runs later arrive one step late. The badges
show which is which. The run is deterministic.

The results table lists every assertion with its verdict, the time it was
decided and the signal values at that time. A trace plot is drawn for every
signal. The thermostat warms up to 60 at t = 4.59 s, and all five
requirements pass.

Verdicts:

- **passed** / **failed**: recorded as evidence and shown in the TRM.
- **inconclusive**: the window never had data, a response trigger never
  occurred, or the run ended before a response deadline. No evidence is
  recorded, because the requirement wasn't demonstrated.
- **not tested**: the test case verifies the requirement, but no assertion
  covers it.

## 6. Keep it current

- Editing any simulated model, its parameters or wiring (not just moving
  blocks) makes the evidence **stale** in the panel and in the TRM.
- Only the latest result of each test case counts. A fixed model that passes
  again replaces an earlier failure, and the history is kept.
- **Run all simulation tests**, in the TRM header, re-runs every test case.

## 7. How it is verified

- The coupled runner is compared bit-for-bit with a hand-written schedule
  on the engine sessions, in two different execution orders.
- Physics is checked independently. Every state-machine decision follows the
  hysteresis rule exactly. dT stays within 0.15 of the exact solution of
  `T*y' + y = u`. (V-Lab uses BDF2 and restarts at each heater switch.)
- The end-to-end test runs the whole loop through the SysML command gateway,
  exactly as the application does:
  1. create the test case;
  2. link the signals;
  3. save the scenario;
  4. run, and see every requirement verified;
  5. change a model, and see the results go stale;
  6. raise the switch-off threshold to 75, and see REQ-T2 and REQ-T3 fail;
  7. fix the model, and see them verified again;
  8. save and load the project;
  9. run everything again, and get identical results.
