# X-Bridges Wave 4 Controllers and Switching Implementation Plan

**Goal:** Release strict-C99 float32 and fixed-point generation for `PID_CONTROLLER` and `SIX_STEP_COMMUTATION` with complete deterministic paired coverage.

**Architecture:** Preserve the advanced PID block's explicit proportional, integral, filtered-derivative, enable, reset, clamp, and anti-windup state contract. Implement six-step commutation as a total Boolean lookup with a defined safe output for invalid Hall codes.

**Tech Stack:** TypeScript, Vitest, X-Bridges semantic IR, generated strict C99, GCC.

## Global Constraints

- Wave 1 bounded profile and executable conformance gate are prerequisites.
- Generated code has static storage and bounded control flow; no heap, recursion, VLA, or mutable globals.
- Both float32 and fixed-point cases must execute before capability release.
- Every parameter is validated at semantic-build time and every numeric failure follows the model fault policy.
- All `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` remain excluded.

## File Map

- Create `src/utils/stateMachine/xbPidContract.ts` and tests for normalized PID parameters and update ordering.
- Modify builder/interpreter/C generator and executable conformance cases.
- Modify capability registry and documentation only at release.

---

### Task 1: Normalize the advanced PID contract

**Files:**
- Create: `src/utils/stateMachine/xbPidContract.ts`
- Create: `src/utils/stateMachine/xbPidContract.test.ts`
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`

**Interfaces:**
- Produces `normalizePidParameters(parameters, solver): XBPidParameters`.
- `XBPidParameters` contains `mode`, `kp`, `ki`, `kd`, `filterN`, `beta`, `gamma`, `minimum`, `maximum`, `method`, and `sampleTime` with no optional fields.

- [ ] **Step 1: Write failing normalization tests**
- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Implement the normalized contract**
- [ ] **Step 4: Run tests and commit**

### Task 2: Canonical PID state transition

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces slots `i_state`, `d_state`, `last_e`, and `last_ed` and outputs `u`, `error`, `p_term`, `i_term`, `d_term`.
- Consumes `XBPidParameters`.

- [ ] **Step 1: Write failing sequence tests**
- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Implement one update function**
- [ ] **Step 4: Run canonical tests and commit**

### Task 3: PID C emitter and executable profiles

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces table emitter `PID_CONTROLLER` and executable cases `XB-W4-PID-F32` and `XB-W4-PID-FIXED`.

- [ ] **Step 1: Write a failing generated-code structure test**
- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Emit the same ordered transition**
- [ ] **Step 4: Compile and execute both profiles**
- [ ] **Step 5: Commit**

### Task 4: Six-step commutation

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces Boolean-input/scalar-output direct operation and case `XB-W4-SIX-STEP`.

- [ ] **Step 1: Write the failing truth-table test**
- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Implement total lookup semantics**
- [ ] **Step 4: Execute and commit**

### Task 5: Release Wave 4

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Enables only `PID_CONTROLLER` and `SIX_STEP_COMMUTATION`.

- [ ] **Step 1: Add capability assertions and enable both entries**
- [ ] **Step 2: Run release verification**
- [ ] **Step 3: Document and commit**
