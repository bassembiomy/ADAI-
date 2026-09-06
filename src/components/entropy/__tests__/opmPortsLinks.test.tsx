import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { OPMObjectNode } from '../OPMNodeComponents';
import { OPMEdge } from '../OPMEdgeComponents';
const ObjectNode = OPMObjectNode as React.FC<any>;
const EdgeComponent = OPMEdge as React.FC<any>;

describe('opm port pills', () => {
  it('renders port name pills always (not hover-only)', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><ObjectNode id="o" selected={false} data={{ name: 'Tank', type: 'object', physical: false, states: [], attributes: [], inputs: [{ id: 'in-1', name: 'Consume', type: 'consumption', direction: 'input', position: 'left' }], outputs: [{ id: 'out-1', name: 'Result', type: 'result', direction: 'output', position: 'right' }] }} /></ReactFlowProvider>);
    expect(html).toContain('Consume');
    expect(html).toContain('Result');
    expect(html).toContain('react-flow__handle');
    expect(html).toContain('opacity-100');
    expect(html).not.toContain('opacity-0');
  });
});
it('renders bezier link with always-on type chip', () => {
  const html = renderToStaticMarkup(<ReactFlowProvider><EdgeComponent id="e1" sourceX={0} sourceY={0} targetX={100} targetY={100} sourcePosition={'right'} targetPosition={'left'} data={{ type: 'result', linkType: 'result' }} selected={false} /></ReactFlowProvider>);
  expect(html).toContain('data-testid="opm-link-chip-result"');
});
