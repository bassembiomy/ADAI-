# State Machine `Shift + C` Connect Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable `Shift + C` keyboard shortcut to toggle Connect mode in the State Machine Editor.

**Architecture:** Add `Shift + C` handler in `handleKeyDown` in `App.tsx` guarded against text input focus. Toggle `isCreatingTransition` / `isCreatingConnector` and update source IDs accordingly.

**Tech Stack:** React 18, TypeScript, Vitest.

## Global Constraints

- Shortcut: `Shift + C`.
- Guard: Must not activate when focused inside text inputs or textareas.
- Action: Toggle transition creation mode in statemachine diagram mode or connector creation mode in IBD diagram mode.

---

### Task 1: Add `Shift + C` Keyboard Shortcut Handler to App.tsx

**Files:**
- Modify: `src/App.tsx:13910-13985`
- Create: `src/utils/connectShortcut.test.ts`

**Interfaces:**
- Consumes: `e.shiftKey`, `e.key`, `isInput`, `diagramMode`, `setIsCreatingTransition`, `setIsCreatingConnector`
- Produces: `Shift + C` keydown action.

- [ ] **Step 1: Write failing unit test for `Shift + C` shortcut logic**

Create `src/utils/connectShortcut.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('connectShortcut', () => {
  it('should toggle connect mode state when Shift+C is pressed outside inputs', () => {
    let isCreatingTransition = false;
    let transitionSourceId: string | null = 's1';

    const handleShiftC = (isInput: boolean) => {
      if (isInput) return;
      isCreatingTransition = !isCreatingTransition;
      if (!isCreatingTransition) transitionSourceId = null;
    };

    handleShiftC(false);
    expect(isCreatingTransition).toBe(true);

    handleShiftC(false);
    expect(isCreatingTransition).toBe(false);
    expect(transitionSourceId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify pass**

Run: `cmd /c npx vitest run src/utils/connectShortcut.test.ts`  
Expected: PASS

- [ ] **Step 3: Add `Shift + C` shortcut in `App.tsx` handleKeyDown**

Add `Shift + C` handler inside `handleKeyDown` in `App.tsx` around line 13930.

- [ ] **Step 4: Run test to verify pass**

Run: `cmd /c npx vitest run src/utils/connectShortcut.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/utils/connectShortcut.test.ts
git commit -m "feat: add Shift + C keyboard shortcut for Connect mode"
```
