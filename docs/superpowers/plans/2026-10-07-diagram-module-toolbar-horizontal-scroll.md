# Diagram & Module Action Toolbar Horizontal Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable responsive horizontal scrolling with a custom sleek scrollbar and mouse-wheel support on action toolbars under the tabs across all diagram views and engineering modules.

**Architecture:** Add a dedicated `.adia-toolbar-scrollbar` CSS utility token in `src/index.css`, a reusable `handleHorizontalToolbarWheel` helper in `src/utils/toolbarScroll.ts`, and update the canvas floating toolbar (`src/App.tsx`), SysML workspace headers (`UseCaseWorkspace`, `ActivityWorkspace`, `SequenceWorkspace`), and simulation modules (`XbridgesWorkspace`, `VLabWorkspace`, `HILWorkspace`, `PlantUmlWorkspace`) with max-width bounding, `overflow-x-auto`, `shrink-0` protection, and wheel scrolling.

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Vitest.

## Global Constraints
- Do not remove or alter existing button action logic, IDs, or `data-help-feature` attributes.
- Ensure all toolbar buttons retain their intrinsic dimensions with `shrink-0`.
- Maintain dark theme aesthetics with ADIA brand orange (`#f97316`) on hover/scroll.
- Support standard mouse wheel vertical-to-horizontal scrolling translation without breaking touch gestures or keyboard navigation.

---

### Task 1: CSS Scrollbar Utility & Wheel Scroll Helper

**Files:**
- Create: `src/utils/toolbarScroll.ts`
- Create: `src/utils/toolbarScroll.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `handleHorizontalToolbarWheel(event: React.WheelEvent<HTMLElement>): void`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/toolbarScroll.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleHorizontalToolbarWheel } from './toolbarScroll';

describe('handleHorizontalToolbarWheel', () => {
  it('translates vertical deltaY into horizontal scrollLeft when content overflows', () => {
    const element = {
      scrollWidth: 1000,
      clientWidth: 500,
      scrollLeft: 50,
    } as HTMLElement;

    const preventDefault = vi.fn();
    const event = {
      currentTarget: element,
      deltaY: 100,
      preventDefault,
    } as unknown as React.WheelEvent<HTMLElement>;

    handleHorizontalToolbarWheel(event);

    expect(element.scrollLeft).toBe(150);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('does nothing and does not prevent default when content does not overflow', () => {
    const element = {
      scrollWidth: 400,
      clientWidth: 500,
      scrollLeft: 0,
    } as HTMLElement;

    const preventDefault = vi.fn();
    const event = {
      currentTarget: element,
      deltaY: 100,
      preventDefault,
    } as unknown as React.WheelEvent<HTMLElement>;

    handleHorizontalToolbarWheel(event);

    expect(element.scrollLeft).toBe(0);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/toolbarScroll.test.ts`
Expected: FAIL with "Cannot find module './toolbarScroll'"

- [ ] **Step 3: Implement `handleHorizontalToolbarWheel` and CSS utility**

```typescript
// src/utils/toolbarScroll.ts
import type React from 'react';

export function handleHorizontalToolbarWheel(event: React.WheelEvent<HTMLElement>): void {
  const container = event.currentTarget;
  if (!container) return;

  const canScrollHorizontally = container.scrollWidth > container.clientWidth;
  if (!canScrollHorizontally) return;

  if (event.deltaY !== 0) {
    event.preventDefault();
    container.scrollLeft += event.deltaY;
  }
}
```

Add CSS class in `src/index.css`:
```css
/* Custom slim horizontal scrollbar for diagram action toolbars */
.adia-toolbar-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.adia-toolbar-scrollbar::-webkit-scrollbar {
  height: 4px;
}

.adia-toolbar-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 9999px;
}

.adia-toolbar-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  transition: background-color 0.2s ease;
}

.adia-toolbar-scrollbar:hover::-webkit-scrollbar-thumb,
.adia-toolbar-scrollbar:focus-within::-webkit-scrollbar-thumb {
  background: rgba(249, 115, 22, 0.75);
}

.adia-toolbar-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #f97316;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/toolbarScroll.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/toolbarScroll.ts src/utils/toolbarScroll.test.ts src/index.css
git commit -m "feat(ui): add horizontal toolbar wheel handler and adia-toolbar-scrollbar CSS utility"
```

---

### Task 2: Floating Canvas Toolbar Horizontal Scroll in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx:17967`
- Create: `src/components/canvasToolbarScroll.test.ts`

**Interfaces:**
- Consumes: `handleHorizontalToolbarWheel` from `src/utils/toolbarScroll`
- Updates: Canvas toolbar element in `src/App.tsx` to include `max-w-[calc(100%-1.5rem)]`, `overflow-x-auto`, `adia-toolbar-scrollbar`, `onWheel={handleHorizontalToolbarWheel}`, and `shrink-0` on children.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/canvasToolbarScroll.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Canvas Toolbar Scroll Configuration in App.tsx', () => {
  it('includes max-w, overflow-x-auto, adia-toolbar-scrollbar, and onWheel', () => {
    const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    
    expect(appContent).toContain('adia-toolbar-scrollbar');
    expect(appContent).toContain('handleHorizontalToolbarWheel');
    expect(appContent).toMatch(/className="[^"]*max-w-\[calc\(100%-1\.5rem\)\][^"]*overflow-x-auto[^"]*"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canvasToolbarScroll.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/App.tsx`**

1. Import `handleHorizontalToolbarWheel` at top of `src/App.tsx`:
```typescript
import { handleHorizontalToolbarWheel } from './utils/toolbarScroll';
```

2. Update Canvas Toolbar container around line 17967:
```tsx
              {/* Canvas Toolbar */}
              <div
                onWheel={handleHorizontalToolbarWheel}
                className="absolute top-3 left-3 z-10 flex items-center gap-2 max-w-[calc(100%-1.5rem)] overflow-x-auto overflow-y-hidden adia-toolbar-scrollbar bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5 pb-2 text-xs select-none shadow-lg"
              >
```

3. Ensure children inside the toolbar (layer breadcrumb, state machine buttons, requirements buttons, BDD buttons, connect button, separators, grid, snap, zoom controls) have `shrink-0` to prevent compression.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/canvasToolbarScroll.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/canvasToolbarScroll.test.ts
git commit -m "feat(canvas): enable horizontal scrolling on canvas floating toolbar in App.tsx"
```

---

### Task 3: SysML Workspaces Header Horizontal Scroll (`UseCaseWorkspace`, `ActivityWorkspace`, `SequenceWorkspace`)

**Files:**
- Modify: `src/components/sysml/UseCaseWorkspace.tsx`
- Modify: `src/components/sysml/ActivityWorkspace.tsx`
- Modify: `src/components/sysml/SequenceWorkspace.tsx`

**Interfaces:**
- Consumes: `handleHorizontalToolbarWheel` from `src/utils/toolbarScroll`
- Updates: Headers in `UseCaseWorkspace`, `ActivityWorkspace`, and `SequenceWorkspace` to add `overflow-x-auto`, `adia-toolbar-scrollbar`, and `onWheel`.

- [ ] **Step 1: Write verification test for SysML workspaces**

```typescript
// src/components/sysml/sysmlWorkspaceToolbarScroll.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('SysML Workspaces Toolbar Scroll parity', () => {
  const workspaces = [
    'src/components/sysml/UseCaseWorkspace.tsx',
    'src/components/sysml/ActivityWorkspace.tsx',
    'src/components/sysml/SequenceWorkspace.tsx',
  ];

  for (const relPath of workspaces) {
    it(`${relPath} includes adia-toolbar-scrollbar and overflow-x-auto in header`, () => {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
      expect(content).toContain('adia-toolbar-scrollbar');
      expect(content).toContain('overflow-x-auto');
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/sysml/sysmlWorkspaceToolbarScroll.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `UseCaseWorkspace.tsx`, `ActivityWorkspace.tsx`, and `SequenceWorkspace.tsx`**

In each workspace:
1. Import `handleHorizontalToolbarWheel` from `../../utils/toolbarScroll`.
2. Update `<header>` to include `overflow-x-auto overflow-y-hidden adia-toolbar-scrollbar flex-nowrap` with `onWheel={handleHorizontalToolbarWheel}`, and add `shrink-0` to toolbars, titles, and select elements.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/sysml/sysmlWorkspaceToolbarScroll.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sysml/UseCaseWorkspace.tsx src/components/sysml/ActivityWorkspace.tsx src/components/sysml/SequenceWorkspace.tsx src/components/sysml/sysmlWorkspaceToolbarScroll.test.ts
git commit -m "feat(sysml): enable horizontal toolbar scroll in UseCase, Activity, and Sequence workspaces"
```

---

### Task 4: Simulation & Studio Modules (`XbridgesWorkspace`, `VLabWorkspace`, `HILWorkspace`, `PlantUmlWorkspace`)

**Files:**
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx`
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Modify: `src/components/hil/HILWorkspace.tsx`
- Modify: `src/components/plantuml/PlantUmlWorkspace.tsx`

**Interfaces:**
- Consumes: `handleHorizontalToolbarWheel` from `../../utils/toolbarScroll`
- Updates: Top control bars to include `overflow-x-auto`, `adia-toolbar-scrollbar`, and `shrink-0`.

- [ ] **Step 1: Write test for Simulation & Studio Modules**

```typescript
// src/components/moduleToolbarScroll.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Module Workspaces Toolbar Scroll parity', () => {
  const workspaces = [
    'src/components/xbridges/XbridgesWorkspace.tsx',
    'src/components/vlab/VLabWorkspace.tsx',
    'src/components/hil/HILWorkspace.tsx',
    'src/components/plantuml/PlantUmlWorkspace.tsx',
  ];

  for (const relPath of workspaces) {
    it(`${relPath} includes adia-toolbar-scrollbar and overflow-x-auto`, () => {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
      expect(content).toContain('adia-toolbar-scrollbar');
      expect(content).toContain('overflow-x-auto');
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/moduleToolbarScroll.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `XbridgesWorkspace.tsx`, `VLabWorkspace.tsx`, `HILWorkspace.tsx`, and `PlantUmlWorkspace.tsx`**

1. Import `handleHorizontalToolbarWheel`.
2. Add `overflow-x-auto adia-toolbar-scrollbar` and `onWheel={handleHorizontalToolbarWheel}` to the control bars, with `shrink-0` on children.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/moduleToolbarScroll.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/xbridges/XbridgesWorkspace.tsx src/components/vlab/VLabWorkspace.tsx src/components/hil/HILWorkspace.tsx src/components/plantuml/PlantUmlWorkspace.tsx src/components/moduleToolbarScroll.test.ts
git commit -m "feat(modules): enable horizontal toolbar scroll across X-Bridges, V-Lab, HIL, and PlantUML"
```

---

### Task 5: Full Regression Testing & Verification

**Files:**
- Test: All new tests and existing test suite

- [ ] **Step 1: Run all unit and integration tests**

Run: `npm test`
Expected: PASS all test suites.

- [ ] **Step 2: Verify in browser**

Verify the Requirements Diagram, SysML BDD, State Machine, and module views in the running application to confirm that all toolbar buttons are visible and smoothly scrollable with the custom scrollbar and mouse wheel.

- [ ] **Step 3: Commit any final cleanup**

```bash
git add .
git commit -m "test: verify complete toolbar horizontal scroll parity across all diagrams and modules"
```
