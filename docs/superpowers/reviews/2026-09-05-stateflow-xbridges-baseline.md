# Stateflow / X-Bridges baseline — 2026-09-05

## Environment and method

- Windows x64, Node v24.13.0, fixed seed `1592594996`.
- Command: `npm run benchmark:sm-codegen`.
- Seven paired repetitions per fixture, 100 warm-up ticks, and 1,000 timed TypeScript ticks per repetition.
- Compilation, trace serialization, and differential comparison were outside TypeScript tick timing. Every timed batch contributed to an observable checksum.
- Compiler selection was the recorded default `gcc`, resolved on this host to `C:\qp\qtools\mingw32\bin\gcc.exe`.
- The compile/link/run preflight was `BLOCKED`: GCC started, but linking failed with `gcc: fatal error: cannot execute 'ld': CreateProcess: No such file or directory`.

## Correctness baseline

`npm run verify:sm-codegen` attempted all 27 declared X-Bridges C99 cases. It reported 24 `BLOCKED:environment`, two `FAIL:model/fixture validation`, and one `FAIL:generation`. The three representative orchestration pipelines generated artifacts and traceability mappings, then reported host compilation and runtime as `BLOCKED`; no blocked pipeline printed a PASS claim.

Representative canonical TypeScript traces were recorded before the environment gate: most valid cases produced three frames; filters produced 52, flip-flops/register-counter/T10 paired discontinuous produced four, waveforms and Kalman produced six, and noise produced five. The observed failures remain defects:

- `T14-C99-CONTINUOUS`: `XB_DELAY_LENGTH_MISSING` for `del1`.
- `T10-C99-DISCRETE-REALIZATION`: three `XB_DIMENSION_DYNAMIC` diagnostics for `tf1`.
- `T10-C99-DISCONTINUOUS`: generator rejects shaped `rl2:u` because the Task 8 emitter requires a scalar signal.

The declared-conformance test now runs semantic build and C generation for every case even when the compiler is blocked. On this host, 24 generation checks pass, the three defects above fail, and the 27 compiled trace-parity checks are explicitly skipped by the toolchain gate.

The two generator regressions formerly tied to personal Downloads files now use deterministic checked-in fixtures. Their original DELAY `-1.0` initialization and SWITCH/IF_ELSE routing/type/output assertions pass.

## Performance baseline

Times below are medians. Tick values are production TypeScript nanoseconds per tick. Source size is bytes; trace and production source sizes are equal because tracing is compile-time guarded in the same generated sources.

| Fixture | Build ms | Generate ms | TS tick ns | Source bytes |
| --- | ---: | ---: | ---: | ---: |
| seeded-small-8 | 1.220 | 3.050 | 7,536 | 43,186 |
| seeded-medium-32 | 1.490 | 5.320 | 42,408 | 116,630 |
| seeded-large-128 | 4.390 | 20.350 | 125,761 | 412,398 |
| hierarchy-parallel | 0.120 | 1.280 | 7,186 | 29,211 |
| vector-matrix | 1.260 | 1.520 | 59,273 | 37,982 |
| PID | 1.320 | 2.610 | 74,195 | 46,901 |
| DELAY | 0.700 | 2.520 | 50,097 | 37,559 |
| subsystem gain/sum | 0.910 | 1.950 | 53,874 | 37,284 |
| 1 substep | 0.910 | 1.320 | 14,863 | 35,403 |
| 5 substeps | 0.410 | 1.280 | 27,863 | 35,403 |
| 50 substeps | 0.630 | 1.360 | 228,108 | 35,404 |

The first sample has visible cold-start outliers in several build/generation fixtures; the JSON output includes all samples, p95, min/max, and coefficient of variation. This run establishes the comparison point and does not by itself trigger the >5% time or >10% build/code-size regression gates.

Compiled-C production/trace tick time, executable text/data/bss, `ADIA_Instance_t` size, and compiler stack-usage reports are unavailable because the preflight could not link the probe. The reusable runner emits explicit `null` fields and the blocker rather than zero values. Its compiled-C measurement implementation remains a follow-up once a working explicit compiler is supplied with `--compiler` or `ADIA_SM_C_COMPILER`.

## Reproduction

```text
npm run verify:sm-codegen
npm run benchmark:sm-codegen
npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "generates correct DELAY|generates correct routing" --reporter=verbose
npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts --reporter=dot
```
