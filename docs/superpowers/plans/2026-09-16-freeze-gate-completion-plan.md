# Freeze Regression Gate Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application-wide freeze gate discoverable, executable, and representative of real VLAB, X-Bridges, SysML, DOE, and HIL workloads.

**Architecture:** Keep the existing worker implementations unchanged unless a test exposes a real integration defect. Configure Playwright to discover the performance suite, add deterministic browser workload fixtures/hooks that exercise each module without relying on optional UI tabs, and finish with the full verification matrix.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright, existing worker clients, `requestAnimationFrame`, `setInterval`.

## Global Constraints

- Preserve solver equations, numerical settings, public result schemas, and export formats.
- Do not weaken thresholds merely to make the gate pass.
- Tests must fail on missing module execution, not silently skip when a tab or selector is unavailable.
- Keep browser workloads deterministic, bounded, and independent of hardware or network services.
- Do not mark the original freeze-prevention plan complete until `npm run test:freeze-gate` exits successfully and reports all module tests executed.

---

### Task 1: Make Playwright discover the freeze-gate suite

**Files:**
- Inspect/Modify: `playwright.config.ts`
- Modify: `package.json`
- Test: `tests/performance/no-renderer-blocking.spec.ts`

**Interfaces:** The resulting configuration must make `npm run test:freeze-gate` discover `tests/performance/no-renderer-blocking.spec.ts` while preserving the existing base URL and web-server settings.

- [x] **Step 1: Add a discovery smoke test**

Add a uniquely named test to `tests/performance/no-renderer-blocking.spec.ts`:

```ts
test('freeze gate suite is loaded from the performance test directory', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/./);
});
```

- [x] **Step 2: Reproduce the discovery failure**

Run `npm run test:freeze-gate -- --list`. Expected before the fix: no discovered tests.

- [x] **Step 3: Fix discovery**

Update `playwright.config.ts` so `testDir` includes `tests/performance`, or remove an overly restrictive `testDir`, retaining all existing `webServer`, `baseURL`, retries, and reporter settings. Correct the package script only if it points at a stale path.

- [x] **Step 4: Verify and commit**

Run `npm run test:freeze-gate -- --list` and `npm run test:freeze-gate`. Expected: the suite is listed and executes instead of reporting “No tests found”. Commit with:

```bash
git add playwright.config.ts package.json tests/performance/no-renderer-blocking.spec.ts
git commit -m "test: discover browser freeze regression suite"
```

### Task 2: Exercise deterministic representative workloads

**Files:**
- Modify: `tests/performance/no-renderer-blocking.spec.ts`
- Create: `tests/performance/freeze-workloads.ts`

**Interfaces:** Export these helpers from `freeze-workloads.ts`:

```ts
export type FreezeWorkload = 'vlab' | 'xbridges' | 'sysml' | 'doe' | 'hil';
export async function runFreezeWorkload(page: Page, workload: FreezeWorkload): Promise<void>;
```

Each branch must start the real worker/client entry point or a stable test-only browser hook, await completion/cancellation with a 5-second timeout, record start/complete markers, and dispose the client in `finally`. HIL must use deterministic injected telemetry rather than serial hardware.

- [x] **Step 1: Add failing workload markers**

Initialize a browser marker array and require each workload test to record its requested module. The test must fail if a helper returns without starting that workload.

- [x] **Step 2: Implement bounded workload helpers**

Use a shared timeout helper:

```ts
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

Create deterministic fixtures for VLAB, X-Bridges, SysML, DOE, and HIL. Do not rely on optional tabs or selectors; UI navigation may be supplementary only.

- [x] **Step 3: Assert heartbeat during each workload**

Measure both `requestAnimationFrame` and a 16ms interval while the workload promise is active. Require at least 15 ticks in 600ms, a maximum interval gap below 150ms, and a completion marker for the requested module.

- [x] **Step 4: Remove silent skips**

Replace conditional checks such as `if (await tab.isVisible())` with deterministic workload calls and explicit assertions.

- [x] **Step 5: Run and commit**

Run `npm run test:freeze-gate`. Expected: five module workload tests plus the discovery smoke test pass. Commit with:

```bash
git add tests/performance/no-renderer-blocking.spec.ts tests/performance/freeze-workloads.ts
git commit -m "test: exercise representative freeze workloads"
```

### Task 3: Complete acceptance evidence and prevent regression

**Files:**
- Modify: `docs/performance-baseline.md`
- Modify: `docs/superpowers/plans/2026-09-15-all-modules-freeze-prevention-plan.md`
- Test: `tests/performance/no-renderer-blocking.spec.ts`

- [x] **Step 1: Run the complete verification matrix**

Run each command and require exit code 0:

```bash
npm run test:workers
npx vitest run src/engine/hil/ src/engine/opm/ src/components/hil/ src/components/vlab/ src/components/xbridges/ src/components/sysml/ src/components/doe/
npx tsc --noEmit
npx vite build
npm run test:freeze-gate
```

The Playwright output must show all five workloads executed, not skipped.

- [x] **Step 2: Check behavior-preservation evidence**

Confirm numerical equivalence, cancellation, pause/stop/reset, unmount cleanup, and export tests remain included in the passing Vitest scope. Add exact missing test paths to `test:workers` only when they are worker-gate tests.

- [x] **Step 3: Record measured metrics**

Update `docs/performance-baseline.md` with observed heartbeat count, maximum interval gap, worker completion time, and cancellation latency per workload, including browser/OS context. Keep targets separate from measurements.

- [x] **Step 4: Mark only proven checklist items complete**

Update the original plan’s checkboxes only after the commands above pass and the browser output proves each workload ran. Do not mark it complete for a zero-test, skipped, or failed gate.

- [x] **Step 5: Commit evidence**

```bash
git add docs/performance-baseline.md docs/superpowers/plans/2026-09-15-all-modules-freeze-prevention-plan.md
git commit -m "test: verify application-wide freeze gate"
```

## Self-review checklist

- Task 1 covers the current “No tests found” failure.
- Task 2 replaces conditional/no-op performance checks with deterministic module execution.
- Task 3 requires worker tests, module tests, typecheck, build, and the browser gate.
- No solver or application behavior changes are authorized.
- No unresolved placeholders remain.
