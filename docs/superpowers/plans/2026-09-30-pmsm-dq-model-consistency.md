# PMSM dq Model Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PMSM UI and runtime implement the same parameterized rotor-fixed dq model.

**Architecture:** Keep the existing four branch variables and two mechanical states. Transform abc values into dq inside the equation factory and return d-axis, q-axis, zero-sequence, shaft, angle, and mechanical residuals.

**Tech Stack:** TypeScript, Vitest, V-Lab DAE equations

## Global Constraints

- Defaults: `Ld = 0.005 H`, `Lq = 0.005 H`, `flux = 0.1 Wb`, `J = 0.02 kg-m^2`, `B = 0.002 N-m-s/rad`.
- PMSM must not read `ctx.parameters.grid_freq`.
- Torque must use the documented dq equation.
- Preserve the existing PMSM ports and DAE branch/state counts.

---

### Task 1: Add failing PMSM consistency tests

**Files:**
- Modify: `src/utils/vlabLibrary.test.ts`
- Create: `src/engine/vlab/pmsmModel.test.ts`

- [ ] Assert PMSM exposes `Ld`, `Lq`, `flux`, `J`, and `B`, and no longer exposes `Kt`.
- [ ] Assert inductance and branch derivatives affect dq voltage residuals.
- [ ] Assert flux and rotor speed produce q-axis back-EMF.
- [ ] Assert saliency and flux affect dq torque.
- [ ] Assert changing `grid_freq` does not alter PMSM residuals.
- [ ] Run tests and verify expected failures.

### Task 2: Implement and verify the PMSM dq model

**Files:**
- Modify: `src/utils/vlabLibrary.ts`
- Modify: `src/engine/vlab/vlabEquations.ts`

- [ ] Replace `Kt` metadata with dq and mechanical parameters.
- [ ] Implement abc-to-dq transformations and derivative terms.
- [ ] Implement dq voltage, zero-sequence, and torque equations.
- [ ] Remove the fixed/global synchronous-speed dependency.
- [ ] Run focused tests, relevant V-Lab regressions, and TypeScript.
- [ ] Review and commit only PMSM-related files.
