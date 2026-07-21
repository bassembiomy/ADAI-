# Design Spec: Parallel Stateflow and AND-Decomposition Verification

## Goal
Verify that the Stateflow code generator correctly handles AND-decomposition (parallel states and regions) and multi-layered configurations. We will add automated unit and behavioral verification tests that cover code generation structure and runtime simulation execution (compiled with host gcc).

---

## Proposed Test Cases

### 1. Structural Unit Tests (`src/utils/stateMachineCodeGenerator.test.ts`)
Add a unit test `should generate correct C code for nested mixed OR and AND decomposition layers` that verifies:
- A parent state `SuperState` containing both an exclusive OR child layer (`Layer_Exclusive`) and a parallel AND child layer (`Layer_Parallel`).
- Outgoing transitions, state entry paths, and active state switch-cases inside `sm_core.c` and `sm_core.h`.
- The entry routine for `SuperState` correctly enters all its parallel and exclusive child layers.
- The step routine correctly steps all active states in both child layers.
- The exit routine correctly clears the active exclusive state and exits both parallel states.

### 2. Behavioral Simulation Tests (`src/utils/stateMachineCodeGenerator.behavior.test.ts`)
Add a runtime behavioral test `hierarchical states with mixed OR and parallel AND layers behave correctly under simulation` that compiles the generated code using GCC and simulates steps:
- **Initialization & Reset**: Asserts that two separate regions under AND-decomposition both start up active simultaneously (testing dual-start state activation).
- **Stepping (During Actions)**: Ticks the machine and asserts that parallel states execute their `during` actions simultaneously.
- **Exclusive Sibling Transitions**: Triggers a transition inside `Layer_Exclusive` from `Ex_StateA` to `Ex_StateB` and verifies that parallel states `Par_StateC` and `Par_StateD` remain completely active and unaffected.
- **Nested Exclusive Sibling Transitions**: Triggers a transition inside the nested layer of parallel state `Par_StateC` from `C_Sub_1` to `C_Sub_2` and asserts that other sibling layers and parent states remain active.
- **Parent Exit**: Triggers an exit transition from `SuperState` to a root-level `FinalState`. Asserts that all active child/sub-states (exclusive, parallel, and deeply nested sub-states) exit in bottom-up hierarchical order, running their exit actions in the correct sequence.

---

## Verification Plan

### Automated Verification
Run Vitest for the modified test suites:
```bash
npx vitest run src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.behavior.test.ts --exclude "**/.kilo/**"
```
Ensure all tests compile, execute on the host GCC, and pass successfully.
