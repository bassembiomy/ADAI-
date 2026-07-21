# Undeclared Variables Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement compile-time and build-time validation that blocks execution and code generation if undeclared variables are referenced in state machine actions or transition expressions.

**Architecture:** Add a regex-based identifier parser inside the code generator validation loop that extracts all variable names, filters out C keywords, built-in variables, and function calls, and matches them against the variable list. Additionally, verify this inside HIL Workspace to block native code compilation if errors are present.

**Tech Stack:** TypeScript, React (useMemo, useState), Electron IPC.

## Global Constraints
- Avoid modifications to compiler setups.
- Block HIL compile actions if `generateMISRACCode` returns validation errors.
- Vitest must be run excluding `.kilo` worktree folders using `--exclude "**/.kilo/**"`.

---

### Task 1: Implement Undeclared Variable Validation in Code Generator

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: `generateMISRACCode` from `src/utils/stateMachineCodeGenerator.ts`.
- Produces: Enhanced `generateMISRACCode` that returns structural errors if undeclared variables are referenced in expressions.

- [ ] **Step 1: Write a failing unit test in test suite**

Add the following unit test case at the end of the `StateMachineCodeGenerator` describe block in `src/utils/stateMachineCodeGenerator.test.ts` (before the final closing braces):

```typescript
  it('should return error if undeclared variables are referenced in expressions', () => {
    const invalidChart = {
      tickMs: 10,
      states: [
        {
          id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
          entry: 'undeclared_var = 10;', during: 'sin(valid_var);', exit: 'if (another_undeclared) { }',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
        }
      ],
      junctions: [],
      transitions: [
        {
          id: 'tr1', sourceId: 's1', targetId: 's1', condition: 'undeclared_in_cond > 5', action: 'undeclared_in_act = 20;', afterTicks: null,
          type: 'condition', hasControlPoint: false, order: 1
        }
      ],
      variables: [
        { id: 'v1', name: 'valid_var', type: 'uint8', initialValue: '0', currentValue: 0, visibleInScope: true }
      ],
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: ['tr1'], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(invalidChart as any);
    expect(result.errors.length).toBe(4);
    
    const messages = result.errors.map(e => e.message);
    expect(messages).toContain("Undeclared variable 'undeclared_var' referenced in state 'StateA' entry action. Add it to the variable panel.");
    expect(messages).toContain("Undeclared variable 'another_undeclared' referenced in state 'StateA' exit action. Add it to the variable panel.");
    expect(messages).toContain("Undeclared variable 'undeclared_in_cond' referenced in transition from 'StateA' condition. Add it to the variable panel.");
    expect(messages).toContain("Undeclared variable 'undeclared_in_act' referenced in transition from 'StateA' action. Add it to the variable panel.");

    // Verify that the valid math function 'sin' and the valid variable 'valid_var' did not trigger any errors
    const hasValidVarError = result.errors.some(e => e.message.includes('valid_var') || e.message.includes('sin'));
    expect(hasValidVarError).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run src/utils/stateMachineCodeGenerator.test.ts --exclude "**/.kilo/**"`
Expected: FAIL with "errors.length is 0" (or similar)

- [ ] **Step 3: Implement the validation code**

Modify `src/utils/stateMachineCodeGenerator.ts` to add the validation rules.
1. Define `IGNORED_IDENTIFIERS` near the top of the file or inside `generateMISRACCode` (e.g., right before validating states around line 495):
```typescript
const IGNORED_IDENTIFIERS = new Set([
  // C Keywords
  'if', 'else', 'true', 'false', 'void', 'int', 'unsigned', 'signed', 'float', 'double', 'bool', 'char',
  'return', 'switch', 'case', 'default', 'break', 'continue', 'struct', 'static', 'const', 'sizeof',
  // C Types
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'size_t',
  // System Variables
  'delta_ms', 'state_timer', 'instance', 'data',
  // Math Functions & Common Macros
  'sin', 'cos', 'tan', 'abs', 'sqrt', 'pow', 'exp', 'log', 'floor', 'ceil', 'fmax', 'fmin', 'fabs', 'NULL',
  // Common Arduino / AVR Registers and Constants
  'PORTB', 'PORTC', 'PORTD', 'PINB', 'PINC', 'PIND', 'DDRB', 'DDRC', 'DDRD', 'HIGH', 'LOW', 'INPUT', 'OUTPUT',
  'MCAL_Dio_ReadChannel', 'MCAL_Dio_WriteChannel', 'MCAL_Watchdog_Kick'
]);
```

2. Add the `validateExpressionVariables` helper function inside `generateMISRACCode`:
```typescript
  const validateExpressionVariables = (code: string, location: string, elementId: string) => {
    if (!code) return;
    
    // Remove comments
    const cleanCode = code
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*/g, ' ');

    // Remove function calls (e.g. funcName(...) -> replaces function name and opening bracket)
    const withoutFunctions = cleanCode.replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*\(/g, ' ');

    // Extract word tokens matching identifiers
    const matches = withoutFunctions.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g);
    for (const m of matches) {
      const ident = m[0];
      if (IGNORED_IDENTIFIERS.has(ident)) {
        continue;
      }
      
      const isDefined = chart.variables.some(v => v.name === ident);
      if (!isDefined) {
        errors.push({
          id: uuidv4(),
          type: 'error',
          message: `Undeclared variable '${ident}' referenced in ${location}. Add it to the variable panel.`,
          timestamp: new Date(),
          source: 'Variable Validator',
          elementId: elementId
        });
      }
    }
  };
```

3. Call the validator function in the state and transition loops inside `generateMISRACCode` (around lines 496 and 506):
```typescript
  // Validate states
  sortedStates.forEach(state => {
    validateExpressionVariables(state.entry, `state '${state.name}' entry action`, state.id);
    validateExpressionVariables(state.during, `state '${state.name}' during action`, state.id);
    validateExpressionVariables(state.exit, `state '${state.name}' exit action`, state.id);
    validateExpressionVariables(state.internalTransitions, `state '${state.name}' internal transitions`, state.id);

    if (/\+\+|--/.test(state.entry + state.during + state.exit)) {
      warnings.push(`[STATE:${state.name}] Avoid ++/-- for MISRA compliance`);
    }
    if (/(?<![=!<>])=(?!=)/.test(state.entry + state.during + state.exit)) {
      warnings.push(`[STATE:${state.name}] Use '==' for comparison, not '='`);
    }
  });

  // Validate transitions
  chart.transitions.forEach(tr => {
    const srcName = sortedStates.find(s => s.id === tr.sourceId)?.name || chart.junctions.find(j => j.id === tr.sourceId)?.name || 'unknown';
    validateExpressionVariables(tr.condition, `transition from '${srcName}' condition`, tr.id);
    validateExpressionVariables(tr.action, `transition from '${srcName}' action`, tr.id);

    if (tr.afterTicks !== null && tr.afterTicks <= 0) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run src/utils/stateMachineCodeGenerator.test.ts --exclude "**/.kilo/**"`
Expected: 27 passed

- [ ] **Step 5: Commit validator implementation**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "feat: add compile-time undeclared variable checking in state machine"
```

---

### Task 2: Halt HIL/Simulation Build on Code Generation Errors

**Files:**
- Modify: `src/components/hil/HILWorkspace.tsx`

**Interfaces:**
- Consumes: `generateMISRACCode` outputs.
- Produces: Halted compile state and descriptive compiler logs output if errors occur.

- [ ] **Step 1: Modify build action to run generator validator**

Open `src/components/hil/HILWorkspace.tsx`. Locate the `handleBuild` function (around line 184). Modify it to invoke `generateMISRACCode` at the start of the build process and check for errors:

```typescript
  // Compile / Build Action
  const handleBuild = async () => {
    if (buildStatus === 'building') return;
    setBuildStatus('building');
    setBurnStatus('idle');
    setConsoleLogs([]);

    const target = config.target || 'Generic';
    const opt = optimization;
    const warn = warningLevel;
    const dbg = debugLevel;

    const timestampStr = new Date().toLocaleString();
    
    // Evaluate the state machine compilation for errors first
    const genRes = generateMISRACCode({
      tickMs,
      states,
      junctions,
      transitions,
      variables,
      layers,
      safetyMode,
      hilConfig: { ...config, enabled: true }
    });

    if (genRes.errors && genRes.errors.length > 0) {
      setConsoleLogs([
        `[SYSTEM] Starting compilation process at ${timestampStr}`,
        `[SYSTEM] Target Device Architecture: ${target} (${memoryLimits.name})`,
        `----------------------------------------------------------------------`,
        ...genRes.errors.map(err => `[ERROR] ${err.source || 'Validator'}: ${err.message}`),
        `----------------------------------------------------------------------`,
        `[SYSTEM] Compilation process aborted: State machine has validation errors.`
      ]);
      setBuildStatus('error');
      return;
    }

    setConsoleLogs([
      `[SYSTEM] Starting compilation process at ${timestampStr}`,
      `[SYSTEM] Target Device Architecture: ${target} (${memoryLimits.name})`,
      `[SYSTEM] Optimization Flags: ${opt}`,
      `[SYSTEM] Warnings configuration: ${warn}`,
      `[SYSTEM] Code generator version: ADIA Professional Suite v3.2`,
      `----------------------------------------------------------------------`,
      `[EXPORT] Saving auto-generated HAL files into local workspace folder '/hil_build'...`
    ]);
```

- [ ] **Step 2: Run all core tests to verify no compilation/linking breakages**

Run: `npx.cmd vitest run src/ --exclude "**/.kilo/**"`
Expected: 499 passed (all tests pass)

- [ ] **Step 3: Commit build runner change**

```bash
git add src/components/hil/HILWorkspace.tsx
git commit -m "feat: halt compilation build in HILWorkspace on code generation errors"
```
