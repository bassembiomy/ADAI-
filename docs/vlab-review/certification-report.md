# V-Lab Simscape-class review: certification report (WP-50)

Date: 2026-10-07. Branch `co-work`. Reference used throughout: published governing equations (Simscape/Simulink documentation, textbooks, analytical solutions), per the user mandate of 2026-10-05 (plan section 0). No Simscape golden data exists (MATLAB on this machine is a partial install, F-021), so the "simscape" column of the block matrix is `pending`, not `pass`.

Headline: the V-Lab certification run passes (116 test files, 5467 tests passed, 14 expected failures, 10 skipped, 0 failed; `tsc` clean; production build succeeds; e2e smoke passes). This is not "everything is fixed". Section 7 and the "Deviations and known gaps" section list what remains: 2 unsupported blocks, 9 multibody blocks with generic labels, rigid-body dynamics deferred, no Simscape goldens, and a list of missing library blocks.

---

## 1. Root causes found (systemic) and where each was fixed

| # | Root cause | Finding | Fixed in |
|---|---|---|---|
| 1 | Unwired optional inputs read as 0 (not `undefined`), so the "parameter fallback" never fired and blocks silently used 0 | F-010 | WP-05 (commit c4cdc6f1 + 79b41365 + 0b704528); residual cases routed and closed in the domain WPs |
| 2 | 169 `params.X \|\| default` numeric fallbacks: a valid 0, a negative or a fraction was replaced by the default | (stats) | WP-08 `caf2ecc7` (`vlabParams.ts`: `numericParam`, min/max/exclusive/nonZero bounds). Now 0 |
| 3 | Name-based grounding: unconnected ports named b/c/n/ref/gnd were pinned to ground; thermal_ref pinned at 293.15 K | F-064, F-011 | Electrical WP-10 `1fa0ca6e`; mechanical WP-13 `7a7696c5`; thermal/magnetic WP-15 `2974cd95`; fluid/gas WP-17 `65973561`. Explicit references plus floating-network diagnostics |
| 4 | 386 ports (145 blocks) had no domain; domains were implicit | F-017 | WP-06a `ef77be88`, WP-06b `2a5a88d8`. Now 0 |
| 5 | Signal ports had no direction; the DAE assembler guessed outputs from port names (18 inputs got spurious branches, outputs got none) | F-030, F-026, F-036, F-037 | WP-07 `eebc310e`, WP-09a `b400d7fa` (direction-driven branches, exact handle parsing) |
| 6 | DAE row padding/truncation: residual length did not match allocated unknowns in 46 blocks; extra rows dropped, missing rows zero-filled | F-025 | WP-09a: allocation/residual agreement check plus pre-solve structural rank (`DAEStructureError`) |
| 7 | Silent NaN to 0 and per-evaluation `catch` returning zeros | F-045 | WP-09b `1389e880` (`NonFiniteResidualError`, `BlockEquationError`, `ScopeReadError`) |
| 8 | First-order integration even with BDF2 enabled (only "differential state" variables used the BDF2 stencil) | F-067, F-058 | WP-31a `5939bd21`: one stencil helper `vlabDiscretization.ts`, observed order 1.0 to 1.9-2.0 |
| 9 | Uncontrolled local truncation error: LTE norm covered only `_state_` variables; first BDF1 step had no estimate | F-103 | WP-31b `7624ab67` (LTE on all differentiated variables) |
| 10 | Event stalls: zero-crossing clamp and re-trigger froze the step; located edges accepted up to 1 us late (buck duty drift 2 %) | F-084, F-101, F-085 | WP-11 `fae0c028`, WP-31b (Illinois event location) |
| 11 | Solver hang (infinite loop in gas_pipe/gas_reservoir, ma_chamber) and stale acceptance at the minimum step | F-007, F-008, F-095, F-050 | WP-04 `79b41365` (rejected-step budget), WP-31b (total work + 60 s wall-clock guard, typed `VLabSolverDiagnosticError`, no stale accept) |
| 12 | Singular pivots silently regularized to 1e-12 | F-051 | WP-31b (singular diagnostics) |
| 13 | Performance: dense numeric Jacobian made labs take 16-22 s each, FOC test 123 s | F-079, F-106 | WP-31c `5e590071` (coloured sparse Jacobian, modified Newton, sparse LU, DD3 BDF2 LTE): FOC 123 s to 6.8 s |
| 14 | Scope/probe routing by name, scalar reads of vector/Frame signals, no quantity/unit | F-026 | WP-09b, WP-09c `622534bc` (width/channel names, composite three-phase ports) |
| 15 | Fixtures that passed even when the solver errored (16 blocks) | F-012, F-041 | WP-05 (errors are failures), WP-30 `1bc9bdb1` (benchmarks assert closed forms; 3 inverted wirings fixed) |
| 16 | Placeholder equations whose behaviour contradicted the printed equation (ps_dead_zone, ps_delay, ps_max/min, ps_rms, sequence analyzer, ...) | F-042, F-052, F-063, F-065, F-077, F-086 | WP-20a, commit `21d72a36` |
| 17 | Controllers/estimators/transforms had no implementation (13 blocks explicitly unsupported) | F-046, F-073 | WP-09c, WP-20b `3f4f406b` (`vlabControllers.ts`) |

Inverted or non-conserving signs found and fixed per domain:

- Electrical: transformer ratio convention (N vs N12), capacitor v0 / inductor i0 ignored, opamp clamp parameter (WP-10).
- Machines/power electronics: dc_motor Kt != Ke created or destroyed energy; microwave_inverter created energy; labs grounded the star point and produced 1642 A of zero-sequence current (now 2e-14 A) (WP-12a/12b, F-080).
- Mechanical: belt_end tension sign, hidden mass/inertia damping, friction model (WP-13); em_converter negative inductance, gas_*_conv non-conserving, belt_end (WP-13b).
- Thermal/magnetic: permanent magnet negative reluctance, reluctance_force used velocity as position, mmf sensor shorted the path, fundamental_reluctance ignored l/(mu A), heater energy not conserved (WP-15, F-044).
- Fluid/gas: gas_flow_sensor, mass_flow_source, ma_moisture_source signs; open fluid ports (WP-17).
- Appliances: magnetron current sign, washing_basket torque vs speed, microwave_cavity Stefan-Boltzmann constant (WP-21).
- Test fixtures: 3 inverted benchmark wirings and the whitebox torque-source sign (WP-30, F-090).

---

## 2. Before / after statistics

BEFORE = ledger `stats_before` (WP-03, 2026-10-05). AFTER = recomputed on 2026-10-07 from `contract.test.ts` (regenerates `contract-status.md`), `scripts/vlab_review/genBlockMatrix.ts`, and greps listed below.

| Metric | Before | After |
|---|---|---|
| Live blocks | 248 | 248 |
| Ports | 751 | 782 (new Frame/composite/vector ports; interface ports redesigned) |
| Ports without domain | 386 | 0 |
| Affected blocks (at least one port without domain) | 145 | 0 |
| Generic equation labels | 101 | 9 (all multibody, WP-19b deferred) |
| Unsafe numeric fallbacks (`params.X \|\|` in vlabEquations.ts) | 169 | 0 |
| DAE allocation mismatch blocks | 46 | 0 |
| Fully certified blocks (all 11 contract checks pass, no expected failure) | 45 | 237 of 248 |
| Expected-failure (ratchet) entries | 404 at WP-03 (264 after WP-06b) | 12 on 11 blocks |
| Unsupported blocks (`UNSUPPORTED_BLOCKS`) | 21 (introduced by WP-09a) | 2 (`ma_separator`, `ma_selector`) |
| Classification | physical 110, signal 73, measurement 20, source 33, utility 12 | physical 111, signal 73, measurement 20, source 33, utility 11 |

Recompute notes:
- Generic labels: contract metric (`isGenericText` on equation or description) = 9. A direct grep for the literal phrase "governing physical equation" in non-test V-Lab sources also returns 9.
- Unsafe fallbacks: contract metric on `vlabEquations.ts` = 0. A grep of all non-test files in `src/engine/vlab` finds 1 match, which is a comment in `vlabParams.ts` quoting the old pattern.
- Per-check results (248 blocks): unique-ids, classification, port-domains, equation-factory, params-hidden, dae-allocation, scope-routing, finite-residual all 248/248 pass; params-dead 247 (1 expected failure, ma_separator); unsupported 246 (2 expected); equation-doc 239 (9 expected).
- Caveat: the separate inventory heuristic (`inventory-gaps.md`) still reports 18 blocks with "dead params" and 142 blocks with "library ports never read". These are trace-based heuristics (outputs written through DAE branches look unread; the 25 blocks whose trace throws are unknown). The authoritative per-block result is the contract check; the heuristic numbers are listed for transparency, not claimed as fixed.

Block matrix (`docs/vlab-review/block-matrix.json`, regenerated): ports 248 pass; params 247 pass + 1 expected failure; equation 246 pass + 2 expected failures; ui 248 pass; help (equation text) 239 pass + 9 expected failures; conservation `tested-by-domain-suite` for 164 physical/source/measurement blocks (not a per-block contract check, see test list in section 5), `n/a` for 84; simscape `pending` for 164, `n/a` for 84 signal/utility blocks. No block has simscape = pass.

---

## 3. Files changed (`git diff --stat f1dde9a3..HEAD -- src/engine/vlab src/components/vlab src/utils/vlab* src/services/vlabWorkerClient* benchmarks scripts/vlab_review tests/e2e/vlab-smoke.spec.ts`)

Total: 183 files changed, 33,356 insertions, 5,210 deletions (114 added, 68 modified, 1 deleted: `vlabConnectionValidation.test.ts`, replaced by the `.tsx` version). 58 commits in the range; the commits prefixed or tagged `vlab` / WP-xx are the V-Lab loop, the rest are other sessions' SysML/help/toolbar commits.

Largest modified files: `src/utils/vlabLibrary.ts` (+4454/-1290), `vlabEquations.ts` (+1529/-1461), `vlabPhysics.ts` (+856/-212), `DAEAssembler.ts` (+810/-260), `vlabModelMigration.ts` (+551/-10), `vlabComponentDefinitions.ts` (+397/-372).

New files by area:
- Engine core (`src/engine/vlab/`): `SparseLU.ts`, `vlabJacobian.ts`, `vlabDiscretization.ts`, `vlabHistory.ts`, `vlabParams.ts`, `vlabStructure.ts`, `vlabDiagnostics.ts`, `vlabResidualDiagnostics.ts`, `vlabScopeRead.ts`, `vlabRequiredPorts.ts`, `vlabTopologyValidation.ts`, `vlabConnectionRules.ts`, `vlabVectorPorts.ts`, `vlabWorkerCore.ts`.
- Domain references/physics: `vlabElectricalReference.ts`, `vlabMechanicalReference.ts`, `vlabThermalMagneticReference.ts`, `vlabFluidReference.ts`, `vlabFluidProperties.ts`, `vlabControllers.ts`, `vlabJointCore.ts`, `vlabJointInitialization.ts`, `vlabUniversalJoint.ts`, `vlabDomainFixture.ts`.
- Review harness (`src/engine/vlab/review/`): 23 `*.test.ts` files plus `blockClassification.ts`, `contractChecks.ts`, `contractExpectedFailures.ts`, `contractInventory.ts`, `portDirections.ts`, `portQuantities.ts`, `requiredPorts.ts`, `vectorPortPlan.ts`, `perfFixtures.ts`.
- Simscape harness (`src/engine/vlab/simscape_benchmarks/`): `metrics.ts`, `runCase.ts`, `tolerances.ts`, `metrics.test.ts`, `simscape.test.ts`; `vlab_joint_linear_solver.test.ts`, `vlab_universal_joint.test.ts`.
- Benchmarks: `benchmarks/simscape/ENVIRONMENT.md`, `run_all.m`, and 10 cases (each with `case.json`, `vlab_model.json`, `build_<case>.m`).
- UI (`src/components/vlab/`): `VLabDiagnosticsPanel(.test).tsx`, `VLabMigrationBanner.tsx`, `VLabParamField(.test).tsx`, `vlabParamEditing.ts`, `vlabPortLayout.ts`, `vlabNode.css`, `vlabPaletteParity.test.tsx`, `vlabParamMigration.test.ts`, `vlabSaveOpenRoundTrip.test.ts`, `VLabWorkspace.ui.test.tsx`, `vlabConnectionValidation.test.tsx`.
- Scripts: `scripts/vlab_review/{inventory,genContractExpectedFailures,genPortDirections,genPortQuantities,genRequiredPorts}.ts`; added in WP-50 (uncommitted): `certify.ts`, `genBlockMatrix.ts`, `.github/workflows/vlab-certification.yml`.
- E2E: `tests/e2e/vlab-smoke.spec.ts`.
- Modified (not new): `DAEAssembler.ts`, `vlabPhysics.ts`, `ImplicitSolver`/solver files, `vlabEquations.ts`, `vlabLibrary.ts`, `vlabComponentDefinitions.ts`, `vlabModelMigration.ts`, `VLabWorkspace.tsx`, `VLabNode.tsx`, `VLabSimulinkScope.tsx`, `VLabSymbols.tsx`, `vlabWorkerClient.ts`, labs and existing tests.

Uncommitted at the end of WP-50 (V-Lab paths only): `docs/vlab-review/{block-matrix.json,inventory.json,inventory-gaps.md,certification-report.md}`, `scripts/vlab_review/{certify.ts,genBlockMatrix.ts}`, `.github/workflows/vlab-certification.yml`.

---

## 4. Blocks repaired, by domain (from ledger WP evidence)

- **Electrical (WP-10, 24 passive/source/sensor blocks):** certified against Simscape Foundation/Electrical equations; capacitor v0, inductor i0, opamp Vsat, transformer N12 = N1/N2 (legacy N migrated), floating-network diagnostic, 22 equation texts with units.
- **Semiconductors/switches (WP-11):** diode (Simscape PWL, continuous at Vf), nmos (Shichman-Hodges, C0/C1 boundaries, Vds<0 swap), igbt (ideal switching, hard gate), switch; zero-crossing stall fixed.
- **Machines (WP-12a):** dc_motor single k, ac_motor Krause rotor-flux model (Lls, Llr), pmsm dq + L0, bldc single Ke, three_phase_source composite abc + n.
- **Power electronics (WP-12b):** pwm 2-level (averaged and switched) and 3-level, vienna, thyristor 6/12-pulse gate logic, microwave_inverter loss-free; machines and inverters on composite abc ports.
- **Mechanical (WP-13):** Stribeck friction, hard stops (damped rebound, events), belt_end (tension-only + damping), mass/inertia hidden damping removed, spring initial deformation, explicit rot_ref/trans_ref grounding.
- **Gears/converters (WP-13b):** lever implemented, common_gear/rack_pinion, electromechanical converters, belt/cable, rot/trans multibody interfaces redesigned as the only scalar-to-Frame bridges.
- **Multibody joints (WP-19a):** revolute, prismatic, spherical, universal, weld on a shared constraint core (`vlabJointCore.ts`), 76 analytic tests (quasi-static).
- **Thermal and magnetic (WP-15):** 0 K thermal reference, absolute-K sensors, heater energy conserved, permanent magnet, reluctance_force, mmf sensor, fundamental_reluctance, CODATA sigma.
- **Fluid / isothermal liquid / steam / gas / moist air (WP-17):** laminar-turbulent orifice, isentropic choked gas restriction, Darcy-Weisbach gas pipe, IF97 steam h_fg, choked steam nozzle, cracking-pressure valves, steam_generator energy balance, moist-air chamber/pipe/converters/sensors, gas sensor symbols.
- **Physical signal (WP-20a, 40 blocks):** dead zone, max/min, switch, sequence analyzer (one-period Fourier), delay, RMS, moving average, flip-flop, sample-hold, integrator reset, stair, 2-D lookup, sine 3-phase.
- **Control/estimation (WP-20b):** controllers, estimators, motor/converter controllers, learning blocks, 13 previously unsupported blocks implemented, 35 vector ports.
- **Vector/composite infrastructure (WP-09c):** phase_splitter, clarke, inv_clarke, park, inv_park, sym_comp, inv_sym_comp, ps_sine_3phase, ps_demux_3.
- **Appliances/DOE/utilities (WP-21):** magnetron, microwave_cavity, washing_basket, air-fryer heater (now R = 35, F-044), legacy type aliases, doe_custom emits Physical + direction.
- **Engine (WP-31a/b/c) and cross-domain models (WP-30):** 8 connected models vs independent references (0.0002 % to 0.35 %).

---

## 5. Tests added

Per-file counts below are from the JSON vitest run of the certification suite (it.fails entries count as passed tests).

`src/engine/vlab/review/` (4574 tests in 23 files): contract 2737, params 545, scope_routing 289, dae_structure 257, multibody_joints 76, unwired_inputs 71, power_electronics 53, semiconductors 55, electrical_passive 51, gears_converters 50, signal_blocks 49, thermal_magnetic 44, vector_ports 43, mechanical 41, controllers 40, fluid_gas 37, machines 34, connections 32, appliances 18, performance 17, engine_robustness 15, connected_models 12, integrator_order 8.

Other new or rewritten V-Lab tests: `simscape_benchmarks/simscape.test.ts` 21 (11 pass, 10 golden-import skips) and `metrics.test.ts` 9; `vlab_universal_joint.test.ts` 23; `vlab_joint_linear_solver.test.ts` 4; `src/components/vlab/`: vlabParamMigration 64, VLabParamField 22, VLabDiagnosticsPanel 18, vlabSaveOpenRoundTrip 14, vlabConnectionValidation.tsx 12, vlabPaletteParity 4, VLabWorkspace.ui 5; `src/services/vlabWorkerClient.test.ts` 15; `tests/e2e/vlab-smoke.spec.ts` 1 scenario (2 Playwright projects).

Whole certification suite: 116 files, 5491 tests = 5467 passed + 14 expected failures (`it.fails`: 12 contract ratchet entries + 2 others) + 10 skipped (Simscape golden CSVs absent). The 12-entry ratchet map is in `contractExpectedFailures.ts`.

---

## 6. Verification commands and outputs (2026-10-07)

1. `npx tsx scripts/vlab_review/certify.ts` (exit 0, about 3.6 min):
```
[certify] (a) vitest V-Lab suites ...
    Test Files 116 passed (116)
    Tests      5467 passed | 14 expected fail | 10 skipped (5491)
[certify] (b) tsc --noEmit ...
    V-Lab tsc errors: 0; non-V-Lab (other work, not blocking): 0
[certify] (c) inventory regeneration ...
    inventory: 248 blocks, 248 equations, 178 dae cases, 0 no-symbol
[certify] V-Lab certification: PASS
```
   Step (a) runs: `npx vitest run src/engine/vlab src/components/vlab src/utils/vlabLibrary.test.ts src/utils/scopeUtils.test.ts src/services/vlabWorkerClient.test.ts src/engine/doe/integration.test.ts --reporter=dot` (default 5 s timeout).
2. `npx tsc --noEmit`: 0 errors in total (V-Lab and non-V-Lab).
3. `npm run build`: exit 0. Vite renderer build "built in 1m 29s" (includes `vlabWorker-*.js` 1,084 kB), then `build:electron` (protected Electron build 5/5 steps, `main.jsc`, `index.cjs`, `preload.cjs`). No non-V-Lab step failed, so the `npx vite build` fallback was not needed. Only the standard chunk-size warning (index chunk 11.9 MB) appeared.
4. `npx playwright test tests/e2e/vlab-smoke.spec.ts`: 2 passed (27.0 s): import the RC benchmark, run, scope ends at 10(1-e^-5) within 1 % (chromium 12.3 s, chromium-benchmark 11.6 s).
5. `npx tsx scripts/vlab_review/genBlockMatrix.ts` regenerates `block-matrix.json`; `npx vitest run src/engine/vlab/review/contract.test.ts` regenerates `contract-status.md` (unchanged: identical to the committed version).

Note on `npm run test:vlab:certify`: `package.json` was not edited (it holds another session's uncommitted changes). Proposed line to add under `scripts`: `"test:vlab:certify": "tsx scripts/vlab_review/certify.ts"`.

---

## 7. Remaining unsupported blocks and expected failures

Both unsupported blocks are rejected before the solve with diagnostic code `unsupported-block` naming the missing specification (`vlabStructure.ts` `UNSUPPORTED_BLOCKS`). They are kept unsupported because no defensible equation exists in the library, UI or documentation (mandate: unsupported is allowed only when the equation is not stated anywhere). F-096.

- **`ma_separator` (Moisture Separator, MA):** the library states only an `efficiency` parameter and outputs `w` and `d` with no meaning or unit. Missing: the separated quantity (V-Lab Moist Air ports carry total pressure and mass flow only, no liquid-water or condensate fraction on port A), the separation relation (`mdot_removed = efficiency * mdot_liquid`, or a saturation criterion), the condensation energy balance, and the definition and unit of `w` and `d`. Consequence: `unsupported` and `params-dead` (`efficiency` unread) contract entries remain expected failures.
- **`ma_selector` (Measurement Selector, MA):** selects temperature, pressure and humidity (t, p, w) from a composite moist-air measurement vector on `in`. Missing: the channel layout and width of that vector (for example [T, p, w]) and a sensor producing it (`ma_pt_sensor`, `ma_thermo_sensor`, `ma_moisture_sensor` output scalars), so the input has no source.

Remaining expected failures (12 ratchet entries on 11 blocks; 9 are WP-19):
- `equation-doc` x 9 (WP-19, deferred): `angle_constraint`, `dist_constraint`, `external_force`, `grav_field`, `ref_frame`, `rigid_transform`, `spring_damper_force`, `transform_sensor`, `world_frame`. These multibody blocks still carry the generic "governing physical equation" label because their equations are the pre-WP-19b stubs: there are no rigid-body Newton-Euler dynamics (F-055), so replacing the label with a specific equation would be a false claim. Related: F-056 (rigid_transform adds Euler angles componentwise, no lever-arm moment), F-057 (transform_sensor reports an Euler difference), F-072 (frame-pose variables pinned to BDF1, so mechanisms are first order).
- `unsupported` x 2 and `params-dead` x 1: `ma_separator`, `ma_selector` (above).

---

## 8. Backward compatibility and .adia migration

Principle: `.adia` files on disk are never edited. Migration happens at load time (`normalizeLegacyVLabGraph` in `vlabModelMigration.ts`), is applied to the in-memory graph, and is reported in the UI migration notice banner (`VLabMigrationBanner.tsx`, WP-40; notices stored in `node.data.migrationNotices`). Saving writes the migrated model; keep a copy of the original if the old form is needed.

| Migration | What happens to an old model | User-visible notice |
|---|---|---|
| Parameter alias renames (67 renames, WP-08), e.g. `dc_motor` resistance to `Ra`, `inductance` to `La`, `inertia` to `J`, `damping` to `B`; `ps_dead_zone` start/end to upper/lower | Value moved to the canonical key; equations read only canonical keys | Banner lists renamed keys; 64 migration tests |
| Removed / dropped params (12 removed, e.g. weld stiffness, ac_motor stator resistance for the rotor-flux observer) | Dropped (they were never read) | Listed in the banner |
| Newly exposed params (49, WP-08 and domain WPs) | Backfilled with the previous effective behaviour (e.g. Thermal Mass T0 = 293.15 K, belt_end damping = 0, ac_motor Lr = 0.06 H) | Inspector shows the new fields |
| Legacy block type ids (orphans, WP-21, `LEGACY_TYPE_ALIASES`) | Aliased to the canonical block | Banner |
| `transformer` N to N12 | Value-transforming: N12 = 1 / N (legacy N meant v2 = N v1). N = 0 becomes N12 = 0 so the bounds check reports it | Banner |
| `dc_motor` / `bldc_motor` Kt != Ke | Single constant k = Ke (SI: Kt = Ke); the discarded Kt is reported | Notice via `machineConstantNotice` (F-059, shown in the UI since WP-40, F-082) |
| Thermal reference 0 K | `thermal_ref` and sensors are absolute: a `temp_sensor` against `thermal_ref` now reads T (was T - 293.15 K); scope temperature readings shift by +293.15 K (correct physics) | `THERMAL_REFERENCE_NOTICE` (F-011, F-094) |
| Dead-zone semantics (`ps_dead_zone`) | Outside the zone the output is u - upper / u - lower (continuous, Simulink); old block returned u | Signal-block notice |
| Other physical-signal behaviour changes (ps_switch port ids and threshold 0, ps_delay, ps_max/min, ps_rms, ps_moving_avg, ps_stair_gen, ps_lookup_2d, ps_sr_flipflop, ps_sample_hold, ps_integrator, ps_integrator_gen, ps_sine_3phase, sym_comp_transform) | Saved parameters keep their meaning; block now computes what its printed equation says | `SIGNAL_BLOCK_NOTICES` (per block) |
| `three_phase_source`, `ac_motor`, `pmsm`, `bldc_motor`, `pwm_3ph_2level` composite three-phase ports | Scalar a/b/c ports replaced by composite `abc` (and star point `n`); migration inserts a Phase Splitter plus reference so the old circuit is preserved. Nodes without a saved `ports` list or already migrated are untouched | Banner |
| `rot_multibody_interface` / `trans_multibody_interface` removed `t` / `f` ports (WP-13b, F-062) | Edges to the removed ports give an unknown-port diagnostic on load (they are not silently rewired) | Diagnostics panel, block/port highlighted |
| Mass `b = 0.1` and inertia `B = 0.001` hidden damping (F-074) | Library default is now 0 (Simscape has none); `LEGACY_DEFAULT_BACKFILL` keeps the old behaviour for saved nodes without an explicit value, an explicit saved value is never touched | Banner |
| Friction blocks | Old T = Ts tanh(10 w) + Tv w model replaced by the Simscape Stribeck model (parameters keep meaning) | Release note in this report; smoothing constant to verify (F-088) |
| `fundamental_reluctance` | Old hidden R replaced by R = l / (mu0 mu_r A); a saved R is kept exactly by solving for l | `fundamentalReluctanceNotice` |
| `microwave_cavity` | Uses the CODATA Stefan-Boltzmann constant (F-092); `max_temp` (thermal cutout) and `ambient_temp` are declared in degC in the library (unit `C`, min -273.15), converted to K internally; open thermal `h` port is now a topology error (F-091, pins no longer to 293.15 K) | Topology diagnostic |
| Open ports of electrical / mechanical / thermal / magnetic / fluid networks | Name-based grounding removed: floating networks give a diagnostic; labs got explicit `rot_ref`; open fluid ports are capped | Diagnostics panel |
| Air-fryer lab thermal resistor | Lab used a dead param (Rth = 35); the heater now runs at about 1.5 kW instead of about 5.3 kW (F-044) | Behaviour change in the shipped lab, documented here |
| Induction-motor labs | Star points floated (F-080) | Behaviour change in the shipped labs |
| Scope channels and `doe_custom` ports | Scope channels survive save/open (14 domain models tested); `doe_custom` ports saved with domain `General` are migrated to Physical + direction (F-040) | None needed |

Not migrated: models that wire a 3-phase machine directly to a scalar-port model outside the migration's recognised patterns will show a port-type diagnostic and need manual rewiring.

---

## Deviations and known gaps

- **WP-19b rigid-body dynamics deferred** (user decision 2026-10-06, token budget; F-055 high). No Newton-Euler body dynamics: pendulum period, energy and sliding acceleration cannot be simulated; joint tests are quasi-static. Also open: F-056, F-057, F-072 (frame-pose variables are first order), F-058 (joint rates assume a backward difference; listed under WP-31a evidence but not separately closed in the ledger).
- **No Simscape goldens** (F-021 high): MATLAB R2024b on this machine is a 577 MB partial install (no `matlab.exe`, no `simscape` toolbox folder); the `.m` build scripts have never been executed, so their library paths and port indices are unverified. The 10 golden-comparison tests are skipped with a reason. Cases in `benchmarks/simscape/cases`: `buck_converter`, `dc_motor_load`, `dc_motor_speed_pi`, `halfwave_rectifier`, `heater_convection`, `mass_spring_damper`, `rc_charging`, `rlc_series`, `tank_drain`, `thermal_rc`. To generate goldens: on a machine with MATLAB + Simscape (+ Electrical/Fluids as needed) run `benchmarks/simscape/run_all.m` (see `benchmarks/simscape/ENVIRONMENT.md`), commit `golden/*.csv` and `golden/*.meta.json`, then `npm run test:vlab:simscape`. Do not hand-edit goldens or loosen tolerances. Until then, correctness evidence is analytic/published-equation reference tests (e.g. RC vs 10(1-e^-t) NRMSE 0.0117 %).
- **Library blocks missing versus Simscape/Simulink** (not added, coverage decision for the user): F-076 (zener, PMOS, BJT, thyristor/SCR, triac, GTO, relay); F-087 (diode/thyristor bridge, DC-DC, NPC and Vienna power-stage blocks; only gate generators exist); F-089 (translational velocity source); F-102 (derivative, relay, quantizer, rate limiter, compare, counter, ZOH, clock, chirp, pulse, mux, scalar-to-vector; ps_sum is scalar-port only); F-105 (PS-controlled current source).
- **Steam shares the Fluid domain** (F-034): steam and liquid can be wired without an error (decided in WP-17, option b).
- **Moist air has no T/phi transport** (F-097): ports carry p and mdot only; T and phi are block params, so `ma_pt_sensor.t` reports its param, not a measurement.
- **Machine port C** (F-081): machine shafts have only R with a library-declared internal mechanical reference; no Simscape-style case port C (would need an instance-port migration).
- **Friction smoothing constant** (F-088): the Stribeck smoothing constant 4 was recalled from the Simscape doc; verify on the first licensed MATLAB run.
- **Other open findings in the ledger** (no resolution recorded):
  - F-002 (pid_ac_motor lab convergence/timeout; F-013 root cause and the F-049 test timeouts are resolved and the lab passes in the current suite, but the finding itself was never closed).
  - F-009 (2 tsc errors in `sysmlCommandGateway.ts`, not V-Lab; `tsc` currently reports 0 errors).
  - F-015, F-016, F-017, F-018, F-020 (triage umbrella findings for dead params, hidden params, missing domains, unread ports, per-block help). Contract checks pass for params/domains; the inventory heuristic still lists 18 blocks with dead params and 142 with unread ports (mostly DAE-branch outputs); per-block help pages do not exist (help is topic-level).
  - F-023 (hard-coded block counts in old tests: superseded by the derived count in `contract.test.ts`).
  - F-039 (`vlabValidationHarness` still swallows solver non-convergence).
  - F-066 (node_modules lost packages twice during earlier full runs; root cause not identified).
  - F-069 (ac_voltage default phase pi/4 versus Simscape 0, and non-ideal R_int: deviation).
  - F-071 (memristor simplified unvalidated drift model; opamp clamp is C0).
  - F-078 (igbt has no anti-parallel diode or switching times).
  - F-083 (thyristor theta semantics differ; documented and locked by tests).
  - F-108 (an RLC step in one 50 ms call fails at minimumStep during BDF1 startup; probably pre-existing).
  - F-062, F-082, F-093, F-094, F-099, F-107 are "addressed in WP-40"; F-093 refers to an untracked help file owned by another session.
- **Test infrastructure:** the full certification takes about 3.6 min; before WP-31c several lab/whitebox tests were timing out under load (F-049, now resolved). Run `pmsm_foc` and lab tests alone if a wall-clock flake appears under parallel load.
- **Not verified by this review:** electron packaging was built but not launched; the Playwright smoke covers one RC scenario only; coverage of conservation per block is by domain suite, not a per-block automatic check.

---

## How to re-run

```
# full V-Lab certification (tests + tsc + inventory), exit 0 = pass
npx tsx scripts/vlab_review/certify.ts          # proposed: "test:vlab:certify": "tsx scripts/vlab_review/certify.ts"

# regenerate evidence documents
npx vitest run src/engine/vlab/review/contract.test.ts --reporter=dot   # docs/vlab-review/contract-status.md
npx tsx scripts/vlab_review/genBlockMatrix.ts                            # docs/vlab-review/block-matrix.json
npx tsx scripts/vlab_review/inventory.ts                                 # inventory.json, inventory-gaps.md

# focused suites
npx vitest run src/engine/vlab/review --reporter=dot
npm run test:vlab:simscape                                               # benchmarks (goldens skipped until generated)

# build and e2e
npm run build
npx playwright test tests/e2e/vlab-smoke.spec.ts

# CI: .github/workflows/vlab-certification.yml runs `npm ci` then the certifier on push/PR touching V-Lab paths
```
