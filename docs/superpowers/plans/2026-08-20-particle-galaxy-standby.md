# Particle Galaxy Standby Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 3D Particle Galaxy simulation using Three.js for Standby Mode in `IntroStandbyOverlay.tsx`.

**Architecture:** A dedicated, clean `GalaxySimulationEngine` handles 3D particle buffer math (spiral arm angles, radius distribution, randomness power curves, color gradients) and WebGL lifecycle. `IntroStandbyOverlay.tsx` mounts the Three.js canvas when `mode === 'standby'` and handles responsive resizing, mouse parallax, and resource disposal.

**Tech Stack:** Three.js, React 18, TypeScript, Vitest.

## Global Constraints

- Standby mode must smoothly animate at 60 FPS without GPU/CPU memory leaks.
- All WebGL resources (`BufferGeometry`, `Material`, `Points`, `WebGLRenderer`) must be explicitly disposed of on component unmount or exit.
- Intro mode behavior remains unaffected.

---

### Task 1: Install Three.js and TypeScript definitions

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `three` and `@types/three`**

Run: `npm install three @types/three`

- [ ] **Step 2: Verify package.json contains three and @types/three**

Run: `node -e "require('three'); console.log('Three.js loaded successfully')"`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add three and @types/three for 3D visual simulations"
```

---

### Task 2: Implement Galaxy Simulation Math and Particle Generator

**Files:**
- Create: `src/components/standby/galaxyGenerator.ts`
- Test: `src/components/standby/galaxyGenerator.test.ts`

**Interfaces:**
- Produces:
  - `GalaxyParameters` interface
  - `generateGalaxyData(params: GalaxyParameters): { positions: Float32Array; colors: Float32Array; count: number }`

- [ ] **Step 1: Write failing unit test for galaxy generator**

```typescript
// src/components/standby/galaxyGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { generateGalaxyData, DEFAULT_GALAXY_PARAMS } from './galaxyGenerator';

describe('galaxyGenerator', () => {
  it('generates expected buffer sizes based on particle count', () => {
    const data = generateGalaxyData({ ...DEFAULT_GALAXY_PARAMS, count: 1000 });
    expect(data.positions.length).toBe(3000);
    expect(data.colors.length).toBe(3000);
    expect(data.count).toBe(1000);
  });

  it('contains valid non-NaN coordinate and color data', () => {
    const data = generateGalaxyData({ ...DEFAULT_GALAXY_PARAMS, count: 500 });
    for (let i = 0; i < data.positions.length; i++) {
      expect(Number.isNaN(data.positions[i])).toBe(false);
      expect(Number.isFinite(data.positions[i])).toBe(true);
    }
    for (let i = 0; i < data.colors.length; i++) {
      expect(data.colors[i]).toBeGreaterThanOrEqual(0);
      expect(data.colors[i]).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/standby/galaxyGenerator.test.ts`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement minimal galaxyGenerator**

```typescript
// src/components/standby/galaxyGenerator.ts
import * as THREE from 'three';

export interface GalaxyParameters {
  count: number;
  size: number;
  radius: number;
  branches: number;
  spin: number;
  randomness: number;
  randomnessPower: number;
  insideColor: string;
  outsideColor: string;
}

export const DEFAULT_GALAXY_PARAMS: GalaxyParameters = {
  count: 60000,
  size: 0.012,
  radius: 6,
  branches: 4,
  spin: 1.1,
  randomness: 0.5,
  randomnessPower: 3.5,
  insideColor: '#ff7a45',
  outsideColor: '#2f54eb'
};

export function generateGalaxyData(params: GalaxyParameters = DEFAULT_GALAXY_PARAMS) {
  const positions = new Float32Array(params.count * 3);
  const colors = new Float32Array(params.count * 3);

  const colorInside = new THREE.Color(params.insideColor);
  const colorOutside = new THREE.Color(params.outsideColor);

  for (let i = 0; i < params.count; i++) {
    const i3 = i * 3;

    // Radius from center
    const radius = Math.random() * params.radius;

    // Branch angle
    const branchAngle = ((i % params.branches) / params.branches) * Math.PI * 2;
    const spinAngle = radius * params.spin;

    // Random offset with power distribution
    const randomX = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
    const randomY = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * (params.randomness * 0.5) * radius;
    const randomZ = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;

    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
    positions[i3 + 1] = randomY;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    // Color gradient interpolation
    const mixedColor = colorInside.clone().lerp(colorOutside, radius / params.radius);
    colors[i3] = mixedColor.r;
    colors[i3 + 1] = mixedColor.g;
    colors[i3 + 2] = mixedColor.b;
  }

  return {
    positions,
    colors,
    count: params.count
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/standby/galaxyGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/standby/galaxyGenerator.ts src/components/standby/galaxyGenerator.test.ts
git commit -m "feat(standby): implement galaxy particle data generator"
```

---

### Task 3: Integrate Three.js Particle Galaxy Scene in IntroStandbyOverlay

**Files:**
- Modify: `src/components/IntroStandbyOverlay.tsx`

**Interfaces:**
- Consumes: `generateGalaxyData`, `DEFAULT_GALAXY_PARAMS`
- Produces: Standby Three.js overlay rendering with parallax & complete resource disposal

- [ ] **Step 1: Update `IntroStandbyOverlay.tsx` to mount Three.js Galaxy when `mode === 'standby'`**

Integrate Three.js WebGL canvas setup, scene, points geometry, rotation animation, cursor parallax tilt, and unmount disposal.

- [ ] **Step 2: Run typecheck & tests to verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Verify build**

Run: `npx vite build`
Expected: Successful build.

- [ ] **Step 4: Commit**

```bash
git add src/components/IntroStandbyOverlay.tsx
git commit -m "feat(standby): integrate Three.js Particle Galaxy simulation in standby overlay"
```
