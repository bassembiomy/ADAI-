# OM 501 LA V6 engine dynamometer reference application (Simulink reference-app style)

User decision (2026-10-22): build the model like MathWorks' **CI Engine Dynamometer reference application**. The engine and
the engine controller use genuine Powertrain Blockset blocks only. The dynamometer and the test sequence use standard
X-Bridges (Simulink-style) blocks, as MathWorks does. Everything is organised as reusable subsystems with one parameter set
per engine. The first parameter set is the OM 501 LA V6. Planner/reviewer: Opus. Executor: Sonnet (`pt-executor`).

The calibration-spec blocks (CI Cylinder, Calibration ECU, Engine Dyno, Calibration Map 2D, Throttle Body, Intake
Manifold, Turbocharger) do not appear in the reference model. The crank-angle CI Cylinder is used only offline, to
characterise the plant: it plays the role GT-POWER plays for MathWorks.

## Model structure (top level = four subsystems, as in the MathWorks reference app)

| Subsystem | Contents (block types) |
|---|---|
| Engine System | CI Core Engine; intake: Flow Boundary (ambient), Flow Restriction (air filter), Compressor, Heat Exchanger (charge-air cooler), Control Volume System (intake manifold); exhaust: Control Volume System (exhaust manifold), Turbine (wastegate), Flow Restriction (aftertreatment), Flow Boundary (ambient); Drive Shaft (turbo) |
| Engine Controller | CI Controller (genuine PT block: torque command -> fuel mass, main SOI, wastegate command; torque, smoke and full-load limits as calibration tables) |
| Dynamometer | Standard blocks: speed PI controller (PID_CONTROLLER / Sum / Gain), shaft inertia (Integrator), load torque |
| Test Sequence | DoE / steady-state sweep (existing DoE Sweeper as the test-automation block) driving speed, torque command and calibration factors |

## Map generation (two stages, like the MathWorks workflow)

1. **Plant characterisation:** offline sweeps of the crank-angle CI Cylinder at the OM 501 LA geometry give the CI Core
   Engine tables: inner torque, SOI efficiency, exhaust temperature, friction and volumetric efficiency.
2. **Controller calibration:** a steady-state dyno sweep of the reference model generates the CI Controller tables. These
   are the MR-PLD maps:
   - f_main_soi (map 1, Base SOI)
   - f_fuel_lmt_air (map 6, smoke limit)
   - f_tq_max / f_fuel_max (map 7)
   - f_fuel_cmd (torque to fuel quantity)
   - wastegate command

   The sweep also gives the Mapped CI Engine export and the injection duration (map 3, from the injector characteristic).

## Work packages

| WP | Content | Status |
|---|---|---|
| WP-25 | Fundamental flow: Flow Boundary, Flow Restriction, Control Volume System, Heat Exchanger. Two-way flow connections are realised as signal pairs: the state bus {Prs, Temp} goes from volumes and boundaries, the flow bus {MassFlw, HeatFlw} goes from restrictions, machines and the engine. | next |
| WP-26 | Boost drive: Compressor and Turbine (map based; corrected flow and efficiency vs pressure ratio and corrected speed; turbine wastegate or VGT), Drive Shaft | planned |
| WP-27 | CI Core Engine (mean value): speed-density air mass, torque structure (inner torque table times SOI efficiency, minus friction and pumping), exhaust temperature table, intake and exhaust flow ports | planned |
| WP-24 | CI Controller: torque command to fuel mass, f_main_soi, smoke limit (air-mass and lambda based), full-load limit, wastegate command | planned |
| WP-27b | Plant characterisation tool: CI Cylinder sweeps to the CI Core Engine parameter set for a geometry (OM 501 LA set) | planned |
| WP-35 | OM 501 LA reference application: four subsystems; reusable parameter set; test sequence; controller map generation into CI Controller tables and Mapped CI Engine; guided scenario | planned |

Port names follow the Powertrain Blockset documentation as recalled. The MATLAB inventory is still pending (G1).
Equations: Heywood (1988), Guzzella & Onder, *Introduction to Modeling and Control of IC Engine Systems* (2010), and the
MathWorks block documentation.

**Data notice:** the numbers are model generated from public OM 501 LA data plus assumptions. They are not Mercedes
calibration data.
