# Freeze Gate Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the renderer-freeze Playwright gate measure responsiveness only during real workload execution and avoid masking production scheduling problems.

**Architecture:** Keep the existing browser workload drivers, but centralize heartbeat measurement around explicit workload start/end timestamps. Strengthen each workload contract with observable result validation, use stable test hooks for setup, and isolate any Chromium scheduling flags to a clearly named benchmark configuration.

**Tech Stack:** TypeScript, Playwright Test, Vite, Chromium, existing `tests/performance/freeze-workloads.ts` drivers.

## Global Constraints

- Do not change production workload behavior except where required to expose deterministic test observability.
- Preserve the five workload keys: `vlab`, `xbridges`, `sysml`, `doe`, and `hil`.
- The test must fail when the workload blocks the renderer for the measured execution window.
- Do not use generic forced overlay clicks when a stable test hook or deterministic URL option is available.
- Run targeted Playwright tests, TypeScript checking, and the relevant build before claiming completion.

## File Map

- Modify `tests/performance/no-renderer-blocking.spec.ts`: measure heartbeats strictly inside workload execution, validate results, remove dead imports, and strengthen setup assertions.
- Modify `tests/performance/freeze-workloads.ts`: define the runtime result contract and expose bounded workload execution consistently.
- Modify `src/index.tsx` only if a stable test hook or deterministic overlay bypass is not already available; expose the minimal test-only hook needed by the spec.
- Modify `playwright.config.ts`: separate normal freeze-gate execution from any explicitly benchmark-only Chromium flags.
- Add or modify `tests/performance/no-renderer-blocking.spec.ts` tests as the regression coverage; no new production test framework is needed.

### Task 1: Establish a truthful heartbeat measurement

**Files:**
- Modify: `tests/performance/no-renderer-blocking.spec.ts`
- Test: `tests/performance/no-renderer-blocking.spec.ts`

**Interfaces:**
- `assertHeartbeatDuringWorkload(page: Page, workload: FreezeWorkload): Promise<void>` remains the test helper.
- Browser evaluation returns `{ workloadDuration, intervalTicks, rafTicks, maxIntervalGap, maxRafGap, result }`.

- [ ] **Step 1: Write the failing assertions**

Change the browser callback to record `workloadStart` immediately before `await workloads[w]()` and `workloadEnd` immediately after it. Filter both interval and rAF timestamps to `[workloadStart, workloadEnd]`. Add assertions for:

```ts
expect(stats.intervalTicks).toBeGreaterThanOrEqual(2);
expect(stats.rafTicks).toBeGreaterThanOrEqual(2);
expect(stats.maxIntervalGap).toBeLessThan(150);
expect(stats.maxRafGap).toBeLessThan(150);
```

- [ ] **Step 2: Run the focused test and confirm the new assertions execute**

Run: `npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium`

Expected: the suite runs; if a workload is shorter than the minimum sampling window, at least one test may fail, identifying the threshold that needs a deterministic workload duration.

- [ ] **Step 3: Implement the measurement window**

Use separate arrays for interval and rAF timestamps, stop both monitors in a `finally` block, and compute gaps only from timestamps collected between the workload start and end. Do not use warm-up ticks in the active-workload counts.

- [ ] **Step 4: Run the focused suite**

Run: `npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium`

Expected: all freeze-gate tests pass with nonzero active interval and rAF ticks.

- [ ] **Step 5: Commit**

```bash
git add tests/performance/no-renderer-blocking.spec.ts
git commit -m "test: measure freeze heartbeat during workload execution"
```

### Task 2: Validate meaningful workload completion

**Files:**
- Modify: `tests/performance/freeze-workloads.ts`
- Modify: `tests/performance/no-renderer-blocking.spec.ts`
- Modify: `src/index.tsx` only if result fields are missing

**Interfaces:**
- Each workload handler returns an object with `{ workload: FreezeWorkload, operations: number }`, with `operations > 0`.
- `runFreezeWorkload` remains bounded by `withTimeout(..., 5000, ...)`.

- [ ] **Step 1: Inspect the five existing handler return values**

Run: `rg -n "__adia_freeze_workloads|return \{" src/index.tsx tests/performance/freeze-workloads.ts`

Record the current result shapes and identify any handler that returns `undefined`, an empty object, or no operation count.

- [ ] **Step 2: Add result-contract assertions to the test**

After the workload resolves, assert:

```ts
expect(result).toMatchObject({ workload });
expect(result.operations).toBeGreaterThan(0);
```

- [ ] **Step 3: Adapt handlers to return the contract**

Wrap each existing workload result without changing its underlying operation. Use the actual number of simulation steps, validations, solver evaluations, or telemetry samples performed; do not use a constant unrelated to the work.

- [ ] **Step 4: Run the focused suite**

Run: `npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium`

Expected: all five workloads resolve with `operations > 0` and the marker contains the validated result.

- [ ] **Step 5: Commit**

```bash
git add tests/performance/freeze-workloads.ts tests/performance/no-renderer-blocking.spec.ts src/index.tsx
git commit -m "test: assert freeze workloads perform real operations"
```

### Task 3: Make page setup deterministic and remove dead code

**Files:**
- Modify: `tests/performance/no-renderer-blocking.spec.ts`
- Modify: `src/index.tsx` only if needed for a stable hook

**Interfaces:**
- The test setup uses one canonical URL and a stable selector such as `[data-testid="welcome-overlay"]`.
- The discovery test verifies `window.__adia_freeze_workloads` instead of only checking a non-empty title.

- [ ] **Step 1: Replace the generic overlay selector**

Use an existing stable selector if present. Otherwise add `data-testid="welcome-overlay"` to the welcome overlay and dismiss it with:

```ts
const intro = page.getByTestId('welcome-overlay');
if (await intro.isVisible().catch(() => false)) {
  await intro.click();
  await expect(intro).toBeHidden();
}
```

- [ ] **Step 2: Remove the duplicate navigation**

Keep `page.goto('/?projectName=perf-gate')` in `beforeEach`; make the discovery test wait for and assert the workload registry:

```ts
await expect.poll(() => page.evaluate(() => typeof (window as any).__adia_freeze_workloads)).toBe('object');
```

- [ ] **Step 3: Remove the unused `runFreezeWorkload` import**

- [ ] **Step 4: Run the focused suite**

Run: `npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium`

Expected: no generic forced click remains, no unused import remains, and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/performance/no-renderer-blocking.spec.ts src/index.tsx
git commit -m "test: make freeze gate setup deterministic"
```

### Task 4: Isolate browser scheduling configuration

**Files:**
- Modify: `playwright.config.ts`

**Interfaces:**
- The default `chromium` project represents normal browser scheduling.
- Any unthrottled benchmark project is explicitly named and opt-in; the freeze gate does not silently use it.

- [ ] **Step 1: Add a normal-scheduling project**

Keep a Chromium project without background-throttling flags and run the freeze gate against it by default.

- [ ] **Step 2: Add an explicitly named benchmark project only if required**

If timing variance requires the existing flags, create a separate project such as `chromium-benchmark` with those flags and document that it is supplementary, not the regression gate.

- [ ] **Step 3: Run both configurations**

Run:

```bash
npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium
npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium-benchmark
```

Expected: the default gate passes under normal scheduling; the benchmark project passes only when present and is not required for the default command.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts
git commit -m "test: separate normal and benchmark browser scheduling"
```

### Task 5: Full verification and review handoff

**Files:**
- No additional source changes unless verification exposes a failure.

- [ ] **Step 1: Run the freeze gate**

Run: `npm run test:freeze-gate`

Expected: all five workload tests plus discovery pass with zero skips.

- [ ] **Step 2: Run type checking and production build**

Run: `npx tsc --noEmit` and `npx vite build`

Expected: both exit with code 0.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff HEAD~4..HEAD --check` and `git status --short`

Expected: no whitespace errors and only intended files are modified.

- [ ] **Step 4: Request code review**

Provide the reviewer the final commit range, the measured active-workload heartbeat behavior, and the exact verification outputs. Resolve all P1/P2 findings before merging.

