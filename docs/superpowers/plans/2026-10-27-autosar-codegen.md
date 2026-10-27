# AUTOSAR Classic SWC code generation ("Generate AUTOSAR")

Planner/tester: Opus (main session). Executor: Sonnet subagent.
Branch: `automative`.

## Goal

A second code-generation button next to **Generate C/H** that turns the same validated state-machine
semantic IR into an AUTOSAR Classic Platform (R4.x) application software component package that an
automotive integrator can drop into an AUTOSAR stack: RTE-based ports, runnables, memory mapping,
compiler abstraction, ARXML description, MISRA C:2012 conformance evidence, and a host unit-test
harness.

The existing Generate C/H pipeline is not changed. The AUTOSAR generator reuses the verified core
(`generateCArtifacts` over the semantic IR) and wraps it — it does not fork the state-machine renderer.

## Public API

`src/utils/stateMachine/autosar/autosarSwcGenerator.ts`

```ts
export interface AutosarGeneratorOptions { swcName?: string }           // default 'AdiaSwc'
export const generateAutosarSwc = (chart, options?) =>
  { files: { name: string; content: string }[]; errors: ErrorItem[]; warnings: string[] };
export const deriveAutosarPorts = (ir: SemanticModel) => AutosarPortModel;
export const toAutosarPlatformType = (t: VariableType) => string;     // 'boolean' | 'uint8' | 'sint8' | ... | 'float32' | 'float64'
```

`src/utils/stateMachine/autosar/autosarMisraChecker.ts`

```ts
export const checkMisraSubset = (files) => MisraFinding[];   // { rule, file, line, message }
```

Errors carry `id` = diagnostic code (`AUTOSAR_INVALID_SWC_NAME`, `AUTOSAR_INVALID_SHORT_NAME`,
`AUTOSAR_MISRA_VIOLATION`, plus every semantic-model error the C/H generator already reports).

## Package layout (SWC = swcName, SWCU = upper-case)

| Path | Role |
|---|---|
| `autosar/swc/<SWC>.c` | Runnables `<SWC>_Init` (InitEvent) and `<SWC>_MainFunction` (TimingEvent, period = tickMs). Uses only `Rte_Read_*`, `Rte_Write_*`, `Rte_Call_*`. `FUNC()/P2VAR()` compiler abstraction, `<SWC>_START_SEC_*` / `<SWC>_STOP_SEC_*` memory sections around code and the static instance. |
| `autosar/swc/<SWC>.h` | Vendor/module/SW version macros, `<SWCU>_PERIOD_MS`, runnable prototypes. |
| `autosar/core/sm_*.{c,h}` | The verified state-machine core from the C/H generator, every `.c` wrapped in `<SWC>_START_SEC_CODE` / `<SWC>_STOP_SEC_CODE`. No `mcal_*` file or include (an application SWC never touches MCAL). |
| `autosar/arxml/<SWC>.arxml` | AUTOSAR 4 schema (`http://autosar.org/schema/r4.0`, `AUTOSAR_00049.xsd`). Implementation data types, sender-receiver interfaces, a client-server interface for the Dem event, the `APPLICATION-SW-COMPONENT-TYPE` with P/R ports and com-specs with init values, `SWC-INTERNAL-BEHAVIOR` with INIT-EVENT, TIMING-EVENT, runnables with data read/write accesses and server call points, and `SWC-IMPLEMENTATION`. Every reference resolves inside the file or to `/AUTOSAR_Platform/ImplementationDataTypes/*`. |
| `autosar/stubs/Std_Types.h`, `Platform_Types.h`, `Compiler.h`, `Compiler_Cfg.h`, `<SWC>_MemMap.h`, `Rte_<SWC>.h`, `Rte_<SWC>_Stub.c` | Host-only contract-phase stand-ins so the SWC compiles and tests stand-alone. The integrator replaces them with the stack's own files; each says so in its header. |
| `autosar/test/test_<SWC>.c` | Host unit test: Init writes init values, N MainFunction cycles run without error, status port and Dem status written every cycle, RTE read failure keeps the last valid value, NULL-safe paths. Prints `ALL TESTS PASSED`, exit code 0. |
| `autosar/Makefile` | Builds and runs the host test with `-std=c99 -pedantic-errors -Wall -Wextra -Werror`. |
| `autosar/doc/MISRA_Compliance.md` | MISRA C:2012 guideline compliance summary: checked rules, results of `checkMisraSubset`, documented deviations (with rationale) and the statement that a qualified MISRA checker must be run by the integrator. |
| `autosar/doc/Integration_Guide.md` | Port table, runnable/event table with period, memory sections, Dem event, RTE contract, steps to import the ARXML into an authoring tool and replace stubs, ISO 26262 notes (ASIL is assigned by the item's HARA, not by the generator). |

## Port derivation

- A variable assigned by any action (state entry/during/exit, transition/internal transition actions,
  X-Bridges output boundary) is **provided**: P-port `PP_<cName>`, interface `SRI_<cName>`, data
  element `<cName>`.
- Every other variable is **required**: R-port `RP_<cName>`, same interface/element naming.
- Fixed P-port `PP_SmStatus` (interface `SRI_SmStatus`, elements `ActiveState` : uint16, `ErrorStatus` : uint8).
- Fixed R-port `RP_SmFaultEvent` on client-server interface `CSI_DemEvent` with operation
  `SetEventStatus(IN uint8 EventStatus)`; MainFunction reports `DEM_EVENT_STATUS_FAILED` (0x01) while the core
  reports an error and `DEM_EVENT_STATUS_PASSED` (0x00) otherwise.
- RTE API names follow the RTE spec: `Rte_Read_<port>_<element>`, `Rte_Write_<port>_<element>`,
  `Rte_Call_<port>_<operation>`.

## Type mapping (AUTOSAR_Platform)

bool→boolean, int8→sint8, uint8→uint8, int16→sint16, uint16→uint16, int/int32→sint32,
uint/uint32→uint32, int64→sint64, uint64→uint64, float/single→float32, double→float64.

## UI

`App.tsx`: button **Generate AUTOSAR** right after Generate C/H, same validation gating
(`validateModel`, generator errors open the code dialog with errors), result shown in the existing
`CodeGenerationDialog` (Download Files zips the package). Help topic `app-generate-autosar` in
`src/help/appFeatureTopics.ts`.

## Acceptance

`npx vitest run src/utils/stateMachine/autosar` (written by the planner) — includes gcc compile with
strict flags and execution of the generated unit test, ARXML structural/reference checks, MISRA
subset checks, determinism, and error paths. Plus `npx tsc --noEmit` and the existing
`src/utils/stateMachine/smCGenerator.test.ts` and `src/help` suites unchanged-green.

## Out of scope / reported limits

- No AUTOSAR XSD ships with the repo; ARXML is checked structurally, not schema-validated.
- No qualified MISRA tool (e.g. Polyspace, PC-lint, Helix QAC) is available here; `checkMisraSubset`
  covers textually decidable rules only, and the report states this.
- AUTOSAR Adaptive (C++14, ara::com) is not generated.

---

# Phase 2 — production hardening (weak points found in review of phase 1)

Acceptance: `npx vitest run src/utils/stateMachine/autosar` (adds `autosarProduction.test.ts`, planner-owned)
plus every phase-1 command.

| # | Weak point in phase 1 | Requirement |
|---|---|---|
| W1 | Generated unit test covered 91 % lines / 50 % branches of the SWC; fault path (Dem FAILED, safe-output hook) never ran; read-failure retention could not be observed. | `<SWC>.c` exposes `ADIA_Instance_t *<SWC>_Test_GetInstance(void)` **only under `#ifdef ADIA_TESTING`** (declared in `<SWC>.h` under the same guard). The Makefile `test` target builds with `-DADIA_TESTING`. The generated test drives every branch of the SWC: per-port read accept/reject (incl. `RTE_E_LOST_DATA`, non-finite floats), RTE error limit, forced core fault (`SM_Test_SetStateActive`) → Dem FAILED + safe state. Gate: **100 % line coverage, ≥ 90 % branches taken** (gcov) on `swc/<SWC>.c`. A production build (no `ADIA_TESTING`) contains no `_Test_` symbol. |
| W2 | Generated test had no proven fault-detection power. | Mutation gate: removing user port writes, swapping Dem PASSED/FAILED, or rejecting `RTE_E_LOST_DATA` each make `make test` fail. Stub defines `RTE_E_INVALID` (1). |
| W3 | Only gcc `-Wall -Wextra` on gcc. | Also clean under `gcc -fanalyzer -Werror` (swc + core), `clang -std=c99 -Wall -Wextra -pedantic -Werror` (build + run), and ASan + UBSan (`-fno-sanitize-recover=all`) on the behaviour test and a 70 000-cycle soak. |
| W4 | A float input of NaN/Inf from the bus was accepted. | Non-finite float reads are rejected (last valid value kept) and count as a read failure. |
| W5 | A permanently lost signal was silently held forever. | Per required port, consecutive failed reads are counted (saturating, never wraps). When any port reaches `<SWCU>_RTE_ERROR_LIMIT` (default `10U`, overridable with `#ifndef`), MainFunction reports Dem FAILED; one good read of that port clears it. Documented in the Integration Guide. |
| W6 | Fractional `tickMs` emitted `2.5U` (invalid C). | `tickMs` must be a positive integer → else error `AUTOSAR_INVALID_PERIOD`. |
| W7 | 64-bit variables silently lose precision (core stores them as double). | Warning `[AUTOSAR_64BIT_PRECISION]` naming the variable. |
| W8 | Variables neither read nor written became dead R-ports. | Excluded from ports/ARXML, warning `[AUTOSAR_UNUSED_VARIABLE]` naming the variable. Read = used in a guard, an action right-hand side, or an X-Bridges input boundary. |
| W9 | MISRA Rule 5.1 (external identifiers distinct in 31 chars) unchecked: long SWC/state names collide. | Checker gains Rule 5.1 (cross-file, external names only), 16.4 (switch has default), 21.4 (setjmp.h), 21.5 (signal.h), 21.10 (time.h). Violations block generation (`AUTOSAR_MISRA_VIOLATION`, message names the rule). `toAutosarSwcName` caps names at 18 chars so the UI never produces a 5.1 clash. |
| W10 | ARXML lacked integration-relevant facts. | `SUPPORTS-MULTIPLE-INSTANTIATION` = false (static instance); every runnable `CAN-BE-INVOKED-CONCURRENTLY` = false; com-spec INIT-VALUEs equal model initial values; `SWC-IMPLEMENTATION/RESOURCE-CONSUMPTION/MEMORY-SECTIONS` lists exactly the memory sections used in the C code, each with a resolving `SW-ADDRMETHOD-REF`. |
| W11 | No traceability between model, generator and artefacts. | Exported `AUTOSAR_GENERATOR_VERSION` (semver). SWC `.c`/`.h`, ARXML and both docs carry `ADIA-AUTOSAR-GENERATOR: <version>` and the same `ADIA-FINGERPRINT: <16 hex>` (deterministic hash of the model); it changes when the model changes. |
| W12 | AUTOSAR pipeline duplicated `generateMISRACCode`'s front end (drift risk). | Share the migrate → validate → build front end with `generateMISRACCode` (one helper used by both). Parity: every error id `generateMISRACCode` reports for an invalid model is reported by `generateAutosarSwc`. |
| W13 | Type round trip only proven for boolean/float64/uint8. | Every ADIA type (bool, int8, uint8, int16, uint16, int32, uint32, int, uint, float, double, int64) round-trips extreme values input port → core → output port. |
| W14 | Scale untested. | 40 inputs, 40 outputs, 15-state chain: generates < 5 s, MISRA clean, builds and its generated test passes. |
| W15 | Docs not auditable. | MISRA doc lists deviations with ids `DEV-<n>`, each with a rule reference and rationale; Integration Guide lists every port, the period, `<SWCU>_RTE_ERROR_LIMIT` and the fingerprint. |
