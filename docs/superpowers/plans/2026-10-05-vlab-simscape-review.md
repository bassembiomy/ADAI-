# V-Lab Full Review & Simscape Benchmark — Agentic Implementation Plan

**Date:** 2026-10-05
**Goal:** Certify every V-Lab block (front end + back end) — ports, parameters, equations, simulation behaviour and cross-block integration — against **MATLAB Simulink / Simscape R2024b** as the reference.
**Execution model:** Opus = planner/reviewer (main session). Sonnet = executor (`.claude/agents/vlab-executor.md`). Driven as an agentic loop (`/vlab-review-loop`).

---

## 1. Current state (facts gathered 2026-10-05)

| Layer | Source of truth | Size |
|---|---|---|
| Block palette (ports, params, UI) | `src/utils/vlabLibrary.ts` → `VLAB_LIBRARY` | 248 blocks, 13 categories |
| Help / equation text | `src/engine/vlab/vlabComponentDefinitions.ts` | 230 entries |
| Equation residuals | `src/engine/vlab/vlabEquations.ts` (map keyed by block type) | 113 KB |
| DAE assembly | `src/engine/vlab/DAEAssembler.ts` | 152 `case` branches |
| Network / compile / solve | `src/engine/vlab/kernel/` (PhysicalNetworkExtractor, PhysicalSystemCompiler, SolverManager, Euler/RK4/AdaptiveRK/BDF, DenseLU) | — |
| Runtime | `vlabWorker.ts`, `vlabWorkerProtocol.ts`, `src/services/vlabWorkerClient.ts` | — |
| Front end | `src/components/vlab/` (VLabWorkspace 210 KB, VLabNode, VLabSymbols, VLabSimulinkScope, blockDimensions, vlabModelMigration) | — |
| Domains | `types.ts` `PHYSICAL_DOMAINS`: electrical, rotational, translational, thermal, magnetic, gas, fluid, isothermal_liquid, physical, multibody, frame, multibodyframe (+ `any`, `beltproperty`) | 12 + 2 |
| Existing tests | `npm run test:vlab`, `test:vlab:full`, `test:vlab:connected`, `test:vlab:all-blocks`, `whitebox_benchmarks/` | Analytical only, **no Simscape reference** |
| MATLAB | `C:\Program Files\MATLAB\R2024b` (not on PATH; Simscape licence unverified) | — |

**Leads to verify early (these are not confirmed defects yet):**
- The counts do not match: 248 library blocks, 230 definitions, 152 DAE cases. Each gap must be explained, for example signal-only blocks, composite blocks, or a real missing equation.
- Many library ports have no `domain` field (e.g. `resistor` ports `p`/`n`). Connection validation may then fall back to `any`.
- The UI handle ids, the library port ids and the port names that `vlabEquations` reads must all be the same.

---

## 2. Agent roles & loop

```
┌──────────────── Opus (planner / reviewer, main session) ─────────────────┐
│ 1. Read docs/vlab-review/ledger.json → pick next WP with deps = done     │
│ 2. Write a brief: scope, file pointers, acceptance criteria, commands    │
│ 3. Agent(subagent_type="vlab-executor", model="sonnet", prompt=brief)    │
│ 4. On report: run the WP's acceptance command itself, `git diff --stat`, │
│    read ONLY risky hunks (equation sign/units, tolerances, goldens)      │
│ 5. Verdict: DONE → commit + ledger | REWORK → SendMessage deltas         │
│    (max 2 reworks) | BLOCKED → record + ask user                         │
│ 6. Repeat until no `todo` WPs, then WP-50 report                         │
└──────────────────────────────────────────────────────────────────────────┘
          │ brief                                   ▲ structured report
          ▼                                         │
┌──────────────── Sonnet (vlab-executor subagent) ─────────────────────────┐
│ Audit → write failing tests → fix → run targeted tests → report (JSON)   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Token-saving rules
- **Opus never does bulk reading or editing.** It reads ledger entries, reports, diff stats and flagged hunks.
- **One WP per dispatch.** A domain with more than about 25 blocks is split by Opus into WP-xxa, WP-xxb, and so on.
- **Briefs carry `file:line` pointers** so Sonnet does not have to re-discover the code. Paths are on drive G:, which is slow, so search scoped directories only and never the whole repo.
- **Targeted test runs only.** For example `npx vitest run <files> --reporter=dot`. The whole suite runs only in WP-00 and WP-50.
- **Reports use a fixed schema of at most 300 words** (see the agent file). Opus does not ask for logs unless something fails.
- **Rework uses `SendMessage` to the same executor**, which keeps its context. Opus does not spawn a new one.

### Executor guardrails (enforced by Opus at review)
1. An equation may change only if the executor cites the Simscape documentation formula or a derivation in the report.
2. Never loosen a tolerance and never edit golden CSVs by hand. Goldens come only from the MATLAB scripts.
3. Never delete or skip a failing test. Mark it `it.fails` with a ledger finding ID if the fix is out of scope.
4. Stay inside the WP's scope. Anything found outside it goes into `findings` for Opus to schedule.

### Stop conditions
- Every WP is `done`, which leads to WP-50 → stop.
- A WP fails after 2 reworks → `blocked`; escalate to the user with the finding.
- MATLAB/Simscape is unavailable → P3 runs in "golden-import" mode (see §4.3) and the user is asked to generate the goldens.

---

## 3. Ledger

`docs/vlab-review/ledger.json` (created in WP-00):

```json
{
  "wps": [
    { "id": "WP-10", "title": "Electrical passive & sources", "phase": "P2",
      "deps": ["WP-03"], "blocks": ["resistor", "capacitor", "..."],
      "status": "todo|in_progress|review|done|blocked", "attempts": 0,
      "acceptance": "npx vitest run src/engine/vlab/review/electrical_passive.test.ts --reporter=dot",
      "evidence": [], "findings": [] }
  ],
  "findings": [ { "id": "F-001", "severity": "high|med|low", "block": "", "layer": "port|eq|solver|ui|integration", "summary": "", "wp": "" } ]
}
```

Per-block status matrix: `docs/vlab-review/block-matrix.json`. Columns: `ports | params | equation | conservation | simscape | ui | help`.

---

## 4. Phases & work packages

### P0 — Baseline & inventory

**WP-00 Baseline** (Sonnet)
- Work on branch **`co-work`** (user decision 2026-10-05). It holds unrelated uncommitted changes, so:
  - record `git status --porcelain` in `docs/vlab-review/preexisting-changes.txt`;
  - never stage those files;
  - every WP commit uses `git add <exact WP paths>`, never `git add -A` or `.`.
- Run: `npm run test:vlab`, `test:vlab:full`, `test:vlab:connected`, `test:vlab:all-blocks`, `npx vitest run src/engine/vlab/whitebox_benchmarks src/engine/vlab/kernel src/components/vlab src/services/vlabWorkerClient.test.ts --reporter=dot`, and `npx tsc --noEmit`.
- Write `docs/vlab-review/baseline.md` with pass/fail counts and the failing test names. Create `ledger.json` with every WP listed below.
- *Accept:* the baseline file exists and pre-existing failures are recorded as findings, not fixed.

**WP-01 Inventory & cross-reference script** (Sonnet)
- Add `scripts/vlab_review/inventory.ts` (run with `tsx`). It cross-references each block id across `VLAB_LIBRARY`, `VLAB_COMPONENT_DEFINITIONS`, the `vlabEquations` map keys, the `DAEAssembler` cases, the `VLabSymbols` renderers and `HelpData`.
- Per block it emits: ports (id, pos, domain, unit), params (name, unit, default), the equation function name, the port names the equation reads, and the Simscape analog (filled in P2).
- Gap report `docs/vlab-review/inventory-gaps.md`:
  - missing equation;
  - orphan equation;
  - port without a domain;
  - port id that the equation never reads;
  - port the equation reads that is not in the library;
  - no symbol;
  - no help.
- *Accept:* `npx tsx scripts/vlab_review/inventory.ts` is deterministic, and every gap becomes a ledger finding.

**WP-02 Simscape environment probe + harness skeleton** (Sonnet)
- Run the probe: `& "C:\Program Files\MATLAB\R2024b\bin\matlab.exe" -batch "v=ver; disp({v.Name}'); license('test','Simscape')"`.
- Build the harness (§4.3) end-to-end for **one case, an RC circuit**, covering both the MATLAB script and the TS comparator.
- *Accept:* `npm run test:vlab:simscape` passes the RC case against the committed golden CSV.

**WP-03 Port contract test (all blocks)** (Sonnet)
- Add `src/engine/vlab/review/port_contract.test.ts`, parametrized over `VLAB_LIBRARY`. It asserts:
  - port ids are unique;
  - every port has a valid domain (`isValidVLabPortDomain`), with an explicit allow-list for `any`;
  - `pos` is valid;
  - physical ports have no direction while signal ports have in/out;
  - port ids match the names read by the equation (via the inventory);
  - port ids match the handle ids rendered by `VLabNode`.
- Fix the trivial metadata gaps (missing domain, label). Anything that changes an equation is deferred to P2 as a finding.
- *Accept:* the test is green for all 248 blocks, or `it.fails` with a finding ID.

### P2 — Per-domain block review (ports + params + equations)

For **every block** in the WP, the executor fills in the matrix row using this checklist:
1. **Ports:** the count, ids, domains and node conventions (A/B, +/−, R/C) match the Simscape analog.
2. **Params:** names, SI units, defaults equal to the Simscape defaults (or a documented deviation), and invalid values rejected (R ≤ 0, m ≤ 0, and so on).
3. **Equation:** the residual matches the Simscape documentation equation. Check the sign convention: through-variable is positive A→B through the block, and across = v_A − v_B. Check units and the initial-condition handling.
4. **Conservation:** in a minimal net, KCL/Σflow = 0 at the nodes and the power balance holds where applicable.
5. **Edge cases:** zero/huge params, switching thresholds, saturation and hard limits are continuous enough for the solver.
6. **Help text:** `latex`/`equations` in `vlabComponentDefinitions` and `HelpData` describe what the code actually does.
7. **Simscape case:** for blocks that have an analog, the block in a minimal test net gets a golden comparison (§4.3).

Test files: `src/engine/vlab/review/<domain>.test.ts`, with hand-computed residual values plus the harness cases.

| WP | Scope | Main Simscape reference library |
|---|---|---|
| WP-10 | Electrical passive, sources, sensors, reference | `fl_lib/Electrical/*`, `ee_lib/Passive`, `ee_lib/Sources` |
| WP-11 | Semiconductors & switches (diode, MOSFET, IGBT, thyristor, switches) | `ee_lib/Semiconductors & Converters` |
| WP-12 | Machines & power electronics (DC/AC/PMSM/BLDC, 3-phase source, inverter, 3-level/Vienna PWM, 12-pulse) | `ee_lib/Electromechanical`, `ee_lib/Semiconductors & Converters/Converters` |
| WP-13 | Rotational mechanical (inertia, spring, damper, friction, gearbox, belt/pulley, sources, sensors) | `fl_lib/Mechanical/Rotational Elements`, `sdl_lib` |
| WP-14 | Translational mechanical (mass, spring, damper, hard stop, friction, sources, sensors) | `fl_lib/Mechanical/Translational Elements` |
| WP-15 | Thermal (mass, conduction, convection, radiation, sources, sensors) | `fl_lib/Thermal/Thermal Elements` |
| WP-16 | Magnetic (reluctance, MMF source, winding, core) | `fl_lib/Magnetic/Magnetic Elements` |
| WP-17 | Fluid / isothermal liquid / steam (resistance, orifice, capacitance, inertance, pipes, pumps, valves, accumulators) | `fl_lib/Isothermal Liquid`, `fl_lib/Two-Phase Fluid` |
| WP-18 | Gas (chamber, orifice, pipe, sources, properties) | `fl_lib/Gas` |
| WP-19 | Multibody / frames (joints, bodies, spherical joint, constraints, forces) | Simscape Multibody `sm_lib` (only if licensed; otherwise analytical) |
| WP-20 | Physical signal & control (constant, sources, math, PID, PS↔signal, subsystem, inport/outport, scope) | `fl_lib/Physical Signals`, Simulink `simulink/Continuous` |
| WP-21 | Composite / appliance / DOE / microwave / utilities blocks | No analog; validated as integration models in WP-30 |

*Accept per WP:* the domain test file is green, every matrix row is filled, and each equation change carries its citation.

### 4.3 P3 — Simscape benchmark harness (built in WP-02, extended per domain)

```
benchmarks/simscape/
  cases/<case_id>/build_<case_id>.m    # programmatic add_block/add_line model
  cases/<case_id>/vlab_model.json      # equivalent V-Lab model (UI JSON format)
  cases/<case_id>/case.json            # signals, tolerances, units, stop time
  golden/<case_id>.csv                 # time + signals (committed)
  golden/<case_id>.meta.json           # MATLAB/Simscape version, solver, tolerances
  run_all.m                            # regenerates every golden
```

**MATLAB side:**
- Build each model with `add_block` from the Foundation library. Include `nesl_utility/Solver Configuration`, the domain reference blocks, and a `PS-Simulink Converter` feeding a logged Outport.
- Solver settings: `daessc` (or `ode23t`), `RelTol 1e-6`, `AbsTol 1e-8`, `MaxStep` from `case.json`, `OutputOption='SpecifiedOutputTimes'` on a uniform grid.
- Write the CSV and meta files.
- Command: `npm run bench:simscape:regen` → `matlab -batch "cd benchmarks/simscape; run_all"`.

**TS side** (`src/engine/vlab/simscape_benchmarks/`):
- Load `vlab_model.json`.
- Simulate through the **same path the worker uses** (PhysicalNetworkExtractor → PhysicalSystemCompiler → SolverManager).
- Interpolate onto the golden time grid.
- Compute NRMSE, max-abs error, final-value error, peak/overshoot, settling time, dominant frequency and event times.
- Command: `npm run test:vlab:simscape`. It needs no MATLAB, so it runs in CI.

**Tolerances** (Opus may tighten them, never loosen):

| Class | NRMSE | Final value | Other |
|---|---|---|---|
| Linear, smooth | ≤ 0.5 % | ≤ 0.1 % | frequency ≤ 0.5 % |
| Nonlinear, smooth | ≤ 1 % | ≤ 0.5 % | — |
| Switching / events | ≤ 2 % | ≤ 1 % | event time ≤ max(1 step, 0.5 % T) |
| Stiff | ≤ 1 % | ≤ 0.5 % | no divergence or NaN with the default solver |

**Golden-import mode:** if Simscape is not licensed on this machine, WP-02 commits the `.m` scripts only and the ledger blocks the `simscape` column until the user runs `run_all.m` on a licensed machine. All other columns proceed.

### P4 — Simulation engine & integration

**WP-30 Cross-domain integration benchmarks** (Simscape goldens):
1. Series RLC, underdamped.
2. Half-wave diode rectifier with a C filter.
3. DC motor driving inertia plus a viscous load (electrical → rotational).
4. DC motor speed control with PID (signal ↔ physical).
5. PMSM with a 3-phase inverter, open loop.
6. Gearbox, inertia and friction with a hard stop.
7. Mass-spring-damper with a force step.
8. Resistive heater, thermal mass, convection and radiation (electrical → thermal).
9. Hydraulic pump, orifice, accumulator and a cylinder (fluid → translational).
10. Gas chamber filling through an orifice.
11. Magnetic core with a winding (electrical ↔ magnetic).
12. Multibody pendulum (if licensed).
13. The repo models `inductance_heater.json` and the air-fryer/microwave labs. These are regression-only, with no Simscape analog.

**WP-31 Engine robustness:**
- Network extraction: floating nodes, missing reference or ground, and mixed-domain illegal links must give clear diagnostics.
- Structural singularity and high-index detection.
- Consistent initialization compared with the Simscape initial values.
- Zero-crossing and event handling for diodes, switches and hard stops.
- Algebraic loops.
- Solver selection on stiff cases (Euler/RK4/AdaptiveRK/BDF); check `SolverConfigurationSelection` against the Solver Configuration block.
- Determinism: the same model run twice must give bit-identical results.

**WP-32 Worker / runtime:**
- `vlabWorkerProtocol` messages, cancel, progress, error propagation and the large-model time budget. `tests/performance/no-renderer-blocking.spec.ts` stays green.

### P5 — Front end

- **WP-40 Palette ↔ node parity.** Every `VLAB_LIBRARY` block appears in the palette, renders a symbol, places its handles according to `pos`, and uses handle ids equal to its port ids (RTL test over all blocks). Check `blockDimensions` so ports never overlap.
- **WP-41 Connections & parameters.**
  - UI connection validation: domain mismatch is rejected, physical ↔ signal is rejected, and `any` is allowed.
  - Right-drag copy keeps the ports.
  - Parameter-dialog edits reach the solver with correct unit conversion. Test UI → model JSON → compiled parameters.
- **WP-42 Results & persistence.**
  - The scope shows the right signal, units and time base. Dynamic scope ports work.
  - Save → load → `vlabModelMigration` round-trip is lossless for all benchmark models.
  - Light and dark themes are correct.
- **WP-43 E2E smoke** (Playwright, `tests/e2e/`). Build 3 benchmark models through the UI (RC, DC motor + PID, heater), run them, and assert that the scope's final values match the goldens within tolerance.

### P6 — Certification gate

**WP-50:**
- Add `npm run test:vlab:certify`. It runs port_contract, the review/*, simscape, kernel, whitebox, components/vlab and the workers in sequence, plus `tsc --noEmit`.
- Generate `docs/vlab-review/certification-report.md`: the per-block matrix, a Simscape comparison table (NRMSE and so on), open findings and documented deviations.
- Add the gate to `.github/workflows` next to `doe-review.yml`.

---

## 5. Dependency order

```
WP-00 → WP-01 → WP-02 ┐
                WP-03 ┴→ WP-10..WP-20 (parallel-safe: one executor at a time recommended on G:)
                          → WP-21, WP-30 → WP-31 → WP-32
                WP-03 → WP-40 → WP-41 → WP-42 → WP-43
                                    all → WP-50
```

Run executors one at a time. The working tree is shared, and parallel vitest runs on drive G: are slow. Opus may run 2 in parallel only if each uses `isolation: "worktree"`.

## 6. Budget estimate

About 25–35 Sonnet dispatches (more if domains split) and about 1–2 Opus review turns each. Opus context per review is only the brief, the report, the diff stat and the flagged hunks. Expect most of the token spend on WP-10..WP-20 and WP-30.

## 7. Done criteria

- 248/248 blocks have `ports`, `params`, `equation`, `conservation`, `ui` and `help` = pass, or a documented deviation.
- Every block with a Simscape analog has `simscape` = pass within tolerance. The 13 integration models pass.
- `npm run test:vlab:certify` is green, the report is committed, and CI has the gate.
