# SysML Human-Readable Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every user-facing SysML label uses the assigned SysML name or a friendly metaclass fallback and never exposes an internal ID.

**Architecture:** Add a repository-aware display-label module as the only place that converts SysML objects and references into UI text. Route inspector schemas, Model Explorer projections, diagram annotations, and supporting SysML panels through that module while retaining IDs in command values, selection keys, DOM data attributes, and persistence.

**Tech Stack:** TypeScript 5.4, React 18, Vitest 4, Testing Library, Playwright, canonical SysML v4 repository plus legacy projection adapters.

## Global Constraints

- A trimmed, non-empty SysML `name` is always the visible primary label.
- An unnamed object displays a friendly metaclass label such as `Block`, `Association`, `Connector`, or `Item Flow`.
- Missing references display a neutral type label and a non-identifying warning; raw IDs never become fallback UI text.
- IDs remain unchanged in repositories, commands, persistence, React keys, selection state, and non-visible DOM data attributes.
- Raw `ID`, `Source ID`, and `Target ID` fields are absent from user-facing SysML property schemas.
- Editable references show name-based choices but submit the selected internal ID.
- No new runtime dependency or persistence migration is introduced.

---

### Task 1: Central SysML Display-Label Contract

**Files:**
- Create: `src/features/sysml/sysmlDisplayLabel.ts`
- Create: `src/features/sysml/sysmlDisplayLabel.test.ts`
- Modify: `src/features/sysml/index.ts`

**Interfaces:**
- Consumes: SysML repository objects with `elements`, `relationships`, `diagrams`, and `itemFlows`, plus legacy repository maps when present.
- Produces: `friendlySysmlKind(kind: string | undefined, fallback?: string): string`, `sysmlObjectLabel(value: { name?: string; metaclass?: string; kind?: string } | null | undefined, fallbackKind?: string): string`, and `resolveSysmlReferenceLabel(repository: unknown, id: string | null | undefined, fallbackKind?: string): string`.

- [ ] **Step 1: Write failing resolver tests**

```ts
import { describe, expect, it } from 'vitest';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { friendlySysmlKind, resolveSysmlReferenceLabel, sysmlObjectLabel } from './sysmlDisplayLabel';

describe('SysML display labels', () => {
  it('prefers an assigned name and never substitutes the id', () => {
    expect(sysmlObjectLabel({ name: '  Flight Computer  ', metaclass: 'Block' })).toBe('Flight Computer');
    expect(sysmlObjectLabel({ name: '', metaclass: 'Block' })).toBe('Block');
    expect(sysmlObjectLabel({ id: '26bce7fc-f3ae-4030-95a3-917a620a36a4', name: 'Named Association', metaclass: 'Association' })).toBe('Named Association');
  });

  it('humanizes metaclass names', () => {
    expect(friendlySysmlKind('ItemFlow')).toBe('Item Flow');
    expect(friendlySysmlKind('sharedAggregation')).toBe('Shared Aggregation');
  });

  it('resolves named, unnamed, and missing references without leaking ids', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['blk-0fcf4de9'] = { id: 'blk-0fcf4de9', name: 'Controller', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repository.elements['358925d2-8fba-438e-b11a-523a63c85da5'] = { id: '358925d2-8fba-438e-b11a-523a63c85da5', name: '', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    expect(resolveSysmlReferenceLabel(repository, 'blk-0fcf4de9')).toBe('Controller');
    expect(resolveSysmlReferenceLabel(repository, '358925d2-8fba-438e-b11a-523a63c85da5')).toBe('Block');
    expect(resolveSysmlReferenceLabel(repository, 'missing-uuid', 'Element')).toBe('Element');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/features/sysml/sysmlDisplayLabel.test.ts`

Expected: FAIL because `./sysmlDisplayLabel` does not exist.

- [ ] **Step 3: Implement the minimal shared resolver**

```ts
export function friendlySysmlKind(kind: string | undefined, fallback = 'Element'): string {
  const source = kind?.trim() || fallback;
  return source
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim();
}

export function sysmlObjectLabel(
  value: { name?: string; metaclass?: string; kind?: string; id?: string } | null | undefined,
  fallbackKind = 'Element',
): string {
  const name = value?.name?.trim();
  if (name) return name;
  return friendlySysmlKind(value?.metaclass ?? value?.kind, fallbackKind);
}

export function resolveSysmlReferenceLabel(repository: any, id: string | null | undefined, fallbackKind = 'Element'): string {
  if (!id) return friendlySysmlKind(fallbackKind);
  const value = repository?.elements?.[id]
    ?? repository?.relationships?.[id]
    ?? repository?.diagrams?.[id]
    ?? repository?.itemFlows?.[id]
    ?? repository?.packages?.[id]
    ?? repository?.definitions?.[id]
    ?? repository?.usages?.[id]
    ?? repository?.requirements?.[id]
    ?? repository?.verificationCases?.[id]
    ?? repository?.artifacts?.[id]
    ?? repository?.connectors?.[id];
  return value ? sysmlObjectLabel(value, fallbackKind) : friendlySysmlKind(fallbackKind);
}
```

Export all three functions from `src/features/sysml/index.ts`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/features/sysml/sysmlDisplayLabel.test.ts`

Expected: 3 tests PASS with no warnings.

- [ ] **Step 5: Commit the resolver**

```bash
git add src/features/sysml/sysmlDisplayLabel.ts src/features/sysml/sysmlDisplayLabel.test.ts src/features/sysml/index.ts
git commit -m "feat(sysml): centralize human-readable display labels"
```

### Task 2: Name-Only SysML Properties Schemas

**Files:**
- Modify: `src/features/sysml/inspectorSchema.ts`
- Modify: `src/features/sysml/inspectorSchema.test.ts`
- Modify: `src/components/sysml/SysmlPropertyPanel.tsx`
- Test: `src/components/sysml/SysmlPropertyPanel.test.tsx`

**Interfaces:**
- Consumes: `sysmlObjectLabel` and `resolveSysmlReferenceLabel` from Task 1.
- Produces: inspector titles without IDs, no identity field, and `select` reference fields whose option labels are human-readable while option values remain IDs.

- [ ] **Step 1: Add failing schema tests for named and unnamed objects**

```ts
it('does not expose ids in element or relationship schemas', () => {
  const repository = supportedInspectorFixtures[0].selection.repository;
  repository.relationships['anonymous-association'] = {
    id: 'anonymous-association', name: '', metaclass: 'Association', sourceId: 'block-1', targetId: 'pkg-1',
  } as any;
  const block = getInspectorSchema({ repository, elementId: 'block-1' })!;
  const relationship = getInspectorSchema({ repository, relationshipId: 'anonymous-association' })!;
  expect(block.fields.map(field => field.label)).not.toContain('ID');
  expect(relationship.title).toBe('Association');
  expect(relationship.fields.map(field => field.label)).not.toEqual(expect.arrayContaining(['ID', 'Source ID', 'Target ID']));
  expect(relationship.fields.find(field => field.key === 'sourceId')).toMatchObject({ label: 'Source', valueType: 'select' });
  expect(relationship.fields.find(field => field.key === 'sourceId')?.options).toContainEqual({ label: 'Block1', value: 'block-1' });
});
```

Add a Testing Library case that renders `SysmlPropertyPanel`, asserts `queryByLabelText('ID')` is absent, selects a name-labelled endpoint, and expects an `UpdateRelationship` command containing the endpoint ID.

- [ ] **Step 2: Run the inspector and panel tests and verify RED**

Run: `npx vitest run src/features/sysml/inspectorSchema.test.ts src/components/sysml/SysmlPropertyPanel.test.tsx`

Expected: FAIL because identity fields are visible, titles fall back to IDs, and endpoint fields are free text.

- [ ] **Step 3: Replace identity fields and build reference options**

Add this local helper in `inspectorSchema.ts` and use it for owner, type, source, target, connector-end role, realizing connector, and conveyed-classifier fields:

```ts
function referenceOptions(repository: SysmlRepositoryV4) {
  return [
    ...Object.values(repository.elements),
    ...Object.values(repository.relationships),
    ...Object.values(repository.diagrams),
    ...Object.values(repository.itemFlows ?? {}),
  ].map(value => ({ label: sysmlObjectLabel(value), value: value.id }));
}
```

Remove each `fields.push` whose `key` is `id`. Change `Owner ID`, `Source ID`, and `Target ID` labels to `Owner`, `Source`, and `Target`. Use `valueType: 'select'`, retain the ID as `value`, attach `options: referenceOptions(repository)`, and leave existing `toCommand` payloads unchanged. Build titles with:

```ts
const label = sysmlObjectLabel(relationship, 'Relationship');
const kind = friendlySysmlKind(relationship.metaclass, 'Relationship');
title: label === kind ? kind : `${kind}: ${label}`;
```

Apply the same non-duplicating title rule to elements, item flows, and diagrams. Keep the editable `Name` field.

- [ ] **Step 4: Make reference selection accessible**

In `PropertyFieldRow`, retain `option.value` as the command value and `option.label` as visible text. Set `aria-label={field.label}` on `<select>` so tests and assistive technology identify `Source`, `Target`, `Owner`, and `Type` by role rather than by ID.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run src/features/sysml/inspectorSchema.test.ts src/components/sysml/SysmlPropertyPanel.test.tsx`

Expected: all tests PASS; rendered text contains assigned names or metaclasses and contains none of the fixture UUIDs.

- [ ] **Step 6: Commit inspector behavior**

```bash
git add src/features/sysml/inspectorSchema.ts src/features/sysml/inspectorSchema.test.ts src/components/sysml/SysmlPropertyPanel.tsx src/components/sysml/SysmlPropertyPanel.test.tsx
git commit -m "feat(sysml): hide ids in property inspector"
```

### Task 3: Human-Readable Model Explorer Projection

**Files:**
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.ts`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

**Interfaces:**
- Consumes: `sysmlObjectLabel` and `resolveSysmlReferenceLabel` from Task 1.
- Produces: repository-aware `projectOwnedFeature`, `projectRelationship`, `projectConnectorEnd`, and `projectItemFlow` nodes with no ID fallback in primary or secondary labels.

- [ ] **Step 1: Add failing projection tests**

```ts
it('projects names and friendly metaclasses without ids', () => {
  const input = fixture();
  input.sysml.relationships['26bce7fc-f3ae-4030-95a3-917a620a36a4'] = {
    id: '26bce7fc-f3ae-4030-95a3-917a620a36a4', kind: 'association', name: '', sourceId: 'block-a', targetId: 'block-b',
  } as any;
  const projection = buildUnifiedModelProjection(input);
  const node = projection.nodes['sysml:element:26bce7fc-f3ae-4030-95a3-917a620a36a4'];
  expect(node.label).toBe('Association');
  expect(node.secondaryLabel).toBe('Source Block -> Target Block');
  expect(`${node.label} ${node.secondaryLabel}`).not.toContain('26bce7fc-f3ae-4030-95a3-917a620a36a4');
});
```

Add equivalent cases for an unnamed block, connector end, item flow, unnamed port usage, and unresolved endpoint. For unresolved references assert `Element`, not the missing ID.

- [ ] **Step 2: Run projection tests and verify RED**

Run: `npx vitest run src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

Expected: FAIL on relationship labels, endpoint summaries, connector-end labels, port ID suffixes, and item-flow labels.

- [ ] **Step 3: Route canonical projection helpers through the resolver**

Change helper signatures to accept the repository where a reference must be resolved:

```ts
export function projectRelationship(relationship: SemanticRelationship, repository: SysmlRepository): ModelTreeNode {
  return {
    // identity fields remain unchanged
    label: sysmlObjectLabel(relationship, 'Relationship'),
    secondaryLabel: `${resolveSysmlReferenceLabel(repository, relationship.sourceId)} -> ${resolveSysmlReferenceLabel(repository, relationship.targetId)}`,
  } as ModelTreeNode;
}
```

Apply the same rule to features, behaviors, connector ends, item flows, canonical elements, and diagrams. Remove `(${item.id})`, `ID ${item.id}`, raw `typeId`, raw `roleId`, and `name || id` display fallbacks. Resolve types through the repository and use `Type` when unavailable.

- [ ] **Step 4: Align the legacy SysML explorer adapter**

In `sysmlExplorerAdapter.ts`, replace UUID-based port numbering and visible ID suffixes with `sysmlObjectLabel(port, 'Port')`; resolve type names with `resolveSysmlReferenceLabel(repo, port.typeId, 'Type')`. Use the same helpers for packages, definitions, usages, requirements, verification cases, relationships, and diagrams.

- [ ] **Step 5: Run projection tests and verify GREEN**

Run: `npx vitest run src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

Expected: all tests PASS and no assertion snapshot contains an internal SysML ID as visible text.

- [ ] **Step 6: Commit explorer behavior**

```bash
git add src/features/modelExplorer/unifiedModelExplorerProjection.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts
git commit -m "feat(sysml): show semantic names in model explorer"
```

### Task 4: Remove ID Fallbacks from SysML Diagrams and Supporting Panels

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/sysml/SysmlConnectionErrorDetails.tsx`
- Modify: `src/components/sysml/RequirementGovernancePanel.tsx`
- Modify: `src/components/sysml/TraceabilityMatrix.tsx`
- Modify: corresponding colocated `*.test.tsx` files

**Interfaces:**
- Consumes: Task 1 display-label helpers.
- Produces: diagram labels, SVG titles, error details, governance links, and traceability cells that show names/metaclasses while keeping click handlers and data attributes ID-based.

- [ ] **Step 1: Add failing UI regression tests**

Extend the existing component tests with named and unnamed UUID-shaped fixtures. Assert that `screen.getByText('Controller')`, `screen.getByText('Association')`, and `screen.getByText('Controller -> Block')` are present, while `screen.queryByText(uuid)` and `container.textContent?.includes(uuid)` are false. For connection errors, expect `Block (structural)` rather than `<uuid> (structural)`.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npx vitest run src/components/sysml/SysmlConnectionErrorDetails.test.tsx src/components/sysml/RequirementGovernancePanel.test.tsx src/components/sysml/TraceabilityMatrix.test.tsx`

Expected: FAIL because the current components use endpoint IDs as visible fallbacks.

- [ ] **Step 3: Replace component-local fallbacks**

Replace visible expressions such as:

```ts
endpoint.name || endpoint.id
link.sourceId
link.targetId
repository.connectors[id]?.id ?? id
```

with `sysmlObjectLabel(endpoint, endpoint.family)` or `resolveSysmlReferenceLabel(repository, id, expectedKind)`. Do not change `onClick(id)`, `key={id}`, relationship filtering, or `data-*` identity attributes.

- [ ] **Step 4: Replace legacy diagram text fallbacks in `App.tsx`**

For BDD/IBD relationship SVG titles and visible labels near the existing relationship rendering block, derive `sourceLabel`, `targetLabel`, and `relationshipLabel` from the active SysML repository/projection:

```ts
const sourceLabel = sysmlObjectLabel(source, 'Element');
const targetLabel = sysmlObjectLabel(target, 'Element');
const relationshipLabel = sysmlObjectLabel({ name: rel.label, kind: rel.type, id: rel.id }, 'Relationship');
```

Render `${relationshipLabel}: ${sourceLabel} -> ${targetLabel}`. Replace requirement, property, port aria-label, connection notification, and tooltip fallbacks that currently end in `.id`, `sourceId`, or `targetId` with the same resolver contract. Keep identity lookup and mutation payloads unchanged.

- [ ] **Step 5: Run component and focused SysML tests and verify GREEN**

Run: `npx vitest run src/components/sysml src/features/sysml src/features/modelExplorer --no-file-parallelism`

Expected: all tests PASS with no React warnings.

- [ ] **Step 6: Run a visible-text source audit**

Run: `rg -n "name \\|\\| .*\\.id|name \\?\\? .*\\.id|Source ID|Target ID|ID \\${|\\{[^}]*sourceId[^}]*\\}|\\{[^}]*targetId[^}]*\\}" src/components/sysml src/features/sysml src/features/modelExplorer src/App.tsx`

Expected: no user-facing render expression uses an internal ID fallback. Matches in keys, lookups, command payloads, data attributes, diagnostics, and tests are reviewed and retained only when non-visible.

- [ ] **Step 7: Commit diagram and panel behavior**

```bash
git add src/App.tsx src/components/sysml src/features/sysml src/features/modelExplorer
git commit -m "fix(sysml): remove visible internal id fallbacks"
```

### Task 5: End-to-End Rename, Fallback, and Persistence Certification

**Files:**
- Create: `tests/e2e/sysml-human-readable-labels.spec.ts`

**Interfaces:**
- Consumes: completed UI behavior from Tasks 1-4 and existing BDD creation/property workflows.
- Produces: a browser-level release regression for names, unnamed fallbacks, endpoint labels, rename propagation, and save/reload identity stability.

- [ ] **Step 1: Write the failing Playwright scenario**

```ts
import { expect, test } from '@playwright/test';

test('SysML uses names and metaclass fallbacks without visible ids', async ({ page }) => {
  await page.goto('/');
  const bdd = page.getByRole('treeitem', { name: /Main SysML BDD/ }).first();
  await bdd.click();

  const canvas = page.locator('[data-diagram-kind="bdd"]').first();
  await expect(canvas).toBeVisible();
  await canvas.getByText('Block', { exact: true }).first().click();
  await expect(page.getByLabel('SysML Property Inspector')).not.toContainText(/\bID\b|[0-9a-f]{8}-[0-9a-f-]{27,}/i);

  const name = page.getByLabel('Element Name');
  await name.fill('Flight Computer');
  await name.press('Enter');
  await expect(canvas.getByText('Flight Computer', { exact: true })).toBeVisible();
  await expect(page.getByLabel('SysML Property Inspector')).toContainText('Flight Computer');

  const association = page.getByText('Association', { exact: true }).first();
  await association.click();
  const inspector = page.getByLabel('SysML Property Inspector');
  await expect(inspector).toContainText('Source');
  await expect(inspector).toContainText('Target');
  await expect(inspector).not.toContainText(/Source ID|Target ID|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});
```

Use the fixture's existing block and relationship creation helpers if the default project does not contain both objects; do not hard-code a semantic ID into a text locator.

- [ ] **Step 2: Run the scenario and verify RED if any surface still leaks IDs**

Run: `npx playwright test tests/e2e/sysml-human-readable-labels.spec.ts --project=chromium`

Expected before all UI wiring is complete: FAIL at the first remaining visible ID. After Tasks 1-4, it must PASS.

- [ ] **Step 3: Extend the scenario through reload**

Use the existing project save/reload helper from neighboring SysML E2E specs, then assert `Flight Computer` is still visible and the inspector still contains no UUID-like text. The test must verify that selection and connections survive reload, demonstrating that internal IDs were preserved.

- [ ] **Step 4: Run the complete verification set**

Run: `npx vitest run src/features/sysml src/features/modelExplorer src/components/sysml --no-file-parallelism`

Expected: PASS.

Run: `npx playwright test tests/e2e/sysml-human-readable-labels.spec.ts --project=chromium`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0 with no TypeScript diagnostics.

Run: `npm run test:sysml:architecture`

Expected: PASS; no new parallel model or direct UI mutation is reported.

- [ ] **Step 5: Commit certification**

```bash
git add tests/e2e/sysml-human-readable-labels.spec.ts
git commit -m "test(sysml): certify human-readable labels"
```

### Task 6: Final Release Review

**Files:**
- Review only: all files changed in Tasks 1-5

**Interfaces:**
- Consumes: the complete feature branch.
- Produces: evidence that the naming contract is consistent and the repository identity contract is unchanged.

- [ ] **Step 1: Inspect the final diff**

Run: `git diff HEAD~5 -- src/features/sysml src/features/modelExplorer src/components/sysml src/App.tsx tests/e2e/sysml-human-readable-labels.spec.ts`

Expected: UI text changes only; IDs remain in identity, lookup, command, data attribute, and persistence paths.

- [ ] **Step 2: Run the SysML release suite**

Run: `npm run test:sysml:release`

Expected: PASS with no failures or TypeScript diagnostics.

- [ ] **Step 3: Record final status**

Run: `git status --short`

Expected: no task-related uncommitted files. Pre-existing unrelated user changes, if any, remain untouched.
