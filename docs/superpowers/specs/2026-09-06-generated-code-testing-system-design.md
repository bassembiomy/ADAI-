# Generated-Code Testing System Design

**Date:** 2026-09-06
**Status:** Approved design
**Scope:** End-to-end verification of generated ADIA state-machine C packages

## 1. Goal

ADIA shall generate a model-derived, host-executable C test suite with every state-machine C package and shall execute a fail-closed verification pipeline covering structural and semantic validation, strict host compilation, runtime behavior, sanitizers, coverage, differential testing, static and MISRA analysis, target compilation, and hardware evidence. Structural validation alone must never be reported as successful code verification.

## 2. Design Decisions

### 2.1 Model-derived verification manifest

The validated `SemanticModel` is the only authority for expected behavior. A new test-plan builder converts it into a typed verification manifest before production C is rendered. The builder must not inspect or parse generated C to determine expected states, values, action order, timing outcomes, mappings, or safe outputs.

The manifest contains:

- model identity and model hash;
- configured C standard, tick duration, tick tolerance, timer policy, reset policy, safety policy, coverage thresholds, repetition count, and enabled target/tool adapters;
- one isolated test-case definition per scenario;
- test vectors, setup mutations, expected observations, and applicability reason;
- traceability to model, state, transition, requirement, generated function, and test-case IDs;
- expected state, action, timer, I/O, fault, watchdog, and reset behavior;
- differential input sequences and expected reference trace metadata.

Every generated test is traceable to this manifest. The generated C source contains the same traceability fields in a structured comment above each test function.

### 2.2 Verification configuration

Verification configuration becomes an explicit input to generation. The supported language standards are C90, C99, and C11; C11 is the default for existing models that omit the setting. The report always records the resolved standard.

The configuration defines:

- nominal tick and lower/upper tolerance;
- timer accumulation policy: logical tick or actual `delta_ms`;
- invalid-input behavior per mapping: clamp, reject, substitute default, or diagnostic fault;
- safe value per safety-related output;
- fault-latch and authorized-reset rules;
- watchdog behavior after critical faults;
- statement, branch, and conditional MC/DC requirements;
- long-run cycle count;
- host compiler and optional target/static/MISRA tool adapters.

Configuration required by a feature is validated before artifact generation. Missing safety values, missing input sources, inconsistent timing settings, or an invalid target/tool selection are generation-blocking diagnostics.

### 2.3 Package layout

Generated production and test sources are stored separately:

```text
generated-package/
  production/
    sm_config.h
    sm_core.c
    sm_core.h
    sm_mapping.c
    sm_mapping.h
    sm_safety.c
    sm_safety.h
    sm_user_logic.c
    sm_user_logic.h
  tests/
    test_sm_initialization.c
    test_sm_transitions.c
    test_sm_actions.c
    test_sm_timing.c
    test_sm_safety.c
    test_sm_io.c
    test_sm_reset.c
    test_sm_robustness.c
    test_sm_hierarchy.c
    mcal_test_stub.c
    mcal_test_stub.h
    test_support.c
    test_support.h
    test_main.c
  verification/
    test_manifest.json
    differential_vectors.json
    verification_results.json
    coverage_results.json
    static_analysis_results.json
    traceability.json
    sm_testing_report.md
    static_metrics_report.md
```

`test_sm_hierarchy.c` is emitted when hierarchy, history, or parallel regions exist. Otherwise, the report records those feature tests as `NOT APPLICABLE`.

### 2.4 Dependency-free generated C test runtime

Generated packages use a small ADIA-owned C test runtime rather than requiring a third-party unit-test library. It provides deterministic assertions, suite/test registration, per-test setup, structured result output, and nonzero process exit on any failed test.

Each test function declares a local `ADIA_Instance_t`, resets the MCAL stub, initializes only its own inputs/configuration, and performs no dependency on another test. Test execution order may be shuffled by generator-level integration tests to prove isolation.

### 2.5 MCAL observability

The generated MCAL test stub records:

- function kind;
- channel number;
- read or written value;
- call count;
- global call sequence;
- safe-output invocation and applied values;
- watchdog-service calls.

It exposes bounded query APIs to tests. Overflow of the call log fails the current test rather than silently dropping evidence. `SM_Init(NULL)`, `SM_Reset(NULL)`, and other invalid public calls must leave the log unchanged unless the specified safety policy explicitly requires a safe-output action.

## 3. Generated Test Suites

### 3.1 Initialization

Initialization tests cover null instances, configured default-state activation, inactive non-default states, active slots, zero timers, cleared error/fault fields, one initial entry action, initial outputs, and invalid mapping configuration. The reviewed two-state model asserts `State_1` as the default state.

### 3.2 Transitions and actions

The planner emits guard-false, guard-true, relational-boundary, priority, one-transition-per-layer-per-cycle, and complete-transition cases. It derives action/result expectations from semantic action nodes. Tests observe guard evaluation, source exit, transition action, target entry, and applicable during action in configured semantic order.

Internal and external self-transitions are separate cases. Internal self-transitions exclude exit/entry actions; external self-transitions require exit followed by entry. For the reviewed model, `x == false` remains in `State_1`, while `x == true` takes `State_1` to `State_2` and produces `y == 10`.

### 3.3 Timing

Timing cases cover nominal, inclusive lower/upper tolerance, immediately out-of-range values, timer increment according to the configured policy, timer reset on exit, and saturating behavior near `UINT32_MAX`. The reviewed configuration accepts 450, 500, and 550 ms and faults on 449 and 551 ms.

### 3.4 Safety

Safety cases inject timing and state-corruption faults. They prove active-state exit, error assignment, fault latching, safe-output application and values, prevention of normal transitions/output writes, idempotent repeated fault handling, and configured watchdog behavior. Corruption cases independently mutate active states, activity flags, shallow/deep history, and layer-slot relationships and run under sanitizers.

### 3.5 Inputs and outputs

For every semantic I/O mapping, tests prove channel selection, conversion, invalid-input policy, and ordering. The MCAL log proves that input sampling precedes guard evaluation and output writes follow successful execution and validation. If `y` is externally mapped in the reviewed model, the test proves that 10 is written after entry to `State_2`.

### 3.6 Reset

Reset tests cover null reset, normal reset, authorized reset after a fault, rejected reset conditions, action counts, timer/history/error/fault clearing, restoration of default values and states, and initial output application.

### 3.7 Robustness, hierarchy, and history

All public APIs receive null and invalid ID/index cases as applicable. Generated array boundaries are exercised at minimum and maximum valid indices. A configurable long-run case checks stable state, output, counter, and memory behavior. Conditional hierarchy tests cover default children, parent entry/exit, shallow/deep history, reset/fault history behavior, and parallel-region activation, exit, and consistency.

## 4. Verification Execution Pipeline

The pipeline executes gates in dependency order and records evidence independently:

1. Structural validation.
2. Semantic validation and verification-configuration validation.
3. Production C and model-derived test-manifest generation.
4. Independent test-source generation and traceability validation.
5. Strict host compile/link of all production and test sources.
6. Isolated host runtime suites.
7. AddressSanitizer and UndefinedBehaviorSanitizer builds and runs.
8. Instrumented statement and branch coverage run; conditional MC/DC when required and supported.
9. Cycle-by-cycle model-to-C differential comparison.
10. Static metrics and configured static-analysis adapter.
11. Configured MISRA-analysis adapter and deviation evaluation.
12. Configured target-pack compiler invocation.
13. Hardware/HIL evidence ingestion, if performed.

Host compilation always includes `-Wall -Wextra -Werror -Wpedantic -Wconversion -Wsign-conversion -Wshadow` plus the configured `-std=` value. Commands, compiler identity/version, exit status, stdout/stderr, and artifact hashes are retained in evidence.

Downstream executable gates are not attempted after host compilation fails and are recorded as `NOT RUN`. Missing host or target compilers cannot yield `PASS`. A missing optional analysis adapter produces `NOT RUN`; if that activity is mandatory for acceptance, overall acceptance remains blocked.

## 5. Coverage and Differential Evidence

Coverage is accepted only from executed instrumented production code. Static reachability remains explicitly labeled as a structural estimate. Statement coverage for generated model-specific behavior is 100%. Branch coverage is 100% for guards, state selection, timing checks, error handling, and configuration validation. Uncovered entries contain file, function, line, reason, and corrective action or approved justification.

For safety-related compound decisions, the manifest derives condition toggles from the semantic expression tree and records MC/DC obligations. If the configured tool cannot measure MC/DC, the result is `NOT RUN`, not inferred from branch coverage.

Differential testing sends the same inputs and elapsed time through the reference interpreter and compiled C. Each cycle compares active states, variables, outputs, timers, transitions, entry/during/exit actions, and error state. The first mismatch fails the gate and records cycle, field, expected/actual values, model hash, input vector, and replay command.

## 6. Static Analysis, MISRA, and Identifier Policy

Static and MISRA tools are invoked through typed adapters that normalize tool name/version, rules checked, severities, source locations, suppressions, and deviations. Reports retain mandatory, required, and advisory counts and every approved deviation with justification.

Externally linked C identifiers use short deterministic symbols with collision handling constrained by the selected standard and target compiler's significant-character limit. Original UUIDs remain in traceability comments and mapping files and are never emitted directly as long external function names.

Static metrics include cyclomatic complexity, nesting depth, function length, parameter count, and static stack estimate when the selected tool supports it. Unsupported stack estimation is reported as `NOT RUN`.

## 7. Evidence and Reporting

One canonical evidence model feeds Markdown, application report documents, CLI summaries, and JSON. Each activity has only its allowed statuses:

- structural and semantic validation: `PASS` or `FAIL`;
- host/target compilation, runtime, sanitizer, differential, static, and MISRA analysis: `PASS`, `FAIL`, or `NOT RUN`;
- statement/branch coverage: measured value or `NOT RUN`;
- MC/DC: measured value, `NOT RUN`, or `NOT APPLICABLE`;
- hardware: `PASS`, `FAIL`, or `PENDING`.

No activity result is inferred from another. Overall acceptance is a derived fail-closed decision: all applicable mandatory gates must contain acceptable executed evidence and all thresholds must be met. Target compilation is mandatory before delivery to an embedded integration engineer. Hardware remains independent and may remain `PENDING` before a hardware campaign, but it cannot be described as passed.

## 8. Integration With Existing ADIA Modules

- `smSemanticModel.ts` receives verification configuration and requirement metadata.
- New focused modules build the verification manifest and render each test family.
- `smCGenerator.ts` orchestrates production artifacts and delegates test generation rather than embedding all test templates.
- `smCHarness.ts` retains low-level compilation/trace support and is extended with reusable command evidence.
- A new verification runner coordinates compiler, sanitizer, coverage, analysis, MISRA, and target adapters.
- `smPipelineOrchestrator.ts` runs the ordered gates and returns the canonical evidence bundle.
- `smVerificationAggregator.ts` derives acceptance without mapping missing work to success.
- `smReports.ts` and `createStateMachineVerificationReport.ts` render the same canonical evidence.
- `smFileWriter.ts` writes the separated package layout while retaining traversal protection.
- Existing target packs and HIL build services supply target compilation and hardware evidence.

## 9. Error Handling

- Invalid model or verification configuration stops generation with model-element diagnostics.
- Manifest or test-rendering failure prevents a generated-test claim.
- Compile failure records diagnostics and marks dependent runtime activities `NOT RUN`.
- Assertion failure, crash, timeout, sanitizer finding, trace mismatch, or coverage shortfall fails only its factual activity and blocks overall acceptance.
- Missing target compiler records `NOT RUN` and blocks embedded delivery.
- MCAL call-log overflow and malformed result files are verification failures.
- Suppressed analysis diagnostics remain visible with their justification.
- Tool output is bounded and stored safely; process execution uses argument arrays rather than shell interpolation.

## 10. Test Strategy for the Generator and Pipeline

TypeScript unit tests verify manifest derivation, traceability, boundary-vector synthesis, applicability, deterministic IDs, identifier shortening, evidence transitions, and report rendering. Golden tests verify deterministic generated file names and contents.

Compiled integration fixtures cover:

- the reviewed `State_1`/`State_2`, `x`, `y`, and 500 ± 50 ms model;
- transition priority and one-transition-per-layer behavior;
- internal and external self-transitions;
- hierarchy, shallow/deep history, and parallel regions;
- invalid mappings, corrupted runtime state, safe outputs, fault latch, and authorized reset;
- all invalid-input policies and watchdog strategies;
- timer saturation and long-run execution.

Pipeline tests use fake tool adapters for every PASS, FAIL, `NOT RUN`, `NOT APPLICABLE`, and `PENDING` path. Real compiler integration tests run when supported and explicitly skip otherwise; a skipped compiler test can never be converted into passing verification evidence.

## 11. Acceptance

Generated-code verification is accepted only when strict host compilation, all applicable runtime tests, sanitizer runs, required executed coverage, differential testing, safe-output evidence, static analysis, MISRA resolution/deviations, and target compilation satisfy their configured policies. Reports must distinguish executed evidence from static estimates and unavailable or pending work.
