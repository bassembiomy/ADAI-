import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import { VLabNode, formatNodeParameterBadge } from './VLabNode';

describe('VLabNode Inline Renaming & Parameter Badges', () => {
  it('formats parameter badge cleanly for electrical, control, and thermal blocks', () => {
    const resistorParams = { R: { value: 100, unit: 'Ω' } };
    expect(formatNodeParameterBadge('resistor', resistorParams)).toBe('100 Ω');

    const dcParams = { V: { value: 24, unit: 'V' } };
    expect(formatNodeParameterBadge('dc_voltage', dcParams)).toBe('24 V');

    const gainParams = { K: { value: 2.5, unit: '' } };
    expect(formatNodeParameterBadge('ps_gain', gainParams)).toBe('K = 2.5');

    const thermalParams = { Rth: { value: 35, unit: 'K/W' } };
    expect(formatNodeParameterBadge('thermal_resistor', thermalParams)).toBe('35 K/W');
  });

  it('renders instance label with interactive rename support and parameter badge on canvas', () => {
    const data = {
      type: 'resistor',
      label: 'Load_Resistor_1',
      color: '#3b82f6',
      params: { R: { value: 220, unit: 'Ω' } },
      ports: []
    };

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <VLabNode id="res_1" data={data} selected={false} />
      </ReactFlowProvider>
    );

    // Should contain the block name and the parameter badge
    expect(html).toContain('Load_Resistor_1');
    expect(html).toContain('220 Ω');
  });
});
