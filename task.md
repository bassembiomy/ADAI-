# OPM Entropy UI Distribution, Simulation Scope & Blocks Implementation Checklist

## Task 1: Simulation Scope Core Component & Signal Extraction
- [x] Step 1: Write failing tests for `OpmSimulationScope` in `src/components/entropy/__tests__/opmSimulationScope.test.tsx`.
- [x] Step 2: Run tests to verify they fail.
- [x] Step 3: Implement `OpmSimulationScope.tsx` with multi-track SVG waveforms, digital logic transitions, zoom controls, and time playhead.
- [x] Step 4: Run tests to verify they pass.
- [x] Step 5: Commit changes.

## Task 2: High-Fidelity Blocks & Directional Ports Visual System
- [x] Step 1: Add visual assertions for directional port chevrons and process firing aura in `src/components/entropy/__tests__/opmBlocksVisual.test.tsx`.
- [x] Step 2: Run tests to verify failure on missing directional indicators.
- [x] Step 3: Implement directional port chevrons, expanded interactive halos, and active energy pulse auras in `OPMNodeComponents.tsx`.
- [x] Step 4: Run tests to verify they pass.
- [x] Step 5: Commit changes.

## Task 3: Studio Ribbon Command Bar Redistribution & Dock Scope Integration
- [x] Step 1: Write test for Ribbon distribution and Scope tab in `src/components/entropy/__tests__/executionPanels.test.tsx`.
- [x] Step 2: Run test to verify failure on missing scope tab and ribbon segments.
- [x] Step 3: Restructure top bar into 4 Studio Ribbon clusters and integrate `OpmSimulationScope` into dock tabs in `EntropyWorkspace.tsx`.
- [x] Step 4: Run tests to verify they pass.
- [x] Step 5: Commit changes.

## Task 4: Full Test Suite, Accessibility, and Production Build Verification
- [ ] Step 1: Run complete vitest test suite across all entropy and engine tests (`npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__`).
- [ ] Step 2: Run TypeScript typecheck (`npx tsc --noEmit`).
- [ ] Step 3: Run production build (`npm run build`).
- [ ] Step 4: Commit final verification changes.
