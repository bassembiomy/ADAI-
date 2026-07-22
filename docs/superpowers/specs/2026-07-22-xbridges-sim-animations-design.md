# Design Specification: X-Bridges Simulation Animations Upgrade

**Date:** 2026-07-22
**Status:** Approved by User
**Target Files:**
*   [XBlockNode.tsx](file:///g:/adia project/src/components/xbridges/XBlockNode.tsx)
*   [package.json](file:///g:/adia project/package.json)

---

## 1. Overview & Goals
The objective of this design is to elevate the visual fidelity and user experience of the two key simulations in X-Bridges:
1.  **Washing Machine Discrete Element Method (DEM) Co-Simulation**
2.  **Robot Vacuum Cleaner Digital Twin & SLAM Localization**

Currently, both simulations are rendered using standard Canvas 2D drawings triggered immediately upon receiving simulation physics state updates. This results in visual stutter (due to discrete simulation steps) and plain, hardcoded text-based HUDs.

By introducing **GSAP (GreenSock Animation Platform)** and **floating glassmorphic React overlays**, we will:
*   Smoothly interpolate (60fps) all physical coordinates and metric values.
*   Implement cosmetic particle effects (soap bubbles, suctioned dust, lidar pulses).
*   Create premium, hardware-dashboard style telemetry overlays with slide-in staggers and counting numbers.

---

## 2. Dependencies
To support these premium animations, we will add the following npm packages to `package.json`:
*   `gsap` (core animation library)
*   `@gsap/react` (GSAP hook utility for React components)

---

## 3. Detailed Architecture

### 3.1. DOM Hierarchy Re-Structuring
In `XBlockNode.tsx`, the nodes will render inside a relative container to allow HTML elements to sit on top of the `<canvas>` buffer:
```html
<div className="relative w-[190px] h-[190px] group rounded-lg border border-white/10 overflow-hidden bg-[#020617]">
  <canvas ref={canvasRef} width={190} height={190} className="w-full h-full" />
  <!-- Floating React HUD Overlays go here -->
</div>
```

### 3.2. Value Smoothing & Easing via GSAP
Instead of drawing direct values from `state`, we will read from a mutable React Ref (`smoothState` / `smoothRobot`) that is continuously updated by GSAP on every physics tick.

*   **Washing Machine Parameters Interpolated:** `dx` (suspension horizontal offset), `dy` (suspension vertical offset), `drumAngle`, `rpm`, `cleanliness`, `kineticEnergy`.
*   **Robot Vacuum Parameters Interpolated:** `x`, `y`, `theta` (heading), `x_est` (SLAM estimation x), `y_est` (SLAM estimation y), `theta_est` (SLAM estimation theta), `battery`, `confidence`, `coverage`, `efficiency`, `distance`, `latency`, `loss`.
*   **Tween Settings:** Duration `0.15s` - `0.2s` with `power1.out` easing, providing latency-free responsiveness while rounding out discrete step jumps.

### 3.3. Cosmetic Particle Systems (VFX)

#### Washing Machine: Foam and Soap Bubbles
*   **Trigger:** Drum rotation speed (`rpm` > 10).
*   **Behavior:** Spawn circular soap bubble outlines at random points along the bottom water layer.
*   **GSAP Tween:** Translate bubbles upward (`y` goes up), drift left/right (`x` random wobble), scale up (`r` starts at 1px, grows to 4px), and fade out (`opacity` goes 0.8 -> 0).
*   **Cleanup:** Remove from bubble array on tween completion.

#### Robot Vacuum: Dirt Suction Particle Effect
*   **Setup:** Seed 25 static grey-brown dust particles on the canvas.
*   **Check:** On every frame, check distance of each particle to the robot's smooth center.
*   **Suction Tween:** If distance < 0.45m, initiate a GSAP tween that pulls the particle directly to the vacuum's center coordinates, shrinks it (`scale` -> 0), and fades it out (`opacity` -> 0) over `0.25s` with a fast-in ease (`power2.in`).
*   **Regeneration:** Re-spawn in a random location marked as "uncleaned" in the grid.

---

## 4. HUD UI Specifications

### 4.1. General Styling (Glassmorphism)
All floating HUD panels will share a cohesive design language:
*   Background: Semi-transparent slate (`bg-slate-950/75`)
*   Backdrop filter: Blur (`backdrop-blur-md`)
*   Borders: Subtle white opacity (`border border-white/10`)
*   Shadows: Deep shadows (`shadow-[0_4px_20px_rgba(0,0,0,0.5)]`)
*   Typography: Space-efficient monospace fonts (`font-mono text-[7px]`)

### 4.2. HUD Components (Washing Machine)
*   **Card A (Top-Left):**
    *   Line 1: `RPM: <rolling integer>` (glowing cyan)
    *   Line 2: `SHEETS: <static count>`
    *   Line 3: `PARTICLES: <static count>`
*   **Card B (Bottom-Left):**
    *   Line 1: `KE: <rolling decimal> J` (glowing orange)
*   **Card C (Bottom-Right):**
    *   Line 1: `CLEAN: <rolling decimal>%` (glowing emerald)
    *   Progress Bar: 60px wide bar filling up in emerald matching cleanliness.

### 4.3. HUD Components (Robot Vacuum)
*   **Dashboard Card (Top-Left):**
    *   **Header:** Mode name (e.g. `CLEANING`, `DOCKING`) accompanied by a breathing LED light matching state color.
    *   **Battery Meter:** Color-coded text and a progress fill bar. Pulsates lightning symbols when `isCharging`.
    *   **Metrics Grid:**
        *   `COV: <rolling integer>%`
        *   `EFF: <rolling integer>%`
        *   `DIST: <rolling decimal>m`
        *   `CONF: <rolling integer>%` (flashing red if confidence drops below 60%)
        *   `ERR: <rolling decimal>m` (localization EKF error)
        *   `LAT: <rolling integer>ms`
        *   `LOSS: <rolling integer> pkts`

---

## 5. Verification Plan
*   **Linting & Compile Check:** Run `npm run build` or Vite build to ensure typescript compiles without errors.
*   **Runtime Validation:** Open the application, load the Washing Machine DEM and Robot Vacuum twin workspaces in X-Bridges, run simulations, and visually confirm:
    1.  Floating HUDs slide in on mount.
    2.  Numbers transition smoothly (roll) rather than flickering.
    3.  Robot moves without jumping.
    4.  Soap bubbles rise and pop.
    5.  Dust particles are sucked into the vacuum cleaner.
