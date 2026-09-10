# ADIA SysML Large Model Performance Baseline

**Date:** 2026-09-10  
**Environment:** Windows x64, Node.js v20+, Vitest v4.1.5, V8 JS Engine  
**Test Suite:** `src/engine/sysml/largeModelGenerator.test.ts`

## 1. Executive Summary

Baseline measurements confirm that the un-normalized, synchronous, full-project clone/stringify architecture suffers severe latency degradation as model sizes increase from 1,000 to 10,000 elements (and would become completely unresponsive at 50k-100k elements):

- **Single Element Edit (`updateElement`):** Degrades from **42.27 ms** at 1k to **288.34 ms** at 10k (~7x degradation, exceeding the 50 ms budget by 5.7x).
- **Serialization (`serializeRepository`):** Degrades from **34.29 ms** (388 KB) to **351.00 ms** (3.92 MB).
- **Deserialization / Load (`loadRepository`):** Degrades from **60.12 ms** to **568.50 ms** (over half a second main-thread freeze).
- **History Growth:** Every mutation snapshot currently stores the full `SysmlRepository` in `MutationHistory.past`, causing unbounded memory consumption proportional to `ProjectSize * HistoryDepth`.

---

## 2. Benchmark Measurements (1k vs 10k Elements)

| Operation | 1,000 Elements | 10,000 Elements | Scaling Factor | Target Performance Contract | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Model Generation** | 4.49 ms (882 KB heap) | 13.85 ms (8.45 MB heap) | ~3.1x | Bounded memory generator | Passed |
| **Serialization** | 34.29 ms (388 KB) | 351.00 ms (3.92 MB) | ~10.2x | Incremental chunking / off-thread | Bottleneck |
| **Deserialization (Load)**| 60.12 ms | 568.50 ms | ~9.5x | < 100 ms main-thread task | Critical Bottleneck |
| **Project Full Model** | 5.62 ms (600 blocks) | 13.41 ms (6,000 blocks) | ~2.4x | Viewport / active diagram only | Needs Virtualization |
| **Project Single Diagram**| 1.14 ms (50 blocks) | 5.84 ms (100 blocks) | ~5.1x | Viewport / active diagram only | Acceptable |
| **Update Element** | 42.27 ms | **288.34 ms** | ~6.8x | < 16 ms median, < 50 ms p95 | Critical Bottleneck |
| **Delete Impact Analysis** | 1.45 ms | 6.58 ms | ~4.5x | Indexed / worker-backed | Candidate for Indexing |

---

## 3. Root Cause Analysis

1. **Full Repository Cloning in Gateway & Mutations:**
   - Every `executeSysmlCommand` invokes `applyCommand`, which performs full repository deep copy, audit trail appending, full repository validation (`validateSysmlRepository`), and complete legacy array projection (`projectLegacyDiagram`).
2. **Snapshot-Based Undo/Redo:**
   - `MutationHistory` saves full repository copies on every change. 20 edits on a 10k project results in ~80 MB of duplicated history memory.
3. **Linear Scans Without Secondary Indexes:**
   - Impact analysis, relationship queries, and block-to-usage lookups iterate over `Object.values(repository.usages)` and `Object.values(repository.relationships)` repeatedly.
4. **Monolithic JSON Persistence:**
   - Persistence stringifies and computes sha256 checksums over the entire repository object for any save operation, blocking the UI thread for hundreds of milliseconds.

---

## 4. Next Implementation Tasks

- **Task 2:** Introduce `NormalizedSysmlStore` with secondary indexes (`ownerId`, `typeId`, `sourceId`, `targetId`, `diagramId`, `requirementId`) to eliminate linear scans.
- **Task 3:** Replace full-snapshot history with typed forward/inverse patches (`add`, `replace`, `remove`, `batch`) and bounded memory budgets.
- **Task 4:** Switch app state to indexed selectors and cached diagram projections.
- **Task 5:** Add viewport culling and spatial indexing for diagram rendering.
- **Task 6:** Move heavy validation, projection, and impact analysis to Web Workers.
- **Task 7:** Implement chunked and incremental persistence.
