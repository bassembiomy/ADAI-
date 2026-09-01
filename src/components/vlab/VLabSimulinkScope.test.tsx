import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VLabSimulinkScope } from './VLabSimulinkScope';

describe('VLabSimulinkScope', () => {
  const sampleData = [
    { time: 0, in1: 0, in2: 10 },
    { time: 1, in1: 5, in2: 20 },
    { time: 2, in1: 10, in2: 30 }
  ];

  const defaultProps = {
    id: 'scope_1',
    title: 'Oscilloscope 1',
    data: sampleData,
    isPaused: false,
    params: {
      numSignals: { value: 2 },
      time_range: { value: 10 },
      show_grid: { value: 'on' },
      show_legend: { value: 'on' }
    },
    onClose: vi.fn(),
    onUpdate: vi.fn()
  };

  it('renders the scope title and Simulink ribbon toolbar buttons', () => {
    const html = renderToStaticMarkup(<VLabSimulinkScope {...defaultProps} />);
    expect(html).toContain('Oscilloscope 1');
    expect(html).toContain('Autoscale');
    expect(html).toContain('Cursors');
    expect(html).toContain('Stats');
    expect(html).toContain('Layout');
  });

  it('renders phosphor dark background container and status bar', () => {
    const html = renderToStaticMarkup(<VLabSimulinkScope {...defaultProps} />);
    expect(html).toContain('Continuous Acquisition');
    expect(html).toContain('Channels: 2');
  });
});
