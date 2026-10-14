// WP-02 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2.2
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractSmInterface } from './smInterface';

const load = (file: string) => JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8'));
const heater = load('inductance_heater.json');
const coffee = load('adia_project_unified_adia_corrected.json');
const dir = (iface: ReturnType<typeof extractSmInterface>, name: string) => iface.signals.find(s => s.name === name)?.direction;

describe('extractSmInterface', () => {
  const iface = extractSmInterface(heater);

  it('gives every declared variable a sim target, its data type and a direction', () => {
    expect(iface.signals).toHaveLength(6);
    const cof = iface.signals.find(s => s.name === 'cof')!;
    expect(cof).toMatchObject({ target: 'sim:sm/var/16d8b00b-7881-47d8-bc4a-bdbaa16031f3', variableId: '16d8b00b-7881-47d8-bc4a-bdbaa16031f3', dataType: 'bool' });
  });

  it('infers direction from scripts: read only = input, written only = output, both = internal', () => {
    expect(dir(iface, 'cof')).toBe('input');      // only read, in a transition condition
    expect(dir(iface, 'HEATER')).toBe('internal'); // written in entries, read by the internalTransitions guards `[HEATER>100]`
    expect(dir(iface, 'POWER')).toBe('internal'); // written in IDLE entry, read in conditions
    expect(dir(iface, 'ir')).toBe('internal');    // `ir=ir+1` and `ir>50`
  });

  it('treats a self update as a write only, so a variable only ever updated from itself is an output', () => {
    const m = {
      states: [{ id: 'a', name: 'A', entry: 'count = count + 1; level += 2;', during: '', exit: '' }],
      transitions: [{ id: 't', sourceId: 'a', targetId: 'a', condition: 'go', action: 'count++' }],
      variables: [{ id: 'vc', name: 'count', type: 'int' }, { id: 'vl', name: 'level', type: 'int' }, { id: 'vg', name: 'go', type: 'bool' }],
    };
    const i = extractSmInterface(m as any);
    expect(dir(i, 'count')).toBe('output');
    expect(dir(i, 'level')).toBe('output');
    expect(dir(i, 'go')).toBe('input');
  });

  it('lets an enabled HIL mapping override the scan (read = input, write = output)', () => {
    const withHil = {
      ...heater,
      hilConfig: { enabled: true, mappings: [
        { id: 'm1', adiaVarId: 'POWER', channelId: 'c1', direction: 'read' },
        { id: 'm2', adiaVarId: 'cof', channelId: 'c2', direction: 'write' },
      ] },
    };
    const hil = extractSmInterface(withHil);
    expect(dir(hil, 'POWER')).toBe('input');
    expect(dir(hil, 'cof')).toBe('output');
    expect(hil.signals.find(s => s.name === 'POWER')?.directionSource).toBe('hil');
    expect(iface.signals.find(s => s.name === 'POWER')?.directionSource).toBe('scan');
  });

  it('exposes states (raw id) and transitions (sim id) as observable elements', () => {
    expect(iface.states).toContainEqual({ id: 's1', name: 'IDLE', target: 's1' });
    expect(iface.states).toHaveLength(5);
    expect(iface.transitions).toHaveLength(10);
    expect(iface.transitions[0].target).toMatch(/^sim:sm\/transition\//);
    expect(iface.diagnostics).toEqual([]);
  });

  it('reports identifiers used in transitions that are never declared, once each, with where they are used', () => {
    const c = extractSmInterface(coffee);
    expect(c.signals).toEqual([]);
    const names = c.diagnostics.filter(d => d.code === 'UNDECLARED_IDENTIFIER').map(d => d.name).sort();
    expect(names).toEqual(['comm_loss', 'critical_fault', 'near_rim_confirmed', 'pot_valid', 'power_off', 'power_on', 'power_stage_disabled', 'start_request', 'temperature_ok', 'temperature_safe', 'thermal_limit']);
    const critical = c.diagnostics.find(d => d.name === 'critical_fault')!;
    expect(critical.elementIds).toHaveLength(2);
  });

  it('does not report literals, keywords or numbers as undeclared', () => {
    const m = { states: [{ id: 'a', name: 'A', entry: 'x = 1.5e3; y = !x && true;', during: '', exit: '' }], transitions: [{ id: 't', sourceId: 'a', targetId: 'a', condition: 'false || x >= 0x10', action: '' }], variables: [{ id: 'vx', name: 'x', type: 'double' }, { id: 'vy', name: 'y', type: 'bool' }] };
    expect(extractSmInterface(m as any).diagnostics).toEqual([]);
  });
});
