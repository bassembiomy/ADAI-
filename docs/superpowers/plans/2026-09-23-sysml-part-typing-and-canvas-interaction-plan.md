# SysML Part Typing & Canvas Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full SysML BDD/IBD part typing workflow in ADIA: allow selecting Block types for Parts in the sidebar, auto-assign valid Block types when creating Parts, unblock canvas layout dragging/resizing, and prevent incompatible property-type errors when selecting Blocks for properties.

**Architecture:** 
1. Enhance the Part Inspector in `App.tsx` with a Block Type selector and quick-create definition action.
2. Initialize newly created Parts with an existing Block or synthesized companion Block definition to ensure valid SysML semantics from creation.
3. Allow geometric updates (`x`, `y`, `width`, `height`) without aborting on semantic validations.
4. Auto-synchronize property kind in `BlockPropertiesEditor` when selecting a Block or ValueType, and format diagnostic errors with human-readable names and stereotypes.

**Tech Stack:** React 19, TypeScript, Vitest, SysML v1.6 (BDD/IBD).

---

### Task 1: Auto-synchronize Property Kind & improve diagnostics in SysML Property Rules

**Files:**
- Modify: `src/components/sysml/BlockPropertiesEditor.tsx`
- Modify: `src/services/sysmlPropertyRules.ts`
- Test: `src/components/sysml/BlockPropertiesEditor.test.tsx`
- Test: `src/services/sysmlPropertyRules.test.ts`

- [ ] **Step 1: Write the failing tests**
  Add unit tests verifying:
  - Selecting a `«block»` in `BlockPropertiesEditor` adapts `kind: 'value'` to `kind: 'part'`.
  - Selecting a `«valueType»` in `BlockPropertiesEditor` adapts `kind: 'part'` to `kind: 'value'`.
  - Diagnostics in `validateLegacyBlockProperties` mention the element name and stereotypes rather than raw UUIDs.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/components/sysml/BlockPropertiesEditor.test.tsx src/services/sysmlPropertyRules.test.ts`

- [ ] **Step 3: Implement minimal code changes**
  - Update `BlockPropertiesEditor.tsx` `Type` selector `onChange` handler to adapt `kind`.
  - Update `sysmlPropertyRules.ts` to output clean, readable error messages.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/components/sysml/BlockPropertiesEditor.test.tsx src/services/sysmlPropertyRules.test.ts`

---

### Task 2: Add Block Type selector to Part sidebar & unblock canvas layout dragging

**Files:**
- Modify: `src/App.tsx:9828-9865`
- Modify: `src/App.tsx:17782-17805`
- Test: `src/engine/sysml/ibd.test.ts`

- [ ] **Step 1: Write/verify tests for IBD Part typing and layout**
  Run: `npx vitest run src/engine/sysml/ibd.test.ts`

- [ ] **Step 2: Update `createPart` and `updatePart` in `App.tsx`**
  - In `createPart`, if any `stereotype === 'block'` exists in `blocks`, set `typeId` to that block's `id`. If none exists, create a companion block `${newPart.name}_Def` and assign its `id`.
  - In `updatePart`, if only geometric properties (`x`, `y`, `width`, `height`) are changing, apply without failing semantic validation so dragging/resizing never freezes the user on the canvas.

- [ ] **Step 3: Add Block Type `<select>` in `selectedPart` sidebar**
  - Render a dropdown for `selectedPart.typeId` listing all blocks with `stereotype === 'block'`.
  - Add an action/button to "+ Create New Definition" for this Part.

- [ ] **Step 4: Verify test suite and TypeScript build**
  Run: `npx vitest run src/components/sysml/BlockPropertiesEditor.test.tsx src/services/sysmlPropertyRules.test.ts src/engine/sysml/ibd.test.ts`
  Run: `npx tsc --noEmit`
