// @vitest-environment jsdom
// WP-10 acceptance tests, panel (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-10
import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimVerificationPanel } from './SimVerificationPanel';
import { createEmptyRepository } from '../../engine/sysml/model';
import type { SimCriterion } from '../../engine/trmSim/simCriterion';

const heater = JSON.parse(readFileSync(new URL('../../../inductance_heater.json', import.meta.url), 'utf8'));
const POWER = 'sim:sm/var/6178d014-831f-4339-8dac-f275360b1222';
const UP = 'sim:sm/var/1d1ef5eb-3e8d-4e62-9f78-10f3eeb228a3';
const HEATER = 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea';

const crit = (over: Partial<SimCriterion> = {}): SimCriterion => ({
  id: 'crit-sm', requirementId: 'req1', verificationCaseId: 'vc1',
  stimuli: [
    { target: POWER, profile: { kind: 'step', before: 0, after: 1, at: 0.005 } },
    { target: UP, profile: { kind: 'step', before: 0, after: 1, at: 0.03 } },
  ],
  observe: HEATER, check: { kind: 'reaches', value: 60, by: 0.1 }, duration: 0.1, step: 0.01, ...over,
});

const repo = (c: SimCriterion | undefined = crit()) => {
  const r = createEmptyRepository();
  r.requirements.req1 = { id: 'req1', name: 'Heat up', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Heater reaches 60', status: 'draft', version: '1' } as any;
  r.verificationCases.vc1 = { id: 'vc1', name: 'Heat test', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req1'], ...(c ? { simulationCriterion: c } : {}) } as any;
  r.relationships.a = { id: 'a', kind: 'satisfy', sourceId: HEATER, targetId: 'req1' } as any;
  return r;
};

const renderPanel = (r = repo(), onRepositoryChange = vi.fn()) => {
  render(<SimVerificationPanel repository={r} requirementId="req1" project={heater} onRepositoryChange={onRepositoryChange} now={() => '2026-10-14T00:00:00.000Z'} newId={() => 'ev-new'} />);
  return onRepositoryChange;
};

describe('SimVerificationPanel', () => {
  afterEach(cleanup);

  it('shows the requirement and the simulation targets linked to it', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: /REQ-1/ })).toBeTruthy();
    const linked = screen.getByRole('list', { name: 'Linked simulation targets' });
    expect(within(linked).getByText(/HEATER/)).toBeTruthy();
    expect(within(linked).getByText(/satisfy/)).toBeTruthy();
  });

  it('runs a simulation case and records passing evidence', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Run Heat test' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.evidence['ev-new']).toMatchObject({ result: 'passed', verificationCaseId: 'vc1' });
    expect(screen.getByRole('status', { name: 'Heat test result' }).textContent).toMatch(/Passed/);
  });

  it('shows where a failing run first violated the check', () => {
    renderPanel(repo(crit({ check: { kind: '<=', value: 55, window: [0, 0.1] } })));
    fireEvent.click(screen.getByRole('button', { name: 'Run Heat test' }));
    const status = screen.getByRole('status', { name: 'Heat test result' }).textContent ?? '';
    expect(status).toMatch(/Failed/);
    expect(status).toMatch(/60/);
  });

  it('shows run diagnostics and records nothing when the run cannot start', () => {
    const onChange = renderPanel(repo(crit({ observe: 'sim:sm/var/gone' })));
    fireEvent.click(screen.getByRole('button', { name: 'Run Heat test' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Heat test result' }).textContent).toMatch(/UNKNOWN_TARGET/);
  });

  it('shows the status of recorded evidence, stale once the model changed', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Run Heat test' }));
    const recorded = onChange.mock.calls[0][0];
    cleanup();
    const edited = { ...heater, states: heater.states.map((s: any) => s.name === 'HEATER_UP' ? { ...s, entry: 'UP=false;HEATER=HEATER+20;' } : s) };
    render(<SimVerificationPanel repository={recorded} requirementId="req1" project={edited} onRepositoryChange={vi.fn()} />);
    expect(screen.getByText(/stale/i)).toBeTruthy();
  });

  it('lets the user define a criterion on a case without one, from the model ports and variables', () => {
    const onChange = renderPanel(repo(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Define criterion for Heat test' }));
    const observe = screen.getByLabelText('Observe') as HTMLSelectElement;
    expect([...observe.options].map(o => o.value)).toEqual(expect.arrayContaining([HEATER, POWER]));
    fireEvent.change(observe, { target: { value: HEATER } });
    fireEvent.change(screen.getByLabelText('Check'), { target: { value: 'reaches' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('By (s)'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Duration (s)'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Step (s)'), { target: { value: '0.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add stimulus' }));
    fireEvent.change(screen.getByLabelText('Stimulus 1 target'), { target: { value: POWER } });
    fireEvent.change(screen.getByLabelText('Stimulus 1 profile'), { target: { value: 'constant' } });
    fireEvent.change(screen.getByLabelText('Stimulus 1 value'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save criterion' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0].verificationCases.vc1.simulationCriterion as SimCriterion;
    expect(saved).toMatchObject({
      requirementId: 'req1', verificationCaseId: 'vc1', observe: HEATER,
      check: { kind: 'reaches', value: 60, by: 0.1 }, duration: 0.1, step: 0.01,
      stimuli: [{ target: POWER, profile: { kind: 'constant', value: 1 } }],
    });
  });

  it('does not save an invalid criterion and says why', () => {
    const onChange = renderPanel(repo(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Define criterion for Heat test' }));
    fireEvent.change(screen.getByLabelText('Observe'), { target: { value: HEATER } });
    fireEvent.change(screen.getByLabelText('Duration (s)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save criterion' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/duration/i);
  });

  it('links the requirement to any port, variable or parameter of the models', () => {
    const onChange = renderPanel();
    const target = screen.getByLabelText('Link target') as HTMLSelectElement;
    expect([...target.options].map(o => o.value)).toEqual(expect.arrayContaining([POWER, HEATER]));
    fireEvent.change(target, { target: { value: POWER } });
    fireEvent.change(screen.getByLabelText('Link kind'), { target: { value: 'verify' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const rels = Object.values(onChange.mock.calls[0][0].relationships) as any[];
    expect(rels).toContainEqual(expect.objectContaining({ kind: 'verify', sourceId: POWER, targetId: 'req1' }));
  });

  it('removes a link', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink HEATER' }));
    expect(onChange.mock.calls[0][0].relationships.a).toBeUndefined();
  });

  it('says so when no simulation case verifies the requirement', () => {
    const r = repo();
    delete r.verificationCases.vc1;
    renderPanel(r);
    expect(screen.getByText(/No simulation verification case/i)).toBeTruthy();
  });
});
