// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { HmiComponent } from '../../types/sysml_types';
import type { VariableDef } from '../../types/sm_types';
import { createHmiComponent } from './hmiCatalog';
import { createHmiRunRecorder } from './hmiRunRecorder';
import { buildHmiRunCsv, collectHmiSignals, describeTransitionCondition, renderHmiRunReportHtml, type HmiRunReportInput } from './hmiRunReport';

const v = (id: string, name: string, type: VariableDef['type'], initial: number | boolean): VariableDef => ({ id, name, type, initialValue: String(initial), currentValue: initial, visibleInScope: true });
const variables = [v('start', 'StartBtn', 'bool', false), v('temp', 'Temp', 'double', 20), v('heater', 'Heater', 'bool', false), v('fan', 'Fan', 'bool', false), v('hidden', 'Internal', 'double', 0)];
const c = (type: HmiComponent['type'], name: string, patch: Partial<HmiComponent> = {}): HmiComponent => ({ ...createHmiComponent(type, name), name, ...patch });
const components = [
  c('button', 'Start <key>', { variableId: 'start' }),
  c('seven-segment', 'Temp display', { variableId: 'temp', unit: '°C' }),
  c('segment-lcd', 'Glass', { variableId: 'temp', annunciators: [{ icon: 'flame', variableId: 'heater' }, { icon: 'fan', variableId: 'fan' }] }),
  c('simulation-command', 'Run'),
  c('label', 'Title'),
];
const states = [{ id: 'idle', name: 'Idle' }, { id: 'heat', name: 'Heating', entry: 'Heater = true;' }, { id: 'fault', name: 'Fault' }];
const transitions = [
  { id: 't1', sourceId: 'idle', targetId: 'heat', condition: 'StartBtn == true', action: '', type: 'condition', afterTicks: null },
  { id: 't2', sourceId: 'heat', targetId: 'idle', condition: '', action: 'Heater = false;', type: 'after', afterTicks: 30 },
  { id: 't3', sourceId: 'heat', targetId: 'fault', condition: 'Temp > 250', action: '', type: 'condition', afterTicks: null },
];
const run = () => {
  const rec = createHmiRunRecorder({ transitionTargets: { t1: 'heat', t2: 'idle', t3: 'fault' } });
  const base = { start: false, temp: 20, heater: false, fan: false, hidden: 0 };
  rec.start({ time: 0, values: base, activeStateIds: ['idle'], firedTransitionIds: [] });
  rec.record({ time: 0.1, values: { ...base, start: true }, activeStateIds: ['idle'], firedTransitionIds: [], operatorInputIds: ['start'] });
  rec.record({ time: 0.2, values: { ...base, start: true, heater: true }, activeStateIds: ['heat'], firedTransitionIds: ['t1'] });
  rec.record({ time: 0.3, values: { ...base, start: true, heater: true, temp: 35.25, hidden: 9 }, activeStateIds: ['heat'], firedTransitionIds: [] });
  rec.record({ time: 3.2, values: { ...base, start: true, heater: false, temp: 35.25, hidden: 9 }, activeStateIds: ['idle'], firedTransitionIds: ['t2'] });
  return rec.snapshot();
};
const input = (patch: Partial<HmiRunReportInput> = {}): HmiRunReportInput => ({ components, variables, states, transitions, log: run(), ...patch });
const tableRows = (html: string, cls: string) => {
  document.body.innerHTML = html;
  return Array.from(document.querySelectorAll(`table.${cls} tbody tr`)).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent!.trim()));
};

describe('collectHmiSignals', () => {
  it('lists every HMI-referenced variable once with direction, elements and unit', () => {
    const signals = collectHmiSignals(components, variables);
    expect(signals.map(s => s.name)).toEqual(['Fan', 'Heater', 'StartBtn', 'Temp']);
    expect(signals.find(s => s.name === 'StartBtn')).toEqual(expect.objectContaining({ direction: 'input', type: 'bool', components: [{ name: 'Start <key>', type: 'button' }] }));
    expect(signals.find(s => s.name === 'Temp')).toEqual(expect.objectContaining({ direction: 'display', unit: '°C', components: [{ name: 'Temp display', type: 'seven-segment' }, { name: 'Glass', type: 'segment-lcd' }] }));
    expect(signals.find(s => s.name === 'Heater')!.components).toEqual([{ name: 'Glass', type: 'segment-lcd' }]);
  });
  it('marks a variable both written and shown as input+display and skips unknown ids', () => {
    const signals = collectHmiSignals([c('toggle', 'Fan switch', { variableId: 'fan' }), c('lamp', 'Fan lamp', { variableId: 'fan' }), c('lamp', 'Ghost', { variableId: 'nope' })], variables);
    expect(signals).toEqual([expect.objectContaining({ variableId: 'fan', direction: 'input+display' })]);
  });
});

describe('describeTransitionCondition', () => {
  it('describes guards, timers and unguarded transitions', () => {
    expect(describeTransitionCondition(transitions[0])).toBe('StartBtn == true');
    expect(describeTransitionCondition(transitions[1])).toBe('after 30 ticks');
    expect(describeTransitionCondition({ ...transitions[0], condition: '  ' })).toBe('always (no guard)');
  });
});

describe('renderHmiRunReportHtml', () => {
  it('orders the sections for the ID team', () => {
    document.body.innerHTML = renderHmiRunReportHtml(input());
    expect(Array.from(document.querySelectorAll('h3')).map(h => h.textContent)).toEqual(['Run summary', 'Signal list', 'Signal readings during the run', 'Scenarios by state', 'State sequence']);
  });
  it('summarises the run and flags unreached states and static signals', () => {
    document.body.innerHTML = renderHmiRunReportHtml(input());
    const text = document.body.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('States reached: 2 / 3');
    expect(text).toContain('Transitions fired: 2');
    expect(text).toMatch(/States not reached in this run:.*Fault/);
    expect(text).toMatch(/Signals that never changed:.*Fan/);
  });
  it('lists signals with initial, range, final and change count', () => {
    const rows = tableRows(renderHmiRunReportHtml(input()), 'hmi-feedback-signals');
    expect(rows.map(r => r[0])).toEqual(['Fan', 'Heater', 'StartBtn', 'Temp']);
    expect(rows.find(r => r[0] === 'Temp')).toEqual(['Temp', 'Temp display (seven-segment), Glass (segment-lcd)', 'display', 'double', '°C', '20', '20', '35.25', '35.25', '1']);
    expect(rows.find(r => r[0] === 'Heater')).toEqual(['Heater', 'Glass (segment-lcd)', 'display', 'bool', '', 'OFF', 'OFF', 'ON', 'OFF', '2']);
  });
  it('logs each HMI signal reading with active state and what initiated it', () => {
    const rows = tableRows(renderHmiRunReportHtml(input()), 'hmi-feedback-readings');
    expect(rows).toEqual([
      ['0.1', 'StartBtn', 'OFF → ON', 'Idle', 'Operator input on Start <key>'],
      ['0.2', 'Heater', 'OFF → ON', 'Heating', 'Set by Idle → Heating when [StartBtn == true]'],
      ['0.3', 'Temp', '20 → 35.25', 'Heating', 'Activity of Heating'],
      ['3.2', 'Heater', 'ON → OFF', 'Idle', 'Set by Heating → Idle when [after 30 ticks] / Heater = false;'],
    ]);
    expect(rows.flat().join(' ')).not.toContain('Internal');
  });
  it('describes the scenario of every state, including states not reached', () => {
    document.body.innerHTML = renderHmiRunReportHtml(input());
    const blocks = Array.from(document.querySelectorAll('[data-state-scenario]'));
    expect(blocks.map(b => b.getAttribute('data-state-scenario'))).toEqual(['idle', 'heat', 'fault']);
    const heat = blocks[1].textContent!.replace(/\s+/g, ' ');
    expect(heat).toContain('Visits: 1');
    expect(heat).toContain('Time active: 3 s');
    expect(heat).toContain('StartBtn == true');
    expect(heat).toMatch(/Heater.*ON/);
    expect(heat).toMatch(/Temp.*20, 35\.25/);
    const fault = blocks[2].textContent!.replace(/\s+/g, ' ');
    expect(fault).toContain('Not reached in this run');
    expect(fault).toContain('Temp > 250');
  });
  it('lists the state sequence with conditions and actions', () => {
    expect(tableRows(renderHmiRunReportHtml(input()), 'hmi-feedback-sequence')).toEqual([
      ['0.2', 'Idle → Heating', 'StartBtn == true', ''],
      ['3.2', 'Heating → Idle', 'after 30 ticks', 'Heater = false;'],
    ]);
  });
  it('escapes model text and offers a CSV download', () => {
    const html = renderHmiRunReportHtml(input());
    expect(html).not.toContain('<key>');
    expect(html).toContain('Start &lt;key&gt;');
    document.body.innerHTML = html;
    const link = document.querySelector('a[download="hmi-signal-readings.csv"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^data:text\/csv;charset=utf-8,/);
    expect(decodeURIComponent(link.getAttribute('href')!.split(',').slice(1).join(','))).toBe(buildHmiRunCsv(input()));
  });
  it('explains how to record a run when no run exists and still lists signals', () => {
    for (const log of [null, createHmiRunRecorder().snapshot()]) {
      document.body.innerHTML = renderHmiRunReportHtml(input({ log }));
      expect(document.body.textContent).toContain('No simulation run was recorded');
      expect(document.querySelectorAll('table.hmi-feedback-signals tbody tr')).toHaveLength(4);
    }
  });
  it('warns when the readings log was truncated', () => {
    const rec = createHmiRunRecorder({ maxChanges: 1 });
    rec.start({ time: 0, values: { temp: 0 }, activeStateIds: ['idle'], firedTransitionIds: [] });
    rec.record({ time: 1, values: { temp: 1 }, activeStateIds: ['idle'], firedTransitionIds: [] });
    rec.record({ time: 2, values: { temp: 2 }, activeStateIds: ['idle'], firedTransitionIds: [] });
    expect(renderHmiRunReportHtml(input({ log: rec.snapshot() }))).toMatch(/truncated/i);
  });
});

describe('buildHmiRunCsv', () => {
  it('exports readings with RFC 4180 quoting', () => {
    const lines = buildHmiRunCsv(input()).trim().split('\n');
    expect(lines[0]).toBe('time_s,signal,from,to,active_states,initiated_by');
    expect(lines[1]).toBe('0.1,StartBtn,OFF,ON,Idle,Operator input on Start <key>');
    expect(lines[4]).toBe('3.2,Heater,ON,OFF,Idle,Set by Heating → Idle when [after 30 ticks] / Heater = false;');
    const quoted = buildHmiRunCsv(input({ states: [{ id: 'idle', name: 'Idle, "ready"' }, ...states.slice(1)] })).split('\n')[1];
    expect(quoted).toContain('"Idle, ""ready"""');
  });
});
