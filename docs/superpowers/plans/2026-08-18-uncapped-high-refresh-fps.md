# Uncapped High-Refresh FPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable native high-refresh rate visualization (120Hz, 144Hz, 240Hz, 360Hz+) across the application without artificial 60 FPS capping.

**Architecture:** Remove the hardcoded 60 FPS ceiling in `LiveFpsMonitor.tsx` and dynamically auto-scale the ceiling based on observed display refresh rates. Configure Electron Chromium flags (`disable-frame-rate-limit`, `enable-gpu-rasterization`, `enable-zero-copy`) in `main.cjs` to unlock maximum GPU rendering performance.

**Tech Stack:** React 18, TypeScript, Electron, Vitest.

---

### Task 1: Update Tests for High-Refresh Rates (`src/components/LiveFpsMonitor.test.ts`)

**Files:**
- Modify: `src/components/LiveFpsMonitor.test.ts`

- [ ] **Step 1: Add high-refresh rate test cases (120, 144, 240 FPS)**

```typescript
import { describe, it, expect } from 'vitest';
import {
  getFpsColorClass,
  getFpsStrokeColor,
  computeRollingAverageFps,
  calculateSparklineY,
  LiveFpsMonitor,
} from './LiveFpsMonitor';

describe('LiveFpsMonitor Utility and Logic', () => {
  it('assigns emerald colors for high FPS (>= 55)', () => {
    expect(getFpsColorClass(60)).toBe('text-emerald-400');
    expect(getFpsColorClass(120)).toBe('text-emerald-400');
    expect(getFpsColorClass(144)).toBe('text-emerald-400');
    expect(getFpsStrokeColor(144)).toBe('#10b981');
  });

  it('calculates sparkline Y coordinates accurately for 144 and 240 maxFps', () => {
    const height = 14;
    // At maxFps (144), should map to top (y = 2)
    expect(calculateSparklineY(144, 144, height)).toBe(2);
    // At 0 fps, should map to bottom (y = 12)
    expect(calculateSparklineY(0, 144, height)).toBe(12);
    // At half (72 fps), should map to middle (y = 7)
    expect(calculateSparklineY(72, 144, height)).toBe(7);
  });

  it('computes rolling average FPS for high-refresh sample bursts', () => {
    expect(computeRollingAverageFps([120, 120, 120])).toBe(120);
    expect(computeRollingAverageFps([144, 144])).toBe(144);
    expect(computeRollingAverageFps([100, 200])).toBe(150);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/components/LiveFpsMonitor.test.ts`

---

### Task 2: Refactor `LiveFpsMonitor.tsx` for Dynamic High-Refresh Rates

**Files:**
- Modify: `src/components/LiveFpsMonitor.tsx`

- [ ] **Step 1: Remove 60 FPS clamp and auto-track peak refresh rate**

In `src/components/LiveFpsMonitor.tsx`:
- Allow `instantFps = Math.round(1000 / delta)` without Math.min(60).
- Dynamically track `peakFps` (initial 60, expanding as higher instantaneous FPS is detected).
- Pass dynamic `peakFps` to `calculateSparklineY`.

---

### Task 3: Enable Electron High-Performance Chromium Flags

**Files:**
- Modify: `src/main.cjs`

- [ ] **Step 1: Add command-line acceleration switches**

In `src/main.cjs`:
```javascript
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
```

---

### Task 4: Full Verification

- [ ] **Step 1: Run Vitest tests**
Run: `npx vitest run src/components/LiveFpsMonitor.test.ts`

- [ ] **Step 2: Run security test suite**
Run: `npm run test:security`

- [ ] **Step 3: Run TypeScript compiler**
Run: `npx tsc --noEmit`
