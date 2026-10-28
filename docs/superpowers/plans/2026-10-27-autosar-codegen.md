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

---

# Phase 3 — verification evidence, reports and certification readiness

Goal: every claim ADIA makes about an AUTOSAR package is backed by evidence that was really produced, is
reproducible, and is reported honestly (PASS only for a gate that ran and passed; NOT RUN otherwise). The
package and the ADIA project report explain the AUTOSAR process, the generated code and the verification
done, in the form an ISO 26262 assessor expects. ADIA does **not** certify anything; it produces the
evidence an integrator needs for their safety case and lists what is still open.

Acceptance: `npx vitest run src/utils/stateMachine/autosar` (adds planner-owned
`autosarVerification.test.ts`) plus every earlier command.

| # | Requirement |
|---|---|
| V1 | **Real verifier** `src/utils/stateMachine/autosar/autosarVerifier.ts` (Node only, never imported by the renderer bundle): `verifyAutosarPackage(chart, files, options)` and `runAutosarVerification(chart, options)` (= generate + verify). It writes the package to a temp dir and runs the gates below with real tools, returning `AutosarVerificationEvidence` (`swcName, fingerprint, generatorVersion, fileSha256 {path: hex}, gates[], verdict, executedAt`). Each gate: `{ id, status: 'pass'|'fail'|'not-run', summary, tool, toolVersion, command, metrics }`. A missing tool → `not-run` with the reason; a gate never reports `pass` without having run. `verdict` = `accepted` only if every gate passed. |
| V2 | **Gates** (ids exact): `generation`, `misra-subset`, `arxml-structure` (well-formed + all DEST refs resolve, pure TS, no DOM), `host-build` (gcc strict), `unit-test` (generated test, `-DADIA_TESTING`), `coverage` (gcov on `swc/<SWC>.c`; metrics `linesPercent`, `branchesTakenPercent`; pass at 100 / ≥ 90), `static-analysis` (`gcc -fanalyzer -Werror` on swc + core), `sanitizers` (ASan + UBSan unit test), `second-compiler` (clang build + unit test), `differential` (see V3; metrics `cycles`, `mismatches`), `reproducible-build` (two builds of swc + core in different directories give byte-identical objects; metric `objects`). |
| V3 | **Differential correctness**: a generated-for-verification driver feeds seeded pseudo-random input vectors (deterministic PRNG, every required port, type-correct values incl. boundaries) through `<SWC>_MainFunction` via the RTE stub and records every provided port + `ActiveState` per cycle; the same vectors run through ADIA's semantic interpreter (`smInterpreter` / `smReferenceInterpreter`). Any mismatch fails the gate (integers/booleans exact, floats bit-exact or within 1e-12 relative — state the rule in the report). Default 500 cycles, option `cycles`, `seed`. |
| V4 | **Reports** `src/utils/stateMachine/autosar/autosarReport.ts`: `buildAutosarReport(chart, { swcName?, evidence? })` → `{ markdown, html, errors }`. Sections: 1 Identification (SWC, generator version, fingerprint, SHA-256 manifest); 2 AUTOSAR process (model → semantic IR → MISRA core → SWC/RTE → ARXML → integration; mapping to ISO 26262-6 clauses 8 and 9 and ISO 26262-8 clause 11); 3 Software architecture (runnables/events/period, port table, memory sections, Dem); 4 Code properties (MISRA subset result, deviations, defensive behaviour); 5 Verification gates table `\| <gate-id> \| PASS\|FAIL\|NOT RUN \| summary \|`; 6 Traceability matrix (every state → its Entry/During/Exit C functions, every transition, every port → variable, requirement ids where linked); 7 Open items before certification; 8 Verdict (`ACCEPTED` / `NOT ACCEPTED`). Without evidence every dynamic gate is NOT RUN and the verdict is NOT ACCEPTED. HTML is escaped (model text never becomes markup). The word "certified" only ever appears negated ("not certified"). Deterministic: same input → byte-identical output. |
| V5 | **Package documents**: `autosar/doc/Verification_Report.md` = `buildAutosarReport(chart, { swcName }).markdown`; `autosar/doc/Safety_Manual.md` (tool usage constraints, ISO 26262-8 clause 11 tool classification — Tool Impact, Tool error Detection, Tool Confidence Level — known limitations, required integrator activities); `autosar/doc/SHA256SUMS` (sha256sum format over every other package file; pure-TS SHA-256 so it works in the browser, checked against Node crypto). |
| V6 | **ADIA project report**: `buildAutosarReportSection(chart, swcName)` → `{ id: 'autosar-swc', title, html }`; `handleGenerateReport` in `App.tsx` pushes it into `extraSections` when the state machine has states. |
| V7 | **CLI** `scripts/verify_autosar.ts` (+ npm script `verify:autosar`): `--chart <json> --out <dir> [--swc <name>] [--cycles n] [--seed n] [--gcc path] [--clang path]` → writes the package, `verification_evidence.json` and the filled `Verification_Report.md`; exit 0 only when the verdict is accepted. |
| V8 | **Honesty / determinism meta-tests**: a sabotaged package makes the relevant gates fail and the verdict NOT ACCEPTED; a missing compiler makes its gates NOT RUN (never PASS); two verifier runs on the same model give identical evidence (excluding nothing but `executedAt`, which is caller-supplied or null); report rendering is byte-identical for identical evidence. |
| V9 | **Division semantics** (found by the phase-3 differential gate): the model faults on `/` or `%` by zero (`smInterpreter`), while the generated C produced NaN/Inf for floats and *undefined behaviour* for integers (`x/0`, `x%0`, `INT_MIN/-1`). In `platform: 'autosar'` the core must guard every division/remainder so that a zero divisor latches the core fault exactly where the interpreter faults, and integer quotients follow the model (truncate, then saturate per overflow policy — e.g. `INT32_MIN / -1` → `INT32_MAX`) without UB. The differential gate must not redraw vectors: zero divisors and boundary quotients are drawn on purpose (metric `faultCycles` > 0, `rejectedDivisionByZero` absent or 0). The default Generate C/H output is left unchanged; its same gap is reported to the user as a separate finding. |

---

# Phase 4 — field review of a real model (air-fryer, 45 states) — findings F027–F029

An integrator review of a package generated from a production model found:

| Finding | Root cause in the generator | Requirement |
|---|---|---|
| F027 buttons became P-ports; no input ever read | Ports were *inferred* from usage (anything assigned ⇒ output); the model's explicit I/O declaration (`hilConfig.mappings`, edited in the I/O mapping UI) was stripped. | **I1** When the model has I/O mappings they are authoritative: `read` ⇒ R-port, `write` ⇒ P-port, every unmapped variable is internal (no port, no RTE traffic). **I2** A `read`-mapped variable assigned by any action is an error `AUTOSAR_INPUT_WRITTEN_BY_MODEL` naming the variable and explaining raw input + edge detection (an S/R input is re-delivered every cycle, so a "consume by clearing" pattern re-triggers). **I3** Without mappings, inference stays but warns `[AUTOSAR_PORTS_INFERRED]`, and every variable both read and written warns `[AUTOSAR_AMBIGUOUS_DIRECTION] <name>`. |
| F028 safe outputs empty; RTE loss never reaches the state machine | Mapping `safeValue`s and per-input `invalidInputPolicies` were ignored; RTE failures only went to Dem. | **I4** While the core fault is latched, every P-port whose mapping has a `safeValue` publishes that value (every cycle, from the fault cycle on). **I5** Per R-port the model's invalid-input policy applies on a failed/invalid read: `reject` hold last valid value; `default` substitute the variable's model initial value immediately (fail-safe default, e.g. door ⇒ open); `clamp` clamp out-of-range reads to the mapped channel `rangeMin..rangeMax`, hold last on failure; `diagnostic-fault` when the port's consecutive failures reach `<SWCU>_RTE_ERROR_LIMIT`, latch the core fault (⇒ safe state + safe values + Dem FAILED). **I6** Warnings `[AUTOSAR_SAFETY_MODE_OFF]` when the model has write mappings but safety mode is off, `[AUTOSAR_SAFE_VALUE_MISSING] <name>` for a write mapping without safe value. |
| F029 thresholds as R-ports; internal variables as P-ports; host test tests only the wrapper | Same inference; no behavioural test in the package. | **I7** Unmapped never-written variables are compiled-in model constants, warned `[AUTOSAR_CALIBRATION_CANDIDATE] <name>` and listed in the Integration Guide (AUTOSAR calibration parameters are a later step). **I8** The package ships a back-to-back test `test/test_<SWC>_b2b.c`: seeded input vectors with the expected outputs/active state per cycle computed at generation time by the ADIA semantic interpreter; `make test` runs it (prints `B2B PASSED`), so any host compiler (gcc, clang, zig cc) reproduces the comparison without ADIA. |

The Integration Guide lists per input its policy and per output its safe value. Acceptance: planner-owned
`autosarIoMapping.test.ts` plus all earlier suites.
| I9 (found while implementing phase 4) | Integer arithmetic overflowing its target (`INT32_MAX + 1`) saturates in the model but wraps / is signed-overflow UB in the generated C; the b2b vectors had been narrowed to ±1000 to avoid it. | In `platform: 'autosar'` every assignment follows the interpreter: evaluate arithmetic exactly as the model does (double), then truncate and saturate to the target type, or latch the core fault when the variable's `overflowPolicy` is `error`. No UB under UBSan. B2B and differential vectors use the full type range (no narrowing). Bump `AUTOSAR_GENERATOR_VERSION` to 2.1.0. |

### Open items after phase 4 (known, not yet covered by tests)

- After a *runtime evaluation fault* (division by zero, `error` overflow policy, non-finite value) the interpreter does not run exit / safe-state actions, while the C core does. Outputs with a mapping `safeValue` are unaffected (the SWC publishes the safe value while faulted); an output assigned only in an exit or safe-state action can differ after such a fault. Needs a semantic decision (which behaviour is the model's intent) before alignment.
- float32 overflow saturates to ±`Number.MAX_VALUE` in the interpreter but ±`FLT_MAX` in the generated C.
- X-Bridges output assignments do not use the guarded store path yet.
- Mapping `conversionExpr` is not applied to RTE ports (`[AUTOSAR_CONVERSION_IGNORED]` warning).
