# Steam Generator and Steam Nozzle Port Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Steam Generator and Steam Nozzle expose working `p`/`n` hydraulic ports and solve their equations against the connected downstream pressure.

**Architecture:** Keep the existing V-Lab DAE branch model, where each hydraulic two-terminal component owns one signed `mass_flow` branch from `p` to `n`. Update the component library metadata to match that backend contract, then make the generator and nozzle equations use both terminal pressures while preserving the generator’s physical `q_in` input.

**Tech Stack:** TypeScript, Vitest, existing V-Lab `VLAB_LIBRARY`, `blockEquations`, and `DAEAssembler`.

## Global Constraints

- Preserve unrelated existing working-tree changes.
- Use test-first development for the behavior change.
- Do not change the public component IDs or parameter names.
- Steam Generator must retain the physical `q_in` port.

---

### Task 1: Add regression coverage for the port and equation contract

**Files:**
- Create: `src/engine/vlab/steamGeneratorNozzlePorts.test.ts`
- Read: `src/utils/vlabLibrary.ts`
- Read: `src/engine/vlab/vlabEquations.ts`
- Read: `src/engine/vlab/DAEAssembler.ts`

**Interfaces:**
- Consumes the exported `VLAB_LIBRARY`, `blockEquations`, and `DAEAssembler` behavior.
- Produces executable regression tests for the corrected port contract and pressure-difference equations.

- [ ] **Step 1: Write failing tests**

Add tests that locate `steam_generator_fluid` and `steam_nozzle` in `VLAB_LIBRARY`, assert both hydraulic `p` and `n` ports exist, assert the generator still exposes `q_in`, and evaluate equations with `across: [200000, 101325, 1000]` / `[200000, 101325]` to verify positive flow. Add a nozzle case with `[101325, 200000]` and assert zero flow. Add an assembler test fixture with `p` and `n` node ports and assert its component branch maps `p` with sign `-1` and `n` with sign `1`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/engine/vlab/steamGeneratorNozzlePorts.test.ts`

Expected: FAIL because the library metadata does not currently expose the required `n` ports and the nozzle does not use downstream pressure.

### Task 2: Align library metadata and backend equations

**Files:**
- Modify: `src/utils/vlabLibrary.ts:8182-8270`
- Modify: `src/engine/vlab/vlabEquations.ts:1779-1810`

**Interfaces:**
- Consumes the existing component IDs, params, and `blockEquations` callback signature.
- Produces matching `p`/`n` hydraulic ports and equations that return one residual for the existing `mass_flow` branch.

- [ ] **Step 1: Add the missing `n` ports**

Add `{ "id": "n", "pos": "left", "label": "Return" }` to `steam_generator_fluid` after its `p` port, and add `{ "id": "n", "pos": "right", "label": "Out" }` to `steam_nozzle` after its `p` port. Preserve the generator’s `q_in` physical port.

- [ ] **Step 2: Use both hydraulic terminal pressures**

In `steam_generator_fluid`, read `P = across[0]`, `P_downstream = across[1]`, keep pressure-dependent `h_fg`, and use `Q_in = across[2]` only when present, otherwise `params.Q || 1000`. Return `[branch[0] - mdot_steam]`.

In `steam_nozzle`, read `P_upstream = across[0]`, `P_downstream = across[1]`, calculate `dP = Math.max(0, P_upstream - P_downstream)`, and return `[branch[0] - mdot]`. Keep the existing `Cd` and `d` parameter defaults.

- [ ] **Step 3: Run the focused tests and verify they pass**

Run: `npx vitest run src/engine/vlab/steamGeneratorNozzlePorts.test.ts`

Expected: PASS with all new regression tests green.

### Task 3: Run relevant V-Lab verification

**Files:**
- Read: `src/engine/vlab/*.test.ts`
- Read: `package.json`

- [ ] **Step 1: Run V-Lab equation and completeness tests**

Run: `npx vitest run src/engine/vlab`

Expected: PASS with no regressions in existing V-Lab equation, assembler, or completeness tests.

- [ ] **Step 2: Run TypeScript/build validation**

Run: `npm run build`

Expected: Successful production build.

- [ ] **Step 3: Review the final diff**

Run: `git diff -- src/utils/vlabLibrary.ts src/engine/vlab/vlabEquations.ts src/engine/vlab/steamGeneratorNozzlePorts.test.ts docs/superpowers/plans/2026-09-15-steam-generator-nozzle-ports.md`

Confirm only the approved port/equation repair, regression tests, and plan are included.
