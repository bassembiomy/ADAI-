import type { HmiComponent } from '../../types/sysml_types';
import type { VariableDef } from '../../types/sm_types';
import { getHmiDefinition } from './hmiCatalog';
import type { HmiRunChange, HmiRunLog, HmiValue } from './hmiRunRecorder';

export interface HmiSignal {
  variableId: string;
  name: string;
  type: string;
  unit: string;
  direction: 'input' | 'display' | 'input+display';
  components: { name: string; type: string }[];
}

type ReportTransition = { id: string; sourceId: string; targetId: string; condition: string; action: string; type: string; afterTicks: number | null };
type ReportState = { id: string; name: string; entry?: string; during?: string; exit?: string };

export interface HmiRunReportInput {
  components: readonly HmiComponent[];
  variables: readonly VariableDef[];
  states: readonly ReportState[];
  transitions: readonly ReportTransition[];
  log: HmiRunLog | null;
}

const escapeHtml = (text: string): string => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatNumber = (n: number): string => {
  const rounded = Number(n.toFixed(4));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};
const formatValue = (value: HmiValue | undefined): string => {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  return formatNumber(value);
};

// ---------------------------------------------------------------- signals

interface SignalRef { variableId: string; input: boolean }

const componentRefs = (component: HmiComponent): SignalRef[] => {
  const role = getHmiDefinition(component.type)?.role;
  if (role === 'layout' || role === 'command') return [];
  const roleInput = role === 'input';
  const refs: SignalRef[] = [];
  const add = (id: string | null | undefined, input: boolean) => { if (id) refs.push({ variableId: id, input }); };
  add(component.variableId, roleInput);
  (component.variableIds ?? []).forEach(id => add(id, roleInput));
  add(component.pressVariableId, true);
  add(component.cursorVariableId, true);
  [component.oledModeVarId, component.oledTempVarId, component.oledTimeVarId, component.oledStateVarId, component.oledSteamVarId,
    component.oledHeatVarId, component.oledFanVarId, component.oledLightVarId, component.oledDuoVarId, component.oledProgressVarId]
    .forEach(id => add(id, roleInput));
  (component.oledIndicatorVarIds ?? []).forEach(id => add(id, roleInput));
  (component.annunciators ?? []).forEach(a => add(a.variableId, roleInput));
  return refs;
};

export function collectHmiSignals(components: readonly HmiComponent[], variables: readonly VariableDef[]): HmiSignal[] {
  const byId = new Map(variables.map(v => [v.id, v]));
  const signals = new Map<string, HmiSignal & { hasInput: boolean; hasDisplay: boolean }>();
  for (const component of components) {
    for (const ref of componentRefs(component)) {
      const variable = byId.get(ref.variableId);
      if (!variable) continue;
      let signal = signals.get(ref.variableId);
      if (!signal) {
        signal = { variableId: variable.id, name: variable.name, type: variable.type, unit: '', direction: 'display', components: [], hasInput: false, hasDisplay: false };
        signals.set(ref.variableId, signal);
      }
      if (ref.input) signal.hasInput = true; else signal.hasDisplay = true;
      if (!signal.unit && component.unit) signal.unit = component.unit;
      if (!signal.components.some(c => c.name === component.name && c.type === component.type)) {
        signal.components.push({ name: component.name, type: component.type });
      }
    }
  }
  return Array.from(signals.values())
    .map(({ hasInput, hasDisplay, ...signal }) => ({ ...signal, direction: (hasInput && hasDisplay ? 'input+display' : hasInput ? 'input' : 'display') as HmiSignal['direction'] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function describeTransitionCondition(t: ReportTransition): string {
  if (t.type === 'after') return `after ${t.afterTicks ?? 0} ticks`;
  const condition = (t.condition ?? '').trim();
  return condition || 'always (no guard)';
}

// ---------------------------------------------------------------- analysis

interface Analysis {
  signals: HmiSignal[];
  signalById: Map<string, HmiSignal>;
  stateName: (id: string) => string;
  transitionById: Map<string, ReportTransition>;
  changes: HmiRunChange[];
  changesBySignal: Map<string, HmiRunChange[]>;
}

const analyse = (input: HmiRunReportInput): Analysis => {
  const signals = collectHmiSignals(input.components, input.variables);
  const signalById = new Map(signals.map(s => [s.variableId, s]));
  const stateNames = new Map(input.states.map(s => [s.id, s.name]));
  const changes = (input.log?.changes ?? []).filter(c => signalById.has(c.variableId));
  const changesBySignal = new Map<string, HmiRunChange[]>();
  changes.forEach(c => changesBySignal.set(c.variableId, [...(changesBySignal.get(c.variableId) ?? []), c]));
  return {
    signals, signalById, changes, changesBySignal,
    stateName: id => stateNames.get(id) ?? id,
    transitionById: new Map(input.transitions.map(t => [t.id, t])),
  };
};

const wordMatch = (text: string | undefined, name: string): boolean => {
  if (!text || !name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(text);
};

const transitionText = (a: Analysis, t: ReportTransition): string => {
  const base = `${a.stateName(t.sourceId)} → ${a.stateName(t.targetId)} when [${describeTransitionCondition(t)}]`;
  return t.action.trim() ? `${base} / ${t.action.trim()}` : base;
};

const initiatedBy = (a: Analysis, input: HmiRunReportInput, change: HmiRunChange): string => {
  const signal = a.signalById.get(change.variableId)!;
  switch (change.cause.kind) {
    case 'initial': return 'Initial value';
    case 'operator': {
      const inputs = input.components.filter(c => componentRefs(c).some(r => r.variableId === change.variableId && r.input));
      const names = (inputs.length > 0 ? inputs.map(c => c.name) : signal.components.map(c => c.name));
      return `Operator input on ${names.join(', ')}`;
    }
    case 'transition': {
      const setters: string[] = [];
      const others: string[] = [];
      for (const id of change.cause.transitionIds) {
        const t = a.transitionById.get(id);
        if (!t) { others.push(id); continue; }
        const target = input.states.find(s => s.id === t.targetId);
        const sets = wordMatch(t.action, signal.name) || wordMatch(target?.entry, signal.name);
        (sets ? setters : others).push(sets ? `Set by ${transitionText(a, t)}` : transitionText(a, t));
      }
      return [...setters, ...others].join('; ');
    }
    default:
      return `Activity of ${change.activeStateIds.map(a.stateName).join(', ')}`;
  }
};

// ---------------------------------------------------------------- html

const table = (cls: string, headers: string[], rows: string[][], raw = false): string =>
  `<table class="${cls} data"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map(c => `<td>${raw ? c : escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const signalRows = (a: Analysis, log: HmiRunLog | null): string[][] => a.signals.map(s => {
  const elements = s.components.map(c => `${c.name} (${c.type})`).join(', ');
  const base = [s.name, elements, s.direction, s.type, s.unit];
  if (!log) return [...base, '—', '—', '—', '—', '—'];
  const own = a.changesBySignal.get(s.variableId) ?? [];
  const seen: HmiValue[] = [];
  if (log.initial[s.variableId] !== undefined) seen.push(log.initial[s.variableId]);
  own.forEach(c => seen.push(c.to));
  if (seen.length === 0) return [...base, '—', '—', '—', '—', String(own.length)];
  const nums = seen.map(v => Number(v));
  const toValue = (n: number): HmiValue => (typeof seen[0] === 'boolean' ? n !== 0 : n);
  const final = seen[seen.length - 1];
  return [...base, formatValue(log.initial[s.variableId]), formatValue(toValue(Math.min(...nums))), formatValue(toValue(Math.max(...nums))), formatValue(final), String(own.length)];
});

const readingRows = (a: Analysis, input: HmiRunReportInput) => a.changes.map(c => ({
  time: formatNumber(c.time),
  signal: a.signalById.get(c.variableId)!.name,
  from: c.from === undefined ? '' : formatValue(c.from),
  to: formatValue(c.to),
  states: c.activeStateIds.map(a.stateName).join(', '),
  by: initiatedBy(a, input, c),
}));

const hasRun = (log: HmiRunLog | null): log is HmiRunLog => !!log && log.ticks > 0;

const timeActive = (log: HmiRunLog, stateId: string): number =>
  log.visits.filter(v => v.stateId === stateId).reduce((sum, v) => sum + ((v.exit ?? log.endTime) - v.enter), 0);

const readingsWhileActive = (a: Analysis, log: HmiRunLog, signal: HmiSignal, stateId: string): HmiValue[] => {
  const own = a.changesBySignal.get(signal.variableId) ?? [];
  const out: HmiValue[] = [];
  const push = (v: HmiValue | undefined) => { if (v !== undefined && !out.includes(v)) out.push(v); };
  for (const visit of log.visits.filter(v => v.stateId === stateId)) {
    let atEnter = log.initial[signal.variableId];
    for (const c of own) if (c.time <= visit.enter) atEnter = c.to;
    push(atEnter);
    for (const c of own) if (c.time > visit.enter && (visit.exit === null ? c.time <= log.endTime : c.time < visit.exit)) push(c.to);
  }
  return out;
};

const formatReadings = (values: HmiValue[]): string => {
  if (values.length > 8) {
    if (values.every(v => typeof v === 'number')) {
      const nums = values as number[];
      return `${formatNumber(Math.min(...nums))} – ${formatNumber(Math.max(...nums))}`;
    }
    return `${values.slice(0, 8).map(formatValue).join(', ')}, …`;
  }
  return values.map(formatValue).join(', ');
};

const stateBlock = (a: Analysis, input: HmiRunReportInput, log: HmiRunLog, state: ReportState): string => {
  const visits = log.visits.filter(v => v.stateId === state.id);
  const incoming = input.transitions.filter(t => t.targetId === state.id);
  const taken = (id: string) => log.transitions.filter(t => t.transitionId === id).length;
  const enteredCount = (id: string) => visits.filter(v => v.viaTransitionId === id).length;
  let html = `<div class="state-scenario" data-state-scenario="${escapeHtml(state.id)}"><h4>${escapeHtml(state.name)}</h4>`;
  if (visits.length === 0) html += '<p><strong>Not reached in this run</strong></p>';
  html += `<p>Visits: ${visits.length}</p>`;
  if (visits.length > 0) {
    html += `<p>Time active: ${formatNumber(timeActive(log, state.id))} s</p>`;
    const entries: string[] = [];
    const untracked = visits.filter(v => v.viaTransitionId === null);
    const initialVisits = untracked.filter(v => v.enter === log.startTime).length;
    const defaultVisits = untracked.length - initialVisits;
    if (initialVisits > 0) entries.push(`Initial state at run start (${initialVisits}×)`);
    if (defaultVisits > 0) entries.push(`Entered by default or parent transition (${defaultVisits}×)`);
    incoming.filter(t => enteredCount(t.id) > 0).forEach(t => entries.push(`${transitionText(a, t)} (${enteredCount(t.id)}×)`));
    html += `<p>Entry conditions taken: ${entries.length ? '' : 'none'}</p>`;
    if (entries.length) html += `<ul>${entries.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  }
  html += `<p>Modelled entry conditions:${incoming.length ? '' : ' none'}</p>`;
  if (incoming.length) {
    html += `<ul>${incoming.map(t => `<li>${escapeHtml(transitionText(a, t))}${enteredCount(t.id) === 0 && taken(t.id) === 0 ? ' <em>(not exercised)</em>' : ''}</li>`).join('')}</ul>`;
  }
  const outgoing = input.transitions.filter(t => t.sourceId === state.id && taken(t.id) > 0);
  if (visits.length > 0) {
    html += `<p>Outgoing transitions taken:${outgoing.length ? '' : ' none'}</p>`;
    if (outgoing.length) html += `<ul>${outgoing.map(t => `<li>${escapeHtml(transitionText(a, t))} (${taken(t.id)}×)</li>`).join('')}</ul>`;
    const rows = a.signals
      .map(s => [s.name, formatReadings(readingsWhileActive(a, log, s, state.id))])
      .filter(r => r[1] !== '');
    if (rows.length) html += table('hmi-feedback-scenario-readings', ['Signal', 'Readings while active'], rows);
  }
  return `${html}</div>`;
};

export function renderHmiRunReportHtml(input: HmiRunReportInput): string {
  const a = analyse(input);
  const signalHeaders = ['Signal', 'HMI element', 'Direction', 'Type', 'Unit', 'Initial', 'Min', 'Max', 'Final', 'Changes'];
  if (!hasRun(input.log)) {
    return `<div class="hmi-feedback"><p>No simulation run was recorded. Run the simulation, operate the HMI, then generate the report.</p>`
      + `<h3>Signal list</h3>${table('hmi-feedback-signals', signalHeaders, signalRows(a, null))}</div>`;
  }
  const log = input.log;
  const reached = input.states.filter(s => log.visits.some(v => v.stateId === s.id));
  const notReached = input.states.filter(s => !reached.includes(s));
  const static_ = a.signals.filter(s => (a.changesBySignal.get(s.variableId) ?? []).length === 0);
  const list = (items: string[]) => (items.length ? items.map(escapeHtml).join(', ') : 'none');
  let html = '<div class="hmi-feedback">';
  html += '<h3>Run summary</h3><ul>'
    + `<li>Duration: ${formatNumber(log.endTime - log.startTime)} s</li>`
    + `<li>Ticks: ${log.ticks}</li>`
    + `<li>States reached: ${reached.length} / ${input.states.length}</li>`
    + `<li>Transitions fired: ${log.transitions.length}</li>`
    + `<li>Signals: ${a.signals.length}</li>`
    + `<li>States not reached in this run: ${list(notReached.map(s => s.name))}</li>`
    + `<li>Signals that never changed: ${list(static_.map(s => s.name))}</li></ul>`;
  if (log.truncated) html += '<p class="report-figure-omitted">Warning: the readings log is truncated; later changes are not listed.</p>';
  html += `<h3>Signal list</h3>${table('hmi-feedback-signals', signalHeaders, signalRows(a, log))}`;
  const readings = readingRows(a, input);
  html += `<h3>Signal readings during the run</h3>${table('hmi-feedback-readings', ['Time (s)', 'Signal', 'Reading (from → to)', 'Active state(s)', 'Initiated by'],
    readings.map(r => [r.time, r.signal, `${r.from ? `${r.from} → ` : ''}${r.to}`, r.states, r.by]))}`;
  html += `<h3>Scenarios by state</h3>${input.states.map(s => stateBlock(a, input, log, s)).join('')}`;
  html += `<h3>State sequence</h3>${table('hmi-feedback-sequence', ['Time (s)', 'From → To', 'Condition', 'Action'],
    log.transitions.map(entry => {
      const t = a.transitionById.get(entry.transitionId);
      return t
        ? [formatNumber(entry.time), `${a.stateName(t.sourceId)} → ${a.stateName(t.targetId)}`, describeTransitionCondition(t), t.action.trim()]
        : [formatNumber(entry.time), entry.transitionId, '', ''];
    }))}`;
  html += `<p><a download="hmi-signal-readings.csv" href="${escapeHtml(`data:text/csv;charset=utf-8,${encodeURIComponent(buildHmiRunCsv(input))}`)}">Download signal readings (CSV)</a></p>`;
  return `${html}</div>`;
}

export function buildHmiRunCsv(input: HmiRunReportInput): string {
  const a = analyse(input);
  const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const lines = [['time_s', 'signal', 'from', 'to', 'active_states', 'initiated_by']];
  if (hasRun(input.log)) readingRows(a, input).forEach(r => lines.push([r.time, r.signal, r.from, r.to, r.states, r.by]));
  return `${lines.map(l => l.map(quote).join(',')).join('\n')}\n`;
}
