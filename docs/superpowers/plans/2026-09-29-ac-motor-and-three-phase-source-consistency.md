# AC Motor and Three-Phase Source Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every visible AC Motor parameter affect its runtime model, expose hidden mechanical parameters, and allocate the missing 3-Phase Source branches.

**Architecture:** Add a two-axis rotor-flux state model to the existing AC Motor equation and declare the matching states in the DAE assembler. Extend catalog metadata for mechanical parameters and add three independent source-current branches for the 3-Phase Source.

**Tech Stack:** TypeScript, Vitest, V-Lab DAE assembler

## Global Constraints

- `Lm` must be read as `params.Lm ?? 0.05`.
- `Rr` must participate in the rotor-flux dynamics through `Tr = Lr / Rr`.
- `J` defaults to `0.05 kg-m^2`.
- `B` defaults to `0.005 N-m-s/rad`.
- The 3-Phase Source must own `phase_a`, `phase_b`, and `phase_c` branches mapped to ports `a`, `b`, and `c`.

---

### Task 1: Add failing AC Motor and source-branch tests

**Files:**
- Modify: `src/utils/vlabLibrary.test.ts`
- Create: `src/engine/vlab/acMotorAndThreePhaseSource.test.ts`

- [ ] Assert the AC Motor exposes `J` and `B` with the specified defaults and units.
- [ ] Assert AC Motor residuals change when `Rr` and `Lm` change.
- [ ] Assert AC Motor assembly contains `psi_r_alpha` and `psi_r_beta` states.
- [ ] Assert 3-Phase Source assembly contains exactly `phase_a`, `phase_b`, and `phase_c` branches.
- [ ] Run the focused tests and confirm they fail for the missing behavior.

### Task 2: Implement the model and assembler corrections

**Files:**
- Modify: `src/utils/vlabLibrary.ts`
- Modify: `src/engine/vlab/vlabEquations.ts`
- Modify: `src/engine/vlab/DAEAssembler.ts`

- [ ] Add `J` and `B` metadata to the AC Motor catalog.
- [ ] Replace the fixed-`Lm` slip-torque approximation with rotor-flux dynamics using `Rr` and `Lm`.
- [ ] Add the two rotor-flux states to the AC Motor assembler specification.
- [ ] Add three phase branches to the 3-Phase Source assembler specification.
- [ ] Run focused tests, relevant V-Lab regression tests, and `npx tsc --noEmit`.
- [ ] Review the diff, commit all task files, and push `co-work`.
