# Task Checklist: Generic State Machine Code Generator Improvements

- [x] **Task 1: Reusable Runtime, Config, Error Model, & SM_STATIC_ASSERT**
  - [x] Write failing test for `smRuntimeGenerator`
  - [x] Implement `smRuntimeGenerator.ts` emitting `sm_runtime.c`, `sm_runtime.h`, `sm_config.h`, `sm_version.h`, `manifest.json`
  - [x] Verify test passes and commit

- [x] **Task 2: Semantic IR Enrichment (Exact HSM LCA Paths Across 7 Scenarios)**
  - [x] Write failing test for precomputed LCA paths across 7 scenarios
  - [x] Enrich `SemanticTransition` in `smSemanticModel.ts` and `smSemanticBuilder.ts`
  - [x] Verify test passes and commit

- [x] **Task 3: Normalized Traceable Elements Metadata**
  - [x] Write failing test for `ir.traceableElements`
  - [x] Populate `traceableElements` in `smSemanticBuilder.ts`
  - [x] Verify test passes and commit

- [x] **Task 4: C Renderer Enhancements & Compiler Warnings Test (-Wshadow -Werror)**
  - [x] Write failing test for namespacing and `-Wshadow -Werror` GCC compilation
  - [x] Update `smCGenerator.ts` for namespaced variables, NULL check, and `traceId` markers
  - [x] Verify test passes and commit

- [x] **Task 5: XBridges Scale-Aware Matrix Solvers & Executable Numerical Matrix Tests**
  - [x] Write failing test for scale-aware pivot check and safe output fallback
  - [x] Update `xbCGenerator.ts` with static stack solvers and `SM_ERR_NUMERIC_FAULT`
  - [x] Verify test passes and commit

- [x] **Task 6: Marker-Based Line Traceability Engine (traceId Pairing)**
  - [x] Write failing test for `traceId` marker resolution
  - [x] Implement `smTraceabilityEngine.ts` with `TRACEABILITY_UNRESOLVED` error
  - [x] Verify test passes and commit

- [x] **Task 7: Independent TypeScript Semantic Reference Interpreter (Milestones 7A-7I)**
  - [x] Write failing behavioral test for transition priority selection
  - [x] Implement `smReferenceInterpreter.ts` across milestones 7A-7I
  - [x] Verify test passes and commit

- [x] **Task 8: Host C Execution Harness & Canonical 11-Field JSONL Trace Protocol**
  - [x] Write failing test for 11-field JSONL host harness compilation & execution
  - [x] Update `smHostHarness.ts` to emit 11-field JSONL trace strings
  - [x] Verify test passes and commit

- [x] **Task 9: Differential Comparator, Tick Alignment, & Replay Context Vectors**
  - [x] Write failing test for trace comparator with tick alignment & replay context
  - [x] Implement `smDifferentialEngine.ts` with replay vector JSON output
  - [x] Verify test passes and commit

- [x] **Task 10: Atomic & Path-Safe Artifact Writer (CREATE_IF_MISSING vs ALWAYS)**
  - [x] Write failing test for atomic write (`.tmp`) and path boundary security
  - [x] Implement `smFileWriter.ts` enforcing path resolution safety
  - [x] Verify test passes and commit

- [x] **Task 11: Verification Status Aggregator Precedence Rules & Product Status Typing**
  - [x] Write failing unit tests for status precedence order
  - [x] Implement `smVerificationAggregator.ts` returning `ProductVerificationStatus`
  - [x] Verify test passes and commit

- [x] **Task 12: Multi-Stage Verification Pipeline Orchestrator & Execution Pipeline**
  - [x] Write failing test for evidence-backed pipeline execution
  - [x] Implement `smPipelineOrchestrator.ts` and `scripts/verify_sm_codegen.ts`
  - [x] Run full test suite and verify evidence-backed reports pass
  - [x] Commit Task 12 changes
