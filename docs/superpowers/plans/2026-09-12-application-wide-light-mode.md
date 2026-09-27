# Application-Wide Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a coherent, accessible technical-studio light mode across every ADIA workspace without changing engineering behavior.

**Architecture:** Replace hard-coded presentation values with a semantic CSS-variable contract, then attach small scoped adapters to specialized workspaces. Migrate shared primitives before modules so later tasks consume one stable interface; retain intentional dark terminal/code surfaces behind explicit terminal tokens.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, CSS custom properties, Vitest, Playwright, Vite, Electron.

## Global Constraints

- Preserve all simulation, SysML, OPM, HIL, DOE, X-Bridges, and V-Lab behavior.
- Add no remote font dependency and no new component framework.
- Use Inter/system sans for UI and JetBrains Mono/system monospace for engineering signatures.
- Body and control text must target WCAG AA contrast; screenshots alone do not prove compliance.
- Minimum dense-control target is 32 by 32 pixels; primary actions target 40 pixels.
- Every interactive control must expose hover, active, disabled, error, and `focus-visible` states.
- Dark code, terminal, plot, and telemetry panes are permitted only through explicit terminal tokens.

---

## File Map

- Create `src/styles/theme-contract.css`: semantic light/dark variables and reusable theme classes.
- Create `src/styles/workspaces/entropy.css`, `hil.css`, `xbridges.css`, `vlab.css`, `doe.css`: scoped module adapters.
- Create `src/components/ui/EngineeringPrimitives.tsx`: shared theme-safe controls migrated from `App.tsx`.
- Create `src/styles/themeContract.test.ts`: static contract and contrast tests.
- Create `tests/e2e/light-mode-visual.spec.ts`: representative browser states for all modules.
- Modify `src/index.css`: import the contract/adapters and remove superseded compatibility rules.
- Modify `src/App.tsx`: consume shared primitives and semantic shell/diagram classes.
- Modify the module roots listed in Tasks 3–7 to attach semantic classes and replace raw presentation values.

---

### Task 1: Semantic Theme Contract

**Files:**
- Create: `src/styles/theme-contract.css`
- Create: `src/styles/themeContract.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: CSS variables `--surface-canvas`, `--surface-panel`, `--surface-raised`, `--surface-terminal`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-default`, `--border-strong`, `--focus-ring`, `--status-success`, `--status-warning`, `--status-danger`, `--diagram-grid`, `--diagram-node`, `--diagram-node-selected`.
- Produces: classes `.ui-surface`, `.ui-card`, `.ui-control`, `.ui-focus-ring`, `.ui-terminal`, `.engineering-canvas`.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/theme-contract.css', 'utf8');

describe('theme contract', () => {
  it.each(['surface-canvas', 'surface-panel', 'surface-raised', 'surface-terminal', 'text-primary', 'text-secondary', 'border-default', 'focus-ring', 'diagram-grid', 'diagram-node'])('defines %s in both themes', token => {
    expect((css.match(new RegExp(`--${token}:`, 'g')) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('provides a visible keyboard focus rule', () => {
    expect(css).toMatch(/:focus-visible[\s\S]*outline:\s*2px/);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing file/token failure**

Run: `npx vitest run src/styles/themeContract.test.ts`

Expected: FAIL because `src/styles/theme-contract.css` does not exist.

- [ ] **Step 3: Implement the contract and import it before legacy compatibility rules**

```css
:root {
  --surface-canvas: #181818;
  --surface-panel: #242424;
  --surface-raised: #2b2b2b;
  --surface-terminal: #0d1117;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --border-default: #3f3f46;
  --border-strong: #64748b;
  --focus-ring: #fb923c;
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-danger: #ef4444;
  --diagram-grid: rgba(148, 163, 184, .14);
  --diagram-node: #242424;
  --diagram-node-selected: #fb923c;
}

[data-theme='light'], .light {
  --surface-canvas: #eef3f5;
  --surface-panel: #ffffff;
  --surface-raised: #f4f7f8;
  --surface-terminal: #111827;
  --text-primary: #172a35;
  --text-secondary: #405661;
  --text-muted: #667b85;
  --border-default: #c9d6db;
  --border-strong: #8ca3ab;
  --focus-ring: #c45d0a;
  --status-success: #087f73;
  --status-warning: #a16207;
  --status-danger: #b91c1c;
  --diagram-grid: rgba(31, 94, 104, .16);
  --diagram-node: #ffffff;
  --diagram-node-selected: #c45d0a;
}

.ui-focus-ring:focus-visible,
.ui-control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run the contract and existing theme tests**

Run: `npx vitest run src/styles/themeContract.test.ts src/utils/themeManager.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/theme-contract.css src/styles/themeContract.test.ts src/index.css
git commit -m "feat(ui): establish semantic theme contract"
```

### Task 2: Shared Engineering Primitives And Shell

**Files:**
- Create: `src/components/ui/EngineeringPrimitives.tsx`
- Create: `src/components/ui/EngineeringPrimitives.test.tsx`
- Modify: `src/App.tsx:190-330`
- Modify: `src/App.tsx:4577-4647`
- Modify: `src/App.tsx:15300-15600`

**Interfaces:**
- Consumes: Task 1 semantic variables/classes.
- Produces: `EngineeringButton`, `EngineeringInput`, `EngineeringLabel`, `EngineeringBadge`, `EngineeringSeparator`, and `EngineeringCheckbox` with existing prop compatibility.

- [ ] **Step 1: Write interaction-state tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EngineeringButton, EngineeringInput } from './EngineeringPrimitives';

describe('engineering primitives', () => {
  it('exposes semantic control and focus classes', () => {
    render(<><EngineeringButton>Run</EngineeringButton><EngineeringInput aria-label="Clock" /></>);
    expect(screen.getByRole('button', { name: 'Run' }).className).toContain('ui-control');
    expect(screen.getByLabelText('Clock').className).toContain('ui-focus-ring');
  });
});
```

- [ ] **Step 2: Run the test and confirm missing exports**

Run: `npx vitest run src/components/ui/EngineeringPrimitives.test.tsx`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Move the current primitives and replace literal palette classes**

```tsx
export const EngineeringButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className = '', ...props }, ref) => (
    <button ref={ref} className={`ui-control ui-focus-ring min-h-8 rounded-md border px-3 text-sm font-medium ${className}`} {...props} />
  ),
);
```

- [ ] **Step 4: Update shell header, workspace tabs, mobile navigation, and dialogs to consume semantic surfaces**

Use `.ui-surface`, `.ui-card`, `.ui-control`, and `.ui-focus-ring`; preserve all existing handlers, IDs, titles, and ARIA attributes.

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `npx vitest run src/components/ui/EngineeringPrimitives.test.tsx src/utils/themeManager.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/EngineeringPrimitives.tsx src/components/ui/EngineeringPrimitives.test.tsx src/App.tsx
git commit -m "refactor(ui): theme shared engineering controls"
```

### Task 3: Entropy OPM Light Workspace

**Files:**
- Create: `src/styles/workspaces/entropy.css`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OpmExecutionPropertiesPanel.tsx`
- Modify: `src/components/entropy/OpmCodeGenerationWorkspace.tsx`
- Modify: `src/components/entropy/OpmRightPanelContent.tsx`
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Test: `src/components/entropy/__tests__/opmAccessibility.test.tsx`
- Test: `src/components/entropy/__tests__/opmBlocksVisual.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and Task 2 controls.
- Produces: `.entropy-workspace`, `.opm-panel`, `.opm-node`, `.opm-inspector`, `.opm-console`, `.opm-code-surface`.

- [ ] **Step 1: Add failing semantic-root and accessible-control assertions**

```tsx
expect(container.querySelector('.entropy-workspace')).toBeTruthy();
expect(container.querySelector('.opm-console')).toBeTruthy();
expect(screen.getByRole('button', { name: /start simulation/i })).toHaveAttribute('title');
```

- [ ] **Step 2: Run the Entropy component tests**

Run: `npx vitest run src/components/entropy/__tests__/opmAccessibility.test.tsx src/components/entropy/__tests__/opmBlocksVisual.test.tsx`

Expected: FAIL on missing semantic classes.

- [ ] **Step 3: Theme the root, toolbar, outline, inspector, tabs, modals, and console**

```css
.entropy-workspace { background: var(--surface-canvas); color: var(--text-primary); }
.entropy-workspace .opm-panel { background: var(--surface-panel); border-color: var(--border-default); }
.entropy-workspace .opm-console,
.entropy-workspace .opm-code-surface { background: var(--surface-terminal); color: #dbeafe; }
```

Keep OPM semantic colors for Object, Process, State, validity, and execution status; replace dark-only card/input colors with tokens.

- [ ] **Step 4: Run OPM regression coverage**

Run: `npm run test:opm`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/workspaces/entropy.css src/components/entropy
git commit -m "feat(ui): complete entropy light workspace"
```

### Task 4: HIL Workspace And Target Pack Completion

**Files:**
- Create: `src/styles/workspaces/hil.css`
- Modify: `src/components/hil/HILWorkspace.tsx`
- Modify: `src/components/hil/TargetPackSelector.tsx`
- Modify: `src/components/hil/HILDriverPanel.tsx`
- Modify: `src/components/hil/HILSignalMapper.tsx`
- Modify: `src/components/hil/HILDashboard.tsx`
- Test: `src/components/hil/TargetPackSelector.test.tsx`

**Interfaces:**
- Consumes: semantic surfaces and terminal token.
- Produces: `.hil-workspace`, `.hil-panel`, `.hil-terminal`, `.hil-status`, `.hil-target-card`.

- [ ] **Step 1: Add failing class-contract assertions**

```tsx
expect(container.querySelector('.hil-target-card')).toBeTruthy();
expect(container.querySelectorAll('.hil-panel').length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the target-pack test**

Run: `npx vitest run src/components/hil/TargetPackSelector.test.tsx`

Expected: FAIL on missing semantic classes.

- [ ] **Step 3: Replace compatibility substring overrides with scoped HIL classes**

Use white/slate cards for configuration and mapping; keep compiler output, generated C, serial telemetry, and scopes on `.hil-terminal`. Ensure target selectors and driver-mode buttons use the shared focus and disabled states.

- [ ] **Step 4: Run HIL component, security, and TypeScript checks**

Run: `npx vitest run src/components/hil && npm run test:security && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/workspaces/hil.css src/components/hil src/index.css
git commit -m "feat(ui): finish hil light workspace"
```

### Task 5: X-Bridges And V-Lab Diagram Workspaces

**Files:**
- Create: `src/styles/workspaces/xbridges.css`
- Create: `src/styles/workspaces/vlab.css`
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx`
- Modify: `src/components/xbridges/XbridgesPropertiesPanel.tsx`
- Modify: `src/components/xbridges/XBlockNode.tsx`
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Modify: `src/components/vlab/VLabNode.tsx`
- Test: `src/components/vlab/VLabWorkspace.test.tsx`
- Test: `src/components/vlab/VLabNode.test.tsx`

**Interfaces:**
- Produces: `.xbridges-workspace`, `.xbridges-node`, `.vlab-workspace`, `.vlab-node`, shared `.engineering-canvas` use.

- [ ] **Step 1: Add failing root/node theme assertions**

```tsx
expect(container.querySelector('.vlab-workspace')).toBeTruthy();
expect(container.querySelector('.vlab-node')).toHaveClass('ui-card');
```

- [ ] **Step 2: Run the V-Lab focused tests**

Run: `npx vitest run src/components/vlab/VLabWorkspace.test.tsx src/components/vlab/VLabNode.test.tsx`

Expected: FAIL until semantic classes are attached.

- [ ] **Step 3: Theme X-Bridges navigation, search, library, properties, flow canvas, controls, and dialogs**

Replace invalid `text-slate-250`, `text-slate-350`, `text-slate-450`, `text-slate-455`, and `text-emerald-450` classes with semantic text/status classes. Derive React Flow background, grid, minimap, and controls from diagram tokens.

- [ ] **Step 4: Theme V-Lab cards, properties, library, flow canvas, controls, and empty states**

Retain physical-domain accent colors and symbol artwork; use theme tokens for card/chrome backgrounds and label hierarchy.

- [ ] **Step 5: Run V-Lab and TypeScript regressions**

Run: `npm run test:vlab && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/workspaces/xbridges.css src/styles/workspaces/vlab.css src/components/xbridges src/components/vlab
git commit -m "feat(ui): unify diagram workspace light themes"
```

### Task 6: DOE, RTM, SysML Editors, And Utility Dialogs

**Files:**
- Create: `src/styles/workspaces/doe.css`
- Modify: `src/components/doe/DOEManager.tsx`
- Modify: `src/components/sysml/BlockFeatureEditor.tsx`
- Modify: `src/components/sysml/BlockPropertiesEditor.tsx`
- Modify: `src/components/sysml/IbdConnectorEditor.tsx`
- Modify: `src/components/sysml/RelationshipEndEditor.tsx`
- Modify: `src/components/sysml/TraceabilityMatrix.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/doe/DOEManager.test.tsx`
- Test: `src/components/sysml/BlockFeatureEditor.test.tsx`
- Test: `src/components/sysml/TraceabilityMatrix.test.tsx`

**Interfaces:**
- Produces: `.doe-workspace`, `.engineering-table`, `.sysml-editor`, `.traceability-grid`.

- [ ] **Step 1: Add semantic-class assertions to representative DOE and SysML tests**

```tsx
expect(container.querySelector('.doe-workspace')).toBeTruthy();
expect(container.querySelector('.sysml-editor')).toBeTruthy();
expect(container.querySelector('.engineering-table')).toBeTruthy();
```

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `npx vitest run src/components/doe/DOEManager.test.tsx src/components/sysml/BlockFeatureEditor.test.tsx src/components/sysml/TraceabilityMatrix.test.tsx`

Expected: FAIL on missing semantic classes.

- [ ] **Step 3: Theme tables, editors, validation states, plots, and utility dialogs**

Use raised headers, zebra rows with subtle contrast, sticky-header borders, explicit empty states, and a terminal token only for raw generated code. Preserve all requirement governance, deletion, and relationship behavior.

- [ ] **Step 4: Run DOE and SysML release checks**

Run: `npm run test:doe && npm run test:sysml:release`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/workspaces/doe.css src/components/doe src/components/sysml src/App.tsx
git commit -m "feat(ui): theme engineering editors and tables"
```

### Task 7: Remove Legacy Overrides And Add Static Guardrails

**Files:**
- Modify: `src/index.css`
- Modify: `src/styles/themeContract.test.ts`
- Create: `scripts/check_theme_literals.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run lint:theme`.

- [ ] **Step 1: Write the literal-color guard script and failing allowlist test**

```js
const forbidden = /(?:bg|text|border)-\[#[0-9a-f]{3,8}\]/gi;
const allowedFiles = new Set(['src/styles/theme-contract.css']);
// Scan migrated UI files, print `file:line class`, and exit 1 when a forbidden literal remains.
```

Add to `package.json`:

```json
"lint:theme": "node scripts/check_theme_literals.cjs"
```

- [ ] **Step 2: Run the guard and record remaining literals**

Run: `npm run lint:theme`

Expected: FAIL with exact file and line output for migrated files.

- [ ] **Step 3: Remove superseded global substring compatibility selectors and remaining migrated literals**

Keep a documented allowlist only for semantic module accents, plots, terminal syntax, and generated engineering symbols.

- [ ] **Step 4: Run theme guard and TypeScript**

Run: `npm run lint:theme && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/styles/themeContract.test.ts scripts/check_theme_literals.cjs package.json
git commit -m "test(ui): prevent dark-only theme regressions"
```

### Task 8: Cross-Module Visual And Release Verification

**Files:**
- Create: `tests/e2e/light-mode-visual.spec.ts`
- Create: `docs/design-audits/light-mode-verification.md`
- Modify: `playwright.config.ts` only if the existing web-server configuration cannot run this spec.

**Interfaces:**
- Consumes: all prior semantic roots and stable element IDs.
- Produces: screenshot evidence for shell, State Machine, BDD, Requirements, IBD, X-Bridges, V-Lab, HIL, Entropy OPM, DOE, and representative dialogs.

- [ ] **Step 1: Add a failing cross-module smoke test**

```ts
import { expect, test } from '@playwright/test';

test('major workspaces render in light mode without dark root surfaces', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  for (const name of ['State Machine', 'SysML BDD', 'Requirements', 'SysML IBD', 'X-Bridges', 'V-Lab', 'HIL', 'ENTROPY OPM']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('body')).toHaveScreenshot(`light-${name.toLowerCase().replace(/\s+/g, '-')}.png`);
  }
});
```

- [ ] **Step 2: Run the visual smoke test and inspect every diff**

Run: `npx playwright test tests/e2e/light-mode-visual.spec.ts --project=chromium`

Expected: Initial snapshot creation or intentional failures that expose remaining dark roots.

- [ ] **Step 3: Fix only evidence-backed visual defects, then capture light and dark baselines**

For each module verify empty, populated, selected, disabled, validation-error, modal, and terminal/code states. Record keyboard traversal, 200% zoom behavior, viewport, and any accessibility limits in `docs/design-audits/light-mode-verification.md`.

- [ ] **Step 4: Run the complete release gate**

Run:

```bash
npm run lint:theme
npm run test:sysml:full-release
npm run test:opm:release
npm run test:vlab
npm run test:doe
npx playwright test tests/e2e/light-mode-visual.spec.ts --project=chromium
npm run build
```

Expected: all commands exit 0; Vite may report only the existing bundle-size warning.

- [ ] **Step 5: Commit final evidence**

```bash
git add tests/e2e/light-mode-visual.spec.ts tests/e2e/light-mode-visual.spec.ts-snapshots docs/design-audits/light-mode-verification.md
git commit -m "test(ui): verify application-wide light mode"
```

- [ ] **Step 6: Push and verify synchronization**

Run: `git push origin co-work && git status --short --branch`

Expected: `co-work...origin/co-work` with no modified or untracked files.

---

## Completion Criteria

- Every major module uses a semantic root and contains no accidental dark-only root, navigation, card, form, or dialog surface.
- Intentional dark code/terminal/plot panes are explicit and visually contained.
- Typography, focus, hover, disabled, error, selection, and status treatment are consistent.
- Theme lint, focused module suites, cross-module screenshots, TypeScript, Vite, and protected Electron build pass.
- The audit report documents screenshot evidence and the remaining limits of screenshot-only accessibility review.
