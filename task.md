# OPM Hybrid UX Upgrade Implementation Checklist

## Task 7: Persist independent OPM simulation configuration
- [x] Step 1: Add failing config tests in `src/components/entropy/__tests__/opmSimulationConfig.test.ts` and `src/engine/opm/__tests__/persistence.test.ts`. Reject zero, negative, fractional, NaN, Infinity, and above-limit values. Assert the previous valid config remains active after rejected edits. Assert save/restore preserves OPM config and does not change global State Machine `tickMs`.
- [x] Step 2: Implement bounded parsing in `src/components/entropy/OpmSimulationConfig.ts` with documented bounds (`tickMs` 1–60000, `maxTicks` 1–1000000, `maxEventsPerTick` 1–1024). Return diagnostics instead of silently rounding or falling back (`parseOpmSimulationConfig`).
- [x] Step 3: Wire configuration through App persistence (`src/App.tsx`, `src/engine/opm/persistence.ts`, `src/components/entropy/EntropyWorkspace.tsx`). Add only an OPM project field; preserve the existing global tick field unchanged. Pass OPM config to EntropyWorkspace and use `config.tickMs` for its interval.
- [x] Step 4: Expose controls in the Simulation panel (`src/components/entropy/EntropyWorkspace.tsx`). Show OPM tick, max ticks, max events/tick, simulated time, and status with inline validation. Keep invalid edits from replacing the active config.
- [x] Step 5: Run tests and commit:
  `npx vitest run src/components/entropy/__tests__/opmSimulationConfig.test.ts src/engine/opm/__tests__/persistence.test.ts`
  `git commit -m "feat(opm): persist isolated simulation configuration"`

## Task 8: Harden the code-generation panel UX
- [x] Step 1: Add failing panel tests in `src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`. Assert Generate is blocked on errors, generator diagnostics are visible, empty files produce `failed`, the manifest shows `pending`, and Download is enabled only for matching verified fingerprints.
- [x] Step 2: Add progress and evidence sections in `src/components/entropy/OpmCodeGenerationWorkspace.tsx` and `src/components/entropy/OpmContextPanel.tsx`. Show Validate, Generate, Verify, and Download as sequential actions. Display fingerprint, OPM tick, resource limits, compiler flags, qualification status, and verification evidence.
- [x] Step 3: Wire diagnostic navigation. Use `data-opm-path` and source references to focus the matching inspector control or show an explicit fallback message.
- [x] Step 4: Run tests and commit:
  `npx vitest run src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx src/engine/opm/__tests__/cGenerator.test.ts`
  `git commit -m "feat(opm): present qualified code generation flow"`

## Task 9: Accessibility, performance, and browser smoke verification
- [x] Step 1: Add accessibility tests in `src/components/entropy/__tests__/opmAccessibility.test.tsx`. Check keyboard navigation, visible focus, Escape cancellation, Enter confirmation, accessible names, and non-color status labels.
- [x] Step 2: Profile render stability. Ensure selecting one element does not recreate unrelated nodes/edges and dragging does not reset viewport state.
- [x] Step 3: Run the production verification suite:
  `npx tsc --noEmit`
  `npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__`
  `npm run test:opm:release` (or `test:opm:qualification`)
  `npm run build`
- [x] Step 4: Run browser smoke flow.
- [x] Step 5: Commit final verification changes:
  `git commit -m "test(opm): verify hybrid UX accessibility and release flow"`
