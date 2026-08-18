# Live FPS Sparkline Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a real-time live FPS sparkline monitor into the ADIA top toolbar status bar that charts application frame rates dynamically up to 60 FPS.

**Architecture:** Create an isolated, zero-overhead React component `LiveFpsMonitor` with a decoupled `requestAnimationFrame` render loop that paints a smoothed sparkline directly to a mini `<canvas>` element and throttles DOM text updates. Integrate the component into the status bar in `App.tsx`.

**Tech Stack:** React 18, TypeScript, HTML5 Canvas 2D, Tailwind CSS, Lucide React, Vitest.

## Global Constraints
- Target 60 FPS standard reference ceiling.
- Zero React re-rendering churn on `App.tsx` during continuous frame rate sampling.
- Adaptive color coding: Emerald (`#10b981`) for >=55 FPS, Amber (`#f59e0b`) for 30–54 FPS, Rose (`#f43f5e`) for <30 FPS.
- Graceful fallback in non-browser or test environments.

---

### Task 1: Create LiveFpsMonitor Component and Unit Tests (TDD)

**Files:**
- Create: `src/components/LiveFpsMonitor.tsx`
- Test: `src/components/LiveFpsMonitor.test.tsx`

**Interfaces:**
- Produces: `export const LiveFpsMonitor: React.FC<{ className?: string }>`

- [ ] **Step 1: Write the failing unit test**

```tsx
// src/components/LiveFpsMonitor.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LiveFpsMonitor } from './LiveFpsMonitor';

describe('LiveFpsMonitor Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly with default FPS indicator', () => {
    render(<LiveFpsMonitor />);
    expect(screen.getByTestId('live-fps-monitor')).toBeDefined();
    expect(screen.getByText(/FPS/i)).toBeDefined();
  });

  it('contains a canvas element for sparkline rendering', () => {
    const { container } = render(<LiveFpsMonitor />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/LiveFpsMonitor.test.tsx`
Expected: FAIL with module `./LiveFpsMonitor` not found.

- [ ] **Step 3: Implement LiveFpsMonitor**

```tsx
// src/components/LiveFpsMonitor.tsx
import React, { useEffect, useRef, useState } from 'react';

interface LiveFpsMonitorProps {
  className?: string;
  maxFps?: number;
  historyLength?: number;
}

export const LiveFpsMonitor: React.FC<LiveFpsMonitorProps> = ({
  className = '',
  maxFps = 60,
  historyLength = 30,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [displayFps, setDisplayFps] = useState<number>(60);
  const fpsHistoryRef = useRef<number[]>(new Array(historyLength).fill(60));
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const lastTextUpdateRef = useRef<number>(performance.now());

  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (delta > 0 && delta < 500) {
        const instantFps = Math.min(maxFps, Math.round(1000 / delta));
        fpsHistoryRef.current.push(instantFps);
        if (fpsHistoryRef.current.length > historyLength) {
          fpsHistoryRef.current.shift();
        }
      }

      frameCountRef.current++;

      // Throttle numeric text update to 4 times per second (250ms)
      if (now - lastTextUpdateRef.current >= 250) {
        const history = fpsHistoryRef.current;
        const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
        setDisplayFps(avg);
        lastTextUpdateRef.current = now;
      }

      // Draw sparkline to canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          const history = fpsHistoryRef.current;
          const len = history.length;
          if (len > 1) {
            const currentFps = history[len - 1];
            
            // Dynamic color threshold
            let strokeColor = '#10b981'; // Emerald
            if (currentFps < 30) {
              strokeColor = '#f43f5e'; // Rose
            } else if (currentFps < 55) {
              strokeColor = '#f59e0b'; // Amber
            }

            // Draw ceiling guide line at 60 FPS
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(0, 2);
            ctx.lineTo(width, 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw rolling live line
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();

            for (let i = 0; i < len; i++) {
              const x = (i / (len - 1)) * width;
              // Map FPS (0..maxFps) to Y (height - 2 .. 2)
              const normalized = Math.max(0, Math.min(1, history[i] / maxFps));
              const y = height - 2 - normalized * (height - 4);
              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [maxFps, historyLength]);

  const fpsColorClass =
    displayFps >= 55
      ? 'text-emerald-400'
      : displayFps >= 30
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <div
      data-testid="live-fps-monitor"
      className={`flex items-center gap-1.5 font-mono text-[11px] select-none ${className}`}
      title={`Rendering performance: ${displayFps} FPS`}
    >
      <canvas
        ref={canvasRef}
        width={40}
        height={14}
        className="w-10 h-3.5 block opacity-90"
      />
      <span className={`font-semibold ${fpsColorClass}`}>
        {displayFps} <span className="text-[9px] text-zinc-500 font-normal">FPS</span>
      </span>
    </div>
  );
};
```

- [ ] **Step 4: Run unit tests and verify they pass**

Run: `npx vitest run src/components/LiveFpsMonitor.test.tsx`
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit changes**

```bash
git add src/components/LiveFpsMonitor.tsx src/components/LiveFpsMonitor.test.tsx
git commit -m "feat(ui): add LiveFpsMonitor component with canvas sparkline and FPS tracking"
```

---

### Task 2: Integrate LiveFpsMonitor into App.tsx Top Toolbar

**Files:**
- Modify: `src/App.tsx:1-40` (import)
- Modify: `src/App.tsx:15570-15595` (status indicators section)

**Interfaces:**
- Consumes: `import { LiveFpsMonitor } from './components/LiveFpsMonitor';`

- [ ] **Step 1: Add import to App.tsx**

Add `import { LiveFpsMonitor } from './components/LiveFpsMonitor';` to imports in `src/App.tsx`.

- [ ] **Step 2: Add `<LiveFpsMonitor />` into status indicator pill**

In `src/App.tsx` status bar section (~line 15580):
```tsx
              {/* Status indicators */}
              <div className="flex items-center gap-3 bg-[#18181c] border border-[#27272f] rounded-lg px-2.5 py-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <span className={`font-mono text-[11px] font-semibold ${isRunning ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {isRunning ? 'RUN' : 'STOP'}
                  </span>
                </div>
                <Separator orientation="vertical" className="h-3.5 bg-[#2e2e38]" />
                <LiveFpsMonitor />
                <Separator orientation="vertical" className="h-3.5 bg-[#2e2e38]" />
                <div className="text-zinc-500 font-mono text-[11px]">
                  T: <span className="text-zinc-300 font-semibold">{simulationTime.toFixed(1)}s</span>
                </div>
                <div className="text-zinc-500 font-mono text-[11px]">
                  S: <span className="text-zinc-300 font-semibold">{currentStates.length}</span>
                </div>
                <div className="text-zinc-500 font-mono text-[11px]">
                  V: <span className="text-zinc-300 font-semibold">{variables.length}</span>
                </div>
              </div>
```

- [ ] **Step 3: Verify build and test suite**

Run: `npx vitest run src/components/LiveFpsMonitor.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/App.tsx
git commit -m "feat(ui): integrate LiveFpsMonitor into top toolbar status group"
```

---

### Task 3: Full Verification & Walkthrough

- [ ] **Step 1: Run comprehensive tests**
Run: `npx vitest run` on relevant component test suites.
- [ ] **Step 2: Confirm smooth live sparkline rendering without warnings**
- [ ] **Step 3: Document changes in walkthrough artifact**
