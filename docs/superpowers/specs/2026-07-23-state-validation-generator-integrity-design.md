# Design Specification: State Machine Validation & Generator Integrity Engine

## 1. Overview
This specification details enhancements to the ADIA Embedded C State Machine Generator and Validation Engine. It covers model integrity checking (deadlock prevention & reachability analysis), correct hierarchical and parallel execution semantics, generic internal transition handling, syntactic completeness, and actionable reporting.

---

## 2. Model Integrity & Validation Engine (`sm_types.ts` & `smAnalysisEngine.ts`)

### 2.1 Model Extension
- Extend `StateData` interface in [sm_types.ts](file:///g:/adia%20project/src/types/sm_types.ts) with `isTerminal?: boolean`.
- Terminal states indicate intentional end-states (e.g. `FINAL` or `HALT`) where zero outgoing transitions are valid.

### 2.2 REQ-V-01: Critical Deadlock Analysis
- **Graph Traversal**: Iterate over all states in `chart.states`. A state is flagged as a **Critical Deadlock** if:
  1. `transitions.filter(t => t.sourceId === state.id).length === 0`.
  2. The state is an atomic state (not a container parent with child states).
  3. `state.isTerminal` is `false` or `undefined`.
- **Actionable Report Entry**:
  - `severity: 'critical'`
  - `category: 'deadlock'`
  - `recommendation: "Add an outgoing transition from State '<name>' (ID: <id>) or mark it as an intentional terminal state."`
- **Code Generation Gate**: In `generateMISRACCode`, if any `severity === 'critical'` deadlock is present in `cornerCases` and `allowDeadlocks` option is not enabled, code generation halts immediately returning a structured error.

### 2.3 REQ-V-02: Unreachable State Reachability Analysis
- **Reachability Algorithm**: Perform a graph traversal (BFS) starting from:
  - Root-level autostart states/junctions.
  - Initial autostart states in parallel and sub-machine regions.
- **Reporting**:
  - Any state ID not present in the reachable set is flagged with `category: 'unreachable'`.
  - Severity: `warning` (configurable to `critical`).
  - Recommendation: `"Remove state '<name>' or add an incoming transition to make it reachable."`

### 2.4 REQ-R-01: Actionable Reports & Reachability-Aware Test Scenarios
- **Test Scenario Filtering**: In `generateTestScenarios` ([smAnalysisEngine.ts](file:///g:/adia%20project/src/utils/smAnalysisEngine.ts)), filter candidate path walks to exclude any path containing unreachable states. This prevents test scenarios (e.g., TS-003, TS-006) from including steps to navigate to unreachable states.

---

## 3. Generic Code Generation & Execution Semantics (`stateMachineCodeGenerator.ts`)

### 3.1 Generic Architecture
- Code generation logic for layers, state active checks, and transitions must be **completely generic**, operating dynamically over `chart.states`, `chart.layers`, and `chart.transitions` regardless of hierarchy depth or state count.

### 3.2 REQ-G-01: Parallel (AND-State) Execution Semantics
- **Enter**: `SM_Enter_Layer_*` recursively enters all active parallel child regions.
- **Step**: `SM_Step_Layer_*` iterates through during logic and transition checks for **all active parallel regions** in every execution cycle.
- **Exit**: `SM_Exit_Layer_*` invokes Exit functions for all active child states in reverse order.

### 3.3 REQ-G-02: Hierarchical State (Sub-Machine) Semantics
- **Entry Actions**: When entering a nested state, parent entry actions execute **outermost -> innermost**.
- **Exit Actions**: When exiting a nested state, parent exit actions execute **innermost -> outermost**.
- **Parent Level Transitions**: Evaluated for child states according to hierarchical precedence rules.

### 3.4 Internal Transition Semantics
- **Internal Transitions**: A transition where `sourceId === targetId` or `type === 'internal'`.
- **Execution Rule**: When an internal transition fires:
  - State `Exit` actions are **NOT** executed.
  - State `Entry` actions are **NOT** executed.
  - State timer is **NOT** reset.
  - Only the transition's guard condition is evaluated and transition action code is executed.

### 3.5 REQ-G-03: Syntactic Completeness & Default Cases
- **Switch Statement Completeness**: All generated `switch` statements for state variables must include explicit `default:` fallback cases to handle unexpected values gracefully.
- **Layer Step Generator Repair**: Ensure during action checks for all active states (including state `6_2` / `state_active[6U]`) are dynamically and generically emitted across all layers:
  ```c
  if (instance->state_active[6U]) {
      /* Run During Actions */
      SM_ST_STATE_6_2_During(instance, delta_ms);
  }
  ```

---

## 4. Verification Plan

### 4.1 Unit Tests
1. `smAnalysisEngine.test.ts`:
   - Verify deadlock detection flags non-terminal states with 0 outgoing transitions as critical.
   - Verify `isTerminal: true` suppresses deadlock warning.
   - Verify unreachable states are detected and excluded from generated test scenarios.
2. `stateMachineCodeGenerator.test.ts`:
   - Test internal transition code generation (confirm no Exit/Entry calls emitted).
   - Test generic parallel (AND-state) and hierarchical state generation.
   - Test switch default case emission across all state machines.
   - Test missing state active during-action regression check.

### 4.2 GCC Syntax & Dry-Run Validation
- Validate generated C code against `gcc -fsyntax-only` using the Orbital Validator.
