import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { OPMObjectNode } from '../OPMNodeComponents';
describe('opm port pills', () => {
  it('renders port name pills always (not hover-only)', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMObjectNode id="o" selected={false} data={{ name: 'Tank', type: 'object', physical: false, states: [], attributes: [], inputs: [{ id: 'in-1', name: 'Consume', type: 'consumption', direction: 'input', position: 'left' }], outputs: [{ id: 'out-1', name: 'Result', type: 'result', direction: 'output', position: 'right' }] } as any} /></ReactFlowProvider>);
    expect(html).toContain('Consume');
    expect(html).toContain('Result');
    expect(html).toContain('react-flow__handle');
  });
});
