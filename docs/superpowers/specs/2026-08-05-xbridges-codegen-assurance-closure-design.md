# X-Bridges Code-Generation Assurance Closure Design

**Date:** 2026-08-05

## Purpose

Close the assurance gaps found while reviewing X-Bridges state execution inside
the generated state-machine C package. The work must preserve the current
Stateflow-style execution contract, keep the supplied model unchanged, and make
embedded capability claims correspond to executable simulator and strict-C99
evidence.

## Scope

This change covers five related assurance gaps:

1. Reject incompatible X-Bridges connections before semantic IR or C generation.
2. Execute compiled-C conformance tests for every block and signal shape claimed
   by the embedded capability registry.
3. Add a regression scenario for the supplied history/X-Bridges/timing model that
   explicitly stimulates `x = 1` so its X-Bridges owner state is exercised.
4. Synchronize embedded-code documentation with the authoritative capability
   registry.
5. Give expensive compiler-backed tests explicit budgets that reflect their
   measured runtime and avoid false CI failures.

The supplied file
`C:\Users\EL-Dawlia\Downloads\xv\statemachine-history-xbridges-timing-fixed.json`
is an input fixture only. It will not be modified.

## Assurance Boundary

The completed work establishes host-side semantic validation, deterministic
simulator/generated-C equivalence, and strict C99 compiler acceptance. It does
not claim MISRA certification, WCET evidence, target compiler qualification,
SIL/PIL qualification, MCU execution, or HIL release readiness. Those remain
separate gates in `docs/CODEGEN_MCU_VERIFICATION_GATE.md`.

## Design

### 1. Fail-closed edge compatibility

`validateXBridgesModel` will validate every resolved edge after confirming that
its endpoints exist. A connection is valid only when:

- source and destination shapes are identical;
- their exact dimensions are identical in order and value; and
- their canonical numeric types are compatible.

Numeric types may differ only when the destination node is an explicit
`DATA_TYPE_CONVERSION` or `NUMERIC_REPRESENTATION` block. Automatic or missing
type declarations continue to resolve through the existing semantic builder;
the validator must not invent a new implicit conversion rule.

An incompatible edge produces a deterministic error diagnostic associated with
the edge. Semantic IR and C generation therefore stop before any generated loop
can index storage using an incompatible element count. Scalar driver-count
validation remains unchanged.

Tests will cover scalar/vector shape mismatch, unequal vector lengths, unequal
matrix dimensions, numeric-type mismatch, and the permitted explicit-conversion
case. The first four tests must fail against the current validator before the
implementation is added.

### 2. Executable capability evidence

The capability registry remains the authoritative opt-in list. Its conformance
manifests will become inputs to executable tests rather than independent metadata
that tests only compare with other metadata.

Compiled-C tests will parameterize the currently under-evidenced families:

- all 24 trigonometric and hyperbolic operations;
- `SATURATION`, `DEADZONE`, `RATE_LIMITER`, and `RELAY`;
- `SWITCH`, `MUX`, `DEMUX`, and `IF_ELSE` for every declared scalar, vector, and
  matrix shape that is semantically meaningful; and
- all Boolean and bitwise operations, including `BitwiseOR`, `BitwiseXOR`, and
  `BitwiseNOT`.

Each case must build semantic IR, generate the production C artifacts, compile
with `gcc -std=c99 -pedantic-errors -Wall -Wextra -Werror`, execute a harness,
and compare results with the canonical interpreter or an independent analytical
expectation. Stateful blocks must use multi-tick traces that verify their memory
updates, not only their initial output.

Where a capability declaration is too broad for the block's actual semantics,
the registry must be narrowed instead of creating artificial tests. In
particular, MUX and DEMUX shape coverage must express their real concatenation
and partition contracts rather than assuming arbitrary same-shape ports.

The registry completeness test will continue to reject enabled blocks without
conformance identifiers, but executable test-case registration will also expose
the block types and shapes actually exercised. Coverage succeeds only when the
executed cases cover the capability declaration.

### 3. Supplied-model regression

A repository fixture will load a checked-in copy or a minimal deterministic
representation of the supplied model. The test will not depend on the user's
Downloads directory.

The scenario will explicitly set state-machine variable `x` to `1` on its first
step. It will then compare the canonical simulator trace against a freshly
generated and strictly compiled C trace through entry into `State_2`, the
X-Bridges integrator sequence, the `xb_output >= 0.75` inner transition, and the
following outer transition back to `State_1`.

Required observable output sequence is:

`0, 0, 0.2, 0.4, 0.6, 0.8`

Float32 values use the existing trace comparison tolerance and representation.
The test must also assert that running the unmodified model without the explicit
stimulus does not enter `State_2`; this documents why the stimulus is required.

### 4. Documentation synchronization

`docs/XBRIDGES_EMBEDDED_CODEGEN.md` will list the enabled families currently
declared by `xbCapabilities.ts`, including extended Boolean/bitwise, routing,
trigonometric/hyperbolic, and discontinuity blocks. Host-only and unsupported
sections will be corrected so they do not contradict the registry.

A lightweight documentation-consistency test will verify the registry remains
the authority. It should check stable family/table markers, not snapshot the
entire Markdown file or duplicate the complete registry in another hard-coded
list.

### 5. Stable compiler-test budgets

Only tests proven to exceed the default timeout receive explicit timeouts.
Timeouts will be set at or above twice the observed isolated runtime, with a
minimum practical compiler-backed budget of 120 seconds. Increasing a timeout
does not replace behavioral assertions and must not hide hangs through retries.

The two previously observed cases are:

- missing active children validation in `smCGenerator.test.ts`; and
- lazy block-library loading in `xbInterpreter.test.ts`.

If the block-library import can be moved to deterministic suite setup without
changing behavior, that is preferred over relying only on a longer timeout.

## Error Handling

New validation diagnostics must be deterministic, identify the edge and both
incompatible port contracts, and use severity `error`. Unknown endpoints keep
the existing dangling-port diagnostic and must not produce a second misleading
compatibility diagnostic.

Compiler or harness failures remain hard test failures. Missing GCC is not an
accepted pass condition for the embedded conformance suite.

## Verification

Verification is performed in increasing scope:

1. Red/green validator regression tests.
2. Parameterized compiled-C tests for each newly evidenced family.
3. Supplied-model simulator/generated-C differential test.
4. Existing X-Bridges integration and generator suites.
5. Full state-machine differential suite.
6. `npx tsc --noEmit`.
7. `git diff --check` for files changed by this work.

All compiled-C cases use strict warnings-as-errors. Any timeout, skipped required
case, simulator/C mismatch, generated-code diagnostic, or TypeScript error blocks
completion.

## Acceptance Criteria

- Incompatible edge shapes, dimensions, and numeric types fail before code
  generation; explicit conversion remains valid.
- No generated-C-capable block or declared shape is covered only by metadata.
- The supplied-model regression enters `State_2` through explicit stimulus and
  has no simulator/C trace mismatch.
- The embedded capability documentation agrees with the registry.
- Previously flaky tests pass within explicit deterministic budgets.
- Existing state-machine history, parallel-state, transition-order, solver,
  numeric-fault, reset/retain, and strict-C99 tests remain green.
- The final report clearly separates host C99 assurance from target/HIL release
  gates.

## Non-Goals

- Changing the supplied JSON's transition logic or normal runtime behavior.
- Adding new X-Bridges block implementations.
- Refactoring unrelated state-machine or V-Lab code.
- Claiming MCU, HIL, WCET, MISRA, ISO 26262, or IEC 61508 qualification.
