# X-Bridges Simulation Animations Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the visual quality of the Washing Machine and Robot Vacuum cleaner simulations in X-Bridges by implementing GSAP-driven coordinates interpolation, particle VFX systems, and beautiful floating glassmorphic HTML HUD cards.

**Architecture:** Wrap `<canvas>` inside absolute/relative DOM containers, interpolate discrete simulation data using `useGSAP` hook into a local Ref, render floating HUD elements as React DOM overlay panels, and use GSAP tweens for numeric count-up and cosmetic particle animations.

**Tech Stack:** React 18, GSAP 3, @gsap/react, Tailwind CSS, Lucide icons, HTML5 Canvas 2D.

## Global Constraints
*   Must use GSAP and `@gsap/react` for all interpolations, numerical rolls, and VFX lifetimes.
*   Must implement floating glassmorphic HTML overlays using Tailwind backdrop blur and transparency.
*   Must interpolate simulator state variables at 60fps.
*   Must ensure typescript types and lint compilation pass cleanly via `npx tsc --noEmit`.

---

### Task 1: Add GSAP and @gsap/react Dependencies

**Files:**
*   Modify: `g:\adia project\package.json`

**Interfaces:**
*   Produces: `gsap` and `@gsap/react` imports for the next tasks.

- [ ] **Step 1: Edit package.json to add dependencies**

Add `"gsap"` and `"@gsap/react"` to `"dependencies"` inside `package.json`.

```diff
   "dependencies": {
     "@capacitor/android": "^8.2.0",
     "@capacitor/cli": "^8.2.0",
     "@capacitor/core": "^8.2.0",
     "@google/generative-ai": "^0.24.1",
+    "@gsap/react": "^2.1.1",
     "@radix-ui/react-checkbox": "^1.3.3",
     "@radix-ui/react-dialog": "^1.1.15",
     "@radix-ui/react-label": "^2.1.8",
     "@radix-ui/react-radio-group": "^1.3.8",
     "@radix-ui/react-scroll-area": "^1.2.10",
     "@radix-ui/react-select": "^2.2.6",
     "@radix-ui/react-separator": "^1.1.8",
     "@radix-ui/react-slot": "^1.2.4",
     "@radix-ui/react-tabs": "^1.1.13",
     "@radix-ui/react-tooltip": "^1.2.8",
     "@tailwindcss/vite": "^4.1.18",
     "@types/dompurify": "^3.0.5",
     "class-variance-authority": "^0.7.1",
     "clsx": "^2.1.1",
     "dompurify": "^3.4.11",
     "electron-squirrel-startup": "^1.0.1",
+    "gsap": "^3.12.5",
     "html2canvas": "^1.4.1",
     "jspdf": "^4.2.1",
     "jszip": "^3.10.1",
```

- [ ] **Step 2: Run npm install**

Run:
```powershell
npm install
```
Expected: Packages install successfully without errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add package.json package-lock.json
git commit -m "feat: add gsap and @gsap/react dependencies"
```

---

### Task 2: Refactor Washing Machine Canvas, Add Bubble VFX and Floating HUD Overlay

**Files:**
*   Modify: `g:\adia project\src\components\xbridges\XBlockNode.tsx`

**Interfaces:**
*   Consumes: `gsap` and `@gsap/react` installed in Task 1.

- [ ] **Step 1: Refactor imports and implement WashingMachineDEMCanvas state smoothing, Bubble generator, and Glassmorphic HUD overlay**

Edit `src/components/xbridges/XBlockNode.tsx` around line 594. Replace the old `WashingMachineDEMCanvas` with the upgraded GSAP version.

```typescript
// Replace lines 594 - 996 in XBlockNode.tsx with this implementation:

import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

interface SoapBubble {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

const WashingMachineDEMCanvas: React.FC<{ state: any }> = ({ state }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stateRef = React.useRef(state);
  const bubblesRef = React.useRef<SoapBubble[]>([]);

  // Telemetry refs for GSAP count-ups
  const rpmRef = React.useRef<HTMLSpanElement>(null);
  const keRef = React.useRef<HTMLSpanElement>(null);
  const cleanRef = React.useRef<HTMLSpanElement>(null);
  const cleanBarRef = React.useRef<HTMLDivElement>(null);

  // local smooth state for 60fps canvas drawing
  const smoothState = React.useRef({
    dx: 0,
    dy: 0,
    drumAngle: 0,
    rpm: 45,
    cleanliness: 0,
    kineticEnergy: 0,
  });

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // GSAP tween for smoothing the incoming simulation steps
  useGSAP(() => {
    if (!state) return;

    // Calculate live kinetic energy from incoming particle velocities
    let targetKE = 0;
    const particles = state.particles || [];
    if (particles.length > 0) {
      const mass = state.clothes_weight ? state.clothes_weight / particles.length : 0.1;
      particles.forEach((p: any) => {
        targetKE += 0.5 * mass * (p.vx * p.vx + p.vy * p.vy);
      });
    }

    const currentRpm = Math.round(state.drum_angle ? (state.drum_angle * 60) / (2 * Math.PI * (performance.now() * 0.001)) : 45);

    // Tween the drawing variables smoothly
    gsap.to(smoothState.current, {
      dx: state.dx !== undefined && !isNaN(state.dx) ? state.dx : 0,
      dy: state.dy !== undefined && !isNaN(state.dy) ? state.dy : 0,
      drumAngle: state.drum_angle !== undefined && !isNaN(state.drum_angle) ? state.drum_angle : 0,
      rpm: targetRpm || 45,
      cleanliness: state.cleanliness !== undefined && !isNaN(state.cleanliness) ? state.cleanliness : 0,
      kineticEnergy: targetKE,
      duration: 0.15,
      ease: 'power1.out',
      overwrite: 'auto',
    });

    // Tween the HUD cleanliness display percentage & progress bar width
    if (cleanRef.current) {
      gsap.to(cleanRef.current, {
        innerText: state.cleanliness !== undefined && !isNaN(state.cleanliness) ? state.cleanliness : 0,
        snap: { innerText: 0.1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: {
          innerText: (val) => `${parseFloat(val).toFixed(1)}%`,
        },
      });
    }

    if (cleanBarRef.current) {
      const cleanVal = state.cleanliness !== undefined && !isNaN(state.cleanliness) ? state.cleanliness : 0;
      gsap.to(cleanBarRef.current, {
        width: `${cleanVal}%`,
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Tween HUD RPM text
    if (rpmRef.current) {
      gsap.to(rpmRef.current, {
        innerText: currentRpm || 45,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Tween HUD KE text
    if (keRef.current) {
      gsap.to(keRef.current, {
        innerText: targetKE,
        snap: { innerText: 0.001 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: {
          innerText: (val) => `${parseFloat(val).toFixed(3)} J`,
        },
      });
    }
  }, [state]);

  // Entrance animations for glassmorphic cards
  useGSAP(() => {
    gsap.from('.hud-card-wm', {
      y: 10,
      opacity: 0,
      duration: 0.5,
      stagger: 0.08,
      ease: 'back.out(1.5)',
    });
  }, { scope: containerRef });

  // Bubble spawner and draw execution
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      const s = smoothState.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Clear with sleek dark blue background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, W, H);

      const currentState = stateRef.current;
      if (!currentState || !currentState.initialized) {
        ctx.fillStyle = '#475569';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAITING FOR DEM STEP', W / 2, H / 2);
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      const R_d = 0.8;
      const scale = (W - 24) / (2 * R_d);

      // Dynamic vibration offset from suspension model (Smoothly interpolated)
      const dx_offset = s.dx * scale * 50;
      const dy_offset = s.dy * scale * 50;
      const cx = W / 2 + Math.max(-15, Math.min(15, dx_offset));
      const cy = H / 2 - Math.max(-15, Math.min(15, dy_offset));

      const toCanvasX = (x: number) => cx + x * scale;
      const toCanvasY = (y: number) => cy - y * scale;
      const toCanvasLength = (l: number) => l * scale;

      const drumAngle = s.drumAngle;
      const particles = currentState.particles || [];
      const bonds = currentState.bonds || [];
      const numSheets = currentState.num_sheets || 2;
      const gridRows = currentState.grid_rows || 4;
      const gridCols = currentState.grid_cols || 4;
      const clothSize = gridRows * gridCols;
      const fluidParticles = currentState.fluidParticles || [];

      // 1. Draw Water Fluid Phase (SPH/Sloshing Wave)
      if (fluidParticles.length === 0) {
        const fill = 0.35;
        const Y_water = -R_d + 2 * R_d * fill;
        const canvasY_water = toCanvasY(Y_water);
        
        const waveFreq = 0.005;
        const waveAmp = 5;
        const waveOffset = Math.sin(now * waveFreq + drumAngle) * waveAmp;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, toCanvasLength(R_d), 0, 2 * Math.PI);
        ctx.clip();

        const waterGrad = ctx.createLinearGradient(0, canvasY_water + waveOffset, 0, H);
        waterGrad.addColorStop(0, 'rgba(14, 165, 233, 0.4)');
        waterGrad.addColorStop(1, 'rgba(3, 105, 161, 0.65)');
        ctx.fillStyle = waterGrad;

        ctx.beginPath();
        ctx.moveTo(0, canvasY_water + waveOffset);
        for (let x = 0; x <= W; x += 10) {
          const sineY = Math.sin((x / W) * Math.PI * 2 + now * 0.003) * 3;
          ctx.lineTo(x, canvasY_water + waveOffset + sineY);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();

        // Spawn bubbles periodically if rotating
        if (Math.abs(s.rpm) > 10 && Math.random() < 0.12) {
          const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 1.0;
          const bubbleX = cx + toCanvasLength(R_d) * Math.cos(angle) * 0.8;
          const bubbleY = cy + toCanvasLength(R_d) * Math.sin(angle) * 0.8;
          const bObj = { x: bubbleX, y: bubbleY, r: 1, opacity: 0.7 };
          bubblesRef.current.push(bObj);
          
          gsap.to(bObj, {
            y: bubbleY - (Math.random() * 40 + 20),
            x: bubbleX + (Math.random() - 0.5) * 15,
            r: Math.random() * 3 + 2,
            opacity: 0,
            duration: Math.random() * 1.2 + 0.8,
            ease: 'power1.out',
            onComplete: () => {
              bubblesRef.current = bubblesRef.current.filter(b => b !== bObj);
            }
          });
        }

        // Draw GSAP cosmetic soap bubbles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.5;
        bubblesRef.current.forEach(bubble => {
          if (Math.pow(bubble.x - cx, 2) + Math.pow(bubble.y - cy, 2) < Math.pow(toCanvasLength(R_d - 0.05), 2)) {
            ctx.save();
            ctx.globalAlpha = bubble.opacity;
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, bubble.r, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        });

        // Foam elements on water surface
        for (let x = 10; x < W - 10; x += 15) {
          const sineY = Math.sin((x / W) * Math.PI * 2 + now * 0.003) * 3;
          const foamY = canvasY_water + waveOffset + sineY;
          const count = 3;
          for (let b = 0; b < count; b++) {
            const bx = x + Math.sin(now * 0.002 + b) * 4;
            const by = foamY + Math.cos(now * 0.002 + b) * 2 - 2;
            const br = 2 + (Math.sin(bx * 0.05 + now * 0.001) + 1) * 2;
            if (Math.pow(bx - cx, 2) + Math.pow(by - cy, 2) < Math.pow(toCanvasLength(R_d - 0.05), 2)) {
              ctx.beginPath();
              ctx.arc(bx, by, br, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            }
          }
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 8; i++) {
          const bx = cx + Math.sin(i * 1.7 + now * 0.001) * toCanvasLength(R_d * 0.7);
          const by = cy + (0.3 + 0.5 * Math.cos(i * 2.3 + now * 0.001)) * toCanvasLength(R_d);
          if (Math.pow(bx - cx, 2) + Math.pow(by - cy, 2) < Math.pow(toCanvasLength(R_d - 0.1), 2)) {
            ctx.beginPath();
            ctx.arc(bx, by, 1.5 + (i % 3), 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // Draw SPH fluid particles if present
      if (fluidParticles.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 1;
        const fRad = Math.max(2, toCanvasLength(0.025));

        fluidParticles.forEach((p: any) => {
          if (!p || isNaN(p.x) || isNaN(p.y)) return;
          const fx = toCanvasX(p.x);
          const fy = toCanvasY(p.y);
          if (Math.pow(fx - cx, 2) + Math.pow(fy - cy, 2) < Math.pow(toCanvasLength(R_d + 0.05), 2)) {
            ctx.beginPath();
            ctx.arc(fx, fy, fRad, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(fx - fRad / 3, fy - fRad / 3, fRad * 0.25, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
          }
        });
        ctx.restore();
      }

      // 2. Draw Rotating Drum Geometry
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, toCanvasLength(R_d), 0, 2 * Math.PI);
      ctx.stroke();

      const numRibs = 3;
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < numRibs; i++) {
        const angle = drumAngle + (i * 2 * Math.PI) / numRibs;
        const rx = R_d * Math.cos(angle);
        const ry = R_d * Math.sin(angle);
        const tipLen = 0.15;
        const rtx = (R_d - tipLen) * Math.cos(angle);
        const rty = (R_d - tipLen) * Math.sin(angle);
        const baseWidth = 0.08;
        const b1x = R_d * Math.cos(angle - baseWidth);
        const b1y = R_d * Math.sin(angle - baseWidth);
        const b2x = R_d * Math.cos(angle + baseWidth);
        const b2y = R_d * Math.sin(angle + baseWidth);

        ctx.beginPath();
        ctx.moveTo(toCanvasX(b1x), toCanvasY(b1y));
        ctx.lineTo(toCanvasX(rtx), toCanvasY(rty));
        ctx.lineTo(toCanvasX(b2x), toCanvasY(b2y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 2b. Draw Central Pulsator Hub
      if (currentState.has_pulsator) {
        const pRad = toCanvasLength(R_d * 0.22);
        const pGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, pRad);
        pGrad.addColorStop(0, '#334155');
        pGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = pGrad;
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, pRad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        const numFins = 3;
        const pulsAngle = currentState.pulsator_angle || 0;
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.2;
        for (let f = 0; f < numFins; f++) {
          const theta = pulsAngle + (f * 2 * Math.PI) / numFins;
          const tipLen = pRad * 0.5;
          const ftx = (pRad + tipLen) * Math.cos(theta);
          const fty = (pRad + tipLen) * Math.sin(theta);
          const baseWidth = 0.08;
          const fb1x = pRad * Math.cos(theta - baseWidth);
          const fb1y = pRad * Math.sin(theta - baseWidth);
          const fb2x = pRad * Math.cos(theta + baseWidth);
          const fb2y = pRad * Math.sin(theta + baseWidth);

          ctx.beginPath();
          ctx.moveTo(toCanvasX(fb1x), toCanvasY(fb1y));
          ctx.lineTo(toCanvasX(ftx), toCanvasY(fty));
          ctx.lineTo(toCanvasX(fb2x), toCanvasY(fb2y));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // 3. Draw Cloth Fabric Meshes
      for (let c = 0; c < numSheets; c++) {
        const offset = c * clothSize;
        if (offset + clothSize > particles.length) continue;

        for (let row = 0; row < gridRows - 1; row++) {
          for (let col = 0; col < gridCols - 1; col++) {
            const iA = offset + row * gridCols + col;
            const iB = offset + row * gridCols + (col + 1);
            const iC = offset + (row + 1) * gridCols + (col + 1);
            const iD = offset + (row + 1) * gridCols + col;

            const pA = particles[iA];
            const pB = particles[iB];
            const pC = particles[iC];
            const pD = particles[iD];

            if (pA && pB && pC && pD && !isNaN(pA.x) && !isNaN(pA.y) && !isNaN(pB.x) && !isNaN(pB.y) && !isNaN(pC.x) && !isNaN(pC.y) && !isNaN(pD.x) && !isNaN(pD.y)) {
              ctx.beginPath();
              ctx.moveTo(toCanvasX(pA.x), toCanvasY(pA.y));
              ctx.lineTo(toCanvasX(pB.x), toCanvasY(pB.y));
              ctx.lineTo(toCanvasX(pC.x), toCanvasY(pC.y));
              ctx.lineTo(toCanvasX(pD.x), toCanvasY(pD.y));
              ctx.closePath();
              const hue = (c * 137.5 + 200) % 360;
              ctx.fillStyle = `hsla(${hue}, 75%, 65%, 0.4)`;
              ctx.fill();
            }
          }
        }
      }

      // 4. Draw Bond Fabric Mesh
      ctx.lineWidth = 1.8;
      bonds.forEach((bond: any) => {
        const idx1 = bond.i1 !== undefined ? bond.i1 : bond.p1;
        const idx2 = bond.i2 !== undefined ? bond.i2 : bond.p2;
        const L0 = bond.L0 !== undefined ? bond.L0 : bond.restLength;
        const p1 = particles[idx1];
        const p2 = particles[idx2];
        if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) return;

        const x1 = toCanvasX(p1.x);
        const y1 = toCanvasY(p1.y);
        const x2 = toCanvasX(p2.x);
        const y2 = toCanvasY(p2.y);
        const currentL = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        const strain = Math.abs(currentL - L0) / (L0 || 1e-5);
        const t = Math.min(1.0, strain * 4.0); 
        ctx.strokeStyle = `rgba(${Math.floor(40 + t * 215)}, ${Math.floor(200 - t * 150)}, ${Math.floor(100 - t * 50)}, 0.8)`;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // 5. Draw Cloth Particles (Mesh Nodes)
      const pRadius = currentState.radius || 0.05;
      const drawRad = toCanvasLength(pRadius) * 0.7;

      particles.forEach((p: any) => {
        if (!p || isNaN(p.x) || isNaN(p.y)) return;
        const px = toCanvasX(p.x);
        const py = toCanvasY(p.y);
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const hue = Math.max(0, Math.min(240, 240 - (speed / 1.5) * 240));
        
        const radGrad = ctx.createRadialGradient(
          px - drawRad / 3, py - drawRad / 3, drawRad * 0.1,
          px, py, drawRad
        );
        radGrad.addColorStop(0, `hsl(${hue}, 100%, 75%)`);
        radGrad.addColorStop(0.4, `hsl(${hue}, 90%, 50%)`);
        radGrad.addColorStop(1, `hsl(${hue}, 100%, 25%)`);

        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(px, py, drawRad, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(px - drawRad/3, py - drawRad/3, drawRad * 0.2, 0, 2 * Math.PI);
        ctx.fill();

        if (speed > 0.1) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (p.vx / speed) * (drawRad * 1.5), py - (p.vy / speed) * (drawRad * 1.5));
          ctx.stroke();
        }
      });

      // 6. Draw Glass Door Rim
      const rimRad = toCanvasLength(R_d + 0.05);
      const doorGrad = ctx.createRadialGradient(cx, cy, rimRad * 0.85, cx, cy, rimRad);
      doorGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
      doorGrad.addColorStop(0.8, 'rgba(148, 163, 184, 0.15)');
      doorGrad.addColorStop(1, 'rgba(148, 163, 184, 0.4)');
      
      ctx.fillStyle = doorGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, rimRad, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, rimRad * 0.9, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const particlesCount = state?.particles?.length || 0;
  const numSheets = state?.num_sheets || 2;
  const gridRows = state?.grid_rows || 4;
  const gridCols = state?.grid_cols || 4;

  return (
    <div ref={containerRef} className="relative w-[190px] h-[190px] group rounded-lg border border-white/10 overflow-hidden bg-[#020617] shadow-inner select-none">
      {/* 2D Canvas Layer */}
      <canvas
        ref={canvasRef}
        width={190}
        height={190}
        className="w-full h-full block"
      />

      {/* Floating Glassmorphic HUD Overlays */}
      
      {/* Top-Left Telemetry Badge */}
      <div className="hud-card-wm absolute top-1.5 left-1.5 px-2 py-1 rounded bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-lg text-[6.5px] font-mono text-slate-300 pointer-events-none flex flex-col gap-0.5 z-20">
        <div className="flex gap-1.5 justify-between">
          <span className="text-slate-400">RPM:</span>
          <span ref={rpmRef} className="text-sky-400 font-bold drop-shadow-[0_0_4px_rgba(56,189,248,0.2)]">45</span>
        </div>
        <div className="flex gap-1.5 justify-between">
          <span className="text-slate-400">SHEETS:</span>
          <span className="text-slate-200">{numSheets} ({gridRows}x{gridCols})</span>
        </div>
        <div className="flex gap-1.5 justify-between">
          <span className="text-slate-400">PARTS:</span>
          <span className="text-slate-200">{particlesCount}</span>
        </div>
      </div>

      {/* Bottom-Left Kinetic Energy Badge */}
      <div className="hud-card-wm absolute bottom-1.5 left-1.5 px-2 py-1 rounded bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-lg text-[6.5px] font-mono text-slate-300 pointer-events-none z-20">
        <div className="flex gap-1.5 items-center">
          <span className="text-slate-400">KE:</span>
          <span ref={keRef} className="text-amber-400 font-bold drop-shadow-[0_0_4px_rgba(245,158,11,0.2)]">0.000 J</span>
        </div>
      </div>

      {/* Bottom-Right Cleanliness Bar */}
      <div className="hud-card-wm absolute bottom-1.5 right-1.5 w-[75px] p-1.5 rounded bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-lg pointer-events-none flex flex-col gap-1 z-20">
        <div className="flex justify-between items-center text-[6px] font-mono leading-none">
          <span className="text-slate-400 uppercase tracking-wider">CLEAN</span>
          <span ref={cleanRef} className="text-emerald-400 font-black drop-shadow-[0_0_4px_rgba(16,185,129,0.3)]">0.0%</span>
        </div>
        {/* Progress Bar Container */}
        <div className="w-full h-1 bg-slate-800/80 rounded overflow-hidden">
          <div ref={cleanBarRef} className="h-full bg-emerald-500 w-0 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Run build to verify TypeScript compilation**

Run:
```powershell
npx tsc --noEmit
```
Expected: The typescript compiler returns 0 errors, showing that variables and imports are correct.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/components/xbridges/XBlockNode.tsx
git commit -m "feat: upgrade WashingMachineDEMCanvas with GSAP, bubbles particle VFX, and glassmorphic HUD"
```

---

### Task 3: Refactor Robot Vacuum Canvas, Add Suction Dust Particle VFX and Floating HUD

**Files:**
*   Modify: `g:\adia project\src\components\xbridges\XBlockNode.tsx`

**Interfaces:**
*   Consumes: GSAP animation primitives implemented in Task 2.

- [ ] **Step 1: Implement RobotTwinCanvas coordinate smoothing, Dust particle suction VFX, and Floating Dashboard Overlay**

Edit `src/components/xbridges/XBlockNode.tsx` around line 83. Replace the old `RobotTwinCanvas` with the upgraded GSAP version.

```typescript
// Replace lines 83 - 583 in XBlockNode.tsx with this implementation:

interface DustParticle {
  id: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  isSucked: boolean;
}

const RobotTwinCanvas: React.FC<{ state: any }> = ({ state }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stateRef = React.useRef(state);
  const dustParticlesRef = React.useRef<DustParticle[]>([]);

  // Telemetry HUD refs
  const stateTextRef = React.useRef<HTMLSpanElement>(null);
  const batTextRef = React.useRef<HTMLSpanElement>(null);
  const batBarRef = React.useRef<HTMLDivElement>(null);
  const covRef = React.useRef<HTMLSpanElement>(null);
  const effRef = React.useRef<HTMLSpanElement>(null);
  const distRef = React.useRef<HTMLSpanElement>(null);
  const confRef = React.useRef<HTMLSpanElement>(null);
  const errRef = React.useRef<HTMLSpanElement>(null);
  const latRef = React.useRef<HTMLSpanElement>(null);
  const lossRef = React.useRef<HTMLSpanElement>(null);

  // Local Ref representing the smoothly interpolated variables
  const smoothRobot = React.useRef({
    x: 0,
    y: 0,
    theta: 0,
    x_est: 0,
    y_est: 0,
    theta_est: 0,
    battery: 100,
    confidence: 100,
    coverage: 0,
    efficiency: 100,
    distance: 0,
    latency: 50,
    loss: 0
  });

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Seed cosmetic dust particles on first load
  React.useEffect(() => {
    const list: DustParticle[] = [];
    for (let i = 0; i < 30; i++) {
      list.push({
        id: i,
        x: (Math.random() - 0.5) * 5.0, // Spread across map
        y: (Math.random() - 0.5) * 5.0,
        scale: Math.random() * 1.5 + 1.0,
        opacity: Math.random() * 0.4 + 0.3,
        isSucked: false
      });
    }
    dustParticlesRef.current = list;
  }, []);

  // Tween incoming discrete simulation updates to 60fps values
  useGSAP(() => {
    if (!state) return;
    const navStats = state.nav_stats || [0, 100, 0, 100];
    const commStats = state.comm_stats || [50, 0, 0];

    gsap.to(smoothRobot.current, {
      x: state.x !== undefined && !isNaN(state.x) ? state.x : 0,
      y: state.y !== undefined && !isNaN(state.y) ? state.y : 0,
      theta: state.theta !== undefined && !isNaN(state.theta) ? state.theta : 0,
      x_est: state.x_est !== undefined && !isNaN(state.x_est) ? state.x_est : 0,
      y_est: state.y_est !== undefined && !isNaN(state.y_est) ? state.y_est : 0,
      theta_est: state.theta_est !== undefined && !isNaN(state.theta_est) ? state.theta_est : 0,
      battery: state.battery_level !== undefined && !isNaN(state.battery_level) ? state.battery_level : 100,
      confidence: state.confidence !== undefined && !isNaN(state.confidence) ? state.confidence : 100,
      coverage: navStats[0] !== undefined ? navStats[0] : 0,
      efficiency: navStats[1] !== undefined ? navStats[1] : 100,
      distance: navStats[2] !== undefined ? navStats[2] : 0,
      latency: commStats[0] !== undefined ? commStats[0] : 50,
      loss: commStats[1] !== undefined ? commStats[1] : 0,
      duration: 0.15,
      ease: 'power1.out',
      overwrite: 'auto'
    });

    // Tween HUD Numbers
    if (batTextRef.current) {
      gsap.to(batTextRef.current, {
        innerText: state.battery_level !== undefined ? state.battery_level : 100,
        snap: { innerText: 1 },
        duration: 0.3,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (batBarRef.current) {
      gsap.to(batBarRef.current, {
        width: `${state.battery_level ?? 100}%`,
        duration: 0.3,
        ease: 'power2.out'
      });
    }

    if (covRef.current) {
      gsap.to(covRef.current, {
        innerText: navStats[0] ?? 0,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (effRef.current) {
      gsap.to(effRef.current, {
        innerText: navStats[1] ?? 100,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (distRef.current) {
      gsap.to(distRef.current, {
        innerText: navStats[2] ?? 0,
        snap: { innerText: 0.1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(1)}m` }
      });
    }

    if (confRef.current) {
      gsap.to(confRef.current, {
        innerText: state.confidence ?? 100,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (errRef.current) {
      const trueX = state.x ?? 0;
      const trueY = state.y ?? 0;
      const estX = state.x_est ?? 0;
      const estY = state.y_est ?? 0;
      const posErr = Math.sqrt(Math.pow(trueX - estX, 2) + Math.pow(trueY - estY, 2));

      gsap.to(errRef.current, {
        innerText: posErr,
        snap: { innerText: 0.01 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(2)}m` }
      });
    }

    if (latRef.current) {
      gsap.to(latRef.current, {
        innerText: commStats[0] ?? 50,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}ms` }
      });
    }

    if (lossRef.current) {
      gsap.to(lossRef.current, {
        innerText: commStats[1] ?? 0,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)} pkts` }
      });
    }
  }, [state]);

  // Slide-in animation on mount
  useGSAP(() => {
    gsap.from('.hud-card-robot', {
      x: -25,
      opacity: 0,
      duration: 0.6,
      ease: 'back.out(1.4)'
    });
  }, { scope: containerRef });

  // Render loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      const s = smoothRobot.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Clear
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);

      const currentState = stateRef.current;
      if (!currentState) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAITING FOR SIMULATION', W / 2, H / 2);
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      // Check if we should use Matlab coordinates range [-6.0, 6.0]
      const isMatlabActive = Math.abs(currentState.x || 0) > 3.05 || Math.abs(currentState.y || 0) > 3.05;
      const minVal = isMatlabActive ? -6.0 : -3.0;
      const sizeVal = isMatlabActive ? 12.0 : 6.0;

      const scaleX = (x: number) => 10 + (x - minVal) / sizeVal * (W - 20);
      const scaleY = (y: number) => H - 10 - (y - minVal) / sizeVal * (H - 20);
      const scaleR = (r: number) => r / sizeVal * (W - 20);

      // Check suction for cosmetic dust particles
      dustParticlesRef.current.forEach(p => {
        if (p.isSucked) return;
        const dist = Math.sqrt(Math.pow(p.x - s.x, 2) + Math.pow(p.y - s.y, 2));
        if (dist < 0.4) {
          p.isSucked = true;
          gsap.to(p, {
            x: s.x,
            y: s.y,
            scale: 0,
            opacity: 0,
            duration: 0.25,
            ease: 'power2.in',
            onComplete: () => {
              // Re-spawn in uncleaned area
              let spawned = false;
              const grid = currentState.cleanedGrid;
              if (grid && Array.isArray(grid)) {
                for (let retry = 0; retry < 10; retry++) {
                  const r = Math.floor(Math.random() * 30);
                  const c = Math.floor(Math.random() * 30);
                  if (grid[r][c] === 0) {
                    p.x = minVal + (c / 30) * sizeVal;
                    p.y = minVal + (r / 30) * sizeVal;
                    spawned = true;
                    break;
                  }
                }
              }
              if (!spawned) {
                p.x = (Math.random() - 0.5) * sizeVal;
                p.y = (Math.random() - 0.5) * sizeVal;
              }
              p.scale = Math.random() * 1.5 + 1.0;
              p.opacity = Math.random() * 0.4 + 0.3;
              p.isSucked = false;
            }
          });
        }
      });

      // 1. Draw SLAM occupancy grid
      const grid = currentState.grid;
      if (grid && Array.isArray(grid)) {
        const cellW = (W - 20) / 30;
        const cellH = (H - 20) / 30;
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            const val = grid[r][c];
            if (val !== 0) {
              if (val > 0) {
                ctx.fillStyle = `rgba(249, 115, 22, ${Math.min(0.65, val / 100)})`;
              } else {
                ctx.fillStyle = `rgba(51, 65, 85, ${Math.min(0.4, -val / 100)})`;
              }
              const cx_cell = 10 + c * cellW;
              const cy_cell = H - 10 - (r + 1) * cellH;
              ctx.fillRect(cx_cell, cy_cell, cellW, cellH);
            }
          }
        }
      }

      // 1.5 Draw Coverage grid (Cleaned Grid)
      const cleanedGrid = currentState.cleanedGrid;
      if (cleanedGrid && Array.isArray(cleanedGrid)) {
        const cellW = (W - 20) / 30;
        const cellH = (H - 20) / 30;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            if (cleanedGrid[r][c] === 1) {
              const cx_cell = 10 + c * cellW;
              const cy_cell = H - 10 - (r + 1) * cellH;
              ctx.fillRect(cx_cell, cy_cell, cellW, cellH);
            }
          }
        }
      }

      // Draw subtle grid overlay texture
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 0.5;
      const gridStep = isMatlabActive ? 1.0 : 0.5;
      for (let x = minVal; x <= -minVal; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(scaleX(x), scaleY(minVal));
        ctx.lineTo(scaleX(x), scaleY(-minVal));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(scaleX(minVal), scaleY(x));
        ctx.lineTo(scaleX(-minVal), scaleY(x));
        ctx.stroke();
      }

      // Draw active dust particles
      dustParticlesRef.current.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = '#857262';
        ctx.beginPath();
        ctx.arc(scaleX(p.x), scaleY(p.y), p.scale * 0.7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      });

      const walls = isMatlabActive ? MATLAB_WALLS : ROOM_WALLS;
      const circles = isMatlabActive ? MATLAB_OBSTACLES : ROOM_CIRCLES;
      const boxes = isMatlabActive ? [] : ROOM_BOXES;

      // Draw Multi-room boundaries
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.0;
      walls.forEach(w => {
        ctx.beginPath();
        ctx.moveTo(scaleX(w.x1), scaleY(w.y1));
        ctx.lineTo(scaleX(w.x2), scaleY(w.y2));
        ctx.stroke();
      });

      // 2. Draw Obstacles
      const obstacleGlow = 0.04 * Math.sin(now * 0.003);
      circles.forEach((c, idx) => {
        ctx.fillStyle = `rgba(51, 65, 85, ${0.15 + obstacleGlow})`;
        ctx.strokeStyle = `rgba(148, 163, 184, ${0.25 + 0.05 * Math.sin(now * 0.002 + idx)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(scaleX(c.cx), scaleY(c.cy), scaleR(c.r + 0.06 * Math.sin(now * 0.003 + idx)), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        const grad = ctx.createRadialGradient(
          scaleX(c.cx) - scaleR(c.r)/3, scaleY(c.cy) - scaleR(c.r)/3, scaleR(c.r)*0.1,
          scaleX(c.cx), scaleY(c.cy), scaleR(c.r)
        );
        grad.addColorStop(0, '#475569');
        grad.addColorStop(1, '#1e293b');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(scaleX(c.cx), scaleY(c.cy), scaleR(c.r), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });

      boxes.forEach((b, idx) => {
        const bx = scaleX(b.x1);
        const by = scaleY(b.y2);
        const bw = scaleR(b.x2 - b.x1);
        const bh = scaleR(b.y2 - b.y1);

        ctx.fillStyle = `rgba(51, 65, 85, ${0.15 + obstacleGlow})`;
        ctx.strokeStyle = `rgba(148, 163, 184, ${0.25 + 0.05 * Math.sin(now * 0.002 - idx)})`;
        ctx.lineWidth = 1;
        const grow = 2 + 2 * Math.sin(now * 0.003 - idx);
        ctx.fillRect(bx - grow, by - grow, bw + 2*grow, bh + 2*grow);
        ctx.strokeRect(bx - grow, by - grow, bw + 2*grow, bh + 2*grow);

        const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        grad.addColorStop(0, '#475569');
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let offset = 4; offset < bw; offset += 8) {
          ctx.moveTo(bx + offset, by);
          ctx.lineTo(bx, by + offset);
          ctx.moveTo(bx + bw, by + offset);
          ctx.lineTo(bx + offset, by + bh);
        }
        ctx.stroke();
      });

      // 3. Docking station signal beacons
      const isDocking = currentState.navState === 8;
      const isCharging = currentState.navState === 9;
      const dockPulseRadius = ((now * 0.05) % 60);
      const dockAlpha = 1 - (dockPulseRadius / 60);
      const dockX = isMatlabActive ? -5.1 : 0.0;
      const dockY = isMatlabActive ? -5.1 : -2.8;

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(scaleX(dockX), scaleY(dockY), 5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = `rgba(16, 185, 129, ${dockAlpha * (isDocking || isCharging ? 0.8 : 0.35)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scaleX(dockX), scaleY(dockY), 5 + dockPulseRadius, 0, 2 * Math.PI);
      ctx.stroke();

      if (isDocking || isCharging) {
        ctx.beginPath();
        ctx.arc(scaleX(dockX), scaleY(dockY), 5 + (dockPulseRadius + 30) % 60, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('D', scaleX(dockX), scaleY(dockY));

      // Draw active path targets
      if (currentState.targetX !== undefined && currentState.targetY !== undefined && currentState.navState !== 1) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(scaleX(s.x), scaleY(s.y));
        ctx.lineTo(scaleX(currentState.targetX), scaleY(currentState.targetY));
        ctx.stroke();
        ctx.setLineDash([]);

        const targetPulse = 3.5 + 2 * Math.sin(now * 0.01);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.5 + 0.4 * Math.sin(now * 0.01)})`;
        ctx.beginPath();
        ctx.arc(scaleX(currentState.targetX), scaleY(currentState.targetY), targetPulse, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(scaleX(currentState.targetX), scaleY(currentState.targetY), 2.2, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Pre-planned sweep path waypoints
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scaleX(WAYPOINTS[0].x), scaleY(WAYPOINTS[0].y));
      for (let i = 1; i < WAYPOINTS.length; i++) {
        ctx.lineTo(scaleX(WAYPOINTS[i].x), scaleY(WAYPOINTS[i].y));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Robot paths: true trail (smoothly drawn via interpolated path coordinates)
      const trail = currentState.trail;
      if (trail && Array.isArray(trail) && trail.length > 1) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.0;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(scaleX(trail[0][0]), scaleY(trail[0][1]));
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(scaleX(trail[i][0]), scaleY(trail[i][1]));
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Robot paths: estimated trail (amber)
      const estTrail = currentState.estTrail;
      if (estTrail && Array.isArray(estTrail) && estTrail.length > 1) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(scaleX(estTrail[0][0]), scaleY(estTrail[0][1]));
        for (let i = 1; i < estTrail.length; i++) {
          ctx.lineTo(scaleX(estTrail[i][0]), scaleY(estTrail[i][1]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 4. LiDAR active scan rays + ripples
      const ranges = currentState.lidarRanges;
      if (ranges && Array.isArray(ranges)) {
        const numBeams = ranges.length;
        const beamAngles = [];
        for (let i = 0; i < numBeams; i++) {
          beamAngles.push((i * 2 * Math.PI) / numBeams);
        }
        
        const sweepAngle = (now * 0.004) % (2 * Math.PI);
        const ldsMaxRange = 4.0;
        const sweepDist = raycastTwin(s.x, s.y, sweepAngle, ldsMaxRange, 0);
        const sx_hit = s.x + sweepDist * Math.cos(sweepAngle);
        const sy_hit = s.y + sweepDist * Math.sin(sweepAngle);

        const laserGrad = ctx.createLinearGradient(
          scaleX(s.x), scaleY(s.y),
          scaleX(sx_hit), scaleY(sy_hit)
        );
        laserGrad.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
        laserGrad.addColorStop(0.8, 'rgba(249, 115, 22, 0.2)');
        laserGrad.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
        ctx.strokeStyle = laserGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(scaleX(s.x), scaleY(s.y));
        ctx.lineTo(scaleX(sx_hit), scaleY(sy_hit));
        ctx.stroke();

        ctx.fillStyle = '#f97316';
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(scaleX(sx_hit), scaleY(sy_hit), 2.0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;

        for (let i = 0; i < ranges.length; i++) {
          const absAngle = s.theta + beamAngles[i];
          const r = ranges[i];
          const lx = s.x + r * Math.cos(absAngle);
          const ly = s.y + r * Math.sin(absAngle);

          ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(scaleX(s.x), scaleY(s.y));
          ctx.lineTo(scaleX(lx), scaleY(ly));
          ctx.stroke();

          const waveSpeed = 1000;
          const wavePhase = (now % waveSpeed) / waveSpeed;
          const pulseDist = r * wavePhase;
          const px_wave = s.x + pulseDist * Math.cos(absAngle);
          const py_wave = s.y + pulseDist * Math.sin(absAngle);

          ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.beginPath();
          ctx.arc(scaleX(px_wave), scaleY(py_wave), 1.2, 0, 2 * Math.PI);
          ctx.fill();

          const impactRipple = ((now * 0.02) % 6);
          const impactAlpha = 1 - (impactRipple / 6);
          ctx.strokeStyle = `rgba(239, 68, 68, ${impactAlpha * 0.75})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(scaleX(lx), scaleY(ly), impactRipple, 0, 2 * Math.PI);
          ctx.stroke();

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(scaleX(lx), scaleY(ly), 1.8, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // 5. Sleek True Robot Chassis (Xiaomi style!)
      const rx = scaleX(s.x);
      const ry = scaleY(s.y);
      const rr = scaleR(0.15);

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, -s.theta - Math.PI/2, -s.theta + Math.PI/2);
      ctx.stroke();

      const isMoving = trail && trail.length > 1 && 
        (Math.abs(s.x - trail[trail.length - 2][0]) > 0.002 || 
         Math.abs(s.y - trail[trail.length - 2][1]) > 0.002);
      const brushAngle = isMoving ? (now * 0.02) % (2 * Math.PI) : 0;
      
      const drawBrush = (angleOffset: number) => {
        const brushX = rx + rr * Math.cos(-s.theta + angleOffset);
        const brushY = ry + rr * Math.sin(-s.theta + angleOffset);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        for (let b = 0; b < 3; b++) {
          const bAngle = brushAngle + (b * 2 * Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(brushX, brushY);
          ctx.lineTo(brushX + 5 * Math.cos(bAngle), brushY + 5 * Math.sin(bAngle));
          ctx.stroke();
        }
      };
      drawBrush(Math.PI / 5);
      drawBrush(-Math.PI / 5);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(rx - rr * 0.6, ry - rr * 0.25, rr * 1.2, rr * 0.45);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(rx - rr * 0.6, ry - rr * 0.25, rr * 1.2, rr * 0.45);

      const turretRadius = rr * 0.35;
      const tGrad = ctx.createRadialGradient(rx, ry, 1, rx, ry, turretRadius);
      tGrad.addColorStop(0, '#f97316');
      tGrad.addColorStop(0.8, '#ea580c');
      tGrad.addColorStop(1, '#7c2d12');
      ctx.fillStyle = tGrad;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, ry, turretRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + turretRadius * Math.cos(-s.theta), ry + turretRadius * Math.sin(-s.theta));
      ctx.stroke();

      // 6. Holographic wireframe Estimated Robot chassis (EKF localization shadow)
      const ex = scaleX(s.x_est);
      const ey = scaleY(s.y_est);
      const er = scaleR(0.13);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + er * Math.cos(-s.theta_est), ey + er * Math.sin(-s.theta_est));
      ctx.stroke();

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const navState = state?.navState ?? 1;
  const isCharging = navState === 9;
  const modes = ['Init', 'Idle', 'Mapping', 'Localize', 'Explore', 'Clean', 'Nav', 'Avoid Obs', 'Docking', 'Charging', 'Resume', 'Stop'];
  const modeName = modes[navState] || 'Idle';
  const confidence = state?.confidence ?? 100;
  
  // LED indicator color
  const ledColor = navState === 9 || navState === 5 ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' :
                   navState === 2 || navState === 3 || navState === 4 ? 'bg-sky-500 shadow-[0_0_6px_#0ea5e9]' :
                   navState === 7 ? 'bg-amber-500 shadow-[0_0_6px_#f59e0b]' :
                   'bg-rose-500 shadow-[0_0_6px_#f43f5e]';

  return (
    <div ref={containerRef} className="relative w-[190px] h-[190px] group rounded-lg border border-white/10 overflow-hidden bg-[#020617] shadow-inner select-none">
      <canvas
        ref={canvasRef}
        width={190}
        height={190}
        className="w-full h-full block"
      />

      {/* Floating High-Tech Telemetry Dashboard HUD */}
      <div className="hud-card-robot absolute top-1.5 left-1.5 w-[84px] p-1.5 rounded bg-slate-950/80 backdrop-blur-md border border-white/10 shadow-2xl text-[5.8px] font-mono text-slate-300 pointer-events-none flex flex-col gap-1 z-20">
        
        {/* State LED & Header */}
        <div className="flex items-center gap-1.5 border-b border-white/5 pb-1">
          <span className={`w-1.5 h-1.5 rounded-full ${ledColor} animate-pulse`} />
          <span ref={stateTextRef} className="font-bold text-[6px] tracking-wide text-sky-400 uppercase">{modeName}</span>
        </div>

        {/* Battery meter */}
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between leading-none text-[5.5px]">
            <span className="text-slate-400">BATTERY</span>
            <span ref={batTextRef} className="text-emerald-400 font-bold">100%</span>
          </div>
          <div className="w-full h-0.5 bg-slate-800 rounded-sm overflow-hidden">
            <div ref={batBarRef} className="h-full bg-emerald-500 w-full" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 pt-0.5 leading-none">
          <div className="flex justify-between"><span className="text-slate-400">COV:</span><span ref={covRef} className="text-cyan-400 font-bold">0%</span></div>
          <div className="flex justify-between"><span className="text-slate-400">EFF:</span><span ref={effRef} className="text-cyan-400">100%</span></div>
          <div className="flex justify-between"><span className="text-slate-400">DIST:</span><span ref={distRef} className="text-slate-200">0.0m</span></div>
          <div className="flex justify-between"><span className="text-slate-400">CONF:</span><span ref={confRef} className={confidence < 60 ? 'text-rose-400 font-bold animate-pulse' : 'text-amber-400'}>100%</span></div>
        </div>

        <div className="border-t border-white/5 my-0.5" />

        {/* EKF + Localization Error */}
        <div className="flex justify-between leading-none text-[5.5px]">
          <span className="text-slate-400">EKF ERR:</span>
          <span ref={errRef} className="text-amber-500 font-bold">0.00m</span>
        </div>

        {/* Comms Network Stats */}
        <div className="flex justify-between leading-none text-[5.5px] text-violet-400">
          <span>LAT:</span>
          <span ref={latRef} className="font-bold">50ms</span>
        </div>
        <div className="flex justify-between leading-none text-[5.5px] text-violet-400">
          <span>LOSS:</span>
          <span ref={lossRef}>0 pkts</span>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Run build to verify TypeScript compilation**

Run:
```powershell
npx tsc --noEmit
```
Expected: The typescript compiler returns 0 errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/components/xbridges/XBlockNode.tsx
git commit -m "feat: upgrade RobotTwinCanvas with GSAP, EKF smoothing, dust suction VFX, and high-tech dashboard HUD"
```
