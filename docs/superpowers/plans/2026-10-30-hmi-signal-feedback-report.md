# HMI signal feedback report (run evidence for the ID team)

Planner: Opus (design, acceptance tests, review). Executor: Sonnet.

## Goal

The global report gets a section **"HMI Signal Feedback"** that the industrial-design (ID) team can read without
opening the model. It answers: which signals does the panel show / accept, what readings did they take during the
run, what initiated each change, and how each state of the machine looked on the panel (the scenarios), including
states the run never reached.

Today the report has only an HMI picture with the final values and "Bound to: X". The app keeps the last 600
samples and 200 trace events in React state, which is not enough for a full run and has no cause information.

## Architecture

### 1. Run recorder — `src/features/hmi/hmiRunRecorder.ts` (pure, no React)

```ts
export type HmiValue = number | boolean;
export interface HmiRunTick {
  time: number;                              // seconds
  values: Readonly<Record<string, HmiValue>>;  // full committed frame values (variable id → value)
  activeStateIds: readonly string[];
  firedTransitionIds: readonly string[];
  operatorInputIds?: readonly string[];      // variable ids written from the HMI queue before this tick
}
export type HmiChangeCause =
  | { kind: 'initial' }
  | { kind: 'operator' }
  | { kind: 'transition'; transitionIds: string[] }   // transitions fired in the same tick
  | { kind: 'state' };                                // no transition fired: entry/during activity of active states
export interface HmiRunChange { time: number; variableId: string; from: HmiValue | undefined; to: HmiValue; activeStateIds: string[]; cause: HmiChangeCause }
export interface HmiStateVisit { stateId: string; enter: number; exit: number | null; viaTransitionId: string | null }
export interface HmiRunLog {
  startTime: number; endTime: number; ticks: number;
  initial: Record<string, HmiValue>;
  changes: HmiRunChange[];
  visits: HmiStateVisit[];
  transitions: { time: number; transitionId: string }[];
  truncated: boolean;
}
export interface HmiRunRecorder { start(initial: HmiRunTick): void; record(tick: HmiRunTick): void; reset(): void; snapshot(): HmiRunLog }
export function createHmiRunRecorder(options?: { maxChanges?: number /* default 20000 */ }): HmiRunRecorder;
```

Rules:
- `start` clears everything, stores `initial` values, opens a visit per active state (`viaTransitionId: null`),
  `startTime = endTime = tick.time`, `ticks = 0`. `record` before `start` behaves as `start` on that tick.
- `record`: `ticks += 1`, `endTime = time`. Each fired transition id → `transitions`. For every variable whose
  value differs from the previous tick (strict `!==`; a variable that first appears is a change from `undefined`)
  push a change. Cause precedence: id in `operatorInputIds` → `operator`; else any transitions fired this tick →
  `transition` with all fired ids (in order); else `state`. `activeStateIds` on a change = the tick's active states.
- Visits: a state newly active → open a visit at `time`, `viaTransitionId` = the first fired transition whose target
  is that state (needs a target lookup: pass `transitionTargets?: Record<transitionId, stateId>` in options), else
  `null`. A state no longer active → close its open visit (`exit = time`). Visits stay open (`exit: null`) at the end.
- `maxChanges`: when reached, further changes are dropped and `truncated = true` (visits / transitions are kept).
- `snapshot()` returns a deep copy (mutating it does not affect the recorder).

### 2. Report renderer — `src/features/hmi/hmiRunReport.ts` (pure)

```ts
export interface HmiSignal { variableId: string; name: string; type: string; unit: string; direction: 'input' | 'display' | 'input+display'; components: { name: string; type: string }[] }
export function collectHmiSignals(components: readonly HmiComponent[], variables: readonly VariableDef[]): HmiSignal[];
export interface HmiRunReportInput {
  components: readonly HmiComponent[]; variables: readonly VariableDef[];
  states: readonly { id: string; name: string; entry?: string; during?: string; exit?: string }[];
  transitions: readonly { id: string; sourceId: string; targetId: string; condition: string; action: string; type: string; afterTicks: number | null }[];
  log: HmiRunLog | null;
}
export function renderHmiRunReportHtml(input: HmiRunReportInput): string;
export function buildHmiRunCsv(input: HmiRunReportInput): string;
export function describeTransitionCondition(t: HmiRunReportInput['transitions'][number]): string;
```

`collectHmiSignals`: every variable referenced by any HMI component through `variableId`, `variableIds`,
`pressVariableId`, `cursorVariableId`, the `oled*VarId` fields, `oledIndicatorVarIds` and `annunciators[].variableId`.
Direction: the component's catalog role `input` (or `pressVariableId` / `cursorVariableId`) → input, other
references → display; both → `input+display`. Unit from the first component that has one. Ordered by variable name.
Unknown variable ids are skipped. `simulation-command` and layout components contribute nothing.

`describeTransitionCondition`: `after` type → `after N ticks`; non-empty condition → the condition text; otherwise
`always (no guard)`.

HTML (everything escaped; tables use `<table class="hmi-feedback-…">`), in this order, each with an `<h3>`:
1. **Run summary** — duration (s), ticks, states reached `x / y`, transitions fired, signals, and two feedback
   lists: *states not reached in this run* and *signals that never changed* (the ID team should check these).
2. **Signal list** — columns `Signal | HMI element | Direction | Type | Unit | Initial | Min | Max | Final | Changes`.
   Booleans show `ON` / `OFF`; numbers keep up to 4 decimals without trailing zeros. Min/Max for booleans are
   `OFF` / `ON` when both seen.
3. **Signal readings during the run** — one row per change of an HMI signal, chronological:
   `Time (s) | Signal | Reading (from → to) | Active state(s) | Initiated by`.
   *Initiated by*: `Initial value`; `Operator input on <component names>`; for `transition`:
   `<Source> → <Target> when [<condition>]` for each fired transition, followed by ` / <action>` when the action is
   non-empty — transitions whose action (or target's entry action) mentions the signal name (word match) are listed
   first and prefixed `Set by `; for `state`: `Activity of <active state names>`.
4. **Scenarios by state** — one block per model state (all states, model order): visits, total time active,
   entry conditions taken in the run (with count) and all modelled incoming conditions (marking those not exercised),
   outgoing transitions taken, and a table `Signal | Readings while active` (distinct values in order seen, at most
   8 then `…`; for numbers a `min – max` range when more than 8 distinct). A state never visited shows
   `Not reached in this run` and its modelled entry conditions, so the ID team sees the missing scenario.
5. **State sequence** — fired transitions in order: `Time (s) | From → To | Condition | Action`.
   Each state block is `<div data-state-scenario="<state id>">` with an `<h4>` title (only the five section titles
   are `<h3>`). Text includes `Visits: N` and `Time active: T s` (sum of closed visits; open visits count up to
   `log.endTime`). *Readings while active* for a visit = the signal value at the visit's enter tick (initial values
   plus all changes with `time <= enter`) followed by changes with `enter < time < exit` (a change on the exit tick
   belongs to the next state; open visits include changes up to `endTime`).
6. A CSV download link `<a download="hmi-signal-readings.csv" href="data:text/csv;charset=utf-8,…">` with the
   readings table (header `time_s,signal,from,to,active_states,initiated_by`, RFC 4180 quoting).

Times and numbers are formatted with up to 4 decimals and no trailing zeros (`3.0000000000000004` → `3`). Active
states are listed by state name joined with `, ` in the tick's order. Only HMI signals (from `collectHmiSignals`)
appear in the readings, scenarios and CSV.

`log === null` or no ticks → one paragraph: `No simulation run was recorded. Run the simulation, operate the HMI,
then generate the report.` plus the signal list (static columns, readings `—`).

If `log.truncated`, a warning line says the readings log is truncated.

### 3. App wiring — `src/App.tsx` (minimal)

- `hmiRunRecorderRef = useRef(createHmiRunRecorder({ transitionTargets }))` (targets refreshed when transitions change).
- In the tick `beforeStep`, collect the variable ids applied from the HMI queue; pass them to the recorder.
- `applySimulationFrameToReact`: when `sampleScope` is false (initial frame) call `start`, otherwise `record` with
  values, `Object.values(update.activeStates)`, `update.traceEvents.map(e => e.transitionId)` and the operator ids.
- Every place that does `setHmiSamples([])` also calls `reset()`.
- `handleGenerateReport`: when HMI components exist, push
  `{ id: 'hmi-signal-feedback', title: 'HMI Signal Feedback', html: renderHmiRunReportHtml(...) }` right after the
  HMI Design section.
- Styles for the tables go into the report stylesheet `src/features/reporting/systemReport/reportStyles.ts` using
  the report's own variables.

## Acceptance

- `src/features/hmi/hmiRunRecorder.test.ts`, `src/features/hmi/hmiRunReport.test.ts` (planner-written).
- `npx vitest run src/features/hmi src/components/hmi src/features/reporting src/help`, `npx tsc --noEmit -p .`,
  `npm run lint:theme`. The pre-existing `helpCoverage` snapshot failure stays out of scope.
