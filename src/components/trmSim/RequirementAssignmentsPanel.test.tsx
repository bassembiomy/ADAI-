// @vitest-environment jsdom
// WP-10b acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-10b
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequirementAssignmentsPanel } from './RequirementAssignmentsPanel';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';

const Y = 'sim:xb/global/i1/y';
const IC = 'sim:xb/global/i1/$param/initial_condition';
const targets = [
  { target: Y, name: 'INTEGRATOR_CONTINUOUS.y', engine: 'xb' as const },
  { target: IC, name: 'INTEGRATOR_CONTINUOUS.initial_condition', engine: 'xb' as const },
];

const repo = (): SysmlRepository => {
  const r = createEmptyRepository();
  const req = (id: string, requirementId: string, name: string) => ({ id, name, namespace: [], kind: 'requirement', requirementId, text: 't', status: 'draft', version: '1' } as any);
  r.requirements.req1 = req('req1', 'REQ-1', 'Heat up');
  r.requirements.req2 = req('req2', 'REQ-2', 'Stay safe');
  r.relationships.a = { id: 'a', kind: 'satisfy', sourceId: Y, targetId: 'req1' } as any;
  r.relationships.b = { id: 'b', kind: 'trace', sourceId: 'req2', targetId: IC } as any;
  r.relationships.c = { id: 'c', kind: 'satisfy', sourceId: 'sim:xb/global/other/y', targetId: 'req2' } as any;
  r.relationships.d = { id: 'd', kind: 'deriveReqt', sourceId: 'req1', targetId: 'req2' } as any;
  return r;
};

const renderPanel = (r = repo(), onRepositoryChange = vi.fn()) => {
  render(<RequirementAssignmentsPanel repository={r} elementName="Integrator" targets={targets} onRepositoryChange={onRepositoryChange} newId={() => 'rel-new'} />);
  return onRepositoryChange;
};

describe('RequirementAssignmentsPanel', () => {
  afterEach(cleanup);

  it('lists the requirements linked to any port or parameter of the element, in either direction', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: 'Requirements of Integrator' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Linked requirements' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const text = items.map(i => i.textContent ?? '').join('\n');
    expect(text).toMatch(/REQ-1/);
    expect(text).toMatch(/satisfy/);
    expect(text).toMatch(/INTEGRATOR_CONTINUOUS\.y/);
    expect(text).toMatch(/REQ-2/);
    expect(text).toMatch(/trace/);
    expect(text).not.toMatch(/other/);
  });

  it('links a requirement to the chosen port with the chosen kind, element to requirement', () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText('Requirement'), { target: { value: 'req2' } });
    const element = screen.getByLabelText('Link element') as HTMLSelectElement;
    expect([...element.options].map(o => o.value)).toEqual(expect.arrayContaining([Y, IC]));
    fireEvent.change(element, { target: { value: Y } });
    fireEvent.change(screen.getByLabelText('Link kind'), { target: { value: 'verify' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link requirement' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SysmlRepository;
    expect(next.relationships['rel-new']).toMatchObject({ id: 'rel-new', kind: 'verify', sourceId: Y, targetId: 'req2' });
    expect(Object.keys(next.relationships).sort()).toEqual(['a', 'b', 'c', 'd', 'rel-new']);
  });

  it('defaults to the first element and satisfy, and does not mutate the repository it was given', () => {
    const r = repo();
    const before = structuredClone(r);
    const onChange = renderPanel(r);
    fireEvent.change(screen.getByLabelText('Requirement'), { target: { value: 'req2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link requirement' }));
    expect(onChange.mock.calls[0][0].relationships['rel-new']).toMatchObject({ kind: 'satisfy', sourceId: Y, targetId: 'req2' });
    expect(r).toEqual(before);
  });

  it('does not create a duplicate of an existing link', () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText('Requirement'), { target: { value: 'req1' } });
    fireEvent.change(screen.getByLabelText('Link element'), { target: { value: Y } });
    fireEvent.change(screen.getByLabelText('Link kind'), { target: { value: 'satisfy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link requirement' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing until a requirement is chosen', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Link requirement' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes one link', () => {
    const onChange = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink REQ-2 from INTEGRATOR_CONTINUOUS.initial_condition' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SysmlRepository;
    expect(next.relationships.b).toBeUndefined();
    expect(Object.keys(next.relationships).sort()).toEqual(['a', 'c', 'd']);
  });

  it('says so when the repository has no requirements', () => {
    const r = createEmptyRepository();
    renderPanel(r);
    expect(screen.getByText(/No requirements/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Link requirement' })).toBeNull();
  });

  it('says so when the element exposes nothing to link', () => {
    render(<RequirementAssignmentsPanel repository={repo()} elementName="Scope" targets={[]} onRepositoryChange={vi.fn()} />);
    expect(screen.getByText(/nothing to link/i)).toBeTruthy();
  });
});
