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
