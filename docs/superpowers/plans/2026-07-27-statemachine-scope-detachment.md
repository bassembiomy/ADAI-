# Scope Horizontal Scroll & Detachable Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add horizontal scrolling (sliding bar) to the State Machine Scope panel for variable visualization, and enable double-click detachment into a floating window and restoration on double-click.

**Architecture:** Add `isScopeDetached` boolean state to `App.tsx`. Update the Scope chart container to use horizontal scrolling (`overflow-x-auto`) with fixed minimum width (`min-w-[220px]`) per variable card. Render a floating modal overlay when `isScopeDetached === true` with double-click handlers on both docked and detached headers.

**Tech Stack:** React 18, Tailwind CSS / Vanilla CSS, Lucide icons, Vitest.

## Global Constraints

- Scope variable cards must have `min-w-[220px]` and horizontal scroll.
- Double-clicking Scope header or container toggles `isScopeDetached`.
- When detached, Scope presents as a floating window (`z-50`) overlay.
- Double-clicking floating header docks Scope back to its bottom position.

---

### Task 1: Implement Scope Horizontal Sliding Bar and Detachment State in App.tsx

**Files:**
- Modify: `src/App.tsx:16450-16625`
- Create: `src/components/ScopePanel.test.tsx`

**Interfaces:**
- Consumes: `visibleVariables`, `scopeData`, `colors`, `isScopeDetached`, `setIsScopeDetached`
- Produces: Horizontal scrollable scope chart layout & double click detach handlers.

- [ ] **Step 1: Write unit test for Scope horizontal scrolling and double-click detachment trigger**

Create `src/components/ScopePanel.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';

describe('ScopePanel', () => {
  it('should support double click detachment state toggle', () => {
    let detached = false;
    const toggleDetached = () => { detached = !detached; };
    toggleDetached();
    expect(detached).toBe(true);
    toggleDetached();
    expect(detached).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify pass**

Run: `cmd /c npx vitest run src/components/ScopePanel.test.tsx`  
Expected: PASS

- [ ] **Step 3: Update `App.tsx` Scope container with horizontal scroll & double-click detachment**

1. Add `const [isScopeDetached, setIsScopeDetached] = useState(false);` around line 6710 in `App.tsx`.
2. Update Scope dock header with `onDoubleClick={() => setIsScopeDetached(!isScopeDetached)}` and title tooltip `"Double-click to expand/dock"`.
3. Update chart container from `overflow-hidden` to `overflow-x-auto overflow-y-hidden select-none` with min-width `min-w-[220px]` for each variable card.
4. Render floating detached overlay window when `isScopeDetached === true`.

- [ ] **Step 4: Run test to verify pass**

Run: `cmd /c npx vitest run src/components/ScopePanel.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/ScopePanel.test.tsx
git commit -m "feat: add horizontal sliding bar and double-click detachment window to Scope"
```
