# Canonical Relationship Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove duplicate relationship type controls so BDD, IBD, and Requirements use one canonical relationship-kind input and one validation path.

**Architecture:** `RelationshipEndEditor` owns the canonical `SysmlRelationship.kind`. `App.tsx` maps that kind to the legacy `RelationshipData.type` only when committing through `updateRelationship`. The existing creation-rule validator remains the mutation gate and the existing error dialog remains the user-facing rejection surface.

**Tech Stack:** React, TypeScript, Vitest, existing SysML policy/validation modules.

## Global Constraints

- Do not permit two independent controls to edit the same relationship semantic.
- Preserve valid block-to-block composition relationships.
- Invalid updates must leave the model unchanged and show the existing error dialog.
- Keep legacy persistence compatibility through the existing kind/type adapter.

### Task 1: Prove the single-source editor contract

**Files:**
- Modify: `src/components/sysml/RelationshipEndEditor.test.tsx`
- Modify: `src/components/sysml/RelationshipEndEditor.tsx`

- [ ] Add a test asserting exactly one relationship-kind control is rendered and that changing it emits the canonical `kind`.
- [ ] Remove the duplicate kind selector only if the test identifies more than one in the rendered editor.
- [ ] Run `npx vitest run src/components/sysml/RelationshipEndEditor.test.tsx`.

### Task 2: Remove the duplicate App-level selector

**Files:**
- Modify: `src/App.tsx:17469-17490`
- Modify: `src/components/sysml/sysmlBrowserFlow.test.tsx`

- [ ] Delete the outer `Relationship Type` `<select>` from the selected-relationship panel.
- [ ] Keep the `RelationshipEndEditor` selector as the only semantic kind input.
- [ ] Retain the adapter mapping `sharedAggregation → aggregation` and `deriveReqt → derive` in the editor callback.
- [ ] Add a browser/component assertion that the selected relationship panel has one relationship-kind combobox and no `Relationship Type` label.

### Task 3: Verify all diagram contexts use the same editor

**Files:**
- Inspect: `src/App.tsx`
- Test: `src/components/sysml/sysmlBrowserFlow.test.tsx`

- [ ] Confirm BDD, IBD, and Requirements selection all route relationship edits through `updateRelationship` and `RelationshipEndEditor`.
- [ ] Add assertions for the three context labels using the same canonical kind control.
- [ ] Run the focused SysML component suite.

### Task 4: Release verification and commit

**Files:**
- No additional source files.

- [ ] Run `npm run test:sysml`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `git diff --check` and confirm a clean diff after commit.
- [ ] Commit with `fix(sysml): make relationship kind single-source` and push `origin co-work`.
