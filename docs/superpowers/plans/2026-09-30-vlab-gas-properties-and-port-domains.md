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

```ts
import { describe, expect, it } from 'vitest';
import { PHYSICAL_DOMAINS } from './types';
import { isValidVLabPortDomain } from './vlabPortDomains';

describe('V-Lab port domains', () => {
  it('uses the canonical engine list for physical domains regardless of case', () => {
    expect(PHYSICAL_DOMAINS).toContain('gas');
    expect(PHYSICAL_DOMAINS).toContain('magnetic');
    expect(isValidVLabPortDomain('Gas')).toBe(true);
    expect(isValidVLabPortDomain('Magnetic')).toBe(true);
  });

  it('accepts explicit metadata domains and rejects unknown domains', () => {
    expect(isValidVLabPortDomain('Any')).toBe(true);
    expect(isValidVLabPortDomain('BeltProperty')).toBe(true);
    expect(isValidVLabPortDomain('UnknownDomain')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify the intended RED state**

Run: `npx vitest run src/engine/vlab/vlabPortDomains.test.ts --reporter=verbose`

Expected: FAIL because `PHYSICAL_DOMAINS` and `./vlabPortDomains` do not exist yet.

- [ ] **Step 3: Add the runtime tuple and derive the engine type from it**

Replace the handwritten union at the top of `src/engine/vlab/types.ts` with:

```ts
export const PHYSICAL_DOMAINS = [
  'electrical',
  'rotational',
  'translational',
  'thermal',
  'magnetic',
  'gas',
  'fluid',
  'isothermal_liquid',
  'physical',
  'multibody',
] as const;

export type PhysicalDomain = (typeof PHYSICAL_DOMAINS)[number];
```

- [ ] **Step 4: Implement the V-Lab validator**

Create `src/engine/vlab/vlabPortDomains.ts`:

```ts
import { PHYSICAL_DOMAINS } from './types';

const CANONICAL_DOMAINS = new Set<string>(PHYSICAL_DOMAINS);
const SUPPLEMENTAL_PORT_DOMAINS = new Set(['any', 'beltproperty']);

export const isValidVLabPortDomain = (domain: string): boolean => {
  const normalized = domain.trim().toLowerCase();
  return CANONICAL_DOMAINS.has(normalized) || SUPPLEMENTAL_PORT_DOMAINS.has(normalized);
};
```

- [ ] **Step 5: Run focused tests and type checking**

Run: `npx vitest run src/engine/vlab/vlabPortDomains.test.ts --reporter=verbose`

Expected: PASS, 2 tests.

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the domain source and validator**

```bash
git add src/engine/vlab/types.ts src/engine/vlab/vlabPortDomains.ts src/engine/vlab/vlabPortDomains.test.ts
git commit -m "fix(vlab): centralize port domain validation"
```

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

```ts
import { describe, expect, it } from 'vitest';
import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';
import { normalizeLegacyVLabGraph } from './vlabModelMigration';

const node = (id: string, type: string): VLabNode => ({
  id,
  position: { x: 0, y: 0 },
  data: { type },
});

describe('normalizeLegacyVLabGraph', () => {
  it('removes gas_properties nodes and their incident edges', () => {
    const nodes = [node('legacy', 'gas_properties'), node('source', 'gas_pressure_source')];
    const edges: VLabEdge[] = [
      { id: 'bad', source: 'source', target: 'legacy' },
    ];

    expect(normalizeLegacyVLabGraph(nodes, edges)).toEqual({
      nodes: [nodes[1]],
      edges: [],
    });
  });

  it('preserves unrelated data without mutating the input arrays', () => {
    const nodes = [node('source', 'gas_pressure_source'), node('sink', 'gas_reservoir')];
    const edges: VLabEdge[] = [{ id: 'valid', source: 'source', target: 'sink' }];
    const originalNodes = [...nodes];
    const originalEdges = [...edges];

    const result = normalizeLegacyVLabGraph(nodes, edges);

    expect(result).toEqual({ nodes, edges });
    expect(nodes).toEqual(originalNodes);
    expect(edges).toEqual(originalEdges);
  });
});
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `npx vitest run src/components/vlab/vlabModelMigration.test.ts --reporter=verbose`

Expected: FAIL because `./vlabModelMigration` does not exist.

- [ ] **Step 3: Implement the pure normalizer**

Create `src/components/vlab/vlabModelMigration.ts`:

```ts
import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';

const LEGACY_REMOVED_BLOCKS = new Set(['gas_properties']);

const effectiveBlockType = (node: VLabNode): string =>
  String(node.data?.type ?? node.type ?? '').toLowerCase();

export const normalizeLegacyVLabGraph = (
  nodes: VLabNode[],
  edges: VLabEdge[],
): { nodes: VLabNode[]; edges: VLabEdge[] } => {
  const removedNodeIds = new Set(
    nodes.filter((node) => LEGACY_REMOVED_BLOCKS.has(effectiveBlockType(node))).map((node) => node.id),
  );

  return {
    nodes: nodes.filter((node) => !removedNodeIds.has(node.id)),
    edges: edges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)),
  };
};
```

- [ ] **Step 4: Run migration tests and verify GREEN**

Run: `npx vitest run src/components/vlab/vlabModelMigration.test.ts --reporter=verbose`

Expected: PASS, 2 tests.

- [ ] **Step 5: Apply normalization at all V-Lab workspace ingress points**

Import `normalizeLegacyVLabGraph` in `VLabWorkspace.tsx`. Before `useNodesState`/`useEdgesState`, compute the initial normalized graph once:

```ts
const initialGraphRef = useRef(normalizeLegacyVLabGraph(initialNodes, initialEdges));
const [nodes, setNodes, onLocalNodesChange] = useNodesState<AppVLabNode>(initialGraphRef.current.nodes);
const [edges, setEdges, onLocalEdgesChange] = useEdgesState<AppVLabEdge>(initialGraphRef.current.edges);
```

Replace the two separate inward synchronization effects with one paired effect so a removed node can never be applied without its corresponding edge cleanup:

```ts
useEffect(() => {
  const nodesChanged = initialNodes !== initialNodesRef.current;
  const edgesChanged = initialEdges !== initialEdgesRef.current;
  if (!nodesChanged && !edgesChanged) return;
  initialNodesRef.current = initialNodes;
  initialEdgesRef.current = initialEdges;
  if (isSavingRef.current) return;

  const normalized = normalizeLegacyVLabGraph(initialNodes, initialEdges);
  setNodes(normalized.nodes);
  setEdges(normalized.edges);
  setViewPath(['root']);
}, [initialNodes, initialEdges, setNodes, setEdges]);
```

In `handle3dxPull`, replace direct `setNodes(data.nodes)` and `setEdges(data.edges)` with:

```ts
const normalized = normalizeLegacyVLabGraph(data.nodes, data.edges);
setNodes(normalized.nodes);
setEdges(normalized.edges);
```

The paired identity/ref guards prevent a render loop and ensure both refs are updated before applying the normalized graph.

- [ ] **Step 6: Run focused workspace and migration tests**

Run: `npx vitest run src/components/vlab/vlabModelMigration.test.ts src/components/vlab/VLabWorkspace.test.tsx --reporter=verbose`

Expected: PASS.

- [ ] **Step 7: Commit the legacy migration**

```bash
git add src/components/vlab/vlabModelMigration.ts src/components/vlab/vlabModelMigration.test.ts src/components/vlab/VLabWorkspace.tsx
git commit -m "fix(vlab): migrate removed gas properties nodes"
```

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

In `src/utils/vlabLibrary.test.ts`, import `blockEquations` and `VLAB_COMPONENT_DEFINITIONS`, then add:

```ts
it('has no registered remnants of the removed gas_properties block', () => {
  expect(blockEquations).not.toHaveProperty('gas_properties');
  expect(VLAB_COMPONENT_DEFINITIONS).not.toHaveProperty('gas_properties');
});
```

- [ ] **Step 2: Run the regression and verify RED**

Run: `npx vitest run src/utils/vlabLibrary.test.ts --reporter=verbose`

Expected: FAIL because both registries still have `gas_properties`.

- [ ] **Step 3: Remove production remnants**

Delete exactly these entries:

```ts
// src/engine/vlab/vlabEquations.ts
gas_properties: () => [],
```

```ts
// src/engine/vlab/vlabComponentDefinitions.ts
gas_properties: {
  equations: ['P = rho * R * T'],
  latex: ['P = \\rho R T'],
  across: 'None', through: 'None',
  description: 'Defines the working fluid properties (R, Cp, etc.) for the connected gas network.'
},
```

```tsx
// src/components/vlab/VLabSymbols.tsx
case 'gas_properties':
  return <SymGlyph w={60} h={60} color={color} text="GAS" sub="PROPS" />;
```

- [ ] **Step 4: Replace the handwritten certification domain allowlist**

Import the validator in `vlab_full_certification.test.ts`:

```ts
import { isValidVLabPortDomain } from './vlabPortDomains';
```

Delete `VALID_PORT_DOMAINS`, and replace:

```ts
if (port.domain !== undefined && !VALID_PORT_DOMAINS.has(port.domain)) {
```

with:

```ts
if (port.domain !== undefined && !isValidVLabPortDomain(port.domain)) {
```

Remove `gas_properties` from `ZERO_PORT_BLOCKS` and `ZERO_RESIDUAL_FACTORIES`.

- [ ] **Step 5: Run the focused removal test and full certification**

Run: `npx vitest run src/utils/vlabLibrary.test.ts --reporter=verbose`

Expected: PASS.

Run: `npm run test:vlab:full`

Expected: PASS with no orphan `gas_properties` factory and no unknown `Gas` or `Magnetic` port-domain issues.

- [ ] **Step 6: Verify no source remnants remain outside migration and tests**

Run: `rg -n "gas_properties" src`

Expected: matches only the deliberate migration constant and regression fixtures/assertions; no equation, definition, symbol, or certification-exception match.

- [ ] **Step 7: Commit registry cleanup and certification fix**

```bash
git add src/utils/vlabLibrary.test.ts src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/components/vlab/VLabSymbols.tsx src/engine/vlab/vlab_full_certification.test.ts
git commit -m "fix(vlab): remove gas properties remnants"
```

---

### Task 4: Integrated Verification

**Files:**
- Verify only; modify a prior task's files only if a regression directly attributable to this change is found.

**Interfaces:**
- Consumes all deliverables from Tasks 1-3.
- Produces a verified clean V-Lab change set.

- [ ] **Step 1: Run all focused tests together**

Run:

```bash
npx vitest run src/engine/vlab/vlabPortDomains.test.ts src/components/vlab/vlabModelMigration.test.ts src/components/vlab/VLabWorkspace.test.tsx src/utils/vlabLibrary.test.ts src/engine/vlab/vlab_full_certification.test.ts --reporter=verbose
```

Expected: PASS with no warnings or errors caused by the change.

- [ ] **Step 2: Run the standard V-Lab suite**

Run: `npm run test:vlab`

Expected: PASS.

- [ ] **Step 3: Run TypeScript validation**

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Inspect the final diff and whitespace**

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only task-related files are changed; preserve unrelated user changes if any appeared during execution.

- [ ] **Step 5: Commit any verification-only correction**

If verification required a task-related correction, stage only the corrected files from this plan and commit. For example, if the correction touched the domain validator and its test:

```bash
git add src/engine/vlab/vlabPortDomains.ts src/engine/vlab/vlabPortDomains.test.ts
git commit -m "test(vlab): complete gas domain cleanup verification"
```

If no correction was needed, do not create an empty commit.
