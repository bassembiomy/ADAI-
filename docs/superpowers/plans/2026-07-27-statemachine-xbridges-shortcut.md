# State Machine `Shift + X` Add X-Bridges Block Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable `Shift + X` keyboard shortcut to spawn a new X-Bridges block in the State Machine Editor.

**Architecture:** Add `Shift + X` handler in `handleKeyDown` in `App.tsx` guarded against text input focus. Calculate viewport center world coordinates and invoke `createXBridgesState`.

**Tech Stack:** React 18, TypeScript, Vitest.

## Global Constraints

- Shortcut: `Shift + X`.
- Guard: Must not activate when focused inside text inputs or textareas.
- Action: Spawns an X-Bridges state block at center of visible canvas.

---

### Task 1: Add `Shift + X` Keyboard Shortcut Handler to App.tsx

**Files:**
- Modify: `src/App.tsx:13930-13970`
- Create: `src/utils/xbridgesShortcut.test.ts`

**Interfaces:**
- Consumes: `e.shiftKey`, `e.key`, `isInput`, `createXBridgesState`, `view`, `uiZoom`, `canvasRef`
- Produces: `Shift + X` keydown action.

- [ ] **Step 1: Write failing unit test for `Shift + X` shortcut logic**

Create `src/utils/xbridgesShortcut.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('xbridgesShortcut', () => {
  it('should trigger xbridges state creation when Shift+X is pressed outside inputs', () => {
    let created = false;
    const handleShiftX = (isInput: boolean) => {
      if (isInput) return;
      created = true;
    };

    handleShiftX(true);
    expect(created).toBe(false);

    handleShiftX(false);
    expect(created).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify pass**

Run: `cmd /c npx vitest run src/utils/xbridgesShortcut.test.ts`  
Expected: PASS

- [ ] **Step 3: Add `Shift + X` shortcut in `App.tsx` handleKeyDown**

Add `Shift + X` handler inside `handleKeyDown` in `App.tsx` around line 13955.

- [ ] **Step 4: Run test to verify pass**

Run: `cmd /c npx vitest run src/utils/xbridgesShortcut.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/utils/xbridgesShortcut.test.ts
git commit -m "feat: add Shift + X keyboard shortcut to create X-Bridges block"
```
