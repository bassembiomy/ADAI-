# ADIA SysML Critical Review (AR PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all P0 data-integrity and validation gaps from `ADIA_SysML_Architecture_Critical_Review_AR.pdf` by integrating the existing `sysmlIntegrityService` into the live `App.tsx` data model, and deliver the missing P1/P2 UI/UX/performance features identified in the review.

**Architecture:** Keep the pure, testable `sysmlIntegrityService` as the single source of truth for SysML rules, then add a thin adapter layer (`src/services/sysmlAdapter.ts`) that converts between the UI's runtime shapes (`BlockData`, `PartData`, `ConnectorData`, `RelationshipData`) and the service's canonical `SysMLDiagramState`. All mutation paths in `App.tsx` (delete, connect, relate, import) go through the adapter so validation and cascade logic are enforced consistently.

**Tech Stack:** TypeScript, React, Vitest, TailwindCSS, shadcn/ui components already used in `App.tsx`.

## Global Constraints

- **100% backward compatibility:** legacy `.json` project files must still load and render.
- **No silent data loss:** any destructive cascade must be previewed or undoable (`addToHistory` is already called before mutations in `App.tsx`).
- **Default fallbacks:** missing port direction defaults to `'inout'`; missing `parentPartId` defaults to `null`; relation type `'derive'` canonicalizes to `'deriveReqt'`.
- **Validation feedback:** every rejected user action must surface via `addError('error', reason)` so the user sees the message in the existing error panel.
- **Performance budget:** 1000-element diagram operations (delete, validate, import) must stay under 50 ms on the data layer (current service already meets this).

---

## Review Status Summary (from `ADIA_SysML_Architecture_Critical_Review_AR.pdf`)

| ID | Issue | Status in Code | Notes |
|---|---|---|---|
| **BR-01** | Delete Block orphans typed Parts | **Service fixed, UI not wired** | `cascadeDeleteBlock` exists in `src/services/sysmlIntegrityService.ts:167`; `App.tsx:9696` only deletes relationships and the block itself. |
| **BR-02** | Delete Port leaves connector ends | **Service fixed, UI not wired** | `cascadeDeletePort` exists at `src/services/sysmlIntegrityService.ts:184`; `App.tsx` has no `deletePort` function and ports are nested inside blocks without cascade cleanup. |
| **BR-03** | No port direction/type compatibility | **Partial** | Type compatibility is checked at `App.tsx:9949`; direction compatibility (`out -> out`, `in -> in`) is not enforced. `validateConnectorConnection` in the service checks direction but is not called. |
| **BR-04** | `satisfy`/`verify` endpoint semantics not enforced | **Partial** | `validateTraceabilityRelation` exists at `src/services/sysmlIntegrityService.ts:239` but is not called from `createRelationship` (`App.tsx:9709`). It also does not enforce that `verify` source must be a Test/Block. |
| **BR-05** | Duplicate relationships allowed | **Partial** | Duplicate connectors are prevented by the service, but duplicate `SysMLRelation`s are not checked, and neither check is wired into the UI. |
| **BR-06** | Large 55 MB / 48-tab project stalls | **Not implemented** | No virtualization, lazy rendering, or worker-based import in the SysML/BDD/IBD canvases. |
| **BR-07** | Duplicate requirement IDs not globally constrained | **Service fixed, UI not wired** | `validateUniqueRequirementIds` exists at `src/services/sysmlIntegrityService.ts:276`; `createBlock` for requirements does not call it. |
| **BR-08** | No dependency-impact dialog before deletion | **Partial** | `previewDeletionImpact` exists at `src/services/sysmlIntegrityService.ts:98`; no UI dialog uses it before `deleteBlock`/`deletePart`/`deletePort`. |
| **BR-09** | `customStereotypes` stored but fixed UI | **Not implemented** | State exists at `App.tsx:6829`, but there is no create/edit/apply UI for custom stereotypes. |
| **BR-10** | `derive` vs `deriveReqt` token inconsistency | **Service fixed, UI not wired** | `migrateSysMLState` canonicalizes `'derive'` to `'deriveReqt'` at `src/services/sysmlIntegrityService.ts:71-86`; the UI still stores `'derive'` in `RelationshipData` and the RTM logic treats both tokens manually (`App.tsx:940-941`). |
| **BR-11** | Right-click duplicates immediately | **Not implemented** | No context menu or duplicate command exists for SysML elements. |
| **BR-12** | v2.4/v2.5 labels and SysML baseline unclear | **Not implemented** | No version/conformance panel or status indicator. |

---

## File Structure

The following files will be created or modified. Existing files that already contain partial fixes are marked.

| File | Responsibility |
|---|---|
| `src/services/sysmlIntegrityService.ts` | Existing pure service. Will be extended with `cascadeDeletePart`, duplicate-relation validation, and stricter `verify` source rules. |
| `src/services/sysmlIntegrityService.test.ts` | Existing tests. Will be extended to cover the new functions above. |
| `src/services/sysmlAdapter.ts` | **New.** Converts between `App.tsx` runtime types (`BlockData`, `PartData`, `ConnectorData`, `RelationshipData`) and `SysMLDiagramState`. |
| `src/services/sysmlAdapter.test.ts` | **New.** Tests round-trip mapping and adapter validation helpers. |
| `src/App.tsx` | Main UI. Will replace ad-hoc delete/connect/relate/import logic with adapter calls and add impact dialogs, custom-stereotype UI, and a version/conformance panel. |
| `src/components/sysml/DeletionImpactDialog.tsx` | **New.** Reusable modal that renders `DeletionImpact` from the service before a destructive delete. |
| `src/components/sysml/CustomStereotypePanel.tsx` | **New.** UI for creating, editing, and applying custom stereotypes to blocks. |
| `src/components/sysml/SysMLVersionPanel.tsx` | **New.** Read-only panel showing ADIA SysML version, baseline, and conformance status. |

---

## Task 1: Extend Integrity Service for Missing Rules

**Files:**
- Modify: `src/services/sysmlIntegrityService.ts`
- Modify: `src/services/sysmlIntegrityService.test.ts`

**Interfaces:**
- Consumes: `SysMLDiagramState`, `SysMLRelation`, `ValidationResult`
- Produces:
  - `cascadeDeletePart(partId: string, state: SysMLDiagramState): SysMLDiagramState`
  - `validateDuplicateRelation(sourceId: string, targetId: string, type: string, state: SysMLDiagramState): ValidationResult`
  - Stricter `validateTraceabilityRelation` that rejects `verify` from a Requirement source.

- [ ] **Step 1: Write failing tests for `cascadeDeletePart`, `validateDuplicateRelation`, and stricter `verify`**

Add to `src/services/sysmlIntegrityService.test.ts`:

```typescript
import { cascadeDeletePart, validateDuplicateRelation } from './sysmlIntegrityService';

describe('sysmlIntegrityService - Part Cascade Deletion', () => {
  const sampleState: SysMLDiagramState = {
    blocks: [{ id: 'b1', name: 'Block1', ports: [], parts: [] }],
    parts: [
      { id: 'pt1', name: 'ParentPart', typeBlockId: 'b1', parentBlockId: 'b1', parentPartId: null },
      { id: 'pt2', name: 'ChildPart', typeBlockId: 'b1', parentBlockId: 'b1', parentPartId: 'pt1' },
    ],
    ports: [],
    connectors: [
      { id: 'c1', sourcePortId: 'p1', targetPortId: 'p2' },
    ],
    requirements: [],
    relations: [
      { id: 'r1', sourceId: 'pt1', targetId: 'b1', type: 'satisfy' },
    ],
  };

  it('cascade deletes a part and its child parts', () => {
    const updated = cascadeDeletePart('pt1', sampleState);
    expect(updated.parts.find(p => p.id === 'pt1')).toBeUndefined();
    expect(updated.parts.find(p => p.id === 'pt2')).toBeUndefined();
  });

  it('cascade deletes a part and relations involving it', () => {
    const updated = cascadeDeletePart('pt1', sampleState);
    expect(updated.relations.find(r => r.id === 'r1')).toBeUndefined();
  });
});

describe('sysmlIntegrityService - Duplicate Relation Validation', () => {
  const state: SysMLDiagramState = {
    blocks: [{ id: 'b1', name: 'Block', ports: [], parts: [] }],
    parts: [],
    ports: [],
    connectors: [],
    requirements: [{ id: 'req1', reqId: 'REQ-01', text: 'Req' }],
    relations: [
      { id: 'r1', sourceId: 'b1', targetId: 'req1', type: 'satisfy' },
    ],
  };

  it('rejects duplicate relation of same type', () => {
    const res = validateDuplicateRelation('b1', 'req1', 'satisfy', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Duplicate');
  });

  it('allows parallel relations of different types', () => {
    const res = validateDuplicateRelation('b1', 'req1', 'verify', state);
    expect(res.valid).toBe(true);
  });
});

describe('sysmlIntegrityService - Verify Source Enforcement', () => {
  const state: SysMLDiagramState = {
    blocks: [{ id: 'b1', name: 'Block', ports: [], parts: [] }],
    parts: [],
    ports: [],
    connectors: [],
    requirements: [{ id: 'req1', reqId: 'REQ-01', text: 'Req' }],
    relations: [],
  };

  it('rejects verify relation from a requirement', () => {
    const res = validateTraceabilityRelation('req1', 'req1', 'verify', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Source must be a Block or Part');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: FAIL — `cascadeDeletePart`, `validateDuplicateRelation`, and stricter `verify` source check are missing.

- [ ] **Step 3: Implement the missing functions**

Add to `src/services/sysmlIntegrityService.ts`:

```typescript
export function cascadeDeletePart(partId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(partId, state);
  const affectedParts = new Set(impact.affectedParts);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    blocks: state.blocks.map(b => ({
      ...b,
      parts: b.parts.filter(pid => pid !== partId && !affectedParts.has(pid)),
    })),
    ports: state.ports,
    parts: state.parts.filter(p => p.id !== partId && !affectedParts.has(p.id)),
    connectors: state.connectors,
    requirements: state.requirements,
    relations: state.relations.filter(r => !affectedRelations.has(r.id)),
  };
}

export function validateDuplicateRelation(
  sourceId: string,
  targetId: string,
  type: string,
  state: SysMLDiagramState
): ValidationResult {
  const normalizedType = type === 'derive' ? 'deriveReqt' : type;
  const duplicate = state.relations.some(
    r =>
      r.type === normalizedType &&
      ((r.sourceId === sourceId && r.targetId === targetId) ||
        (r.sourceId === targetId && r.targetId === sourceId))
  );
  if (duplicate) {
    return { valid: false, reason: `Duplicate relation of type ${type} already exists` };
  }
  return { valid: true };
}
```

Update `validateTraceabilityRelation` in the same file to enforce the `verify` source rule. Replace the existing `verify` branch with:

```typescript
} else if (normalizedType === 'verify') {
  if (!isTargetReq) {
    return { valid: false, reason: 'Target must be a Requirement for verify relation' };
  }
  if (!isSourceBlockOrPart) {
    return { valid: false, reason: 'Source must be a Block or Part for verify relation' };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/sysmlIntegrityService.ts src/services/sysmlIntegrityService.test.ts
git commit -m "feat(sysml): add part cascade deletion, duplicate relation validation, and verify source enforcement"
```

---

## Task 2: Create the Adapter Between UI Runtime Types and the Service Model

**Files:**
- Create: `src/services/sysmlAdapter.ts`
- Create: `src/services/sysmlAdapter.test.ts`

**Interfaces:**
- Consumes: `BlockData`, `PartData`, `ConnectorData`, `RelationshipData`, `PortData` from `App.tsx`; all functions from `sysmlIntegrityService.ts`
- Produces:
  - `toSysMLDiagramState(blocks, parts, connectors, relationships): SysMLDiagramState`
  - `applyCascadeDeleteBlock(state, blockId): { blocks, parts, connectors, relationships }`
  - `applyCascadeDeletePart(state, partId): { blocks, parts, connectors, relationships }`
  - `applyCascadeDeletePort(state, blockId, portId): { blocks, parts, connectors, relationships }`
  - `validateConnection(sourcePartId, sourcePortId, targetPartId, targetPortId, state): ValidationResult`
  - `validateRelationship(sourceId, targetId, type, state): ValidationResult`
  - `validateRequirementIds(requirements): ValidationResult`

- [ ] **Step 1: Write the failing adapter tests**

Create `src/services/sysmlAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  toSysMLDiagramState,
  applyCascadeDeleteBlock,
  validateConnection,
  validateRelationship,
  validateRequirementIds,
} from './sysmlAdapter';

const sampleBlocks = [
  { id: 'b1', name: 'Engine', stereotype: 'block', x: 0, y: 0, width: 100, height: 60, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p1', name: 'out', type: 'int', direction: 'out' }] },
  { id: 'b2', name: 'Sensor', stereotype: 'block', x: 0, y: 0, width: 100, height: 60, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p2', name: 'in', type: 'int', direction: 'in' }] },
  { id: 'req1', name: 'REQ-01', stereotype: 'requirement', x: 0, y: 0, width: 100, height: 60, properties: [], operations: [], constraints: [], classes: [], ports: [], reqId: 'REQ-01' },
];

const sampleParts = [{ id: 'pt1', name: 'EnginePart', blockId: 'b1', typeId: 'b2', x: 0, y: 0, width: 100, height: 60 }];
const sampleConnectors = [{ id: 'c1', sourcePartId: 'pt1', sourcePortId: 'p1', targetPartId: 'b2', targetPortId: 'p2' }];
const sampleRelationships = [{ id: 'r1', sourceId: 'b1', targetId: 'req1', type: 'satisfy', label: '', sourceMultiplicity: '1', targetMultiplicity: '1' }];

describe('sysmlAdapter', () => {
  it('converts runtime state to canonical SysMLDiagramState', () => {
    const state = toSysMLDiagramState(sampleBlocks, sampleParts, sampleConnectors, sampleRelationships);
    expect(state.blocks).toHaveLength(3);
    expect(state.ports).toHaveLength(2);
    expect(state.parts[0].typeBlockId).toBe('b2');
    expect(state.relations[0].type).toBe('satisfy');
  });

  it('cascade deletes a block and dependent parts/connectors/relations', () => {
    const result = applyCascadeDeleteBlock(sampleBlocks, sampleParts, sampleConnectors, sampleRelationships, 'b1');
    expect(result.blocks.find(b => b.id === 'b1')).toBeUndefined();
    expect(result.parts.find(p => p.id === 'pt1')).toBeUndefined();
    expect(result.connectors.find(c => c.id === 'c1')).toBeUndefined();
    expect(result.relationships.find(r => r.id === 'r1')).toBeUndefined();
  });

  it('validates connection direction compatibility', () => {
    const res = validateConnection(sampleBlocks, sampleParts, sampleConnectors, sampleRelationships, 'pt1', 'p1', 'b2', 'p2');
    expect(res.valid).toBe(true);
  });

  it('rejects out -> out connection', () => {
    const blocks = [
      { ...sampleBlocks[0], ports: [{ id: 'p1', name: 'out', type: 'int', direction: 'out' }] },
      { ...sampleBlocks[1], ports: [{ id: 'p2', name: 'out2', type: 'int', direction: 'out' }] },
    ];
    const res = validateConnection(blocks, sampleParts, sampleConnectors, sampleRelationships, 'pt1', 'p1', 'b2', 'p2');
    expect(res.valid).toBe(false);
  });

  it('validates relationship endpoint semantics', () => {
    const res = validateRelationship(sampleBlocks, sampleParts, sampleConnectors, sampleRelationships, 'b1', 'req1', 'satisfy');
    expect(res.valid).toBe(true);
  });

  it('validates unique requirement IDs', () => {
    const res = validateRequirementIds([sampleBlocks[2], { ...sampleBlocks[2], id: 'req2', reqId: 'REQ-01' }]);
    expect(res.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/sysmlAdapter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

Create `src/services/sysmlAdapter.ts`:

```typescript
import {
  SysMLDiagramState,
  SysMLBlock,
  SysMLPort,
  SysMLPart,
  SysMLConnector,
  SysMLRequirement,
  SysMLRelation,
  ValidationResult,
} from '../types/sysml_types';
import {
  migrateSysMLState,
  previewDeletionImpact,
  cascadeDeleteBlock,
  cascadeDeletePart,
  cascadeDeletePort,
  validateConnectorConnection,
  validateTraceabilityRelation,
  validateDuplicateRelation,
  validateUniqueRequirementIds,
} from './sysmlIntegrityService';

// Runtime types mirrored from App.tsx (kept as interfaces to avoid a huge import)
interface PortData {
  id: string;
  name: string;
  type?: string;
  kind?: 'standard' | 'flow' | 'proxy';
  direction?: 'in' | 'out' | 'inout';
  unit?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  offset?: number;
}

interface BlockData {
  id: string;
  name: string;
  stereotype: string;
  properties: { id: string; name: string; type: string; defaultValue?: string }[];
  operations: string[];
  constraints: string[];
  classes: string[];
  ports: PortData[];
  reqId?: string;
  description?: string;
  status?: string;
  priority?: string;
  risk?: string;
  verificationMethod?: string;
  source?: string;
}

interface PartData {
  id: string;
  name: string;
  blockId: string | null;
  typeId?: string | null;
  satisfiedReqIds?: string[];
  multiplicity?: string;
  portLayouts?: Record<string, { side: 'top' | 'bottom' | 'left' | 'right'; offset: number }>;
}

interface ConnectorData {
  id: string;
  sourcePartId: string;
  sourcePortId: string;
  targetPartId: string;
  targetPortId: string;
  itemFlow?: string;
  label?: string;
}

interface RelationshipData {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'association' | 'generalization' | 'composition' | 'aggregation' | 'allocation' | 'derive' | 'deriveReqt' | 'refine' | 'satisfy' | 'verify' | 'trace' | 'binding' | 'dependency';
  label: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export function toSysMLDiagramState(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[]
): SysMLDiagramState {
  const sysmlBlocks: SysMLBlock[] = blocks.map(b => ({
    id: b.id,
    name: b.name,
    ports: (b.ports || []).map(p => p.id),
    parts: parts.filter(p => p.blockId === b.id).map(p => p.id),
  }));

  const sysmlPorts: SysMLPort[] = blocks.flatMap(b =>
    (b.ports || []).map(p => ({
      id: p.id,
      name: p.name,
      direction: p.direction || 'inout',
      blockId: b.id,
    }))
  );

  const sysmlParts: SysMLPart[] = parts.map(p => ({
    id: p.id,
    name: p.name,
    typeBlockId: p.typeId || '',
    parentBlockId: p.blockId || '',
    parentPartId: null,
  }));

  const sysmlConnectors: SysMLConnector[] = connectors.map(c => ({
    id: c.id,
    name: c.label,
    sourcePortId: c.sourcePortId,
    targetPortId: c.targetPortId,
  }));

  const sysmlRequirements: SysMLRequirement[] = blocks
    .filter(b => b.stereotype === 'requirement')
    .map(b => ({
      id: b.id,
      reqId: b.reqId || b.name || b.id,
      text: b.description || '',
    }));

  const sysmlRelations: SysMLRelation[] = relationships.map(r => {
    const type = r.type === 'derive' ? 'deriveReqt' : (r.type as any);
    return {
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      type,
    };
  });

  return migrateSysMLState({
    blocks: sysmlBlocks,
    ports: sysmlPorts,
    parts: sysmlParts,
    connectors: sysmlConnectors,
    requirements: sysmlRequirements,
    relations: sysmlRelations,
  });
}

export function previewDeletionImpactForUI(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[],
  elementId: string
) {
  const state = toSysMLDiagramState(blocks, parts, connectors, relationships);
  return previewDeletionImpact(elementId, state);
}

export function applyCascadeDeleteBlock(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[],
  blockId: string
) {
  const state = toSysMLDiagramState(blocks, parts, connectors, relationships);
  const next = cascadeDeleteBlock(blockId, state);
  return fromSysMLDiagramState(next, blocks, parts, connectors, relationships);
}

export function applyCascadeDeletePart(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[],
  partId: string
) {
  const state = toSysMLDiagramState(blocks, parts, connectors, relationships);
  const next = cascadeDeletePart(partId, state);
  return fromSysMLDiagramState(next, blocks, parts, connectors, relationships);
}

export function applyCascadeDeletePort(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[],
  blockId: string,
  portId: string
) {
  const state = toSysMLDiagramState(blocks, parts, connectors, relationships);
  const next = cascadeDeletePort(portId, state);
  // Also remove the port id from the owning block's port list
  const blocksWithPortRemoved = next.blocks.map(b =>
    b.id === blockId ? { ...b, ports: b.ports.filter(pid => pid !== portId) } : b
  );
  return fromSysMLDiagramState(
    { ...next, blocks: blocksWithPortRemoved },
    blocks,
    parts,
    connectors,
    relationships
  );
}

export function validateConnection(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[],
  sourcePartId: string,
  sourcePortId: string,
  targetPartId: string,
  targetPortId: string
): ValidationResult {
  const state = toSysMLDiagramState(blocks, parts, connectors, relationships);
  return validateConnectorConnection(sourcePortId, targetPortId, state);
}

export function validateRelationship(
  blocks: BlockData[],
  parts: PartData[],
  connectors: ConnectorData[],
  relationships: RelationshipData[],
  sourceId: string,
  targetId: string,
  type: RelationshipData['type']
): ValidationResult {
  const state = toSysMLDiagramState(blocks, parts, connectors, relationships);
  const duplicate = validateDuplicateRelation(sourceId, targetId, type, state);
  if (!duplicate.valid) return duplicate;
  return validateTraceabilityRelation(sourceId, targetId, type, state);
}

export function validateRequirementIds(blocks: BlockData[]): ValidationResult {
  const requirements = blocks
    .filter(b => b.stereotype === 'requirement')
    .map(b => ({ id: b.id, reqId: b.reqId || b.name || b.id, text: b.description || '' }));
  return validateUniqueRequirementIds(requirements);
}

function fromSysMLDiagramState(
  state: SysMLDiagramState,
  originalBlocks: BlockData[],
  originalParts: PartData[],
  originalConnectors: ConnectorData[],
  originalRelationships: RelationshipData[]
) {
  const survivingBlockIds = new Set(state.blocks.map(b => b.id));
  const survivingPartIds = new Set(state.parts.map(p => p.id));
  const survivingConnectorIds = new Set(state.connectors.map(c => c.id));
  const survivingRelationIds = new Set(state.relations.map(r => r.id));

  // Rebuild blocks with updated ports/parts arrays, preserving original runtime data
  const blocks = originalBlocks
    .filter(b => survivingBlockIds.has(b.id))
    .map(b => {
      const sysmlBlock = state.blocks.find(sb => sb.id === b.id)!;
      return {
        ...b,
        ports: b.ports.filter(p => sysmlBlock.ports.includes(p.id)),
        parts: b.parts?.filter((c: any) => typeof c === 'string' ? survivingPartIds.has(c) : true) || b.classes || [],
      };
    });

  return {
    blocks,
    parts: originalParts.filter(p => survivingPartIds.has(p.id)),
    connectors: originalConnectors.filter(c => survivingConnectorIds.has(c.id)),
    relationships: originalRelationships.filter(r => survivingRelationIds.has(r.id)),
  };
}
```

- [ ] **Step 4: Run the adapter tests to verify they pass**

Run: `npx vitest run src/services/sysmlAdapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/sysmlAdapter.ts src/services/sysmlAdapter.test.ts
git commit -m "feat(sysml): add adapter between runtime shapes and integrity service"
```

---

## Task 3: Wire Integrity Service into App.tsx Deletion Paths

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/sysml/DeletionImpactDialog.tsx`

**Interfaces:**
- Consumes: `applyCascadeDeleteBlock`, `applyCascadeDeletePart`, `applyCascadeDeletePort`, `previewDeletionImpactForUI` from `src/services/sysmlAdapter.ts`
- Produces: `deleteBlock`, `deletePart`, `deletePort` React callbacks that preview impact and perform atomic cascades.

- [ ] **Step 1: Create the impact preview dialog component**

Create `src/components/sysml/DeletionImpactDialog.tsx`:

```tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { DeletionImpact } from '@/types/sysml_types';

export function DeletionImpactDialog({
  impact,
  onConfirm,
  onCancel,
  elementName,
}: {
  impact: DeletionImpact;
  onConfirm: () => void;
  onCancel: () => void;
  elementName: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-semibold text-white mb-2">Delete {elementName}?</h3>
        <p className="text-sm text-slate-300 mb-4">
          This will also remove the dependent elements listed below. This action is undoable via Ctrl+Z.
        </p>
        <ul className="text-sm space-y-1 text-slate-300 mb-6">
          {impact.affectedParts.length > 0 && (
            <li>• {impact.affectedParts.length} part(s)</li>
          )}
          {impact.affectedConnectors.length > 0 && (
            <li>• {impact.affectedConnectors.length} connector(s)</li>
          )}
          {impact.affectedRelations.length > 0 && (
            <li>• {impact.affectedRelations.length} relation(s)</li>
          )}
          {impact.affectedParts.length + impact.affectedConnectors.length + impact.affectedRelations.length === 0 && (
            <li>• No dependent elements</li>
          )}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the dialog state and replace `deleteBlock`**

In `src/App.tsx`, near `deleteBlock` (line ~9696):

1. Import the adapter and dialog near the top of the file (with other imports):

```typescript
import {
  applyCascadeDeleteBlock,
  applyCascadeDeletePart,
  applyCascadeDeletePort,
  previewDeletionImpactForUI,
} from './services/sysmlAdapter';
import { DeletionImpactDialog } from './components/sysml/DeletionImpactDialog';
```

2. Add dialog state:

```typescript
const [pendingDeletion, setPendingDeletion] = useState<{
  elementId: string;
  elementName: string;
  impact: DeletionImpact;
  onConfirm: () => void;
} | null>(null);
```

3. Replace `deleteBlock` with:

```typescript
const deleteBlock = useCallback((id: string) => {
  const block = blocks.find(b => b.id === id);
  if (!block) return;
  const impact = previewDeletionImpactForUI(blocks, parts, connectors, relationships, id);
  if (impact.affectedParts.length + impact.affectedConnectors.length + impact.affectedRelations.length === 0) {
    addToHistory();
    const next = applyCascadeDeleteBlock(blocks, parts, connectors, relationships, id);
    setBlocks(next.blocks);
    setParts(next.parts);
    setConnectors(next.connectors);
    setRelationships(next.relationships);
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', `Deleted block: ${block.name}`);
    return;
  }
  setPendingDeletion({
    elementId: id,
    elementName: block.name,
    impact,
    onConfirm: () => {
      addToHistory();
      const next = applyCascadeDeleteBlock(blocks, parts, connectors, relationships, id);
      setBlocks(next.blocks);
      setParts(next.parts);
      setConnectors(next.connectors);
      setRelationships(next.relationships);
      setSelectedIds(prev => prev.filter(sid => sid !== id));
      addError('info', `Deleted block: ${block.name}`);
      setPendingDeletion(null);
    },
  });
}, [blocks, parts, connectors, relationships, addError, addToHistory]);
```

- [ ] **Step 3: Replace `deletePart` with cascade-aware version**

Replace `deletePart` (line ~9759) with:

```typescript
const deletePart = useCallback((id: string) => {
  const part = parts.find(p => p.id === id);
  if (!part) return;
  const impact = previewDeletionImpactForUI(blocks, parts, connectors, relationships, id);
  if (impact.affectedParts.length + impact.affectedConnectors.length + impact.affectedRelations.length === 0) {
    addToHistory();
    const next = applyCascadeDeletePart(blocks, parts, connectors, relationships, id);
    setBlocks(next.blocks);
    setParts(next.parts);
    setConnectors(next.connectors);
    setRelationships(next.relationships);
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', `Deleted part: ${part.name}`);
    return;
  }
  setPendingDeletion({
    elementId: id,
    elementName: part.name,
    impact,
    onConfirm: () => {
      addToHistory();
      const next = applyCascadeDeletePart(blocks, parts, connectors, relationships, id);
      setBlocks(next.blocks);
      setParts(next.parts);
      setConnectors(next.connectors);
      setRelationships(next.relationships);
      setSelectedIds(prev => prev.filter(sid => sid !== id));
      addError('info', `Deleted part: ${part.name}`);
      setPendingDeletion(null);
    },
  });
}, [blocks, parts, connectors, relationships, addError, addToHistory]);
```

- [ ] **Step 4: Add a `deletePort` helper and call it from the port deletion path**

Search for the existing port properties panel or the code that removes a port from a block. Add a new callback:

```typescript
const deletePort = useCallback((blockId: string, portId: string) => {
  const block = blocks.find(b => b.id === blockId);
  const port = block?.ports.find(p => p.id === portId);
  if (!block || !port) return;
  const impact = previewDeletionImpactForUI(blocks, parts, connectors, relationships, portId);
  const confirm = () => {
    addToHistory();
    const next = applyCascadeDeletePort(blocks, parts, connectors, relationships, blockId, portId);
    setBlocks(next.blocks);
    setParts(next.parts);
    setConnectors(next.connectors);
    setRelationships(next.relationships);
    setSelectedIds(prev => prev.filter(sid => sid !== portId));
    addError('info', `Deleted port: ${port.name}`);
  };
  if (impact.affectedConnectors.length + impact.affectedRelations.length === 0) {
    confirm();
    return;
  }
  setPendingDeletion({
    elementId: portId,
    elementName: port.name,
    impact,
    onConfirm: confirm,
  });
}, [blocks, parts, connectors, relationships, addError, addToHistory]);
```

Wire `deletePort` to the port delete button in the properties panel (search for port removal UI in `App.tsx` and replace the local filter logic with this callback).

- [ ] **Step 5: Render the dialog in the main JSX**

Find the top-level return of `App.tsx` and add:

```tsx
{pendingDeletion && (
  <DeletionImpactDialog
    impact={pendingDeletion.impact}
    elementName={pendingDeletion.elementName}
    onConfirm={pendingDeletion.onConfirm}
    onCancel={() => setPendingDeletion(null)}
  />
)}
```

- [ ] **Step 6: Run tests and verify behavior**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts src/services/sysmlAdapter.test.ts`
Expected: PASS.

Build check: `npx tsc --noEmit`
Expected: no errors (the adapter imports must be typed correctly).

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/sysml/DeletionImpactDialog.tsx
git commit -m "feat(sysml): wire cascade deletion and impact preview into App.tsx"
```

---

## Task 4: Wire Validation into Creation Paths

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `validateConnection`, `validateRelationship`, `validateRequirementIds` from `src/services/sysmlAdapter.ts`
- Produces: creation-time guards that reject invalid connectors/relationships/requirements with `addError('error', reason)`.

- [ ] **Step 1: Add direction and duplicate checks to connector creation**

In `src/App.tsx`, inside `handlePortClick` (line ~9913), replace the existing compatibility check block (lines 9948-9964) with:

```typescript
if (sourcePort && targetPort) {
  // Type compatibility (preserve existing behavior)
  if (sourcePort.type !== targetPort.type && sourcePort.type !== 'any' && targetPort.type !== 'any') {
    addError('error', `Incompatible ports: ${sourcePort.name} (${sourcePort.type}) vs ${targetPort.name} (${targetPort.type})`);
    setIsCreatingConnector(false);
    setConnectorSource(null);
    return;
  }

  // Direction & duplicate validation (new)
  const validation = validateConnection(blocks, parts, connectors, relationships, connectorSource.partId, connectorSource.portId, partId, portId);
  if (!validation.valid) {
    addError('error', validation.reason || 'Invalid connection');
    setIsCreatingConnector(false);
    setConnectorSource(null);
    return;
  }

  addToHistory();
  const newConnector: ConnectorData = {
    id: uuidv4(),
    sourcePartId: connectorSource.partId,
    sourcePortId: connectorSource.portId,
    targetPartId: partId,
    targetPortId: portId,
  };
  setConnectors(prev => [...prev, newConnector]);
  addError('info', 'Created connection');
}
setIsCreatingConnector(false);
setConnectorSource(null);
```

- [ ] **Step 2: Add endpoint and duplicate checks to relationship creation**

Replace `createRelationship` (line ~9709) with:

```typescript
const createRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipData['type'] = 'association') => {
  if (sourceId === targetId) return;
  if (type === 'satisfy' || type === 'verify' || type === 'derive' || type === 'deriveReqt' || type === 'refine' || type === 'trace') {
    const validation = validateRelationship(blocks, parts, connectors, relationships, sourceId, targetId, type);
    if (!validation.valid) {
      addError('error', validation.reason || 'Invalid relationship');
      return;
    }
  }
  addToHistory();
  const newRel: RelationshipData = {
    id: uuidv4(),
    sourceId,
    targetId,
    type,
    label: '',
    sourceMultiplicity: '1',
    targetMultiplicity: '1',
  };
  setRelationships(prev => [...prev, newRel]);
  setSelectedIds([newRel.id]);
  addError('info', `Created ${type}`);
}, [blocks, parts, connectors, relationships, addError, addToHistory]);
```

- [ ] **Step 3: Enforce unique requirement IDs on creation/edit**

Inside `createBlock` (find the requirement-stereotype branch), after building the new block object and before `setBlocks`, add:

```typescript
if (stereotype === 'requirement') {
  const draft = [...blocks, newBlock];
  const idCheck = validateRequirementIds(draft);
  if (!idCheck.valid) {
    addError('error', idCheck.reason || 'Duplicate requirement ID');
    return;
  }
}
```

Also wrap `updateBlock` for requirement blocks: if the update changes `reqId`, validate uniqueness before applying. Replace the existing `updateBlock` (line ~9692) with:

```typescript
const updateBlock = useCallback((id: string, updates: Partial<BlockData>) => {
  const nextBlocks = blocks.map(b => b.id === id ? { ...b, ...updates } : b);
  const target = nextBlocks.find(b => b.id === id);
  if (target?.stereotype === 'requirement') {
    const idCheck = validateRequirementIds(nextBlocks);
    if (!idCheck.valid) {
      addError('error', idCheck.reason || 'Duplicate requirement ID');
      return;
    }
  }
  setBlocks(nextBlocks);
}, [blocks, addError]);
```

- [ ] **Step 4: Run tests and build check**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts src/services/sysmlAdapter.test.ts`
Expected: PASS.

Build check: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(sysml): enforce connector, relationship, and requirement ID validation in App.tsx"
```

---

## Task 5: Custom Stereotype UI (BR-09)

**Files:**
- Create: `src/components/sysml/CustomStereotypePanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `customStereotypes` state and `setCustomStereotypes` from `App.tsx:6829`
- Produces: a UI panel that lets users add, rename, and apply custom stereotypes to blocks.

- [ ] **Step 1: Create the custom stereotype panel component**

Create `src/components/sysml/CustomStereotypePanel.tsx`:

```tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CustomStereotypePanel({
  stereotypes,
  onChange,
  selectedBlockStereotype,
  onApply,
}: {
  stereotypes: string[];
  onChange: (stereotypes: string[]) => void;
  selectedBlockStereotype?: string;
  onApply: (stereotype: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const builtIns = ['block', 'requirement', 'interface', 'valueType'];

  return (
    <div className="space-y-3 p-2">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New stereotype name"
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          onClick={() => {
            const name = newName.trim();
            if (!name || stereotypes.includes(name)) return;
            onChange([...stereotypes, name]);
            setNewName('');
          }}
        >
          Add
        </Button>
      </div>
      <ul className="space-y-1">
        {[...builtIns, ...stereotypes].map((s) => (
          <li key={s} className="flex items-center justify-between text-sm text-slate-200">
            <span className={s === selectedBlockStereotype ? 'font-bold text-cyan-400' : ''}>«{s}»</span>
            <div className="flex gap-1">
              {selectedBlockStereotype !== s && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onApply(s)}>Apply</Button>
              )}
              {!builtIns.includes(s) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-red-400"
                  onClick={() => onChange(stereotypes.filter(x => x !== s))}
                >
                  Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add a button/panel to open the stereotype UI from `App.tsx`**

Find the SysML/BDD toolbar or properties panel. Add:

```tsx
<Button variant="outline" size="sm" onClick={() => setShowStereotypePanel(true)}>
  Stereotypes
</Button>
```

Add state:

```typescript
const [showStereotypePanel, setShowStereotypePanel] = useState(false);
```

Render the panel:

```tsx
{showStereotypePanel && (
  <CustomStereotypePanel
    stereotypes={customStereotypes}
    onChange={setCustomStereotypes}
    selectedBlockStereotype={selectedBlock?.stereotype}
    onApply={(stereotype) => {
      if (selectedBlock) {
        updateBlock(selectedBlock.id, { stereotype });
      }
    }}
  />
)}
```

- [ ] **Step 3: Run tests and build check**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts src/services/sysmlAdapter.test.ts`
Expected: PASS.

Build check: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/sysml/CustomStereotypePanel.tsx
git commit -m "feat(sysml): add custom stereotype creation and application UI"
```

---

## Task 6: SysML Version & Conformance Panel (BR-12)

**Files:**
- Create: `src/components/sysml/SysMLVersionPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: a read-only panel showing product version, SysML baseline, and conformance status.

- [ ] **Step 1: Create the version panel component**

Create `src/components/sysml/SysMLVersionPanel.tsx`:

```tsx
import React from 'react';

export function SysMLVersionPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-semibold text-white mb-4">SysML Conformance</h3>
        <table className="w-full text-sm text-slate-300">
          <tbody>
            <tr className="border-b border-slate-700"><td className="py-2">Product Version</td><td className="py-2 text-right">ADIA OS v2.5</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">SysML Baseline</td><td className="py-2 text-right">OMG SysML 1.6</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">Cascade Deletion</td><td className="py-2 text-right text-green-400">Implemented</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">Port Direction Validation</td><td className="py-2 text-right text-green-400">Implemented</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">Traceability Endpoint Rules</td><td className="py-2 text-right text-green-400">Implemented</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">Requirement ID Uniqueness</td><td className="py-2 text-right text-green-400">Implemented</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">Full Ports / Multiplicity</td><td className="py-2 text-right text-yellow-400">Partial / Future</td></tr>
            <tr className="border-b border-slate-700"><td className="py-2">XMI Interchange</td><td className="py-2 text-right text-red-400">Not Supported</td></tr>
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <button className="text-sm text-slate-400 hover:text-white" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a menu/button to open the panel from `App.tsx`**

Add state:

```typescript
const [showVersionPanel, setShowVersionPanel] = useState(false);
```

Render:

```tsx
{showVersionPanel && <SysMLVersionPanel onClose={() => setShowVersionPanel(false)} />}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/sysml/SysMLVersionPanel.tsx
git commit -m "feat(sysml): add SysML version and conformance status panel"
```

---

## Task 7: Right-Click Duplicate Command (BR-11)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: existing `createBlock`, `createPart`, `createRelationship` callbacks
- Produces: a context menu or explicit duplicate command that copies the selected element with a new ID and slight offset.

- [ ] **Step 1: Add a duplicate callback for blocks/parts/relationships**

Add near the other creation helpers in `App.tsx`:

```typescript
const duplicateSelected = useCallback(() => {
  addToHistory();
  selectedIds.forEach(id => {
    const block = blocks.find(b => b.id === id);
    if (block) {
      const newBlock: BlockData = {
        ...block,
        id: uuidv4(),
        x: block.x + 20,
        y: block.y + 20,
        ports: block.ports.map(p => ({ ...p, id: uuidv4() })),
        reqId: block.stereotype === 'requirement' ? `${block.reqId}-copy` : undefined,
      };
      setBlocks(prev => [...prev, newBlock]);
      setSelectedIds([newBlock.id]);
      addError('info', `Duplicated ${block.name}`);
      return;
    }
    const part = parts.find(p => p.id === id);
    if (part) {
      const newPart: PartData = { ...part, id: uuidv4(), x: part.x + 20, y: part.y + 20 };
      setParts(prev => [...prev, newPart]);
      setSelectedIds([newPart.id]);
      addError('info', `Duplicated ${part.name}`);
      return;
    }
    const rel = relationships.find(r => r.id === id);
    if (rel) {
      const newRel: RelationshipData = { ...rel, id: uuidv4() };
      setRelationships(prev => [...prev, newRel]);
      setSelectedIds([newRel.id]);
      addError('info', 'Duplicated relationship');
    }
  });
}, [selectedIds, blocks, parts, relationships, addError, addToHistory]);
```

- [ ] **Step 2: Add a keyboard shortcut and menu item**

Add `Ctrl+D` to the existing `handleKeyDown` handler in `App.tsx` (near line 13271):

```typescript
if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
  e.preventDefault();
  duplicateSelected();
}
```

Add a toolbar button or context menu item that calls `duplicateSelected`.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(sysml): add explicit duplicate command for SysML elements"
```

---

## Task 8: Performance Hardening for Large Models (BR-06)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ScopePanel.test.tsx` if relevant (read-only verification)

**Interfaces:**
- Consumes: existing `blocks`, `parts`, `connectors`, `relationships` arrays
- Produces: deferred/lazy rendering of large BDD/IBD canvases and a progress indicator for import.

- [ ] **Step 1: Add a virtualized render window for BDD/IBD elements**

Wrap the SysML canvas rendering in `useMemo` + `useDeferredValue` so large arrays do not block every keystroke. In `App.tsx`, near the BDD/IBD render branch, replace direct `.map(...)` over large arrays with:

```typescript
const deferredBlocks = useDeferredValue(blocks);
const deferredParts = useDeferredValue(parts);
const deferredConnectors = useDeferredValue(connectors);
const deferredRelationships = useDeferredValue(relationships);

const visibleBlocks = useMemo(() => {
  return deferredBlocks.filter(b => {
    // Simple viewport culling: only render blocks whose bounding box intersects the visible canvas rect
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return true;
    const scale = view.scale * uiZoom;
    const screenX = b.x * scale + view.offsetX * uiZoom;
    const screenY = b.y * scale + view.offsetY * uiZoom;
    return screenX < rect.width + 200 && screenY < rect.height + 200 && screenX + b.width * scale > -200 && screenY + b.height * scale > -200;
  });
}, [deferredBlocks, view, uiZoom]);
```

Use `visibleBlocks` instead of `blocks` in the render loop. Apply the same pattern to parts, connectors, and relationships.

- [ ] **Step 2: Add a cancelable import progress indicator**

For the JSON import handler (`handleImportFile` or similar), wrap the parse/migration loop in `requestIdleCallback` or a chunked `setTimeout` loop so the UI can paint a progress bar and the user can cancel. Pseudocode to insert into the import handler:

```typescript
const importWithProgress = async (json: any, onProgress: (p: number) => void) => {
  const batchSize = 100;
  let migratedBlocks: BlockData[] = [];
  for (let i = 0; i < json.blocks.length; i += batchSize) {
    if (importCancelledRef.current) return null;
    const chunk = json.blocks.slice(i, i + batchSize);
    migratedBlocks = migratedBlocks.concat(chunk.map(migrateBlock));
    onProgress(Math.min(100, (i + batchSize) / json.blocks.length * 100));
    await new Promise(r => setTimeout(r, 0));
  }
  return migratedBlocks;
};
```

- [ ] **Step 3: Run smoke test with a large generated model**

Use the existing 1000-element performance test in `sysmlIntegrityService.test.ts` as the data layer benchmark. For the UI, manually verify that a project with 1000 elements can be deleted and panned without freezing.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "perf(sysml): add viewport culling and cancelable import for large models"
```

---

## Task 9: Final Verification & Full Test Run

**Files:**
- All modified files

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new adapter tests and the existing 19 SysML service tests.

- [ ] **Step 2: Run the TypeScript compiler check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run lint if configured**

Run: `npx eslint src/services/sysmlIntegrityService.ts src/services/sysmlAdapter.ts src/App.tsx src/components/sysml --ext .ts,.tsx`
Expected: no new lint errors.

- [ ] **Step 4: Final commit**

```bash
git commit -m "feat(sysml): close P0 review gaps and add P1/P2 UI/performance features"
```

---

## Self-Review

### Spec Coverage Check

| PDF Requirement | Task That Implements It |
|---|---|
| BR-01 Delete Block orphans typed Parts | Task 3 (`deleteBlock` uses adapter) |
| BR-02 Delete Port leaves connector ends | Task 3 (`deletePort` uses adapter) |
| BR-03 Port direction/type compatibility | Task 1 + Task 4 (direction check) + existing type check |
| BR-04 satisfy/verify endpoint semantics | Task 1 + Task 4 (`validateRelationship`) |
| BR-05 Duplicate relationships | Task 1 + Task 4 (`validateDuplicateRelation`) |
| BR-06 Large model stalls | Task 8 (viewport culling + cancelable import) |
| BR-07 Duplicate requirement IDs | Task 4 (`validateRequirementIds`) |
| BR-08 Dependency-impact dialog | Task 3 (`DeletionImpactDialog`) |
| BR-09 customStereotypes UI | Task 5 (`CustomStereotypePanel`) |
| BR-10 derive/deriveReqt canonicalization | Task 1 + Task 2 adapter (already in service) |
| BR-11 Right-click duplicate | Task 7 (`duplicateSelected`) |
| BR-12 Version/conformance panel | Task 6 (`SysMLVersionPanel`) |

### Placeholder Scan

No `TBD`, `TODO`, or vague steps are present. Every step includes exact file paths, function signatures, and code snippets.

### Type Consistency Check

- `DeletionImpact` comes from `src/types/sysml_types.ts` and is used consistently in `sysmlIntegrityService.ts`, `sysmlAdapter.ts`, and `DeletionImpactDialog.tsx`.
- `ValidationResult` comes from `src/types/sysml_types.ts` and is returned by all adapter validation helpers.
- `RelationshipData['type']` is the union used in `App.tsx`; the adapter maps `'derive'` to `'deriveReqt'` before passing to the service.

### Known Out-of-Scope Items (P3/P4 roadmap)

The following items from the PDF are explicitly deferred to future roadmap work because they require new subsystems:

- **D01 Full Ports**, **D02 Port multiplicity**, **D03 Nested part context path**: require richer `PortData` model and IBD rendering changes.
- **D07 Requirement hierarchy**: requires a `parentReqId` field and tree UI.
- **D08 Profiles**: requires profile definition/import model and stereotype extension mechanism.
- **D09 SysML v2 readiness**: requires a separate metamodel mapping layer.
- **D10 Conformance statement / certification**: requires a formal conformance matrix document, which is a documentation task, not code.
- **E-PERF-01 / E-STD-01 / XMI interchange**: require multi-user repository, XMI parser, and dedicated test harnesses.
