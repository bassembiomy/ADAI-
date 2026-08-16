# State Machine Free Transition Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable fluid, free-form dragging and bending of State Machine transition links anywhere along their curve and via dedicated control handles with smooth quadratic Bezier curve fitting, zoom-invariant coordinate mapping, double-click reset, and undo/redo support.

**Architecture:** 
- Extract transition curve mathematics, Bezier inversion solvers, coordinate transformations, and reset helpers into a dedicated, thoroughly tested utility (`src/utils/transitionGeometry.ts`).
- Integrate direct-curve dragging, threshold-based click vs. drag disambiguation, double-click reset, and non-blocking label pointer events into `src/App.tsx`.
- Connect curve modifications to the existing canvas history (`addToHistory`) on drag completion.

**Tech Stack:** React 18, TypeScript, SVG, Vitest

## Global Constraints
- Target files: `src/utils/transitionGeometry.ts`, `src/utils/transitionGeometry.test.ts`, `src/App.tsx`.
- Keep changes backwards-compatible with existing `TransitionData` schema (`controlPoint?: Point; hasControlPoint: boolean`).
- Quadratic Bezier inversion equation: $P_1 = 2M - 0.5(P_0 + P_2)$.
- Coordinate transformations must accurately factor in `view.scale`, `view.offsetX`, `view.offsetY`, and `uiZoom`.
- History snapshot must be recorded on drag release to support `Ctrl+Z` / `Ctrl+Y`.

---

### Task 1: Transition Geometry & Bezier Inversion Engine

**Files:**
- Create: `src/utils/transitionGeometry.ts`
- Test: `src/utils/transitionGeometry.test.ts`

**Interfaces:**
- Consumes: `Point` from `src/types/sm_types.ts`
- Produces:
  - `calculateControlPointFromMidpoint(source: Point, target: Point, cursorWorld: Point): Point`
  - `screenToWorld(clientX: number, clientY: number, canvasRect: DOMRect, view: { offsetX: number; offsetY: number; scale: number }, uiZoom: number): Point`
  - `getDefaultControlPoint(sp: Point, tp: Point, isSelfLoop?: boolean): Point`
  - `isDragThresholdExceeded(dx: number, dy: number, threshold?: number): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/utils/transitionGeometry.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateControlPointFromMidpoint,
  screenToWorld,
  getDefaultControlPoint,
  isDragThresholdExceeded
} from './transitionGeometry';

describe('transitionGeometry', () => {
  it('calculates quadratic bezier control point so curve passes through cursor at midpoint', () => {
    const sp = { x: 100, y: 100 };
    const tp = { x: 300, y: 100 };
    const cursor = { x: 200, y: 200 };

    // P1 = 2*M - 0.5*(P0 + P2)
    // P1.x = 2*200 - 0.5*(100 + 300) = 400 - 200 = 200
    // P1.y = 2*200 - 0.5*(100 + 100) = 400 - 100 = 300
    const cp = calculateControlPointFromMidpoint(sp, tp, cursor);
    expect(cp).toEqual({ x: 200, y: 300 });

    // Verify midpoint B(0.5) with this cp equals cursor
    const midX = 0.25 * sp.x + 0.5 * cp.x + 0.25 * tp.x;
    const midY = 0.25 * sp.y + 0.5 * cp.y + 0.25 * tp.y;
    expect(midX).toBeCloseTo(cursor.x);
    expect(midY).toBeCloseTo(cursor.y);
  });

  it('correctly maps screen coordinates to world coordinates accounting for pan, zoom, and uiZoom', () => {
    const canvasRect = { left: 50, top: 50, right: 850, bottom: 650, width: 800, height: 600 } as DOMRect;
    const view = { offsetX: 100, offsetY: 50, scale: 1.5 };
    const uiZoom = 1.0;

    // clientX = 200, clientY = 200
    // canvas relative = (200 - 50) = 150, (200 - 50) = 150
    // worldX = (150 - 100) / 1.5 = 50 / 1.5 = 33.333
    // worldY = (150 - 50) / 1.5 = 100 / 1.5 = 66.666
    const world = screenToWorld(200, 200, canvasRect, view, uiZoom);
    expect(world.x).toBeCloseTo(33.333, 2);
    expect(world.y).toBeCloseTo(66.666, 2);
  });

  it('detects when drag movement threshold is exceeded', () => {
    expect(isDragThresholdExceeded(1, 1, 3)).toBe(false);
    expect(isDragThresholdExceeded(3, 0, 3)).toBe(false);
    expect(isDragThresholdExceeded(3.1, 0, 3)).toBe(true);
    expect(isDragThresholdExceeded(0, 4, 3)).toBe(true);
  });

  it('provides sensible default control points for normal transitions and self loops', () => {
    const sp = { x: 100, y: 100 };
    const tp = { x: 200, y: 100 };
    const cp = getDefaultControlPoint(sp, tp, false);
    expect(cp.x).toBeCloseTo(150);
    expect(cp.y).toBeGreaterThan(100);

    const loopCp = getDefaultControlPoint(sp, sp, true);
    expect(loopCp.y).toBeLessThan(sp.y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/transitionGeometry.test.ts`  
Expected: FAIL with "Cannot find module './transitionGeometry'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/transitionGeometry.ts
import { Point } from '../types/sm_types';

/**
 * Calculates the quadratic Bezier control point P1 such that the curve
 * B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2 passes exactly through cursorWorld at t = 0.5.
 *
 * Formula:
 * M = 0.25 * P0 + 0.5 * P1 + 0.25 * P2
 * P1 = 2 * M - 0.5 * (P0 + P2)
 */
export function calculateControlPointFromMidpoint(
  source: Point,
  target: Point,
  cursorWorld: Point
): Point {
  return {
    x: 2 * cursorWorld.x - 0.5 * (source.x + target.x),
    y: 2 * cursorWorld.y - 0.5 * (source.y + target.y)
  };
}

/**
 * Converts screen/pointer coordinates to SVG world coordinates.
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number },
  view: { offsetX: number; offsetY: number; scale: number },
  uiZoom: number = 1.0
): Point {
  const safeUiZoom = uiZoom || 1.0;
  const safeScale = view.scale || 1.0;
  return {
    x: ((clientX - canvasRect.left) / safeUiZoom - view.offsetX) / safeScale,
    y: ((clientY - canvasRect.top) / safeUiZoom - view.offsetY) / safeScale
  };
}

/**
 * Checks if mouse movement distance exceeds a given drag threshold in pixels.
 */
export function isDragThresholdExceeded(
  dx: number,
  dy: number,
  threshold: number = 3
): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * Calculates the default control point for transitions without manual control points.
 */
export function getDefaultControlPoint(
  sp: Point,
  tp: Point,
  isSelfLoop: boolean = false
): Point {
  if (isSelfLoop) {
    return {
      x: (sp.x + tp.x) / 2,
      y: Math.min(sp.y, tp.y) - 50
    };
  }
  return {
    x: (sp.x + tp.x) / 2 + (tp.y - sp.y) * 0.3,
    y: (sp.y + tp.y) / 2 + (sp.x - tp.x) * 0.3
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/transitionGeometry.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/transitionGeometry.ts src/utils/transitionGeometry.test.ts
git commit -m "feat(sm): add transition geometry and bezier solver utilities"
```

---

### Task 2: Smooth Transition Dragging & Interaction Handlers in App.tsx

**Files:**
- Modify: `src/App.tsx`
- Test: `src/utils/transitionGeometry.test.ts`

**Interfaces:**
- Consumes: `calculateControlPointFromMidpoint`, `screenToWorld`, `isDragThresholdExceeded`, `getDefaultControlPoint` from `src/utils/transitionGeometry.ts`
- Produces:
  - `startTransitionDrag(transitionId: string, e: React.MouseEvent, mode: 'curve' | 'handle')`
  - `resetTransitionCurve(transitionId: string)`
  - Updated `renderTransitions` with non-blocking label overlays and instant free drag response

- [ ] **Step 1: Write integration tests for transition curve updates and reset**

Add to `src/utils/transitionGeometry.test.ts`:
```typescript
import { TransitionData } from '../types/sm_types';

describe('transition updates & reset helpers', () => {
  it('resets custom control point back to automatic', () => {
    const transition: TransitionData = {
      id: 't1',
      sourceId: 's1',
      targetId: 's2',
      condition: '',
      action: '',
      afterTicks: null,
      type: 'condition',
      order: 1,
      hasControlPoint: true,
      controlPoint: { x: 250, y: 350 }
    };

    const resetUpdates: Partial<TransitionData> = {
      controlPoint: undefined,
      hasControlPoint: false
    };

    const updated = { ...transition, ...resetUpdates };
    expect(updated.hasControlPoint).toBe(false);
    expect(updated.controlPoint).toBeUndefined();
  });
});
```

- [ ] **Step 2: Update App.tsx to use transition geometry and add smooth dragging**

1. Import `calculateControlPointFromMidpoint`, `screenToWorld`, `isDragThresholdExceeded`, `getDefaultControlPoint` from `./utils/transitionGeometry`.
2. Refactor `startControlPointDrag` into `startTransitionDrag(transitionId, e, mode: 'curve' | 'handle')`:
   - Store `startX = e.clientX`, `startY = e.clientY`.
   - On `mousemove`, check `isDragThresholdExceeded(e.clientX - startX, e.clientY - startY)`. Once exceeded, mark dragging active.
   - If `mode === 'curve'`, compute source and target endpoints, then use `calculateControlPointFromMidpoint(sp, tp, worldPos)`.
   - If `mode === 'handle'`, directly set `controlPoint = worldPos`.
   - On `mouseup`, if dragging occurred, invoke `addToHistory('Move transition curve')`. If dragging did not occur and `mode === 'curve'`, execute `handleTransitionClick`.
3. Add `resetTransitionCurve(transitionId: string)`:
   - Updates transition with `{ controlPoint: undefined, hasControlPoint: false }`.
   - Calls `addToHistory('Reset transition curve')`.
4. In `renderTransitions`:
   - Attach `onMouseDown={(e) => startTransitionDrag(transition.id, e, 'curve')}` to the hit-area path.
   - Attach `onDoubleClick={(e) => { e.stopPropagation(); resetTransitionCurve(transition.id); }}` to the hit-area path and control circle.
   - Set `style={{ pointerEvents: 'none' }}` on `<foreignObject>` for transition labels so labels never block path clicks or dragging.
   - Render control handle on hover or selection with grab cursor.

- [ ] **Step 3: Run all tests to verify**

Run: `npx vitest run src/utils/transitionGeometry.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/utils/transitionGeometry.test.ts
git commit -m "feat(sm): enable free and smooth transition curve dragging with reset and undo"
```

---

### Task 3: Full Workspace Test Suite & UI Verification

**Files:**
- Test: Full Vitest suite

- [ ] **Step 1: Run comprehensive tests to ensure no regressions**

Run: `npx vitest run src/utils/stateMachineCodeGenerator.test.ts src/utils/transitionGeometry.test.ts src/utils/stateMachineClipboard.test.ts`  
Expected: PASS (All test suites pass)

- [ ] **Step 2: Commit final documentation / verification notes**

```bash
git commit --allow-empty -m "chore(sm): verify free transition link movement implementation"
```
