# ENTROPY OPM Executable Engine & Embedded C99 Code Generation Guide

## 1. Overview & Architecture

The **ENTROPY OPM Executable Engine** extends Object-Process Methodology (OPM ISO 19450) with formal, deterministic semantics and a MISRA-compliant C99 code generator for safety-critical embedded systems.

The engine operates in two complementary modes:
1. **Conceptual ISO 19450 Simulation**: Lightweight visual execution of structural and procedural state flows.
2. **Deterministic Embedded-C Execution & Codegen**: Typed variables, guards, priority conflict resolution, timeouts, hardware I/O mappings, and static C99 artifact generation with zero dynamic memory allocation.

```
+-------------------------------------------------------------------------------+
|                             OPM Editor Canvas                                 |
|          (Objects, States, Processes, Procedural & Structural Links)          |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                       Deterministic Normalization                             |
|          - Order-independent sorting by ordinal ID                            |
|          - C identifier sanitization & collision detection                    |
|          - Source-linked diagnostic tracking                                  |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                         Restricted Expression Parser                          |
|          - Recursive-descent typed precedence parsing                         |
|          - Static symbol & attribute resolution (dot notation)                |
|          - Strict type promotion & arithmetic overflow guards                 |
|          - Intrinsics: abs(), min(), max(), clamp()                           |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                         Semantic Validator Pipeline                           |
|          - Exactly one initial state per active object                        |
|          - Cross-owner transition verification                                |
|          - Static write conflict detection across equal priorities            |
|          - Reachability analysis from initial states                          |
+-----------------------------------+-------------------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-------------------------------+       +---------------------------------------+
|   Canonical TypeScript Runtime|       |       MISRA-Compliant C99 Generator   |
|   - 10-phase execution cycle  |       |       - 12 static artifact files      |
|   - Frozen snapshot staging   |       |       - Zero heap allocation (malloc) |
|   - Priority write commits    |       |       - Traceability manifest (JSON)  |
|   - In-canvas Live Trace HUD  |       |       - Instance-encapsulated API     |
+-------------------------------+       +---------------------------------------+
```

---

## 2. Canonical Data Contracts

### 2.1 Object Attributes & Scalars
Objects declare stateful scalar variables:
- `bool`: Boolean flag (`true` / `false`)
- `int32`: 32-bit signed integer (`-2147483648` to `2147483647`)
- `uint32`: 32-bit unsigned integer (`0` to `4294967295`)
- `float32`: 32-bit IEEE 754 single-precision float
- `enum`: User-defined named enumeration

Attributes support:
- **Initial Value**: Type-checked starting literal.
- **Overflow Policy**: `diagnostic` (error), `wrap` (modulo arithmetic), `saturate` (clamped to min/max).
- **Access Modifier**: `readWrite` or `readOnly`.
- **Hardware Mapping**: Direction (`input` / `output`) and target hardware symbol (e.g. `ADC_CH1`, `PWM_OUT`).

### 2.2 State Execution & Timeouts
States belong strictly to a parent object:
- `initial`: Exactly one state per stateful object must be initial.
- `terminal`: Marks terminal state machine states.
- `timeoutMs` & `timeoutEventId`: Automatic timer expiration dispatching an event to trigger transitions.
- `entryAssignments` & `exitAssignments`: Attribute assignments executed upon entering or exiting the state.

### 2.3 Process Execution & Activation
Processes perform computational actions:
- `activation`: `'cyclic'` (periodic timer), `'triggered'` (event/condition arrival), or `'both'`.
- `periodMs`: Strict positive period for cyclic invocation.
- `debounceMs`: Minimum interval between consecutive activations.
- `guard`: Restricted boolean expression that must evaluate to `true` to fire.
- `assignments`: Action rows (`=`, `+=`, `-=`, `*=`, `/=`) evaluated against the step snapshot.
- `priority`: Numeric priority (higher priority wins during write conflicts).

### 2.4 Links & Transition Requests
Procedural links (`agent`, `instrument`, `consumption`, `result`, `effect`, `trigger`, `condition`) carry:
- `guard`: Optional boolean expression.
- `eventId`: Optional incoming event trigger ID.
- `transition`: Request modifying an object's state (`ownerObjectId`, `sourceStateId`, `targetStateId`).
- `priority` & `delayMs`: Deterministic transition timing and precedence.

---

## 3. Restricted Expression Language

The OPM expression engine uses a safe, non-Turing-complete subset of C/TypeScript expressions.

### 3.1 Operator Precedence (Highest to Lowest)
1. **Primary**: Literals (`true`, `42`, `3.14f`), Identifiers (`temp`, `temperature.value`), Parentheses `(...)`, Intrinsics (`abs`, `min`, `max`, `clamp`).
2. **Unary**: `!` (not), `-` (negate), `+` (plus).
3. **Multiplicative**: `*`, `/`, `%`.
4. **Additive**: `+`, `-`.
5. **Relational**: `<`, `<=`, `>`, `>=`.
6. **Equality**: `==`, `!=`.
7. **Logical AND**: `&&`.
8. **Logical OR**: `||`.

### 3.2 Supported Intrinsics
- `abs(x)`: Absolute value.
- `min(a, b)`: Minimum of two numeric values.
- `max(a, b)`: Maximum of two numeric values.
- `clamp(val, min, max)`: Clamps value to the `[min, max]` range.

---

## 4. Deterministic 10-Phase Runtime Cycle

Every step executes across 10 deterministic phases:

| Phase | Description |
|---|---|
| **1. `sampleInputs`** | Reads physical hardware mapped inputs into runtime memory variables. |
| **2. `advanceTimers`** | Advances elapsed state timers, delayed transition counters, and process debounce intervals. |
| **3. `activate`** | Evaluates event triggers, cyclic periods, and condition links to find eligible processes. |
| **4. `evaluate`** | Evaluates guards and assignments against a **frozen snapshot** of runtime variables. |
| **5. `stage`** | Collects all calculated writes and state transition requests into staging buffers. |
| **6. `resolveConflicts`** | Resolves overlapping writes to the same attribute by descending priority and deterministic order. |
| **7. `commit`** | Applies winning writes with overflow policies and updates active states. |
| **8. `stateActions`** | Executes exit assignments for leaving states and entry assignments for entering states. |
| **9. `publishOutputs`** | Writes mapped output variables to hardware registers and consumes processed events. |
| **10. `advanceClock`** | Increments `stepIndex` and increments `timeMs += deltaMs`. |

---

## 5. C99 Code Generation & MISRA Compliance

The code generator emits **12 static files** with zero heap allocation:

```
c_artifacts/
├── opm_types.h        # Enums, status codes (OPM_Status_t), event IDs
├── opm_config.h       # Static sizing macros (queues, buffers, tick period)
├── opm_model.h        # OPM_Instance_t struct and model function prototypes
├── opm_model.c        # Guards, process actions, and step execution
├── opm_runtime.h      # Public API (Init, Step, DispatchEvent, Reset)
├── opm_runtime.c      # Instance management and event queue dispatch
├── opm_io.h           # Hardware I/O mapping prototypes
├── opm_io.c           # Default I/O mapping implementation
├── opm_trace.h        # Trace logger prototypes
├── opm_trace.c        # Formatted trace emission
├── main_example.c     # Standalone main harness
└── opm_manifest.json  # Traceability manifest with SHA-256 fingerprint
```

### Safety & MISRA Features:
- **No dynamic allocation**: `malloc`, `calloc`, `realloc`, `free` are strictly forbidden.
- **No function pointers**: Guards and actions are invoked statically.
- **No recursion & no VLAs**: Fixed-size arrays defined at compile-time in `opm_config.h`.
- **Instance Encapsulation**: All runtime state lives in caller-allocated `OPM_Instance_t`.

---

## 6. Public C API

```c
#include "opm_runtime.h"

// 1. Initialize instance
OPM_Instance_t instance;
OPM_Init(&instance);

// 2. Dispatch external event (from ISR or CAN/UART message)
OPM_DispatchEvent(&instance, OPM_EVENT_EV_START);

// 3. Step execution in base tick timer loop
OPM_Status_t status = OPM_Step(&instance, OPM_TICK_MS);
if (status != OPM_OK) {
    // Handle error or overflow
}

// 4. Reset runtime to initial state
OPM_Reset(&instance);
```

---

## 7. UI Controls & Persistence

- **C Exec Tab**: Right sidebar inspector for configuring process activation, period, guards, state initial/terminal flags, timeouts, and attribute tables.
- **Target Settings Modal**: Accessible from the toolbar to adjust tick ms, queue sizes, overflow policies, and MISRA profiles.
- **Live Trace HUD**: In-canvas translucent HUD showing live variable values, active states, and firing processes.
- **Diagnostics Badge**: In-canvas alert displaying error/warning counts with clickable navigation to offending elements.
- **ZIP Export/Import**: Full roundtrip persistence of `entropy.json`, `adia_project_unified.json`, and bundled `c_artifacts/`.

---

## 8. Verified Release Workflow (Qualification Gate)

Run the full gate before any release claim:

```powershell
npm run test:opm:release
npm run build
```

| Script | Scope |
|---|---|
| `test:opm` | All OPM engine tests plus Entropy component tests (`src/engine/opm`, `src/components/entropy/__tests__`). |
| `test:opm:codegen` | Strict bundled-GCC host compilation, TypeScript-vs-C golden parity, and wrong-runtime mutation resistance. |
| `test:opm:release` | `test:opm` + `test:opm:codegen` + secure C verifier tests + `tsc --noEmit`. |

Expected: zero failed/skipped OPM qualification tests, strict compilation succeeds, TypeScript passes, and the production build exits zero.

### 8.1 Modeling & Validation
1. Model objects, states, processes, and procedural links in the OPM editor.
2. Every stateful object needs exactly one initial state; every transition must resolve to a known owner object and known source/target states.
3. Static write-conflict detection flags equal-priority writes to the same attribute — resolve by assigning distinct priorities.
4. The Diagnostics Badge shows error/warning counts; clicking a diagnostic navigates to the offending node/edge and exact property path (e.g. `settings.maxStagedWrites`, `<elementId>/guard`).

### 8.2 Canonical Simulation
1. Run the canonical simulation (10-phase cycle, Section 4) against the normalized model.
2. `triggered` processes stay `waiting` (not `finished`) until their event/link arrives; `finished` requires all stateful objects to sit in terminal states.
3. Review the Live Trace HUD (live runtime values, active states, firing processes) — never editor initial values.
4. Confirm per-step snapshots: values, active states, fired/blocked processes, traversed links, committed writes, transitions, diagnostics.

### 8.3 Compiler Requirements & Verification States
1. Generation requires the mandatory bundled GCC qualification compiler (`resolveRequiredOpmCompiler`); if it is absent, verification **fails** — never skips.
2. Generated C99 is compiled with strict flags (`-std=c99 -pedantic-errors -Wall -Wextra -Werror`), zero heap allocation, no function pointers, no recursion/VLAs.
3. Lifecycle: `edited` → `generated` → `verified` (parity match on the current fingerprint) or `failed`. Only `verified` artifacts unlock Download/HIL handoff.

### 8.4 Fingerprint Invalidation, Preview & Export Rules
1. The SHA-256 model fingerprint covers settings, objects, states, processes, links, events, and enums. Any edit recomputes it; omitting a field (e.g. the event table) yields a different fingerprint.
2. Only persisted verification metadata (`{ fingerprint, verifiedAt, toolchainVersion, status }`) is stored — artifact content is regenerated after load and a persisted `verified` flag is never trusted without recomputing the fingerprint.
3. Preview a stale fingerprint shows `edited`; Verify is disabled unless generation matches the current fingerprint.
4. Export is blocked for edited, generated-only, failed, or stale artifacts.

### 8.5 Recovery from Failed Compilation/Parity
1. Failed strict compilation: read the compiler output tab, fix the reported MISRA/type error in the model (never hand-edit generated files), regenerate, re-verify.
2. Parity mismatch: inspect the field-level diff (step, field, expected vs actual), fix scheduler/priority/causality/consumption/lvalue/ordering semantics in the model, regenerate, re-run `test:opm:codegen`.
3. Persistent failure: reset the runtime, re-run canonical simulation first to isolate modeling errors from codegen errors, then re-verify.

