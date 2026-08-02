# Stateflow-Like Code Generation Runtime Efficiency Design

## Objective

Correct the generator defects found in `generated_code_1785603489624.zip`
without editing generated C manually. Generated simulation and C must use the
same deterministic state-machine semantics, while the output remains bounded,
portable C99 suitable for MCU integration.

## Confirmed Root Causes

1. `xbCGenerator.ts` iterates over `substepsPerTick` while rendering text, so a
   50-substep model contains 50 source copies of the complete X-Bridges graph.
2. `smCGenerator.ts` advances state timers by observed `delta_ms`, while the
   X-Bridges semantic IR always advances a fixed `tickMs / solverStep` number
   of substeps. An accepted jittered call therefore has two logical clocks.
3. `smReports.ts` builds `unsupportedCapabilities` from the complete global
   capability registry instead of the operation types used by the model.
4. The report renderer supports executable evidence, but the application
   always calls it without trusted host evidence. The exported package is
   therefore correctly labeled `STATIC_ANALYSIS_ONLY` even when the desktop
   environment could perform a host smoke test.
5. Semantic states retain names, IDs, and generated enum names, but the reports
   and user-action hooks expose only UUID-derived symbols.

## Considered Approaches

### A. Continue generation-time unrolling

This avoids a runtime loop but makes source size, flash, compile time, and code
review effort proportional to the solver substep count. It is rejected.

### B. Emit one state-specific substep helper and a bounded C loop

The step function samples mapped inputs once, calls one static solver helper
exactly `substepsPerTick` times, and commits mapped outputs once. This preserves
the interpreter order, generates one copy of each operation, has a compile-time
loop bound, and uses no dynamic memory. This is the selected approach.

### C. Hybrid unroll-small/loop-large rendering

This can improve performance for tiny bounds but creates two code paths and
doubles parity obligations. It is rejected until target measurements prove it
necessary.

For time, variable elapsed-time integration was considered and rejected. It
would require partial solver steps, remainder storage, and variable-rate sample
scheduling. The selected Stateflow-like contract uses fixed logical time.

## Logical-Time Contract

- `SM_Step(instance, delta_ms)` treats `delta_ms` as an observed scheduler
  interval used only for the timing-tolerance check.
- Every accepted call advances state timers by exactly `SM_TICK_MS`.
- Every accepted call advances X-Bridges by exactly
  `solver.substepsPerTick * solver.stepSeconds == SM_TICK_MS`.
- A call outside `SM_TICK_TOLERANCE_MS` latches `SM_ERR_TIMING` before timers,
  transitions, actions, or X-Bridges execute.
- The TypeScript semantic runtime applies the same normalization. A new
  non-mutating snapshot API replaces tests or UI code that previously called
  `stepRuntime(runtime, 0)` only to inspect state.
- Trace frames retain the observed elapsed interval for diagnostics, but state
  timers and behavioral decisions use the normalized logical interval.

## Compact X-Bridges Rendering

For every X-Bridges state, the generator emits:

```c
static void SM_XB_<STATE>_SolverSubstep(ADIA_Instance_t *instance)
{
    /* One canonical solver-substep graph. */
}

void SM_XB_<STATE>_Step(ADIA_Instance_t *instance)
{
    uint32_t xb_substep;
    /* Reset faults and sample mapped state-machine inputs once. */
    for (xb_substep = 0U;
         xb_substep < SM_XB_<STATE>_SUBSTEPS_PER_TICK;
         ++xb_substep) {
        SM_XB_<STATE>_SolverSubstep(instance);
    }
    /* Synchronize faults and commit mapped outputs once. */
}
```

The bound is emitted as a state-specific unsigned macro in `sm_xbridges.h`.
The helper remains `static`, has no recursion or allocation, and preserves the
existing transaction, fault, schedule-counter, Euler, and RK4 ordering.

Generated-source regression tests require operation text and object-code size
to remain independent of large substep counts. Reports expose substep count and
estimated operation evaluations per state-machine tick so MCU engineers can
evaluate WCET explicitly.

## Model-Scoped Reports

Reports contain only capabilities referenced by validated model operations.
For each used operation type:

- supported operations contribute required target capabilities;
- unsupported operations contribute their reason;
- unused catalogue entries are omitted.

The report adds a traceability table with model state name, model ID, generated
C enum, layer, and X-Bridges flag. Generated user-logic declarations receive
the same name/ID comments. Existing UUID-based symbols are retained to avoid an
ABI change.

## Trusted Host Verification

The pure generator remains deterministic and does not invoke external tools.
`CGeneratorOptions` accepts immutable `VerificationEvidence`, and report
rendering consumes only that evidence.

The Electron main process provides an allowlisted `sm-verify-generated-c` IPC
handler. It writes only recognized generated filenames into an application
temporary directory, invokes `gcc` with a fixed argument array and
`shell: false`, compiles production and trace variants, runs a generated smoke
harness, returns bounded logs and evidence, and removes the temporary directory.

Security requirements:

- keep `contextIsolation: true`, `nodeIntegration: false`, and sandboxing;
- add the IPC channel explicitly to `preload.cjs`;
- require engineer-level `codegen.verify` permission;
- limit file count, per-file bytes, total bytes, and accepted filenames;
- use `path.resolve` containment checks and `fs.mkdtemp`;
- never accept a compiler command or command-line flags from the renderer;
- use `spawn` with argument arrays, timeouts, output limits, and `shell: false`;
- treat missing compiler, timeout, nonzero exit, malformed response, or failed
  smoke test as not-run/failed evidence, never as PASS.

Browser-only export continues safely with `STATIC_ANALYSIS_ONLY`. Electron
generation rerenders the report with host compile/runtime evidence only after
the trusted verifier succeeds. Dynamic reachability and differential evidence
remain NOT RUN unless their own model-specific executions occurred. A smoke
test never upgrades either label.

## Generated Smoke Harness

The generator emits an internal verification harness, not part of the MCU
application sources, that:

1. fills the instance with nonzero bytes;
2. calls `SM_Init` and validates the default active configuration;
3. executes one exact logical tick and `SM_WriteOutputs`;
4. calls `SM_Reset` and revalidates the default configuration;
5. compiles with and without `SM_TRACE_ENABLED`;
6. returns nonzero on any API or consistency failure.

This proves initialization, linkage, safety validation, and executable
X-Bridges integration. It does not claim dynamic reachability of every state.

## Compatibility

- No generated public C API signatures change.
- No state, history, parallel-region, internal-transition, fixed-point,
  floating-point, or X-Bridges scheduling semantics may regress.
- Existing exact-tick simulation calls behave identically.
- Accepted jitter changes only timer accumulation: it now advances one fixed
  logical tick, matching Stateflow fixed-step generated code.
- Existing generated UUID symbols remain stable.

## Acceptance Criteria

1. A four-block, 50-substep X-Bridges state contains one rendered operation
   graph and one bounded C loop.
2. Optimized `sm_core.o` growth from 1 to 50 substeps is bounded to loop setup,
   not 50 copies of the graph.
3. Accepted jitter advances TypeScript and C state timers by exactly
   `tickMs`; out-of-tolerance jitter faults before behavioral execution.
4. Euler, RK4, discrete schedules, transaction rollback, boundary mappings,
   and numeric-fault differential tests remain equal between TypeScript and C.
5. Reports omit every unsupported capability not used by the model and include
   operation-evaluations-per-tick metrics.
6. Reports include complete state name/ID/C-symbol traceability.
7. A successful trusted host gate records host compile/runtime PASS only.
   Dynamic reachability and compiled X-Bridges parity remain NOT RUN until
   dedicated reachability and differential evidence pass; missing or failed
   verification cannot produce any PASS label.
8. Production and trace artifacts compile under strict C99 with
   `-pedantic-errors -Wall -Wextra -Werror`.
9. The packaged standalone runtime bundle regenerates deterministically.

## Out of Scope

- Variable-step solvers.
- Target-specific WCET certification.
- Formal MISRA certification.
- Automatic dynamic reachability without model-specific test stimuli.
- Renaming existing generated C symbols.
