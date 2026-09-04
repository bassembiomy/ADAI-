# OPM Focused Integration Design

**Date:** 2026-09-04

**Goal:** Bring the completed OpenCode OPM runtime, validation, embedded-C generation, and UI improvements into the current `main` line without importing the stale branch’s unrelated history.

## Scope

The change will be based on `origin/main` and will include only the OPM implementation and its directly required UI/security tests. It will not merge the 465-commit `entropy-opm-embedded-c` history, unrelated V-Lab work, generated artifacts, scratch files, or Superpowers session state.

The focused implementation will provide:

- A typed executable OPM contract and defaults.
- Deterministic graph normalization and C-identifier sanitization.
- A bounded expression compiler used by validation, runtime, and code generation.
- Semantic validation for OPM graph structure, links, symbols, events, and executable settings.
- Deterministic runtime stepping with machine-readable snapshots and diagnostics.
- Bounded embedded-C IR/model/runtime generation with canonical hashing and host conformance checks.
- Persistence and security verification for generated code packages.
- Entropy UI integration for executable properties, target settings, diagnostics, live trace, and code generation.

## Architecture and Data Flow

React Flow nodes and edges enter `schemaAdapter.ts`, which produces a normalized, immutable compilation input. `semanticValidator.ts` validates the normalized graph and executable configuration. `expressionCompiler.ts` compiles only the supported expression grammar. The runtime consumes the validated executable model and emits a deterministic snapshot/diagnostic result. The C pipeline consumes the same normalized model, emits bounded C artifacts, and uses canonical hashing to make source/runtime identity verifiable. UI components consume the runtime snapshot and diagnostics; generated packages pass through the security verifier before persistence/export.

The integration boundary will be explicit: `EntropyWorkspace` owns graph state and invokes the OPM simulation/controller and code-generation workspace; the engine modules remain independent of React rendering. Invalid input must produce a diagnostic and a non-success result, never a fabricated zero or silently accepted fallback.

## Files and Responsibilities

- `src/engine/opm/executableTypes.ts`: canonical executable model, target settings, diagnostics, snapshots, and compiled artifact types.
- `src/engine/opm/expressionCompiler.ts`: bounded expression lexer/parser/compiler and typed expression IR.
- `src/engine/opm/schemaAdapter.ts`: defaults, normalization, identifier sanitization, and adapter diagnostics.
- `src/engine/opm/semanticValidator.ts`: graph and executable-model validation.
- `src/engine/opm/runtime.ts` and `runtimeSemantics.ts`: deterministic execution and snapshot semantics.
- `src/engine/opm/pipeline.ts`, `cIr.ts`, `cGenerator.ts`, `cModelGenerator.ts`, `cRuntimeGenerator.ts`: bounded C generation.
- `src/engine/opm/persistence.ts`, `canonicalHash.ts`, and `src/security/opmCodeVerifier.cjs`: persistence identity and package security.
- `src/components/entropy/OpmSimulationEngine.ts`: UI-safe controller facade.
- `src/components/entropy/OpmExecutionPropertiesPanel.tsx`, `OpmTargetSettingsModal.tsx`, `OpmDiagnosticsBadge.tsx`, and `OpmLiveTraceOverlay.tsx`: typed editor/diagnostic/trace surfaces.
- `src/components/entropy/OpmCodeGenerationWorkspace.tsx`: user-facing compile, verify, and export flow.
- `src/components/entropy/EntropyWorkspace.tsx`: integration point for OPM controls and runtime/controller state.

## Error Handling

Compilation, validation, execution, and export failures return structured diagnostics with stable codes and source references. The UI displays the diagnostic and disables save/export when the configuration is invalid. Runtime failures preserve the previous valid snapshot and expose the failure; they do not convert invalid or non-finite values to zero.

## Verification

The focused branch is complete only when all of the following pass in a clean checkout:

- OPM engine and UI tests.
- OPM security verifier tests through Node, not Vitest’s suite collector.
- TypeScript `tsc --noEmit`.
- Production `npm run build`.
- A smoke check that the Entropy workspace renders the OPM controls and code-generation entry point.

## Alternatives Considered

1. Merge `entropy-opm-embedded-c` wholesale. Rejected because it contains hundreds of unrelated commits and would obscure review and risk regressions.
2. Copy only the new engine files and leave UI disconnected. Rejected because the user-visible improvements would not appear in the application.
3. Focused main-based integration (selected). It preserves reviewability, keeps the current main contract authoritative, and makes every missing API visible through tests and the build.
