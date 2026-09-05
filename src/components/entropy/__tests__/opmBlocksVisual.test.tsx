import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { OPMObjectNode, OPMProcessNode, OPMStateNode } from '../OPMNodeComponents';

const base: any = { id: 'n1', selected: false, data: { name: 'Pump', type: 'object', physical: false, states: [], attributes: [], inputs: [], outputs: [] } };
describe('opm bold blocks', () => {
  it('object renders solid header + state slot placeholder', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMObjectNode {...base} /></ReactFlowProvider>);
    expect(html).toContain('«Object»');
    expect(html).toContain('Pump');
  });
  it('active state renders solid orange fill', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMStateNode id="s" selected={false} data={{ name: 'On', type: 'state', physical: false, isActive: true } as any} /></ReactFlowProvider>);
    expect(html).toContain('On');
    expect(html).toMatch(/from-orange-500|bg-orange-500/);
  });
  it('selected block carries amber glow ring', () => {
    const html = renderToStaticMarkup(<ReactFlowProvider><OPMProcessNode id="p" selected data={{ name: 'Heat', type: 'process', physical: false, inputs: [], outputs: [] } as any} /></ReactFlowProvider>);
    expect(html).toContain('ring-amber-300/40');
  });
});
