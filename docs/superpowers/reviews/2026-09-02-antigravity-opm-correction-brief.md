# Antigravity Correction Requirements: Entropy OPM

Paste the `Immediate assignment` section into the existing Antigravity conversation. Do not ask Antigravity to complete later assignments in the same run.

## Verified baseline

- Branch: `entropy-opm-embedded-c`.
- Implementation plan: `docs/superpowers/plans/2026-09-02-entropy-opm-embedded-c.md`.
- The previous Antigravity run changed multiple tasks at once and is not accepted.
- `npx vitest run src/engine/opm src/components/entropy` currently reports 20 files and 101 tests passing.
- `npx tsc --noEmit -p tsconfig.json` currently passes.
- Those green gates do not prove the requested behavior.
- The generated-C test returned successfully without compiling when no compiler was on `PATH`. The repository compiler is `G:\adia project\toolchains\w64devkit\w64devkit\bin\gcc.exe`.
- The current TypeScript runtime ignores process activation mode, period, debounce, reentrancy, and incoming trigger/condition links.
- `EntropyWorkspace.runSimTick()` does not pass `executionConfig` or a persistent `OpmRuntime`, so executable state resets every UI tick.
- Generated C compiles as a minimal smoke program but does not implement the TypeScript runtime semantics.
- TypeScript/C “parity” is currently a source-string assertion, not a differential execution test.
- SHA-256 was requested, but the current model fingerprint is an eight-character 32-bit FNV-style hash.
- Dedicated link selection, inspectors, diagnostic property focus, transition preview, value watch, secure host verification, and HIL handoff remain incomplete.
- `src/engine/vlab/vlab.test.ts` gained unrelated force/torque tests during the OPM run. All VLab files are out of scope.

## Mandatory execution rules

1. Implement one correction assignment only, then stop for review.
2. Do not claim the complete 11-task plan is finished.
3. Do not run `git add`, `git commit`, `git reset`, `git checkout`, `git clean`, or switch branches.
4. Do not edit any file under `src/components/vlab` or `src/engine/vlab`.
5. Do not alter the implementation plan or design specification.
6. Do not weaken, delete, skip, comment out, or broaden existing assertions.
7. Add behavioral tests that fail for the current implementation before changing production code.
8. Do not hide compiler/runtime exceptions with empty results or catch-all fallbacks.
9. Stable IDs are references. Display names and generated C identifiers are not references.
10. Raw expression strings must never drive runtime behavior or be copied directly into C.
11. Leave all changes uncommitted. The reviewing orchestrator owns acceptance and commits.

## Immediate assignment: repair Task 5 only

```xml
<task>
Repair only Task 5, "Canonical TypeScript Runtime and Existing Simulator Compatibility", from docs/superpowers/plans/2026-09-02-entropy-opm-embedded-c.md.

The previous implementation is not accepted. Correct the TypeScript runtime and its Entropy workspace integration. Stop after Task 5 and leave Task 6 generated C, later UI work, persistence helpers, documentation, examples, HIL, and VLab untouched.

Allowed production files:
- src/engine/opm/runtime.ts
- src/components/entropy/OpmSimulationEngine.ts
- src/components/entropy/EntropyWorkspace.tsx, only for runtime/config wiring and visible simulation errors

Allowed tests:
- src/engine/opm/__tests__/runtime.test.ts
- src/components/entropy/__tests__/opmSimulationEngine.test.ts
- one new focused workspace integration test only if runtime persistence cannot be proven through the facade test
</task>

<required_behavior>
1. EntropyWorkspace must own a persistent OpmRuntime ref. Pass both executionConfig and that ref to every executable step. Recreate the runtime only when the compiled model fingerprint changes or Reset is invoked.
2. Pass the current executionConfig to compilation. Events, enums, tick settings, queue policy, and numeric policies configured by the user must be visible to simulation.
3. Preserve conceptual simulation unchanged when no executable metadata is enabled.
4. A process with activation "triggered" must not fire without a matching incoming trigger event or state-change trigger.
5. A process with activation "cyclic" fires only when its positive period is due. Define initial due behavior explicitly in the test and use accumulated elapsed milliseconds rather than step count.
6. A process with activation "both" fires when either its cyclic schedule is due or a matching trigger occurs, but at most once per step.
7. Incoming condition links gate only their target process. Incoming trigger links activate only their target process. Unrelated active links must not activate or block another process.
8. Evaluate process and link guards against the same read-only snapshot used for assignments.
9. Enforce debounce per process using elapsed milliseconds. A process inside its debounce window is reported as blocked and performs no assignments.
10. Enforce the release-one reentrancy policy "reject". A process cannot be activated twice in one step through multiple trigger paths.
11. Consume a FIFO event occurrence only when a matching trigger is used. If the queue contains the same event ID twice, consuming one occurrence must leave the second occurrence queued.
12. Preserve rejectNewest and dropOldest overflow behavior and unknown-event rejection.
13. Apply a transition only when its optional sourceStateId equals the owner's current state. A stale delayed transition must not change state.
14. Schedule a delayed transition once for a specific activation. Do not enqueue a duplicate delayed transition every step while its guard remains true.
15. Resolve simultaneous transitions per owning object by descending priority and stable normalized order. Commit at most one transition per object per step.
16. Stage all process and link assignments before committing. Higher priority wins. An equal-priority conflict must produce OPM_WRITE_CONFLICT and commit neither conflicting write.
17. Execute exit assignments before entry assignments in stable normalized state order. Keep attribute-ID and C-identifier lookup aliases synchronized after process, link, exit, and entry assignments.
18. Saturate timers at UINT32_MAX. Reject negative or non-finite deltaMs without mutating runtime state.
19. Return source-linked runtime diagnostics for rejected writes, transition conflicts, invalid transitions, and capacity overflow. Do not silently return zero for impossible expression references or division by zero.
20. OpmSimulationEngine must return compilation/runtime errors as simulator logs without modifying displayed state.
21. EntropyWorkspace must not catch compilation errors and replace diagnostics with an empty array. Unexpected failures must produce a visible OPM_INTERNAL_ERROR diagnostic/log.
</required_behavior>

<required_red_tests>
Before production edits, add tests demonstrating that the current implementation fails these cases:
- triggered process does not fire before its event and fires once after dispatch;
- cyclic period 30 ms with 10 ms steps fires only on the defined due step;
- three workspace/facade ticks use the same runtime and accumulate an assignment from 0 to 3;
- an event declared only in executionConfig is accepted by the UI/facade simulation;
- condition link gates its target process but not an unrelated process;
- duplicate queued event IDs are consumed one FIFO occurrence at a time;
- equal-priority write conflict commits neither value and emits OPM_WRITE_CONFLICT;
- higher-priority write wins independently of input array order;
- delayed transition is scheduled once and becomes stale if the source state changes first;
- simultaneous transitions for one object commit only the highest-priority winner;
- reset reconstructs initial values, state, timers, queue, debounce, and delayed transitions;
- negative and NaN deltaMs leave the runtime unchanged and return a diagnostic.
</required_red_tests>

<verification_loop>
Run the focused tests before production edits and report the specific expected failures.

After implementation, run and make green:
npx vitest run src/engine/opm/__tests__/runtime.test.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts --reporter=verbose
npx vitest run src/engine/opm src/components/entropy --reporter=dot
npx tsc --noEmit -p tsconfig.json
git diff --check

Inspect git status afterward. Task-owned changes must be limited to the allowed files. Pre-existing files may remain dirty but must not be modified by this assignment.
</verification_loop>

<action_safety>
Do not touch generated C, cGenerator tests, fingerprints, code-generation UI, HIL, documentation, examples, persistence, or VLab in this assignment.
Do not use non-null assertions to conceal failed compilation in tests.
Do not hardcode fixture IDs, values, event names, or expected outputs in production code.
Do not add dependencies.
</action_safety>

<structured_output_contract>
End with exactly:
1. Root causes corrected.
2. Files changed and why each was necessary.
3. Red tests observed before implementation, with their failure messages.
4. Final focused and full test counts.
5. TypeScript and git diff-check results.
6. Any requirement not completed or any decision requiring orchestrator review.
7. Explicit statement that Task 6 and later tasks were not started.
</structured_output_contract>
```

## Later correction assignments

Do not execute these until the immediate Task 5 correction is independently reviewed and committed.

1. **Task 6 — generated C semantics:** Generate the same activation, event, timing, snapshot, staged-write, conflict, transition, state-action, I/O, diagnostic, and overflow semantics as the accepted TypeScript runtime. Add `OPM_GetDiagnostics`. Remove raw sequential process execution.
2. **Task 7 — real differential qualification:** Execute the same 100-step vector in TypeScript and compiled C and compare values, float32 bytes, active states, consumed events, fired processes, writes, transitions, and diagnostic codes after every step.
3. **Fingerprint correction:** Replace the 32-bit hash with deterministic SHA-256 and test byte stability under reversed editor input order.
4. **Tasks 8–9 — complete authoring and feedback:** Implement edge selection, dedicated typed inspectors, assignment-row reordering, event/enum management, exact diagnostic property focus, canvas badges, transition preview, and previous/current/pending value watch.
5. **Task 10 — secure verification and HIL:** Add generated-code preview, verified-state invalidation, bounded Electron IPC host compilation, filename/content validation, archive export, fingerprint validation, and opt-in OPM HIL package import without State Machine IR.
6. **Task 11 — release gate:** Run OPL regression, complete repository gates, bundled-GCC compilation, TypeScript/C differential parity, security tests, build, and the manual acceptance checklist. Remove only Antigravity's unrelated additions to `src/engine/vlab/vlab.test.ts` in a separately reviewed cleanup without touching the user's other VLab edits.

No later assignment may be marked complete based only on TypeScript compilation, source-string assertions, or generated-file counts.
