// @vitest-environment jsdom
// WP-20 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.9
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimVerificationPanel } from './SimVerificationPanel';
import { TraceabilityMatrix } from '../sysml/TraceabilityMatrix';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import { thermostatProject, thermostatScenario, THERMO_REQUIREMENTS, T } from '../../engine/trmSim/__fixtures__/thermostatProject';

const project = thermostatProject();
const repo = (scenario: any | null = thermostatScenario()): SysmlRepository => {
  const r = createEmptyRepository();
  for (const q of THERMO_REQUIREMENTS) r.requirements[q.id] = { ...q, namespace: [], kind: 'requirement', status: 'approved', version: '1' } as any;
  r.verificationCases['vc-thermo'] = {
    id: 'vc-thermo', name: 'Thermostat loop', namespace: [], kind: 'verificationCase', method: 'simulation',
    verifiesRequirementIds: THERMO_REQUIREMENTS.map(q => q.id), ...(scenario ? { simulationScenario: scenario } : {}),
  } as any;
  return r;
};
let seq = 0;
const renderPanel = (r: SysmlRepository = repo(), requirementId = 'req-t1', onRepositoryChange = vi.fn()) => {
  seq = 0;
  render(<SimVerificationPanel repository={r} requirementId={requirementId} project={project} onRepositoryChange={onRepositoryChange}
    now={() => '2026-10-14T12:00:00.000Z'} newId={() => `id-${++seq}`} />);
  return onRepositoryChange;
};

describe('SimVerificationPanel: creating a simulation test case (fixes the dead end)', () => {
  afterEach(cleanup);

  it('offers "New simulation test case" and creates a case that verifies the requirement', () => {
    const r = createEmptyRepository();
    r.requirements['req-t1'] = { ...THERMO_REQUIREMENTS[0], namespace: [], kind: 'requirement', status: 'approved', version: '1' } as any;
    const onChange = renderPanel(r);
    fireEvent.click(screen.getByRole('button', { name: 'New simulation test case' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SysmlRepository;
    expect(next.verificationCases['id-1']).toMatchObject({ method: 'simulation', verifiesRequirementIds: ['req-t1'] });
  });
});

describe('SimVerificationPanel: scenario cases', () => {
  afterEach(cleanup);

  it('shows the execution order and which couplings are delayed by one step', () => {
    renderPanel();
    const sec = screen.getByRole('region', { name: 'Thermostat loop' });
    expect(within(sec).getByText(/State machine → X-Bridges → V-Lab/)).toBeTruthy();
    const couplings = within(sec).getByRole('list', { name: 'Couplings' });
    const items = within(couplings).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toMatch(/same step/);
    expect(items[2].textContent).toMatch(/one-step delay/);
  });

  it('runs the scenario, records evidence and lists every assertion verdict', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Run Thermostat loop' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SysmlRepository;
    const results = Object.values(next.evidence).map(e => [e.requirementId, e.result]);
    expect(results).toHaveLength(5);
    expect(results.every(([, r]) => r === 'passed')).toBe(true);
    const table = screen.getByRole('table', { name: 'Thermostat loop assertions' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toMatch(/REQ-T1/);
    expect(rows[0].textContent).toMatch(/passed/);
    expect(rows[0].textContent).toMatch(/4\.59/);
    expect(screen.getByRole('status', { name: 'Thermostat loop result' }).textContent).toMatch(/5 passed/);
  });

  it('shows a failure with its time and values', () => {
    cleanup();
    seq = 0;
    const onChange = vi.fn();
    render(<SimVerificationPanel repository={repo()} requirementId="req-t2" project={thermostatProject({ upper: 75 })} onRepositoryChange={onChange}
      now={() => '2026-10-14T12:00:00.000Z'} newId={() => `id-${++seq}`} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Thermostat loop' }));
    const rows = within(screen.getByRole('table', { name: 'Thermostat loop assertions' })).getAllByRole('row').slice(1);
    expect(rows[1].textContent).toMatch(/failed/);
    expect(rows[1].textContent).toMatch(/dT = 7\d\./);
    expect(screen.getByRole('status', { name: 'Thermostat loop result' }).textContent).toMatch(/2 failed/);
  });

  it('counts an inconclusive requirement once, and a requirement without assertion as not tested', () => {
    const scenario = thermostatScenario();
    (scenario.assertions as any[])[2] = { ...scenario.assertions[2], temporal: { kind: 'response', trigger: 'dT >= 200', within: 0.2 } };
    const r = repo(scenario);
    r.requirements['req-x'] = { id: 'req-x', requirementId: 'REQ-X', name: 'Extra', text: 'x', namespace: [], kind: 'requirement', status: 'approved', version: '1' } as any;
    (r.verificationCases['vc-thermo'] as any).verifiesRequirementIds.push('req-x');
    renderPanel(r);
    fireEvent.click(screen.getByRole('button', { name: 'Run Thermostat loop' }));
    expect(screen.getByRole('status', { name: 'Thermostat loop result' }).textContent).toBe('4 passed, 0 failed, 1 inconclusive, 1 not tested');
  });

  it('draws a trace plot of the scenario signals after a run', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Run Thermostat loop' }));
    expect(screen.getByRole('img', { name: /Trace of dT/ })).toBeTruthy();
  });

  it('shows validation errors, blocks Save, and saves a valid edit', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Edit scenario for Thermostat loop' }));
    const cond = screen.getByLabelText('Assertion 1 condition') as HTMLInputElement;
    expect(cond.value).toBe('dT >= 60');
    fireEvent.change(cond, { target: { value: 'dT = 60' } });
    expect(screen.getByRole('alert').textContent).toMatch(/==/);
    expect((screen.getByRole('button', { name: 'Save scenario' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(cond, { target: { value: 'dT >= 61' } });
    expect((screen.getByRole('button', { name: 'Save scenario' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
    const saved = (onChange.mock.calls[0][0] as SysmlRepository).verificationCases['vc-thermo'] as any;
    expect(saved.simulationScenario.assertions[0].condition).toBe('dT >= 61');
    expect(saved.simulationScenario.couplings).toHaveLength(3);
  });

  it('builds a scenario from scratch: signal, assertion, save', () => {
    const onChange = renderPanel(repo(null));
    fireEvent.click(screen.getByRole('button', { name: 'Define scenario for Thermostat loop' }));
    fireEvent.change(screen.getByLabelText('Duration (s)'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Step (s)'), { target: { value: '0.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add signal' }));
    fireEvent.change(screen.getByLabelText('Signal 1 alias'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Signal 1 target'), { target: { value: T.heaterOn } });
    fireEvent.click(screen.getByRole('button', { name: 'Add stimulus' }));
    fireEvent.change(screen.getByLabelText('Stimulus 1 target'), { target: { value: T.enable } });
    fireEvent.change(screen.getByLabelText('Stimulus 1 value'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    fireEvent.change(screen.getByLabelText('Assertion 1 condition'), { target: { value: 'x == 1' } });
    fireEvent.change(screen.getByLabelText('Assertion 1 mode'), { target: { value: 'eventually' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
    const s = ((onChange.mock.calls[0][0] as SysmlRepository).verificationCases['vc-thermo'] as any).simulationScenario;
    expect(s).toMatchObject({
      verificationCaseId: 'vc-thermo', duration: 1, step: 0.01,
      signals: [{ alias: 'x', target: T.heaterOn }],
      stimuli: [{ target: T.enable, profile: { kind: 'constant', value: 1 } }],
      assertions: [{ requirementId: 'req-t1', condition: 'x == 1', temporal: { kind: 'eventually' } }],
    });
  });
});

describe('SimVerificationPanel: one scenario verifies several requirements', () => {
  afterEach(cleanup);

  it('adds the requirement chosen for an assertion to the case on Save', () => {
    const r = repo(null);
    (r.verificationCases['vc-thermo'] as any).verifiesRequirementIds = ['req-t1'];
    const onChange = renderPanel(r);
    fireEvent.click(screen.getByRole('button', { name: 'Define scenario for Thermostat loop' }));
    fireEvent.change(screen.getByLabelText('Duration (s)'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Step (s)'), { target: { value: '0.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add signal' }));
    fireEvent.change(screen.getByLabelText('Signal 1 alias'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Signal 1 target'), { target: { value: T.heaterOn } });
    fireEvent.click(screen.getByRole('button', { name: 'Add assertion' }));
    expect((screen.getByLabelText('Assertion 1 requirement') as HTMLSelectElement).value).toBe('req-t1');
    fireEvent.change(screen.getByLabelText('Assertion 1 requirement'), { target: { value: 'req-t5' } });
    fireEvent.change(screen.getByLabelText('Assertion 1 condition'), { target: { value: 'x == 0' } });
    fireEvent.change(screen.getByLabelText('Assertion 1 mode'), { target: { value: 'always' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
    const saved = (onChange.mock.calls[0][0] as SysmlRepository).verificationCases['vc-thermo'] as any;
    expect(saved.verifiesRequirementIds).toEqual(['req-t1', 'req-t5']);
    expect(saved.simulationScenario.assertions[0].requirementId).toBe('req-t5');
  });
});

describe('TraceabilityMatrix: run all simulation tests', () => {
  afterEach(cleanup);

  it('shows the button only when a handler is given, and calls it', () => {
    const onRun = vi.fn();
    render(<TraceabilityMatrix repository={repo()} onRunAllSimulations={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run all simulation tests' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    cleanup();
    render(<TraceabilityMatrix repository={repo()} />);
    expect(screen.queryByRole('button', { name: 'Run all simulation tests' })).toBeNull();
  });
});
