# Task Checklist: XBridge Code Generation Runtime and Mapping Fixes (Approach 1)

- [x] **Task 1: Shared Symbol Types and Timing Utilities**
  - [x] Define `SemanticType`, `SemanticVariableSymbol`, and `XBOwnerState` in `src/utils/stateMachine/smSemanticModel.ts`
  - [x] Implement `convertTime` and `alignRuntimeThreshold` (with 0ms support) in `src/utils/stateMachine/smTiming.ts`
  - [x] Add unit tests in `smTiming.test.ts` and verify 100% PASS (11/11 tests)

- [x] **Task 2: Authoritative Symbol Tables in `smSemanticBuilder.ts`**
  - [x] Construct `variableSymbols` and `stateSymbols` pre-building maps in `buildSemanticModel()`
  - [x] Resolve state index symbols (`cIndexSymbol`) and variable symbols (`cIdentifier`)

- [x] **Task 3: Updated `XBSemanticModel`, Mappings, and Owner State Context**
  - [x] Update `XBSemanticMapping` to contain `sourceVariableId` and `variable: SemanticVariableSymbol`
  - [x] Update `XBSemanticModel` to retain `ownerState: XBOwnerState`

- [x] **Task 4: Step Parameter Lowering**
  - [x] Add pre-aligned `stepParameters` (`threshold.milliseconds`, `timerSource.stateIndexSymbol`) to `XBSemanticOperation` in `xbSemanticBuilder.ts`

- [x] **Task 5: Refactored `xbCGenerator.ts`**
  - [x] Refactor `emitOutport`, `emitStep`, and mapping transfer loops in `xbCGenerator.ts`
  - [x] Consume `mapping.variable.cIdentifier` and `stepParameters.timerSource.stateIndexSymbol`
  - [x] Step evaluation renders `state_timers[SM_ST_A_IDX] < 300U` and `instance->data.xb6_step_output`

- [x] **Task 6: Pre-Render Assertions & Post-Render Symbol Consistency Verification**
  - [x] Implement `verifyGeneratedCStructure()` in `smCGenerator.ts`
  - [x] Assert that all `instance->data.<member>` accesses in generated C exist in declared `struct SM_Data_t`

- [x] **Task 7: Host GCC Compilation Gate & Differential Pipeline**
  - [x] Integrate `compileGeneratedCSyntax` (`gcc -std=c11 -Wall -Wextra -fsyntax-only`) into `smCHarness.ts`
  - [x] Update host harness string formatting and interpreter guard evaluation
  - [x] Verify 100% test pass rate in `smPipelineOrchestrator.test.ts`

- [x] **Task 8: Test Fixture and Test Suite Diagnostic Alignment**
  - [x] Update manual inline test mock definitions across `xbCGenerator.test.ts` with helper utilities
  - [x] Resolve all TypeScript compiler diagnostic errors in `xbCGenerator.test.ts`
  - [x] Run full test suite and confirm 100% test pass rate
