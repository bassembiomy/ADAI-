// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChartEventsEditor } from './ChartEventsEditor';

afterEach(cleanup);

describe('ChartEventsEditor', () => {
  const events = [{ id: '1', name: 'GO', scope: 'input' as const }];

  it('adds, changes scope and deletes through callbacks', () => {
    const onAdd = vi.fn();
    const onScopeChange = vi.fn();
    const onDelete = vi.fn();
    render(<ChartEventsEditor events={events} onAdd={onAdd} onRename={() => null} onScopeChange={onScopeChange} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('ADD EVENT'));
    fireEvent.change(screen.getByLabelText('Scope of event GO'), { target: { value: 'local' } });
    fireEvent.click(screen.getByLabelText('Delete event GO'));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onScopeChange).toHaveBeenCalledWith('1', 'local');
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('shows the validation error returned by a rename and keeps the typed draft', () => {
    const onRename = vi.fn((_id: string, name: string) => (name === 'bad name' ? "Event name 'bad name' is not a valid C identifier." : null));
    render(<ChartEventsEditor events={events} onAdd={() => {}} onRename={onRename} onScopeChange={() => {}} onDelete={() => {}} />);
    const input = screen.getByLabelText('Event name GO') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bad name' } });
    expect(screen.getByRole('alert').textContent).toMatch(/not a valid C identifier/);
    expect(input.value).toBe('bad name');
    fireEvent.change(input, { target: { value: 'RUN' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onRename).toHaveBeenLastCalledWith('1', 'RUN');
  });

  it('lists nothing but a hint when there are no events', () => {
    render(<ChartEventsEditor events={[]} onAdd={() => {}} onRename={() => null} onScopeChange={() => {}} onDelete={() => {}} />);
    expect(screen.queryAllByTestId('chart-event-row')).toHaveLength(0);
    expect(screen.getByText(/No events/)).toBeTruthy();
  });
});
