// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VLabParamField } from './VLabParamField';
import { validateParamText } from './vlabParamEditing';

afterEach(cleanup);

// Schema (vlabLibrary): resistor.R > 0 [Ω]; capacitor.v0 unbounded [V]; dc_voltage.R_int >= 0 [Ω]; transformer.N12 != 0.
const setup = (blockType: string, key: string, value: number, unit?: string) => {
  const onCommit = vi.fn();
  const utils = render(<VLabParamField blockType={blockType} paramKey={key} param={{ value, unit, label: key }} onCommit={onCommit} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  return { onCommit, input, type, ...utils };
};

describe('V-Lab numeric parameter field (schema-driven validation)', () => {
  it('accepts 0 where the schema allows it and commits the number 0, not a default', () => {
    const { onCommit, type, input } = setup('capacitor', 'v0', 5, 'V');
    type('0');
    expect(onCommit).toHaveBeenLastCalledWith(0);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts decimal fractions and keeps the typed text', () => {
    const { onCommit, type, input } = setup('dc_voltage', 'R_int', 1, 'Ω');
    type('0.0125');
    expect(onCommit).toHaveBeenLastCalledWith(0.0125);
    expect(input.value).toBe('0.0125');
  });

  it('accepts a negative value where the schema allows it', () => {
    const { onCommit, type } = setup('dc_voltage', 'V', 12, 'V');
    type('-48.5');
    expect(onCommit).toHaveBeenLastCalledWith(-48.5);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([['1e-3', 0.001], ['-2.5E+4', -25000], ['2.2e3', 2200], ['.5', 0.5]])('accepts scientific notation %s', (text, expected) => {
    const { onCommit, type } = setup('capacitor', 'v0', 1, 'V');
    type(text);
    expect(onCommit).toHaveBeenLastCalledWith(expected);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the SI unit next to the value', () => {
    setup('resistor', 'R', 100, 'Ω');
    expect(screen.getByTestId('vlab-param-unit-R').textContent).toBe('Ω');
  });

  it('falls back to the schema unit when the saved parameter carries none', () => {
    setup('resistor', 'R', 100);
    expect(screen.getByTestId('vlab-param-unit-R').textContent).toBe('Ω');
  });

  it('rejects an out-of-bounds value with an inline error and does not commit it', () => {
    const { onCommit, type, input } = setup('resistor', 'R', 100, 'Ω');
    type('0');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/> 0/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    type('-5');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/out of range/);
  });

  it('applies the nonZero bound but keeps the sign free', () => {
    const { onCommit, type } = setup('transformer', 'N12', 0.1, '1');
    type('0');
    expect(screen.getByRole('alert').textContent).toMatch(/!= 0/);
    expect(onCommit).not.toHaveBeenCalled();
    type('-0.5');
    expect(onCommit).toHaveBeenLastCalledWith(-0.5);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['abc', '1,5', '1e', '--3', '', ' '])('shows an inline error for invalid text %j instead of reverting', (text) => {
    const { onCommit, type, input } = setup('capacitor', 'v0', 7, 'V');
    type(text);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(input.value).toBe(text);
  });

  it('preserves the entered text after blur, valid or not', () => {
    const { type, input } = setup('resistor', 'R', 100, 'Ω');
    type('2.50e2');
    fireEvent.blur(input);
    expect(input.value).toBe('2.50e2');
    type('-1');
    fireEvent.blur(input);
    expect(input.value).toBe('-1');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows the model value again when it changes from outside (undo / another model)', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<VLabParamField blockType="resistor" paramKey="R" param={{ value: 100, unit: 'Ω' }} onCommit={onCommit} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bad' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<VLabParamField blockType="resistor" paramKey="R" param={{ value: 47, unit: 'Ω' }} onCommit={onCommit} />);
    expect(input.value).toBe('47');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('forwards data-help attributes to the input', () => {
    const { container } = render(<VLabParamField data-help-feature="f" data-help-source="s" blockType="resistor" paramKey="R" param={{ value: 1 }} onCommit={() => {}} />);
    const input = container.querySelector('input')!;
    expect(input.getAttribute('data-help-feature')).toBe('f');
    expect(input.getAttribute('data-help-source')).toBe('s');
  });

  it('leaves a text parameter free-form', () => {
    const onCommit = vi.fn();
    render(<VLabParamField blockType="scope" paramKey="name" param={{ value: 'abc', label: 'name' }} onCommit={onCommit} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my scope' } });
    expect(onCommit).toHaveBeenLastCalledWith('my scope');
  });

  it('validateParamText uses only the schema bounds (exclusive and inclusive)', () => {
    expect(validateParamText('0', { min: 0, exclusiveMin: true, unit: 'Ω' }).ok).toBe(false);
    expect(validateParamText('0', { min: 0, unit: 'Ω' })).toEqual({ ok: true, value: 0 });
    expect(validateParamText('-1e-9', {})).toEqual({ ok: true, value: -1e-9 });
    expect(validateParamText('1.5', { min: 0, max: 1 }).ok).toBe(false);
  });
});
