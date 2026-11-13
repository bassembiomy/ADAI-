// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChartExternalFunctionsEditor } from './ChartExternalFunctionsEditor';
import type { ExternalFunctionDef } from '../../types/sm_types';

afterEach(cleanup);

const scale: ExternalFunctionDef = {
  id: 'f1', name: 'scale', header: 'scale.h', returnType: 'int32', params: [{ name: 'x', type: 'int32' }], simulation: 'x * 2',
};

const renderEditor = (overrides: Partial<React.ComponentProps<typeof ChartExternalFunctionsEditor>> = {}) => {
  const props = {
    functions: [scale],
    reservedNames: new Set(['level', 'GO']),
    onAdd: vi.fn(),
    onChange: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ChartExternalFunctionsEditor {...props} />);
  return props;
};

describe('ChartExternalFunctionsEditor', () => {
  it('adds and deletes through callbacks', () => {
    const props = renderEditor();
    fireEvent.click(screen.getByText('ADD FUNCTION'));
    fireEvent.click(screen.getByLabelText('Delete external function scale'));
    expect(props.onAdd).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledWith('f1');
  });

  it('applies valid edits of every field as complete declarations', () => {
    const props = renderEditor();
    fireEvent.change(screen.getByLabelText('External function name scale'), { target: { value: 'scale2' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, name: 'scale2' });
    fireEvent.change(screen.getByLabelText('Return type of scale'), { target: { value: 'float' } });
    // The row keeps its draft, so the edits accumulate until the parent re-renders with the committed value.
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, name: 'scale2', returnType: 'float' });
    fireEvent.change(screen.getByLabelText('Header of scale'), { target: { value: 'dsp/scale.h' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, name: 'scale2', returnType: 'float', header: 'dsp/scale.h' });
    fireEvent.change(screen.getByLabelText('Simulation expression of scale'), { target: { value: 'x + 1' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, name: 'scale2', returnType: 'float', header: 'dsp/scale.h', simulation: 'x + 1' });
  });

  it('adds, retypes and removes parameters', () => {
    const props = renderEditor();
    fireEvent.click(screen.getByLabelText('Add parameter to scale'));
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, params: [{ name: 'x', type: 'int32' }, { name: 'arg1', type: 'int32' }] });
    fireEvent.change(screen.getByLabelText('Parameter 1 type of scale'), { target: { value: 'double' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, params: [{ name: 'x', type: 'double' }, { name: 'arg1', type: 'int32' }] });
    // Removing the parameter the simulation uses makes 'x * 2' refer to an unknown name: shown, not applied.
    fireEvent.click(screen.getByLabelText('Remove parameter 1 of scale'));
    expect(props.onChange).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('alert')[0].textContent).toMatch(/simulation expression/);
    expect(screen.getByText(/Not applied to the chart/)).toBeTruthy();
    // Fixing the expression applies the whole draft.
    fireEvent.change(screen.getByLabelText('Simulation expression of scale'), { target: { value: 'arg1 * 2' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ ...scale, params: [{ name: 'arg1', type: 'int32' }], simulation: 'arg1 * 2' });
  });

  it('shows the engine message for invalid input and does not apply it', () => {
    const props = renderEditor();
    const name = screen.getByLabelText('External function name scale') as HTMLInputElement;
    fireEvent.change(name, { target: { value: '1 bad' } });
    expect(screen.getByRole('alert').textContent).toMatch(/not a valid C identifier/);
    expect(name.value).toBe('1 bad');
    fireEvent.change(name, { target: { value: 'level' } });
    expect(screen.getByRole('alert').textContent).toMatch(/collides with a chart variable or event/);
    fireEvent.change(name, { target: { value: 'sin' } });
    expect(screen.getByRole('alert').textContent).toMatch(/built-in/);
    expect(props.onChange).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'scaled' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(props.onChange).toHaveBeenCalledWith({ ...scale, name: 'scaled' });
  });

  it('reports header and simulation problems', () => {
    const props = renderEditor();
    fireEvent.change(screen.getByLabelText('Header of scale'), { target: { value: '../scale.h' } });
    expect(screen.getByRole('alert').textContent).toMatch(/header/);
    expect(props.onChange).not.toHaveBeenCalled();
    cleanup();
    const second = renderEditor();
    fireEvent.change(screen.getByLabelText('Simulation expression of scale'), { target: { value: '' } });
    expect(screen.getByRole('alert').textContent).toMatch(/empty/);
    expect(second.onChange).not.toHaveBeenCalled();
  });

  it('mentions how many places call the function', () => {
    renderEditor({ callCounts: { scale: 2 } });
    expect(screen.getByText(/Called in 2 places/)).toBeTruthy();
  });

  it('lists nothing but a hint when there are no functions', () => {
    renderEditor({ functions: [] });
    expect(screen.queryAllByTestId('chart-external-function-row')).toHaveLength(0);
    expect(screen.getByText(/No external functions/)).toBeTruthy();
  });
});
