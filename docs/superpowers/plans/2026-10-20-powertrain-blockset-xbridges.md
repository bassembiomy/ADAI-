# Powertrain blockset for X-Bridges (plan, rev 2)

Planner/reviewer and acceptance-test author: **Opus** (main session). Executors: **Sonnet** `pt-executor`
(equations, dynamics, engine and codegen work) and **Antigravity** via `agy` (bulk and mechanical work, MATLAB
runs on the user's machine). One WP at a time per executor. Loop: `.claude/skills/pt-blockset-loop/SKILL.md`.
Ledger: `docs/powertrain/ledger.json` (planner owns it). Antigravity briefs: `docs/powertrain/antigravity/`.
Branch: `claude/nice-ritchie-ighzje`, PR into `co-work`. Never `git add -A`. Never edit `.adia` files.
Never weaken, skip or delete a test.

## 0. User mandate
- 2026-10-20 (1): "Add the Powertrain Blockset from MATLAB Simulink to the X-Bridges application and make sure it
  works perfectly with our application. Copy the symbols, the ports and the mathematical equations so it is strong
  for modelling in ADIA. Opus as planner and reviewer, Sonnet as executor."
- 2026-10-20 (2): "Make sure it works perfectly like Simulink; the plan shall cover **all** the blocks in the
  Powertrain Blockset and its related blocks; if needed give tasks to my Antigravity account to save tokens."

What this plan commits to:
- **Every block** of the installed Powertrain Blockset release (§2, made authoritative by WP-01 from MATLAB),
  plus every Simulink core block those blocks and the reference applications depend on (§2.R).
- **"Like Simulink" is measured, not claimed** (§4): same ports, same parameters, and numerically the same
  outputs as the Simulink block for the same parameters, stimuli, solver and step, within stated tolerances,
  checked against goldens produced by the user's MATLAB.
- **Ports**: same names, order, direction, units. **Parameters**: same names, units, bounds.
  **Equations**: implemented from the published equations; stated in each block's `equation` and help.
- **Symbols**: MathWorks icon artwork is copyrighted, so we draw original SVG symbols that follow the same
  engineering picture (battery cell, clutch plates, planetary sun/carrier/ring, turbine wheel, …). Never traced
  or embedded MathWorks images.
- **Calibration data**: MathWorks' shipped default tables are not copied. Defaults come from published analytic
  models; golden runs set the Simulink block to *our* parameter set, so parity does not depend on their data.
  Public regulatory drive cycles are copied as published.

## 1. Findings (baseline: `claude/nice-ritchie-ighzje` at 49f07cf)
- F1 The library is one file: `src/engine/xbridges/BlockDefinitions.ts` (11.8k lines, 1.1 MB), `BLOCK_LIBRARY`
  `:912`, `XBRIDGES_CATEGORIES` `:11511`. Block shape `XBlock` (`src/engine/xbridges/types.ts`): `execute`,
  `evaluateDerivatives` (continuous states solved by the engine), `ZeroCrossingFn`, `isStateful`, `equation`.
- F2 **Two palettes**: canvas uses `BlockDefinitions.ts` `XBRIDGES_CATEGORIES` (`XbridgesWorkspace.tsx:26`,
  `XBlockNode.tsx:14`); help (`help/blockReference.ts:2`) and AI catalog (`xbridgesCapabilityIndex.ts:2`) use
  `src/utils/xbridges/XbridgesLibrary.ts`.
- F3 Symbols are Lucide icons by name (`XBlockNode.tsx:17`); no per-block SVG symbol mechanism.
- F4 **Simulink core gaps** (checked in `BLOCK_LIBRARY`, not only the palette): no Lookup Table (1-D/2-D/n-D,
  Prelookup, Interpolation), no Bus Creator/Selector, no Transport Delay, no Hit Crossing, no element-wise MinMax,
  no Relational Operator / Compare To Constant, no Sign, no Math Function / Sqrt, no Rounding, no Coulomb &
  Viscous Friction, no Backlash, no Enabled/Triggered/Variant Subsystem, no Goto/From. `MEMORY` and `UNIT_DELAY`
  exist in `BLOCK_LIBRARY` but are not in the palette.
- F5 **Info buses**: nearly every Powertrain block has an `Info` bus output (efficiency, losses, power terms).
  X-Bridges has vectors (`MUX`/`DEMUX`) but no named bus. Parity on `Info` needs a bus signal (WP-04).
- F6 Embedded C is opt-in per type: `xbCapabilities.ts` (registry), `xbCGenerator.ts` (`:1947`, `:3819`),
  `xbInterpreter.ts`, `xbSemanticBuilder.ts`, `xbCConformanceCases.ts`.
- F7 Units are sparse (81 of 954 catalog ports); the AI index records `unknown` (`xbridgesCapabilityIndex.test.ts:63`).
- F8 Existing dq/MTPA/field-weakening math (`IM_FOC_CONTROL`, `AC_INDUCTION_MOTOR`, `MTPA_CONTROLLER`,
  `FIELD_WEAKENING`, `CURRENT_CONTROLLER_DQ`; V-Lab `pmsmModel`, `bldcMotorModel`) is reused, never duplicated.
- F9 Anything in `BLOCK_LIBRARY` reaches the headless engine, DOE, TRM simulation (`trmSim/xbRunner.ts`),
  state-embedded X-Bridges and the AI catalog at once. A block is registered only in the WP that verifies it.
- F10 Tests touching the catalog: `BlockDefinitions.test.ts`, `help/blockReference.test.ts`,
  `xbridgesCapabilityIndex.test.ts` (fingerprint — planner updates it), `xbCapabilities.test.ts`,
  `xbCGenerator.test.ts`, `xbInterpreter.test.ts`.
- F11 MATLAB R2024b is on the user's Windows machine; the cloud has no MATLAB and no `agy`. The cloud cannot reach
  mathworks.com, so the block list in §2 is assembled from search results and must be confirmed by WP-01.
- F12 The repo already ships an Antigravity orchestration skill: `.agents/skills/agy-delegate/` (`scripts/relay.mjs`
  wraps `agy --print`, writes `result.json`; the orchestrator reviews and commits).

## 2. Block catalogue (all Powertrain Blockset blocks)
X-Bridges type = `PT_` + name. "conf." = seen in documentation search; "chk" = to confirm in WP-01 (deleted from the
plan if the installed release does not have it; any block WP-01 finds that is missing here is added). Group = WP.

| Library path (Powertrain Blockset / …) | Blocks | WP |
| --- | --- | --- |
| Vehicle Scenarios / Drive Cycle and Maneuvers | Drive Cycle Source (conf.) | 10 |
| Vehicle Scenarios / Driver | Longitudinal Driver (conf.) | 10 |
| Vehicle Dynamics / Vehicle Body | Vehicle Body 1DOF Longitudinal (conf.), Vehicle Body 3DOF Longitudinal (conf.) | 11 |
| Drivetrain / Wheels | Longitudinal Wheel — disc, drum and mapped brake; magic-formula and mapped tyre variants (conf.) | 12 |
| Drivetrain / Couplings | Disc Clutch, Planetary Gear, Rotational Inertia, Torsional Compliance, Split Torsional Compliance, Torque Converter, Two-Way Connection, Gearbox (conf.) | 13 |
| Drivetrain / Final Drive Unit | Open Differential, Limited Slip Differential, Transfer Case (conf.), Active Differential (chk) | 14 |
| Drivetrain / Transmissions | Ideal Fixed Gear Transmission, Automated Manual Transmission, Dual Clutch Transmission, Continuously Variable Transmission (conf.), Manual Transmission (chk) | 15 |
| Drivetrain / Transmission Controllers | AMT Controller, DCT Controller, CVT Controller (conf.) | 16 |
| Energy Storage and Auxiliary Drive / Batteries | Datasheet Battery, Equivalent Circuit Battery, Estimation Equivalent Circuit Battery (conf.) | 17 |
| Energy Storage and Auxiliary Drive / Auxiliary Drive | Starter, Reduced Lundell Alternator (chk), Bidirectional DC-DC / DC-DC Converter (chk) | 18 |
| Propulsion / Electric Motors and Inverters | Mapped Motor, Surface Mount PMSM, Interior PMSM (conf.) | 19 |
| Propulsion / Electric Motors and Inverters | Induction Motor, Flux-Based PMSM (conf.) | 20 |
| Propulsion / Electric Motors and Inverters | Three-Phase Voltage Source Inverter (conf.), mapped inverter (chk) | 21 |
| Propulsion / Electric Motor Controllers | Surface Mount PM Controller, Interior PM Controller, IM Controller, Flux-Based PM Controller (conf.) | 22 |
| Propulsion / Combustion Engines | Mapped SI Engine, Mapped CI Engine (conf.), Mapped Core Engine (conf., library chk) | 23 |
| Propulsion / Combustion Engine Controllers | SI Controller, CI Controller (conf. in reference apps) | 24 |
| Propulsion / Combustion Engine Components / Fundamental Flow | Control Volume System, Flow Boundary, Flow Restriction, Heat Exchanger (conf.), Throttle (chk), exhaust/aftertreatment blocks (chk) | 25 |
| Propulsion / Combustion Engine Components / Boost | Compressor, Turbine, Boost Drive Shaft (conf.) | 26 |
| Propulsion / Combustion Engine Components / Core Engine | SI Core Engine, CI Core Engine (conf.) | 27 |
| Anything else in the installed release (fuel cell, thermal, hydrogen, …) | per WP-01 inventory | 28 |

### 2.R Related blocks (Simulink core blocks the Powertrain blocks and reference apps use; gaps from F4/F5)
| Block | Why | WP |
| --- | --- | --- |
| 1-D, 2-D, n-D (≤4) Lookup Table; Prelookup; Interpolation Using Prelookup — linear/flat/nearest, clip/linear extrapolation, Simulink breakpoint rules | engine/motor/battery/tyre/shift maps | 03 |
| Bus Creator, Bus Selector, named bus signal (`Info` outputs), Scope/TRM read a bus element | `Info` parity (F5) | 04 |
| Transport Delay, Variable Transport Delay, Hit Crossing, MinMax (element-wise), Relational Operator, Compare To Constant, Sign, Math Function (sqrt, exp, log, pow, square, reciprocal), Rounding, Coulomb & Viscous Friction, Backlash; palette entries for existing `MEMORY`, `UNIT_DELAY` | used inside the blocks and the reference apps | 05 |
| Enabled, Triggered and Variant Subsystem; Goto/From | reference apps (variant drivers, enabled controllers) | 05b |
| Supervisory logic as ADIA state machines with embedded X-Bridges (no new Stateflow clone) | HEV/transmission supervisory controllers | 32 |

## 3. Contracts (fixed)
### 3.1 Module layout — `src/engine/xbridges/powertrain/`
- `ptSpec.ts` — the single source of truth per block:
  ```ts
  interface PtPortSpec { id; name; direction: 'input'|'output'; unit: string; simulinkIndex: number;
                         dimensions?: number[]; bus?: string /* bus type name for Info ports */; description: string }
  interface PtParamSpec { name /* Simulink mask variable */; label /* mask prompt */; unit: string;
                          default: number|number[]|number[][]|string; min?: number; max?: number; minExclusive?: boolean;
                          kind: 'scalar'|'vector'|'table'|'enum'; axisOf?: string[]; variantOf?: string }
  interface PtBlockSpec { type: `PT_${string}`; label; category: PtCategory; simulinkPath: string;
                          variants?: { param: string; values: string[] } /* mask popups that change ports */;
                          symbol: PtSymbolId; inputs: PtPortSpec[]; outputs: PtPortSpec[]; params: PtParamSpec[];
                          states: string[]; equations: string[]; references: string[]; description: string;
                          parity: { static: boolean; tolerance: PtTolerance } }
  ```
- Mask popups that change ports (e.g. wheel brake type, clutch control mode) are **variants of one block type**
  (ports rebuilt by the factory from `variants`), exactly as Simulink shows them.
- `ptMath.ts` — shared pure numerics (`interp1/2/n` reused from the WP-03 LUT core, `smoothSign`, `magicFormula`,
  power-flow efficiency, unit conversions). No `||` on numbers anywhere in the module.
- `ptDriveCycles.ts` — public cycles as `[t_s, v_mps]` (+ gear where published), sources cited in the header.
- `blocks/<group>.ts` per WP group: `PT_SPECS`, `PT_FACTORIES`. `index.ts`: `POWERTRAIN_SPECS`,
  `POWERTRAIN_FACTORIES` (only verified blocks), `POWERTRAIN_CATEGORIES`.
- Registration: `BLOCK_LIBRARY` spreads `POWERTRAIN_FACTORIES`; **both** palettes append `POWERTRAIN_CATEGORIES`.
  Palette: one group "Powertrain Blockset" holding every block, ordered by Simulink sub-library (user decision 2026-10-20);
  each spec keeps its Simulink sub-library in `category` ("Powertrain / Drivetrain / Couplings", ...) for help and ordering.
- A factory builds ports only from its spec; never a port the Simulink block does not have.

### 3.2 Block semantics
- Signal-flow, as Simulink: same causality per port (torque in / speed out, etc.), SI units at ports as the
  Simulink block, same sign conventions (stated per block).
- Continuous states via `evaluateDerivatives`; discrete logic via `execute` + `nextState`; stick/slip, lock-up,
  gear shifts and saturations declare `ZeroCrossingFn`.
- Invalid parameters (bounds, non-monotonic breakpoints, table/axis size mismatch) → block `error`, never a
  silent clamp or `NaN`. Zero, negatives and fractions valid where physical.
- Initial conditions, sample times and "inherited" behaviour follow the Simulink block (`-1` = inherited).

### 3.3 Symbols — `src/components/xbridges/powertrain/PtSymbol.tsx`
- Original inline SVG per `PtSymbolId`, `currentColor` + theme tokens (`npm run lint:theme` passes), 48×32 viewBox.
- `XBlockNode.tsx` renders `<PtSymbol>` for powertrain types; handles in Simulink port order (inputs left, outputs
  right, `simulinkIndex`), port labels as in Simulink.

## 4. Simulink equivalence gate ("works like Simulink")
A block is **done** only when all five pass:
- **G1 Port parity** — names, order, direction, units, variants equal `docs/powertrain/inventory.json` (automatic,
  `ptContract.test.ts`).
- **G2 Parameter parity** — every mask parameter present with the same name, unit, bounds and popup values.
- **G3 Numerical parity** — goldens from MATLAB: for each block, the stimulus set S (steps, ramps, sine sweep, sign
  reversal, entry/exit of every saturation, lock/unlock and shift events), run in Simulink and in `XbridgesEngine`
  with the **same parameters, solver and step**:
  - fixed-step `ode4`, same `dt`: algebraic outputs rel 1e-9 / abs 1e-12; continuous states rel 1e-6;
    event times within one step, values after the event rel 1e-4;
  - variable-step `ode45` (rel tol 1e-6 both sides) at shared output times: rel 1e-3.
  Goldens: `tests/fixtures/powertrain/goldens/<type>/<case>.{csv,params.json}`; compared by `ptParity.test.ts`.
- **G4 Physics** — Opus-written tests with values computed independently (closed form, hand calc, or a reference
  integrator in the test): steady state, analytic transient, limits, sign convention, energy balance
  (`P_in = P_out + P_loss`; rel 1e-9 static, solver tolerance dynamic). G4 also protects the case where G3 goldens
  are not yet produced.
- **G5 Code parity** — where the block is C-eligible, generated C equals the interpreter (paired conformance case).

System level (WP-31/32/33): each reference application against the same model built in Simulink from the same
blocks and parameters (§2 reference apps), on FTP-75/WLTP/US06: speed trace, SOC, fuel, energy per component within
0.5 %.

Missing goldens are a ledger item, never a skipped test: `ptParity.test.ts` iterates only the golden files present,
and the ledger shows per block `G3: pending` until its goldens are committed.

## 5. Executor routing (token budget)
| Executor | Takes | Never takes |
| --- | --- | --- |
| **Antigravity** (`agy`, user's machine) | MATLAB scripts and runs (inventory, goldens), transcribing `inventory.json` into `ptSpec` entries (ports/params only), drive-cycle data files, SVG symbols, help/guidance text, palette and registration boilerplate, reference-app assembly from verified factories, golden CSV import | equations, solver/engine code, codegen emitters, tests |
| **Sonnet** (`pt-executor`) | block equations and factories, LUT/bus/core blocks, engine changes, C emitters, properties table editor | tests, ledger |
| **Opus** (main session) | acceptance tests, briefs, review, ledger, catalog fingerprint, commits, parity decisions | production code |

- In the cloud (no `agy`, no MATLAB) Antigravity WPs wait in the ledger as `waiting_agy`; Opus continues with
  Sonnet WPs whose deps are met. Antigravity WPs are run either (a) by Opus on the user's machine through
  `.agents/skills/agy-delegate/scripts/relay.mjs`, or (b) by the user pasting the ready brief from
  `docs/powertrain/antigravity/<WP>.md` into the Antigravity IDE. Opus reviews the result the same way in both cases.
- Every Antigravity brief is self-contained (Antigravity sees no chat), names the files it may touch, the gate
  command, and says "do not commit".

## 6. Work packages
Exec: AG = Antigravity, S = Sonnet, O = Opus. Every block WP = S implements → AG runs goldens → O reviews G1–G5.

| WP | Scope | Exec | Deps |
| --- | --- | --- | --- |
| 00 | Loop setup; baseline of §7 suites on the user's machine (cloud cannot `npm ci`, see ledger) | O | — |
| 01 | Inventory: `scripts/powertrain/pt_inventory.m` walks `toolbox/autoblks` libraries → `docs/powertrain/inventory.json` (library path, mask prompts/vars/units/defaults/popups, ports per variant with names, order, units, `Info` bus element names). O reconciles §2 | AG | 00 |
| 02 | Golden generator: `scripts/powertrain/pt_goldens.m` (block + params JSON + stimulus set → CSV, fixed `ode4` and `ode45` runs, one harness model per block built by `add_block`); O writes `ptParity.test.ts` harness | AG + O | 01 |
| 03 | Lookup tables (§2.R) + interpreter + C + conformance; G3 vs Simulink LUT blocks | S | 00 |
| 04 | Bus signals: ADR (O), `bus` value type, Bus Creator/Selector, Scope and TRM read bus elements, C as struct | S | 03 |
| 05 | Core gaps (§2.R row 3) + palette entries for `MEMORY`, `UNIT_DELAY` | S (+AG help) | 03 |
| 05b | Enabled/Triggered/Variant Subsystem, Goto/From | S | 05 |
| 09 | Stiff solvers (found while planning WP-31: wheel slip dynamics have sub-ms time constants, only explicit solvers existed, and `ode15s`/`ode23s` in `SolverOptions` silently ran Euler): `ode14x` (Simulink fixed-step implicit extrapolation, order 4, 1 Newton iteration, finite-difference Jacobian), `ode23tb` (variable-step TR-BDF2), per-step entry points for the canvas worker, solver menu entries; unknown names -> `UNSUPPORTED_SOLVER` error | S | 00 |
| 06 | Scaffold: `ptSpec.ts`, `ptMath.ts`, `index.ts`, registration in both palettes; O writes `ptContract.test.ts` (G1/G2 for every spec, help entry, palette entry in both palettes) | AG | 01, 03 |
| 07 | Symbols: `PtSymbol.tsx` with every `PtSymbolId`, `XBlockNode` hook, theme lint | AG | 06 |
| 08 | Spec transcription for **all** §2 blocks from `inventory.json` (ports, params, variants; no equations, not registered) | AG | 06 |
| 10 | Drive Cycle Source (+ `ptDriveCycles.ts` by AG), Longitudinal Driver | S | 08 |
| 11 | Vehicle Body 1DOF / 3DOF Longitudinal | S | 08 |
| 12 | Longitudinal Wheel (all brake and tyre variants) | S | 08 |
| 13 | Couplings (8 blocks) | S | 08 |
| 14 | Final drive (open, LSD, transfer case, active if present) | S | 13 |
| 15 | Transmissions (fixed gear, AMT, DCT, CVT, manual if present) | S | 13 |
| 16 | Transmission controllers (AMT, DCT, CVT) | S | 15 |
| 17 | Batteries (datasheet, ECM, estimation ECM) | S | 08 |
| 18 | Starter, alternator, DC-DC | S | 17 |
| 19 | Mapped Motor, SPMSM, IPMSM (shared dq helper, F8) | S | 08 |
| 20 | Induction Motor, Flux-Based PMSM | S | 19 |
| 21 | Three-Phase Voltage Source Inverter (+ mapped inverter if present) | S | 19 |
| 22 | Motor controllers (SPM, IPM with MTPA/FW, IM, Flux-Based) | S | 20, 21 |
| 23 | Mapped SI/CI/Core Engine | S | 08 |
| 24 | SI/CI Controller | S | 23 |
| 25 | Fundamental flow (control volume, boundary, restriction, heat exchanger, throttle, exhaust if present) | S | 08 |
| 26 | Boost (compressor, turbine, boost drive shaft) | S | 25 |
| 27 | SI/CI Core Engine | S | 25, 26 |
| 28 | Remaining inventory-only blocks (one WP per sub-library, planned after WP-01) | S | 08 |
| 30 | Embedded C for every eligible block (non-eligible ones get `codegen: false` + `reason`) | S | 10–28 |
| 31 | Reference apps: Conventional vehicle, Electric vehicle (X-Bridges example workspaces built from factories) + system parity | AG + O | 16, 22, 23 |
| 32 | Reference apps: HEV P0/P1/P2/P3/P4, multimode, input power-split; supervisory control as ADIA state machines | AG + S | 31 |
| 33 | Reference apps: SI/CI engine dynamometer | AG | 24, 27 |
| 34 | Integration: help (AG), AI catalog (O fingerprint), DOE parameters, TRM targets incl. bus elements, properties-panel table editor (paste from Excel/MATLAB) (S) | S + AG | 30 |
| 35 | Simulink exchange: PT type ↔ Simulink library path map for the existing export path (`generate_simulink_model.m`, `simulink_integration_guide.md`) | AG | 34 |
| 36 | Close-out: all suites, `tsc --noEmit`, `lint:theme`, run the app, screenshots, parity report (G1–G5 per block), PR | O | 35 |

## 7. Suites
- Always: `npx vitest run src/engine/xbridges/powertrain --reporter=dot`
- WP-03/04/05/30: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts --reporter=dot`
- WP-04/05/06/07/34: `npx vitest run src/engine/xbridges/BlockDefinitions.test.ts src/help/blockReference.test.ts src/services/ai/catalog/xbridgesCapabilityIndex.test.ts src/components/xbridges --reporter=dot`
- WP-34: `npx vitest run src/engine/trmSim src/engine/doe/xbridgesIntegration.test.ts --reporter=dot`
- Never the whole `src/utils` directory (a state-machine test creates and deletes build folders).

## 8. Rules for every executor
- New code in `src/engine/xbridges/powertrain/` and `src/components/xbridges/powertrain/`; other files only when the
  brief lists them.
- Never edit an acceptance test, the ledger, the catalog fingerprint, `.adia` files, `package.json`, lockfiles.
- Never invent ports, parameters, units or equations; unclear published equation → `blocked` with the missing spec.
- No MathWorks images, icon files or shipped calibration tables in the repository. Goldens contain only outputs of
  runs with our parameters.

## 9. Risks
- R1 Stiff drivetrains: goldens use the same solver both sides; examples default to `ode45` + zero crossings.
- R2 `BlockDefinitions.ts` gets only spread/category lines (F1).
- R3 Leak through F9: registration only after G1–G4.
- R4 Some blocks (core engines, flux-based PMSM) are large; their WPs may split after WP-01 sizes them.
- R5 G3 needs a Powertrain Blockset licence on the user's MATLAB (Q3). Without it, G1/G2 come from the inventory only
  if the library can be opened, and G4 is the gate.

## 10. Questions for the user (defaults taken unless the user says otherwise)
- Q1 Symbols: original look-alike SVG (default), not MathWorks artwork.
- Q2 Default maps: from published analytic models (default); the user pastes real tables.
- Q3 Is Powertrain Blockset licensed on the user's MATLAB R2024b? (needed for WP-01 and G3 goldens)
- Q4 Antigravity: is `agy` installed and signed in on the user's machine (route a), or will the user paste briefs into
  the Antigravity IDE (route b)? Default: route b until `agy models` is seen working.
- Q5 Order: P1 groups first (WP-03, 04, 06–08, 10–13, 17, 19, 23, 31), then the rest (default).
