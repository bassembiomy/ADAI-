# Gas Sensors and Domain Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add functional Gas pressure/flow sensors and correct all requested Gas port domains and unsupported Gas utility interfaces.

**Architecture:** Keep block metadata in `src/utils/vlabLibrary.ts`; implement sensor participation in `src/engine/vlab/DAEAssembler.ts` using existing branch and physical-signal conventions. Remove the unused `gas_properties` metadata and `gas_pipe.h` port.

**Tech Stack:** TypeScript, Vitest, mathjs-backed V-Lab DAE assembly.

## Global Constraints

- Pressure output is in Pa and flow output is in kg/s.
- `gas_pressure_sensor` must impose zero mass flow.
- `gas_flow_sensor` must impose equal pressures at `p` and `n`.
- Converter `h` remains Gas; `r/c` become Rotational or Translational.
- Do not add an unconnected Thermal port or pretend `gas_properties` affects equations.

### Task 1: Add failing library contract tests

**Files:**
- Modify: `src/utils/vlabLibrary.test.ts`

- [ ] Add tests asserting the two sensor definitions, every requested Domain mapping, no `gas_pipe.h`, and no `gas_properties`.
- [ ] Run `npx vitest run src/utils/vlabLibrary.test.ts`; expect failures for missing sensors and current mismatches.

### Task 2: Implement library metadata

**Files:**
- Modify: `src/utils/vlabLibrary.ts`

- [ ] Add both sensor blocks in the Gas block list with exact ports, units, equations, and descriptions.
- [ ] Add explicit `domain` values to all ports in the requested Gas blocks.
- [ ] Remove the `h` port from `gas_pipe`, revise its description, and remove `gas_properties`.
- [ ] Run the focused library tests and confirm they pass.

### Task 3: Add failing DAE sensor behavior tests

**Files:**
- Modify: the narrowest existing V-Lab DAE test file covering branch allocation, or add `src/engine/vlab/gas_sensors.test.ts` if no focused file exists.

- [ ] Add tests for pressure sensor zero-flow/no extra gas branch and physical output pressure, and flow sensor pressure equality plus flow output.
- [ ] Run the focused tests and confirm they fail because the assembler has no sensor cases.

### Task 4: Implement DAE sensor behavior

**Files:**
- Modify: `src/engine/vlab/DAEAssembler.ts`

- [ ] Add minimal sensor cases using the existing branch/signal structures; preserve sign conventions and avoid introducing unrelated gas-property behavior.
- [ ] Run focused tests, then `npm run test:vlab` and `npx tsc --noEmit`.

### Task 5: Final verification and review

**Files:**
- Review: all modified files and `git diff`

- [ ] Run the complete relevant test commands fresh.
- [ ] Check every user requirement against the diff, including Scope units and all Domain rows.
- [ ] Report any pre-existing failures separately from task failures.
