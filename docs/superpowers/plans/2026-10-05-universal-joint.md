# Universal Joint Implementation Plan

**Goal:** Implement the approved two-axis Frame joint and verify real simulation.
**Architecture:** A dedicated kinematics helper supplies transported axes, signed angles, angular rates and the rotational constraint. The equation factory maps these to force/torque branches and typed outputs; the assembler validates parameters before solving.
**Tech Stack:** TypeScript, Vitest, existing implicit DAE engine.

- [x] Add failing tests in `src/engine/vlab/vlab_universal_joint.test.ts` for Frame ports, finite combined rotations, excluded third rotation, damping signs and zero, invalid parameters, and force/torque scope readings through `simulateStep`. Run `npx vitest run src/engine/vlab/vlab_universal_joint.test.ts` and confirm missing behavior.
- [x] Create `src/engine/vlab/vlabUniversalJoint.ts`: strict finite axis validation, orthonormal reference axes, transported-axis constraint, signed principal angles, and Euler-rate conversion for `Rz*Ry*Rx`.
- [x] Update `vlabEquations.ts`, `DAEAssembler.ts`, `vlabConstraintDiagnostics.ts`: allocate `[fx,fy,fz,lambda,tx,ty,tz]`, output branches, equal/opposite endpoint wrenches, derivative classification, and pre-solve diagnostics.
- [x] Update `src/utils/vlabLibrary.ts`, `vlabComponentDefinitions.ts`, and `src/components/vlab/vlabModelMigration.ts`: canonical domains, axis parameters, typed outputs and saved-node migration preserving zero damping.
- [x] Run universal, spherical, frame runtime, multibody constraint and migration regressions. Check TypeScript and changed-file whitespace. Review final behavior against every acceptance criterion.

Reference convention: axis1 belongs to B, axis2 to F; normalize axis1 and Gram-Schmidt axis2. Positive reported wrench acts on F. Principal angles are in rad; rates in rad/s; force in N; constrained reaction multiplier in N*m. Reject malformed/zero/parallel axes and negative/nonfinite damping before solver entry.

## Verified implementation details

The implementation additionally uses `vlabJointInitialization.ts` to seed anchored and unanchored joint reference poses before computing angular rates. `SparseLinearSolver.solveRankDeficient` equilibrates rows and columns and preserves free pose columns; the optional path is activated only for systems containing universal joints. Every nonlinear residual remains subject to convergence checking. Independent review checked the physical equations, numerical scaling and initialization.

Validation: 104 tests passed in 10 focused test files, including actual simulation with unconfigured/auto/bdf modes and performance budgets; scoped V-Lab TypeScript compilation passed.
