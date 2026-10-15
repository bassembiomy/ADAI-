# Desktop Application Performance Optimization Design

**Date:** 2026-10-14  
**Topic:** Desktop Packaged App (`npm run make`) Performance Parity with Localhost (`npm run dev`)  
**Status:** Approved by User  

---

## 1. Problem Statement

When running ADIA in local development (`npm run dev`), the user experience is smooth, responsive, and fast. However, after building and packaging the desktop application with `npm run make` (`electron-forge make`), the installed desktop app suffers from high CPU/GPU utilization, sluggish UI interactions, noticeable input latency, and slow initial startup.

### Root Causes Identified
1. **Unconstrained Frame Rate (`disable-frame-rate-limit`)**: In `src/main.cjs`, `app.commandLine.appendSwitch('disable-frame-rate-limit')` removes Chromium's VSync lock. Unthrottled Three.js/WebGL canvases, Plotly graphs, and React Flow nodes cause the GPU/CPU to spin continuously rendering hundreds of FPS, starving the main UI event loop.
2. **Forced React Profiling in Production**: In `vite.config.ts`, `react-dom` and `scheduler/tracing` were unconditionally aliased to `react-dom/profiling` and `scheduler/tracing-profiling`. This adds measurement and fiber interaction overhead to every state update and reconciliation in production.
3. **Heavy Anti-Extraction Transforms on IPC Bridges**: `scripts/build_protected_electron.cjs` applied aggressive `controlFlowFlattening` (threshold 0.75) and `rc4` string array encryption to the main bundle and `preload.cjs`. This defeats V8 JIT optimizations (Turbofan) and forces runtime RC4 decryption loops on every IPC invocation.
4. **12 MB Monolithic Frontend Bundle**: The frontend is bundled into a single ~12 MB `index.js` file, causing high synchronous parse/compile latency on startup when reading from `app.asar`.

---

## 2. Proposed Changes

### 2.1 Frame-Rate Synchronization (`src/main.cjs`)
* Remove `app.commandLine.appendSwitch('disable-frame-rate-limit');`.
* Retain `enable-gpu-rasterization` and `enable-zero-copy` for hardware acceleration.
* Chromium will lock frame presentation to the display refresh rate (60Hz / 120Hz VSync), eliminating thread starvation and GPU pegging.

### 2.2 Conditional React Profiling (`vite.config.ts`)
* Make `react-dom/profiling` opt-in via environment variable (`process.env.VITE_PROFILE === 'true'`).
* In standard builds (`npm run build`, `npm run make`), use standard production React DOM for optimal runtime performance.

### 2.3 Runtime-Optimized Protection (`scripts/build_protected_electron.cjs`)
* Retain V8 bytecode compilation via `bytenode` to protect proprietary intellectual property without source code exposure.
* In `main_obfuscated.js` and `preload.cjs`:
  * Disable `controlFlowFlattening` (`controlFlowFlattening: false`) to allow V8's Turbofan compiler to optimize hot paths, loops, and branch predictions.
  * Use lightweight `base64` string encoding instead of `rc4` on `main_obfuscated.js` and `preload.cjs`.
  * Ensure the preload IPC bridge executes with minimal overhead.

### 2.4 Code Splitting & Chunking (`vite.config.ts`)
* Configure `build.rollupOptions.output.manualChunks` in `vite.config.ts` to separate large independent dependencies:
  * `vendor-react`: `react`, `react-dom`, `@radix-ui/*`
  * `vendor-viz`: `three`, `plotly.js`, `plotly.js-gl3d-dist-min`, `recharts`, `@gsap/react`, `gsap`
  * `vendor-math`: `mathjs`
  * `vendor-flow`: `@xyflow/react`
  * `vendor-docs`: `xlsx`, `jspdf`, `docx`, `jszip`, `html2canvas`
* This reduces initial synchronous script parsing overhead when Electron loads `index.html`.

---

## 3. Non-Goals & Security Guardrails
* We will **not** disable `bytenode` bytecode generation or remove ASAR packaging: proprietary anti-extraction protections remain fully intact.
* We will **not** modify business logic, SysML models, simulation kernels, or HIL security policies.
* CSP headers, context isolation, and sandboxing in `src/main.cjs` remain strictly enforced.

---

## 4. Verification & Testing Strategy
1. **Unit & Security Regression Tests**:
   * Run existing security and desktop test suites: `npm run test:security` and `npm run test:project-files`.
2. **Build Verification**:
   * Run `npm run build` and inspect `dist/assets` to verify that code splitting produced partitioned chunks instead of a single 12MB bundle.
   * Verify that `dist-electron/main.jsc` and `dist-electron/preload.cjs` are generated cleanly.
3. **Desktop Verification**:
   * Run `npm run start:prebuilt` or package test to verify fast startup and smooth 60fps interaction without UI freezes or 100% GPU pegging.
