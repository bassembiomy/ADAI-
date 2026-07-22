# 🚀 Project Zero-G: Antigravity Agent Design Specification
**Date:** 2026-07-22  
**Target System:** ADIA Embedded C State Machine Generator & CI/CD Pipeline  
**Codename:** Project Zero-G  

---

## 1. Executive Summary & Principles

The **Antigravity Agent** is an autonomous middleware engine designed to sit between the TypeScript code generator (`stateMachineCodeGenerator.ts`) and C compiler/disk targets. It ensures that state machine code generated for embedded C targets compiles cleanly on the first try with 0 errors and 0 warnings, eliminating manual C debugging for missing pointer asterisks, malformed block comments, or mismatched function prototypes.

### Core Directives ("Zero-G" Principles)
1. **The "No-Read" Guarantee**: The user never has to read generated C code to verify syntax validity; the Agent handles all syntax checks and AST corrections.
2. **Gravity is a Syntax Error**: Any code failing host compiler dry-run validation (`gcc -fsyntax-only`) is considered "pulled down by gravity" and must be auto-corrected in memory before delivery.
3. **Deterministic AST over Probabilistic Guessing**: Structural syntax rules are enforced using deterministic Abstract Syntax Tree (AST) node parsing and node replacement (via Tree-Sitter / TypeScript C parser helpers).

---

## 2. System Architecture & Components

The engine is implemented as a modular TypeScript package under `src/utils/antigravity/`:

```
src/utils/antigravity/
├── pointerShield.ts      # Enforces NO_POINTER_STRIP rule on ADIA_Instance_t types
├── commentSanitizer.ts   # Enforces COMMENT_SHIELD rule for C block comments
├── headerSync.ts         # Enforces HEADER_SYNC & RETURN_TYPE_SANITY rules
├── phantomPurge.ts       # Enforces PHANTOM_PURGE against JSON input model
├── mcalMockGen.ts        # Auto-generates mock mcal_dio.h stubs for dry-run compilation
├── orbitalValidator.ts   # Tier-1 (GCC dry-run) & Tier-2 (AST rule scan) engine
├── reentryEngine.ts      # Self-healing engine with up to 3 retry loops & diff logger
├── antigravityRunner.ts  # Master entry point emitting real-time pipeline status
└── index.ts              # Package exports
```

---

## 3. Anti-Gravity Protocols (Pre-Flight Interception)

Pre-Flight protocols analyze and repair raw in-memory C strings before dry-run compilation:

### Protocol 1: `NO_POINTER_STRIP` (`pointerShield.ts`)
* **Trigger**: Parameter declaration node matching `TypeIdentifier == "ADIA_Instance_t"` or `"const ADIA_Instance_t"`.
* **Fix**:
  1. Inject pointer asterisk `*` immediately after the type specifier (e.g. `ADIA_Instance_t* instance`).
  2. Parse function body AST nodes; replace value member access `instance.` with pointer member access `instance->`.

### Protocol 2: `COMMENT_SHIELD` (`commentSanitizer.ts`)
* **Trigger**: Malformed block comments (e.g. `/ MISRA 15.7 /` or unclosed `/* text`).
* **Fix**: Normalize all single-slash or unclosed comments to valid C block comments (`/* text */`).

### Protocol 3: `RETURN_TYPE_SANITY` (`headerSync.ts`)
* **Trigger**: Function returning a non-pointer struct type (`SM_Data_t`) while attempting to return `NULL` or pointer `&instance->data`.
* **Fix**: Synchronize return type in both `.h` and `.c` files to `const SM_Data_t*`.

### Protocol 4: `HEADER_SYNC` (`headerSync.ts`)
* **Trigger**: Parameter type or pointer modifier mismatch between `.h` function prototype and `.c` definition.
* **Fix**: Force 1:1 signature synchronization across `.h` and `.c`, treating C definition as source-of-truth.

### Protocol 5: `PHANTOM_PURGE` (`phantomPurge.ts`)
* **Trigger**: Structural struct member in `SM_Data_t` not defined in the JSON input model.
* **Fix**: Purge unmapped phantom variables unless reserved as engine internal variables (`current_state`, `previous_state`, `state_timer`).

---

## 4. Multi-Tier Orbital Validation & Mock MCAL Injection

Before invoking host compilers, `orbitalValidator.ts` sets up a isolated temporary workspace.

### Mock MCAL Injection (`mcalMockGen.ts`)
Creates a standard mock `mcal_dio.h` header containing static inline C stubs:
```c
#ifndef MCAL_DIO_H
#define MCAL_DIO_H
#include <stdint.h>
#include <stdbool.h>

static inline bool MCAL_Dio_ReadChannel(uint32_t channel) { (void)channel; return false; }
static inline void MCAL_Dio_WriteChannel(uint32_t channel, bool val) { (void)channel; (void)val; }
static inline void MCAL_Watchdog_Kick(void) {}
static inline uint32_t MCAL_Timer_GetMs(void) { return 0U; }
#endif
```

### Validation Tiers:
* **Tier 1 (Host Compiler Ground Truth)**: Executes `gcc -fsyntax-only -I<temp_dir> *.c` (or `clang` if available).
* **Tier 2 (AST Rule Safety Net)**: Runs offline TS/AST checks (extending `scripts/validate_generated_code.ts`) when host compilers are absent or as a fast pre-lint.

---

## 5. Re-Entry Self-Healing & Template Diff Logger

If Orbital Validation throws compilation errors:

```
[GCC Compiler Error / AST Issue]
       │
       ▼
[Parse Line/Column & GCC Message]
       │
       ▼
[Tree-Sitter AST Node Replacement] (In-memory structural repair)
       │
       ▼
[Increment Re-entry Loop Counter (Max 3)]
       │
       ├── Loop <= 3: Re-run Orbital Dry-Run
       └── Loop > 3: Abort with ☄️ Re-entry Failed Status
```

### Generator Diff Logger
Upon success, the engine logs the exact patch details to `antigravity_patches.diff`:
```diff
# Antigravity Patch Report - 2026-07-22
# Target Generator: src/utils/stateMachineCodeGenerator.ts
--- sm_safety.c (Line 38)
+++ sm_safety.c (Auto-Fixed)
- void SM_Safety_Check(ADIA_Instance_t instance)
+ void SM_Safety_Check(ADIA_Instance_t* instance)
# Reason: GCC reported 'invalid type argument of ->'. Pointer asterisk required in generator template string.
```

---

## 6. User Interface & CI/CD Tooling

### 1. Vibe Dashboard (`src/components/VibeDashboard.tsx`)
Displays an interactive status orb with four distinct states:
* 🌑 **Generating...** (Parsing JSON model)
* 🌗 **Orbiting...** (Executing AST pre-flight & GCC dry-run)
* 🌕 **Zero-G (Ready to Flash)** (0 errors, code verified)
* ☄️ **Re-Entry... (Attempt X/3)** (Self-healing in progress)

### 2. "Explain the Vibe" Toggle (`src/components/VibeExplanationModal.tsx`)
Highlights auto-fixed C lines in green with annotations explaining the bug and presenting the `antigravity_patches.diff` report.

### 3. One-Click Hardware Sync (`src/components/HardwareSyncModal.tsx`)
Maps JSON I/O metadata to physical MCU channels. Strictly modifies `mcal_dio.h` or `hardware_mapping.h` inside user blocks; never mutates engine files (`sm_core.c`, `sm_config.h`).

### 4. CLI / CI Pipeline (`scripts/zero_g_ci.ts`)
* Command: `npm run zero-g -- --model=path/to/model.json --outDir=./dist/c_out`
* Generates downloadable `antigravity_patches.diff` artifact formatted for GitHub Actions (`actions/upload-artifact`).
* Returns `exit code 0` on Zero-G success, `exit code 1` on failure.

---

## 7. Verification & Acceptance Criteria

1. **Automated Unit Tests (`src/utils/antigravity/antigravity.test.ts`)**:
   - Verify `NO_POINTER_STRIP` correctly handles `ADIA_Instance_t` parameter declarations.
   - Verify `COMMENT_SHIELD` normalizes unclosed and single-slash comments.
   - Verify `mcalMockGen.ts` produces valid GCC-compilable header stubs.
   - Verify `reentryEngine.ts` auto-fixes generated C code within 3 loops.
2. **GCC Integration Test**:
   - Run `antigravityRunner.ts` against generated test state machines and assert `gcc -fsyntax-only` passes cleanly.
