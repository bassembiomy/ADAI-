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
- Modify `src/index.tsx`: return the runtime result contract from each registered handler and expose the minimal test-only hook needed by the spec.
- Modify `playwright.config.ts`: separate normal freeze-gate execution from any explicitly benchmark-only Chromium flags.
- Add or modify `tests/performance/no-renderer-blocking.spec.ts` tests as the regression coverage; no new production test framework is needed.

### Task 1: Establish a truthful heartbeat measurement

**Files:**
- Modify: `tests/performance/no-renderer-blocking.spec.ts`
- Test: `tests/performance/no-renderer-blocking.spec.ts`

**Interfaces:**
- `assertHeartbeatDuringWorkload(page: Page, workload: FreezeWorkload): Promise<void>` remains the test helper.
- Browser evaluation returns `{ workloadDuration, intervalTicks, rafTicks, maxIntervalGap, maxRafGap, result }`.

- [ ] **Step 1: Add a deterministic measurement-window regression fixture**

Add a test-only browser handler, `__adia_freeze_workloads.__heartbeat_fixture`, that busy-loops synchronously for 250 ms and returns `{ workload: '__heartbeat_fixture', operations: 1 }`. Add a focused assertion requiring the active heartbeat threshold; it must fail against the current implementation because warm-up ticks are currently counted.

- [ ] **Step 2: Write the corrected assertions**

Change the browser callback to record `workloadStart` immediately before `await workloads[w]()` and `workloadEnd` immediately after it. Filter both interval and rAF timestamps to `[workloadStart, workloadEnd]`. Add assertions for:

```ts
expect(stats.intervalTicks).toBeGreaterThanOrEqual(2);
expect(stats.rafTicks).toBeGreaterThanOrEqual(2);
expect(stats.maxIntervalGap).toBeLessThan(150);
expect(stats.maxRafGap).toBeLessThan(150);
```

- [ ] **Step 3: Run the focused test and confirm the regression fails**

Run: `npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium`

Expected: the heartbeat fixture fails, proving the gate detects a blocked renderer.

- [ ] **Step 4: Implement the measurement window**

Use separate arrays for interval and rAF timestamps. Record start/end immediately around the handler. In `finally`, stop both monitors even when the handler rejects. Compute gaps only from timestamps in that window. Make each production driver run for at least 250 ms by repeating its bounded operation and accumulating the real operation count.

- [ ] **Step 5: Run the focused suite**

Run: `npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium`

Expected: all freeze-gate tests pass with nonzero active interval and rAF ticks.

- [ ] **Step 6: Commit**

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

Inspect the registrations in `src/index.tsx`. Require this exact result type:

```ts
type FreezeWorkloadResult = { workload: FreezeWorkload; operations: number };
```

- [ ] **Step 2: Add result-contract assertions to the test**

After the workload resolves, assert:

```ts
expect(result).toMatchObject({ workload });
expect(result.operations).toBeGreaterThan(0);
```

- [ ] **Step 3: Adapt the five handlers in `src/index.tsx` to return the contract**

Wrap each handler without changing its operation. Count actual VLAB/X-Bridges steps, SysML validation/matrix operations, DOE evaluations, and HIL samples flushed; the repeated driver accumulates `operations`.

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
- The test setup uses one canonical URL and the stable selector `[data-testid="welcome-overlay"]`.
- The discovery test verifies `window.__adia_freeze_workloads` instead of only checking a non-empty title.

- [ ] **Step 1: Replace the generic overlay selector**

Add `data-testid="welcome-overlay"` to the actual welcome overlay and dismiss it with:

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

- [ ] **Step 3: Run the normal configuration**

Run:

```bash
npx playwright test tests/performance/no-renderer-blocking.spec.ts --project=chromium
```

Expected: the default gate passes under normal scheduling. Run the benchmark project only if it was explicitly added in the preceding step.

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

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors and only intended files are modified.

- [ ] **Step 4: Request code review**

Provide the reviewer the final commit range, the measured active-workload heartbeat behavior, and the exact verification outputs. Resolve all P1/P2 findings before merging.
