# Task 7 Report: Declared C Conformance Repairs

## Status

PASS with the documented pre-existing TypeScript compiler limitation. All three declared executable fixtures now build and generate without weakening semantic validation. No invalid fixture was retained or moved into executable conformance.

Implementation commit: `99c7628bb166a0915ecac18c349bd1b7400d9736`

## Changes

- `src/utils/stateMachine/xbCConformanceCases.ts`
  - Made `T14-C99-CONTINUOUS` a valid one-step scalar `DELAY` with `delay_length: 1` and canonical `initial_condition: 0`.
  - Declared fixed `[1]` dimensions for the SISO `DISCRETE_TRANSFER_FUNCTION` input, output, and synthesized state ports in `T10-C99-DISCRETE-REALIZATION`.
- `src/utils/stateMachine/xbCGenerator.ts`
  - Preserved the advertised scalar/vector `RATE_LIMITER` contract by lowering vector state updates element by element rather than requesting scalar signal/state expressions.
  - Used the standard C `isnan` macro for rate-limiter float checks so strict warning-as-error syntax compilation remains portable.
- `src/utils/stateMachine/xbDeclaredCConformance.test.ts`
  - Added focused fixture expectations for the delay and transfer-function dimensions.
  - Added a vector `RATE_LIMITER` regression that runs the TypeScript interpreter, asserts `isnan`/no `isnanf` in generated source, and compiles all generated C translation units with warnings treated as errors.
- `.superpowers/sdd/task-7-report.md`
  - Records Task 7 decisions and verification evidence.

The validator, capability declarations, schemas, state ordering, runtime APIs, strict C99 compile-link flags, and unrelated VLab code were not changed.

## RED evidence

Baseline conformance failure:

```text
$ npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "builds and generates" --reporter=verbose
FAIL  xbDeclaredCConformance.test.ts > builds and generates T14-C99-CONTINUOUS
  XB_DELAY_LENGTH_MISSING: DELAY block 'del1' is missing required 'delay_length' parameter.
FAIL  xbDeclaredCConformance.test.ts > builds and generates T10-C99-DISCONTINUOUS
  Error: X-Bridges Task 8 emitter requires scalar signal 'rl2:u'
FAIL  xbDeclaredCConformance.test.ts > builds and generates T10-C99-DISCRETE-REALIZATION
  XB_DIMENSION_DYNAMIC for tf1:u, tf1:y, and tf1:x
Test Files  1 failed (1)
Tests  3 failed | 24 passed | 29 skipped (56)
Exit code: 1
```

Focused regression expectations before implementation:

```text
$ npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "declares the continuous DELAY fixture|declares fixed 1-input|generates the advertised vector RATE_LIMITER" --reporter=verbose
FAIL  declares the continuous DELAY fixture as a fixed one-step scalar delay
  missing delay_length and initial_condition
FAIL  declares fixed 1-input, 1-output, 1-state transfer-function dimensions
  expected dimensions [1], received [] for u, y, and x
FAIL  generates the advertised vector RATE_LIMITER conformance fixture
  Error: X-Bridges Task 8 emitter requires scalar signal 'rl2:u'
Test Files  1 failed (1)
Tests  3 failed | 56 skipped (59)
Exit code: 1
```

The stricter generated-C regression exposed and reproduced the related portability defect before its fix:

```text
$ npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "generates the advertised vector RATE_LIMITER" --reporter=verbose
FAIL  generates the advertised vector RATE_LIMITER conformance fixture
  sm_core.c:181:37: error: implicit declaration of function 'isnanf' [-Wimplicit-function-declaration]
Test Files  1 failed (1)
Tests  1 failed | 58 skipped (59)
Exit code: 1
```

## GREEN evidence

Focused fixture corrections:

```text
$ npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "declares the continuous DELAY fixture|declares fixed 1-input" --reporter=verbose
Test Files  1 passed (1)
Tests  2 passed | 57 skipped (59)
Exit code: 0
```

Interpreter plus warning-as-error generated-C syntax regression:

```text
$ npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "generates the advertised vector RATE_LIMITER" --reporter=verbose
Test Files  1 passed (1)
Tests  1 passed | 58 skipped (59)
Exit code: 0
```

Required declared-conformance generation gate:

```text
$ npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "builds and generates" --reporter=verbose
Test Files  1 passed (1)
Tests  27 passed | 32 skipped (59)
Exit code: 0
```

Required delay/routing regression gate:

```text
$ npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "DELAY|routing" --reporter=verbose
Test Files  1 passed (1)
Tests  2 passed | 51 skipped (53)
Exit code: 0
```

## Compiler limitations

The required TypeScript check remains blocked only by the allowed pre-existing unrelated VLab syntax error:

```text
$ npx tsc --noEmit
src/engine/vlab/vlab_connected_models.test.ts(286,1): error TS1128: Declaration or statement expected.
src/engine/vlab/vlab_connected_models.test.ts(286,2): error TS1128: Declaration or statement expected.
Exit code: 1
```

The host has `gcc` but lacks its linker executable, so the optional compile-link-run trace parity suite is environment-blocked:

```text
gcc exited with 1
gcc: fatal error: cannot execute 'ld': CreateProcess: No such file or directory
compilation terminated.
```

The focused vector rate-limiter regression still runs `gcc -fsyntax-only` over the generated translation units with `-Wall -Wextra -Werror`, and that check passes.

## Retained invalid fixtures

None. The three cases all claim supported behavior and remain declared executable with valid fixed metadata and supported generation semantics.
