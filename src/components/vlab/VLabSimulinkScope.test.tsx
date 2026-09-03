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

  it('renders a Clear Data button in the ribbon toolbar', () => {
    const html = renderToStaticMarkup(<VLabSimulinkScope {...defaultProps} onClear={vi.fn()} />);
    expect(html).toContain('Clear Scope Data');
  });

  it('isolates the latest run when time resets so it does not connect across restarts', () => {
    // Data containing an old run (time 0 -> 10) and a restarted run (time 0 -> 2)
    const multiRunData = [
      { time: 0, in1: 293 },
      { time: 10, in1: 311 },
      { time: 0, in1: 293 },
      { time: 1, in1: 295 },
      { time: 2, in1: 297 }
    ];
    const html = renderToStaticMarkup(<VLabSimulinkScope {...defaultProps} data={multiRunData} />);
    // Should display only the 3 samples from the current active run (0, 1, 2)
    expect(html).toContain('Samples: 3 pts');
  });

  it('renders simulation speed multiplier button with current rate', () => {
    const html = renderToStaticMarkup(<VLabSimulinkScope {...defaultProps} simSpeed={3} onSpeedChange={vi.fn()} />);
    expect(html).toContain('3×');
    expect(html).toContain('Speed (Simulation Rate)');
  });
});
