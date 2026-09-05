# Task 1 report

Status: `DONE_WITH_CONCERNS`

## Commits

- `c080736` — `test(sm): establish reproducible codegen baselines`
- Report-only follow-up commit contains this file.

## Files changed

- `package.json`: reproducible verifier and benchmark commands.
- `scripts/verify_sm_codegen.ts`: recorded compile/link/run preflight, all-case execution, and failure categories.
- `scripts/benchmark_sm_codegen.ts`: fixed-seed representative fixtures, warm-up, paired repetitions, observable checksums, variability, and explicit unavailable metrics.
- `src/utils/stateMachine/smCHarness.ts`: explicit compiler selection, compile/link/run preflight, compiler-vs-generated-source failure boundary, and compiler propagation.
- `src/utils/stateMachine/smPipelineOrchestrator.ts` and test: toolchain-aware execution evidence and correct `BLOCKED`/`FAIL` status.
- `src/utils/stateMachine/smCGenerator.test.ts`: sanitized deterministic DELAY and routing fixtures replacing personal paths.
- `src/utils/stateMachine/xbDeclaredCConformance.test.ts`: unconditional semantic/generation checks plus toolchain-gated compiled trace parity.
- `docs/superpowers/reviews/2026-09-05-stateflow-xbridges-baseline.md`: correctness and performance baseline.

## RED/GREEN evidence

- RED: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "classifies a missing" --reporter=verbose` failed because `probeC99Toolchain` did not exist. GREEN: the same command passed 1 test.
- RED: the two focused generator tests failed 2/2 with `ENOENT` for `C:\Users\EL-Dawlia\Downloads\...`. GREEN: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "generates correct DELAY|generates correct routing" --reporter=verbose` passed 2 tests.
- RED: `npx vitest run src/utils/stateMachine/smPipelineOrchestrator.test.ts -t "unusable explicitly selected" --reporter=verbose` failed because the pipeline ignored the explicit compiler and returned no toolchain evidence. GREEN: the same command passed 1 test.
- RED: `npm run benchmark:sm-codegen -- --help` failed with `ERR_MODULE_NOT_FOUND`. GREEN: it exits 0 and prints usage; the full benchmark also exits 0.

## Baseline findings

- `npm run verify:sm-codegen` exits 1 after attempting all 27 cases: 24 environment-blocked, two model/fixture validation failures, and one generation failure.
- The selected GCC prints a version but cannot link because it cannot execute `ld`; the new preflight correctly reports `BLOCKED` before any generated-source verdict.
- Representative valid interpreter traces were recorded for 24 cases with frame counts; filters is the longest at 52 frames.
- Personal-path regressions are reproducible on any checkout and retain the original code-content assertions.

## Final verification

- `npm run benchmark:sm-codegen -- --help`: exit 0; usage printed.
- `npm run benchmark:sm-codegen`: exit 0; 11 fixtures, seven repetitions, 100 warm-up ticks, and 1,000 timed ticks per fixture; compiled-C fields explicitly `BLOCKED`.
- `npx vitest run src/utils/stateMachine/smPipelineOrchestrator.test.ts --reporter=dot`: 3 passed.
- `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "generates correct DELAY|generates correct routing" --reporter=dot`: 2 passed, 51 skipped.
- `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "classifies a missing|records the compile-link-run" --reporter=dot`: 2 passed, 54 skipped.
- `npm run verify:sm-codegen`: expected exit 1 after attempting all 27 cases; 24 `BLOCKED:environment`, two `FAIL:model/fixture validation`, and one `FAIL:generation`; no blocked pipeline printed PASS.

## Performance

The full 7-repetition benchmark completed successfully with 100 warm-up ticks and 1,000 timed ticks per fixture. Median TS tick time ranges from 7.5 microseconds for the small seeded graph to 228.1 microseconds for the 50-substep fixture. The 8/32/128-state seeded graph source sizes are 43,186 / 116,630 / 412,398 bytes. Full values and variability are in the baseline document.

Compiled-C tick, sections, instance size, and stack measurements are null with an explicit blocker because the host toolchain cannot link.

## Self-review

- Confirmed the verifier never prints PASS for a blocked pipeline.
- Confirmed the same preflight object and compiler selection flow through pipeline and differential execution.
- Confirmed generator validation runs before any conformance execution skip, so toolchain blockage does not hide the three real defects.
- Confirmed no generated public API, semantic ordering, tolerances, strict flags, schemas, or runtime behavior was weakened.
- Confirmed no main-checkout or unrelated files were modified.

## Concerns

- Three known declared-conformance defects remain intentionally unfixed and keep the selected suite red.
- This host cannot produce compiled-C performance, executable-section, instance-size, or stack evidence.
- The reusable benchmark currently records compiled-C fields and toolchain limitations but does not yet implement compiled-C timing after an available preflight; that follow-up is required on a working toolchain.
- Several first-sample build/generation measurements have high variance; future threshold comparisons should use paired runs on the same host and toolchain.
