# Powertrain blockset for X-Bridges (plan)

Planner/reviewer and acceptance-test author: Opus (main session). Executor: Sonnet `pt-executor`, one WP at a time.
Loop: `.claude/skills/pt-blockset-loop/SKILL.md`. Ledger: `docs/powertrain/ledger.json` (planner owns it).
Branch: `claude/nice-ritchie-ighzje`, PR into `co-work`. Never `git add -A`. Never edit `.adia` files.
Never weaken, skip or delete a test.

## 0. User mandate (2026-10-20)
"Add the Powertrain Blockset from MATLAB Simulink to the X-Bridges application and make sure it works
perfectly with our application. Copy the symbols, the ports and the mathematical equations so it is strong
for modelling in ADIA. Opus as planner and reviewer, Sonnet as executor."

What "copy" means here (decision, see §8 Q1):
- **Ports**: same names, same order, same direction and same units as the Simulink block. A model drawn
  in Simulink can be redrawn in X-Bridges block for block, wire for wire.
- **Parameters**: same names (mask prompt text as the label, the variable name as a tooltip), same units,
  same physical bounds.
- **Equations**: implemented from the published equations in the Powertrain Blockset reference pages and
  the textbooks they cite. Every block's `equation` and help entry states them.
- **Symbols**: MathWorks' icon artwork is copyrighted. We draw our own SVG symbols that follow the
  same engineering convention (a battery looks like a battery cell, a clutch like two plates, a planetary
  like sun/carrier/ring), so the user recognises the block at a glance. We never trace or embed
  MathWorks images.
- **Default calibration data** (engine, motor and battery maps): MathWorks' shipped default tables are
  their data. Defaults are generated from published analytic models (Willans line for engines, loss
  model for motors, published cell OCV curves) and documented; the user pastes their own tables. Public
  regulatory data (drive cycles) is copied as published.

## 1. Findings (baseline: `claude/nice-ritchie-ighzje` at 49f07cf)
- F1 The library is one file: `src/engine/xbridges/BlockDefinitions.ts` (11.8k lines, 1.1 MB),
  `BLOCK_LIBRARY` at `:912`, `XBRIDGES_CATEGORIES` at `:11511`. Block shape is `XBlock`
  (`src/engine/xbridges/types.ts`): `execute`, optional `evaluateDerivatives` (continuous states,
  solved by the engine's RK/ODE solvers), `ZeroCrossingFn`, `isStateful`, `equation`, `description`.
- F2 **Two palettes.** The canvas uses `XBRIDGES_CATEGORIES` from `BlockDefinitions.ts`
  (`XbridgesWorkspace.tsx:26`, `XBlockNode.tsx:14`); help (`help/blockReference.ts:2`) and the AI
  catalog (`services/ai/catalog/xbridgesCapabilityIndex.ts:2`) use a different list in
  `src/utils/xbridges/XbridgesLibrary.ts`. A new category added to only one is invisible in the other.
- F3 Block symbols are Lucide icons picked by name (`XBlockNode.tsx:17` `LucideIconMap`); a few types
  have custom bodies (`XBlockNode.tsx:2213+`). There is no per-block SVG symbol mechanism.
- F4 **No lookup-table block exists** (no 1-D or 2-D LUT, no `interp2`). Every mapped Powertrain block
  (Mapped SI/CI Engine, Mapped Motor, Datasheet Battery, Torque Converter, shift schedules) needs one.
- F5 Embedded C is opt-in per block type: `src/utils/stateMachine/xbCapabilities.ts` (registry,
  conformance case ids), emitters in `xbCGenerator.ts` (`:1947` table, `:3819` switch), interpreter in
  `xbInterpreter.ts`, semantic lowering in `xbSemanticBuilder.ts`, paired cases in
  `xbCConformanceCases.ts`. A type not in the registry is "not eligible for C", which is honest and
  allowed.
- F6 Units are sparse (TRM plan F5: 81 of 954 catalog ports). `xbridgesCapabilityIndex.test.ts:63`
  records `unknown` for missing units; powertrain blocks must have every unit filled.
- F7 Existing motor-control blocks (`IM_FOC_CONTROL`, `AC_INDUCTION_MOTOR`, `MTPA_CONTROLLER`,
  `FIELD_WEAKENING`, `FIELD_ORIENTED_CONTROL`, `CURRENT_CONTROLLER_DQ`) and V-Lab machine models
  (`src/engine/vlab/pmsmModel.test.ts`, `bldcMotorModel.test.ts`) already hold dq equations. Powertrain
  machine blocks reuse that math through a shared helper; no second copy of the equations.
- F8 Anything built from `BLOCK_LIBRARY` automatically reaches the headless engine, DOE, the TRM
  simulation runner (`src/engine/trmSim/xbRunner.ts`), state-embedded X-Bridges and the AI catalog, so
  new blocks must be correct before they are registered (a bad block leaks everywhere).
- F9 Tests: `BlockDefinitions.test.ts`, `help/blockReference.test.ts` (every factory documented,
  symbols/terminals derived from live palettes), `xbridgesCapabilityIndex.test.ts` (catalog fingerprint),
  `xbCapabilities.test.ts`, `xbCGenerator.test.ts`, `xbInterpreter.test.ts`. Adding blocks changes the
  catalog fingerprint; that test is updated by the planner, never by the executor.
- F10 MATLAB R2024b is on the user's Windows machine (`vlab-executor.md`); the cloud has none. Powertrain
  Blockset installs under `toolbox/autoblks` (to confirm in WP-01).

## 2. Block inventory (target; WP-01 replaces it with the authoritative list from MATLAB)
Simulink library path → X-Bridges type (`PT_` prefix) → palette category. Priority P1 = first release.

| Sub-library | Blocks | Prio |
| --- | --- | --- |
| Drivers & Sources | Drive Cycle Source `PT_DRIVE_CYCLE`, Longitudinal Driver `PT_LONG_DRIVER` | P1 |
| Vehicle | Vehicle Body 1DOF Longitudinal `PT_VEHICLE_1DOF`, Longitudinal Wheel `PT_LONG_WHEEL` | P1 |
| Couplings | Torsional Compliance `PT_TORSIONAL_COMPLIANCE`, Rotational Inertia `PT_ROT_INERTIA`, Disc Clutch `PT_DISC_CLUTCH`, Torque Converter `PT_TORQUE_CONVERTER` | P1 |
| Gears & Differentials | Ideal Fixed Gear Transmission `PT_FIXED_GEAR`, Open Differential `PT_OPEN_DIFF`, Limited Slip Differential `PT_LSD`, Planetary Gear `PT_PLANETARY`, Ravigneaux Gear `PT_RAVIGNEAUX` | P1 (Ravigneaux P2) |
| Transmissions | Manual / Automated Manual `PT_AMT`, Dual Clutch `PT_DCT`, CVT `PT_CVT`, Transmission Controller `PT_TCU` | P2 |
| Energy Storage | Datasheet Battery `PT_BATT_DATASHEET`, Equivalent Circuit Battery `PT_BATT_ECM`, DC-DC Converter `PT_DCDC` | P1 |
| Electric Machines | Mapped Motor `PT_MAPPED_MOTOR`, Surface Mount PMSM `PT_SPMSM`, Interior PMSM `PT_IPMSM`, Induction Motor `PT_INDUCTION_MOTOR` | P1 (IM P2) |
| Motor Controllers | IPMSM Torque Control `PT_IPMSM_TCTRL`, SPMSM Torque Control `PT_SPMSM_TCTRL`, IM FOC `PT_IM_FOC`, Mapped Inverter efficiency `PT_INVERTER_MAPPED` | P2 |
| Combustion (mapped) | Mapped SI Engine `PT_MAPPED_SI`, Mapped CI Engine `PT_MAPPED_CI`, SI Engine Controller `PT_SI_ECU`, CI Engine Controller `PT_CI_ECU` | P1 (ECUs P2) |
| Combustion (core) | SI Core Engine, CI Core Engine, Throttle, Compressor, Turbine, Boost Drive Shaft, Control Volume System, Flow Restriction, Heat Exchanger | P3 |
| Auxiliary | Starter, Reduced Lundell Alternator | P3 |
| Fuel cell | per WP-01 inventory (only if present in the installed release) | P3 |

Blocks the inventory lists that are not in this table are added as P3 rows; blocks in this table that the
inventory does not have are deleted from the plan (never invented).

## 3. Contracts (fixed)
### 3.1 Module layout — `src/engine/xbridges/powertrain/`
- `ptSpec.ts` — the single source of truth per block:
  ```ts
  interface PtPortSpec { id; name; direction: 'input'|'output'; unit: string; simulinkIndex: number;
                         dimensions?: number[]; description: string }
  interface PtParamSpec { name; label; unit: string; default: number|number[]|number[][]|string;
                          min?: number; max?: number; minExclusive?: boolean; kind: 'scalar'|'vector'|'table'|'enum';
                          axisOf?: string /* LUT table → its breakpoint params */ }
  interface PtBlockSpec { type: `PT_${string}`; label; category: PtCategory; simulinkPath: string;
                          symbol: PtSymbolId; inputs: PtPortSpec[]; outputs: PtPortSpec[]; params: PtParamSpec[];
                          states: string[]; equations: string[]; references: string[]; description: string }
  ```
- `ptMath.ts` — shared, pure, unit-tested numerics: `interp1(x, xs, ys, mode)`, `interp2(x, y, xs, ys, T, mode)`
  (`mode = 'clip' | 'linear-extrap'`; breakpoints strictly increasing, validated once at build),
  `smoothSign(x, eps)`, `magicFormula(kappa, B, C, D, E)`, `gearEfficiencyLoss(T, w, eta)`,
  `rpm2radps`, `radps2rpm`. No `||` on numbers anywhere in the module.
- `ptDriveCycles.ts` — public cycles (FTP-75, HWFET, US06, NEDC, WLTP Class 3b, JC08) as `[t_s, v_mps]`,
  with source cited in the file header.
- `blocks/<category>.ts` — one file per category, each exporting `PT_SPECS: PtBlockSpec[]` and
  `PT_FACTORIES: Record<string, (id, params) => XBlock>`.
- `index.ts` — `POWERTRAIN_SPECS`, `POWERTRAIN_FACTORIES`, `POWERTRAIN_CATEGORIES` (palette entries generated
  from the specs).
- Registration: `BLOCK_LIBRARY` spreads `POWERTRAIN_FACTORIES`; **both** palettes (`BlockDefinitions.ts`
  `XBRIDGES_CATEGORIES` and `utils/xbridges/XbridgesLibrary.ts`) append `POWERTRAIN_CATEGORIES` from the same
  import (fixes F2 for these blocks without touching the rest).
- A factory builds ports only from its spec (`createPort` with `unit` set); a factory never adds a port the
  spec does not list, and the spec never lists a port the Simulink block does not have.

### 3.2 Block semantics
- Signal-flow, like the Simulink blocks: torque in / speed out, or speed in / torque out, exactly as the
  Simulink block's ports. Units SI at the port (`N*m`, `rad/s`, `m/s`, `A`, `V`, `W`, `K`, `kg/s`), as Simulink.
- Continuous states use `evaluateDerivatives` (the engine's solvers integrate them); discrete logic
  (gear, clutch lock state, shift timers) uses `execute` + `nextState`. Stick/slip and gear shifts declare
  `ZeroCrossingFn` so variable-step solvers bracket them.
- Parameter validation at build: out-of-bounds or non-monotonic breakpoints produce a block `error`
  (`execute` returns `{ error }`), never a silent clamp or `NaN`.
- Zero, negative and fractional values are valid where physical (grade angle, regen torque, negative
  current = charge, following Simulink sign conventions; sign convention stated per block).

### 3.3 Symbols — `src/components/xbridges/powertrain/PtSymbol.tsx`
- `PtSymbolId` union (battery, ecm-battery, dcdc, motor-mapped, pmsm, im, inverter, engine-si, engine-ci,
  ecu, clutch, torque-converter, compliance, inertia, gear, differential, lsd, planetary, ravigneaux,
  transmission, cvt, wheel, vehicle, driver, drive-cycle, …): original inline SVG, `currentColor` + theme
  tokens only (`npm run lint:theme` passes), 48×32 viewBox.
- `XBlockNode.tsx`: when `data.type` is a powertrain type, render `<PtSymbol id=…/>` in the body instead of
  the Lucide icon. Port handles are positioned by `simulinkIndex` (inputs left, outputs right, in Simulink order).

### 3.4 Verification standard (every block, acceptance tests written by Opus before dispatch)
1. **Port contract**: names, order, direction, units equal the spec; spec equals the WP-01 inventory row.
2. **Equations**: expected values computed independently in the test (closed form, hand calculation,
   or a tiny reference integrator written in the test), never by calling the code under test.
   Each block has at least: one steady state, one transient against an analytic solution, one limit/saturation
   case, one sign-convention case, and an energy/power balance where one exists
   (`P_in = P_out + P_loss` within 1e-9 relative for static blocks, within solver tolerance for dynamic ones).
3. **Engine path**: the block runs inside `XbridgesEngine` (compile → step with RK4/ode45), not only `execute()`.
4. **Simulink goldens (optional, never blocking)**: when the user produces them (WP-01 script), CSVs under
   `tests/fixtures/powertrain/goldens/` are compared at the documented tolerance in `ptGoldens.test.ts`.
   Missing goldens are reported in the ledger, not skipped in a test.
5. **Help**: `help/blockReference.test.ts` passes (equations, parameters explained, symbol and terminals).

## 4. Work packages
| WP | Scope | Deps |
| --- | --- | --- |
| 00 | Loop setup (agent, skill, ledger, this file); baseline: record pass/fail of the suites in §5 | — |
| 01 | Inventory (user's machine, MATLAB): `scripts/powertrain/pt_inventory.m` walks `toolbox/autoblks` libraries, writes `docs/powertrain/inventory.json` (path, mask prompts/vars/units/defaults, Inport/Outport names and order, port units). Optional `pt_goldens.m` runs each P1 block on the §3.4 stimuli and writes CSV goldens. Planner reconciles §2 | 00 |
| 02 | Lookup tables (core X-Bridges, also Simulink parity): `LOOKUP_1D`, `LOOKUP_2D` blocks + `ptMath.interp1/interp2`; interpreter, C emitter, capability entry, paired conformance case `PT-INT/C99-LOOKUP` | 00 |
| 03 | Scaffold: `ptSpec.ts`, `ptMath.ts` (rest), `index.ts`, registration in both palettes, `PtSymbol.tsx` + `XBlockNode` hook, spec-contract test `powertrain/ptContract.test.ts` (iterates every spec: factory exists, ports from spec, units non-empty, params in bounds, palette entry in both palettes, help entry) | 01, 02 |
| 10 | Drivers & sources: `PT_DRIVE_CYCLE` (+ `ptDriveCycles.ts`), `PT_LONG_DRIVER` (PI + feedforward on speed error, anti-windup, accel/decel commands in [0,1]) | 03 |
| 11 | Vehicle: `PT_VEHICLE_1DOF` (m·ẍ = F_xf + F_xr − ½ρC_dA(ẋ−w)²·sgn − m g sinθ; axle normal loads with weight transfer; rolling resistance), `PT_LONG_WHEEL` (rolling radius, slip κ, magic-formula F_x, rolling resistance, brake torque with stick/slip) | 03 |
| 12 | Couplings: `PT_TORSIONAL_COMPLIANCE`, `PT_ROT_INERTIA`, `PT_DISC_CLUTCH` (stick/slip with static/kinetic μ, effective radius, lock/unlock zero crossings), `PT_TORQUE_CONVERTER` (K-factor and torque-ratio vs speed ratio via `interp1`, lock-up) | 03 |
| 13 | Gears & differentials: `PT_FIXED_GEAR`, `PT_OPEN_DIFF`, `PT_LSD`, `PT_PLANETARY` (Willis: ω_s·N_s + ω_r·N_r = ω_c·(N_s+N_r); torque balance; efficiency by power-flow direction) | 03 |
| 14 | Energy storage: `PT_BATT_DATASHEET` (OCV(SOC,T), R(SOC,T) maps; SOC = SOC₀ − ∫I dt / (3600·C); terminal V = OCV − I·R), `PT_BATT_ECM` (R0 + n RC branches, n = 1..3; optional thermal node), `PT_DCDC` (mapped efficiency, power balance) | 03 |
| 15 | Electric machines: `PT_MAPPED_MOTOR` (torque envelope vs speed, loss map, electrical power, time constant), `PT_SPMSM`, `PT_IPMSM` (dq: v_d = R i_d + L_d di_d/dt − ω_e L_q i_q; v_q = R i_q + L_q di_q/dt + ω_e(L_d i_d + ψ); T = 1.5 p [ψ i_q + (L_d − L_q) i_d i_q]) through one shared dq helper reused from existing blocks (F7) | 03 |
| 16 | Combustion mapped: `PT_MAPPED_SI`, `PT_MAPPED_CI` (torque, fuel flow, air mass flow, emissions maps vs speed and command; idle and fuel cut; default maps from Willans line) | 03 |
| 17 | Transmissions: `PT_AMT`, `PT_DCT`, `PT_CVT`, `PT_TCU` (upshift/downshift schedules vs speed and pedal, hysteresis, shift timing) | 12, 13 |
| 18 | Motor controllers & inverter (P2): `PT_IPMSM_TCTRL`, `PT_SPMSM_TCTRL` (MTPA + field weakening reuse of `MTPA_CONTROLLER`/`FIELD_WEAKENING` math), `PT_IM_FOC`, `PT_INVERTER_MAPPED` | 15 |
| 19 | Engine controllers (P2): `PT_SI_ECU`, `PT_CI_ECU` | 16 |
| 20 | Embedded C: capability entries + emitters for every block whose math is statically bounded (all P1 except stick/slip zero-crossing variants, which stay `codegen: false` with a `reason`); one paired interpreter/C99 conformance case per block | 10–16 |
| 21 | Reference applications (X-Bridges workspaces built only through `BLOCK_LIBRARY` factories, as test fixtures and as palette "Examples"): **EV** (drive cycle → driver → controller → mapped motor → fixed gear → differential → wheels → vehicle; battery + DC-DC) and **Conventional** (mapped SI → clutch → AMT → differential → vehicle). Acceptance: FTP-75 speed trace tracked within 2 km/h RMS, battery energy = ∫V·I dt within 0.5 %, wheel-to-battery energy balance closes within 1 %, fuel used vs ∫ṁ_f dt exact | 17, 18 |
| 22 | Integration: help entries + guidance (`help/blockGuidance.ts`), AI catalog (fingerprint updated by planner), DOE parameters, TRM sim targets (motor speed requirement verified on the EV example, as TRM WP-11 does), properties panel table editor for `kind: 'table'` params (paste from Excel/MATLAB) | 20, 21 |
| 23 | P3 blocks (combustion core, auxiliary, fuel cell) — planned after WP-22 from the inventory; one WP per sub-library | 22 |
| 24 | Close-out (Opus): all §5 suites, `npx tsc --noEmit`, `npm run lint:theme`, run the app (`run` skill) and screenshot the palette, an EV example run and the scope; PR into `co-work` | 22 |

## 5. Suites per WP
- Always: `npx vitest run src/engine/xbridges/powertrain --reporter=dot`
- WP-02, 20: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts --reporter=dot`
- WP-03, 22: `npx vitest run src/engine/xbridges/BlockDefinitions.test.ts src/help/blockReference.test.ts src/services/ai/catalog/xbridgesCapabilityIndex.test.ts src/components/xbridges --reporter=dot`
- WP-22: `npx vitest run src/engine/trmSim src/engine/doe/xbridgesIntegration.test.ts --reporter=dot`
- Never the whole `src/utils` directory (a state-machine test creates and deletes build folders).

## 6. Rules for the executor (also in `.claude/agents/pt-executor.md`)
- New code lives in `src/engine/xbridges/powertrain/` and `src/components/xbridges/powertrain/`; any other
  file only when the brief lists it (registration lines, `XBlockNode` hook, codegen tables).
- Never edit an acceptance test, the ledger, the catalog fingerprint, `.adia` files, `package.json` or lockfiles.
- Do not invent ports, parameters, units or equations. A block whose published equation is unclear is
  reported `blocked` with the missing spec.
- No MathWorks images, icon files or shipped calibration tables in the repository.

## 7. Risks
- R1 Stiff drivetrains (clutch lock, compliant shafts) need variable-step solvers: examples default to `ode45`
  with zero-crossings; fixed-step tests use a step chosen from the highest natural frequency (stated in the test).
- R2 The 1.1 MB `BlockDefinitions.ts` is not extended with block bodies: only one spread line, one category
  line (F1).
- R3 A powertrain block leaks into DOE/TRM/AI immediately (F8): registration (WP-03) puts each block behind
  its contract test; a block is added to `POWERTRAIN_FACTORIES` only in the WP that verifies it.

## 8. Open questions for the user (defaults taken unless the user says otherwise)
- Q1 Symbols: original look-alike SVG symbols (default) — not MathWorks artwork.
- Q2 Default maps: generated from published analytic models (default); the user pastes real tables.
- Q3 Goldens: the user runs `pt_goldens.m` on the Windows machine when convenient; analytic tests are the
  acceptance gate meanwhile.
- Q4 Scope of first release: P1 rows of §2 (default), then P2, then P3.
