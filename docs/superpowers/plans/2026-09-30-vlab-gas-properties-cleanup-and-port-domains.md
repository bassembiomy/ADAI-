# V-Lab Gas Properties Cleanup and Port Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every active `gas_properties` remnant, migrate legacy graphs safely, and make V-Lab certification validate `Gas` and `Magnetic` from canonical engine domains.

**Architecture:** The engine domain module will own a runtime `PHYSICAL_DOMAINS` tuple and derive `PhysicalDomain` from it. A focused port-domain helper will combine those canonical domains with the two V-Lab metadata-only domains, while a pure graph normalizer will remove only legacy `gas_properties` nodes and incident edges at V-Lab input boundaries.

**Tech Stack:** TypeScript, React, React Flow (`@xyflow/react`), Vitest.

## Global Constraints

- Do not reintroduce `gas_properties` as a functional component.
- Do not change equations or behavior of existing gas or magnetic components.
- Keep canonical engine domain names lowercase and accept display-style capitalization case-insensitively.
- Preserve `Any` and `BeltProperty` as explicit V-Lab metadata domains.
- Do not mutate caller-owned node or edge arrays during legacy normalization.
- Use test-driven development: observe each focused test fail for the intended reason before production changes.

---

## File Structure

- Modify `src/engine/vlab/types.ts`: own the canonical runtime physical-domain tuple and derived union type.
- Create `src/engine/vlab/vlabPortDomains.ts`: validate V-Lab port-domain strings against canonical and supplemental domains.
- Create `src/engine/vlab/vlabPortDomains.test.ts`: cover capitalization and unknown-domain rejection.
- Create `src/components/vlab/vlabModelMigration.ts`: pure legacy graph normalization.
- Create `src/components/vlab/vlabModelMigration.test.ts`: cover node/edge removal, preservation, and immutability.
- Modify `src/components/vlab/VLabWorkspace.tsx`: normalize graph data at initial, prop-sync, and 3DEXPERIENCE ingress points.
- Modify `src/engine/vlab/vlabEquations.ts`: remove the obsolete factory.
- Modify `src/engine/vlab/vlabComponentDefinitions.ts`: remove obsolete governing metadata.
- Modify `src/components/vlab/VLabSymbols.tsx`: remove the unused symbol case.
- Modify `src/engine/vlab/vlab_full_certification.test.ts`: use central domain validation and remove obsolete exceptions.
- Modify `src/utils/vlabLibrary.test.ts`: extend the existing catalog-removal regression to all registries.

---

### Task 1: Canonical Runtime Port-Domain Validation

**Files:**
- Modify: `src/engine/vlab/types.ts:1-13`
- Create: `src/engine/vlab/vlabPortDomains.ts`
- Create: `src/engine/vlab/vlabPortDomains.test.ts`

**Interfaces:**
- Produces: `PHYSICAL_DOMAINS: readonly string[]` and `PhysicalDomain` derived from it.
- Produces: `isValidVLabPortDomain(domain: string): boolean` for certification and future metadata checks.

- [ ] **Step 1: Write the failing port-domain tests**
- [ ] **Step 2: Run the test and verify the intended RED state**
- [ ] **Step 3: Add the runtime tuple and derive the engine type from it**
- [ ] **Step 4: Implement the V-Lab validator**
- [ ] **Step 5: Run focused tests and type checking**
- [ ] **Step 6: Commit the domain source and validator**

---

### Task 2: Legacy `gas_properties` Graph Migration

**Files:**
- Create: `src/components/vlab/vlabModelMigration.ts`
- Create: `src/components/vlab/vlabModelMigration.test.ts`
- Modify: `src/components/vlab/VLabWorkspace.tsx:941-990,1214-1225`

**Interfaces:**
- Consumes: `VLabNode` and `VLabEdge` from `src/components/vlab/VLabWorkspaceTypes.ts`.
- Produces: `normalizeLegacyVLabGraph(nodes: VLabNode[], edges: VLabEdge[]): { nodes: VLabNode[]; edges: VLabEdge[] }`.

- [ ] **Step 1: Write failing migration tests**
- [ ] **Step 2: Run the migration test and verify RED**
- [ ] **Step 3: Implement the pure normalizer**
- [ ] **Step 4: Run migration tests and verify GREEN**
- [ ] **Step 5: Apply normalization at all V-Lab workspace ingress points**
- [ ] **Step 6: Run focused workspace and migration tests**
- [ ] **Step 7: Commit the legacy migration**

---

### Task 3: Remove Obsolete Registries and Fix Certification

**Files:**
- Modify: `src/utils/vlabLibrary.test.ts`
- Modify: `src/engine/vlab/vlabEquations.ts:1650`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts:418-424`
- Modify: `src/components/vlab/VLabSymbols.tsx:1437-1438`
- Modify: `src/engine/vlab/vlab_full_certification.test.ts:104-118,164-168`

**Interfaces:**
- Consumes: `isValidVLabPortDomain(domain: string): boolean` from Task 1.
- Removes: every runtime or certification registration of `gas_properties`.

- [ ] **Step 1: Extend the existing removal regression before production edits**
- [ ] **Step 2: Run the regression and verify RED**
- [ ] **Step 3: Remove production remnants**
- [ ] **Step 4: Replace the handwritten certification domain allowlist**
- [ ] **Step 5: Run the focused removal test and full certification**
- [ ] **Step 6: Verify no source remnants remain outside migration and tests**
- [ ] **Step 7: Commit registry cleanup and certification fix**

---

### Task 4: Integrated Verification

**Files:**
- Verify only; modify a prior task's files only if a regression directly attributable to this change is found.

**Interfaces:**
- Consumes all deliverables from Tasks 1-3.
- Produces a verified clean V-Lab change set.

- [ ] **Step 1: Run all focused tests together**
- [ ] **Step 2: Run the standard V-Lab suite**
- [ ] **Step 3: Run TypeScript validation**
- [ ] **Step 4: Inspect the final diff and whitespace**
- [ ] **Step 5: Commit any verification-only correction**
