# V-Lab Solver Configuration Runtime Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every edited `solver_config` value control the next run and safely update an active V-Lab simulation.

**Architecture:** Normalize the selected node’s parameters into a validated `SolverConfiguration` at the workspace/controller boundary. Pass a runtime configuration reference into the active solver job and expose boundary-safe updates so tolerances, step limits, stop time, diagnostics, and solver selection are observed without resetting model state.

**Tech Stack:** TypeScript, React, Vitest, VLab kernel solvers and `SolverManager`.

## Global Constraints

- The `solver_config` node is the persisted source of truth.
- Every new run must read the current node configuration.
- Active-run updates apply at solver-step boundaries and preserve state/output history.
- Invalid values must be normalized or rejected before reaching solver internals.
- Exactly one solver configuration remains associated with each physical network.
- Unrelated VLab domains and unrelated working-tree changes must remain untouched.

---

### Task 1: Trace and test configuration normalization

**Files:**
- Modify: `src/engine/vlab/kernel/PhysicalNetworkExtractor.ts`
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Test: `src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts`
- Test: `src/components/vlab/VLabWorkspace.test.tsx`

- [x] Add failing tests proving node parameters map to typed `SolverConfiguration` values for solver, stop time, step limits, tolerances, and diagnostics.
- [x] Add failing tests proving non-finite/invalid values are rejected or normalized to explicit defaults.
- [x] Trace the existing inspector update path and identify the exact callback/controller used by the simulation run.
- [x] Implement one shared normalization function at the boundary; make both new-run compilation and active-run updates use it.
- [x] Run the focused extractor/workspace tests and commit.

### Task 2: Make solver runtime configuration updateable

**Files:**
- Modify: `src/engine/vlab/kernel/types.ts`
- Modify: `src/engine/vlab/kernel/SolverManager.ts`
- Modify: `src/engine/vlab/kernel/solvers/ISolver.ts`
- Test: `src/engine/vlab/kernel/SolverManager.test.ts`

- [x] Add failing tests that start a job with one configuration, update it, and verify the active job observes changed stop time, tolerances, and step limits without resetting state.
- [x] Add a failing test for solver-method changes; verify the manager switches/reconstructs the solver at a boundary while retaining state and output history.
- [x] Add an explicit runtime update API, such as `updateConfiguration(config: SolverConfiguration): void`, with atomic replacement and validation.
- [x] Ensure solver loops read the current configuration at each step boundary rather than a stale local snapshot.
- [x] Run focused kernel tests and commit.

### Task 3: Wire workspace edits to the active simulation

**Files:**
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Modify: the active simulation controller/module identified in Task 1.
- Test: `src/components/vlab/VLabWorkspace.test.tsx`

- [x] Add a failing integration test showing an edited solver block changes the configuration used by the next run.
- [x] Add a failing integration test showing an edit during an active run calls the runtime update path.
- [x] Connect solver-node parameter changes to normalized configuration updates without triggering updates for unrelated nodes.
- [x] Apply pending configuration atomically at the next simulation-step boundary and surface validation diagnostics in the existing UI diagnostic path.
- [x] Run focused workspace and kernel tests and commit.

### Task 4: Verify end-to-end behavior

**Files:**
- Test: `src/engine/vlab/kernel/SolverManager.test.ts`
- Test: `src/components/vlab/VLabWorkspace.test.tsx`
- Test: `src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts`

- [x] Run:

```powershell
npx vitest run src/engine/vlab/kernel src/components/vlab --reporter=verbose
```

- [x] Confirm changed solver method, tolerances, max step, stop time, and diagnostics are observable in execution, not only stored in objects.
- [x] Run:

```powershell
npm run lint
npm run build
git diff --check
```

- [x] Review the final diff and commit only solver-configuration files/tests, preserving unrelated worktree changes.

## Acceptance Criteria

- A changed solver block controls the next simulation run.
- Safe changes during a running simulation affect the next solver step.
- Solver-method changes preserve simulation state and output history.
- Invalid values never reach solver internals unvalidated.
- Network association still uses exactly one configuration per physical network.
