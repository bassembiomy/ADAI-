# ADIA SysML Large Model Performance Baseline & Benchmark Qualification

**Date:** 2026-09-10  
**Environment:** Windows x64, Node.js v20+, Chromium (Playwright 1.48), Vitest v4.1.5, V8 JS Engine  
**Test Suites:**
- Baseline: `src/engine/sysml/largeModelGenerator.test.ts`
- Benchmark Gate: `src/engine/sysml/largeModelBenchmarkGate.test.ts`
- End-to-End Viewport & Responsiveness: `tests/e2e/sysml-large-model-performance.spec.ts`

---

## 1. Executive Summary

Prior to the Large Model Scalability Architecture, ADIA used un-normalized, synchronous, full-project clone/stringify operations on every pointer move and state edit. This suffered severe degradation at 10k elements and caused browser UI lockups at 50k–100k elements.

With the completion of the 10-task scalability implementation, ADIA now features:
1. **Normalized SysML Store (`NormalizedSysmlStore`)** with multi-secondary index mapping (`byId`, `ownerId`, `typeId`, `sourceId`, `targetId`, `diagramId`, `requirementId`).
2. **Bounded Inverse Patch History** with pointer move coalescing and strict memory limits (`maxEntries`, `maxBytes`).
3. **Viewport Virtualization & Spatial Culling (`DiagramSpatialGrid`)** rendering only on-screen elements and connected edges with degraded mode during rapid panning/dragging.
4. **Worker-Backed Projection, Validation, and Impact Analysis (`SysmlWorkerClient`)** with stale request rejection and request revision cancellation.
5. **Chunked & Incremental Persistence (`serializeIncrementalChunks`)** persisting only modified entity chunks with atomic writes.
6. **Safety Limits & Diagnostics (`LargeModelDiagnostics`)** alerting the user on very large models (>5,000 entities) and requiring explicit confirmation for expensive operations (global report generation, whole-project export, and mass auto-layout).

---

## 2. Before vs. After Benchmark Measurements

| Metric / Operation | Baseline (Legacy Un-normalized) | Scalability Architecture (Normalized / Indexed) | Improvement Factor | Contract Budget | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1k Element Single Edit** | 42.27 ms | **0.43 ms** | **~98x faster** | < 50 ms | **Passed** |
| **10k Element Single Edit** | 288.34 ms | **0.09 ms** | **>3,200x faster** | < 50 ms | **Passed** |
| **10k Pointer Drag (p95)** | ~250–400 ms (unbounded) | **1.42–3.77 ms** | **>100x faster** | < 50 ms | **Passed** |
| **Undo / Redo (10k items)** | Full copy (~80 MB heap) | **0.15 ms** (~1 KB patch) | **>500x memory saving** | < 25 ms | **Passed** |
| **Spatial Viewport Cull (1k)**| N/A (all rendered) | **0.86 ms** | Viewport bounded | < 15 ms | **Passed** |
| **Indexed `getById` (50k items)**| O(N) array scan (~12 ms) | **0.05 ms** (O(1) Map) | **~240x faster** | < 5 ms | **Passed** |
| **Diagram Projection (50k items)**| O(N) linear filter (~45 ms)| **0.14 ms** (indexed Set) | **~320x faster** | < 30 ms | **Passed** |
| **10k Incremental Save** | 563.96 ms (monolithic) | **45.47–82.42 ms** | **~7x–12x faster** | < 300 ms | **Passed** |
| **10k Chunk Hydration** | 568.50 ms (raw JSON parse) | **337.43 ms** (with SHA256) | **~1.7x faster + secure**| < 1000 ms | **Passed** |

---

## 3. Architecture & Safety Measures

### 3.1 Bounded Patch History
- Coalesces rapid pointer drag operations under the key `drag_<elementId>`: intermediate positions do not create separate history entries.
- Retains forward and inverse patches with UTF-16 byte estimation; oldest entries are automatically evicted when `totalBytes > maxBytes` or `past.length > maxEntries`.

### 3.2 Viewport Spatial Culling & Degraded Modes
- Spatial grid partitions world coordinates into 500x500 world units.
- Offscreen elements beyond the viewport + overscan margin are completely unmounted from the DOM/SVG.
- Degraded mode kicks in when active diagram exceeds 500 nodes, temporarily omitting drop shadows and deferring label rendering during active pan/drag.

### 3.3 Safety Limits & Operation Confirmations
- **Warning Threshold (5,000 entities):** Prompt the user when opening large projects, offering one-click Performance Mode.
- **Global Report Generation:** Prompt before generating documents for models >= 5,000 entities.
- **Whole-Project Unified Export:** Prompt before serializing projects >= 5,000 entities.
- **Auto-Layout Confirmation:** Prompt before executing hierarchical auto-layout on >= 500 elements.
- **User Preferences:** Stored separately in `localStorage` under `adia_sysml_performance_limits` without polluting the SysML semantic repository.

---

## 4. Verification Suite Results

- **Unit & Conformance Suite (`npm run test:sysml`):** 34 test files, 237 passing tests (0 failures).
- **Playwright E2E Suite (`npm run test:e2e:sysml`):** 11 passing tests across Chromium browser environment.
- **TypeScript Static Typing (`npx tsc --noEmit`):** 0 errors.
