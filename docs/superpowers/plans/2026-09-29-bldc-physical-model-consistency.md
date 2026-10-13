# BLDC Physical Model Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the displayed DC Motor equation and BLDC Motor runtime with their public parameters and advertised physical model.

**Architecture:** Keep the existing DAE branch/state layout. Replace only the BLDC equation factory with phase-domain inductive equations, rotor-position-dependent trapezoidal back-EMF, and independent torque conversion.

**Tech Stack:** TypeScript, Vitest, V-Lab DAE equations

## Global Constraints

- DC Motor display torque equation must use `Kt`.
- BLDC defaults: `Ls = 0.002 H`, `Kt = 0.1 N-m/A`, `J = 0.02 kg-m^2`, `B = 0.002 N-m-s/rad`.
- Existing models without new fields must remain executable through runtime defaults.
- Do not duplicate commutation switching inside the motor; the external inverter/controller owns switching.

---

### Task 1: Add failing catalog and BLDC equation tests

**Files:**
- Modify: `src/utils/vlabLibrary.test.ts`
- Create: `src/engine/vlab/bldcMotorModel.test.ts`

- [ ] Test the DC Motor display equation references `Kt`.
- [ ] Test BLDC metadata exposes `Kt`, `J`, and `B`.
- [ ] Test `Ls` affects phase residuals through branch derivatives.
- [ ] Test rotor angle changes the three phase back-EMF residuals.
- [ ] Test `Kt` changes mechanical torque without changing electrical back-EMF.
- [ ] Run the focused tests and verify the expected failures.

### Task 2: Implement and verify the physical BLDC model

**Files:**
- Modify: `src/utils/vlabLibrary.ts`
- Modify: `src/engine/vlab/vlabEquations.ts`

- [ ] Correct the DC Motor display equation.
- [ ] Add BLDC `Kt`, `J`, and `B` catalog metadata.
- [ ] Implement trapezoidal phase shapes and inductive phase equations.
- [ ] Implement independent `Kt` torque and parameterized mechanics.
- [ ] Run focused tests, V-Lab regression tests, and `npx tsc --noEmit`.
- [ ] Review, commit, and push all changes to `co-work`.
