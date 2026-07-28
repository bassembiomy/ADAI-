# ADIA State-Machine Semantic Parity Design

## 1. Purpose

This specification defines a generic redesign of the ADIA state-machine simulation and C code-generation pipeline. The redesign fixes the reviewed generator defects and makes application simulation and generated C execute the same normalized semantic model.

The behavioral reference is the documented execution model of MathWorks Stateflow:

- Active-state execution evaluates outer transitions first, then performs the state during action, evaluates inner transitions, and finally executes active children.
- Parallel (AND) children are simultaneously active but execute in a deterministic configured order.
- Inner transitions do not exit their source state.
- History restores prior substate activity and falls back to default entry when no valid history exists.

Reference documentation:

- <https://www.mathworks.com/help/stateflow/ug/what-do-semantics-mean-for-stateflow-charts.html>
- <https://www.mathworks.com/help/stateflow/ug/chart-during-actions.html>
- <https://www.mathworks.com/help/stateflow/ug/execution-order-for-parallel-states.html>
- <https://www.mathworks.com/help/stateflow/ug/inner-transitions.html>
- <https://www.mathworks.com/help/stateflow/ug/recording-state-activity-with-history-junctions.html>
- <https://www.mathworks.com/help/stateflow/ug/evaluate-transitions.html>

ADIA terminal states are an application extension. A terminal state is a quiescent active leaf and never resets the complete chart automatically.

## 2. Goals

1. Make the application simulator and generated C behaviorally identical for all supported features.
2. Represent hierarchy, exclusive decomposition, parallel decomposition, transition paths, history, timing, and I/O explicitly.
3. Remove topology and I/O behavior inferred from variable names or combinations of child flags.
4. Generate portable C99 suitable for integration with target MCU drivers.
5. Preserve existing projects through deterministic schema migration.
6. Replace generated-text repair with validated semantic construction and structured rendering.
7. Produce reports whose claims come from the same semantic and analysis results used for execution.

## 3. Non-Goals

1. Bit-for-bit reproduction of MathWorks generated source layout.
2. Automatic whole-chart reset on terminal-state entry.
3. Inferring hardware bindings from names such as `x`, `y`, `motor_*`, or `*_active`.
4. Implementing event broadcasting, graphical functions, subcharts, or other Stateflow features that do not exist in the current ADIA application model.
5. Claiming formal MISRA compliance or safety certification from generator-local checks.

## 4. Authoritative Pipeline

All consumers use one normalized semantic representation:

```text
Saved ADIA model
      |
      v
Schema migration
      |
      v
Structural and semantic validation
      |
      v
Normalized State-Machine IR
      +--> TypeScript reference interpreter --> application simulation
      +--> C99 renderer ----------------------> embedded application layer
      +--> Analysis/report renderer ----------> metrics and test scenarios
```

The simulator and C renderer must not independently infer decomposition, hierarchy, transition classification, entry/exit paths, history behavior, or I/O direction.

## 5. Model Schema

### 5.1 Explicit decomposition

Each state container and the root container own a decomposition:

```ts
type StateDecomposition = 'OR' | 'AND';

interface Layer {
  id: string;
  name: string;
  parentStateId: string | null;
  decomposition: StateDecomposition;
  stateIds: string[];
  transitionIds: string[];
  junctionIds: string[];
}
```

For an OR layer, exactly one direct child can be active. For an AND layer, every direct child is a parallel state and can contain its own nested OR or AND layer.

The existing per-state `isParallel` field becomes migration-only metadata. New execution logic must not use it.

### 5.2 Explicit I/O mappings

Hardware behavior comes only from Signal Mapper/HIL mappings. Each mapping identifies:

- ADIA variable ID.
- Driver channel ID.
- Direction: hardware-to-model read or model-to-hardware write.
- Data conversion.
- Allowed range.
- Safe output value when applicable.

Model variables without mappings remain internal variables.

### 5.3 Schema version

Saved charts gain an explicit schema version. Loading an older chart runs a pure deterministic migration before validation. Saving writes only the current schema.

## 6. Normalized Semantic IR

The IR contains stable IDs and precomputed relationships:

- Root container.
- States, junctions, layers, and variables.
- Parent state and containing layer for every state.
- OR/AND decomposition for every container.
- State and transition execution priorities.
- Active configuration slot for every OR layer.
- Activity flag index for every state.
- State ancestry and depth.
- Lowest-common-ancestor exit and entry paths for state destinations.
- Outer, inner, internal action-only, and external self-transition classification.
- Default-entry and junction decision graphs.
- Shallow/deep history storage policy and history slots.
- State timer indices and normalized temporal thresholds.
- Quiescent terminal-state markers.
- Safe state and safe output definitions.
- Explicit input/output bindings.

IR construction fails when the chart is ambiguous or unsafe to render. Rendering functions consume only validated IR.

## 7. Runtime Semantics

### 7.1 Tick cycle

The complete target cycle is:

1. Read explicitly mapped inputs.
2. Validate timing and runtime configuration.
3. Increment timers for active states using saturating arithmetic.
4. Execute the root active configuration.
5. Commit mapped outputs.
6. Kick the hardware watchdog after successful execution and output commitment.

The simulator uses the same ordering, with in-memory input and output adapters.

### 7.2 Active-state execution

For each active state:

1. Evaluate outer transition paths in ascending priority order.
2. If a complete valid path is selected, execute that transition and stop executing the source configuration for the current tick.
3. If no outer transition is selected, run the state during action.
4. Evaluate inner transition paths in ascending priority order.
5. If no inner transition changes the active child configuration, execute active children.

### 7.3 Transition selection and commitment

Transition-path evaluation is side-effect controlled:

- Guards and temporal conditions are evaluated in priority order.
- Junction paths support deterministic backtracking.
- Runtime active-state changes are not committed until a complete path reaches a state destination.
- Condition actions execute at the semantic point defined by the normalized transition path.
- Transition actions execute after state exit and before destination entry.
- Only the first valid complete path from a source is taken.
- Cyclic junction paths that cannot terminate are rejected or bounded according to validator policy; they are never emitted as unbounded generated recursion.

### 7.4 Exit and entry

For an external transition:

1. Exit active descendants from deepest to shallowest.
2. Exit parallel children in reverse activation/priority order.
3. Exit ancestors up to, but not including, the lowest common ancestor.
4. Execute the transition action.
5. Enter destination ancestry from the lowest common ancestor downward.
6. Mark each state active before its entry action.
7. Execute each entry action once.
8. Execute default entry for newly entered composite states.

An external self-transition exits and re-enters the source. An internal action-only transition performs its action without source exit or entry.

### 7.5 Parallel AND decomposition

- Enter every direct child in ascending priority order.
- Execute every still-active child once per tick in ascending priority order.
- Exit children in reverse priority order.
- A transition inside one parallel child does not deactivate siblings unless the transition exit path leaves their common AND parent.
- If an earlier child transition exits the common AND parent, later siblings are no longer active and do not execute in that tick.

### 7.6 History

- Shallow history records and restores the last active direct child of an OR container. Nested descendants follow their default entry paths.
- Deep history records and restores the complete descendant configuration.
- For nested AND containers, deep history records the active configuration of every child region.
- History is recorded during orderly exit.
- First entry without valid history follows the default entry path.
- Explicit reset clears every history slot.

### 7.7 Terminal states

- A terminal state runs its entry action once.
- It remains active and quiescent.
- It has no implicit outgoing behavior.
- Sibling parallel states continue executing.
- It never calls `SM_Reset()`.
- Leaving the configuration requires an explicit modeled transition that is valid under the model rules or an explicit public reset request.

## 8. Reset, Errors, and Safe Outputs

### 8.1 Reset

`SM_Reset()`:

1. Exits the current active configuration so exit actions run.
2. Restores every model variable to its declared initial value.
3. Clears global and per-state timers.
4. Clears active configuration and state activity flags.
5. Clears history.
6. Clears recoverable error status.
7. Enters the root default configuration.
8. Commits resulting output values.

Reset is an explicit API operation and is never invoked by terminal-state entry.

### 8.2 Fault entry

On a fault:

1. Exit the active configuration in the defined order when execution remains trustworthy.
2. Enter the modeled safe state when one is configured and valid.
3. Apply safe output values synchronously.
4. Stop normal chart execution while the error remains latched.
5. Do not report a successful watchdog cycle before safe outputs are committed.

The generated consistency check validates:

- State enum bounds.
- State-to-layer membership.
- Parent activity for active children.
- Exactly one active child in each active OR container.
- All required children active in each active AND container, except explicitly quiescent/completed semantics represented by the IR.
- Agreement between active slots and state activity flags.
- History values belong to their declared containers.

## 9. Generated MCU Interface

The generated public interface is:

```c
SM_Error_t SM_Init(ADIA_Instance_t *instance);
SM_Error_t SM_Reset(ADIA_Instance_t *instance);
SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance);
SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms);
SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance);
SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance);
SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t group);
SM_Error_t SM_GetError(const ADIA_Instance_t *instance);
```

`SM_Sync_IO()` remains as a deprecated compatibility wrapper that performs read followed by write. It is not the recommended cyclic scheduler. Target integration uses:

```c
(void)SM_ReadInputs(&sm_instance);
(void)SM_Step(&sm_instance, elapsed_ms);
(void)SM_WriteOutputs(&sm_instance);
```

MCAL declarations remain visible in all configurations:

```c
bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);
```

`MCAL_CUSTOM_DIO` selects target definitions but never suppresses declarations. Host stubs are generated only under an explicit test-stub option. Production generation fails validation when required mappings or MCAL contracts are missing.

## 10. Component Boundaries

The redesign introduces focused modules:

- `src/utils/stateMachine/smModelMigration.ts`: legacy-to-current schema migration.
- `src/utils/stateMachine/smSemanticModel.ts`: normalized IR types.
- `src/utils/stateMachine/smSemanticBuilder.ts`: model-to-IR construction.
- `src/utils/stateMachine/smSemanticValidator.ts`: structural and semantic validation.
- `src/utils/stateMachine/smInterpreter.ts`: authoritative TypeScript runtime.
- `src/utils/stateMachine/smCGenerator.ts`: C file orchestration and structured rendering.
- `src/utils/stateMachine/smCExpressions.ts`: typed condition/action parsing and C rendering.
- `src/utils/stateMachine/smReports.ts`: reports from IR and verified results.
- `src/utils/stateMachine/smTrace.ts`: common trace schema and comparison.

`src/utils/stateMachineCodeGenerator.ts` remains temporarily as a compatibility facade and delegates to the new modules. Simulation logic currently embedded in `src/App.tsx` moves behind the interpreter API without changing UI behavior.

## 11. Validation Policy

Generation fails with actionable diagnostics for:

- Missing or duplicate state/layer membership.
- Cyclic parent hierarchy.
- OR container without one valid default-entry path.
- AND container with duplicate or invalid priorities.
- Ambiguous legacy decomposition migration.
- Dangling transitions or transition paths that cannot reach a state where a state destination is required.
- Invalid internal/inner transition destination.
- Invalid or cyclic unbounded junction graphs.
- History junction outside a valid parent container.
- Duplicate or direction-incompatible I/O mappings.
- Missing safe values for safety-critical mapped outputs.
- Type-invalid guards, actions, conversions, or initial values.

Warnings, rather than silent guesses, cover unreachable states and intentional sink/quiescent states.

## 12. Verification Strategy

### 12.1 Differential behavior tests

Each semantic fixture runs identical stimuli through:

1. The TypeScript reference interpreter.
2. Generated C compiled and executed by a host harness.

Traces must match after initialization and every tick for:

- Active configuration.
- Ordered action log.
- Variable values.
- Mapped outputs.
- Timers.
- History.
- Error and safe-state status.

### 12.2 Required fixture matrix

- Flat OR transitions and priority conflicts.
- Hierarchical entry/exit and cross-boundary transitions.
- External self-transition.
- Internal action-only transition.
- Inner transition to a descendant.
- Inner transition to history.
- Multiple AND children and nested AND/OR combinations.
- Region-local transition versus transition that exits a common AND parent.
- Shallow history.
- Deep history across nested OR and AND containers.
- Junction branching and backtracking.
- Junction loops and dangling paths.
- Temporal transitions at exact tick boundaries.
- Quiescent terminal state in an OR container.
- Quiescent terminal child while AND siblings continue.
- Reset from every representative configuration.
- Timing and configuration faults with immediate safe outputs.
- Explicit mapped inputs and outputs with conversions.
- Missing and invalid mappings.

### 12.3 C build gates

Generated C must pass:

```text
-std=c99 -pedantic-errors -Wall -Wextra -Werror
```

Build variants cover:

- Safety enabled and disabled.
- Host MCAL test stubs.
- Custom MCAL implementation.
- Integer and supported floating tick types.
- Empty/minimal charts and maximum representative hierarchy fixtures.

Host sanitizer execution is used where available. Embedded compiler builds run when the configured toolchain is installed.

### 12.4 Report integrity

Report statements are labeled as:

- Structural validation.
- Semantic validation.
- Host compilation.
- Host runtime.
- Differential trace verification.
- Embedded compilation.
- Target-hardware pending.

Reachability, deadlock, terminal, safe-state, and complexity claims come from one IR analysis result. Formal MISRA compliance and certification are never claimed without external qualified evidence.

## 13. Migration and Compatibility

1. Load legacy charts without modifying the source object.
2. Convert all-unmarked sibling layers to OR.
3. Convert layers whose children are consistently marked parallel to AND.
4. Reject mixed parallel markings as ambiguous and identify the affected layer.
5. Preserve child priority and normalize duplicates deterministically only when behavior is unambiguous; otherwise require correction.
6. Reuse existing HIL Signal Mapper entries as explicit I/O bindings.
7. Report variables previously mapped only by naming heuristics as unmapped; never preserve guessed hardware behavior silently.
8. Preserve current public C query and lifecycle concepts.
9. Retain `SM_Sync_IO()` as a deprecated compatibility wrapper.
10. Preserve current UI capabilities while replacing its execution implementation with the interpreter.
11. Reconcile existing uncommitted generator and test edits; do not overwrite unrelated workspace changes.

## 14. Acceptance Criteria

The redesign is accepted only when:

1. The simulator and generated-C differential suite passes for every required fixture.
2. Generated C passes strict C99 compilation in every required build variant.
3. No terminal-state path emits or calls an automatic whole-chart reset.
4. No hardware binding is inferred from a variable name.
5. Parallel execution and exit order are deterministic and tested.
6. Shallow and deep history traces match the reference interpreter.
7. Reset restores all initial data, timers, history, activity, error state, and outputs.
8. Fault handling commits safe outputs before returning control.
9. Custom MCAL builds compile without implicit declarations.
10. Existing non-ambiguous projects migrate without simulation trace changes.
11. Application simulation uses the shared interpreter rather than duplicated execution code.
12. Generated reports contain no contradictory reachability, terminal, or safety claims.

