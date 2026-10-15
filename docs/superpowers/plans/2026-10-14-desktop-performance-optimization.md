# Desktop Application Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate desktop UI lag, high GPU utilization, and startup latency in packaged builds (`npm run make`) by fixing VSync synchronization, restoring the standard production React runtime, optimizing Electron obfuscation, and partitioning the monolithic bundle.

**Architecture:** Remove Chromium's unconstrained frame-rate switch to lock rendering to monitor VSync; condition React DOM profiling aliases on `VITE_PROFILE`; adjust `javascript-obfuscator` settings in `scripts/build_protected_electron.cjs` to eliminate destructive control-flow loops while retaining V8 bytecode (`bytenode`) protection; configure Rollup `manualChunks` in `vite.config.ts` to split vendor libraries into partitioned chunks.

**Tech Stack:** Electron 43, Vite 7, React 18, Rollup, Bytenode, JavaScriptObfuscator.

## Global Constraints

- Never disable `bytenode` bytecode generation or remove ASAR packaging: proprietary anti-extraction protections must remain fully intact.
- Never modify business logic, SysML models, simulation kernels, or HIL security policies.
- Keep CSP headers, context isolation, and sandboxing in `src/main.cjs` strictly intact.

---

### Task 1: Eliminate GPU Saturation by Removing Frame-Rate Limit Switch

**Files:**
- Modify: `src/main.cjs:14-18`
- Test: `src/security/hilDesktopIntegration.test.cjs`

**Interfaces:**
- Consumes: Chromium command line switch API (`app.commandLine.appendSwitch`).
- Produces: Default Chromium VSync-synchronized rendering loop without 100% GPU/CPU starvation.

- [ ] **Step 1: Check existing desktop switches in `src/main.cjs`**

Inspect lines 14-18 in `src/main.cjs`:
```javascript
// High-performance GPU & high-refresh rate rendering switches
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
```

- [ ] **Step 2: Remove `disable-frame-rate-limit` from `src/main.cjs`**

Edit `src/main.cjs` to remove `disable-frame-rate-limit` while retaining rasterization and zero-copy:
```javascript
// High-performance GPU & rendering switches (VSync preserved to prevent GPU pegging)
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
```

- [ ] **Step 3: Run existing desktop integration tests to verify no regressions**

Run: `node src/security/hilDesktopIntegration.test.cjs`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main.cjs
git commit -m "perf(desktop): remove disable-frame-rate-limit switch to restore VSync"
```

---

### Task 2: Condition React DOM Profiling Aliases in `vite.config.ts`

**Files:**
- Modify: `vite.config.ts:9-16`

**Interfaces:**
- Consumes: `process.env.VITE_PROFILE`.
- Produces: Standard production React DOM runtime during `npm run build` and `npm run make`; profiling runtime only when `VITE_PROFILE=true`.

- [ ] **Step 1: Inspect current `alias` array in `vite.config.ts`**

Current code in `vite.config.ts`:
```typescript
    alias: [
      { find: /^react-dom\/client$/, replacement: 'react-dom/profiling' },
      { find: /^react-dom$/, replacement: 'react-dom/profiling' },
      { find: 'scheduler/tracing', replacement: 'scheduler/tracing-profiling' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
```

- [ ] **Step 2: Update `vite.config.ts` with conditional profiling**

Modify `vite.config.ts`:
```typescript
const isProfiling = process.env.VITE_PROFILE === 'true';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      ...(isProfiling
        ? [
            { find: /^react-dom\/client$/, replacement: 'react-dom/profiling' },
            { find: /^react-dom$/, replacement: 'react-dom/profiling' },
            { find: 'scheduler/tracing', replacement: 'scheduler/tracing-profiling' },
          ]
        : []),
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    port: 3000,
    host: true,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/.agents/**', '**/tests/e2e/**', '**/.kilo/**'],
  },
});
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`  
Expected: PASS with code 0

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "perf(build): make react-dom profiling aliases opt-in via VITE_PROFILE"
```

---

### Task 3: Configure Vendor Code Splitting in `vite.config.ts`

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: Rollup `output.manualChunks` configuration.
- Produces: Partitioned vendor bundles (`vendor-react`, `vendor-viz`, `vendor-math`, `vendor-flow`, `vendor-docs`) in `dist/assets` instead of a single 12 MB monolithic bundle.

- [ ] **Step 1: Add `build.rollupOptions.output.manualChunks` to `vite.config.ts`**

Update `vite.config.ts`:
```typescript
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('plotly.js') || id.includes('recharts') || id.includes('gsap')) {
              return 'vendor-viz';
            }
            if (id.includes('@xyflow')) {
              return 'vendor-flow';
            }
            if (id.includes('mathjs')) {
              return 'vendor-math';
            }
            if (id.includes('xlsx') || id.includes('jspdf') || id.includes('docx') || id.includes('jszip') || id.includes('html2canvas')) {
              return 'vendor-docs';
            }
            if (id.includes('react') || id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'vendor-react';
            }
          }
        },
      },
    },
  },
```

- [ ] **Step 2: Run Vite build and verify output chunks**

Run: `npx vite build`  
Expected: Build finishes with `dist/assets/vendor-viz-*.js`, `dist/assets/vendor-react-*.js`, etc.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "perf(build): partition vendor libraries with rollup manualChunks"
```

---

### Task 4: Streamline Electron Obfuscation for JIT Optimization

**Files:**
- Modify: `scripts/build_protected_electron.cjs:56-86,136-144`

**Interfaces:**
- Consumes: `rawBundleCode` (esbuild output) and `rawPreloadCode`.
- Produces: Obfuscated JS compatible with V8 Turbofan JIT compilation, compiled to native V8 bytecode via `bytenode`.

- [ ] **Step 1: Inspect `scripts/build_protected_electron.cjs` obfuscator configs**

Check Step 2 (lines 56-86) and Step 5 (lines 136-144). Notice `controlFlowFlattening: true`, `threshold: 0.75`, `stringArrayEncoding: ['base64', 'rc4']`.

- [ ] **Step 2: Tune obfuscation settings for runtime performance**

In `scripts/build_protected_electron.cjs`:
1. For the main process bundle (`Step 2`):
   - Set `controlFlowFlattening: false` (avoids de-optimizing V8 JIT).
   - Change `stringArrayEncoding: ['base64']` (avoids expensive runtime RC4 decryption loops).
   - Set `stringArrayCallsTransform: false`.
2. For preload (`Step 5`):
   - Set `controlFlowFlattening: false`.
   - Set `stringArrayThreshold: 0.5`.
   - Keep `stringArrayEncoding: ['base64']`.

- [ ] **Step 3: Run protected electron build script**

Run: `npm run build:electron`  
Expected:
```
🔒 [Anti-Extraction] Starting protected Electron build...
📦 [1/5] Bundling main process with esbuild...
🌀 [2/5] Obfuscating main process JavaScript bundle...
⚡ [3/5] Compiling to V8 Bytecode (.jsc) with bytenode...
🔑 [4/5] Creating V8 bytecode ignition loader (index.cjs)...
🛡️  [5/5] Obfuscating preload.cjs...
✅ [Anti-Extraction] Protected Electron build complete!
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build_protected_electron.cjs
git commit -m "perf(security): tune obfuscation for V8 JIT efficiency while retaining bytecode protection"
```

---

### Task 5: End-to-End Build & Desktop Integration Verification

**Files:**
- Test: Full build and test suite

- [ ] **Step 1: Run security unit tests**

Run: `npm run test:security`  
Expected: All tests pass.

- [ ] **Step 2: Run project files tests**

Run: `npm run test:project-files`  
Expected: All tests pass.

- [ ] **Step 3: Run full build**

Run: `npm run build`  
Expected: `tsc && vite build && npm run build:electron` completes successfully.

- [ ] **Step 4: Verify asset sizes in `dist/assets`**

Run: `ls -lh dist/assets` or check file sizes  
Expected: `index.js` is now much smaller (reduced from 12MB), split across `vendor-viz`, `vendor-react`, `vendor-math`, `vendor-flow`, and `vendor-docs`.
