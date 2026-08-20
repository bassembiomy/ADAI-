# Particle Galaxy Animation in Standby Mode - Design Spec

**Date:** 2026-08-20  
**Status:** Approved by User  
**Target File:** `src/components/IntroStandbyOverlay.tsx`

---

## 1. Objective & Overview

Replace the 2D canvas particle effect in **Standby Mode** with a full 3D **Particle Galaxy** simulation inspired by Three.js logarithmic spiral particle astrophysics simulations.

The galaxy features:
- Dense spiral arms generated via logarithmic/angular branching.
- Multi-color radial gradient transitions (hot incandescent gold/amber center transitioning to deep cosmic magenta/blue arm tips).
- Exponential particle randomness distribution for realistic cosmic dust dispersion.
- Smooth orbital motion, slow axial rotation, and reactive cursor/parallax tilt.
- Strict resource cleanup on unmount to prevent GPU/memory leaks.

---

## 2. Mathematical & Algorithmic Design

### 2.1 Galaxy Generator Parameters
```typescript
interface GalaxyParameters {
  count: number;              // 60,000 to 100,000 particles
  size: number;               // Base particle point size (0.015 - 0.02)
  radius: number;             // Galaxy outer radius (5.0 - 7.0 units)
  branches: number;           // Number of spiral arms (3 or 4)
  spin: number;               // Spiral curvature factor (1.0 - 1.2)
  randomness: number;         // Dispersion factor (0.4 - 0.6)
  randomnessPower: number;    // Exponential distribution factor (3.0 - 4.0)
  insideColor: string;        // Warm luminous core (#ffe58f / #ffa940 / #fa541c)
  outsideColor: string;       // Deep space perimeter (#1d39c4 / #531dab / #096dd9)
}
```

### 2.2 Vertex Generation
For each particle $i \in [0, \text{count})$:
1. **Distance from Center**: $r \sim \text{Uniform}(0, \text{radius})$
2. **Spiral Arm Angle**: $\theta_{\text{arm}} = \left(\frac{i \pmod{\text{branches}}}{\text{branches}}\right) \times 2\pi$
3. **Spin Tangent**: $\theta_{\text{spin}} = r \times \text{spin}$
4. **Arm Positioning**:
   $$x = \cos(\theta_{\text{arm}} + \theta_{\text{spin}}) \times r + \text{randomX}$$
   $$y = \text{randomY}$$
   $$z = \sin(\theta_{\text{arm}} + \theta_{\text{spin}}) \times r + \text{randomZ}$$
   where $\text{randomX}, \text{randomY}, \text{randomZ} = \text{rand}^{\text{randomnessPower}} \times (\pm 1) \times \text{randomness} \times r$.

### 2.3 Color Interpolation
- Buffer array `colors` (Float32Array of $3 \times \text{count}$):
- Linear color blend from `insideColor` at $r=0$ to `outsideColor` at $r=\text{radius}$.

---

## 3. Architecture & Component Lifecycle

### 3.1 Three.js Integration
- Add `three` and `@types/three` dependencies if not present, or bundle lightweight Three.js module.
- In `IntroStandbyOverlay.tsx`:
  - When `mode === 'standby'`: Initialize `THREE.Scene`, `THREE.PerspectiveCamera`, `THREE.WebGLRenderer`, `THREE.BufferGeometry`, and `THREE.PointsMaterial` (with `vertexColors: true`, `blending: THREE.AdditiveBlending`, `depthWrite: false`).
  - When `mode === 'intro'`: Keep the current intro boot sequence & fast startup display.

### 3.2 Animation Loop & Performance
- `requestAnimationFrame` loop rotating `points.rotation.y += 0.0015` with subtle time-based wave tilt.
- Device Pixel Ratio capping at `Math.min(window.devicePixelRatio, 2)` to ensure smooth 60 FPS on high-DPI displays.
- Responsive resize listener updating camera aspect ratio and renderer dimensions.

### 3.3 Resource Disposal & Memory Safety
On component unmount or standby exit:
- Stop animation loop (`cancelAnimationFrame`).
- Remove window event listeners (resize, mousemove).
- Call `geometry.dispose()`, `material.dispose()`, and `renderer.dispose()`.
- Force WebGL context release to free all VRAM.

---

## 4. Verification Plan

1. **Automated Validation**:
   - TypeScript compilation check (`npx tsc --noEmit`).
   - Project build verification (`npm run build` / `vite build`).
2. **Visual & Interaction Verification**:
   - Trigger Standby Mode in ADIA UI.
   - Verify spiral arm density, color gradient, rotation smoothness, and central glow.
   - Verify smooth exit on keypress or mouse movement without residual memory/listeners.
