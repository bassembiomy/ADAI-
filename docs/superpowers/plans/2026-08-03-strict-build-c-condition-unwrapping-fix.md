# Strict Build C Condition Unwrapping & Guard Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate extra outer parentheses in generated C transition conditions so `-Wall -Wextra -Wpedantic -Werror` builds pass without `-Wparentheses-equality` warnings, reject `=` assignment operators in guards, and add golden tests for condition rendering.

**Architecture:**
1. `smCExpressions.ts`: Add helper functions `outerParenthesesWrapWholeExpression(expression: string): boolean` and `unwrapTopLevelCondition(expression: string): string` to strip redundant top-level outer parentheses from condition expressions.
2. `smCGenerator.ts`: Apply `unwrapTopLevelCondition` in `renderRouteEnabled` and junction path condition rendering so `if (${condition})` produces `if (instance->data.x == 1)` for simple equality and `if ((instance->data.x == 1) && (instance->data.y == 2))` for compound expressions.
3. `smSemanticValidator.ts`: Add explicit guard validation to disallow assignment operator `=` in condition expressions with a clear diagnostic message (`GUARD_ASSIGNMENT_DISALLOWED`).
4. `smCGenerator.test.ts`: Add golden unit tests for conditions `x == 1`, `x != 1`, `x >= 1`, `x == 1 && y == 2`, `(x == 1 || y == 2) && z != 0`, and `!enabled`.

**Tech Stack:** TypeScript, Node.js, Vitest, C99/C11 GCC/Clang code generator.

## Global Constraints

- **Strict C Compliance:** Generated C output MUST compile cleanly under `gcc -std=c99 -Wall -Wextra -Wpedantic -Werror` and `clang -std=c11 -Wall -Wextra -Wpedantic -Werror`.
- **Zero Syntax Alteration:** Complex grouping in compound conditions `(x == 1 || y == 2) && z != 0` MUST be preserved.

---

### Task 1: Implement `unwrapTopLevelCondition` Helper in `smCExpressions.ts`

**Files:**
- Modify: `src/utils/stateMachine/smCExpressions.ts`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Consumes: `expression: string`
- Produces: `outerParenthesesWrapWholeExpression(expression: string): boolean`, `unwrapTopLevelCondition(expression: string): string`

- [ ] **Step 1: Write failing unit test for `unwrapTopLevelCondition` in `smCGenerator.test.ts`**

```typescript
describe('unwrapTopLevelCondition', () => {
  it('unwraps single top-level outer parentheses around simple equality', () => {
    expect(unwrapTopLevelCondition('(instance->data.x == 1)')).toBe('instance->data.x == 1');
    expect(unwrapTopLevelCondition('((instance->data.x == 1))')).toBe('instance->data.x == 1');
  });

  it('preserves inner grouping in compound expressions', () => {
    expect(unwrapTopLevelCondition('(instance->data.x == 1) && (instance->data.y == 2)'))
      .toBe('(instance->data.x == 1) && (instance->data.y == 2)');
    expect(unwrapTopLevelCondition('(x == 1 || y == 2) && z != 0'))
      .toBe('(x == 1 || y == 2) && z != 0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "unwrapTopLevelCondition"`
Expected: FAIL (function undefined)

- [ ] **Step 3: Implement `outerParenthesesWrapWholeExpression` and `unwrapTopLevelCondition` in `smCExpressions.ts`**

```typescript
export function outerParenthesesWrapWholeExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0 && i < trimmed.length - 1) {
        return false;
      }
    }
  }
  return depth === 0;
}

export function unwrapTopLevelCondition(expression: string): string {
  let value = expression.trim();
  while (
    value.startsWith('(') &&
    value.endsWith(')') &&
    outerParenthesesWrapWholeExpression(value)
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "unwrapTopLevelCondition"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCExpressions.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(generator): add unwrapTopLevelCondition helper for C condition rendering"
```

---

### Task 2: Apply `unwrapTopLevelCondition` in `smCGenerator.ts` & Add Golden Tests

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts:186-195`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Consumes: `unwrapTopLevelCondition` from `smCExpressions.ts`
- Produces: Unwrapped condition strings for `if (${condition})` in C code generation

- [ ] **Step 1: Write failing golden tests in `smCGenerator.test.ts`**

```typescript
describe('Golden C Condition Formatting', () => {
  it('renders simple equality as "if (instance->data.x == 1)" without extra parentheses', () => {
    // Test x == 1, x != 1, x >= 1, x == 1 && y == 2, (x == 1 || y == 2) && z != 0, !enabled
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "Golden C Condition Formatting"`
Expected: FAIL (extra parentheses present)

- [ ] **Step 3: Update `renderRouteEnabled` in `smCGenerator.ts`**

```typescript
const renderRouteEnabled = (
  ir: SemanticModel,
  route: SemanticTransitionRoute,
  timerStateId: string,
): string => {
  const conds = route.transitionIds.map((transitionId) =>
    renderTransitionEnabled(ir, ir.transitions[transitionId], timerStateId));
  if (conds.length === 1) return unwrapTopLevelCondition(conds[0]);
  return conds.map((condition) => `(${unwrapTopLevelCondition(condition)})`).join(' && ');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "Golden C Condition Formatting"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "fix(generator): eliminate extra outer parentheses in C condition guards"
```

---

### Task 3: Disallow Assignment `=` Operators in Guard Validation in `smSemanticValidator.ts`

**Files:**
- Modify: `src/utils/stateMachine/smSemanticValidator.ts`
- Test: `src/utils/stateMachine/smSemanticValidator.test.ts`

**Interfaces:**
- Consumes: Guard condition string in transitions
- Produces: Diagnostic error `GUARD_ASSIGNMENT_DISALLOWED` if `=` assignment is used in a guard condition

- [ ] **Step 1: Write failing unit test in `smSemanticValidator.test.ts`**

```typescript
it('rejects assignment operator = in guard condition', () => {
  // Test transition with condition "x = 1"
  // Expect diagnostic GUARD_ASSIGNMENT_DISALLOWED or syntax error disallowing assignment in guard
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smSemanticValidator.test.ts -t "assignment"`
Expected: FAIL

- [ ] **Step 3: Implement Guard Assignment Disallow Check in `smSemanticValidator.ts`**

In `src/utils/stateMachine/smSemanticValidator.ts`:
Check transition condition string before parsing. If condition contains assignment operator `=` (not part of `==`, `!=`, `<=`, `>=`), flag diagnostic:

```typescript
if (/\b[^=!<>]=\s*[^=]/.test(transition.condition)) {
  diagnostics.push(diagnostic(
    'GUARD_ASSIGNMENT_DISALLOWED',
    `Guard on '${transition.id}' contains assignment operator '='. Assignments are forbidden in guard conditions; use '==' for equality comparison.`,
    transition.id,
  ));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smSemanticValidator.test.ts -t "assignment"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smSemanticValidator.ts src/utils/stateMachine/smSemanticValidator.test.ts
git commit -m "feat(validator): disallow assignment operator '=' in transition guard conditions"
```
