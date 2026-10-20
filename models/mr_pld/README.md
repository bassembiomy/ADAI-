# MR-PLD ECU (A 541 446 53 40) — OM 501 LA

`MR_PLD_Model.sysml` is the SysML v2 textual source. The ready-to-open ADIA project is
`../../MR_PLD_ECU.adia` (ADIA → **Open**).

Every element is a semantic element of the ADIA model, created with the editor's own commands, and the build
fails unless the app's validators (repository rules, IBD connector rules of every context, BDD block rules)
report nothing.

| SysML v2 source | ADIA model element |
| --- | --- |
| `package MR_PLD_Model { Items, Ports, Structure, Behavior }` | Packages, plus «modelLibrary» `Types` |
| `ScalarValues`, `ISQ`, `SI` | ValueTypes (`Real`, `Integer`, `Boolean`, `String`, `Voltage`, `Current`, `Resistance`, …) with QUDV Units and QuantityKinds |
| `item def` (TorqueRequest, CrankPulse, …) | Blocks in `Items` with typed attributes |
| `port def` (PowerPort, CAN_Port, …) | InterfaceBlocks in `Ports`; their features are the item flows (`in rx : TorqueRequest`) |
| `port def CabConnector16 / EngConnector55` | InterfaceBlocks; ECU ports `X1`, `X2` with nested proxy ports `X1.KL30`, `X2.ckp`, … |
| `part def` | Blocks with typed value properties, part properties (+ composition) and proxy ports; `~` = conjugated port |
| `ref tester` | Reference property + association, multiplicity 0..1 |
| `part highSide : MosfetSwitch[2] { :>> partNo = … }` | `HighSideFET_BUZ102SL` / `LowSideFET_SUD25N06` specialise `MosfetSwitch` and redefine its values |
| `connect` / `interface` / `flow of` | IBD connectors (system: 6, ECU: 20); the CAN and X2 connectors carry item flows |
| `action powerLatch`, state-machine actions | Operations of `PowerSupplyUnit` and `MR_PLD_ECU` |
| `state def OperatingModes` | Executable state machine (Powered / Running are composite states) + HMI panel |
| inputs/outputs of the state machine | Signals in `Behavior` (`kl15`, `kl50`, `synced`, `rpm`, `pedal`, `ebReq`, `starter`, `injection`, `pv`, `engineStatus`), declared as receptions of the receiving Blocks |

Diagrams: BDD 1 system context, BDD 2 ECU, BDD 3 engine, BDD 4 items/interfaces/signals, BDD 5 value types and
units, IBDs of the system, the ECU, the engine and the injection power stage, and **SD - Engine start and drive**.

The sequence diagram is the interaction `Engine start and drive`, owned by `Actros_EngineMgmt_System`. Its
lifelines are the parts `ignition`, `fr`, `mr` and `engine`; every message is a Signal that travels over a real
IBD connector; the state invariants on `mr` name states of the state machine (Off → Standby → Crank_SyncSearch →
Crank_StartFuel → Idle → Drive → EngineBrake → Running → Stopping), and the app confirms that each incoming
signal triggers a transition out of that state. A time constraint marks the 0.7 s self-test and a duration
constraint the 4 s start-fuel window.

State machine mapping: `accept when x` change events become level guards (`kl15==true`); `accept after t [s]`
becomes an `after` transition in 10 ms ticks (0.7 s → 70, 4 s → 400, 1.6 s → 160). The opaque actions drive
output variables: `latchAndReadEEPROM`/`releaseLatch` → `powerLatch`, `starterOn` → `starter`,
`injectStartQuantity`/`injectPLD`/`cutInjection` → `injMode` 1/2/0, `pvOn`/`pvOff` → `pv`, `derate` → `derate`,
`storeImmoDTC` → `dtcImmo`, `storeDTC` → `dtcStored`.

Regenerate after editing:

```sh
python3 scripts/generate_mr_pld_adia.py   # state machine, variables, HMI -> models/mr_pld/MR_PLD_ECU.behaviour.json
npx tsx scripts/build_mr_pld_adia.ts      # SysML model + diagrams, validated -> MR_PLD_ECU.adia
npx vitest run src/services/mrPldEcuProject.test.ts
```
