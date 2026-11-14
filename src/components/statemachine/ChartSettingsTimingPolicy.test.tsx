// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChartSettingsEditor } from './ChartSettingsEditor';

afterEach(cleanup);

const renderSettings = (overrides: Partial<React.ComponentProps<typeof ChartSettingsEditor>> = {}) => {
  const props = {
    fixedPointRounding: undefined,
    onFixedPointRoundingChange: vi.fn(),
    timingFaultPolicy: undefined,
    onTimingFaultPolicyChange: vi.fn(),
    codePrefix: undefined,
    onCodePrefixChange: vi.fn(),
    enterAtFirstStep: false,
    onEnterAtFirstStepChange: vi.fn(),
    ...overrides,
  };
  render(<ChartSettingsEditor {...props} />);
  return props;
};

describe('ChartSettingsEditor late/early tick policy', () => {
  it('defaults to the latch fault and stores Monitor as the policy', () => {
    const props = renderSettings();
    const select = screen.getByLabelText('Late/early tick policy') as HTMLSelectElement;
    expect(select.value).toBe('latch');
    expect(select.getAttribute('data-help-feature')).toBe('app-chart-timing-policy');
    fireEvent.change(select, { target: { value: 'monitor' } });
    expect(props.onTimingFaultPolicyChange).toHaveBeenLastCalledWith('monitor');
    fireEvent.change(select, { target: { value: 'latch' } });
    expect(props.onTimingFaultPolicyChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows the stored Monitor policy', () => {
    renderSettings({ timingFaultPolicy: 'monitor' });
    expect((screen.getByLabelText('Late/early tick policy') as HTMLSelectElement).value).toBe('monitor');
  });
});
