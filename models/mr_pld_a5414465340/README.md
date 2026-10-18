# MR-PLD A 541 446 53 40 (TEMIC 287699.01 B) — OM 501 LA.II/2-00 V6

`MR_PLD_A5414465340.sysml` is the reviewed SysML v2 reverse-engineering model (with `mrpld_data.py`, the review
report and the simulation results in `sim_out/`). The ready-to-open ADIA project is `../../MR_PLD_A5414465340.adia`
(ADIA → **Open**).

Every element is a semantic element of the ADIA model, created through the editor's own commands, and the build
fails unless the app's validators (repository rules, IBD connector rules of every block, BDD block rules) report
nothing beyond the app's guidance note on the two `abstract part def`s.

## No new blocks

The 41 blocks are exactly the `part def`s of the source; the test compares the two lists. `Driver`, the only other
`part def` (a human participant in package Interactions), is the **Actor** of the use cases and sequence diagrams.
Everything added to make the model complete is a requirement, use case, diagram, connector or behaviour, never a block.

| SysML v2 source | ADIA model element |
| --- | --- |
| 11 packages | `00_Types` («modelLibrary») … `14_UseCases` under `MercedesBenz_MR_PLD_A5414465340` |
| `ScalarValues`, `ISQ`, `SI` | ValueTypes `Real`, `Integer`, `Boolean`, `String`, `ElectricPotentialValue` [V], `ElectricCurrentValue` [A], `FrequencyValue` [Hz] with QUDV units / quantity kinds |
| `attribute def ECU_Label`, `enum def`s | ValueType `ECU_Label`; Enumerations `EngineVariant`, `KeyState`, `SyncMode`, `Severity`, `SensorFaultMode`, `PinDirection`, `InjectionPhase` |
| 35 `item def`s | Signals (frame / trigger attributes are carried as message arguments) |
| 16 `port def`s, 6 `interface def`s | InterfaceBlocks; `X1_CabConnector16` / `X2_EngineConnector55` list every pin with direction, signal, function and test value |
| X1 (16) / X2 (55) pins | Nested proxy ports of `MR_PLD_ECU.x1` / `.x2`, named `X2_19_CKP_SIG` etc.; a pin a harness wire reaches is typed by the port def at the other end (conjugated where the ECU receives) so the IBD rules check direction and interface |
| `part def` + `:>>` | Blocks with values, parts (+ composition), proxy ports, operations, receptions; `:>> partNumber = …` are redefining values of the component specialisations; per-usage values (`refDes`, sensor `reference`) are block constraints |
| `connect` / `interface` / `flow of` | 32 connectors of `OM501LA_EngineSystem`, 18 of `MR_PLD_ECU` (+ 8 pin → driver delegations from the pin functions); CAN, unit-pump and SOI connectors carry item flows |
| `requirement def`s + `satisfy` | 12 requirements in `mrPldSpecification`, 6 supplementary (engine brake, memory, pin-out, variants, BOM, after-run) and 52 derived requirements (71 in all), each «deriveReqt» from its source and «satisfy»-ed by the block whose doc / attributes / pins state it (every relationship joins two SysML elements, so the Report validates cleanly) |
| `constraint def` / `calc def` | 16 ConstraintBlocks; `SensorChainContext` (13 bindings) and `MR_PLD_ECU` (2) parametric diagrams |
| `state def`s | the executable state machine (below) |
| `action def`s | Activities `InjectionEvent`, `EngineStartProcedure` with swimlanes; every action «allocate»d to its block |
| `occurrence def`s | Interactions with sequence diagrams (below) |
| `verification def` / `analysis def` / 14 scenarios | Verification cases (Test / Analysis / Simulation) verifying the requirements |
| `variation part def` | Block `EngineConfiguration` with variant parts `om501_V6`, `om502_V8` |

## Diagrams (77)

- **BDD 01–13**: system context, ECU architecture, compute core, sensor AFE, injection stage, drivers / power / comms,
  component taxonomy, engine-sensor taxonomy, signals + enumerations, port / interface defs, value types, constraint
  blocks, analysis + variants.
- **IBD**: `OM501LA_EngineSystem` (full harness, 32 connectors), `MR_PLD_ECU` (26 connectors with nested ends), and the
  parts of each ECU subsystem.
- **REQ**: the specification, verification, and **one requirements diagram per block** (`REQ - <block>`) showing the
  block, every requirement it satisfies and their source requirements.
- **UC 01**: 16 use cases of the `MR_PLD_ECU` subject; actors Driver, FR_CabECU, DiagnosticTester, Battery24V;
  «include», «extend» (with extension points and conditions), generalisation; each use case refines its requirements.
- **ACT**: InjectionEvent, EngineStartProcedure.
- **SD**: crank + authorisation + peak & hold (with a `ref` to the ECU-internal collaboration and a firing-order loop),
  CKP loss → limp home (with `ref`), immobiliser rejected (`neg` fragment: no starter), engine brake, over-temperature
  derate, stop + after-run, plus the two ECU-internal interactions (MCU, EEPROM, CAN transceiver, VR comparators, CPLD,
  low-side MOSFETs, current comparators). Every message is a Signal over a real connector; state invariants on the ECU
  lifeline name states of the state machine.
- **PAR**: `SensorChainContext`, `MR_PLD_ECU` constants. The app's canvas has no parametric mode yet, so these two are
  listed in the model tree and drawn by **Report**, not opened as tabs.
- **PKG 01**: model organisation.

## Model tree

ADIA files each element under the last diagram that shows it, so the build creates the diagrams in an order that
gives every element its natural home: components under their subsystem BDD, subsystems and the ECU under BDD 02,
context blocks and sensors under BDD 01, top-level requirements under REQ 00, derived requirements under their
block's requirements diagram. Selecting an element, part (also a nested IBD part) or relationship line on a diagram
expands the tree to its row and highlights it.

## State machine — one region per behaviour owner

| Region | Owner block | Source |
| --- | --- | --- |
| `MR_PLD_OperatingStates` | `MR_PLD_ECU` (exhibit) | `state def`, 11 states, all 25 transitions |
| `InjectionMicroCycle` | `PLD_C1_1` | `state def`, 6 states, 8 transitions |
| `SyncSupervisor` | `SAK_C167CS_LM` | `enum SyncMode`; raises `CkpLost` / `CmpLost` / `CkpRestored` / `SyncLost` from `ckpValid` / `cmpValid` |
| `ThermalFanControl` | `ValveAndStarterDrivers` | REQ-THM-08 (PV3 from 92 C, 100 % at 100 C, 103 C warning); raises `OvertempDetected` / `OvertempCleared` |
| `SensorDiagnostics` | `SensorAFE` | `enum SensorFaultMode`, REQ-DIAG-07 window 0.18..4.82 V on the B65 ECT pin |

`accept Signal` is a Boolean event variable named after the Signal, consumed by the transition that accepts it;
`if guard` stays a guard on the state def attributes; `accept after t` is an `after` transition (1 ms ticks; the
0.3 ms spill rounds up to one tick). The HMI has a pulse button per Signal, toggles / sliders for the attributes, and
lamps / gauges for the outputs.

Corners the source leaves open, added as transitions: key off in `ST_INIT_IMMO` (→ standby) or `ST_CRANK_SYNC`
(→ after-run), engine stall in run / limp (`EngineStopped` → ready), `CanRestored` → run, stop button in limp, open
coil (peak not reached in 2 ms → cylinder cut-off), cut-off cleared at power-down, and no injection unless the
operating mode enables it.

The test replays the source simulation on this state machine: all 14 scenarios end in their expected state, and the
60 s drive cycle of `sim_out/results.json` passes event by event.

Values marked **TBV** are reverse-engineering hypotheses to be confirmed on the bench or with Star Diagnosis.

## Regenerate

```sh
npx tsx scripts/build_mr_pld_a5414465340_adia.ts      # -> MR_PLD_A5414465340.adia (validated)
npx vitest run src/services/mrPldA5414465340Project.test.ts
```
