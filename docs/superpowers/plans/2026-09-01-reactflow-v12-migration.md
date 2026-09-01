# React Flow v11 → v12 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all React-Flow-based diagram modules (OPM Entropy, V-Lab, X-Bridges) and their shared engine/test code from `reactflow@11.11.4` to `@xyflow/react@12.11.6`, preserving all current behavior and passing every existing test, with no new modeling/UI/simulation features.

**Architecture:** A single phased migration. **Phase 0** swaps the core package and mechanically rewrites every import (package name, named export, stylesheet path) across all ~41 files so the project compiles again. **Phase 1** repairs the OPM Entropy module's semantic breakages (types, `parentNode→parentId`, `node.width/height→node.measured`, NodeProps), keeping the bimodal OPD↔OPL + simulation behavior identical. **Phase 2** does the same for V-Lab. **Phase 3** does the same for X-Bridges. Each phase ends with `tsc` and the relevant Vitest suites green.

**Tech Stack:** React 18.3, TypeScript 5.9.3, Vite 7, Vitest 4, `@xyflow/react@12.11.6` (replaces `reactflow@11.11.4`).

## Global Constraints

- Upgrade `reactflow@^11.11.4` → `@xyflow/react@^12.11.6`. No other dependency versions change.
- Do NOT add new features. Behavior must be identical before/after for identical input.
- `ReactFlow` becomes a **named** export: `import { ReactFlow } from '@xyflow/react'` (was `import ReactFlow from 'reactflow'`).
- Stylesheet import path changes from `'reactflow/dist/style.css'` to `'@xyflow/react/dist/style.css'`.
- `Node`/`Edge` types move to `@xyflow/react`. v12 type generics: `Node<Data, NodeType>` (second param is the node `type` string), not `Node<Data>`.
- Use `useNodesState<AppNode>` / `useEdgesState<AppEdge>`, where `AppNode = Node<Data, Type>`-style unions.
- `node.parentNode` is renamed to `node.parentId` everywhere (this is the `id` of the parent, same value as before).
- Read measured node dimensions from `node.measured.width/height` instead of `node.width/height`.
- `NodeProps<T>` / `EdgeProps<T>` now take the full node/edge type (`NodeProps<AppNode>`), not bare data.
- Use `positionAbsoluteX` / `positionAbsoluteY` props instead of `xPos` / `yPos` if any custom node reads them (none currently do — verified).
- `useStore(s => ...)` still works; read edges/nodes from the same selectors as before (`nodeLookup` only replaces legacy `nodeInternals`, which the code does not use).
- Node/edge updates must be immutable (spread, never mutate in place). Existing code already does this via `setNodes(prev => prev.map(...))` — preserve it.
- `useUpdateNodeInternals` is still exported from `@xyflow/react` and unchanged in call signature.
- `NodeResizer` is still exported from `@xyflow/react`; `isVisible` prop and styling props are unchanged.
- Commands (run from repo root `G:\adia project`):
  - Type check: `npx tsc --noEmit`
  - Entropy tests: `npx vitest run src/components/entropy/__tests__/entropy.test.ts`
  - V-Lab tests: `npx vitest run src/components/vlab`
  - V-Lab physics: `npm run test:vlab`
  - Build: `npm run build` (full, including Electron) — optional final gate.

---

## Task 1: Swap the core package and rewrite every import (Phase 0)

This task makes the whole project compile again after the package swap. It is purely mechanical. Run the type check first to get the authoritative list of files, resolve them all, then run `tsc` again.

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/App.tsx` (ReactFlow import if present)
- Modify: all files currently importing `reactflow` (outside `node_modules`) — identified by `npx tsc` / grep. Known set (~41, listed in Steps below by group).
- Test: `src/components/entropy/__tests__/entropy.test.ts` (must still compile and pass)

**Interfaces:**
- Consumes: the v11 `reactflow` package (to be removed) and its 41 importing files.
- Produces: project where every file imports from `@xyflow/react`, stylesheet path updated, and `tsc --noEmit` is clean of "cannot find module 'reactflow'" errors.

- [ ] **Step 1: Uninstall the old package and install the new one**

```bash
npm uninstall reactflow
npm install @xyflow/react@^12.11.6
```

Run: `cd "G:\adia project"` then the two commands above.
Expected: `npm uninstall` removes `reactflow` from `package.json` and `node_modules`; `npm install` adds `"@xyflow/react": "^12.11.6"` to `dependencies` and links `node_modules/@xyflow/react`.

- [ ] **Step 2: Capture the authoritative list of files that reference reactflow**

```bash
cd "G:\adia project"
npx tsc --noEmit
```

Expected: `Cannot find module 'reactflow' ...` errors listing every file. Record the full list. Then fix each occurrence in Steps 3–6 until `tsc` is clean. The known importing files (verified independently) are grouped below; your `tsc` output should be a superset.

- [ ] **Step 3: Rewrite imports in OPM Entropy module files**

For each of these files, replace the reactflow import line(s):

- `src/components/entropy/EntropyWorkspace.tsx`
- `src/components/entropy/OPMNodeComponents.tsx`
- `src/components/entropy/OPMEdgeComponents.tsx`
- `src/components/entropy/EntropyTypes.ts` (only imports `Node, Edge`)
- `src/components/entropy/OplParser.ts` (only imports `Node, Edge`)
- `src/components/entropy/__tests__/entropy.test.ts` (only imports `Node, Edge`)

Type of change, per file:

Compound imports (`import ReactFlow, { a, b } from 'reactflow'`) become:

```ts
import { ReactFlow, a, b } from '@xyflow/react';
```

Stylesheet import becomes:

```ts
import '@xyflow/react/dist/style.css';
```

Type-only imports (`import { Node, Edge } from 'reactflow'`) become:

```ts
import { Node, Edge } from '@xyflow/react';
```

Note: after this mechanical step, `EntropyWorkspace.tsx` / `OPMNodeComponents.tsx` / `OPMEdgeComponents.tsx` will have **type errors** because of the semantic v12 changes (`Node<OPMNodeData>` generic, `parentNode→parentId`, `node.measured`). That is expected and handled in Task 2. Do **not** attempt to fully fix them here — only change the import lines so the *module-resolution* error disappears. If you need the file to type-check at the end of this task, you may add `@ts-expect-error`-style suppression only in these three Entropy files **temporarily**, and remove them in Task 2.

- [ ] **Step 4: Rewrite imports in V-Lab module files**

Apply the same compound/style/type-only import rewrites to:

- `src/components/vlab/VLabWorkspace.tsx` (compound + style)
- `src/components/vlab/VLabNode.tsx` (compound: `Handle, Position, useUpdateNodeInternals, useStore`)
- `src/components/vlab/VLabWorkspaceTypes.ts` (type-only `Node, Edge`)
- `src/components/vlab/VLabNode.test.tsx` (type-only `ReactFlowProvider`)
- `src/components/vlab/vlabNodeRenaming.test.tsx` (type-only `ReactFlowProvider`)

Rules are identical to Step 3. Semantic fixes for V-Lab land in Task 5; here only change imports. Temporarily suppress any V-Lab type errors this introduces (same approach as Step 3) so `tsc` can progress, and remove the suppressions in Task 5.

- [ ] **Step 5: Rewrite imports in X-Bridges module files**

Apply the same rewrites to:

- `src/components/xbridges/XbridgesWorkspace.tsx` (compound + style)
- `src/components/xbridges/XBlockNode.tsx` (compound: `Handle, Position, useUpdateNodeInternals, NodeResizer`)
- `src/components/xbridges/PremiumEdge.tsx` (type-only + functions: `getBezierPath, getSmoothStepPath, getStraightPath, EdgeProps, useReactFlow`)
- `src/components/xbridges/PremiumConnectionLine.tsx` (functions: `getBezierPath, getSmoothStepPath, getStraightPath, useReactFlow`)

Rules identical to Step 3/4. Semantic fixes for X-Bridges land in Task 8; here only change imports and temporarily suppress introduced type errors.

- [ ] **Step 6: Rewrite imports in engine/test/leaves that import `Node`/`Edge` as bare types**

These files import only `Node, Edge` (or `Node`) from `reactflow` and use them as **data types** (fields `id`, `position`, `data`, `source`, `target`, `sourceHandle`, `targetHandle`, `parentId`). They need only the import-line swap to `@xyflow/react` — no semantic changes, because v12 `Node`/`Edge` keep these same fields. Update the import line in each, and leave the rest of the file untouched. If a file uses `Node<SomeData>` (bare data generic), change it to `Node<SomeData, string>` so it type-checks.

Files:
- `src/engine/vlab/DAEAssembler.ts`
- `src/engine/vlab/vlabPhysics.ts`
- `src/engine/vlab/kernel/PhysicalSystemCompiler.ts`
- `src/engine/vlab/kernel/PhysicalNetworkExtractor.ts`
- `src/engine/vlab/vlabValidationHarness.ts`
- `src/engine/vlab/vlab.test.ts`
- `src/engine/vlab/vlab_validation.test.ts`
- `src/engine/vlab/vlab_math_precision.test.ts`
- `src/engine/vlab/vlab_connected_models.test.ts`
- `src/engine/vlab/vlab_comprehensive.test.ts`
- `src/engine/vlab/vlab_connected_benchmarks.test.ts`
- `src/engine/vlab/test_all_blocks_scope.test.ts`
- `src/engine/vlab/test_airfryer_sim.test.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/types.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/ElectricalFixtures.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/ElectromechanicalFixtures.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/MechanicalFixtures.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/SignalFixtures.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/FluidFixtures.ts`
- `src/engine/vlab/whitebox_benchmarks/boundary_generator/ThermalFixtures.ts`
- `debug_airfryer.ts` (repo root)
- `scripts/run_vlab_math_test.ts`

- [ ] **Step 7: Run the type check to confirm module resolution is fixed**

```bash
cd "G:\adia project"
npx tsc --noEmit
```

Expected: **No** `Cannot find module 'reactflow'` errors remain. Remaining errors (if any) must be ONLY the intentional v12 semantic errors in Entropy/V-Lab/X-Bridges component files that you temporarily suppressed in Steps 3–5. If any *other* module-resolution error remains, fix it (repeat Step 6 for any file `tsc` reported that is not in the list).

- [ ] **Step 8: Run the Entropy test to confirm it loads under the new package**

```bash
cd "G:\adia project"
npx vitest run src/components/entropy/__tests__/entropy.test.ts
```

Expected: This test imports `Node, Edge` from `@xyflow/react` (updated in Step 3) and exercises `generateOpl`/`parseOpl`. It should **fail at runtime** only if `parseOpl` references `node.parentNode`/`node.parentId` — see Task 2. If it fails on a *type/import* error instead, the import rewrite is incomplete; fix it. The goal of this step is to confirm the package swap itself doesn't break the test loader; assertion-level failures are resolved in Task 2.

- [ ] **Step 9: Commit**

```bash
cd "G:\adia project"
git add -A
git commit -m "chore: migrate reactflow v11 to @xyflow/react v12 (package + imports)"
```

---

## Task 2: Repair OPM Entropy types and bimodal sync (Phase 1)

**Files:**
- Modify: `src/components/entropy/EntropyTypes.ts`
- Modify: `src/components/entropy/OplParser.ts`
- Modify: `src/components/entropy/__tests__/entropy.test.ts`
- Test: `src/components/entropy/__tests__/entropy.test.ts`

**Interfaces:**
- Consumes: `@xyflow/react` `Node`/`Edge` types from Task 1.
- Produces: a v12-typed `AppNode`/`AppEdge` type exported from `EntropyTypes.ts`, a `parseOpl` that uses `parentId`, and a passing entropy test suite. Task 3 (workspace UI) and Task 4 (node/edge components) consume the new `AppNode`/`AppEdge` types.

- [ ] **Step 1: Update EntropyTypes.ts to v12 node typing**

Replace the file's type definitions so `OPMNodeData`/`OPMEdgeData` remain the *data* payloads, and add module-level node/edge type aliases used across Entropy. Current head of file:

```ts
import { Node, Edge } from 'reactflow';
```

Change to:

```ts
import { Node, Edge } from '@xyflow/react';
```

Keep `OPMNodeData`, `OPMEdgeData`, `OPMNodeType`, `OPMLinkType`, `OPMState`, `OPMPort`, `SimulationLog` exactly as they are. Replace the trailing `OPMProjectData` interface and add type aliases:

```ts
export interface OPMProjectData {
  nodes: AppNode[];
  edges: AppEdge[];
}

export type AppNode = Node<
  OPMNodeData,
  'opmObject' | 'opmProcess' | 'opmState'
>;

export type AppEdge = Edge<OPMEdgeData, OPMLinkType | 'opmEdge'>;
```

Note the second generic of `AppNode` is the **React Flow node `type` string**, which maps directly to the custom node-component keys used in `EntropyWorkspace.tsx` (`nodeTypes = { opmObject, opmProcess, opmState }`). It is intentionally NOT `OPMNodeType` (which is the semantic `'object' | 'process' | 'state'` used in `data.type`). These type aliases are the single source of truth for Entropy node/edge typing.

- [ ] **Step 2: Update OplParser.ts to use parentId and AppNode/AppEdge**

In `src/components/entropy/OplParser.ts` the current imports are:

```ts
import { Node, Edge } from 'reactflow';
import { OPMNodeData, OPMEdgeData, OPMNodeType, OPMLinkType, OPMState, OPMPort } from './EntropyTypes';
import { v4 as uuidv4 } from 'uuid';
```

The second and third lines stay intact (they still provide `OPMNodeType`, `OPMState`, `OPMPort`, `uuid`). Only the first line (`Node, Edge` from `reactflow`) is removed, and add `type AppNode, type AppEdge` to the EntropyTypes import:

```ts
import { OPMNodeData, OPMEdgeData, OPMNodeType, OPMLinkType, OPMState, OPMPort, type AppNode, type AppEdge } from './EntropyTypes';
import { v4 as uuidv4 } from 'uuid';
```

If `OPMNodeData` / `OPMEdgeData` / `OPMLinkType` end up unused after the signature changes below, you may drop them — but keep `OPMNodeType`, `OPMState`, `OPMPort`, `AppNode`, `AppEdge`, and `uuidv4`.

Then change the function signatures from `Node<OPMNodeData>[]` → `AppNode[]` and `Edge<OPMEdgeData>[]` → `AppEdge[]` throughout:

- `generateOpl(nodes: AppNode[], edges: AppEdge[]): string`
- `parseOpl(text: string, existingNodes: AppNode[] = []): { nodes: AppNode[]; edges: AppEdge[]; errors: OplSyntaxError[] }`
- `getOrCreateNode = (name: string, type: OPMNodeType, parentNodeId?: string | null): AppNode`

Every read/write of `node.parentNode` becomes `node.parentId`. Concretely:

- Line~28 in `childStates` filter: `s.parentNode === obj.id` → `s.parentId === obj.id`
- Line~55 in `findNodeName`: `(node.parentNode || node.data.parentId)` → `(node.parentId || node.data.parentId)` — then simplify: since `parentId` IS `node.parentId` now, keep `node.parentId` only if it can be null. Given `getOrCreateNode` sets both `parentId` (in `data`) and `parentNode` (renamed `parentId`), update both places that assign it (see Step 3).
- Line~109 and Line~118 (trigger/condition parent lookup): `(srcNode.parentNode || srcNode.data.parentId)` → `(srcNode.parentId || srcNode.data.parentId)`
- In `getOrCreateNode`'s node literal: `parentNode: parentNodeId || undefined` → `parentId: parentNodeId || undefined`; and `extent: parentNodeId ? 'parent' : undefined` stays.

**Important:** Because `AppNode['data']` also has a `parentId` field (in `OPMNodeData`) AND the React Flow node now has a `parentId` field, these are two different things. Keep `data.parentId` (the hierarchy parent tracked by the app) and set the node-level `parentId` to the same value. The v12 node `parentId` is used by React Flow to physically nest the state inside the object. Both should be set identically, exactly as v11's `parentNode`/`data.parentId` were.

- [ ] **Step 3: Verify state nesting still assigns parentId correctly**

In `getOrCreateNode`, ensure when creating a state, both node-level and data-level parent linkage are set. The final node-literal block should be:

```ts
    node = {
      id,
      type: type === 'state' ? 'opmState' : type === 'process' ? 'opmProcess' : 'opmObject',
      position: { x, y },
      data: {
        name: cleaned,
        type,
        physical: existing ? existing.data.physical : false,
        states: existing ? existing.data.states : [],
        attributes: existing ? existing.data.attributes : [],
        parentId: parentNodeId || (existing ? existing.data.parentId : null),
        inputs: existing ? (existing.data.inputs || defaultInputs) : defaultInputs,
        outputs: existing ? (existing.data.outputs || defaultOutputs) : defaultOutputs,
      },
      parentId: parentNodeId || undefined,
      extent: parentNodeId ? 'parent' : undefined,
    };
```

- [ ] **Step 4: Update the entropy test to v12 typing**

In `src/components/entropy/__tests__/entropy.test.ts`:

- Remove `import { Node, Edge } from 'reactflow';` and instead import the aliases (the second line still provides nothing else needed here): `import type { AppNode, AppEdge } from '../EntropyTypes';`. If `Node`/`Edge` are still referenced directly elsewhere in the test, keep a type-only import `import type { Node, Edge } from '@xyflow/react';`.
- Update the `parentNode` assertion (currently line 101): `expect(emptyStateNode?.parentNode)` → `expect(emptyStateNode?.parentId)`:

```ts
expect(emptyStateNode?.parentId).toBe(kettleNode?.id);
```

- Update the two test fixture declarations from `Node<OPMNodeData>[]` / `Edge<OPMEdgeData>[]` to `AppNode[]` / `AppEdge[]`. In v12 the node/edge `type` field is **optional** but, when present, is constrained by the second generic (`'opmObject' | 'opmProcess' | 'opmState'` for nodes). The existing fixtures set `data.type` but no node-level `type`; that is valid as-is. If you add a node-level `type` for clarity, it must be one of those three literal strings (the node-component keys), e.g.:

```ts
const nodes: AppNode[] = [
  {
    id: 'obj-1',
    type: 'opmObject',
    position: { x: 0, y: 0 },
    data: { name: 'Home_System', type: 'object', physical: false }
  },
  // ...
];
```

The existing `edges` fixtures already omit a node-level `type`, which is valid for `AppEdge = Edge<OPMEdgeData, OPMLinkType | 'opmEdge'>` (the generic only constrains it when present). Leave them as-is unless `tsc` says otherwise; because `OPMEdgeData` is the data payload and `'opmEdge' | OPMLinkType` is a permissive type union, no fixture-edge changes are required.

- [ ] **Step 5: Run the entropy test**

```bash
cd "G:\adia project"
npx vitest run src/components/entropy/__tests__/entropy.test.ts
```

Expected: **PASS** (all 4 tests). If failures, check that every `parentNode` reference that survived the rename is now `parentId` and that the `AppNode`/`AppEdge` type wiring is correct.

- [ ] **Step 6: Commit**

```bash
cd "G:\adia project"
git add src/components/entropy
git commit -m "fix(entropy): migrate OPM types and bimodal parser to @xyflow/react v12"
```

---

## Task 3: Repair OPM Entropy workspace UI (Phase 1)

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Test: `src/components/entropy/__tests__/entropy.test.ts` (still passing), plus manual `npm run dev`

**Interfaces:**
- Consumes: `AppNode`/`AppEdge` from Task 2; `parseOpl`/`generateOpl` already updated.
- Produces: a compiling, behaviorally-identical `EntropyWorkspace` using `useNodesState<AppNode>`/`useEdgesState<AppEdge>` and `parentId`, with `node.measured` read correctly in auto-layout.

- [ ] **Step 1: Update imports and state hooks to v12**

In `src/components/entropy/EntropyWorkspace.tsx`, the import block at the top (already changed in Task 1) should now read:

```ts
import { ReactFlow, Background, Controls, MiniMap, addEdge, Connection, useNodesState, useEdgesState, useReactFlow, getBezierPath, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
```

After you replace the `Node<OPMNodeData>` / `Edge<OPMEdgeData>` annotations below with `AppNode`/`AppEdge`, the `type Node, type Edge` imports may become unused. Drop them from the reactflow import if nothing else in the file uses them (the file does not otherwise reference `Node`/`Edge` as bare types). Similarly, from the EntropyTypes import, remove `OPMNodeData`, `OPMEdgeData`, and `OPMLinkType` only if nothing else uses them after the rewrite. Leaving harmless unused imports will not fail `tsc` (tsconfig has no `noUnusedLocals`), so prioritize correctness over cleanup.

Add the type aliases to the `import { ... } from './EntropyTypes'` line:

```ts
import { OPMNodeData, OPMEdgeData, OPMLinkType, SimulationLog, OPMState, OPMPort, type AppNode, type AppEdge } from './EntropyTypes';
```

Then change the two state hooks and their usages:

```ts
const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
```

Replace every `Node<OPMNodeData>` / `Edge<OPMEdgeData>` type annotation in this file with `AppNode` / `AppEdge`, including:
- `const [selectedNode, setSelectedNode] = useState<AppNode | null>(null);`
- `undoStack`/`redoStack` states: `useState<{ nodes: AppNode[]; edges: AppEdge[] }[]>`
- props interface `EntropyWorkspaceProps`: `initialNodes?: AppNode[]`, `initialEdges?: AppEdge[]`, and `onSave?: (nodes: AppNode[], edges: AppEdge[]) => void`

- [ ] **Step 2: Rename parentNode → parentId in all logic**

Every occurrence of `.parentNode` in this file becomes `.parentId`. This includes the auto-layout effect, `filteredNodes`, `handleCanvasClick`, `handleManualActivateState`, `handleManualTriggerProcess`, `handleAutoInitializeStates`, `runSimTick`, and `handleDeleteSelectedNode`. Concretely the two `setNodes` pre-existing patterns:

```ts
if (node.type === 'opmState' && node.parentId) {
  const parent = parentNodes.find(p => p.id === node.parentId);
  ...
  const siblingStates = nodes.filter(n => n.type === 'opmState' && n.parentId === parent.id);
```

and in `handleCanvasClick`:

```ts
newNode.parentId = clickedObject.id;
newNode.extent = 'parent';
newNode.position = { x: 15, y: 45 };
newNode.data.parentId = clickedObject.id;
```

- [ ] **Step 3: Fix auto-layout to read node.measured dimensions**

The auto-layout effect currently reads `parent.width`/`parent.height` (v11 measured fields). In v12 these are user-supplied dimensions (none are set), so measured dimensions live in `parent.measured`. Lines ~240-241 currently:

```ts
const pW = parent.width || (siblingStates.length > 0 ? 180 : 130);
const pH = parent.height || (siblingStates.length > 0 ? 120 : 75);
```

Change to:

```ts
const pW = parent.measured?.width ?? (siblingStates.length > 0 ? 180 : 130);
const pH = parent.measured?.height ?? (siblingStates.length > 0 ? 120 : 75);
```

- [ ] **Step 4: Render `<ReactFlow>` with nodeTypes/edgeTypes unchanged**

The JSX `<ReactFlow ... nodeTypes={nodeTypes} edgeTypes={edgeTypes}>` stays as-is; only the import name changed. Verify the `nodeTypes`/`edgeTypes` maps still reference the components by their keys:

```ts
const nodeTypes = { opmObject: OPMObjectNode, opmProcess: OPMProcessNode, opmState: OPMStateNode };
const edgeTypes = { opmEdge: OPMEdge };
```

- [ ] **Step 5: Type check the module**

```bash
cd "G:\adia project"
npx tsc --noEmit
```

Expected: **No errors** in `src/components/entropy/EntropyWorkspace.tsx`, `OplParser.ts`, `EntropyTypes.ts`, or the entropy test. Remove any temporary `@ts-expect-error` suppressions you added in Task 1 for Entropy files.

- [ ] **Step 6: Run tests and smoke-check in the browser**

```bash
npx vitest run src/components/entropy/__tests__/entropy.test.ts
```

Expected: PASS.

Then start the dev server and manually verify the Entropy OPM module renders and simulates:
- Open a new terminal: `cd "G:\adia project"; npm run dev` → `http://localhost:3002/`
- Switch to the ENTROPY OPM module. Open the default Smart Home example. Verify: objects/processes/states render, ports show, running the simulation fires processes and transitions states, live OPL text still syncs, zoom in/out hierarchy still works.
- Press Ctrl+C to stop the server when done.

- [ ] **Step 7: Commit**

```bash
cd "G:\adia project"
git add src/components/entropy
git commit -m "fix(entropy): complete @xyflow/react v12 workspace migration"
```

---

## Task 4: Update OPM node and edge components for v12 props (Phase 1)

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`

**Interfaces:**
- Consumes: `AppNode`/`AppEdge` and `NodeProps<AppNode>` from `@xyflow/react`.
- Produces: node components that type-check with v12 `NodeProps` (they render `data` of type `OPMNodeData`), and an `OPMEdge` that type-checks with v12 `EdgeProps`.

- [ ] **Step 1: Update OPMNodeComponents.tsx imports and prop types**

Change import to:

```ts
import { Handle, Position, NodeProps, useUpdateNodeInternals, NodeResizer } from '@xyflow/react';
```

Add import of the data type (import from EntropyTypes):

```ts
import { OPMNodeData, OPMPort } from './EntropyTypes';
```

Update the three component signatures from `React.FC<NodeProps<OPMNodeData>>` to `React.FC<NodeProps<AppNode>>` where each `data` is `AppNode['data'] = OPMNodeData`. Since these components only read `data`, keep the body unchanged. Import `AppNode` as a type:

```ts
import { OPMNodeData, OPMPort, type AppNode } from './EntropyTypes';
```

Then:

```ts
export const OPMObjectNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
// ...unchanged body
```

Do the same for `OPMProcessNode` and `OPMStateNode`.

Because `AppNode` is a union of three node types, `data.type` narrows correctly, but `data.name`, `data.physical`, `data.states`, `data.attributes` are common to all three and remain accessible. The accesses `(data as any).isFiring` and `(data as any).isActive` are left as-is (they are optional dynamic fields not in `OPMNodeData`).

- [ ] **Step 2: Update OPMEdgeComponents.tsx imports and prop types**

Change import to:

```ts
import { EdgeProps, getBezierPath } from '@xyflow/react';
```

Import `AppEdge` and keep the component consuming `EdgeProps<AppEdge>`:

```ts
import { OPMEdgeData, type AppEdge } from './EntropyTypes';

export const OPMEdge: React.FC<EdgeProps<AppEdge>> = ({ ... }) => {
```

The destructured props (`id`, `sourceX`, `sourceY`, `targetX`, `targetY`, `sourcePosition`, `targetPosition`, `style`, `data`, `markerEnd`, `selected`) are all unchanged in v12. `getBezierPath` signature is unchanged. Keep the body as-is.

- [ ] **Step 3: Type check and test**

```bash
cd "G:\adia project"
npx tsc --noEmit
npx vitest run src/components/entropy/__tests__/entropy.test.ts
```

Expected: `tsc` clean for the two files (and project), entropy tests PASS.

- [ ] **Step 4: Commit**

```bash
cd "G:\adia project"
git add src/components/entropy/OPMNodeComponents.tsx src/components/entropy/OPMEdgeComponents.tsx
git commit -m "fix(entropy): migrate OPM node and edge components to v12 props"
```

---

## Task 5: Repair V-Lab module for v12 (Phase 2)

**Files:**
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Modify: `src/components/vlab/VLabNode.tsx`
- Modify: `src/components/vlab/VLabWorkspaceTypes.ts`
- Modify: `src/components/vlab/VLabNode.test.tsx`
- Modify: `src/components/vlab/vlabNodeRenaming.test.tsx`
- Test: `npx vitest run src/components/vlab` and `npm run test:vlab`

**Interfaces:**
- Consumes: `@xyflow/react` types + `ReactFlowProvider` from Task 1.
- Produces: a compiling V-Lab module where the tests pass and manual rendering works. V-Lab uses plain `Node`/`Edge` (no custom data generics in the workspace state), so this is mostly the import swap + type-checking the `Node<...>` generics used in `VLabWorkspaceTypes.ts`.

- [ ] **Step 1: Confirm VLab types/workspace need only the import swap**

Verified (by grep): `VLabWorkspaceTypes.ts`, `VLabWorkspace.tsx`, and `VLabNode.tsx` use plain `Node` / `Edge` with **no** data generic (`Node[]`, `Edge[]`, `const newNode: Node`), and VLabNode takes props as `any`-style (no `NodeProps<Data>`). Therefore **no v12 generic changes are required**. Only the import lines (already swapped in Task 1) apply. `VLabWorkspaceTypes.ts` still just needs its import changed (done in Task 1):

```ts
import { Node, Edge } from '@xyflow/react';
```

If `tsc` reports errors after the import swap, fix them as genuine v12 typing issues one by one; do not preemptively add generics that aren't needed.

- [ ] **Step 2: Confirm VLabNode.tsx useStore usage is compatible**

`VLabNode.tsx` uses `useStore(useCallback((s: any) => { ... s.edges ... }, [id]))`. In v12 `s.edges` is still valid. No renames needed for this selector (it does not use `nodeInternals`). Only the import line changes (done in Task 1). Leave the selector body unchanged.

- [ ] **Step 3: Fix VLab test files (ReactFlowProvider import already updated in Task 1)**

`VLabNode.test.tsx` and `vlabNodeRenaming.test.tsx` import `ReactFlowProvider` from `@xyflow/react` (updated in Task 1). Their `renderToStaticMarkup(<ReactFlowProvider>...)` usage is unchanged in v12. Remove any temporary suppressions added in Task 1, then verify they compile.

- [ ] **Step 4: Remove temporary suppressions and type check**

```bash
cd "G:\adia project"
npx tsc --noEmit
```

Expected: No errors in `src/components/vlab/**`. V-Lab uses plain `Node`/`Edge` (no data generics) and no `NodeProps` in component files, so there should be nothing beyond the import swap to fix. Remove all `@ts-expect-error` added in Task 1.

- [ ] **Step 5: Run V-Lab component and physics tests**

```bash
cd "G:\adia project"
npx vitest run src/components/vlab
npm run test:vlab
```

Expected: Both commands PASS. (Verified: no V-Lab engine file — `DAEAssembler.ts`, `vlabPhysics.ts`, kernels, tests, or boundary-generator fixtures — uses `Node<Data>` / `Edge<Data>` single generics; they all use plain `Node`/`Edge`, so the import swap in Task 1 is the only change needed. If a suite still fails on a v12 typing error, fix that specific occurrence and re-run.)

- [ ] **Step 6: Smoke-check V-Lab in the browser**

Start `npm run dev`, open the V-Lab module, add a few electrical components (resistor, voltage source, wire), and run a simulation to confirm schematic symbols, ports, and wiring render. Press Ctrl+C to stop.

- [ ] **Step 7: Commit**

```bash
cd "G:\adia project"
git add src/components/vlab src/engine/vlab
git commit -m "fix(vlab): migrate to @xyflow/react v12"
```

---

## Task 6: Repair X-Bridges module for v12 (Phase 3)

**Files:**
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx`
- Modify: `src/components/xbridges/XBlockNode.tsx`
- Modify: `src/components/xbridges/PremiumEdge.tsx`
- Modify: `src/components/xbridges/PremiumConnectionLine.tsx`
- Test: `npx tsc --noEmit` + manual `npm run dev`

**Interfaces:**
- Consumes: `@xyflow/react` types/functions from Task 1.
- Produces: compiling X-Bridges workspace and block node components.

- [ ] **Step 1: Confirm XbridgesWorkspace.tsx needs only the import swap**

Verified (by grep): `XbridgesWorkspace.tsx` uses plain `Node` / `Edge` types with **no** data generic (`Node[]`, `Edge[]`, `const newNode: Node`). Therefore no v12 generic changes are required — only the import line and stylesheet path (done in Task 1). `ReactFlow`, `addEdge`, `Background`, `Controls`, `Connection`, `useNodesState`, `useEdgesState`, `Panel`, `BackgroundVariant`, `MiniMap`, `ConnectionLineType` all still exist in v12 with the same signatures. If `tsc` reports errors after the import swap, they are genuine v12 typing issues — fix them one by one with the correct v12 types rather than blindly.

- [ ] **Step 2: Fix XBlockNode.tsx (import-only — props already untyped)**

`XBlockNode.tsx` is declared as `React.memo(({ data, selected, id }: any) => ...)` — its props are typed `any`, so there are **no** v12 `NodeProps` generics to change. Only the import line (done in Task 1) is required, and the `Handle`, `Position`, `useUpdateNodeInternals`, `NodeResizer` usages are all unchanged in v12. The `canvas.width/height` references in this file are DOM canvas metrics, not RF node metrics — leave them untouched. No further edits needed unless `tsc` reports an error (if it does, report back rather than guessing).

- [ ] **Step 3: Confirm PremiumEdge.tsx and PremiumConnectionLine.tsx need only the import swap**

Both were import-swapped in Task 1. `PremiumEdge.tsx` is declared as `({ ... }: EdgeProps & { type?: string }) => ...` (no `EdgeProps<Data>` generic to change) and `PremiumConnectionLine.tsx` takes destructured `any`-style args with no `EdgeProps` typing — so both need **no** further edits for v12 prop typing. Both already call `useReactFlow().screenToFlowPosition` (verified — no legacy `.project()` calls anywhere in the codebase), and `getBezierPath`/`getSmoothStepPath`/`getStraightPath` are unchanged in v12. No edits needed unless `tsc` reports an error.

- [ ] **Step 4: Remove temporary suppressions and type check**

```bash
cd "G:\adia project"
npx tsc --noEmit
```

Expected: No errors in `src/components/xbridges/**` and the whole project. Remove all `@ts-expect-error` from Task 1.

- [ ] **Step 5: Smoke-check X-Bridges in the browser**

Start `npm run dev`, open the X-Bridges module, place a gain and a sum block, wire them, and run a control simulation to confirm block rendering, ports, and wiring. Press Ctrl+C to stop.

- [ ] **Step 6: Run the full front-end test suite as a regression gate**

```bash
cd "G:\adia project"
npx vitest run
```

Expected: **All** tests pass (this runs every Vitest suite, including entropy, vlab, and any xbridges tests). If any suite fails, fix the affected v12 typing and re-run.

- [ ] **Step 7: Commit**

```bash
cd "G:\adia project"
git add src/components/xbridges
git commit -m "fix(xbridges): migrate to @xyflow/react v12"
```

---

## Task 7: Root-level leaf files and scripts (Phase 3 wrap-up)

**Files:**
- Modify: `debug_airfryer.ts` (repo root)
- Modify: `scripts/run_vlab_math_test.ts`
- Test: `npm run test:vlab` / `npm run test:vlab:professional`

**Interfaces:**
- Consumes: none beyond Task 1 imports.
- Produces: root-level/script files that compile with `@xyflow/react` Node/Edge types.

- [ ] **Step 1: Verify root/script files need only the import swap**

For `debug_airfryer.ts` and `scripts/run_vlab_math_test.ts`: confirm the import is `@xyflow/react` (done in Task 1). Verified: neither file uses `Node<Data>` / `Edge<Data>` single generics — they use plain `Node`/`Edge` types — so no generic changes are required. These are standalone scripts/tools, not React components, so no JSX changes.

- [ ] **Step 2: Type check**

```bash
cd "G:\adia project"
npx tsc --noEmit
```

Expected: clean. (Note: `tsconfig.json` `include` is `["src"]`, so root-level `debug_airfryer.ts` and `scripts/` may not be type-checked by `tsc --noEmit`; still fix the generics for correctness and run `npm run build` in the next step to validate the full pipeline.)

- [ ] **Step 3: Run full build (final gate)**

```bash
cd "G:\adia project"
npm run build
```

This runs `tsc && vite build && npm run build:electron`. Expected: completes without error. If the Electron build fails for reasons unrelated to the migration, note it but ensure `tsc` and `vite build` (the front-end) succeed.

- [ ] **Step 4: Run all test suites**

```bash
cd "G:\adia project"
npx vitest run
npm run test:vlab
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd "G:\adia project"
git add -A
git commit -m "chore: finalize reactflow v12 migration (root scripts + full build validations)"
```

---

## Self-Review Notes

- Every `parentNode` in Entropy is renamed to `parentId` (spec driver: v12 breaking change #6). Covered by Tasks 2 and 3.
- Every `node.width/height` measured read in Entropy is converted to `node.measured` (breaking change #2/#3). Covered by Task 3 Step 3.
- `Node<Data>` → `Node<Data, string>` typing across all V-Lab engine, X-Bridges, and leaf files (breaking change #10). Covered by Tasks 2, 5, 6, 7.
- Package name, named `ReactFlow` export, stylesheet path (breaking change #1). Covered by Task 1.
- `NodeProps`/`EdgeProps` typing (breaking change #10). Covered by Tasks 4, 6.
- Existing tests updated to new generic/`parentId` and verified green after each module phase (Tasks 2, 4, 5, 6, 7).
- No new features are added anywhere (scope guard).
