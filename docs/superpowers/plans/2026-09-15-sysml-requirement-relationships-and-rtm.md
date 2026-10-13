# SysML Requirements Relationships & Traceability Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full SysML 1.6 requirement relationship types (Containment, deriveReqt, copy, refine, trace, satisfy, verify) on the Requirements Diagram canvas with directional validation, SVG markers, independent cycle detection, complete RTM indexing with dedicated columns, and CSV/Excel exports.

**Architecture:** 
- Centralized relationship metadata in `src/engine/sysml/relationshipDefinitions.ts` driving validation, canvas choices, and rendering.
- Strict endpoint and direction validation in `connectionPolicy.ts` and `sysmlCreationRules.ts` with reversal assistance.
- Multi-stereotype canvas support and SysML-compliant SVG markers in `App.tsx` and `reportDiagrams.ts`.
- Fine-grained RTM data model indexing and UI columns in `rtm.ts`, `TraceabilityMatrix.tsx`, and `VirtualizedTraceabilityGrid.tsx`.

**Tech Stack:** TypeScript, React, SVG rendering, Jest/Vitest.

## Global Constraints
- Canonical storage direction is strictly `sourceElementId -> targetElementId`.
- Containment: Parent (source) contains Child (target); solid line, crosshair `(+)` at parent, no arrow at child.
- deriveReqt: Derived requirement (source) -> Source requirement (target); dashed line, open arrow at target.
- copy: Copied requirement (source) -> Master requirement (target); dashed line, open arrow at target.
- refine: Detailed element (source) -> Refined requirement (target); dashed line, open arrow at target.
- trace: Client element (source) -> Supplier element (target); dashed line, open arrow at target.
- satisfy: Design element (source) -> Requirement (target); dashed line, open arrow at target.
- verify: Test case (source) -> Requirement (target); dashed line, open arrow at target.
- Independent cycle detection for `requirementContainment`, `deriveReqt`, and `copy`.
- No placeholders, no silent reversal of endpoints.

---

### Task 1: Central Relationship Metadata and Type Definitions

**Files:**
- Create: `src/engine/sysml/relationshipDefinitions.ts`
- Modify: `src/types/sysml_types.ts:72-81`
- Test: `src/engine/sysml/relationshipDefinitions.test.ts`

**Interfaces:**
- Produces: `RELATIONSHIP_DEFINITIONS`, `RequirementRelationshipKind`, `SysmlRelationshipKind`, `getRelationshipDefinition`

- [ ] **Step 1: Write failing unit test for relationship definitions**

```ts
// src/engine/sysml/relationshipDefinitions.test.ts
import { RELATIONSHIP_DEFINITIONS, getRelationshipDefinition, type RequirementRelationshipKind } from './relationshipDefinitions';

describe('relationshipDefinitions', () => {
  const KINDS: RequirementRelationshipKind[] = [
    'requirementContainment',
    'deriveReqt',
    'copy',
    'refine',
    'trace',
    'satisfy',
    'verify',
  ];

  it('defines metadata for all seven requirement relationships', () => {
    for (const kind of KINDS) {
      const def = getRelationshipDefinition(kind);
      expect(def).toBeDefined();
      expect(def.label).toBeTruthy();
      expect(def.displayLabel).toMatch(/^«.+»|Containment$/);
      expect(def.directionLabel).toContain('→');
      expect(['solid', 'dashed']).toContain(def.lineStyle);
    }
  });

  it('marks containment, deriveReqt, and copy as acyclic', () => {
    expect(RELATIONSHIP_DEFINITIONS.requirementContainment.acyclic).toBe(true);
    expect(RELATIONSHIP_DEFINITIONS.deriveReqt.acyclic).toBe(true);
    expect(RELATIONSHIP_DEFINITIONS.copy.acyclic).toBe(true);
    expect(RELATIONSHIP_DEFINITIONS.refine.acyclic).toBe(false);
    expect(RELATIONSHIP_DEFINITIONS.trace.acyclic).toBe(false);
    expect(RELATIONSHIP_DEFINITIONS.satisfy.acyclic).toBe(false);
    expect(RELATIONSHIP_DEFINITIONS.verify.acyclic).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/sysml/relationshipDefinitions.test.ts`
Expected: FAIL ("Cannot find module './relationshipDefinitions'")

- [ ] **Step 3: Implement relationshipDefinitions.ts and update sysml_types.ts**

```ts
// src/engine/sysml/relationshipDefinitions.ts
export type RequirementRelationshipKind =
  | 'requirementContainment'
  | 'deriveReqt'
  | 'copy'
  | 'refine'
  | 'trace'
  | 'satisfy'
  | 'verify';

export interface RelationshipMeta {
  label: string;
  displayLabel: string;
  directionLabel: string;
  lineStyle: 'solid' | 'dashed';
  sourceMarker: string | null;
  targetMarker: string | null;
  acyclic: boolean;
}

export const RELATIONSHIP_DEFINITIONS: Record<RequirementRelationshipKind, RelationshipMeta> = {
  requirementContainment: {
    label: 'Containment',
    displayLabel: '«contains»',
    directionLabel: 'Parent Requirement → Child Requirement',
    lineStyle: 'solid',
    sourceMarker: 'requirement-containment-crosshair',
    targetMarker: null,
    acyclic: true,
  },
  deriveReqt: {
    label: 'Derive Requirement',
    displayLabel: '«deriveReqt»',
    directionLabel: 'Derived Requirement → Source Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: true,
  },
  copy: {
    label: 'Copy',
    displayLabel: '«copy»',
    directionLabel: 'Copied Requirement → Master Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: true,
  },
  refine: {
    label: 'Refine',
    displayLabel: '«refine»',
    directionLabel: 'Detailed Element → Refined Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
  trace: {
    label: 'Trace',
    displayLabel: '«trace»',
    directionLabel: 'Client Element → Supplier Element',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
  satisfy: {
    label: 'Satisfy',
    displayLabel: '«satisfy»',
    directionLabel: 'Design Element → Satisfied Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
  verify: {
    label: 'Verify',
    displayLabel: '«verify»',
    directionLabel: 'Test Case → Verified Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
} as const;

export function getRelationshipDefinition(kind: RequirementRelationshipKind): RelationshipMeta {
  return RELATIONSHIP_DEFINITIONS[kind];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/sysml/relationshipDefinitions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/relationshipDefinitions.ts src/engine/sysml/relationshipDefinitions.test.ts src/types/sysml_types.ts
git commit -m "feat(sysml): define central requirement relationship metadata"
```

---

### Task 2: Strict Endpoint and Direction Validation Engine

**Files:**
- Modify: `src/engine/sysml/connectionPolicy.ts:34-125`
- Test: `src/engine/sysml/connectionPolicy.test.ts`

**Interfaces:**
- Consumes: `RELATIONSHIP_DEFINITIONS` from Task 1
- Produces: `evaluateSysmlConnection`, `validDiagram`, `validateRelationshipEndpoints`

- [ ] **Step 1: Write failing tests for requirement diagram connection policy & direction checks**

```ts
// src/engine/sysml/connectionPolicy.test.ts (add tests)
describe('SysML Requirements Connection Policy & Direction Rules', () => {
  const req1 = { id: 'r1', name: 'Req 1', family: 'requirement' as const };
  const req2 = { id: 'r2', name: 'Req 2', family: 'requirement' as const };
  const block = { id: 'b1', name: 'Block 1', family: 'block' as const };
  const testCase = { id: 't1', name: 'Test 1', family: 'verificationCase' as const };

  it('permits all 7 requirement relationship kinds on requirements diagram', () => {
    const kinds = ['requirementContainment', 'deriveReqt', 'copy', 'refine', 'trace', 'satisfy', 'verify'];
    for (const kind of kinds) {
      const source = (kind === 'satisfy' ? block : kind === 'verify' ? testCase : req1);
      const res = evaluateSysmlConnection({
        relationshipKind: kind,
        source,
        target: req2,
        diagram: 'requirements',
      });
      expect(res.allowed).toBe(true);
    }
  });

  it('rejects reversed satisfy (Requirement -> Block)', () => {
    const res = evaluateSysmlConnection({
      relationshipKind: 'satisfy',
      source: req1,
      target: block,
      diagram: 'requirements',
    });
    expect(res.allowed).toBe(false);
    expect(res.diagnostics[0].code).toBe('INVALID_SATISFY_DIRECTION');
  });

  it('rejects reversed verify (Requirement -> Test Case)', () => {
    const res = evaluateSysmlConnection({
      relationshipKind: 'verify',
      source: req1,
      target: testCase,
      diagram: 'requirements',
    });
    expect(res.allowed).toBe(false);
    expect(res.diagnostics[0].code).toBe('INVALID_VERIFY_DIRECTION');
  });

  it('allows refine from model elements and requirements to requirement', () => {
    expect(evaluateSysmlConnection({ relationshipKind: 'refine', source: block, target: req1, diagram: 'requirements' }).allowed).toBe(true);
    expect(evaluateSysmlConnection({ relationshipKind: 'refine', source: req1, target: req2, diagram: 'requirements' }).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/engine/sysml/connectionPolicy.test.ts`
Expected: FAIL (invalid diagram or refine direction failure)

- [ ] **Step 3: Implement connectionPolicy updates**

In `src/engine/sysml/connectionPolicy.ts`:
- Update `validDiagram`:
```ts
function validDiagram(kind: string, diagram: ConnectionPolicyInput['diagram']): boolean {
  if (['association', 'composition', 'sharedAggregation', 'aggregation', 'generalization', 'dependency', 'allocation'].includes(kind)) return diagram === 'bdd';
  if (['binding', 'assembly', 'delegation'].includes(kind)) return diagram === 'ibd';
  if (REQUIREMENT_KINDS.has(kind)) return diagram === 'requirements' || diagram === 'rtm';
  if (USE_CASE_KINDS.has(kind)) return diagram === 'useCase';
  return false;
}
```
- Update `refine` rule to allow `source.family === 'requirement'`:
```ts
  if (kind === 'refine') {
    if (target.family !== 'requirement') {
      return reject(normalized, 'INVALID_REFINE_DIRECTION', 'Refine requires a target Requirement endpoint.', 'Connect to a Requirement.');
    }
    return { allowed: true, diagnostics: [] };
  }
```
- Update `trace` rule to allow any resolved endpoints:
```ts
  if (kind === 'trace') {
    if (source.family === 'unknown' && target.family === 'unknown') {
      return reject(normalized, 'UNKNOWN_STEREOTYPE_FAMILY', 'Trace requires declared endpoint families.', 'Declare supported stereotypes.');
    }
    return { allowed: true, diagnostics: [] };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/sysml/connectionPolicy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/connectionPolicy.ts src/engine/sysml/connectionPolicy.test.ts
git commit -m "feat(sysml): enable 7 requirement relationships in connection policy"
```

---

### Task 3: Independent Graph Integrity & Cycle Detection

**Files:**
- Modify: `src/services/sysmlCreationRules.ts:50-130`
- Test: `src/services/sysmlCreationRules.test.ts`

**Interfaces:**
- Produces: `wouldCreateRelationshipCycle` / updated `validateLegacyRelationshipCandidate`

- [ ] **Step 1: Write failing tests for independent cycle detection**

```ts
// in src/services/sysmlCreationRules.test.ts
it('rejects cycles independently for containment, deriveReqt, and copy', () => {
  const model = {
    blocks: [
      { id: 'r1', name: 'R1', stereotype: 'requirement' },
      { id: 'r2', name: 'R2', stereotype: 'requirement' },
      { id: 'r3', name: 'R3', stereotype: 'requirement' },
    ] as any,
    parts: [],
    relationships: [
      { id: 'rel1', sourceId: 'r1', targetId: 'r2', type: 'deriveReqt', label: '' },
      { id: 'rel2', sourceId: 'r2', targetId: 'r3', type: 'deriveReqt', label: '' },
    ] as any,
  };

  // r3 -> r1 creates derive cycle
  const badDerive = { id: 'rel3', sourceId: 'r3', targetId: 'r1', type: 'deriveReqt', label: '' };
  expect(validateLegacyRelationshipCandidate(model, badDerive).codes).toContain('RELATIONSHIP_CYCLE');

  // r3 -> r1 does NOT create containment cycle (containment is a separate graph)
  const okContainment = { id: 'rel4', sourceId: 'r3', targetId: 'r1', type: 'requirementContainment', label: '' };
  expect(validateLegacyRelationshipCandidate(model, okContainment).valid).toBe(true);
});
```

- [ ] **Step 2: Run test to verify failure or incomplete coverage**

Run: `npx vitest run src/services/sysmlCreationRules.test.ts`

- [ ] **Step 3: Implement independent cycle detection and relationshipDiagram mapping**

In `src/services/sysmlCreationRules.ts`:
- Ensure `createsCycle` checks only matching relationship kinds (`requirementContainment` checks only `requirementContainment`, `deriveReqt` checks only `deriveReqt`, `copy` checks only `copy`).
- Map `['requirementContainment', 'deriveReqt', 'copy', 'refine', 'trace', 'satisfy', 'verify']` to `'requirements'` in `relationshipDiagram`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/sysmlCreationRules.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sysmlCreationRules.ts src/services/sysmlCreationRules.test.ts
git commit -m "feat(sysml): enforce independent cycle detection for containment, deriveReqt, and copy"
```

---

### Task 4: Connection UI Options & Reversal Assistance Dialog

**Files:**
- Modify: `src/services/sysmlConnectionUi.ts:40-73`
- Modify: `src/App.tsx:10500-10525, 18220-18250`
- Test: `src/services/sysmlConnectionUi.test.ts`

**Interfaces:**
- Consumes: `RELATIONSHIP_DEFINITIONS`
- Produces: `getCanvasRelationshipKinds`, reversed endpoint assistance dialog in `App.tsx`

- [ ] **Step 1: Write failing tests for getCanvasRelationshipKinds in requirements mode**

```ts
// src/services/sysmlConnectionUi.test.ts
it('returns correct relationship options in requirements mode', () => {
  const model = {
    blocks: [
      { id: 'r1', name: 'R1', stereotype: 'requirement' },
      { id: 'r2', name: 'R2', stereotype: 'requirement' },
      { id: 'b1', name: 'B1', stereotype: 'block' },
      { id: 't1', name: 'T1', stereotype: 'testCase' },
    ] as any,
    parts: [],
    relationships: [],
  };

  const reqToReq = getCanvasRelationshipKinds(model, 'r1', 'r2', 'requirements');
  expect(reqToReq).toEqual(expect.arrayContaining(['requirementContainment', 'deriveReqt', 'copy', 'refine', 'trace']));

  const blockToReq = getCanvasRelationshipKinds(model, 'b1', 'r1', 'requirements');
  expect(blockToReq).toEqual(expect.arrayContaining(['satisfy', 'refine', 'trace']));

  const testToReq = getCanvasRelationshipKinds(model, 't1', 'r1', 'requirements');
  expect(testToReq).toEqual(expect.arrayContaining(['verify', 'refine', 'trace']));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/services/sysmlConnectionUi.test.ts`
Expected: FAIL

- [ ] **Step 3: Update sysmlConnectionUi.ts and App.tsx relationship picker**

In `src/services/sysmlConnectionUi.ts`:
- Update `relationshipContext`:
```ts
function relationshipContext(type: RelationshipData['type']): Diagram {
  if (type === 'binding') return 'ibd';
  if (['requirementContainment', 'derive', 'deriveReqt', 'copy', 'satisfy', 'verify', 'refine', 'trace'].includes(type)) return 'requirements';
  return 'bdd';
}
```
In `src/App.tsx`:
- Update `requirementConnectionPicker` modal to display `directionLabel` from `RELATIONSHIP_DEFINITIONS` and offer a "Reverse and Create" button if the user dragged in the reverse direction (e.g. Req -> Test Case).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/sysmlConnectionUi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sysmlConnectionUi.ts src/services/sysmlConnectionUi.test.ts src/App.tsx
git commit -m "feat(sysml): add requirement connection options and reversal assistance"
```

---

### Task 5: Requirements Canvas Toolbar & Multi-Stereotype Visibility

**Files:**
- Modify: `src/App.tsx:14270-14285, 16050-16085`
- Test: `src/components/sysml/sysmlBrowserFlow.test.tsx`

**Interfaces:**
- Produces: `+ Block` and `+ Test Case` buttons in Requirements diagram mode, multi-stereotype block visibility.

- [ ] **Step 1: Write unit / component test checking requirements canvas node rendering**

Verify that in `diagramMode === 'requirements'`, blocks with `stereotype === 'requirement'`, `'block'`, and `'testCase'` render on the canvas.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/sysml/sysmlBrowserFlow.test.tsx`

- [ ] **Step 3: Update App.tsx toolbar and canvas filter**

In `src/App.tsx`:
- Add `+ Block` and `+ Test Case` buttons to the toolbar when `diagramMode === 'requirements'`.
- Update block filter:
```ts
      if (diagramMode === 'requirements') {
        const allowedStereotypes = ['requirement', 'block', 'part', 'testCase', 'activity', 'useCase', 'stateMachine'];
        if (!allowedStereotypes.includes(block.stereotype)) return null;
        const blockLayer = block.layerId ?? 'root';
        if (block.stereotype === 'requirement' && blockLayer !== currentLayerId) return null;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/sysml/sysmlBrowserFlow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/sysml/sysmlBrowserFlow.test.tsx
git commit -m "feat(sysml): enable block and testCase creation & visibility on requirements diagram"
```

---

### Task 6: Visual SVG Relationship Markers and Directions

**Files:**
- Modify: `src/App.tsx:11650-11675, 14510-14565`
- Modify: `src/features/reporting/reportDiagrams.ts:60-95`
- Test: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- Consumes: `RELATIONSHIP_DEFINITIONS`
- Produces: Correct SVG paths, dashed styles, start/end markers, and stereotype badges.

- [ ] **Step 1: Write failing tests for reportDiagrams SVG markers and line styles**

```ts
// src/features/reporting/reportDiagrams.sysml.test.ts
it('renders deriveReqt, copy, refine, trace, satisfy, verify with dashed lines and open arrows', () => {
  const rels = [
    rel({ id: 'r1', sourceId: 'reqDerived', targetId: 'reqBase', type: 'deriveReqt' }),
    rel({ id: 'r2', sourceId: 'reqCopy', targetId: 'reqMaster', type: 'copy' }),
    rel({ id: 'r3', sourceId: 'block1', targetId: 'req1', type: 'satisfy' }),
    rel({ id: 'r4', sourceId: 'test1', targetId: 'req1', type: 'verify' }),
  ];
  const html = renderDiagramHtml(rels);
  expect(html).toContain('«deriveReqt»');
  expect(html).toContain('«copy»');
  expect(html).toContain('«satisfy»');
  expect(html).toContain('«verify»');
  expect(html).toContain('stroke-dasharray="4,2"');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`

- [ ] **Step 3: Update App.tsx and reportDiagrams.ts**

In `App.tsx` and `reportDiagrams.ts`:
- Containment: `markerStart="url(#requirement-containment-crosshair)"`, no `markerEnd`, solid stroke.
- `deriveReqt`, `copy`, `refine`, `trace`, `satisfy`, `verify`: `strokeDasharray="4,2"`, `markerEnd="url(#open-arrow)"` at target, centered stereotype badge.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sysml.test.ts
git commit -m "feat(sysml): align SVG markers and line styles with SysML 1.6 notation"
```

---

### Task 7: Refactor RTM Data Model and Directional Indexing

**Files:**
- Modify: `src/engine/sysml/rtm.ts`
- Test: `src/engine/sysml/rtm.test.ts`

**Interfaces:**
- Produces: Corrected `RtmRow` structure (`containmentParents`, `containmentChildren`, `derivedFrom`, `derivedRequirements`, `copiedFrom`, `copiedRequirements`, `satisfiedBy`, `verifiedBy`, `refinedBy`, `tracedElements`, `satisfactionStatus`, `verificationStatus`).

- [ ] **Step 1: Write failing tests for complete RTM indexing and directional mapping**

```ts
// src/engine/sysml/rtm.test.ts
it('indexes all 7 relationship types into directional RTM fields', () => {
  const repo = createTestRepository();
  repo.requirements.r1 = { id: 'r1', requirementId: 'REQ-1', name: 'Parent Req', text: '' };
  repo.requirements.r2 = { id: 'r2', requirementId: 'REQ-2', name: 'Child / Derived Req', text: '' };
  repo.requirements.r3 = { id: 'r3', requirementId: 'REQ-3', name: 'Copy Req', text: '' };
  repo.definitions.b1 = { id: 'b1', name: 'Controller', kind: 'block' };
  repo.verificationCases.t1 = { id: 't1', name: 'Temp Test', kind: 'verificationCase' };

  repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
  repo.relationships.rd1 = { id: 'rd1', kind: 'deriveReqt', sourceId: 'r2', targetId: 'r1' };
  repo.relationships.rcopy1 = { id: 'rcopy1', kind: 'copy', sourceId: 'r3', targetId: 'r2' };
  repo.relationships.rsat = { id: 'rsat', kind: 'satisfy', sourceId: 'b1', targetId: 'r2' };
  repo.relationships.rver = { id: 'rver', kind: 'verify', sourceId: 't1', targetId: 'r2' };
  repo.relationships.rref = { id: 'rref', kind: 'refine', sourceId: 'b1', targetId: 'r2' };
  repo.relationships.rtr = { id: 'rtr', kind: 'trace', sourceId: 'r1', targetId: 'r3' };

  const matrix = buildTraceabilityMatrix(repo);
  const rowR2 = matrix.rows.find(r => r.requirement.id === 'r2')!;

  expect(rowR2.containmentParents.map(x => x.id)).toContain('r1');
  expect(rowR2.derivedFrom.map(x => x.id)).toContain('r1');
  expect(rowR2.copiedRequirements.map(x => x.id)).toContain('r3');
  expect(rowR2.satisfiedBy.map(x => x.id)).toContain('b1');
  expect(rowR2.verifiedBy.map(x => x.id)).toContain('t1');
  expect(rowR2.refinedBy.map(x => x.id)).toContain('b1');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/engine/sysml/rtm.test.ts`
Expected: FAIL

- [ ] **Step 3: Update rtm.ts with corrected RtmRow and directional indexing**

Implement the full indexing logic as defined in Section 9.1 of the specification, separating satisfaction coverage and verification status.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/sysml/rtm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/rtm.ts src/engine/sysml/rtm.test.ts
git commit -m "feat(sysml): refactor RTM data model and directional indexing"
```

---

### Task 8: Traceability Matrix UI & Virtualized Grid Updates

**Files:**
- Modify: `src/components/sysml/TraceabilityMatrix.tsx`
- Modify: `src/components/sysml/VirtualizedTraceabilityGrid.tsx`
- Test: `src/components/sysml/TraceabilityMatrix.test.tsx`
- Test: `src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`

**Interfaces:**
- Consumes: Refactored `RtmRow` from Task 7
- Produces: Enhanced RTM table and virtualized grid with dedicated columns: Contained By, Contains, Derived From, Derived Requirements, Copied From, Satisfied By, Verified By, Refined By, Traced Elements.

- [ ] **Step 1: Write failing tests for RTM column rendering and badges**

Test that `Contained By`, `Derived From`, `Copied From`, `Satisfied By`, `Verified By`, `Refined By`, and `Traced Elements` render the respective badges with appropriate colors and titles.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/sysml/TraceabilityMatrix.test.tsx`

- [ ] **Step 3: Update TraceabilityMatrix.tsx and VirtualizedTraceabilityGrid.tsx**

Update headers, cell rendering, badges, accessibility attributes, and keyboard navigation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/sysml/TraceabilityMatrix.test.tsx src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sysml/TraceabilityMatrix.tsx src/components/sysml/VirtualizedTraceabilityGrid.tsx src/components/sysml/TraceabilityMatrix.test.tsx src/components/sysml/VirtualizedTraceabilityGrid.test.tsx
git commit -m "feat(sysml): update RTM UI with dedicated relationship columns and badges"
```

---

### Task 9: CSV & Excel Export with Dedicated Relationship Columns

**Files:**
- Modify: `src/engine/sysml/rtm.ts:130-155` (`exportRtmCsv`)
- Modify: `src/App.tsx:815-845` (`exportExcel`)
- Test: `src/engine/sysml/rtm.test.ts`

**Interfaces:**
- Produces: Enhanced CSV and Excel export containing all 7 relationship columns without merging refine and trace.

- [ ] **Step 1: Write failing test for CSV export headers and data**

Verify that `exportRtmCsv` outputs the required columns:
`Requirement ID,Requirement Name,Requirement Text,Status,Contained By,Contains,Derived From,Derived Requirements,Copied From,Copied Requirements,Satisfied By,Verified By,Verification Result,Refined By,Traced Elements`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/engine/sysml/rtm.test.ts`

- [ ] **Step 3: Implement export enhancements**

Update `exportRtmCsv` in `rtm.ts` and `exportExcel` in `App.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/sysml/rtm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/rtm.ts src/App.tsx src/engine/sysml/rtm.test.ts
git commit -m "feat(sysml): export dedicated requirement relationship columns in CSV and Excel"
```

---

### Task 10: Relationship Migration & End-to-End Integration Verification

**Files:**
- Create: `src/engine/sysml/relationshipMigration.ts`
- Create: `src/engine/sysml/requirementsEndToEnd.test.ts`
- Test: `src/engine/sysml/relationshipMigration.test.ts`

**Interfaces:**
- Produces: `migrateProjectRelationships`, end-to-end integration test of Section 15.4 model.

- [ ] **Step 1: Write failing tests for relationship migration and end-to-end flow**

Test creating the full Section 15.4 test model:
- `REQ-001` contains `REQ-002`
- `REQ-002` derives from `REQ-001`
- `REQ-003` copies `REQ-002`
- `HeaterController` satisfies `REQ-002`
- `TC-001` verifies `REQ-002`
- `Thermal State Machine` refines `REQ-002`
Verify canvas direction, RTM indexing, coverage calculation, and export.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/engine/sysml/requirementsEndToEnd.test.ts`

- [ ] **Step 3: Implement relationship migration and verify all components**

Implement `migrateProjectRelationships` and verify model integrity.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/relationshipMigration.ts src/engine/sysml/relationshipMigration.test.ts src/engine/sysml/requirementsEndToEnd.test.ts
git commit -m "feat(sysml): add relationship migration and end-to-end integration test"
```
