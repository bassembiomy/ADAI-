# Simulation Undeclared Variables Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the code generator variable checker into the main validation loop of `App.tsx` so that launching state machine simulation or generating code is automatically blocked with a pop-up error dialog when undeclared variables are used.

**Architecture:** Call `generateMISRACCode` inside the `performValidation` callback of `src/App.tsx` and merge the errors into `newErrors`.

---

### Task 1: Add Code Generator Validation to Model Verification in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement validation checks inside performValidation**

Open `src/App.tsx`. Locate the `performValidation` function body. Before the `setErrors` call (around line 8904), inject the code generator call:

```typescript
    // Run the code generator checks to catch undeclared variables and safety constraints
    const genRes = generateMISRACCode({
      tickMs,
      states,
      junctions,
      transitions,
      variables,
      layers,
      safetyMode,
      hilConfig: { ...hilConfig, enabled: false }
    });
    if (genRes.errors && genRes.errors.length > 0) {
      newErrors.push(...genRes.errors);
    }
```

- [ ] **Step 2: Update dependency array of performValidation**

Locate the dependency array of the `performValidation` `useCallback` (around line 8911) and update it to include `tickMs` and `safetyMode`:

```typescript
  }, [states, transitions, junctions, variables, layers, hilConfig, tickMs, safetyMode]);
```

- [ ] **Step 3: Run all core tests to verify no regressions**

Run: `npx.cmd vitest run src/ --exclude "**/.kilo/**"`
Expected: 499 passed

- [ ] **Step 4: Commit App.tsx changes**

```bash
git add src/App.tsx
git commit -m "feat: block simulation and code generation in App.tsx on undeclared variable errors"
```
