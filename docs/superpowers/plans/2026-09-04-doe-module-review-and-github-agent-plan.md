# DOE Module Review and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Establish and implement a verifiable correctness contract for ADIA’s DOE mathematics, charts, and DOE-to-X-Bridges/V-Lab connections, then deliver the work through a Git branch and GitHub pull-request review cycle with no merge or final confirmation until review feedback is addressed.

**Architecture:** Move DOE calculations and model serialization out of the monolithic \`src/App.tsx\` into a typed, deterministic engine. Keep the UI responsible for editing data and rendering charts, and make both X-Bridges and V-Lab consume the same serialized DOE model contract. Validate the complete path with analytical fixtures, integration tests, UI tests, TypeScript/build checks, and a GitHub PR whose review is an explicit release gate.

**Tech Stack:** TypeScript, React, Vitest, Plotly/\`react-plotly.js\`, \`mathjs\`, existing X-Bridges engine, existing V-Lab DAE/validation engine, npm scripts, GitHub pull requests.

## Global Constraints

- Preserve all unrelated user changes in the dirty worktree; do not reset, stash, or overwrite them.
- Use a dedicated branch named \`codex/doe-module-review\` created from the current working tree after recording the baseline.
- Do not claim mathematical or integration correctness from UI appearance alone; every claim needs a deterministic test or recorded diagnostic.
- Do not evaluate arbitrary equation text in a new runtime boundary without the existing validation/safety policy; reuse a constrained model representation and reject malformed payloads.
- Keep RSM, GMDH, and Taguchi behavior compatible with existing \`.json\` project persistence unless an explicit migration is added and tested.
- The implementation agent may commit and push its branch and open/update a PR, but must not merge it or mark it confirmed before the human review gate.
- The final confirmation step occurs only after the PR diff, automated checks, and review feedback have been inspected and the user explicitly confirms the accepted changes.

## Current Code Map

- \`src/App.tsx:6320-6595\` contains the lifted DOE state and all RSM/GMDH/Taguchi calculations.
- \`src/App.tsx:2349-3210\` contains the production DOE window, data import, model controls, metrics, tables, deployment buttons, and chart configuration.
- \`src/App.tsx:4852-5350\` contains the Plotly chart wrapper and chart-specific calculations.
- \`src/App.tsx:7145-7450\` creates DOE nodes and writes them into V-Lab/X-Bridges workspace state.
- \`src/engine/xbridges/BlockDefinitions.ts:3121-3265\` defines \`DOE_MODEL\` execution for RSM, GMDH, and Taguchi payloads.
- \`src/engine/xbridges/XbridgesEngine.ts:1-55\` synchronizes DOE-connected Laplace blocks.
- \`src/engine/vlab/vlabComponentDefinitions.ts:298-305\` describes \`doe_custom\`; \`src/engine/vlab/vlabEquations.ts:1826-1828\` currently supplies its network equation.
- \`src/components/vlab/VLabWorkspace.tsx:1360-1390,2616-2780\` reads DOE inputs and exports V-Lab data.
- \`src/components/xbridges/XbridgesWorkspace.tsx:1890-1910\` contains DOE/Laplace synchronization behavior.
- \`src/services/aiService.ts\`, \`src/utils/aiActionProcessor.ts\`, and \`src/services/ai/planner/*\` define the existing AI action/planning boundary; the Git workflow must not bypass it with unrestricted file or shell actions.

## Planned File Structure

Create the following focused modules and tests:

- \`src/engine/doe/types.ts\`: canonical input, fit-result, diagnostics, chart-data, and serialized deployment types.
- \`src/engine/doe/statistics.ts\`: validated RSM, GMDH adapter, and Taguchi calculations with stable numeric conventions.
- \`src/engine/doe/statistics.test.ts\`: analytical fixtures, rank-deficient/invalid-input cases, degrees-of-freedom checks, and persistence-compatible snapshots.
- \`src/engine/doe/modelEvaluator.ts\`: safe evaluation of the canonical RSM/GMDH/Taguchi model payload used by both integrations.
- \`src/engine/doe/modelEvaluator.test.ts\`: model parity tests against calculated fits and exported runtime behavior.
- \`src/engine/doe/integration.ts\`: pure conversion from DOE results to X-Bridges and V-Lab node payloads, including ports, units, factor order, and model metadata.
- \`src/engine/doe/integration.test.ts\`: round-trip and cross-module contract tests.
- \`src/components/doe/PlotlyPlots.tsx\`: extracted chart rendering and chart-data preparation from \`App.tsx\`.
- \`src/components/doe/PlotlyPlots.test.tsx\`: chart trace/axis/domain/empty-state tests.
- \`src/components/doe/DOEManager.test.tsx\`: smoke coverage for the standalone DOE surface, or a documented decision to remove the unused scaffold if the production window is canonical.
- \`docs/DOE_VALIDATION.md\`: equations, assumptions, tolerances, model payload schema, graph acceptance criteria, and integration evidence.
- \`.github/workflows/doe-review.yml\`: focused PR checks for DOE unit/integration/UI tests, TypeScript, and build where the repository’s existing CI conventions permit it.

Modify only after the baseline audit:

- \`src/App.tsx\` to delegate calculations, exports, and chart rendering to the focused modules.
- \`src/engine/xbridges/BlockDefinitions.ts\` and \`src/engine/xbridges/XbridgesEngine.ts\` only where canonical DOE payload consumption or synchronization is proven incomplete.
- \`src/engine/vlab/vlabComponentDefinitions.ts\`, \`src/engine/vlab/vlabEquations.ts\`, \`src/engine/vlab/DAEAssembler.ts\`, and relevant V-Lab workspace code only where the DOE block can be made executable without weakening physical-network validation.
- \`src/types/adia.ts\` if the existing \`DOEData\` type is insufficient; replace \`any\` at the module boundary rather than widening it.
- \`package.json\` only for focused scripts and CI commands that are actually used by the plan.

### Task 1: Establish the Git baseline and evidence inventory

**Files:**
- Create: \`docs/superpowers/reviews/2026-09-04-doe-baseline.md\`
- Modify: none

**Interfaces:**
- Produces: a baseline report containing current commit, dirty-file list, test commands, existing DOE fixtures, and each suspected correctness gap with file/line references.

- [ ] **Step 1: Record the baseline without mutating user work.**

Run:

\`\`\`powershell
git status --short
git rev-parse --show-toplevel
git rev-parse HEAD
git diff --stat
git log -8 --oneline
\`\`\`

Expected: the current dirty files are captured verbatim; no existing change is reset or staged.

- [ ] **Step 2: Run the existing focused checks before changes.**

Run:

\`\`\`powershell
npx vitest run src/engine/xbridges/BlockDefinitions.test.ts src/engine/vlab/vlab.test.ts src/components/vlab/VLabWorkspace.test.tsx
npx tsc --noEmit
\`\`\`

Expected: record pass/fail output and classify failures as baseline failures or DOE-related failures.

- [ ] **Step 3: Write the baseline report.**

The report must include a table with these rows: RSM, GMDH, Taguchi, surface/contour, Pareto, residual diagnostics, predicted-vs-actual, X-Bridges export/runtime, V-Lab export/runtime, persistence, and AI/Git workflow. Each row must name the current implementation location, observed evidence, and the test that will become the acceptance gate.

- [ ] **Step 4: Commit only the baseline report on the dedicated branch.**

Run:

\`\`\`powershell
git switch -c codex/doe-module-review
git add docs/superpowers/reviews/2026-09-04-doe-baseline.md
git commit -m "docs: record DOE review baseline"
\`\`\`

Expected: one commit on \`codex/doe-module-review\`; unrelated dirty files remain untouched and unstaged.

### Task 2: Define the canonical DOE model and validation contract

**Files:**
- Create: \`src/engine/doe/types.ts\`
- Create: \`src/engine/doe/integration.ts\`
- Create: \`src/engine/doe/integration.test.ts\`
- Modify: \`src/types/adia.ts\`
- Create: \`docs/DOE_VALIDATION.md\`

**Interfaces:**
- Produces \`DOEInputTable\`, \`DOEModelResult\`, \`DOEDeploymentModel\`, \`createXBridgesDOEBlock(result)\`, and \`createVLabDOEBlock(result)\`.
- \`DOEDeploymentModel\` must preserve \`modelType\`, ordered factor names, response name, factor ranges/levels, coefficients or GMDH layers, Taguchi level means, training-row count, fit metrics, and a schema version.
- Consumers must never reconstruct a model from a display-only equation string when structured coefficients/layers are available.

- [ ] **Step 1: Add failing contract tests.**

Cover these assertions in \`src/engine/doe/integration.test.ts\`:

\`\`\`ts
expect(createXBridgesDOEBlock(result).data.inputs.map(p => p.name)).toEqual(result.factorNames);
expect(createVLabDOEBlock(result).data.ports.filter(p => p.type === 'input').map(p => p.label)).toEqual(result.factorNames);
expect(deployment.schemaVersion).toBe(1);
expect(deployment.factorOrder).toEqual(result.factorNames);
expect(deployment.modelType).toBe('GMDH');
expect(deployment.gmdh?.layers.length).toBeGreaterThan(0);
\`\`\`

Also test that missing response columns, duplicate factor names, non-finite values, and unsupported model types return typed diagnostics instead of a node.

- [ ] **Step 2: Implement the typed schema and pure node factories.**

Use discriminated unions for \`RSM\`, \`GMDH\`, and \`Taguchi\`; include \`diagnostics: DOE diagnostic[]\` in every result. Make factor ordering explicit and ensure X-Bridges and V-Lab factories derive ports from that same order.

- [ ] **Step 3: Add round-trip serialization tests.**

Serialize each model to JSON and parse it back; assert deep equality for coefficients, GMDH neurons/layers, Taguchi levels, response metadata, and metrics. Assert no function values are serialized.

- [ ] **Step 4: Run the focused contract tests and commit.**

Run:

\`\`\`powershell
npx vitest run src/engine/doe/integration.test.ts
git add src/engine/doe/types.ts src/engine/doe/integration.ts src/engine/doe/integration.test.ts src/types/adia.ts docs/DOE_VALIDATION.md
git commit -m "feat: define canonical DOE deployment contract"
\`\`\`

Expected: all integration contract tests pass.

### Task 3: Extract and correct the statistical engine with analytical oracles

**Files:**
- Create: \`src/engine/doe/statistics.ts\`
- Create: \`src/engine/doe/statistics.test.ts\`
- Modify: \`src/App.tsx\`

**Interfaces:**
- Produces pure functions \`fitRSM(input)\`, \`fitGMDH(input)\`, and \`fitTaguchi(input)\` returning \`DOEModelResult\`.
- \`fitRSM\` must expose coded and physical coefficients, predictions, residuals, SSE/SST, R², adjusted R², predicted R² where estimable, model/error degrees of freedom, F statistic, p-value, and rank/conditioning diagnostics.
- \`fitTaguchi\` must declare replicate handling and objective (\`larger\`, \`smaller\`, \`nominal\`, \`target\`) in the result.

- [ ] **Step 1: Add failing analytical fixtures.**

Use exact small datasets with known results:

\`\`\`ts
const linear = [[0, 0], [1, 2], [2, 4], [3, 6]];
expect(fitRSM({ headers: ['X', 'Y'], data: linear }).physicalCoefficients).toEqual(expect.arrayContaining([0, 2]));
\`\`\`

Add a full-rank quadratic fixture with interaction, a constant-response case, a rank-deficient design, non-finite input, insufficient rows, and a replicated Taguchi fixture whose S/N values can be checked by hand for all four objectives. Compare the F survival probability and t critical values against an independently computed oracle with a stated tolerance.

- [ ] **Step 2: Implement input normalization and explicit diagnostics.**

Reject malformed rows, nonnumeric cells, duplicate headers, zero-variance responses, and designs with fewer observations than model terms unless the result explicitly reports that the statistic is not estimable. Do not silently return zero predictions for a failed fit.

- [ ] **Step 3: Implement RSM without display-string round trips.**

Build the coded design matrix, solve least squares, transform coefficients back to physical units through one tested transformation, calculate metrics with correct degrees of freedom, and preserve the coded design metadata for prediction and plotting.

- [ ] **Step 4: Adapt GMDH and Taguchi into the same result shape.**

Preserve the trained GMDH layers and validation settings; compute training and validation metrics separately. Preserve Taguchi trial grouping, replicate counts, S/N objective, factor-level means, deltas, ranks, and optimum prediction without conflating raw response and S/N metrics.

- [ ] **Step 5: Replace the App-local calculations with engine calls.**

Keep the current button behavior and notifications, but make \`calculateRSM\`, \`calculateGMDH\`, and \`calculateTaguchi\` call the pure engine and set the typed result. Remove duplicate statistical formulas only after the extracted tests pass.

- [ ] **Step 6: Run statistics tests and commit.**

Run:

\`\`\`powershell
npx vitest run src/engine/doe/statistics.test.ts
npx tsc --noEmit
git add src/engine/doe/statistics.ts src/engine/doe/statistics.test.ts src/App.tsx
git commit -m "refactor: make DOE statistics deterministic and typed"
\`\`\`

Expected: analytical fixtures pass and TypeScript has no new errors.

### Task 4: Make the graphs mathematically faithful and testable

**Files:**
- Create: \`src/components/doe/PlotlyPlots.tsx\`
- Create: \`src/components/doe/PlotlyPlots.test.tsx\`
- Modify: \`src/App.tsx\`

**Interfaces:**
- \`PlotlyPlots\` consumes \`DOEModelResult\`, normalized \`DOEInputTable\`, selected factor indices, hold values, and plot type; it does not recalculate model statistics.
- Produces finite Plotly traces with labels, units when present, and explicit empty/unsupported states.

- [ ] **Step 1: Add failing chart-data tests.**

Test that surface and contour plots use the selected factor indices and hold all other factors at the selected hold values; predicted-vs-actual includes a 45-degree line spanning the data domain; Pareto effects are sorted by absolute statistic and use the result’s error degrees of freedom; residual diagnostics pair each sorted residual with its own probability; Taguchi plots use the selected S/N or mean metric.

- [ ] **Step 2: Extract chart preparation from \`App.tsx\`.**

Move Plotly trace/layout construction into the focused component. Pass the canonical result through unchanged and remove duplicate inverse-normal, critical-t, and model-prediction calculations from the UI.

- [ ] **Step 3: Fix domain and degenerate-data behavior.**

Handle one-factor data, equal min/max values, empty residuals, constant responses, and missing factor levels by returning a visible diagnostic state and finite axis bounds instead of \`Infinity\`, \`NaN\`, or a misleading graph.

- [ ] **Step 4: Run UI/chart tests and commit.**

Run:

\`\`\`powershell
npx vitest run src/components/doe/PlotlyPlots.test.tsx
npx tsc --noEmit
git add src/components/doe/PlotlyPlots.tsx src/components/doe/PlotlyPlots.test.tsx src/App.tsx
git commit -m "fix: make DOE plots use validated model results"
\`\`\`

Expected: all chart assertions pass and no chart emits non-finite numeric arrays.

### Task 5: Make X-Bridges and V-Lab execute the same DOE model

**Files:**
- Create: \`src/engine/doe/modelEvaluator.ts\`
- Create: \`src/engine/doe/modelEvaluator.test.ts\`
- Modify: \`src/engine/xbridges/BlockDefinitions.ts\`
- Modify: \`src/engine/xbridges/XbridgesEngine.ts\`
- Modify: \`src/engine/vlab/vlabComponentDefinitions.ts\`
- Modify: \`src/engine/vlab/vlabEquations.ts\`
- Modify: \`src/engine/vlab/DAEAssembler.ts\`
- Modify: \`src/components/vlab/VLabWorkspace.tsx\`
- Modify: \`src/App.tsx\`

**Interfaces:**
- \`evaluateDOEModel(model, inputs): number\` is the single constrained evaluator used by both deployment adapters.
- The evaluator returns a typed error for invalid model payloads; callers surface a diagnostic and do not substitute an unrelated sum or silent zero.

- [ ] **Step 1: Add parity tests before changing runtimes.**

For each model type, calculate a result, build both deployment nodes, evaluate the nodes at every training row, and compare outputs with the engine predictions within the documented tolerance. Add tests for negative inputs, zero inputs, Unicode display names, missing GMDH layers, Taguchi level selection, and an equation-injection string that must be rejected.

- [ ] **Step 2: Implement the constrained evaluator.**

Evaluate structured RSM coefficients, GMDH neurons, and Taguchi level means directly. If legacy projects contain only the old display equation, support a narrowly validated compatibility parser with explicit diagnostics; do not use arbitrary \`math.evaluate\` as the primary deployment contract.

- [ ] **Step 3: Update X-Bridges \`DOE_MODEL\`.**

Consume \`DOEDeploymentModel\`, preserve input/output port order, use the shared evaluator, retain Laplace synchronization, and keep legacy payload parsing only behind a tested adapter. Add tests to \`src/engine/xbridges/BlockDefinitions.test.ts\` for all three model types and malformed payload rejection.

- [ ] **Step 4: Update V-Lab DOE execution and connectivity.**

Make \`doe_custom\` carry typed input/output metadata and the serialized model payload. Confirm how the V-Lab signal-side block enters the DAE assembler; if it is a signal block, route it through the existing signal conversion boundary rather than treating it as a conserving physical port. Keep zero-port/catalog validation accurate and add a connected V-Lab fixture proving that a source-to-DOE-to-probe path produces the expected response.

- [ ] **Step 5: Replace App export construction with pure factories.**

Remove inline function injection and \`math.evaluate\` from \`handleExportToXBridges\`/\`handleExportToVLab\`; call \`createXBridgesDOEBlock\` and \`createVLabDOEBlock\`, then retain the existing file/tab insertion behavior.

- [ ] **Step 6: Run integration gates and commit.**

Run:

\`\`\`powershell
npx vitest run src/engine/doe/modelEvaluator.test.ts src/engine/doe/integration.test.ts src/engine/xbridges/BlockDefinitions.test.ts src/engine/vlab/vlab_connected_models.test.ts
npm run test:vlab
npm run test:vlab:connected
npx tsc --noEmit
git add src/engine/doe src/engine/xbridges/BlockDefinitions.ts src/engine/xbridges/XbridgesEngine.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/vlabEquations.ts src/engine/vlab/DAEAssembler.ts src/components/vlab/VLabWorkspace.tsx src/App.tsx
git commit -m "feat: execute canonical DOE models in X-Bridges and V-Lab"
\`\`\`

Expected: DOE-to-runtime parity passes and the existing V-Lab/X-Bridges regression suites remain green.

### Task 6: Unify the DOE UI surface and persistence behavior

**Files:**
- Modify: \`src/components/doe/DOEManager.tsx\`
- Create: \`src/components/doe/DOEManager.test.tsx\`
- Modify: \`src/App.tsx\`
- Modify: \`src/types/adia.ts\`

**Interfaces:**
- The standalone manager and production DOE window either share the same engine and typed state or the standalone manager is removed from active routing with a documented compatibility decision.
- Import/export preserves headers, rows, active model, Taguchi configuration, structured model result, and schema version.

- [ ] **Step 1: Add persistence and UI smoke tests.**

Verify import of a valid CSV/XLSX-shaped matrix, rejection of ragged/non-numeric rows, calculation button state, chart empty state, export disabled before analysis, and save/load round trip for each model type.

- [ ] **Step 2: Connect the manager to the canonical engine.**

Eliminate the scaffold’s independent factor/run state when it is not the active surface; ensure both entry points expose the same model names, diagnostics, and deployment actions.

- [ ] **Step 3: Run persistence/UI checks and commit.**

Run:

\`\`\`powershell
npx vitest run src/components/doe/DOEManager.test.tsx src/utils/jsonImportValidator.test.ts
npx tsc --noEmit
git add src/components/doe/DOEManager.tsx src/components/doe/DOEManager.test.tsx src/App.tsx src/types/adia.ts
git commit -m "refactor: unify DOE UI state and persistence"
\`\`\`

Expected: the DOE state survives save/load without losing structured model data.

### Task 7: Add automated review gates and agent Git protocol

**Files:**
- Create: \`.github/workflows/doe-review.yml\`
- Modify: \`package.json\`
- Modify: \`docs/DOE_VALIDATION.md\`

**Interfaces:**
- Produces npm scripts \`test:doe\` and \`test:doe:integration\` that are runnable locally and in CI.
- The workflow reports unit, integration, UI, TypeScript, and build status on the PR.

- [ ] **Step 1: Add the focused scripts.**

Add scripts with these commands:

\`\`\`json
"test:doe": "vitest run src/engine/doe src/components/doe",
"test:doe:integration": "vitest run src/engine/doe src/engine/xbridges/BlockDefinitions.test.ts src/engine/vlab/vlab_connected_models.test.ts --reporter=verbose"
\`\`\`

- [ ] **Step 2: Add the PR workflow.**

Run on pull requests that touch DOE, X-Bridges, V-Lab, AI, package configuration, or the workflow. Use Node 20, \`npm ci\`, then \`npm run test:doe\`, \`npm run test:doe:integration\`, \`npx tsc --noEmit\`, and \`npm run build\`. Upload the DOE validation report or test output as an artifact when the runner supports it.

- [ ] **Step 3: Document the agent’s Git behavior.**

The agent must: create/use \`codex/doe-module-review\`; make one focused commit per task; never commit secrets; push only that branch; open a PR against the current default branch; include the baseline, test commands, changed files, known limitations, and a checklist of mathematical/graph/integration evidence; pause after opening the PR for review. The agent must not merge, force-push, or rewrite unrelated user commits.

- [ ] **Step 4: Run the full local release gate and commit.**

Run:

\`\`\`powershell
npm run test:doe
npm run test:doe:integration
npm run test:vlab
npx tsc --noEmit
npm run build
git add .github/workflows/doe-review.yml package.json docs/DOE_VALIDATION.md
git commit -m "ci: add DOE correctness and integration review gates"
\`\`\`

Expected: all required local gates pass before the PR is opened or updated.

### Task 8: GitHub review, feedback, and explicit confirmation gate

**Files:**
- Modify: \`docs/superpowers/reviews/2026-09-04-doe-baseline.md\`
- Create: \`docs/superpowers/reviews/2026-09-04-doe-pr-review.md\`

**Interfaces:**
- Produces: a PR URL, CI evidence, review findings categorized by severity, a response commit for each accepted finding, and a final confirmation record.

- [ ] **Step 1: Open the PR after all local gates pass.**

Use a PR title such as \`review: validate DOE mathematics and X-Bridges/V-Lab integration\`. The body must link \`docs/DOE_VALIDATION.md\`, summarize the canonical model contract, list exact test commands and results, identify any intentionally unsupported legacy payloads, and state that merge is blocked pending review.

- [ ] **Step 2: Perform the review from the PR diff and CI evidence.**

Review in this order: numerical correctness and tolerances; model payload completeness; graph trace inputs/domains; X-Bridges execution parity; V-Lab signal/physical-port semantics; persistence/migrations; security of model evaluation; regression impact. Record each finding with file/line, severity P0-P3, evidence, and a concrete requested change. Do not approve based on green CI if a correctness finding remains.

- [ ] **Step 3: Send feedback to the agent and wait for its response.**

The agent applies only in-scope feedback, adds or updates a regression test for every accepted correctness finding, reruns the affected gates, pushes a new commit, and replies in the PR with a mapping from finding to commit/test. Re-review the updated diff rather than trusting the agent’s summary.

- [ ] **Step 4: Request explicit user confirmation before confirmation/merge.**

Present the user with: PR URL, changed-file summary, remaining limitations, CI status, review findings and resolutions, and whether any findings were declined. Stop at this gate until the user explicitly confirms the final change set. No merge or “confirmed” status is allowed before that response.

- [ ] **Step 5: Record the final review outcome.**

Write \`docs/superpowers/reviews/2026-09-04-doe-pr-review.md\` with the final commit SHA, CI run links, review findings, resolution commits, user confirmation, and the exact post-confirmation action taken. If the user declines confirmation, leave the PR open with the outstanding findings clearly recorded.

## Definition of Done

- RSM, GMDH, and Taguchi calculations pass analytical fixtures and report honest diagnostics for non-estimable designs.
- All supported graphs are driven by validated result data, use correct factor/hold-value domains, and never emit non-finite or mismatched trace arrays.
- X-Bridges and V-Lab execute the same structured DOE model as the analyzer for every supported model type, with tested port order and signal semantics.
- Save/load preserves the structured model contract and legacy files have explicit compatibility diagnostics.
- Focused and regression tests, TypeScript, and build pass locally and in the PR workflow.
- The agent has committed on \`codex/doe-module-review\`, opened a GitHub PR, received and addressed review feedback, and stopped for explicit user confirmation before any merge or final confirmation.

## Self-Review Checklist

- [ ] Every requested area is covered: mathematical model, graphs, X-Bridges connection, V-Lab connection, Git-based agent work, GitHub review, feedback, and confirmation.
- [ ] No task depends on an untyped display equation when a structured model is available.
- [ ] Every likely integration regression has a named test location and command.
- [ ] The plan preserves the current dirty worktree and keeps merge/confirmation behind an explicit user gate.

