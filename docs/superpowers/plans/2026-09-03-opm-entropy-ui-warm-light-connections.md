# OPM Entropy UI: Warm Light Selection, Redesigned Blocks & Ports, Enhanced Connections & Overlap Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate OPM Entropy diagramming with incandescent warm light selection, modern dark-glass blocks and magnetic ports, smooth connection routing with in-diagram link type badges, and dynamic block overlap prevention.

**Architecture:** 
- A dedicated collision avoidance utility computes 2D AABB intersections and minimum translation vectors to dynamically nudge dragged blocks apart.
- Nodes and edge components receive a unified golden-amber luminescence system when selected (`rgba(251, 191, 36, 0.7)` with multi-tier drop shadows).
- Custom `@xyflow/react` `EdgeLabelRenderer` displays a floating glass badge on selected links with link role iconography and an in-canvas dropdown to switch types instantly.
- `OpmAutoLayout` margins are widened to guarantee zero initial overlap.

**Tech Stack:** React, `@xyflow/react`, Lucide icons, Tailwind CSS, TypeScript, Vitest.

## Global Constraints
- Strictly preserve existing OPM ISO 19450 semantics and simulation engine state structures.
- All interactive controls on canvas must avoid stopping ReactFlow pan/zoom unexpectedly (`nodrag`, `nopan` class tags where appropriate).
- Visual styling must adhere to ADIA dark mode palette: `#0d0d0d`, amber `#fbbf24`, emerald `#10b981`, sky `#0284c7`, purple `#c084fc`.

---

### Task 1: Collision Resolution Engine (`OpmCollisionAvoidance.ts`)

**Files:**
- Create: `src/components/entropy/OpmCollisionAvoidance.ts`
- Test: `src/components/entropy/__tests__/opmCollisionAvoidance.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RectBounds {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export function resolveBlockOverlap(
    movingNode: RectBounds,
    otherNodes: RectBounds[],
    padding?: number
  ): { x: number; y: number; collided: boolean };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/components/entropy/__tests__/opmCollisionAvoidance.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBlockOverlap, RectBounds } from '../OpmCollisionAvoidance';

describe('resolveBlockOverlap', () => {
  it('does not alter position if there is no collision', () => {
    const moving: RectBounds = { id: 'node-1', x: 0, y: 0, width: 100, height: 50 };
    const others: RectBounds[] = [
      { id: 'node-2', x: 200, y: 200, width: 100, height: 50 }
    ];

    const result = resolveBlockOverlap(moving, others, 10);
    expect(result.collided).toBe(false);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('nudges moving node away when overlapping another node', () => {
    const moving: RectBounds = { id: 'node-1', x: 50, y: 20, width: 100, height: 60 };
    const others: RectBounds[] = [
      { id: 'node-2', x: 0, y: 0, width: 100, height: 60 }
    ];

    const result = resolveBlockOverlap(moving, others, 15);
    expect(result.collided).toBe(true);
    // Should be pushed out so moving.x >= 115 or moving.y >= 75
    const noOverlapX = result.x >= 115 || result.x + moving.width <= -15;
    const noOverlapY = result.y >= 75 || result.y + moving.height <= -15;
    expect(noOverlapX || noOverlapY).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmCollisionAvoidance.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/entropy/OpmCollisionAvoidance.ts
export interface RectBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function checkOverlap(a: RectBounds, b: RectBounds, pad: number = 10): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    a.x >= b.x + b.width + pad ||
    a.y + a.height + pad <= b.y ||
    a.y >= b.y + b.height + pad
  );
}

export function resolveBlockOverlap(
  movingNode: RectBounds,
  otherNodes: RectBounds[],
  padding: number = 16
): { x: number; y: number; collided: boolean } {
  let currentX = movingNode.x;
  let currentY = movingNode.y;
  let collided = false;

  for (let iteration = 0; iteration < 8; iteration++) {
    let hadCollisionThisPass = false;
    for (const other of otherNodes) {
      if (other.id === movingNode.id) continue;

      const currentBounds: RectBounds = {
        id: movingNode.id,
        x: currentX,
        y: currentY,
        width: movingNode.width,
        height: movingNode.height,
      };

      if (checkOverlap(currentBounds, other, padding)) {
        collided = true;
        hadCollisionThisPass = true;

        // Compute overlap depth on each axis
        const overlapLeft = (other.x + other.width + padding) - currentX;
        const overlapRight = (currentX + movingNode.width + padding) - other.x;
        const overlapTop = (other.y + other.height + padding) - currentY;
        const overlapBottom = (currentY + movingNode.height + padding) - other.y;

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft) {
          currentX = other.x + other.width + padding;
        } else if (minOverlap === overlapRight) {
          currentX = other.x - movingNode.width - padding;
        } else if (minOverlap === overlapTop) {
          currentY = other.y + other.height + padding;
        } else {
          currentY = other.y - movingNode.height - padding;
        }
      }
    }
    if (!hadCollisionThisPass) break;
  }

  return { x: Math.round(currentX), y: Math.round(currentY), collided };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmCollisionAvoidance.test.ts`
Expected: PASS

---

### Task 2: Block & Port Redesign with Warm Light Selection (`OPMNodeComponents.tsx`)

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Test: `src/components/entropy/__tests__/entropy.test.ts`

**Interfaces:**
- Consumes: `AppNode`, `OPMNodeData`, `OPMPort`
- Produces: Updated `OPMObjectNode`, `OPMProcessNode`, `OPMStateNode`, and `renderOPMPort` with warm golden light styling and enhanced port visuals.

- [ ] **Step 1: Update port handle visuals in `renderOPMPort`**
  - Increase core size to 10px diameter with role color.
  - Add dark outer border and subtle radial role glow.
  - Add smooth hover expansion (`group-hover:scale-125`).
  - Upgrade label pill with uppercase monospace role hint and name.

- [ ] **Step 2: Update Node selection styles with Warm Light Glow**
  - Replace cold borders on selection with:
    `border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.65),0_0_50px_rgba(245,158,11,0.35)] ring-1 ring-amber-300/40 bg-gradient-to-b from-[#1a1608]/90 to-[#0e0e0e]/95`
  - Ensure unselected nodes preserve their semantic colors (Object: Emerald, Process: Sky, Requirement: Purple, State: Amber).

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run src/components/entropy/__tests__/entropy.test.ts`
Expected: PASS

---

### Task 3: Enhanced Connections & Drag-Line Warm Glow (`OPMEdgeComponents.tsx` & `EntropyWorkspace.tsx`)

**Files:**
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx:56-155`

**Interfaces:**
- Produces: Refined smooth-step paths, warm glowing selected edge paths, animated drag line.

- [ ] **Step 1: Enhance `OPMConnectionLine` in `EntropyWorkspace.tsx`**
  - Apply warm glowing stroke (`#fbbf24`) with animated dash and distinct magnetic target snap ring.

- [ ] **Step 2: Enhance `OPMEdge` in `OPMEdgeComponents.tsx`**
  - Set `borderRadius: 16` and `offset: 28` in `getSmoothStepPath`.
  - When `selected === true`:
    - Stroke color: `#fbbf24`.
    - Drop-shadow filter: `drop-shadow(0 0 8px rgba(251, 191, 36, 0.8))`.
    - Background halo path with stroke width 7, opacity 0.4.

---

### Task 4: In-Diagram Floating Link Type Badge & Switcher (`OPMEdgeComponents.tsx`)

**Files:**
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Modify: `src/components/entropy/EntropyTypes.ts` (if needed for callbacks)
- Modify: `src/components/entropy/EntropyWorkspace.tsx` (to handle edge type update and deletion)

**Interfaces:**
- Produces: Interactive floating badge at `(labelX, labelY)` using `@xyflow/react` `EdgeLabelRenderer` when edge is selected.

- [ ] **Step 1: Implement `EdgeLabelRenderer` badge in `OPMEdge`**
  - Render only when `selected === true`.
  - Display link icon + formatted role name (e.g. `⚡ Trigger`, `👤 Agent`, `🎯 Instrument`, `📦 Consumption`, `✨ Result`, `🔄 Effect`, etc.).
  - Include an interactive mini `<select>` or click-dropdown with `nodrag nopan` so the user can switch link type directly on the diagram.
  - Include a quick delete icon button to delete the link.

- [ ] **Step 2: Connect edge type change callback to `EntropyWorkspace.tsx`**
  - Pass `onChangeEdgeType` and `onDeleteEdge` through edge data or custom edge event.

- [ ] **Step 3: Run entropy tests**

Run: `npx vitest run src/components/entropy/__tests__/entropy.test.ts`
Expected: PASS

---

### Task 5: Collision Prevention Integration & Auto-Layout Expansion

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OpmAutoLayout.ts`
- Test: `src/components/entropy/__tests__/opmAutoLayout.test.ts`

**Interfaces:**
- Consumes: `resolveBlockOverlap` from `OpmCollisionAvoidance.ts`
- Produces: `onNodeDragStop` handler on `<ReactFlow>` that nudges overlapping blocks on release; updated `layoutOpmGraph` spacing.

- [ ] **Step 1: Increase `OpmAutoLayout` clearances**
  - Default `columnGap`: from 380 to 420.
  - Default `rowGap`: from 50 to 70.

- [ ] **Step 2: Add `onNodeDragStop` to `<ReactFlow>` in `EntropyWorkspace.tsx`**
  - Extract bounds for the dragged node and all other root nodes.
  - If a collision occurs, update the node's position with the resolved coordinates.

- [ ] **Step 3: Run auto layout tests**

Run: `npx vitest run src/components/entropy/__tests__/opmAutoLayout.test.ts`
Expected: PASS

---

### Task 6: Full Verification & Integration Testing

**Files:**
- Verify: All entropy tests passing
- Verify: TypeScript compilation without errors

- [ ] **Step 1: Run full test suite for entropy**

Run: `npx vitest run src/components/entropy`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean check with 0 errors
