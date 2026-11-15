# Washing machine reference model

A front-loading washing machine (PMSM drum motor on an inverter) as an ADIA state-machine chart. It is the reference
model for the embedded-code workflow: controller, inverter speed loop and plant in one simulation, only the
controller generated as C.

- `WashingMachine.adia` the project, written by the application's own Save
- `washingMachineChart.ts` the chart, built with the editor's own operations (`scripts/lib/adiaEditorSession.ts`)
- `../../scripts/build_washing_machine_adia.ts` validates the chart with the app's simulation session and writes the project
- `../../scripts/save_washing_machine_in_app.mjs` opens the project in the running app, runs Validate and Generate C/H, saves with Save
- `../../scripts/verify_washing_machine_c.ts` proves the generated C reproduces the simulation over a whole program
- Acceptance: `src/utils/stateMachine/washingMachineReference.test.ts`

## Structure

The root layer is parallel: three regions.

| Region | Content |
|---|---|
| `Controller` | The sequencer (below). |
| `MotorSpeedLoop` | X-Bridges state, 1 ms separate task: `speed_cmd_rpm` -> RATE_LIMITER (150 rpm/s up, 300 rpm/s down) -> SPEED_CONTROLLER (Kp 0.05, Ki 0.5, maxIq 10 A) with `drum_speed_rpm` as feedback -> `iq_ref`. Only blocks that generate C. |
| `Plant` | Simulation only (State panel: Simulation only). `Hydraulics` (inlet 1.5 mm/s, drain 2 mm/s, no inflow with `plant_no_water`), `Thermal` (cold water 20 C, heater 0.04 K/s, slow cooling), `DrumMechanics` (40 rpm/s per ampere of `iq_ref` while `motor_enable`, drag grows with the water level), `UnbalanceOnset` (`unbalance` above 350 rpm with `plant_unbalanced_load`, cleared below 100 rpm). |

Controller states: `Idle` -> `Running` (composite, deep history) -> `Done`; `Paused`; `AbortDraining`; `FaultDraining` -> `FaultStopped`.

`Running`: `LockDoor` (0.2 s) -> `Fill` (inlet until the program level; 3 min time-out, fault 1) -> `Heat` (Cotton only; heater only at level >= 60 mm;
20 min time-out, fault 2; dry-heater fault 4) -> `Wash` (CW 10 s, pause 3 s, CCW 10 s, pause 3 s, repeated) -> `Drain` (pump until level <= 5 mm;
3 min time-out, fault 3) -> `Rinse` (fill, 4 agitation cycles, drain; once per rinse) -> `Spin` (`Distribute` 90 rpm for 20 s -> `SpinUp` to the program speed
for 150 s -> `Brake`). An unbalance in `SpinUp` goes back to `Distribute`; the third failed attempt finishes with a reduced spin of 400 rpm.
`Brake` ends in `Done` once the drum is below 1 rpm and the tub empty; `Done` unlocks the door.

Programs (the START transitions of `Idle` set the program data):

| `program` | Name | Fill | Heat | Wash cycles | Rinses | Spin |
|---|---|---|---|---|---|---|
| 0 | `PROGRAM.COTTON_40` | 90 mm | 40 C | 20 | 3 | 1200 rpm |
| 1 | `PROGRAM.QUICK_30` | 70 mm | no | 24 | 2 | 1000 rpm |
| 2 | `PROGRAM.SPIN_ONLY` | none | no | 0 | 0 | 1200 rpm |

`PAUSE` leaves `Running` (all outputs of the active phase switch off in the same tick, motor and heater off, door stays locked); `START` returns through the
deep-history junction into the same phase. `CANCEL` drains and stops (`AbortDraining`), faults drain and stop (`FaultDraining`); the door unlocks only when
`abs(drum_speed_rpm) <= 1` and `water_level_mm <= 5`.

## Interface

Tick 10 ms, code prefix `WM` (`wm_core.h`, `wm_core.c`, ...).

| Name | Type | Direction | Meaning |
|---|---|---|---|
| `door_closed` | bool | sensor in | door switch |
| `water_level_mm` | int16 | sensor in | level in the tub |
| `water_temp_c` | fixdt(1, 16, 4) | sensor in | water temperature, step 0.0625 C |
| `drum_speed_rpm` | float | sensor in | signed drum speed (CW positive) |
| `unbalance` | bool | sensor in | unbalance switch |
| `program` | uint8 | setting | `PROGRAM.*` |
| `START`, `PAUSE`, `CANCEL` | input events | in | `WM_PostEvent(&wm, WM_EVENT_START)` etc. |
| `door_lock`, `inlet_valve`, `drain_pump`, `heater`, `motor_enable` | bool | actuator out | |
| `speed_cmd_rpm` | float | out | drum speed set point (signed) |
| `iq_ref` | float | out | torque current reference from the speed loop, 1 ms |
| `fault_code` | uint8 | out | 0 none, 1 no water, 2 heat time-out, 3 drain time-out, 4 heater dry |
| `phase` | uint8 | out | `PHASE.*`: 0 idle, 1 lock door, 2 fill, 3 heat, 4 wash, 5 drain, 6 rinse, 7 spin, 8 done, 9 paused, 10 fault, 11 abort |
| `plant_no_water`, `plant_unbalanced_load` | bool | plant only | fault injection (not in the C) |

The sensor variables written by the plant in simulation are inputs of the generated chart: the firmware writes them before `WM_Step`.

## Regenerating code

```
npx tsx scripts/build_washing_machine_adia.ts                 # writes WashingMachine.adia from washingMachineChart.ts
npx vite --port 3000                                          # the app
node scripts/save_washing_machine_in_app.mjs                  # Validate, Generate C/H, then the app's own Save
```

In the app: open `WashingMachine.adia`, Validate, Generate C/H (the dialog lists `wm_core.c`, `wm_core.h`, `wm_xbridges.c`, ...). The integrator calls `WM_Step`
every 10 ms and, for the speed loop, `WM_XB_Task` every `WM_XB_TASK_PERIOD_US` (1000 us) from an interrupt with higher priority; `WM_XB_Task` must run first
in each chart period (see the integration guide, fast task section).

## Measured

Simulation (interpreter, 10 ms ticks): see the table. The generated C reproduces the simulated controller outputs tick by tick
(`scripts/verify_washing_machine_c.ts QUICK_30 25`: 150 000 ticks, 0 mismatches).

| Item | Value |
|---|---|
| QUICK_30 completes (phase `DONE`, fault 0) | 20.6 simulated minutes (123 369 ticks); COTTON_40 32.0 minutes |
| P6 unbalance run (SPIN_ONLY, three full-speed attempts, reduced spin 400 rpm) | done after 4.0 simulated minutes, peak 430 rpm |
| No water: `fault_code` 1 | 180.2 s after START |
| ATmega2560 16 MHz, chart tick (`WM_Step` + `WM_WriteOutputs`) | 8 973 cycles worst case (0.56 ms) |
| ATmega2560 16 MHz, fast task `WM_XB_Task` | 5 097 cycles worst case (0.32 ms); budget 3 200 (see below) |
| ATmega2560 flash / RAM (`avr-gcc -Os`) | 26 614 bytes text + 72 data / 398 bytes bss |
| Cortex-M0+ (`arm-none-eabi-gcc -Os`) object text | `wm_core.o` 10 280, `wm_xbridges.o` 1 472, `wm_safety.o` 1 134, `wm_user_logic.o` 972, `wm_mapping.o` 156 = 14 014 bytes |
| Cortex-M0+ instance RAM (`WM_Instance_t`) | 464 bytes |

## Not expressed / known limits

- The application has no control for the solver step and execution mode of an embedded X-Bridges state (a new one is Euler, 10 ms, in-tick). The model sets
  `solver: { kind: 'euler', stepSeconds: 0.001, execution: 'separate-task' }` through one call in the build script (`setEmbeddedSolver`); it survives the app's Save.
- The fast task of RATE_LIMITER + SPEED_CONTROLLER needs about 5 100 cycles on an ATmega2560; the contract budget is 3 200 (0.2 ms). SPEED_CONTROLLER alone is about 3 200.
- Variable ids equal their names (the acceptance test reads simulation data by name); the Variables panel gives a new variable a random id.
- The app's Validate treats two transitions from one state with equal type, condition and time as conflicting even when they have different events; the PAUSE
  transition therefore carries the guard `fault_code==0` (always true while running).
- No bool-in-arithmetic and no min/max in the action language: the plant uses states for flow selection and the `(x + abs(x))/2` form for clamping.
