// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChartSettingsEditor } from './ChartSettingsEditor';
import { FixedPointFormatEditor } from './FixedPointFormatEditor';

afterEach(cleanup);

const renderSettings = (overrides: Partial<React.ComponentProps<typeof ChartSettingsEditor>> = {}) => {
  const props = {
    fixedPointRounding: undefined,
    onFixedPointRoundingChange: vi.fn(),
    codePrefix: undefined,
    onCodePrefixChange: vi.fn(),
    enterAtFirstStep: false,
    onEnterAtFirstStepChange: vi.fn(),
    ...overrides,
  };
  render(<ChartSettingsEditor {...props} />);
  return props;
};

describe('ChartSettingsEditor', () => {
  it('changes the fixed-point rounding; Floor is stored as the default', () => {
    const props = renderSettings();
    const select = screen.getByLabelText('Fixed-point rounding') as HTMLSelectElement;
    expect(select.value).toBe('floor');
    fireEvent.change(select, { target: { value: 'nearest' } });
    expect(props.onFixedPointRoundingChange).toHaveBeenLastCalledWith('nearest');
    fireEvent.change(select, { target: { value: 'floor' } });
    expect(props.onFixedPointRoundingChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows the prefixed file names and stores a valid prefix', () => {
    const props = renderSettings();
    expect(screen.getByTestId('code-prefix-files').textContent).toContain('sm_core.c');
    fireEvent.change(screen.getByLabelText('Code prefix'), { target: { value: 'PUMP' } });
    expect(props.onCodePrefixChange).toHaveBeenLastCalledWith('PUMP');
  });

  it('reflects a stored prefix in the file hint', () => {
    renderSettings({ codePrefix: 'PUMP' });
    expect(screen.getByTestId('code-prefix-files').textContent).toBe('Files: pump_core.c, pump_core.h');
  });

  it('rejects an invalid prefix inline without storing it', () => {
    const props = renderSettings();
    const input = screen.getByLabelText('Code prefix') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pump' } });
    expect(screen.getByRole('alert').textContent).toMatch(/must match/);
    expect(input.value).toBe('pump');
    fireEvent.change(input, { target: { value: 'MCAL' } });
    expect(screen.getByRole('alert').textContent).toMatch(/reserved by ADIA/);
    expect(props.onCodePrefixChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(props.onCodePrefixChange).toHaveBeenLastCalledWith(undefined);
  });

  it('toggles entering the chart at the first step', () => {
    const props = renderSettings();
    fireEvent.click(screen.getByLabelText('Enter chart at first step (chart settings)'));
    expect(props.onEnterAtFirstStepChange).toHaveBeenCalledWith(true);
  });
});

describe('FixedPointFormatEditor', () => {
  const value = { signed: true, wordLength: 16 as const, fractionLength: 8 };

  it('edits signed, word length and fraction length', () => {
    const onChange = vi.fn();
    render(<FixedPointFormatEditor label="level" value={value} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Signed level'));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, signed: false });
    fireEvent.change(screen.getByLabelText('Word length level'), { target: { value: '32' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, wordLength: 32 });
    fireEvent.change(screen.getByLabelText('Fraction length level'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, fractionLength: 4 });
  });

  it('shows an inline error for a fraction length outside 0..word length and keeps the format', () => {
    const onChange = vi.fn();
    render(<FixedPointFormatEditor label="level" value={value} onChange={onChange} />);
    const input = screen.getByLabelText('Fraction length level') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '17' } });
    expect(screen.getByRole('alert').textContent).toMatch(/0 to 16/);
    expect(input.value).toBe('17');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '16' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ ...value, fractionLength: 16 });
  });

  it('reduces a fraction length that no longer fits and says so', () => {
    const onChange = vi.fn();
    render(<FixedPointFormatEditor label="level" value={{ signed: true, wordLength: 32, fractionLength: 20 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Word length level'), { target: { value: '8' } });
    expect(onChange).toHaveBeenLastCalledWith({ signed: true, wordLength: 8, fractionLength: 8 });
    expect(screen.getByRole('status').textContent).toMatch(/reduced to 8/);
  });

  it('describes the range', () => {
    render(<FixedPointFormatEditor label="level" value={{ signed: true, wordLength: 8, fractionLength: 4 }} onChange={() => {}} />);
    expect(screen.getByText(/-8 to 7.9375, step 0.0625/)).toBeTruthy();
  });
});
