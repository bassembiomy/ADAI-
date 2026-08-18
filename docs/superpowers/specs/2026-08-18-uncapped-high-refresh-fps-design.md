# Uncapped High-Refresh FPS Optimization Design Specification

## Overview
This specification details the optimization of rendering frame rates across the ADIA application suite to unlock native high-refresh rate displays (120Hz, 144Hz, 165Hz, 240Hz, 360Hz+) and remove artificial 60 FPS capping.

---

## 1. Dynamic FPS Measurement & Sparkline Auto-Scaling

In [`src/components/LiveFpsMonitor.tsx`](file:///g:/adia%20project/src/components/LiveFpsMonitor.tsx):
- Remove hardcoded `maxFps = 60` artificial limit.
- Support dynamic ceiling detection where the monitor tracks `peakFps` (restricting lower bounds to 60 for 60Hz displays while auto-expanding up to 144, 240, 360+ FPS on high-refresh panels).
- Dynamic Sparkline Normalization:
  ```typescript
  export function calculateSparklineY(fps: number, maxFps: number, height: number): number {
    const safeMax = Math.max(60, maxFps);
    const clampedFps = Math.max(0, Math.min(safeMax, fps));
    const normalized = clampedFps / safeMax;
    return height - 2 - normalized * (height - 4);
  }
  ```
- Dynamic Color Thresholds:
  - Emerald: $\ge 85\%$ of detected peak (or $\ge 55$ FPS).
  - Amber: $50\% - 84\%$ of detected peak.
  - Rose: $< 50\%$ of detected peak.

---

## 2. Electron Hardware Acceleration & Frame Rate Unlock

In [`src/main.cjs`](file:///g:/adia%20project/src/main.cjs):
- Add Chromium startup switches:
  ```javascript
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  ```
- Ensures GPU compositor processes frames with zero copy and unlocks maximum monitor refresh capability.

---

## 3. Verification Plan
- **Unit Tests**: Update and run `src/components/LiveFpsMonitor.test.ts` to verify dynamic high-refresh calculations (e.g., 120, 144, 240 FPS).
- **Security Tests**: Run `npm run test:security` to ensure flags don't affect electron IPC or policies.
- **Type Checking**: Run `npx tsc --noEmit` to ensure zero compilation issues.
