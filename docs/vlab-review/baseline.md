# V-Lab Baseline (WP-00), 2026-10-05, branch co-work

Pre-existing uncommitted changes: `docs/vlab-review/preexisting-changes.txt` (246 lines). Nothing was fixed or staged.

| Command | Passed | Failed | Skipped | Duration |
|---|---|---|---|---|
| `npm run test:vlab` | 18 | 2 | 0 | 25.7 s (2 of 4 files failed) |
| `npm run test:vlab:full` | 5 | 0 | 0 | 5.2 s |
| `npm run test:vlab:connected` | 11 | 0 | 0 | 4.3 s |
| `npm run test:vlab:all-blocks` | >= 43 | 0 seen | 0 | HANG: no result. Killed after 17 min (see below) |
| `vitest run whitebox_benchmarks kernel` | 39 | 6 | 0 | 7.0 s (4 of 20 files failed) |
| `vitest run components/vlab vlabWorkerClient.test.ts` | 64 | 1 | 0 | 7.3 s (1 of 12 files failed) |
| `npx tsc --noEmit` | n/a | 2 errors | n/a | 89 s |

## Failing tests by file

### src/engine/vlab/vlab.test.ts
- `solves mechanical mass-spring-damper response`: final position is 0, expected -0.1 (tol 0.0005). The mass does not move. (F-001)

### src/engine/vlab/labs_sim.test.ts
- `simulates pid_ac_motor with DAE Physics Engine`: test timed out at 5000 ms. The log shows repeated `ImplicitSolver Convergence Failure`. (F-002)

### src/engine/vlab/whitebox_benchmarks/suites/mechanical_whitebox.test.ts
- `M-01 mass-spring-damper step response`: final x = 0, expected 0.1 (same root cause as F-001). (F-001)
- `M-02 rotational inertia and damper spin-up`: the signal `J` stays zero for the whole run. (F-003)

### src/engine/vlab/whitebox_benchmarks/suites/thermal_whitebox.test.ts
- `T-01 thermal conduction source to sensor`: judge verdict not passed. (F-004)
- `T-02 thermal mass heating transient`: `measuredT[0]` = 0.057 K, expected >= 290 K. The initial temperature is wrong. (F-004)

### src/engine/vlab/whitebox_benchmarks/suites/fluid_whitebox.test.ts
- `F-01 gas flow resistance under pressure differential`: judge verdict not passed. (F-005)

### src/engine/vlab/whitebox_benchmarks/vlab_whitebox_master.test.ts
- `Certifies all 6 physics domain batches pass Oracle Judge thresholds`: `mJudg.passed` is false (mechanical domain). (F-001)

### src/components/vlab/vlabSymbols.test.tsx
- `never falls back for any library icon`: at least one library block falls back to `UnknownSymbolGlyph`. The test does not name the block. (F-006)

### src/engine/vlab/test_all_blocks_scope.test.ts (test:vlab:all-blocks)
- Never completes. The first 43 tests pass (blocks up to `gas_restriction`), then `gas_pipe` (test #44) loops forever. Run alone with `-t "Tests block: gas_pipe "` it did not finish in 90 s. (F-007)
- With `gas_pipe` excluded, the run hangs again after the `gas_reservoir` stderr output (19 dots, then no progress; exact block unconfirmed). 8 min budget, then killed. (F-008)
- Convergence-failure stderr appears for `opamp` and `three_phase_source` (the tests still pass).

### tsc --noEmit: 2 errors, none under src/engine/vlab or src/components/vlab
- `src/services/sysmlCommandGateway.ts(1483,66)` and `(1602,66)`: TS2339 Property 'id' does not exist on type 'PatchOperation'. (F-009, not V-Lab)
