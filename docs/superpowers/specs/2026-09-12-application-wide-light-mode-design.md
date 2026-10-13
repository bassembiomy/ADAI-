# Application-Wide Light Mode Design

## Purpose

Complete ADIA's light mode as a production design system across the shell, engineering diagrams, forms, dialogs, code surfaces, and specialized workspaces. The result must preserve each module's identity while making typography, hierarchy, interaction states, and accessibility consistent.

## Audited Baseline

Fresh browser captures for State Machine, X-Bridges, V-Lab, and Entropy OPM are stored in `docs/design-audits/2026-09-12-light-mode/`. The audit found that State Machine and V-Lab are broadly healthy, X-Bridges needs targeted contrast and spacing refinement, HIL needs nested-surface completion, and Entropy OPM remains substantially dark-only. Code inspection also found hard-coded dark values in shared primitives, DOE, RTM, SysML editors, and several dialogs.

## Design Direction

Use the approved “technical studio” visual language:

- Cool ivory/slate application canvas with white elevated work surfaces.
- Deep slate primary text and restrained secondary text.
- Emerald for structural and successful states.
- Orange for selection, editing, and primary engineering actions.
- Module accents remain recognizable but never replace semantic status colors.
- Inter/system sans for navigation and controls; JetBrains Mono/system monospace for identifiers, code, values, multiplicities, and engineering signatures.
- Quiet blueprint grids, crisp one-pixel borders, restrained shadows, and clear selected-node halos.

## Architecture

### Semantic Theme Contract

`src/index.css` remains the single source of theme tokens. Add semantic groups for canvas, surfaces, text, borders, focus, status, diagrams, terminals, and overlays. Components consume variables through semantic utility classes rather than adding more global substring overrides.

### Shared UI Layer

Extract the inline shared primitives currently embedded in `src/App.tsx` into a focused theme-safe module. Buttons, inputs, labels, badges, separators, checkboxes, cards, tabs, and dialogs must expose consistent hover, active, disabled, error, and focus-visible states.

### Specialized Workspace Adapters

Each dense workspace receives one scoped root class and a small adapter stylesheet:

- `entropy-workspace`
- `hil-workspace`
- `xbridges-workspace`
- `vlab-workspace`
- `doe-workspace`

Dark code and telemetry panes are allowed as intentional terminal surfaces. Their surrounding navigation, cards, and forms remain light. This prevents dark islands from being mistaken for unfinished theming.

### Diagram Contract

State Machine, BDD, Requirements, IBD, X-Bridges, V-Lab, and Entropy OPM use shared diagram tokens for canvas, grid, node fill, node border, labels, ports, relationships, selection, and disabled states. Module accent colors may decorate headers or ports but must meet contrast requirements.

## Interaction And Accessibility Requirements

- Primary body text targets WCAG AA contrast on all light surfaces.
- Secondary text uses a darker slate than placeholder or disabled text.
- Keyboard focus uses a visible two-pixel ring with an offset from the control border.
- Minimum interactive target is 32 by 32 pixels for dense engineering controls; primary actions target 40 pixels.
- Hover is never the only indication of interactivity.
- Disabled controls remain legible and visibly distinct from enabled controls.
- Status meaning is communicated with text or icon plus color.
- Motion respects `prefers-reduced-motion`.
- Layout remains usable at 200% browser zoom and narrow desktop/mobile breakpoints.

## Rollout Order

1. Semantic token contract and theme test helpers.
2. Shared primitives and shell navigation.
3. Entropy OPM, because it is the largest visible failure.
4. HIL and its target-pack/code panes.
5. X-Bridges and V-Lab diagram controls.
6. DOE, RTM, SysML property editors, dialogs, and remaining utilities.
7. Automated visual smoke coverage and final cross-theme regression gate.

## Verification

- Unit-test theme persistence and semantic class/token presence.
- Run TypeScript, SysML, OPM, HIL, V-Lab, and DOE suites relevant to changed modules.
- Run production Vite/Electron build.
- Capture light and dark screenshots for every major workspace at a fixed viewport.
- Verify representative empty, populated, selected, disabled, error, modal, and code-pane states.
- Perform keyboard focus and 200% zoom checks; screenshots alone do not establish full WCAG compliance.

## Non-Goals

- No workflow or simulation behavior changes.
- No new component framework or remote font dependency.
- No redesign of module information architecture.
- No forced light theme for code editors, terminals, scopes, or telemetry plots when dark presentation materially improves signal readability.
