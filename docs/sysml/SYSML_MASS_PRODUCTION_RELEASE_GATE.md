# SysML Mass-Production Release Qualification Gate

**Profile:** `OMG-SysML-1.6-ADIA` (normative baseline: OMG SysML 1.6 / ISO/IEC 19514:2017)
**Branch:** `co-work` · **Qualification date (UTC):** 2026-09-12
**Machine gate:** `src/engine/sysml/largeModelBenchmarkGate.test.ts`
(`mass-production release gate` + 10k benchmark) with manifest logic in
`src/engine/sysml/conformanceManifest.ts`
(`verifyReleaseGateEvidence`, `classifyAutomatedEvidence`).
**CI:** `.github/workflows/sysml-mass-production-gate.yml`
(`git diff --check`, `npm run test:sysml:full-release`,
`npm run test:e2e:sysml`, `npm run build`).

`supported` is reserved for capabilities whose entire application lifecycle
(create/edit/render/persist/delete/trace) is proven by this gate. There are no
`partial` rows: 30 of 31 rows are `supported`, 1 is `unsupported` (SYSML-029,
SysML v2). No unsupported capability is marked `supported`.

## 1. Conformance counts

| Metric | Value |
|---|---|
| Total manifest rows | 31 (`SYSML-001`–`SYSML-031`) |
| `supported` | 30 |
| `unsupported` | 1 (`SYSML-029` — SysML v2 semantic equivalence; requires a separate versioned adapter) |
| Supported rows with `implementationEvidence` | 30 / 30 |
| Supported rows covering all four evidence tiers (unit, integration, browser, persistence) | 30 / 30 |

Evidence tier semantics (see `classifyAutomatedEvidence`):

- `unit` — engine/component test (`src/engine/…`, `src/components/…`).
- `integration` — cross-module test (`src/services/…`, `src/features/…`,
  lifecycle harnesses such as `sysmlConformance`, `profileFixture`,
  creation-rule / gateway / adapter suites).
- `browser` — real-browser Playwright spec (`tests/e2e/…`).
- `persistence` — chunked/normalized persistence, large-model, snapshot,
  traceability-index, or worker persistence test.

## 2. Scale counts (10k reference model, `generate10kModel`)

| Collection | Count |
|---|---|
| Definitions (3500 blocks + 500 value types + 500 interfaces) | 4500 |
| Usages (parts + ports) | 2500 |
| Relationships | 1000 |
| Connectors | 500 |
| Requirements | 1200 |
| Verification cases | 300 |
| Diagram presentations | 100 |
| Total elements | 10000 |

The gate asserts these exact counts, so silent generator drift fails the build.

## 3. Runtime / memory thresholds (recorded 2026-09-12)

Budgets are intentionally generous so the gate is a regression tripwire, not a
flaky benchmark. Measured values are from the qualifying run.

| Gate | Budget | Measured |
|---|---|---|
| Full fail-closed validation, 10k (`validateSysmlRepository`, 0 diagnostics) | < 15000 ms | ~80 ms |
| Viewport culling, 10k definitions (deterministic across repeat queries; visible ⊂ total) | < 2000 ms | ~1.2 ms |
| Heap delta per 10k gate (validation, culling) | < 512 MB | low single-digit MB |
| Edit latency 1k / 10k | < 50 ms | enforced in existing benchmark gate |
| Drag p95, 10k (20 coalesced moves) | < 50 ms | enforced in existing benchmark gate |
| Undo / redo, 10k | < 25 ms | enforced in existing benchmark gate |
| Chunked persistence serialize, 10k | < 1500 ms | enforced in existing benchmark gate |
| Incremental persistence after 1 edit, 10k | < 300 ms | enforced in existing benchmark gate |
| Chunked hydration, 10k | < 1000 ms | enforced in existing benchmark gate |
| Indexed `getById`, 50k | < 5 ms | enforced in existing benchmark gate |
| Diagram projection, 50k | < 30 ms | enforced in existing benchmark gate |
| Spatial culling query, 1k | < 15 ms | enforced in existing benchmark gate |

## 4. Known limitations

1. **SysML v2 is unsupported (SYSML-029).** The profile is strictly SysML 1.6;
   no semantic-equivalence claim is made for SysML v2 (KerML). Interchange
   with v2 systems requires an independent versioned adapter. The release gate
   fails if any v2 capability is ever marked `supported`.
2. **OPM projection is loss-aware, not lossless.** `src/engine/sysml/opmAdapter.ts`
   emits explicit diagnostic codes for constructs with no OPM equivalent
   (composition ownership, usages, IBD connectors, requirement governance).
   See `docs/SYSML_INTERCHANGE_LIMITATIONS.md`.
3. **Interchange boundaries.** Canonical `SysmlRepository` is the sole mutation
   authority; BDD/IBD/RTM/report/OPM views are read-only projections, and all
   edits route through the fail-closed transaction gateway with an audit trail.
4. **Scale envelope.** Qualification covers up to 50k-element models for indexed
   access/projection and 10k for full validation/culling/persistence. 100k
   models are generatable (`generate100kModel`) but are not release-qualified.

## 5. Rollback criteria

Promotion to mass production is **blocked** (and a promoted build is rolled
back) if any of the following hold:

1. `verifyReleaseGateEvidence()` reports `valid === false`: any `supported`
   row without implementation evidence or without any of the four automated
   evidence tiers, any v2/`SYSML-029` row marked `supported`, or a profile-ID
   other than `OMG-SysML-1.6-ADIA`.
2. `verifyConformanceManifest()` reports missing evidence files.
3. Any benchmark in `largeModelBenchmarkGate.test.ts` exceeds its budget.
4. `npm run test:sysml:full-release`, `npm run test:e2e:sysml`, `npm run build`,
   or `git diff --check` fails in CI.
5. `tsc --noEmit` reports any error.

Rollback procedure: revert the offending commit(s) on `co-work`, re-run the
full gate (`npm run test:sysml:full-release`), and re-baseline only after all
five criteria pass again. Frozen protected baselines (`BL-1`/`BL-2` semantics
in persistence) require explicit authorization for destructive mutations, so
data-model rollbacks follow the authorized-baseline path, never silent repair.

## 6. Reproduce

```powershell
$env:PATH = "C:\Users\EL-Dawlia\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;" + $env:PATH
npm run test:sysml:release-gate   # release-gate test + manifest test
npx tsc --noEmit                  # type gate
npm run test:sysml:full-release   # full qualification (unit+integration+e2e+build)
git diff --check                  # hygiene
```
