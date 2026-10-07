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

  it('draws one trace per component of a width-3 signal, labelled <block>.<port>[<channel>] (WP-09c)', () => {
    const nodes = [
      { id: 'sine', type: 'default', data: { type: 'ps_sine_3phase', label: 'Sine' } },
      { id: 'park', type: 'default', data: { type: 'park_transform', label: 'Park' } },
      { id: 'scope_1', type: 'default', data: { type: 'scope' } },
    ];
    const abc = [{ time: 0, 'in1[a]': 0, 'in1[b]': -86.6, 'in1[c]': 86.6 }, { time: 1, 'in1[a]': 100, 'in1[b]': 0, 'in1[c]': -100 }];
    const html = renderToStaticMarkup(
      <VLabSimulinkScope {...defaultProps} data={abc} params={{ ...defaultProps.params, numSignals: { value: 1 } }}
        nodes={nodes} edges={[{ id: 'e', source: 'sine', sourceHandle: 'sine-abc', target: 'scope_1', targetHandle: 'scope_1-in1' }]} />,
    );
    for (const name of ['a', 'b', 'c']) expect(html).toContain(`Sine.abc[${name}]`);
    expect(html).toContain('three-phase sine voltage');
    expect(html).toContain('Channels: 1 (3 traces)');
    // dq0: d, q, 0
    const dq = renderToStaticMarkup(
      <VLabSimulinkScope {...defaultProps} data={[{ time: 0, 'in1[d]': 1, 'in1[q]': 0, 'in1[0]': 0 }]} params={{ ...defaultProps.params, numSignals: { value: 1 } }}
        nodes={nodes} edges={[{ id: 'e', source: 'park', sourceHandle: 'park-dq0', target: 'scope_1', targetHandle: 'scope_1-in1' }]} />,
    );
    for (const name of ['d', 'q', '0']) expect(dq).toContain(`Park.dq0[${name}]`);
  });

  it('renders simulation speed multiplier button with current rate', () => {
    const html = renderToStaticMarkup(<VLabSimulinkScope {...defaultProps} simSpeed={3} onSpeedChange={vi.fn()} />);
    expect(html).toContain('3×');
    expect(html).toContain('Speed (Simulation Rate)');
  });

  describe('WP-40 channel labels', () => {
    const sensor = { id: 'vs', type: 'default', data: { type: 'v_sensor', label: 'Vsense' } };
    const motion = { id: 'mot', type: 'default', data: { type: 'rot_motion_sensor', label: 'Shaft' } };
    const scope = (numSignals: number) => ({ id: 'scope_1', type: 'default', data: { type: 'scope' }, numSignals });
    const wire = (id: string, source: string, sourceHandle: string, ch: number) =>
      ({ id, source, sourceHandle, target: 'scope_1', targetHandle: `scope_1-in${ch}` });
    const render = (nodes: any[], edges: any[], n: number, data: any[]) => renderToStaticMarkup(
      <VLabSimulinkScope {...defaultProps} data={data} nodes={nodes} edges={edges} params={{ ...defaultProps.params, numSignals: { value: n } }} />,
    );

    it('labels each scalar channel "<block>.<port> - <quantity> [<unit>]"', () => {
      const html = render([sensor, motion, scope(2)], [wire('e1', 'vs', 'vs-v', 1), wire('e2', 'mot', 'mot-w', 2)], 2,
        [{ time: 0, in1: 1, in2: 2 }, { time: 1, in1: 2, in2: 3 }]);
      expect(html).toContain('Vsense.V — voltage [V]');
      expect(html).toContain('Shaft.W — angular velocity [rad/s]');
    });

    it('reopens an old saved scope with the same channels (legacy handle ids, numSignals preserved)', () => {
      // a model saved before WP-09b: edges use the `<port>_s` / `in<k>_t` handle ids; the scope keeps numSignals = 2
      const saved = JSON.parse(JSON.stringify({
        nodes: [sensor, motion, scope(2)],
        edges: [{ id: 'a', source: 'vs', sourceHandle: 'v_s', target: 'scope_1', targetHandle: 'in1_t' }, { id: 'b', source: 'mot', sourceHandle: 'w_s', target: 'scope_1', targetHandle: 'in2_t' }],
      }));
      const data = [{ time: 0, in1: 1, in2: 2 }, { time: 1, in1: 2, in2: 3 }];
      const html = render(saved.nodes, saved.edges, 2, data);
      expect(html).toContain('Channels: 2');
      expect(html).toContain('Vsense.V — voltage [V]');
      expect(html).toContain('Shaft.W — angular velocity [rad/s]');
      expect(html).not.toContain('Unconnected');
    });

    it('shows N traces with the channel names of a vector channel, each labelled with the port and its quantity', () => {
      const sine = { id: 'sine', type: 'default', data: { type: 'ps_sine_3phase', label: 'Sine' } };
      const abc = [{ time: 0, 'in1[a]': 0, 'in1[b]': -86.6, 'in1[c]': 86.6 }, { time: 1, 'in1[a]': 100, 'in1[b]': 0, 'in1[c]': -100 }];
      const html = render([sine, scope(1)], [wire('e', 'sine', 'sine-abc', 1)], 1, abc);
      expect(html).toContain('Channels: 1 (3 traces)');
      for (const name of ['a', 'b', 'c']) expect(html).toContain(`Sine.abc[${name}]`);
    });

    it('labels an unwired channel as unconnected instead of inventing a source', () => {
      const html = render([sensor, scope(2)], [wire('e1', 'vs', 'vs-v', 1)], 2, [{ time: 0, in1: 1 }, { time: 1, in1: 2 }]);
      expect(html).toContain('Vsense.V — voltage [V]');
      expect(html).toContain('Channel 2');
    });
  });});
