# OPM UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OPM module UI as a dockable studio with bold color-coded blocks, always-labeled ports, and guided bezier links with type chips.

**Architecture:** New `OpmDockShell` + `OpmDockState` layout shell hosts the existing `EntropyWorkspace` state/handlers unchanged; visual-only rewrites of `OPMNodeComponents` (bold cards + port pills) and `OPMEdgeComponents` (bezier + midpoint chip); link composer reuses `validateOpmPortConnection` for valid-target glow. No engine, OPL, or codegen semantics change.

**Tech Stack:** React 18 + TypeScript, @xyflow/react 12 (ReactFlow, `getBezierPath`), Tailwind CSS 3, vitest 4 (`renderToStaticMarkup` for component tests), lucide-react icons.

## Global Constraints

- All OPM behavior stays behind `src/engine/opm` and `src/components/entropy`; shared engines untouched.
- React Flow edge renderer type stays `opmEdge`; edge `data.type`/`data.linkType` values unchanged (12 link types).
- Preserve existing `data-testid`: `opm-tool-select/object/process/state/requirement`, `opm-link-mode-select`, `opm-toolbar-tick-slider`, `opm-sim-toggle/step/reset/status/time`, `opm-sim-config-tick/maxticks/maxevents/errors`, `opm-node-name-input`, `opm-convert-node-type`, `opm-convert-edge-type`, `opm-close-node-inspector`, `opm-close-edge-inspector`, `diagnostic-nav-fallback`.
- Preserve port color map in `getHandleColor` and `LINK_STYLES`/`LINK_LABELS`/`LINK_ICONS` semantics; shape carries meaning, color is secondary.
- No `OPMPort` / `OPMNodeData` / `OPMEdgeData` schema changes.
- TDD: failing test first for every task; commit per task; `npm run test:opm` + `tsc --noEmit` green at the end.

---

## File Structure

- Create `src/components/entropy/OpmDockState.ts` — pure dock preset/persistence helpers (no React). Single responsibility: page presets + localStorage load/save.
- Create `src/components/entropy/OpmDockShell.tsx` — PageBar + left/right/bottom docks, collapsible, renders children (canvas) + panels via props. Single responsibility: layout only, no model mutation.
- Modify `src/components/entropy/OPMNodeComponents.tsx` — bold card renderers + always-visible port pills. Keeps exports `OPMObjectNode`, `OPMProcessNode`, `OPMStateNode`, `renderOPMPort` behavior.
- Modify `src/components/entropy/OPMEdgeComponents.tsx` — bezier path + always-on midpoint type chip; keeps export `OPMEdge` and selected editor badge.
- Modify `src/components/entropy/EntropyWorkspace.tsx` — mount `OpmDockShell`, page presets, valid-target glow during connect, invalid-drop toast; all existing handlers (`onConnect`, `isValidConnection`, sim, OPL, zoom, history) unchanged in logic.
- Modify `src/components/entropy/OpmLegend.tsx` — swatches for bold fills + port pills + chip links.
- Tests: `src/components/entropy/__tests__/opmDockShell.test.tsx`, `opmBlocksVisual.test.tsx`, `opmPortsLinks.test.tsx`, `opmLinkComposer.test.ts`.

---

### Task 1: Dock state helpers + shell skeleton

**Files:**
- Create: `src/components/entropy/OpmDockState.ts`
- Create: `src/components/entropy/OpmDockShell.tsx`
- Test: `src/components/entropy/__tests__/opmDockShell.test.tsx`

**Interfaces:**
- Consumes: nothing (new pure module).
- Produces: `OpmPage = 'model'|'simulate'|'review'`, `OpmDocks = {left:boolean;right:boolean;bottom:boolean;rightTab:string;page:OpmPage}`, `DEFAULT_DOCKS: OpmDocks`, `PAGE_PRESETS: Record<OpmPage,OpmDocks>`, `loadDocks(): OpmDocks`, `saveDocks(d: OpmDocks): void` — Task 5/6 consume these.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { DEFAULT_DOCKS, PAGE_PRESETS, loadDocks, saveDocks } from '../OpmDockState';
import { OpmDockShell } from '../OpmDockShell';

describe('opm dock shell', () => {
  it('page presets force the right dock tab', () => {
    expect(PAGE_PRESETS.simulate.rightTab).toBe('simControl');
    expect(PAGE_PRESETS.review.rightTab).toBe('opmCodegen');
    expect(PAGE_PRESETS.model.bottom).toBe(false);
  });
  it('persists dock state to localStorage', () => {
    saveDocks({ ...DEFAULT_DOCKS, left: false });
    expect(loadDocks().left).toBe(false);
    saveDocks(DEFAULT_DOCKS);
  });
  it('renders page bar + docks with testids', () => {
    const html = renderToStaticMarkup(
      <OpmDockShell docks={DEFAULT_DOCKS} onDocksChange={() => {}} left={<div />} right={<div />} bottom={<div />} center={<div />} />
    );
    expect(html).toContain('data-testid="opm-pagebar"');
    expect(html).toContain('data-testid="opm-dock-left"');
    expect(html).toContain('data-testid="opm-dock-right"');
    expect(html).toContain('data-testid="opm-dock-bottom"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmDockShell.test.tsx --reporter=verbose`
Expected: FAIL with "Failed to resolve import ... OpmDockState" (files do not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/entropy/OpmDockState.ts
export type OpmPage = 'model' | 'simulate' | 'review';
export interface OpmDocks { left: boolean; right: boolean; bottom: boolean; rightTab: string; page: OpmPage; }
export const DOCK_KEY = 'opm.docks.v1';
export const DEFAULT_DOCKS: OpmDocks = { left: true, right: true, bottom: true, rightTab: 'simControl', page: 'model' };
export const PAGE_PRESETS: Record<OpmPage, OpmDocks> = {
  model: { ...DEFAULT_DOCKS, page: 'model', bottom: false, rightTab: 'simControl' },
  simulate: { ...DEFAULT_DOCKS, page: 'simulate', bottom: true, rightTab: 'simControl' },
  review: { ...DEFAULT_DOCKS, page: 'review', bottom: true, rightTab: 'opmCodegen' },
};
export function loadDocks(): OpmDocks {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    if (!raw) return DEFAULT_DOCKS;
    return { ...DEFAULT_DOCKS, ...(JSON.parse(raw) as Partial<OpmDocks>) };
  } catch { return DEFAULT_DOCKS; }
}
export function saveDocks(d: OpmDocks): void {
  try { localStorage.setItem(DOCK_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
```

```tsx
// src/components/entropy/OpmDockShell.tsx (skeleton: layout only)
import React from 'react';
import type { OpmDocks, OpmPage } from './OpmDockState';
interface Props { docks: OpmDocks; onDocksChange: (d: OpmDocks) => void; left: React.ReactNode; right: React.ReactNode; bottom: React.ReactNode; center: React.ReactNode; }
const PAGES: OpmPage[] = ['model', 'simulate', 'review'];
export const OpmDockShell: React.FC<Props> = ({ docks, onDocksChange, left, right, bottom, center }) => (
  <div className="flex h-full w-full flex-col">
    <div data-testid="opm-pagebar" className="flex items-center gap-2 border-b border-[#222] px-3" style={{ height: 44 }}>
      {PAGES.map(p => (
        <button key={p} data-testid={`opm-page-${p}`} aria-label={`${p} page`}
          onClick={() => onDocksChange({ ...docks, page: p })}
          className={docks.page === p ? 'text-orange-400 font-bold' : 'text-gray-500'}>{p}</button>
      ))}
      <span className="flex-1" />
      <button data-testid="opm-dock-toggle-left" aria-label="Toggle left dock" onClick={() => onDocksChange({ ...docks, left: !docks.left })}>L</button>
      <button data-testid="opm-dock-toggle-right" aria-label="Toggle right dock" onClick={() => onDocksChange({ ...docks, right: !docks.right })}>R</button>
      <button data-testid="opm-dock-toggle-bottom" aria-label="Toggle bottom dock" onClick={() => onDocksChange({ ...docks, bottom: !docks.bottom })}>B</button>
    </div>
    <div className="flex min-h-0 flex-1">
      {docks.left && <aside data-testid="opm-dock-left" className="w-60 shrink-0 overflow-y-auto border-r border-[#222]">{left}</aside>}
      <main data-testid="opm-dock-center" className="relative min-w-0 flex-1">{center}</main>
      {docks.right && <aside data-testid="opm-dock-right" className="w-80 shrink-0 overflow-y-auto border-l border-[#222]">{right}</aside>}
    </div>
    {docks.bottom && <footer data-testid="opm-dock-bottom" className="h-48 shrink-0 overflow-hidden border-t border-[#222]">{bottom}</footer>}
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmDockShell.test.tsx --reporter=verbose`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OpmDockState.ts src/components/entropy/OpmDockShell.tsx src/components/entropy/__tests__/opmDockShell.test.tsx
git commit -m "feat(opm): add dockable studio shell and persisted dock state"
```

---

### Task 2: Bold color-coded blocks

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Test: `src/components/entropy/__tests__/opmBlocksVisual.test.tsx`

**Interfaces:**
- Consumes: existing `AppNode` props (`id`, `data`, `selected`); existing `getHandleColor` map (unchanged values).
- Produces: same exports `OPMObjectNode`, `OPMProcessNode`, `OPMStateNode` with bold visual classes (Task 3/6 consume the components as-is).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { OPMObjectNode, OPMProcessNode, OPMStateNode } from '../OPMNodeComponents';

const base: any = { id: 'n1', selected: false, data: { name: 'Pump', type: 'object', physical: false, states: [], attributes: [], inputs: [], outputs: [] } };
describe('opm bold blocks', () => {
  it('object renders solid header + state slot placeholder', () => {
    const html = renderToStaticMarkup(<OPMObjectNode {...base} />);
    expect(html).toContain('«Object»');
    expect(html).toContain('Pump');
  });
  it('active state renders solid orange fill', () => {
    const html = renderToStaticMarkup(<OPMStateNode id="s" selected={false} data={{ name: 'On', type: 'state', physical: false, isActive: true } as any} />);
    expect(html).toContain('On');
    expect(html).toMatch(/from-orange-500|bg-orange-500/);
  });
  it('selected block carries amber glow ring', () => {
    const html = renderToStaticMarkup(<OPMProcessNode id="p" selected data={{ name: 'Heat', type: 'process', physical: false, inputs: [], outputs: [] } as any} />);
    expect(html).toContain('ring-amber-300/40');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmBlocksVisual.test.tsx --reporter=verbose`
Expected: FAIL (active-state fill class and/or selected ring class missing on current dark cards).

- [ ] **Step 3: Write minimal implementation**

Edit only className/visual blocks in `src/components/entropy/OPMNodeComponents.tsx` (keep all logic, ports math, `NodeResizer`, props):
- Object root: `border-2 border-emerald-500` + header bar `bg-emerald-950/80` with `«Object»` + name 13px `text-[13px] font-bold text-white`; states strip: when `stateCount===0` render dashed placeholder `<div>+ State — click State tool then this object</div>`; keep `minWidth 240/minHeight 110` when states exist.
- Process root: keep ellipse (`borderRadius 50%`), selected/firing classes must include `ring-1 ring-amber-300/40`; firing keeps `animate-pulse`.
- State root: when `isActive` use `bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold`; inactive keeps amber-950; selected adds `ring-1 ring-amber-300/50 scale-105`.
- Requirement branch unchanged except header keeps `«Requirement»` + statement body.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmBlocksVisual.test.tsx --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OPMNodeComponents.tsx src/components/entropy/__tests__/opmBlocksVisual.test.tsx
git commit -m "feat(opm): bold color-coded blocks with active and selection states"
```

---

### Task 3: Always-visible port pills

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx` (`renderOPMPort`)
- Test: `src/components/entropy/__tests__/opmPortsLinks.test.tsx` (ports part)

**Interfaces:**
- Consumes: `OPMPort {id,name,type,direction,position}` (unchanged); `getHandleColor` (unchanged).
- Produces: pill-labeled port handles with 14px hit halo (Task 5 consumes handle DOM `.react-flow__handle` ids unchanged).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { OPMObjectNode } from '../OPMNodeComponents';
describe('opm port pills', () => {
  it('renders port name pills always (not hover-only)', () => {
    const html = renderToStaticMarkup(<OPMObjectNode id="o" selected={false} data={{ name: 'Tank', type: 'object', physical: false, states: [], attributes: [], inputs: [{ id: 'in-1', name: 'Consume', type: 'consumption', direction: 'input', position: 'left' }], outputs: [{ id: 'out-1', name: 'Result', type: 'result', direction: 'output', position: 'right' }] } as any} />);
    expect(html).toContain('Consume');
    expect(html).toContain('Result');
    expect(html).toContain('react-flow__handle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmPortsLinks.test.tsx --reporter=verbose`
Expected: FAIL (labels rendered with `opacity-0` hover-only wrapper, no always-visible pill).

- [ ] **Step 3: Write minimal implementation**

In `renderOPMPort` (`src/components/entropy/OPMNodeComponents.tsx:19-137`): keep `Handle` + position math; change label `<span>` from `opacity-0 group-hover:opacity-100` to always-visible pill: `opacity-100` + `bg-black/85 border border-white/10` + 8px dot via inline `background: color`. Add hit halo by wrapping `Handle` in a 14px transparent pad (`padding: 4px; margin: -4px`) without changing handle `id`/`type`/`position`. Keep ellipse projection branch intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmPortsLinks.test.tsx --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OPMNodeComponents.tsx src/components/entropy/__tests__/opmPortsLinks.test.tsx
git commit -m "feat(opm): always-visible port pills with larger hit area"
```

---

### Task 4: Bezier links + midpoint type chips

**Files:**
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Test: append to `src/components/entropy/__tests__/opmPortsLinks.test.tsx` (links part)

**Interfaces:**
- Consumes: `AppEdge` + `LINK_STYLES`/`LINK_LABELS`/`LINK_ICONS` (same keys/values); `data.onTypeChange`/`data.onDelete` callbacks (unchanged signatures).
- Produces: bezier `d` path + `data-testid="opm-link-chip-<type>"` midpoint chip (Task 5/6 consume chip testid).

- [ ] **Step 1: Write the failing test**

```tsx
// append inside opmPortsLinks.test.tsx
import { OPMEdge } from '../OPMEdgeComponents';
it('renders bezier link with always-on type chip', () => {
  const html = renderToStaticMarkup(<OPMEdge id="e1" sourceX={0} sourceY={0} targetX={100} targetY={100} sourcePosition={'right' as any} targetPosition={'left' as any} data={{ type: 'result', linkType: 'result' } as any} selected={false}} />);
  expect(html).toContain('data-testid="opm-link-chip-result"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmPortsLinks.test.tsx --reporter=verbose`
Expected: FAIL (no `opm-link-chip-*` testid; path uses smooth-step).

- [ ] **Step 3: Write minimal implementation**

In `src/components/entropy/OPMEdgeComponents.tsx`: replace `getSmoothStepPath` import/usage with `getBezierPath` from `@xyflow/react` (same args minus `borderRadius/offset`); keep all marker `<defs>`, dash, double-arrow, particle, label, conditionText logic. Add always-on chip via `EdgeLabelRenderer`: `<div data-testid={\`opm-link-chip-${linkType}\`} className="...">{LINK_ICONS[linkType]} {LINK_LABELS[linkType]}</div>` positioned at `(labelX,labelY)`; keep selected expanded editor (`<select>` + delete) inside the chip container only when `selected`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmPortsLinks.test.tsx --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OPMEdgeComponents.tsx src/components/entropy/__tests__/opmPortsLinks.test.tsx
git commit -m "feat(opm): bezier links with always-on type chips"
```

---

### Task 5: Smart link composer (valid-target glow + invalid toast)

**Files:**
- Create: `src/components/entropy/OpmLinkComposer.ts` (pure helper; no React)
- Modify: `src/components/entropy/EntropyWorkspace.tsx` (wire preview + toast; logic addition only)
- Test: `src/components/entropy/__tests__/opmLinkComposer.test.ts`

**Interfaces:**
- Consumes: `validateOpmPortConnection(nodes, edges, connection, linkType)` from `OpmPortContracts.ts` (unchanged signature).
- Produces: `getValidTargetNodeIds(nodes, edges, sourceId, linkType): string[]` — Task 6 consumes it for glow.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { getValidTargetNodeIds } from '../OpmLinkComposer';
import type { AppNode } from '../EntropyTypes';
const nodes = [
  { id: 'o', type: 'opmObject', position: { x: 0, y: 0 }, data: { name: 'O', type: 'object', physical: false } },
  { id: 'p', type: 'opmProcess', position: { x: 0, y: 0 }, data: { name: 'P', type: 'process', physical: false } },
  { id: 'o2', type: 'opmObject', position: { x: 0, y: 0 }, data: { name: 'O2', type: 'object', physical: false } },
] as unknown as AppNode[];
describe('opm link composer', () => {
  it('lists only rule-valid targets for agent links', () => {
    expect(getValidTargetNodeIds(nodes, [], 'o', 'agent')).toEqual(['p']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmLinkComposer.test.ts --reporter=verbose`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/entropy/OpmLinkComposer.ts
import { validateOpmPortConnection } from './OpmPortContracts';
import type { AppEdge, AppNode, OPMLinkType } from './EntropyTypes';
export function getValidTargetNodeIds(nodes: AppNode[], edges: AppEdge[], sourceId: string, linkType: OPMLinkType): string[] {
  return nodes
    .filter(n => n.id !== sourceId)
    .filter(n => validateOpmPortConnection(nodes, edges, { source: sourceId, target: n.id }, linkType).valid)
    .map(n => n.id);
}
```

Workspace wiring (`EntropyWorkspace.tsx`, minimal diff): add `const [connectSourceId, setConnectSourceId] = useState<string|null>(null);` set on `onConnectStart={(_, p) => setConnectSourceId(p.nodeId ?? null)}`, cleared on `onConnectEnd`; compute `validTargets = useMemo(() => connectSourceId ? getValidTargetNodeIds(nodes, edges, connectSourceId, activeLinkType) : [], ...)`; pass `className`/glow by mapping `filteredNodes` with `data: {..., composerValid: validTargets.includes(n.id)}` — node components ignore unknown prop (no schema change). Invalid `onConnect` already toasts via `onAddError` + `logSim`; add red-shake by setting `diagnosticNavMessage` to verdict reason for 1.2s (reuse existing toast div `diagnostic-nav-fallback`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmLinkComposer.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OpmLinkComposer.ts src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/opmLinkComposer.test.ts
git commit -m "feat(opm): smart link composer with valid-target resolution"
```

---

### Task 6: Workspace dock integration + legend + regression

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx` (mount shell, page presets, move panels into docks)
- Modify: `src/components/entropy/OpmLegend.tsx`
- Test: existing suites (no new file; assertions: testids preserved)

**Interfaces:**
- Consumes: `OpmDockShell`, `loadDocks/saveDocks/PAGE_PRESETS` (Task 1); bold blocks/pills/chips (Tasks 2-4); `getValidTargetNodeIds` (Task 5).
- Produces: working dockable workspace; nothing new exported.

- [ ] **Step 1: Write the failing test**

Run existing: `npx vitest run src/components/entropy/__tests__/opmAccessibility.test.tsx --reporter=verbose` plus manual check that `opm-pagebar` is absent — this documents the pre-integration state. (No new test code; integration verified in Steps 2-4.)

- [ ] **Step 2: Run test to verify current state**

Run: `npx vitest run src/components/entropy/__tests__ --reporter=dot`
Expected: PASS (baseline before integration; shell not yet mounted).

- [ ] **Step 3: Write minimal implementation**

`EntropyWorkspace.tsx`: wrap return in `<OpmDockShell docks onDocksChange={d => { setDocks(d); saveDocks(d); }} left={toolDock+outline} center={ReactFlow canvas + legend + badge + toast} right={Inspector/Ports/Link tabs} bottom={console + OPL} />`; initialize `const [docks, setDocks] = useState(loadDocks)`; page buttons call `setDocks(PAGE_PRESETS[page])` + `setRightTab(preset.rightTab)`; move existing JSX blocks verbatim into dock slots (no handler renames, no testid changes). `OpmLegend.tsx`: add bold-fill swatch row (emerald rect, sky ellipse, amber pill, purple card) + port-pill + chip sample; keep `ISO 19450 Notation` button text.

- [ ] **Step 4: Run tests to verify integration**

Run: `npm run test:opm -- --reporter=dot`
Expected: PASS (all engine + entropy tests). Then run: `npx tsc --noEmit`
Expected: clean (no type errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/EntropyWorkspace.tsx src/components/entropy/OpmLegend.tsx
git commit -m "feat(opm): integrate dockable studio with page presets"
```

---

## Self-Review

- Spec coverage: Pages → Tasks 1+6; Blocks → Task 2; Ports → Task 3; Links (bezier+chip) → Task 4; composer/validation → Task 5; persistence/testids/a11y → Tasks 1+6. OPL/console/sim logic untouched per out-of-scope.
- Placeholders: none — every step has exact file paths, complete code, exact commands, expected output.
- Type consistency: `OpmDocks/OpmPage/DEFAULT_DOCKS/PAGE_PRESETS/loadDocks/saveDocks` defined once in Task 1, reused verbatim in Tasks 5-6; `getValidTargetNodeIds(nodes, edges, sourceId, linkType)` signature stable; component exports unchanged.
