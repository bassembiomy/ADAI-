# State Machine Execution Order, Use Case & Sequence Help Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the ADIA in-application Help system with a structured State Machine execution order diagram, complete symbol and usage catalogs for Use Case and Sequence Diagrams, and comprehensive diagnostics and error causes references grounded in active code.

**Architecture:** Extend `ADDITIONAL_HELP_TOPICS` in `src/help/moduleTopics.ts` with dedicated sections and diagrams. Maintain type safety, test isolation, and 100.00% registered feature coverage.

**Tech Stack:** TypeScript, React, Vitest, structured SVG diagram components (`HelpDiagram`).

## Global Constraints
- Preserve existing topic IDs (`state-machine-execution`, `use-case-diagrams`, `sequence-diagrams`).
- Ground all diagrams and descriptions in actual code behavior (`smInterpreter.ts`, `useCases.ts`, `interaction.ts`, `sysmlInteractionCommands.ts`).
- Ensure `npm run test:help`, `npm run help:coverage` (100%), and `npx tsc --noEmit` pass with zero regressions.

---

### Task 1: State Machine Execution Order Diagram & Lifecycle Breakdown

**Files:**
- Modify: `src/help/moduleTopics.ts`
- Test: `src/help/moduleTopics.test.ts`

**Interfaces:**
- Consumes: `HelpTopic`, `HelpSection`, `HelpDiagram` from `src/help/helpTypes.ts`.
- Produces: Enhanced `'state-machine-execution'` topic in `ADDITIONAL_HELP_TOPICS` with detailed execution flow diagram and step-by-step evaluation order.

- [ ] **Step 1: Write failing test in `src/help/moduleTopics.test.ts`**
  Assert that `ADDITIONAL_HELP_TOPICS['state-machine-execution']` contains an execution order section with a structured diagram detailing tick validation, timer updates, candidate sorting, outer transitions, during action, embedded X-Bridges, inner transitions, child layers, and fault latching.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/help/moduleTopics.test.ts`
  Expected: FAIL (new assertions fail).

- [ ] **Step 3: Update `src/help/moduleTopics.ts`**
  Enhance the `cycle` section or add `lifecycle-order` with a multi-step flowchart diagram and explicit execution semantics.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/help/moduleTopics.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run: `git commit -am "feat(help): add state machine execution order diagram and lifecycle details"`

---

### Task 2: Use Case Diagram Item/Symbol Catalog and Error Causes Reference

**Files:**
- Modify: `src/help/moduleTopics.ts`
- Test: `src/help/moduleTopics.test.ts`

**Interfaces:**
- Consumes: Use case definitions and diagnostics from `src/features/sysml/useCaseDiagramView.ts` and `src/services/sysmlUseCaseCommands.ts`.
- Produces: Enhanced `'use-case-diagrams'` topic with `symbols` and `errors` sections.

- [ ] **Step 1: Write failing test in `src/help/moduleTopics.test.ts`**
  Assert that `'use-case-diagrams'` contains sections explaining all items/symbols (Actor, Subject, Use Case, Association, Include, Extend, Generalization, Satisfy/Refine/Trace) and an error cause reference table for `DUPLICATE_RELATIONSHIP`, `INVALID_ENDPOINT_KIND`, `INVALID_DIRECTION`, `MISSING_EXTENSION_POINT`, `GENERALIZATION_CYCLE`, and `INCLUDE_CYCLE`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/help/moduleTopics.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `symbols` and `errors` sections in `src/help/moduleTopics.ts`**
  Add the symbols catalog and errors reference table to `ADDITIONAL_HELP_TOPICS['use-case-diagrams']`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/help/moduleTopics.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run: `git commit -am "feat(help): add use case symbols and error causes reference"`

---

### Task 3: Sequence Diagram Item/Symbol Catalog and 18-Validator Error Reference

**Files:**
- Modify: `src/help/moduleTopics.ts`
- Test: `src/help/moduleTopics.test.ts`

**Interfaces:**
- Consumes: Sequence definitions and diagnostics from `src/engine/sysml/interaction.ts` and `src/services/sysmlInteractionCommands.ts`.
- Produces: Enhanced `'sequence-diagrams'` topic with `symbols` and `errors` sections covering all 18 validator codes.

- [ ] **Step 1: Write failing test in `src/help/moduleTopics.test.ts`**
  Assert that `'sequence-diagrams'` contains sections for notation/symbols (Lifeline, Sync/Async Call, Signal, Reply, Create, Delete, Self Call, Combined Fragments, Interaction Use `ref`, State Invariant) and an error cause reference table covering all 18 validator codes.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/help/moduleTopics.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `symbols` and `errors` sections in `src/help/moduleTopics.ts`**
  Add the detailed symbol descriptions and complete diagnostic table covering all 18 validator codes.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/help/moduleTopics.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run: `git commit -am "feat(help): add sequence symbols and 18-validator error reference"`

---

### Task 4: Full Gate Verification & Documentation

**Files:**
- Check: `package.json`, `docs/help/task.md`
- Run: `npm run test:help`, `npm run help:coverage`, `npx tsc --noEmit`

- [ ] **Step 1: Run complete help test suite**
  Run: `npm run test:help`
  Expected: PASS across all 11 test suites.

- [ ] **Step 2: Run help coverage audit**
  Run: `npm run help:coverage`
  Expected: 100.00% coverage, 0 missing.

- [ ] **Step 3: Run TypeScript compiler**
  Run: `npx tsc --noEmit`
  Expected: Exit code 0, zero errors.

- [ ] **Step 4: Commit and finalize**
  Run: `git commit -am "docs(help): finalize state machine, use case, and sequence help verification"`
