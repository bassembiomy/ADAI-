# Automated C-Code Output Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a TypeScript validation script (`scripts/validate_generated_code.ts`) that runs TR-01 to TR-07 checks on the generated C/H files.

**Architecture:** A zero-dependency state-machine parser parses C enums, structs, macros, and function definitions to compare them against the source JSON model. A compiler dry-run option compiles using `gcc` or `avr-gcc` to guarantee syntactic validity.

**Tech Stack:** TypeScript, Node.js, Vitest, C.

## Global Constraints
- Target validation script path: `scripts/validate_generated_code.ts`
- Target test file path: `src/utils/validateGeneratedCode.test.ts`
- Zero external native dependencies (avoid heavy native AST parsers).

---

### Task 1: Create state machine parser helpers for generated C files
**Files:**
- Create: `scripts/validate_generated_code.ts`

- [ ] **Step 1: Write helper to extract enums**
  Implement regex/loop matching to parse enum blocks and return mapped name-value structures:
  ```typescript
  export function parseCEnum(content: string, enumName: string): Map<string, number> {
    const enumRegex = new RegExp(`typedef\\s+enum\\s*\\{([^}]+)\\}\\s*${enumName};`, 'g');
    const match = enumRegex.exec(content);
    const map = new Map<string, number>();
    if (!match) return map;
    const body = match[1];
    let val = 0;
    body.split(',').forEach(item => {
      const parts = item.split('=');
      const name = parts[0].trim();
      if (!name) return;
      if (parts[1]) {
        val = parseInt(parts[1].trim());
      }
      map.set(name, val);
      val++;
    });
    return map;
  }
  ```

- [ ] **Step 2: Write helper to extract structs**
  Implement logic to extract the members of `SM_Data_t`:
  ```typescript
  export function parseCStruct(content: string, structName: string): { type: string; name: string }[] {
    const structRegex = new RegExp(`typedef\\s+struct\\s*\\{([^}]+)\\}\\s*${structName};`, 'g');
    const match = structRegex.exec(content);
    if (!match) return [];
    const body = match[1];
    const members: { type: string; name: string }[] = [];
    const lines = body.split('\n');
    lines.forEach(line => {
      const lineMatch = /^\s*(volatile\s+)?([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+);/.exec(line);
      if (lineMatch) {
        members.push({ type: lineMatch[2], name: lineMatch[3] });
      }
    });
    return members;
  }
  ```

- [ ] **Step 3: Write helper to extract macros**
  Implement extraction of `#define KEY VALUE`:
  ```typescript
  export function parseCMacros(content: string): Map<string, string> {
    const map = new Map<string, string>();
    const macroRegex = /#define\s+([A-Za-z0-9_]+)\s+\(([^)]+)\)/g;
    let match;
    while ((match = macroRegex.exec(content)) !== null) {
      map.set(match[1], match[2].trim());
    }
    const simpleRegex = /#define\s+([A-Za-z0-9_]+)\s+([0-9A-Za-z_]+U?)/g;
    while ((match = simpleRegex.exec(content)) !== null) {
      if (match[1] !== 'SM_CONFIG_H' && match[1] !== 'SM_CORE_H' && match[1] !== 'SM_SAFETY_H' && match[1] !== 'SM_USER_LOGIC_H' && match[1] !== 'MCAL_DIO_H') {
        map.set(match[1], match[2].trim());
      }
    }
    return map;
  }
  ```

---

### Task 2: Implement Validation Tests (TR-01 to TR-07)
**Files:**
- Modify: `scripts/validate_generated_code.ts`

- [ ] **Step 1: Implement TR-01 (Duplicate Content Check)**
  Count occurrences of `#ifndef` guards and verify unique `#define` keys.
- [ ] **Step 2: Implement TR-02 (Enum/Index Alignment)**
  Verify index macros align with actual enum values.
- [ ] **Step 3: Implement TR-03 (Signature Pointer Consistency)**
  Verify pointer parameters (`ADIA_Instance_t*`) for `SM_Init` and actions.
- [ ] **Step 4: Implement TR-04 (Phantom Variable Detection)**
  Set difference between JSON variables and `SM_Data_t` members. Ensure `x` and `state_timer` are not present in `SM_Data_t`.
- [ ] **Step 5: Implement TR-05 (I/O Directionality Check)**
  Verify LHS of read operations are inputs, and arguments of write operations are outputs.
- [ ] **Step 6: Implement TR-06 & TR-07 (Dry-Run Compilation & MCAL Prototypes)**
  Execute compiler dry-run checks and verify called `MCAL_*` prototypes exist in `mcal_dio.h`.

---

### Task 3: Implement CLI Interface and Unit Tests
**Files:**
- Modify: `scripts/validate_generated_code.ts`
- Create: `src/utils/validateGeneratedCode.test.ts`

- [ ] **Step 1: Write CLI parser and reporter**
  Add argument parsing (`--model`, `--output`), and print formatted results to console and save to `test_results.json`.
- [ ] **Step 2: Write unit tests in validateGeneratedCode.test.ts**
  Create a test suite that mocks C file content and asserts that validation correctly flags duplicate content, pointer mismatches, enum alignment errors, and phantom variables.
- [ ] **Step 3: Run Vitest**
  Command: `npx.cmd vitest run src/utils/validateGeneratedCode.test.ts`
