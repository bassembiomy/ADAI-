# Design Specification: Code Generator Safety, Correctness & Verifiability Framework

**Date**: 2026-08-08  
**Status**: Approved & Refined  
**Target Systems**: State Machine (`SM`) and X-Bridges (`XB`) Code Generators (`src/utils/stateMachine/*`)  

---

## 1. System Architecture & End-to-End Generation Pipeline

The code-generation system converts hierarchical state-machine models containing embedded block-diagram physics/control subsystems (X-Bridges) into strict C99/C11 code.

### Pipeline Stages

```
Input Model (XBPersistedModelV1 & SMPersistedModel)
  │
  ▼
[1. Structural & Schema Validation] (validateXBModel / validateSMModel)
  │  - Reject malformed models, invalid topology, incompatible dimensions, dangling references
  ▼
[2. Semantic IR Validation] (buildXBSemanticModel / buildSemanticModel)
  │  - Authoritative variable symbol table lookup (`Map<string, SemanticVariableSymbol>`)
  │  - Owner-state index symbol resolution (`XBOwnerState`)
  │  - Execution ordering, state-slot ownership, timing lowering, and IR invariants
  ▼
[3. Generated Symbol / AST Consistency Validation] (smCGenerator.ts AST check)
  │  - Asserts `usedDataMembers ⊆ declaredDataMembers`
  │  - Asserts `usedStateIndices ⊆ declaredStateIndices`
  │  - Verifies unique generated identifiers and declared runtime dependencies
  ▼
[4. Code Generation & Rendering] (xbCGenerator.ts / smCGenerator.ts)
  │  - Emits deterministic, readable C99/C11 code
  │  - Explicit typed assignments (`(double)`, `(float)`, `(uint32_t)`)
  │  - Scope-isolated variable names using authoritative C identifiers
  ▼
[5. Compilation & Link Validation] (smCHarness.ts / gcc)
  │  - Fast early syntax check (`gcc -fsyntax-only`)
  │  - Full build & link gate: `gcc -std=c11 -Wall -Wextra -Wpedantic`
  │  - Strict compiler warning profile: `-Wconversion -Wshadow -Werror`
  ▼
[6. Runtime Behavioral Validation] (smStandaloneRuntime / smCHarness)
  │  - Executes generated C for representative scenarios (init, reset, step, timers, stateful logic)
  ▼
[7. Differential Verification] (smDifferential.test.ts / smCHarness.ts)
  │  - Compares C runtime state-by-state against reference interpreter execution
  ▼
[8. Target Qualification] (MCU HIL / Target Toolchains)
  │  - Embedded compiler target qualification (ARM GCC, Clang, IAR, etc.)
```

---

## 2. Verification Status Classification & Feature Inventory Matrix

Each capability uses explicit verification status labels instead of a generic `PASS`:

* **UNIT_PASS** — semantic builder/generator unit tests pass.
* **GENERATION_PASS** — representative models generate successfully.
* **COMPILE_PASS** — generated C compiles and links successfully using the supported host toolchain (`gcc -std=c11 -Wall -Wextra`).
* **RUNTIME_PASS** — generated C executes successfully for representative scenarios.
* **DIFFERENTIAL_PASS** — generated C behavior matches the reference interpreter step-by-step.
* **TARGET_PASS** — generated C has been validated using the intended embedded compiler/MCU target.
* **NOT_VERIFIED** — this verification level has not yet been performed.

A feature must not be described as fully verified unless all verification levels required by its risk profile have passed.

### Feature Matrix

| Feature Name | Implementation Location | Input/Model Representation | Generated C Representation | Runtime Behavior | Verification Status | Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hierarchical States & Regions** | `smSemanticBuilder.ts`, `smCGenerator.ts` | State tree nodes, OR/AND layers, default paths | Enum state indices, `active_states[]`, switch-case handlers | Entry/During/Exit execution order | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | SM Symbol Table |
| **State Machine Timers** | `smTiming.ts`, `smCGenerator.ts` | `before(t, sec)`, `every(t, sec)`, `stateElapsedTime` | `instance->state_timers[SM_ST_..._IDX]` tick increment & comparison | Microsecond/millisecond threshold evaluation | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | SM State Table |
| **Authoritative Variable Mappings** | `xbSemanticModel.ts`, `xbCGenerator.ts` | `smVarId` UUIDs or readable IDs | `instance->data.<cIdentifier>` | Safe read-before-update memory access | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | SM Symbol Table |
| **Explicit Solvers (Euler / RK4)** | `xbSemanticBuilder.ts`, `xbCGenerator.ts` | `model.solver.kind` ('euler' \| 'rk4') | Substep loop with temporary state accumulators | Fixed-step integration updates | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | State Slot Boundary |
| **Sources & Constants** | `xbCapabilities.ts`, `xbCGenerator.ts` | `Constant`, `Step`, `Inport`, `WHITE_NOISE`, `BAND_LIMITED_NOISE` | Literals, threshold comparisons, RNG PRNG updates | Pure direct output or stateful noise | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Math Library |
| **Deterministic Math & Reductions** | `xbCGenerator.ts` | `Sum`, `GAIN`, `PRODUCT`, `UnaryNeg`, `Abs`, `VectorAdd/Sub/Mul/Div` | Inlined C arithmetic, loop-unrolled vector math | Pure direct-feedthrough | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Dynamic Layout |
| **Bounded Linear Algebra** | `xbCGenerator.ts` | `MatrixMul`, `Transpose`, `MatrixConcat`, `MatrixDiag`, `MatrixSolve` | Inlined nested loops, Gaussian elimination for $N \le 8$ | Deterministic matrix updates | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Target Matrix Limit |
| **Logic & Bitwise Operations** | `xbCGenerator.ts` | `AND`, `OR`, `NOT`, `XOR`, `ShiftLeft`, `ShiftRight`, `DFlipFlop`, `Counter` | Bitwise operators (`&`, `\|`, `^`, `~`, `<<`, `>>`), struct state updates | Logical & sequential state transitions | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Integer Types |
| **Signal Routing & Multiplexing** | `xbCGenerator.ts` | `SWITCH`, `MUX`, `DEMUX`, `IF_ELSE`, `Outport` | Ternary operators, struct member assignments | Direct signal assignment | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Inport / Outport |
| **Stateful Filters & Systems** | `xbCGenerator.ts` | `UNIT_DELAY`, `MEMORY`, `INTEGRATOR_DISCRETE`, `PID_BASIC`, `STATE_SPACE` | Struct state slots, difference equations | Stateful update phase execution | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | State Slot Boundary |
| **Discontinuities** | `xbCGenerator.ts` | `SATURATION`, `DEADZONE`, `RATE_LIMITER`, `RELAY` | Clamping logic, rate boundary logic | Non-linear signal limiting | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Math Library |
| **Motor Control Transforms** | `xbCGenerator.ts` | `CLARKE_TRANSFORM`, `PARK_TRANSFORM`, `INVERSE_PARK/CLARKE` | Trigonometric equations using `<math.h>` | Coordinate transformation | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Math Library |
| **Trigonometry Suite** | `xbCGenerator.ts` | `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, etc. (24 functions) | Standard C `<math.h>` calls (`sin()`, `cos()`, etc.) | Floating point evaluation | `UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS` | Math Library |

---

## 3. Verification Gate Order

1. **Structural / Schema Validation**
   - Reject malformed models, invalid topology, incompatible dimensions, dangling references, and unsupported constructs.

2. **Semantic IR Validation**
   - Verify resolved symbols, owner-state context, execution ordering, state-slot ownership, timing lowering, and IR invariants.

3. **Generated Symbol / AST Consistency**
   - Verify:
     - `usedDataMembers ⊆ declaredDataMembers`
     - `usedStateIndices ⊆ declaredStateIndices`
     - generated identifiers are unique within their required scope
     - required runtime dependencies are declared

4. **Compilation & Link Validation**
   - Compile and link representative generated packages using:
     `gcc -std=c11 -Wall -Wextra -Wpedantic`
   - Project-specific stricter warning profiles may additionally include:
     `-Wconversion -Wshadow -Werror`
   - `-fsyntax-only` may be retained as a fast early gate but must not replace compile/link validation.

5. **Runtime Behavioral Validation**
   - Execute representative generated models and verify initialization, reset, stepping, timers, stateful components, error propagation, and subsystem outputs.

6. **Differential Verification**
   - Run the same model, inputs, and logical timing through:
     - the reference interpreter
     - the compiled generated C
   - Compare observable behavior step-by-step.

7. **Target Qualification**
   - Validate generated C with the actual embedded compiler, ABI, floating-point configuration, and MCU integration environment where production use requires it.

---

## 4. Proposed Approaches & Recommendation

### Approach A: Ad-Hoc Hotfixing (Rejected)
- Patching individual generator template strings when issues arise.
- **Drawback**: High risk of breaking unsupported/untested edge cases, non-deterministic output, and silent symbol mismatches.

### Approach B: Integrated Semantic Symbol Table & Pre-Lowering Pipeline (Recommended)
- Mandate pre-lowering of time, symbols, and owner-state context into the Semantic IR (`XBSemanticModel`) before code generation.
- Enforce strict 7-stage verification gates (AST Symbol Checking + Full Compile & Link Validation Gate + Differential Testing).
- **Core Benefit**: **Provides deterministic generation, enforceable compiler-quality gates, and strong regression protection for currently supported behavior.**
