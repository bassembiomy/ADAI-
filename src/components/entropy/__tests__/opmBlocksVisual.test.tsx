import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { OPMObjectNode, OPMProcessNode, OPMStateNode } from '../OPMNodeComponents';

const base: any = {
  id: 'n1',
  selected: false,
  data: {
    name: 'Pump',
    type: 'object',
    physical: false,
    states: [],
    attributes: [],
    inputs: [{ id: 'p-in', name: 'Power', type: 'instrument', direction: 'input', position: 'left' }],
    outputs: [{ id: 'p-out', name: 'Pressure', type: 'result', direction: 'output', position: 'right' }],
  },
};

describe('opm bold blocks', () => {
  it('object renders solid header + state slot placeholder', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMObjectNode {...base} /></ReactFlowProvider>);
    expect(html).toContain('«Object»');
    expect(html).toContain('Pump');
    expect(html).toContain('backdrop-blur-md');
  });

  it('active state renders solid orange fill', () => {
    const props: any = { id: 's', selected: false, data: { name: 'On', type: 'state', physical: false, isActive: true } };
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMStateNode {...props} /></ReactFlowProvider>);
    expect(html).toContain('On');
    expect(html).toMatch(/from-orange-500|bg-orange-500/);
  });

  it('selected block carries amber glow ring', () => {
    const props: any = { id: 'p', selected: true, data: { name: 'Heat', type: 'process', physical: false, inputs: [], outputs: [] } };
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMProcessNode {...props} /></ReactFlowProvider>);
    expect(html).toContain('ring-amber-300/40');
  });

  it('ports render directional attributes and indicators for input and output', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMObjectNode {...base} /></ReactFlowProvider>);
    expect(html).toContain('data-port-direction="input"');
    expect(html).toContain('data-port-direction="output"');
    expect(html).toContain('data-testid="port-chevron"');
    // Left port label must be placed outside the block on the left (right: 14px), not inside (left: 12px)
    expect(html).toMatch(/right:\s*14px/);
    // Right port label must be placed outside the block on the right (left: 14px), not inside (right: 12px)
    expect(html).toMatch(/left:\s*14px/);
    // Object input ports are green (#22c55e) and output ports are red (#ef4444)
    expect(html).toContain('#22c55e');
    expect(html).toContain('#ef4444');
  });

  it('firing process renders energy pulse aura and firing data attribute', () => {
    const props: any = {
      id: 'p-firing',
      selected: false,
      data: { name: 'Ignition', type: 'process', physical: false, isFiring: true, inputs: [], outputs: [] },
    };
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMProcessNode {...props} /></ReactFlowProvider>);
    expect(html).toContain('data-process-firing="true"');
    expect(html).toContain('shadow-[0_0_30px_rgba(251,146,60,0.85)');
  });
});
