# ADIA Help Upgrade Implementation Plan

> Execute with subagent-driven-development, test-driven-development and verification-before-completion.

**Goal:** Complete the approved in-application Help upgrade and report coverage honestly.

**Architecture:** Preserve HELP_DATA as the topic entry point; add typed authored topic definitions, registry-derived block references, stable feature mappings and a testable HelpModal. Keep Help read-only toward engineering state.

**Stack:** TypeScript, React, Vitest, existing domain registries and structured SVG diagrams.

## Constraints

- Preserve all pre-existing worktree edits and existing topic IDs.
- Source-check behavior and limits; no universal repository, certified MISRA or unsupported C++ claims.
- Reuse existing catalogs. Coverage must report unresolved UI candidates separately.
- No simulation or domain execution changes; documentation examples must be grounded in code.

## Task 1: Source-verified chapters

Files: `src/help/helpTypes.ts`, `src/help/moduleTopics.ts`, `src/help/moduleTopics.test.ts`.

Interface: `ADDITIONAL_HELP_TOPICS: Record<string, HelpTopic>`; HelpTopic has title/category/description/content/sections/related, and sections have id/title/body/code/list/diagram. Diagrams use `{kind:'flow'|'sequence'|'usecase'|'blocks', nodes:{id,label}[], edges:{from,to,label?}[], caption?}`.

- [x] Write and run failing checks for required chapters, meaningful examples and supported limits.
- [x] Inspect Sequence, Use Case, State Machine semantic/runtime/codegen paths, AI adapters, architecture, SysML and remaining UI modules.
- [x] Author chapters and source references; correct old chapters through `HELP_TOPIC_CORRECTIONS` exported from the same file.
- [x] Run module content tests and review accuracy.

## Task 2: Registry-backed component references

Files: `src/help/blockReference.ts`, `src/help/blockGuidance.ts`, `src/help/blockReference.test.ts`.

Interface: `getBlockHelpReferences(): BlockHelpReference[]`, with id (`xbridges:TYPE` or `vlab:id`), typeId, source, name, category, description, behavior, example, parameters, inputs, outputs, ports, equation, diagram, sourcePath. Export interfaces from blockReference. Use strings for behavior/example, records for parameter descriptions and named port metadata; all references are read-only.

- [x] Write/run failing tests for catalog parity, qualified IDs, useful descriptions/examples and representative behavior.
- [x] Review every actual registry type, aliases, port direction, parameter defaults/bounds and execute/equation functions.
- [x] Add authored reviewed missing instructional guidance and generate metadata from live registries; flag non-executable palette discrepancies separately.
- [x] Run reference tests and produce an explicit remaining-gap list if any content cannot be evidenced.

## Task 3: Feature coverage and audit

Files: `src/help/helpFeatures.ts`, `src/help/helpCoverage.ts`, `src/help/helpCoverage.test.ts`, `scripts/help/generateHelpCoverage.ts` and docs/help reports.

Interfaces: `getHelpFeatures(): HelpFeature[]` with `{id,label,topicId,sectionId?,sourcePath,kind}`; `validateHelpCoverage(features,topics)` returns totals, documented, missing and coverage plus diagnostic arrays. Topic type from task 1. Existing IDs must be stable, not line numbers. Include source UI reconciliation separately.

- [x] Prove missing topic/section, duplicate feature and new unregistered catalog items are detected.
- [x] Derive features from existing catalogs and schemas; inspect/reconcile audited UI candidates without marking generic fallback text as useful coverage.
- [x] Add reporting CLI with Markdown/JSON output and disclose unreviewed UI candidates.
- [x] Run gate tests and generate fresh report after integration.

## Task 4: Help UI and contextual integration

Files: `src/components/help/HelpModal.tsx`, `src/components/help/HelpDiagram.tsx`, UI tests, `src/help/helpNavigation.ts`, `src/App.tsx`.

- [x] Test topic search, matched-section navigation, qualified block selection, categories, TOC, previous/next, related links and contextual F1.
- [x] Extract/reuse current Help and Architecture Explorer; render structured diagrams and existing images/code/list content.
- [x] Integrate module context resolver and focused actionable control help without model mutations.
- [x] Reconcile key UI labels and properties with feature help; run affected tests and browser flow.

## Task 5: Verification and completion

- [x] Review implementation against every attached requirement and resolve task-related gaps.
- [x] Run Help tests, affected module tests, TypeScript and frontend build; inspect navigation/contextual diagrams in browser.
- [x] Generate final coverage and reconciliation reports; disclose pre-existing failures and unresolved limitations.
- [x] Update docs/help/task.md based on evidence; no completion claim until all required work is handled.
