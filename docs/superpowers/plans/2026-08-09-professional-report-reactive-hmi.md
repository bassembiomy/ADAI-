# Professional Report and Reactive HMI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a formal, print-ready engineering report and a professional reactive HMI with configurable pinned telemetry, readable charts, SysML diagrams, and state-machine evidence.

**Architecture:** Extract report generation and HMI behavior from `src/App.tsx` into focused feature modules. Pure derivation modules create factual view models and chart data; React components render the configuration and runtime experiences; a self-contained HTML composer renders print-safe report content and the embedded dark HMI without mutating project models.

**Tech Stack:** React 18, TypeScript 5, Tailwind CSS, Recharts 2, DOMPurify, Vitest 4, existing ADIA SysML and state-machine types/runtime.

## Global Constraints

- Preserve existing project-file and `hmiComponents` compatibility.
- Keep requirements, SysML, state-machine, X-Bridges, HMI, and telemetry models authoritative; presentation code must not mutate or fabricate them.
- Keep generated project evidence self-contained and usable without network resources.
- Use a formal light report theme and the approved dark cyan operations-console theme for the workspace and embedded HMI.
- Include telemetry charts only when samples exist; render an explicit no-samples statement otherwise.
- Keep chart quantities, units, axes, legends, thresholds, and difficult-domain handling readable on screen and in print.
- Use deterministic section numbering and deterministic automatic signal selection.
- Retain semantic-analysis failure states as unavailable evidence, never as passing evidence.
- Do not add a new runtime dependency.

---

## File Structure

- `src/features/hmi/types.ts`: persisted HMI component and presentation contracts.
- `src/features/hmi/signalSelection.ts`: deterministic pinned-signal normalization and defaults.
- `src/features/hmi/telemetryHistory.ts`: bounded immutable telemetry history updates.
- `src/features/hmi/HmiTrendChart.tsx`: responsive, accessible Recharts telemetry view.
- `src/features/hmi/HmiDashboard.tsx`: professional Edit/Run workspace shell and existing widget canvas behavior.
- `src/features/reporting/types.ts`: report metadata, section, source, warning, metric, and view-model contracts.
- `src/features/reporting/reportMetrics.ts`: factual engineering summary derivation.
- `src/features/reporting/reportCharts.ts`: print-safe static SVG chart rendering and numeric-domain helpers.
- `src/features/reporting/reportDiagrams.ts`: extracted SysML, state-machine, X-Bridges, and HMI SVG rendering.
- `src/features/reporting/reportTheme.ts`: self-contained document and print CSS.
- `src/features/reporting/buildProjectReport.ts`: deterministic report section composition and embedded simulator HTML.
- `src/features/reporting/ReportConfigurationDialog.tsx`: validated metadata and section-selection UI.
- `src/features/reporting/GlobalReportPreviewModal.tsx`: safe preview and HTML/Word/print actions.
- `src/App.tsx`: imports the new modules, owns authoritative project state, and passes a `ProjectReportSource` snapshot.

---

### Task 1: Persisted HMI Contracts and Backward Compatibility

**Files:**
- Create: `src/features/hmi/types.ts`
- Modify: `src/types/sm_types.ts:8-15`
- Modify: `src/App.tsx:375-420`
- Modify: `src/App.tsx:7010-7035`
- Modify: `src/App.tsx:7140-7160`
- Test: `src/features/hmi/types.test.ts`

**Interfaces:**
- Produces: `HmiComponent`, `HmiPresentationSettings`, `normalizeHmiPresentationSettings(value)`.
- Consumes: `VariableDef` from `src/types/sm_types.ts`.

- [ ] **Step 1: Write the failing compatibility tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeHmiPresentationSettings } from './types';

describe('normalizeHmiPresentationSettings', () => {
  it('loads an old project with no presentation settings', () => {
    expect(normalizeHmiPresentationSettings(undefined)).toEqual({
      pinnedSignalIds: [],
      historyWindowSeconds: 60,
      sampleLimit: 600,
    });
  });

  it('removes duplicate and malformed persisted pins', () => {
    expect(normalizeHmiPresentationSettings({
      pinnedSignalIds: ['temp', 'temp', '', 4],
      historyWindowSeconds: -2,
      sampleLimit: 99999,
    })).toEqual({ pinnedSignalIds: ['temp'], historyWindowSeconds: 60, sampleLimit: 5000 });
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/features/hmi/types.test.ts`

Expected: FAIL because `./types` does not exist.

- [ ] **Step 3: Add the persisted contracts and normalizer**

```ts
export type HmiComponentType =
  | 'toggle' | 'button' | 'slider' | 'input' | 'lamp' | 'led' | 'lcd'
  | 'gauge' | 'rotary' | 'hybrid-rotary' | 'buzzer' | 'oled'
  | 'encoder' | 'mode-selector' | 'mode-icon';

export interface HmiPresentationSettings {
  pinnedSignalIds: string[];
  historyWindowSeconds: number;
  sampleLimit: number;
}

export interface HmiComponent {
  id: string;
  type: HmiComponentType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variableId: string | null;
  min?: number;
  max?: number;
  variableIds?: string[];
  hybridValues?: string[];
  soundType?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  icon?: 'none' | 'power' | 'play' | 'light';
  color?: 'orange' | 'green' | 'red' | 'blue' | 'yellow' | 'grey';
  cursorVariableId?: string | null;
  pressVariableId?: string | null;
  oledModeVarId?: string | null;
  oledTempVarId?: string | null;
  oledTimeVarId?: string | null;
  oledStateVarId?: string | null;
  oledSteamVarId?: string | null;
  oledHeatVarId?: string | null;
  oledFanVarId?: string | null;
  oledLightVarId?: string | null;
  oledDuoVarId?: string | null;
  oledProgressVarId?: string | null;
  iconEmoji?: string;
  targetValue?: string;
  oledModeNames?: string;
  oledIndicatorEmojis?: string[];
  oledIndicatorVarIds?: (string | null)[];
  oledIndicatorLabels?: string[];
  oledTitle?: string;
  encoderValues?: string[];
}

export function normalizeHmiPresentationSettings(value: unknown): HmiPresentationSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const pins = Array.isArray(input.pinnedSignalIds)
    ? [...new Set(input.pinnedSignalIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  const historyWindowSeconds = typeof input.historyWindowSeconds === 'number' && input.historyWindowSeconds > 0
    ? Math.min(3600, input.historyWindowSeconds) : 60;
  const sampleLimit = typeof input.sampleLimit === 'number' && input.sampleLimit > 0
    ? Math.min(5000, Math.round(input.sampleLimit)) : 600;
  return { pinnedSignalIds: pins, historyWindowSeconds, sampleLimit };
}
```

Remove the local HMI interfaces from `App.tsx`, import these contracts, persist `hmiPresentationSettings` beside `hmiComponents`, and normalize it during hydration.

Add `unit?: string` to `VariableDef`. This is optional for backward compatibility; charts display `Unitless` when it is absent and never infer a unit from a variable name.

- [ ] **Step 4: Run compatibility and type checks**

Run: `npx vitest run src/features/hmi/types.test.ts && npx tsc --noEmit`

Expected: both commands PASS; old project payloads without settings load defaults.

- [ ] **Step 5: Commit**

```bash
git add src/features/hmi/types.ts src/features/hmi/types.test.ts src/types/sm_types.ts src/App.tsx
git commit -m "refactor(hmi): add compatible presentation contracts"
```

### Task 2: Pinned Signal Selection and Bounded Telemetry

**Files:**
- Create: `src/features/hmi/signalSelection.ts`
- Create: `src/features/hmi/telemetryHistory.ts`
- Test: `src/features/hmi/signalSelection.test.ts`
- Test: `src/features/hmi/telemetryHistory.test.ts`

**Interfaces:**
- Consumes: `HmiComponent`, `VariableDef`, `HmiPresentationSettings`.
- Produces: `resolvePinnedSignalIds`, `appendTelemetryFrame`, `TelemetryPoint`, `TelemetryHistory`.

- [ ] **Step 1: Write failing deterministic-selection tests**

```ts
it('keeps valid explicit numeric pins in persisted order', () => {
  expect(resolvePinnedSignalIds(['rpm', 'enabled', 'missing'], variables, components, 4))
    .toEqual(['rpm']);
});

it('defaults to bound numeric variables before other numeric variables', () => {
  expect(resolvePinnedSignalIds([], variables, [{ variableId: 'temp' } as HmiComponent], 3))
    .toEqual(['temp', 'rpm']);
});
```

- [ ] **Step 2: Write failing history edge-case tests**

```ts
it('drops non-finite values and trims the oldest frame', () => {
  const first = appendTelemetryFrame({}, 1000, { temp: 20, bad: Number.NaN }, 2);
  const second = appendTelemetryFrame(first, 2000, { temp: 21 }, 2);
  const third = appendTelemetryFrame(second, 3000, { temp: 22 }, 2);
  expect(third.temp).toEqual([{ timestampMs: 2000, value: 21 }, { timestampMs: 3000, value: 22 }]);
  expect(third.bad).toBeUndefined();
});
```

- [ ] **Step 3: Run both tests to verify missing exports**

Run: `npx vitest run src/features/hmi/signalSelection.test.ts src/features/hmi/telemetryHistory.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement the pure selection and history functions**

```ts
const NUMERIC_TYPES = new Set(['int', 'uint', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'float', 'single', 'double']);

export function resolvePinnedSignalIds(
  persistedIds: string[], variables: VariableDef[], components: Pick<HmiComponent, 'variableId'>[], limit = 6,
): string[] {
  const numericIds = new Set(variables.filter(v => NUMERIC_TYPES.has(v.type)).map(v => v.id));
  const explicit = [...new Set(persistedIds)].filter(id => numericIds.has(id));
  if (explicit.length > 0) return explicit.slice(0, limit);
  const bound = components.map(c => c.variableId).filter((id): id is string => !!id && numericIds.has(id));
  const fallback = variables.filter(v => numericIds.has(v.id)).map(v => v.id);
  return [...new Set([...bound, ...fallback])].slice(0, limit);
}

export interface TelemetryPoint { timestampMs: number; value: number }
export type TelemetryHistory = Record<string, TelemetryPoint[]>;

export function appendTelemetryFrame(
  history: TelemetryHistory, timestampMs: number, values: Record<string, unknown>, sampleLimit: number,
): TelemetryHistory {
  const next = { ...history };
  for (const [id, raw] of Object.entries(values)) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    next[id] = [...(history[id] ?? []), { timestampMs, value }].slice(-sampleLimit);
  }
  return next;
}
```

- [ ] **Step 5: Run the focused tests**

Run: `npx vitest run src/features/hmi/signalSelection.test.ts src/features/hmi/telemetryHistory.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/hmi/signalSelection.ts src/features/hmi/signalSelection.test.ts src/features/hmi/telemetryHistory.ts src/features/hmi/telemetryHistory.test.ts
git commit -m "feat(hmi): add pinned signal telemetry model"
```

### Task 3: Professional Telemetry Chart

**Files:**
- Create: `src/features/hmi/HmiTrendChart.tsx`
- Test: `src/features/hmi/HmiTrendChart.test.tsx`

**Interfaces:**
- Consumes: `TelemetryHistory`, selected `VariableDef[]`, `historyWindowSeconds`, optional thresholds.
- Produces: `HmiTrendChart` and exported `buildAlignedChartRows` for pure tests.

- [ ] **Step 1: Write failing row-alignment and markup tests**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';

it('aligns samples by timestamp without inventing values', () => {
  expect(buildAlignedChartRows({
    temp: [{ timestampMs: 1000, value: 20 }],
    rpm: [{ timestampMs: 2000, value: 800 }],
  }, ['temp', 'rpm'])).toEqual([
    { timestampMs: 1000, temp: 20 },
    { timestampMs: 2000, rpm: 800 },
  ]);
});

it('renders an explicit no-samples state', () => {
  const html = renderToStaticMarkup(<HmiTrendChart history={{}} variables={[]} signalIds={[]} historyWindowSeconds={60} />);
  expect(html).toContain('No runtime samples recorded');
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/features/hmi/HmiTrendChart.test.tsx`

Expected: FAIL because the chart module is missing.

- [ ] **Step 3: Implement chart data alignment and the operations-console chart**

Use `ResponsiveContainer`, `LineChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `Line`, and `ReferenceLine` from Recharts. Render one `<Line connectNulls={false}>` per signal, show the unit in the legend label, use cyan/amber/green/purple stable series colors, format time relative to the newest point, and render `aria-label="Pinned telemetry trends"` on the chart region.

```ts
export function buildAlignedChartRows(history: TelemetryHistory, signalIds: string[]) {
  const rows = new Map<number, Record<string, number>>();
  for (const id of signalIds) {
    for (const point of history[id] ?? []) {
      rows.set(point.timestampMs, { ...(rows.get(point.timestampMs) ?? {}), timestampMs: point.timestampMs, [id]: point.value });
    }
  }
  return [...rows.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}
```

- [ ] **Step 4: Run the chart test and type check**

Run: `npx vitest run src/features/hmi/HmiTrendChart.test.tsx && npx tsc --noEmit`

Expected: PASS with no Recharts prop errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/hmi/HmiTrendChart.tsx src/features/hmi/HmiTrendChart.test.tsx
git commit -m "feat(hmi): add professional pinned telemetry chart"
```

### Task 4: Extract and Redesign the HMI Workspace

**Files:**
- Create: `src/features/hmi/HmiDashboard.tsx`
- Modify: `src/App.tsx:3353-4186`
- Modify: `src/App.tsx:6830-6845`
- Modify: `src/App.tsx:8360-8380`
- Modify: `src/App.tsx:17440-17458`
- Test: `src/features/hmi/HmiDashboard.test.tsx`

**Interfaces:**
- Consumes: `variables`, `components`, `presentationSettings`, `runtimeStatus`, `updateVariable`, and state setters owned by `App`.
- Produces: `HmiDashboard` and `HmiRuntimeStatus`.

- [ ] **Step 1: Write a failing server-render smoke test**

```tsx
it('renders the operations shell and separates Edit from Run mode', () => {
  const html = renderToStaticMarkup(<HmiDashboard
    variables={[]}
    components={[]}
    presentationSettings={{ pinnedSignalIds: [], historyWindowSeconds: 60, sampleLimit: 600 }}
    setPresentationSettings={() => undefined}
    setComponents={() => undefined}
    updateVariable={() => undefined}
    runtimeStatus={{ state: 'paused', sampleRateHz: 10 }}
    onClose={() => undefined}
  />);
  expect(html).toContain('ADIA · Operations HMI');
  expect(html).toContain('Edit layout');
  expect(html).toContain('No HMI components configured');
});
```

- [ ] **Step 2: Run the smoke test to verify failure**

Run: `npx vitest run src/features/hmi/HmiDashboard.test.tsx`

Expected: FAIL because `HmiDashboard` is missing.

- [ ] **Step 3: Move the existing widget canvas without changing widget semantics**

Move `HmiDashboardContent`, its add/drag/resize/property behavior, and HMI-only helper components from `App.tsx` into `HmiDashboard.tsx`. Keep the existing `updateVariable` calls and widget rendering behavior unchanged during the extraction.

- [ ] **Step 4: Add the approved workspace shell and telemetry controls**

Add a dark `#071018` shell with restrained cyan borders, explicit Edit/Run buttons, runtime state/sample rate, component palette, pinned-signal checklist, `HmiTrendChart`, and inspector. Append telemetry frames from current numeric variable values at the simulation tick rate, bounded by `sampleLimit`; clear history on project hydration and simulation reset. Hide selection handles and property editing in Run mode.

- [ ] **Step 5: Run focused and existing HMI-adjacent tests**

Run: `npx vitest run src/features/hmi/*.test.ts src/features/hmi/*.test.tsx src/components/ScopePanel.test.tsx && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/hmi src/App.tsx
git commit -m "feat(hmi): deliver professional reactive workspace"
```

### Task 5: Report Contracts and Factual Engineering Metrics

**Files:**
- Create: `src/features/reporting/types.ts`
- Create: `src/features/reporting/reportMetrics.ts`
- Create: `src/features/reporting/__fixtures__/professionalProject.ts`
- Test: `src/features/reporting/reportMetrics.test.ts`

**Interfaces:**
- Consumes: structural snapshots of the authoritative App models.
- Produces: `ProjectReportSource`, `ReportMetadata`, `ReportSectionId`, `ReportViewModel`, `buildReportViewModel`.

- [ ] **Step 1: Write failing factual-derivation tests**

```ts
it('derives summaries without mutating source data', () => {
  const source = projectReportFixture();
  const before = JSON.stringify(source);
  const model = buildReportViewModel(source, metadataFixture(), DEFAULT_REPORT_SECTIONS);
  expect(model.metrics.requirements.total).toBe(3);
  expect(model.metrics.stateMachine.transitions).toBe(2);
  expect(model.metrics.hmi.boundComponents).toBe(1);
  expect(JSON.stringify(source)).toBe(before);
});

it('marks failed semantic analysis as unavailable evidence', () => {
  const model = buildReportViewModel(invalidStateMachineFixture(), metadataFixture(), ['state-machine']);
  expect(model.stateMachineAnalysis.status).toBe('unavailable');
  expect(model.stateMachineAnalysis.issues.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test to verify missing modules**

Run: `npx vitest run src/features/reporting/reportMetrics.test.ts`

Expected: FAIL because reporting contracts are missing.

- [ ] **Step 3: Define explicit report contracts**

```ts
export type ReportSectionId = 'executive' | 'requirements' | 'bdd' | 'ibd' | 'state-machine' | 'xbridges' | 'hmi' | 'prototype' | 'verification' | 'appendix';

export const DEFAULT_REPORT_SECTIONS: ReportSectionId[] = [
  'executive', 'requirements', 'bdd', 'ibd', 'state-machine',
  'xbridges', 'hmi', 'prototype', 'verification', 'appendix',
];

export interface ReportMetadata {
  projectName: string;
  author: string;
  revision: string;
  documentId?: string;
  generatedAtIso: string;
}

export interface ReportSectionAvailability {
  id: ReportSectionId;
  label: string;
  available: boolean;
  count: number;
}

export interface ReportWarning {
  code: 'BROKEN_REF' | 'INVALID_SAMPLE' | 'ANALYSIS_UNAVAILABLE';
  message: string;
  section?: ReportSectionId;
}

export interface ReportViewModel {
  metadata: ReportMetadata;
  sections: ReportSectionId[];
  source: ProjectReportSource;
  availability: ReportSectionAvailability[];
  metrics: {
    requirements: { total: number; verified: number; coveragePercent: number };
    sysml: { blocks: number; relationships: number; parts: number; ports: number; connectors: number };
    stateMachine: { states: number; transitions: number; junctions: number; layers: number };
    hmi: { components: number; boundComponents: number };
    xbridges: { nodes: number; edges: number };
  };
  stateMachineAnalysis: { status: 'available' | 'unavailable'; issues: string[] };
  warnings: ReportWarning[];
}

export interface ProjectReportSource {
  blocks: readonly ReportBlock[];
  relationships: readonly ReportRelationship[];
  parts: readonly ReportPart[];
  connectors: readonly ReportConnector[];
  states: readonly StateData[];
  junctions: readonly JunctionData[];
  transitions: readonly TransitionData[];
  layers: readonly Layer[];
  variables: readonly VariableDef[];
  hmiComponents: readonly HmiComponent[];
  hmiSettings: HmiPresentationSettings;
  xbridgesNodes: readonly unknown[];
  xbridgesEdges: readonly unknown[];
  tickMs: number;
  safetyMode: boolean;
  telemetry: TelemetryHistory;
}

export interface ReportPort {
  id: string;
  name: string;
  type: string;
  kind?: 'standard' | 'flow' | 'proxy';
  direction?: 'in' | 'out' | 'inout';
  unit?: string;
}

export interface ReportBlock {
  id: string;
  name: string;
  stereotype: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: ReportPort[];
  reqId?: string;
  description?: string;
  status?: string;
  priority?: string;
  risk?: string;
  verificationMethod?: string;
  assignedTo?: string;
  ibdX?: number;
  ibdY?: number;
  ibdWidth?: number;
  ibdHeight?: number;
}

export interface ReportRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export interface ReportPart {
  id: string;
  name: string;
  blockId: string | null;
  typeId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  multiplicity?: string;
}

export interface ReportConnector {
  id: string;
  sourcePartId: string;
  sourcePortId: string;
  targetPartId: string;
  targetPortId: string;
  itemFlow?: string;
  label?: string;
}
```

Add reusable typed fixtures so every later test refers to defined data:

```ts
export const metadataFixture = (): ReportMetadata => ({
  projectName: 'Thermal Control', author: 'Systems Engineering', revision: '1.0',
  documentId: 'ADIA-TR-024', generatedAtIso: '2026-08-09T00:00:00.000Z',
});

export const projectReportFixture = (): ProjectReportSource => ({
  blocks: [
    { id: 'req-1', name: 'Limit temperature', stereotype: 'requirement', reqId: 'REQ-001', status: 'verified', x: 0, y: 0, width: 160, height: 80, ports: [] },
    { id: 'req-2', name: 'Control fan', stereotype: 'requirement', reqId: 'REQ-002', status: 'verified', x: 0, y: 120, width: 160, height: 80, ports: [] },
    { id: 'req-3', name: 'Detect overheat', stereotype: 'requirement', reqId: 'REQ-003', status: 'open', x: 0, y: 240, width: 160, height: 80, ports: [] },
  ],
  relationships: [], parts: [], connectors: [],
  states: [{ id: 'idle', name: 'Idle' }, { id: 'heat', name: 'Heating' }] as StateData[],
  junctions: [],
  transitions: [{ id: 't1', sourceId: 'idle', targetId: 'heat' }, { id: 't2', sourceId: 'heat', targetId: 'idle' }] as TransitionData[],
  layers: [{ id: 'root', name: 'Root Region' }] as Layer[],
  variables: [{ id: 'temp', name: 'temperature', type: 'float', currentValue: 20, unit: '°C' }] as VariableDef[],
  hmiComponents: [{ id: 'lcd-1', type: 'lcd', name: 'Temperature', x: 0, y: 0, width: 120, height: 60, variableId: 'temp' }],
  hmiSettings: { pinnedSignalIds: ['temp'], historyWindowSeconds: 60, sampleLimit: 600 },
  xbridgesNodes: [], xbridgesEdges: [], tickMs: 100, safetyMode: false,
  telemetry: { temp: [{ timestampMs: 1000, value: 20 }, { timestampMs: 2000, value: 21 }] },
});

export const invalidStateMachineFixture = (): ProjectReportSource => ({
  ...projectReportFixture(), layers: [], states: [], transitions: [],
});
```

Also export `stateMachineDiagramFixture`, `ibdFixture`, `availabilityFixture`, `reportFixture`, `invalidSemanticReportFixture`, and `professionalProjectFixture` from this file. Each is built from `projectReportFixture()` and changes only the fields named by the helper, so later tests share one typed source of truth.

- [ ] **Step 4: Implement immutable metric derivation**

Build totals, status/severity distributions, binding completeness, diagram availability, section availability, and semantic-analysis status. Reuse `analyzeStateMachine` rather than reimplementing state-machine semantics.

- [ ] **Step 5: Run the reporting metric tests**

Run: `npx vitest run src/features/reporting/reportMetrics.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/reporting/types.ts src/features/reporting/reportMetrics.ts src/features/reporting/reportMetrics.test.ts src/features/reporting/__fixtures__/professionalProject.ts
git commit -m "feat(report): derive factual engineering view model"
```

### Task 6: Professional Report Configuration UI

**Files:**
- Create: `src/features/reporting/ReportConfigurationDialog.tsx`
- Test: `src/features/reporting/ReportConfigurationDialog.test.tsx`
- Modify: `src/App.tsx:4188-4220`
- Modify: `src/App.tsx:17231-17238`

**Interfaces:**
- Consumes: `ReportSectionAvailability`, initial project name, and `onGenerate(metadata, sectionIds)`.
- Produces: `validateReportMetadata`, `ReportConfigurationDialog`.

- [ ] **Step 1: Write failing validation and structural tests**

```tsx
it('rejects whitespace-only required metadata', () => {
  expect(validateReportMetadata({ projectName: ' ', author: '', revision: '1.0', generatedAtIso: '2026-08-09T00:00:00Z' }))
    .toEqual({ projectName: 'Project name is required.', author: 'Responsible engineer is required.' });
});

it('renders formal metadata and section controls', () => {
  const html = renderToStaticMarkup(<ReportConfigurationDialog
    open
    initialProjectName="Thermal Control"
    availability={availabilityFixture()}
    onClose={() => undefined}
    onGenerate={() => undefined}
  />);
  expect(html).toContain('Engineering report configuration');
  expect(html).toContain('Document revision');
  expect(html).toContain('State machines');
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/features/reporting/ReportConfigurationDialog.test.tsx`

Expected: FAIL because the dialog is missing.

- [ ] **Step 3: Implement validation and the configuration panel**

Use controlled inputs for project name, author, revision, and document ID; render the generated date read-only; render all section choices with availability/count text; default-select every available section plus `executive`; keep form state after validation errors; submit only trimmed metadata and selected section IDs.

- [ ] **Step 4: Replace the local `ReportDialog` and run tests**

Run: `npx vitest run src/features/reporting/ReportConfigurationDialog.test.tsx && npx tsc --noEmit`

Expected: PASS and no duplicate `ReportDialog` remains in `App.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/ReportConfigurationDialog.tsx src/features/reporting/ReportConfigurationDialog.test.tsx src/App.tsx
git commit -m "feat(report): add professional configuration workflow"
```

### Task 7: Print-Safe Charts and Engineering Diagrams

**Files:**
- Create: `src/features/reporting/reportCharts.ts`
- Create: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportCharts.test.ts`
- Test: `src/features/reporting/reportDiagrams.test.ts`
- Modify: `src/App.tsx:10750-11940`

**Interfaces:**
- Consumes: `ReportViewModel` and individual diagram inputs.
- Produces: `computeNumericDomain`, `renderDistributionChart`, `renderTelemetryChart`, `renderRequirementsDiagram`, `renderBddDiagram`, `renderIbdDiagram`, `renderStateMachineDiagrams`, `renderXbridgesDiagram`, `renderHmiDiagram`.

- [ ] **Step 1: Write failing chart-domain and no-data tests**

```ts
expect(computeNumericDomain([])).toEqual([0, 1]);
expect(computeNumericDomain([5])).toEqual([4.5, 5.5]);
expect(computeNumericDomain([3, 3])).toEqual([2.7, 3.3]);
expect(renderTelemetryChart([], [])).toContain('No runtime samples recorded');
```

- [ ] **Step 2: Write failing diagram readability tests**

```ts
it('splits state-machine output by layer and preserves guards', () => {
  const html = renderStateMachineDiagrams(stateMachineDiagramFixture());
  expect(html).toContain('Root Region');
  expect(html).toContain('Safety Region');
  expect(html).toContain('[temperature &gt; limit]');
  expect(html).toContain('figure-caption');
});

it('renders IBD context, ports, and connector labels', () => {
  const html = renderIbdDiagram(ibdFixture());
  expect(html).toContain('Controller IBD');
  expect(html).toContain('sensorIn');
  expect(html).toContain('temperatureSignal');
});
```

- [ ] **Step 3: Run focused tests to verify failure**

Run: `npx vitest run src/features/reporting/reportCharts.test.ts src/features/reporting/reportDiagrams.test.ts`

Expected: FAIL because both renderers are missing.

- [ ] **Step 4: Extract and harden diagram rendering**

Move report-only auto-layout and SVG generation out of `handleGenerateReport`. Deep-copy input arrays, escape every user-facing label, retain existing edge and node semantics, split state machines by layer, split oversized diagrams by semantic group at a maximum of 20 nodes per view, and add captions, legends, element counts, and stable view IDs. Keep independent display coordinates.

- [ ] **Step 5: Implement static chart SVGs**

Render summary distributions as directly labeled horizontal bars and telemetry as labeled line plots. Filter non-finite samples, compute padded domains, retain units, use cyan/amber/green plus shape or text labels, and return a formal no-data block when no samples exist.

- [ ] **Step 6: Run the diagram/chart tests and injection regression**

Run: `npx vitest run src/features/reporting/reportCharts.test.ts src/features/reporting/reportDiagrams.test.ts src/utils/stateMachine/smInlineScriptSerialization.test.ts`

Expected: PASS; fixtures containing `<script>` appear escaped in output.

- [ ] **Step 7: Commit**

```bash
git add src/features/reporting/reportCharts.ts src/features/reporting/reportCharts.test.ts src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.test.ts src/App.tsx
git commit -m "feat(report): render readable charts and engineering diagrams"
```

### Task 8: Self-Contained Report Composer and Embedded HMI

**Files:**
- Create: `src/features/reporting/reportTheme.ts`
- Create: `src/features/reporting/buildProjectReport.ts`
- Test: `src/features/reporting/buildProjectReport.test.ts`
- Modify: `src/App.tsx:10724-13090`

**Interfaces:**
- Consumes: `ReportViewModel`, selected sections, `STATE_MACHINE_RUNTIME_BUNDLE`, and existing inline-script serialization.
- Produces: `buildProjectReport(model): { html: string; projectName: string; warnings: ReportWarning[] }`.

- [ ] **Step 1: Write failing composition tests**

```ts
it('numbers only selected sections without gaps', () => {
  const result = buildProjectReport(reportFixture({ sections: ['executive', 'state-machine', 'hmi'] }));
  expect(result.html).toContain('1. Executive engineering summary');
  expect(result.html).toContain('2. State-machine design and analysis');
  expect(result.html).toContain('3. HMI design');
  expect(result.html).not.toContain('4.');
});

it('is self-contained and distinguishes unavailable evidence', () => {
  const result = buildProjectReport(invalidSemanticReportFixture());
  expect(result.html).not.toMatch(/https?:\/\//);
  expect(result.html).toContain('Semantic analysis unavailable');
  expect(result.html).not.toContain('No structurally detected deadlocks');
});
```

- [ ] **Step 2: Run the composer test to verify failure**

Run: `npx vitest run src/features/reporting/buildProjectReport.test.ts`

Expected: FAIL because the composer is missing.

- [ ] **Step 3: Implement formal document and print CSS**

Export `REPORT_DOCUMENT_CSS` with A4-friendly light colors, document-control header, table of contents, metric grid, quiet tables, diagram/chart figure rules, major-section page breaks, `break-inside: avoid`, repeating table headers, and `@media print` rules that hide `.interactive-only` controls while keeping `.hmi-console` dark and bounded.

- [ ] **Step 4: Compose deterministic report sections**

Create an ordered section registry keyed by `ReportSectionId`. Filter it by selected IDs, assign numbers after filtering, and render cover/document control, executive metrics, requirements, BDD, IBD, state-machine analysis, X-Bridges, HMI inventory, prototype, verification, and appendix through the extracted renderers.

- [ ] **Step 5: Move and restyle the embedded simulator**

Move the current simulator HTML/JS from `handleGenerateReport`. Preserve migrated semantic runtime behavior and event logging. Apply the dark operations-console classes, render selected pinned-signal containers, initialize telemetry history empty, append runtime samples on each step, and show `No runtime samples recorded` before the first sample. Keep all model JSON serialized through `serializeInlineScriptJson`.

- [ ] **Step 6: Run composer, semantic-report, and runtime tests**

Run: `npx vitest run src/features/reporting/buildProjectReport.test.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smStandaloneRuntime.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/reporting/reportTheme.ts src/features/reporting/buildProjectReport.ts src/features/reporting/buildProjectReport.test.ts src/App.tsx
git commit -m "feat(report): compose formal self-contained engineering report"
```

### Task 9: Safe Preview, Export, and App Integration

**Files:**
- Create: `src/features/reporting/GlobalReportPreviewModal.tsx`
- Test: `src/features/reporting/GlobalReportPreviewModal.test.tsx`
- Modify: `src/App.tsx:5992-6150`
- Modify: `src/App.tsx:6598-6602`
- Modify: `src/App.tsx:10724-13090`
- Modify: `src/App.tsx:14611-14618`

**Interfaces:**
- Consumes: `{ html, projectName, warnings }` from `buildProjectReport`.
- Produces: a sanitized screen preview, raw self-contained HTML download, Word export, and browser/Electron print action.

- [ ] **Step 1: Write failing preview policy tests**

```tsx
it('renders warnings and explicit export actions', () => {
  const html = renderToStaticMarkup(<GlobalReportPreviewModal
    isOpen
    onClose={() => undefined}
    reportData={{ projectName: 'Thermal', html: '<h1>Thermal</h1>', warnings: [{ code: 'BROKEN_REF', message: 'Missing target' }] }}
  />);
  expect(html).toContain('Report warnings');
  expect(html).toContain('Print / PDF');
  expect(html).toContain('Download HTML');
});
```

- [ ] **Step 2: Run the preview test to verify failure**

Run: `npx vitest run src/features/reporting/GlobalReportPreviewModal.test.tsx`

Expected: FAIL because the extracted modal is missing.

- [ ] **Step 3: Extract the preview and preserve safe rendering**

Keep DOMPurify sanitization for the in-app DOM preview so embedded scripts never execute in the main application. Preserve the raw composed HTML only for explicit download/open/print paths. Add warning summary, formal preview chrome, Download HTML, Word, and Print/PDF actions. Revoke every object URL after use.

- [ ] **Step 4: Replace `handleGenerateReport` with orchestration**

```ts
const handleGenerateReport = useCallback((metadata: ReportMetadata, sections: ReportSectionId[]) => {
  const source: ProjectReportSource = {
    blocks, relationships, parts, connectors, states, junctions, transitions, layers,
    variables, hmiComponents, hmiSettings: hmiPresentationSettings,
    xbridgesNodes: globalXBridgesNodes, xbridgesEdges: globalXBridgesEdges,
    tickMs, safetyMode, telemetry: hmiTelemetryHistory,
  };
  const model = buildReportViewModel(source, metadata, sections);
  setGlobalReportData(buildProjectReport(model));
  setShowGlobalReportPreview(true);
  setShowReportDialog(false);
}, [blocks, relationships, parts, connectors, states, junctions, transitions, layers, variables,
  hmiComponents, hmiPresentationSettings, globalXBridgesNodes, globalXBridgesEdges,
  tickMs, safetyMode, hmiTelemetryHistory]);
```

- [ ] **Step 5: Run focused integration and type checks**

Run: `npx vitest run src/features/reporting/*.test.ts src/features/reporting/*.test.tsx && npx tsc --noEmit`

Expected: PASS; the old local dialog, preview, and report-renderer functions no longer remain in `App.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/features/reporting/GlobalReportPreviewModal.tsx src/features/reporting/GlobalReportPreviewModal.test.tsx src/App.tsx
git commit -m "refactor(report): integrate modular generation and preview"
```

### Task 10: Regression, Print, and Visual Verification

**Files:**
- Modify: `src/features/reporting/__fixtures__/professionalProject.ts`
- Create: `src/features/reporting/reportIntegration.test.ts`
- Modify: `docs/superpowers/specs/2026-08-09-professional-report-reactive-hmi-design.md` only if verification exposes an approved requirement correction.

**Interfaces:**
- Consumes: all public reporting and HMI contracts created in Tasks 1-9.
- Produces: representative full-project regression evidence.

- [ ] **Step 1: Add a representative integration fixture**

Include three linked requirements, a BDD hierarchy, one IBD with ports/connectors, a two-layer state machine with a guarded transition and semantic diagnostic, an X-Bridges model, three HMI components, two pinned numeric signals with units, and finite telemetry samples.

- [ ] **Step 2: Add the end-to-end document assertions**

```ts
it('renders every selected engineering surface from one source snapshot', () => {
  const source = professionalProjectFixture();
  const model = buildReportViewModel(source, metadataFixture(), DEFAULT_REPORT_SECTIONS);
  const report = buildProjectReport(model);
  for (const expected of ['Requirements', 'Block definition diagram', 'Internal block diagram',
    'State-machine design and analysis', 'X-Bridges', 'HMI design', 'Pinned telemetry']) {
    expect(report.html).toContain(expected);
  }
  expect(report.html).toContain('@media print');
  expect(report.html).toContain('Temperature (°C)');
});
```

- [ ] **Step 3: Run the complete focused suite**

Run: `npx vitest run src/features/hmi src/features/reporting src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smStandaloneRuntime.test.ts src/services/sysmlIntegrityService.test.ts`

Expected: PASS with zero failed tests.

- [ ] **Step 4: Run type and production build gates**

Run: `npx tsc --noEmit`

Expected: PASS with zero diagnostics.

Run: `npm run build`

Expected: PASS and produce updated `dist` and `dist-electron` output.

- [ ] **Step 5: Perform visual verification**

Open a representative project and verify at approximately 1440px and 768px widths: report configuration, report preview, Edit/Run HMI modes, pin/unpin ordering, empty telemetry, multiple series, warning thresholds, and project reload compatibility. Print or save the report to PDF and inspect cover, table of contents, summary metrics, requirements, BDD, IBD, every state-machine layer, charts, dark HMI figure, tables, captions, and page breaks. Record any defect as a failing automated test before correcting it.

- [ ] **Step 6: Run final diff checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended source, test, and documentation files are modified.

- [ ] **Step 7: Commit verification coverage**

```bash
git add src/features/reporting/__fixtures__/professionalProject.ts src/features/reporting/reportIntegration.test.ts
git commit -m "test(report): verify professional report and HMI integration"
```

---

## Completion Gate

Before claiming completion, run the verification-before-completion skill and provide fresh output for the focused Vitest suite, `npx tsc --noEmit`, `npm run build`, `git diff --check`, and `git status --short`. Confirm that no unrelated user changes were staged or committed.
