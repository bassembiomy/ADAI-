# XBridge DELAY Indexed State Lowering and Circular Buffer Code Generation – Technical Design Specification

**Date**: 2026-08-09  
**Status**: APPROVED  
**Target Subsystem**: `src/utils/stateMachine/` (`xbSemanticModel.ts`, `xbSemanticBuilder.ts`, `xbInterpreter.ts`, `xbCGenerator.ts`)

---

## 1. Executive Summary

This design specification fixes the state lowering and C code generation pipeline for multi-sample `DELAY(N)` blocks in XBridge. While history memory buffer allocation was previously introduced, generic state lowering treated history array variables as scalar variables, resulting in invalid C code (e.g. `(double)delay_buffer` or `delay_buffer = input`).

This design introduces explicit `storageCategory` classification (`scalar`, `array`, `matrix`, `integral_index`) across all state lowering, evaluation, snapshotting, and C rendering phases.

---

## 2. Requirements Compliance Matrix

| Requirement ID | Description | Solution / Verification |
|---|---|---|
| **GEN-XB-DELAY-009** | Indexed Delay State Access | `XBSemanticStateSlot` defines `storageCategory: 'array'`; scalar access prohibited. |
| **GEN-XB-DELAY-010** | Current Delayed Sample Read | Output evaluates to `buffer[index * M + m]` strictly. |
| **GEN-XB-DELAY-011** | Current Input History Write | State update writes input $u[k]$ to `buffer[index * M + m]`. |
| **GEN-XB-DELAY-012** | Integral Buffer Index Type | `index` slot uses `{ kind: 'fixed', wordLength: 32, fractionLength: 0, signed: false }` (`uint32_t`). |
| **GEN-XB-DELAY-013** | Index Initialization | `index` initializes deterministically to `0U`. |
| **GEN-XB-DELAY-014** | Circular Index Advancement | `index = (index + 1U) % N` executed once per sample tick. |
| **GEN-XB-DELAY-015** | Read-Before-Write Ordering | Output read occurs in output evaluation phase before state update phase. |
| **GEN-XB-DELAY-016** | Array State Type Preservation | `storageCategory: 'array'` retained through all IR and generator transformations. |
| **GEN-XB-DELAY-017** | Array Snapshot & Rollback | Fault handling snapshots array state using `memcpy(snapshot, buffer, sizeof(snapshot))`. |
| **GEN-XB-DELAY-018** | Indexed Numeric Validation | Finite/range checks dereference `buffer[index * M + m]` instead of array address. |
| **GEN-XB-DELAY-019** | Storage Category Discrimination | Lowering explicitly handles `scalar`, `array`, `matrix`, `integral_index`. |
| **GEN-XB-DELAY-C-005** | Portable C Compilation | Generated C compiles without warnings under strict C11 flags (`-std=c11 -Wall -Wextra -Werror -pedantic`). |
| **GEN-XB-DELAY-C-006** | Structural AST Validation | Validator detects and rejects array address casts or unindexed array assignments. |
| **GEN-XB-DELAY-TEST-008** | C Compilation Test | Verification test compiles generated C artifacts for DELAY($N=2$). |
| **GEN-XB-DELAY-TEST-009** | Buffer Structure Test | Verifies `float buffer[2]; uint32_t index;` struct layout. |
| **GEN-XB-DELAY-TEST-010** | Indexed Access Test | Verifies presence of `buffer[index]` and absence of unindexed `buffer`. |
| **GEN-XB-DELAY-TEST-011** | Reference Sequence Test | Verifies delayed sequence `[-1, -1, 7, 7]` and state progression `[-1, -1] -> [7, -1] -> [7, 7]`. |
| **GEN-XB-DELAY-TEST-012** | Compile Gate Requirement | Host C compilation must pass before claiming PASS status. |

---

## 3. Detailed Technical Architecture

### 3.1 Storage Category Representation (`xbSemanticModel.ts`)

`XBSemanticStateSlot` is extended with a mandatory or inferred `storageCategory`:

```typescript
export type XBStorageCategory = 'scalar' | 'array' | 'matrix' | 'integral_index';

export interface XBSemanticStateSlot {
  readonly id: string;
  readonly role: string;
  readonly signalId: string | null;
  readonly numericType: XBNumericType;
  readonly shape: XBShape;
  readonly initialValues: readonly number[];
  readonly storageCategory?: XBStorageCategory;
}
```

For a `DELAY` operation with delay length $N$ and signal element count $M$:
- **`buffer` slot**: `role: 'buffer'`, `storageCategory: 'array'`, `shape: { kind: 'vector', length: N * M }`, `initialValues: [IC, ..., IC]`.
- **`index` slot**: `role: 'index'`, `storageCategory: 'integral_index'`, `numericType: { kind: 'fixed', wordLength: 32, fractionLength: 0, signed: false }`, `shape: { kind: 'scalar' }`, `initialValues: [0]`.

### 3.2 C Code Generation & AST Rendering (`xbCGenerator.ts`)

#### Output Phase (`read-before-update`):
For signal element $m \in [0, M-1]$:
```c
instance->member.signal_y = instance->member.state_buffer[instance->member.state_index * M + m];
```

#### State Update Phase (`after-direct-feedthrough`):
```c
{
    uint32_t xb_delay_idx = instance->member.state_index;
    for (uint32_t m = 0U; m < M; ++m) {
        instance->member.state_buffer[xb_delay_idx * M + m] = (float)input_element;
    }
    instance->member.state_index = (xb_delay_idx + 1U) % N;
}
```

#### Transactional Snapshot & Rollback:
For `storageCategory: 'array'`:
```c
float snapshot_buffer[N * M];
(void)memcpy(&snapshot_buffer, &instance->member.state_buffer, sizeof(snapshot_buffer));
/* ... perform update ... */
if (fault) {
    (void)memcpy(&instance->member.state_buffer, &snapshot_buffer, sizeof(snapshot_buffer));
}
```

For `storageCategory: 'integral_index'`:
```c
uint32_t snapshot_index = instance->member.state_index;
/* ... perform update ... */
if (fault) {
    instance->member.state_index = snapshot_index;
}
```

### 3.3 Structural AST Validation (`xbCGenerator.ts`)

A structural C validator pass verifies every generated C file string before returning code generation results:
1. Rejects any occurrence of `(double)state_..._buffer` or `(float)state_..._buffer` where the buffer field is accessed without `[...]`.
2. Rejects any direct assignment `instance->member.state_..._buffer = ...`.
3. Verifies that index variables are declared as `uint32_t` or `uint16_t`.

---

## 4. Verification Plan

1. **Unit Tests**:
   - `xbSemanticModel.test.ts`: Verify `storageCategory` assignment on DELAY state boundaries.
   - `xbSemanticBuilder.test.ts`: Verify buffer and index slots created with correct storage categories.
   - `xbInterpreter.test.ts`: Verify multi-sample delay circular buffer state evolution in TS interpreter.
   - `xbCGenerator.test.ts`: Verify generated C source contains `memcpy`, `uint32_t index`, `[index]`, and passes AST structural validation.

2. **Differential & Host Compilation Tests (`smDifferential.test.ts`)**:
   - Compile generated C with host compiler (`gcc` / `clang` / `MSVC`).
   - Run 4 steps of simulation for $N=2, IC=-1, u=7$.
   - Assert exact signal sequence `[-1, -1, 7, 7]` and trace parity between TS interpreter and host C binary.
