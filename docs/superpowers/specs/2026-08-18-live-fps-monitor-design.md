# Live FPS Sparkline Monitor Design

## 1. Problem Statement & Motivation
Users working on complex simulations, state machine animations, and high-node diagram layouts in ADIA need immediate visual feedback regarding rendering performance and frame rate stability. Currently, the status bar displays discrete counters (simulation time, active states, variables), but lacks real-time application frame rate diagnostics.

## 2. Proposed Architecture & Component Design

### 2.1 LiveFpsMonitor Component
- **File**: `src/components/LiveFpsMonitor.tsx`
- **Measurement Engine**:
  - Leverages `requestAnimationFrame` to compute accurate delta time (`dt`) between consecutive paint frames.
  - Computes instantaneous FPS (`1000 / dt`), smoothing across a rolling window buffer of the last 30 frames.
  - Updates an internal `useRef<number[]>` circular buffer to avoid React re-renders on the host toolbar.
  - Animates a mini `<canvas>` (`width: 44px, height: 16px`) in real-time, drawing a smoothed rolling sparkline.
  - Renders a subtle dotted ceiling line representing the target 60 FPS baseline.
  - Throttles the numerical text readout (e.g. `60 FPS`) to 4 updates per second (every 250ms) using a lightweight React state to minimize DOM churn.

### 2.2 Visual Styling & Dynamic Colors
- **Color Thresholds**:
  - `FPS >= 55`: Emerald green (`#10b981`) with soft glow (`rgba(16, 185, 129, 0.2)`).
  - `30 <= FPS < 55`: Amber warning (`#f59e0b`).
  - `FPS < 30`: Rose red alert (`#f43f5e`).
- **Layout**:
  - Embedded seamlessly within the top toolbar status group in `App.tsx`:
    ```tsx
    <LiveFpsMonitor />
    ```
  - Contained alongside the `RUN/STOP` indicator and `T: / S: / V:` simulation telemetry.

## 3. Error Handling & Edge Cases
- **Background Tab / Inactive Window**: When the browser tab is hidden, `requestAnimationFrame` pauses; the monitor detects `dt > 500ms` and gracefully holds the last known frame or displays standby without visual jitter.
- **High-Refresh Monitors (120Hz/144Hz)**: Normalizes visual graph scaling to a 60 FPS standard ceiling while accurately tracking native rendering performance.
- **Node / SSR / Headless Test Environments**: Checks for existence of `window.requestAnimationFrame` and canvas `getContext('2d')`, falling back safely to static display in headless tests.

## 4. Testing & Verification Plan
- **Unit Tests**: `src/components/LiveFpsMonitor.test.tsx` verifying:
  - Component mounts without error.
  - Frame history buffer populates and maintains bound.
  - Correct CSS color classes / stroke styles applied based on FPS thresholds.
- **Manual Verification**: Run dev server and confirm sparkline renders smoothly at 60 FPS during user interactions in the canvas.
