import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import { VLabNode } from './VLabNode';

describe('VLabNode Schematic Presentation', () => {
  it('renders schematic symbol and instance label without upper type header', () => {
    const data = {
      type: 'resistor',
      label: 'R1',
      color: '#3b82f6',
      rotation: 0,
      ports: [
        { id: 'p1', pos: 'left', label: '+' },
        { id: 'p2', pos: 'right', label: '-' }
      ]
    };

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <VLabNode id="node_1" data={data} selected={false} />
      </ReactFlowProvider>
    );

    // Instance label should be rendered
    expect(html).toContain('R1');

    // Redundant type header caption should not be present
    expect(html).not.toContain('Resistor');

    // The node root element has vlab-node class
    expect(html).toContain('vlab-node');
  });

  it('applies symbol-bright highlighting when selected', () => {
    const data = {
      type: 'dc_voltage',
      label: 'V1',
      color: '#ef4444',
      rotation: 0,
      ports: []
    };

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <VLabNode id="node_2" data={data} selected={true} />
      </ReactFlowProvider>
    );

    expect(html).toContain('symbol-bright');
  });

  it('renders hydraulic conserving ports as connectable targets as well as sources', () => {
    const data = {
      type: 'hydraulic_reference_il',
      label: 'Hydraulic Reference',
      color: '#2563eb',
      rotation: 0,
      ports: [{ id: 'a', pos: 'top', label: 'A', domain: 'isothermal_liquid' }]
    };

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <VLabNode id="hydraulic_ref_1" data={data} selected={false} />
      </ReactFlowProvider>
    );

    expect(html).toContain('data-id="1-null-hydraulic_ref_1-a-source"');
    expect(html).toContain('data-id="1-null-hydraulic_ref_1-a-target"');
  });
});
