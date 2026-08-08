# ADIA SysML Module Architecture Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `sysmlIntegrityService` to enforce transactional cascade deletion, semantic port/connector validation, requirement governance, and legacy schema hydration for the ADIA SysML module.

**Architecture:** A decoupled, pure TypeScript service (`src/services/sysmlIntegrityService.ts`) with corresponding domain interfaces (`src/types/sysml_types.ts`). It handles cascade deletion rules, semantic port direction checks, relation endpoint validation, requirement ID uniqueness, and schema hydration without direct UI dependencies.

**Tech Stack:** TypeScript, Vitest / Jest (`npm test`)

## Global Constraints

- **Compatibility**: 100% backward compatible with legacy JSON diagram states.
- **Port Defaults**: Missing port direction defaults to `'inout'`.
- **Part Defaults**: Missing `parentPartId` defaults to `null`.
- **Relation Canonicalization**: Canonicalize relation type `'derive'` to `'deriveReqt'`.
- **Direction Enforcement**: Reject `out -> out` and `in -> in` connector wiring.
- **Traceability Rules**: `satisfy` connects Block/Part to Requirement; `deriveReqt` connects Requirement to Requirement; `verify` connects Test/Block to Requirement.

---

### Task 1: Core SysML Type Definitions & Schema Hydration Migration

**Files:**
- Create: `src/types/sysml_types.ts`
- Create: `src/services/sysmlIntegrityService.ts`
- Create: `src/services/sysmlIntegrityService.test.ts`

**Interfaces:**
- Produces:
  - `SysMLPort`: `{ id: string; name: string; direction: 'in' | 'out' | 'inout'; blockId: string }`
  - `SysMLPart`: `{ id: string; name: string; typeBlockId: string; parentBlockId: string; parentPartId: string | null }`
  - `SysMLBlock`: `{ id: string; name: string; ports: string[]; parts: string[] }`
  - `SysMLConnector`: `{ id: string; name?: string; sourcePortId: string; targetPortId: string }`
  - `SysMLRequirement`: `{ id: string; reqId: string; text: string }`
  - `SysMLRelation`: `{ id: string; sourceId: string; targetId: string; type: 'satisfy' | 'verify' | 'deriveReqt' | 'refines' | 'trace' }`
  - `SysMLDiagramState`: `{ blocks: SysMLBlock[]; ports: SysMLPort[]; parts: SysMLPart[]; connectors: SysMLConnector[]; requirements: SysMLRequirement[]; relations: SysMLRelation[] }`
  - `ValidationResult`: `{ valid: boolean; reason?: string }`
  - `DeletionImpact`: `{ elementId: string; elementType: 'block' | 'port' | 'part' | 'requirement'; affectedParts: string[]; affectedConnectors: string[]; affectedRelations: string[] }`
  - `migrateSysMLState(rawState: any): SysMLDiagramState`

- [ ] **Step 1: Write failing tests for schema hydration (`migrateSysMLState`)**

Create `src/services/sysmlIntegrityService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateSysMLState } from './sysmlIntegrityService';

describe('sysmlIntegrityService - Schema Hydration', () => {
  it('hydrates empty or undefined state with empty arrays', () => {
    const migrated = migrateSysMLState({});
    expect(migrated).toEqual({
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    });
  });

  it('populates missing port direction with default "inout"', () => {
    const raw = {
      ports: [{ id: 'p1', name: 'Port 1', blockId: 'b1' }]
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.ports[0].direction).toBe('inout');
  });

  it('populates missing parentPartId with null', () => {
    const raw = {
      parts: [{ id: 'pt1', name: 'Part 1', typeBlockId: 'b1', parentBlockId: 'b2' }]
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.parts[0].parentPartId).toBeNull();
  });

  it('canonicalizes relation type "derive" to "deriveReqt"', () => {
    const raw = {
      relations: [{ id: 'r1', sourceId: 'req1', targetId: 'req2', type: 'derive' }]
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.relations[0].type).toBe('deriveReqt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: FAIL (Cannot find module `./sysmlIntegrityService`)

- [ ] **Step 3: Define types and implement `migrateSysMLState`**

Create `src/types/sysml_types.ts`:

```typescript
export type PortDirection = 'in' | 'out' | 'inout';

export interface SysMLPort {
  id: string;
  name: string;
  direction: PortDirection;
  blockId: string;
}

export interface SysMLPart {
  id: string;
  name: string;
  typeBlockId: string;
  parentBlockId: string;
  parentPartId: string | null;
}

export interface SysMLBlock {
  id: string;
  name: string;
  ports: string[];
  parts: string[];
}

export interface SysMLConnector {
  id: string;
  name?: string;
  sourcePortId: string;
  targetPortId: string;
}

export interface SysMLRequirement {
  id: string;
  reqId: string;
  text: string;
}

export type RelationType = 'satisfy' | 'verify' | 'deriveReqt' | 'refines' | 'trace';

export interface SysMLRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
}

export interface SysMLDiagramState {
  blocks: SysMLBlock[];
  ports: SysMLPort[];
  parts: SysMLPart[];
  connectors: SysMLConnector[];
  requirements: SysMLRequirement[];
  relations: SysMLRelation[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface DeletionImpact {
  elementId: string;
  elementType: 'block' | 'port' | 'part' | 'requirement';
  affectedParts: string[];
  affectedConnectors: string[];
  affectedRelations: string[];
}
```

Create `src/services/sysmlIntegrityService.ts`:

```typescript
import {
  SysMLDiagramState,
  SysMLPort,
  SysMLPart,
  SysMLBlock,
  SysMLConnector,
  SysMLRequirement,
  SysMLRelation,
  RelationType,
} from '../types/sysml_types';

export function migrateSysMLState(rawState: any): SysMLDiagramState {
  if (!rawState || typeof rawState !== 'object') {
    return {
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    };
  }

  const blocks: SysMLBlock[] = Array.isArray(rawState.blocks)
    ? rawState.blocks.map((b: any) => ({
        id: String(b.id || ''),
        name: String(b.name || ''),
        ports: Array.isArray(b.ports) ? b.ports.map(String) : [],
        parts: Array.isArray(b.parts) ? b.parts.map(String) : [],
      }))
    : [];

  const ports: SysMLPort[] = Array.isArray(rawState.ports)
    ? rawState.ports.map((p: any) => ({
        id: String(p.id || ''),
        name: String(p.name || ''),
        direction: p.direction === 'in' || p.direction === 'out' || p.direction === 'inout' ? p.direction : 'inout',
        blockId: String(p.blockId || ''),
      }))
    : [];

  const parts: SysMLPart[] = Array.isArray(rawState.parts)
    ? rawState.parts.map((pt: any) => ({
        id: String(pt.id || ''),
        name: String(pt.name || ''),
        typeBlockId: String(pt.typeBlockId || ''),
        parentBlockId: String(pt.parentBlockId || ''),
        parentPartId: pt.parentPartId ? String(pt.parentPartId) : null,
      }))
    : [];

  const connectors: SysMLConnector[] = Array.isArray(rawState.connectors)
    ? rawState.connectors.map((c: any) => ({
        id: String(c.id || ''),
        name: c.name ? String(c.name) : undefined,
        sourcePortId: String(c.sourcePortId || ''),
        targetPortId: String(c.targetPortId || ''),
      }))
    : [];

  const requirements: SysMLRequirement[] = Array.isArray(rawState.requirements)
    ? rawState.requirements.map((r: any) => ({
        id: String(r.id || ''),
        reqId: String(r.reqId || r.id || ''),
        text: String(r.text || ''),
      }))
    : [];

  const relations: SysMLRelation[] = Array.isArray(rawState.relations)
    ? rawState.relations.map((rel: any) => {
        let relType: RelationType = 'trace';
        if (rel.type === 'derive' || rel.type === 'deriveReqt') {
          relType = 'deriveReqt';
        } else if (rel.type === 'satisfy' || rel.type === 'verify' || rel.type === 'refines' || rel.type === 'trace') {
          relType = rel.type;
        }
        return {
          id: String(rel.id || ''),
          sourceId: String(rel.sourceId || ''),
          targetId: String(rel.targetId || ''),
          type: relType,
        };
      })
    : [];

  return {
    blocks,
    ports,
    parts,
    connectors,
    requirements,
    relations,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: PASS (4 tests passing)

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add src/types/sysml_types.ts src/services/sysmlIntegrityService.ts src/services/sysmlIntegrityService.test.ts
git commit -m "feat(sysml): add core SysML types and legacy schema hydration"
```

---

### Task 2: Transactional Cascade Deletion & Impact Preview (BR-01, BR-02, BR-08)

**Files:**
- Modify: `src/services/sysmlIntegrityService.ts`
- Modify: `src/services/sysmlIntegrityService.test.ts`

**Interfaces:**
- Consumes: `SysMLDiagramState`, `DeletionImpact` from Task 1
- Produces:
  - `previewDeletionImpact(elementId: string, state: SysMLDiagramState): DeletionImpact`
  - `cascadeDeleteBlock(blockId: string, state: SysMLDiagramState): SysMLDiagramState`
  - `cascadeDeletePort(portId: string, state: SysMLDiagramState): SysMLDiagramState`

- [ ] **Step 1: Write failing tests for cascade deletion and impact preview**

Add to `src/services/sysmlIntegrityService.test.ts`:

```typescript
import {
  cascadeDeleteBlock,
  cascadeDeletePort,
  previewDeletionImpact,
} from './sysmlIntegrityService';

describe('sysmlIntegrityService - Cascade Deletion & Impact Preview', () => {
  const sampleState: SysMLDiagramState = {
    blocks: [
      { id: 'b1', name: 'EngineBlock', ports: ['p1'], parts: ['pt1'] },
      { id: 'b2', name: 'SensorBlock', ports: ['p2'], parts: [] },
    ],
    ports: [
      { id: 'p1', name: 'OutPort', direction: 'out', blockId: 'b1' },
      { id: 'p2', name: 'InPort', direction: 'in', blockId: 'b2' },
    ],
    parts: [
      { id: 'pt1', name: 'SubPart', typeBlockId: 'b2', parentBlockId: 'b1', parentPartId: null },
    ],
    connectors: [
      { id: 'c1', sourcePortId: 'p1', targetPortId: 'p2' },
    ],
    requirements: [
      { id: 'req1', reqId: 'REQ-01', text: 'Must work' },
    ],
    relations: [
      { id: 'r1', sourceId: 'b1', targetId: 'req1', type: 'satisfy' },
    ],
  };

  it('previews deletion impact for a block', () => {
    const impact = previewDeletionImpact('b1', sampleState);
    expect(impact.elementId).toBe('b1');
    expect(impact.elementType).toBe('block');
    expect(impact.affectedParts).toContain('pt1');
    expect(impact.affectedConnectors).toContain('c1');
    expect(impact.affectedRelations).toContain('r1');
  });

  it('cascade deletes a block and all dependent parts/ports/connectors/relations', () => {
    const updatedState = cascadeDeleteBlock('b1', sampleState);
    expect(updatedState.blocks.find(b => b.id === 'b1')).toBeUndefined();
    expect(updatedState.ports.find(p => p.id === 'p1')).toBeUndefined();
    expect(updatedState.parts.find(pt => pt.id === 'pt1')).toBeUndefined();
    expect(updatedState.connectors.find(c => c.id === 'c1')).toBeUndefined();
    expect(updatedState.relations.find(r => r.id === 'r1')).toBeUndefined();
    // b2, p2, req1 should remain
    expect(updatedState.blocks.length).toBe(1);
    expect(updatedState.ports.length).toBe(1);
  });

  it('cascade deletes a port and affected connectors/relations', () => {
    const updatedState = cascadeDeletePort('p1', sampleState);
    expect(updatedState.ports.find(p => p.id === 'p1')).toBeUndefined();
    expect(updatedState.connectors.find(c => c.id === 'c1')).toBeUndefined();
    expect(updatedState.blocks.find(b => b.id === 'b1')?.ports).not.toContain('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: FAIL (`previewDeletionImpact` / `cascadeDeleteBlock` / `cascadeDeletePort` not implemented)

- [ ] **Step 3: Implement cascade deletion logic**

Add implementation in `src/services/sysmlIntegrityService.ts`:

```typescript
import { DeletionImpact } from '../types/sysml_types';

export function previewDeletionImpact(elementId: string, state: SysMLDiagramState): DeletionImpact {
  const isBlock = state.blocks.some(b => b.id === elementId);
  const isPort = state.ports.some(p => p.id === elementId);
  const isPart = state.parts.some(pt => pt.id === elementId);
  const isReq = state.requirements.some(r => r.id === elementId);

  const elementType = isBlock ? 'block' : isPort ? 'port' : isPart ? 'part' : 'requirement';
  const affectedParts: Set<string> = new Set();
  const affectedConnectors: Set<string> = new Set();
  const affectedRelations: Set<string> = new Set();

  if (isBlock) {
    // Ports owned by block
    const blockPortIds = new Set(state.ports.filter(p => p.blockId === elementId).map(p => p.id));
    // Parts owned by or typing this block
    state.parts.forEach(pt => {
      if (pt.parentBlockId === elementId || pt.typeBlockId === elementId) {
        affectedParts.add(pt.id);
      }
    });
    // Connectors connected to block's ports
    state.connectors.forEach(c => {
      if (blockPortIds.has(c.sourcePortId) || blockPortIds.has(c.targetPortId)) {
        affectedConnectors.add(c.id);
      }
    });
    // Relations involving block, its ports, or affected parts
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId ||
          blockPortIds.has(r.sourceId) || blockPortIds.has(r.targetId) ||
          affectedParts.has(r.sourceId) || affectedParts.has(r.targetId)) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isPort) {
    state.connectors.forEach(c => {
      if (c.sourcePortId === elementId || c.targetPortId === elementId) {
        affectedConnectors.add(c.id);
      }
    });
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isPart) {
    // Child parts
    state.parts.forEach(pt => {
      if (pt.parentPartId === elementId) {
        affectedParts.add(pt.id);
      }
    });
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isReq) {
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  }

  return {
    elementId,
    elementType,
    affectedParts: Array.from(affectedParts),
    affectedConnectors: Array.from(affectedConnectors),
    affectedRelations: Array.from(affectedRelations),
  };
}

export function cascadeDeleteBlock(blockId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(blockId, state);
  const blockPorts = new Set(state.ports.filter(p => p.blockId === blockId).map(p => p.id));
  const affectedParts = new Set(impact.affectedParts);
  const affectedConnectors = new Set(impact.affectedConnectors);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    blocks: state.blocks.filter(b => b.id !== blockId),
    ports: state.ports.filter(p => !blockPorts.has(p.id)),
    parts: state.parts.filter(pt => !affectedParts.has(pt.id)),
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    requirements: state.requirements,
    relations: state.relations.filter(r => !affectedRelations.has(r.id)),
  };
}

export function cascadeDeletePort(portId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(portId, state);
  const affectedConnectors = new Set(impact.affectedConnectors);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    blocks: state.blocks.map(b => ({
      ...b,
      ports: b.ports.filter(pid => pid !== portId),
    })),
    ports: state.ports.filter(p => p.id !== portId),
    parts: state.parts,
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    requirements: state.requirements,
    relations: state.relations.filter(r => !affectedRelations.has(r.id)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: PASS (7 tests passing)

- [ ] **Step 5: Commit Task 2 changes**

```bash
git add src/services/sysmlIntegrityService.ts src/services/sysmlIntegrityService.test.ts
git commit -m "feat(sysml): add cascade deletion and deletion impact preview"
```

---

### Task 3: Semantic Connector & Port Direction Validation (BR-03, BR-05)

**Files:**
- Modify: `src/services/sysmlIntegrityService.ts`
- Modify: `src/services/sysmlIntegrityService.test.ts`

**Interfaces:**
- Consumes: `SysMLDiagramState`, `ValidationResult`
- Produces: `validateConnectorConnection(sourcePortId: string, targetPortId: string, state: SysMLDiagramState): ValidationResult`

- [ ] **Step 1: Write failing tests for connector validation**

Add to `src/services/sysmlIntegrityService.test.ts`:

```typescript
import { validateConnectorConnection } from './sysmlIntegrityService';

describe('sysmlIntegrityService - Connector Validation', () => {
  const state: SysMLDiagramState = {
    blocks: [],
    ports: [
      { id: 'p_out1', name: 'Out1', direction: 'out', blockId: 'b1' },
      { id: 'p_out2', name: 'Out2', direction: 'out', blockId: 'b1' },
      { id: 'p_in1', name: 'In1', direction: 'in', blockId: 'b2' },
      { id: 'p_in2', name: 'In2', direction: 'in', blockId: 'b2' },
      { id: 'p_inout1', name: 'Bi1', direction: 'inout', blockId: 'b3' },
    ],
    parts: [],
    connectors: [
      { id: 'c_existing', sourcePortId: 'p_out1', targetPortId: 'p_in1' }
    ],
    requirements: [],
    relations: [],
  };

  it('validates out -> in connection as valid', () => {
    const res = validateConnectorConnection('p_out1', 'p_in2', state);
    expect(res.valid).toBe(true);
  });

  it('validates inout -> in connection as valid', () => {
    const res = validateConnectorConnection('p_inout1', 'p_in1', state);
    expect(res.valid).toBe(true);
  });

  it('rejects self-connection on same port', () => {
    const res = validateConnectorConnection('p_out1', 'p_out1', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Cannot connect a port to itself');
  });

  it('rejects out -> out connection', () => {
    const res = validateConnectorConnection('p_out1', 'p_out2', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('out');
  });

  it('rejects in -> in connection', () => {
    const res = validateConnectorConnection('p_in1', 'p_in2', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('in');
  });

  it('rejects duplicate connector between same ports', () => {
    const res = validateConnectorConnection('p_out1', 'p_in1', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('duplicate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: FAIL (`validateConnectorConnection` not implemented)

- [ ] **Step 3: Implement `validateConnectorConnection`**

Add implementation in `src/services/sysmlIntegrityService.ts`:

```typescript
import { ValidationResult } from '../types/sysml_types';

export function validateConnectorConnection(
  sourcePortId: string,
  targetPortId: string,
  state: SysMLDiagramState
): ValidationResult {
  if (sourcePortId === targetPortId) {
    return { valid: false, reason: 'Cannot connect a port to itself' };
  }

  const srcPort = state.ports.find(p => p.id === sourcePortId);
  const tgtPort = state.ports.find(p => p.id === targetPortId);

  if (!srcPort || !tgtPort) {
    return { valid: false, reason: 'Source or target port not found' };
  }

  // Duplicate check
  const duplicate = state.connectors.some(
    c =>
      (c.sourcePortId === sourcePortId && c.targetPortId === targetPortId) ||
      (c.sourcePortId === targetPortId && c.targetPortId === sourcePortId)
  );

  if (duplicate) {
    return { valid: false, reason: 'A connector already exists between these ports' };
  }

  // Direction compatibility
  if (srcPort.direction === 'out' && tgtPort.direction === 'out') {
    return { valid: false, reason: 'Cannot connect output port to output port' };
  }

  if (srcPort.direction === 'in' && tgtPort.direction === 'in') {
    return { valid: false, reason: 'Cannot connect input port to input port' };
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: PASS (13 tests passing)

- [ ] **Step 5: Commit Task 3 changes**

```bash
git add src/services/sysmlIntegrityService.ts src/services/sysmlIntegrityService.test.ts
git commit -m "feat(sysml): add connector validation and port direction checks"
```

---

### Task 4: Traceability Governance & Requirement Canonicalization (BR-04, BR-07, BR-10)

**Files:**
- Modify: `src/services/sysmlIntegrityService.ts`
- Modify: `src/services/sysmlIntegrityService.test.ts`

**Interfaces:**
- Consumes: `SysMLDiagramState`, `ValidationResult`
- Produces:
  - `validateTraceabilityRelation(sourceId: string, targetId: string, relationType: string, state: SysMLDiagramState): ValidationResult`
  - `validateUniqueRequirementIds(requirements: SysMLRequirement[]): ValidationResult`

- [ ] **Step 1: Write failing tests for traceability relation & requirement ID governance**

Add to `src/services/sysmlIntegrityService.test.ts`:

```typescript
import {
  validateTraceabilityRelation,
  validateUniqueRequirementIds,
} from './sysmlIntegrityService';

describe('sysmlIntegrityService - Traceability & Requirement Governance', () => {
  const state: SysMLDiagramState = {
    blocks: [{ id: 'b1', name: 'Controller', ports: [], parts: [] }],
    parts: [{ id: 'pt1', name: 'Pump', typeBlockId: 'b1', parentBlockId: 'b1', parentPartId: null }],
    ports: [],
    connectors: [],
    requirements: [
      { id: 'req1', reqId: 'REQ-01', text: 'Safety Limit' },
      { id: 'req2', reqId: 'REQ-02', text: 'Derived Limit' },
    ],
    relations: [],
  };

  it('validates satisfy relation from block to requirement', () => {
    const res = validateTraceabilityRelation('b1', 'req1', 'satisfy', state);
    expect(res.valid).toBe(true);
  });

  it('rejects satisfy relation from requirement to block', () => {
    const res = validateTraceabilityRelation('req1', 'b1', 'satisfy', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Target must be a Requirement');
  });

  it('validates deriveReqt relation from requirement to requirement', () => {
    const res = validateTraceabilityRelation('req1', 'req2', 'deriveReqt', state);
    expect(res.valid).toBe(true);
  });

  it('rejects deriveReqt relation if source is a block', () => {
    const res = validateTraceabilityRelation('b1', 'req2', 'deriveReqt', state);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Source must be a Requirement');
  });

  it('validates uniqueness of requirement IDs', () => {
    const validRes = validateUniqueRequirementIds([
      { id: '1', reqId: 'REQ-01', text: 'A' },
      { id: '2', reqId: 'REQ-02', text: 'B' },
    ]);
    expect(validRes.valid).toBe(true);

    const dupRes = validateUniqueRequirementIds([
      { id: '1', reqId: 'REQ-01', text: 'A' },
      { id: '2', reqId: 'req-01', text: 'B' },
    ]);
    expect(dupRes.valid).toBe(false);
    expect(dupRes.reason).toContain('Duplicate requirement ID');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: FAIL (`validateTraceabilityRelation` / `validateUniqueRequirementIds` not implemented)

- [ ] **Step 3: Implement traceability relation & requirement ID validation**

Add implementation in `src/services/sysmlIntegrityService.ts`:

```typescript
export function validateTraceabilityRelation(
  sourceId: string,
  targetId: string,
  relationType: string,
  state: SysMLDiagramState
): ValidationResult {
  const isSourceReq = state.requirements.some(r => r.id === sourceId);
  const isTargetReq = state.requirements.some(r => r.id === targetId);

  const isSourceBlockOrPart =
    state.blocks.some(b => b.id === sourceId) || state.parts.some(p => p.id === sourceId);

  const normalizedType = relationType === 'derive' ? 'deriveReqt' : relationType;

  if (normalizedType === 'satisfy') {
    if (!isTargetReq) {
      return { valid: false, reason: 'Target must be a Requirement for satisfy relation' };
    }
    if (!isSourceBlockOrPart) {
      return { valid: false, reason: 'Source must be a Block or Part for satisfy relation' };
    }
  } else if (normalizedType === 'deriveReqt') {
    if (!isSourceReq) {
      return { valid: false, reason: 'Source must be a Requirement for deriveReqt relation' };
    }
    if (!isTargetReq) {
      return { valid: false, reason: 'Target must be a Requirement for deriveReqt relation' };
    }
  } else if (normalizedType === 'verify') {
    if (!isTargetReq) {
      return { valid: false, reason: 'Target must be a Requirement for verify relation' };
    }
  }

  return { valid: true };
}

export function validateUniqueRequirementIds(requirements: SysMLRequirement[]): ValidationResult {
  const seen = new Set<string>();
  for (const req of requirements) {
    const normalizedReqId = req.reqId.trim().toUpperCase();
    if (seen.has(normalizedReqId)) {
      return {
        valid: false,
        reason: `Duplicate requirement ID found: ${req.reqId}`,
      };
    }
    seen.add(normalizedReqId);
  }
  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts`
Expected: PASS (All tests passing)

- [ ] **Step 5: Run full test suite & TypeScript check**

Run: `npm test && npx tsc --noEmit`
Expected: Clean pass with 0 errors.

- [ ] **Step 6: Commit Task 4 changes**

```bash
git add src/services/sysmlIntegrityService.ts src/services/sysmlIntegrityService.test.ts
git commit -m "feat(sysml): add traceability governance and requirement ID validation"
```
