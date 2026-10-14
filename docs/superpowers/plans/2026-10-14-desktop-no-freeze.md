# Desktop: no startup delay or UI freeze after `npm run make`

Follow-up to `2026-10-14-desktop-performance-optimization.md`, after review of commits
`ffe9a26b`, `e2616008`, `f207e317`, `3128efc8` and `92d31a25` on `co-work`.

Planner/reviewer: Opus (main session). Executor: Sonnet subagent, one work package (WP) per brief.
Executors do not commit; the planner verifies and commits each WP.

## Findings that drive this plan

1. `manualChunks` (f207e317) puts `plotly.js` and `plotly.js-gl3d-dist-min` into `vendor-viz`, which
   `index.html` preloads at startup. Plotly was lazy (`src/components/doe/PlotlyRenderer.tsx` uses
   `import()`), so the commit made startup load more, not less.
2. Every vendor chunk is imported by `index` and preloaded. Heavy libraries used only from button
   handlers (xlsx, jspdf, html2canvas, jszip, docx) are imported statically, so they are parsed and
   run before the first paint.
3. Main-process work that blocks the event loop (freezes window drag/resize and every IPC call):
   - `getRealPorts()` (`src/main.cjs:488`) runs PowerShell with `execFileSync` (up to 5 s).
   - `verifyOfflineToolchains()` (`src/main.cjs:78`) runs right after `createWindow()` and calls
     `resolveToolExecutable`, which runs `where.exe`/`which` with `execFileSync` per toolchain.
   - `asarGuard.verifyAsarIntegrity()` (`src/security/asarGuard.cjs:58`) reads the whole `app.asar`
     into memory with `readFileSync` and hashes it before the window is created. Today it is a
     no-op because nothing writes `app-integrity.json`, but it becomes a multi-second freeze the
     day that file ships.
4. Obfuscation (3128efc8) dropped `stringArrayThreshold` to 0.5, which left about 3x more plaintext
   sensitive strings in `main.jsc`. Threshold has no measurable runtime cost with base64 encoding.
5. `forge.config.cjs` (92d31a25) creates a machine-wide NTFS junction at `%LOCALAPPDATA%\SquirrelTemp`
   on every Forge invocation, with a hard-coded user name fallback.
6. Small cleanups: dead `scheduler/tracing` alias; commented-out switch in `src/main.cjs:15`;
   render telemetry silently records nothing in non-profiling builds.

## Work packages

| WP | Files | Goal |
|---|---|---|
| WP-A | `vite.config.ts` | Chunking that never makes a lazy library eager; drop dead alias |
| WP-B1 | `src/App.tsx` | Load xlsx, jspdf, html2canvas, jszip on demand |
| WP-B2 | `src/components/vlab/VLabWorkspace.tsx`, `src/components/reporting/ReportViewerModal.tsx`, `src/components/IntroStandbyOverlay.tsx`, `src/features/sysml/performance/renderTelemetry.ts` | Same for the other static importers; lazy `three` canvas; telemetry warning |
| WP-C | `src/main.cjs`, `src/security/toolchainManager.cjs`, `src/security/asarGuard.cjs` | No synchronous child processes or whole-file reads on the main thread at startup or in IPC handlers |
| WP-D | `scripts/build_protected_electron.cjs`, `forge.config.cjs` | Threshold 0.8; junction opt-in and Windows only |

WP-A, WP-B1, WP-B2, WP-C and WP-D touch disjoint files and run in parallel.

## Acceptance (planner verifies after all WPs)

- `vite build` succeeds; `dist/index.html` preloads no chunk containing plotly, three, xlsx, jspdf,
  html2canvas, jszip or docx.
- JavaScript loaded at startup is smaller than the baseline build of `e2616008`.
- Built app renders in headless Chromium with no page errors.
- `npx tsc --noEmit`, vitest on touched areas, `npm run test:security`, `npm run test:project-files`
  pass; protected Electron build completes.
- No `execFileSync`, `execSync`, `spawnSync` or whole-asar `readFileSync` reachable from startup or
  from `ipcMain.handle` handlers in `src/main.cjs`.
