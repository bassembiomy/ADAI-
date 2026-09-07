import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { OpmRightPanelContent } from '../OpmRightPanelContent';
import type { AppNode } from '../EntropyTypes';

describe('OpmRightPanelContent', () => {
  const mockNode: AppNode = {
    id: 'obj-1',
    type: 'opmObject',
    position: { x: 100, y: 100 },
    data: {
      name: 'Power Unit',
      type: 'object',
      physical: true,
      states: [
        { id: 'st-1', name: 'Idle', isActive: true, isInitial: true },
        { id: 'st-2', name: 'Active', isActive: false, isInitial: false },
      ],
      attributes: [{ key: 'Voltage', value: '24V' }],
      inputs: [{ id: 'p-in-1', name: 'RawCurrent', direction: 'input', position: 'left', type: 'standard' }],
      outputs: [{ id: 'p-out-1', name: 'RegulatedV', direction: 'output', position: 'right', type: 'standard' }],
    },
  };

  it('renders Element Inspector with collapsible cards for States, Attributes, and Ports', () => {
    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        selectedNode={mockNode}
        selectedEdge={null}
        onCloseInspector={() => {}}
        onUpdateNodeProp={() => {}}
        onConvertNodeType={() => {}}
        onAddStateToObject={() => {}}
        onManualActivateState={() => {}}
        onDeleteState={() => {}}
        onAddAttribute={() => {}}
        onAddPort={() => {}}
        onRemovePort={() => {}}
        onZoomInNode={() => {}}
        onDeleteSelectedNode={() => {}}
        onConvertEdgeType={() => {}}
        rightTab="simControl"
        onRightTabChange={() => {}}
        simRunning={true}
        simTick={42}
        tickMs={50}
        onToggleSimulation={() => {}}
        onRunSimTick={() => {}}
        onResetSimulation={() => {}}
        activeOpmConfig={{ tickMs: 50, executionMode: 'discrete', traceLevel: 'full' }}
        onOpmConfigChange={() => {}}
        scopeTabContent={<div>Scope Tab</div>}
        oplTabContent={<div>OPL Tab</div>}
        smartShowTabContent={<div>Smart Show Tab</div>}
        codegenTabContent={<div>Codegen Tab</div>}
      />
    );

    expect(html).toContain('Power Unit');
    expect(html).toContain('data-testid="opm-node-name-input"');
    expect(html).toContain('data-testid="opm-convert-node-type"');
    // Collapsible cards
    expect(html).toContain('States (2)');
    expect(html).toContain('Attributes (1)');
    expect(html).toContain('Ports (2)');
    // Glowing pulse on active state
    expect(html).toContain('shadow-[0_0_8px_#f97316]');
    expect(html).toContain('Idle');
    expect(html).toContain('Voltage');
    expect(html).toContain('RawCurrent');
    expect(html).toContain('RegulatedV');
  });

  it('renders studio tabs and simulation transport controls', () => {
    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        selectedNode={null}
        selectedEdge={null}
        onCloseInspector={() => {}}
        onUpdateNodeProp={() => {}}
        onConvertNodeType={() => {}}
        onAddStateToObject={() => {}}
        onManualActivateState={() => {}}
        onDeleteState={() => {}}
        onAddAttribute={() => {}}
        onAddPort={() => {}}
        onRemovePort={() => {}}
        onZoomInNode={() => {}}
        onDeleteSelectedNode={() => {}}
        onConvertEdgeType={() => {}}
        rightTab="simControl"
        onRightTabChange={() => {}}
        simRunning={false}
        simTick={0}
        tickMs={50}
        onToggleSimulation={() => {}}
        onRunSimTick={() => {}}
        onResetSimulation={() => {}}
        activeOpmConfig={{ tickMs: 50, executionMode: 'discrete', traceLevel: 'full' }}
        onOpmConfigChange={() => {}}
        scopeTabContent={<div>Scope Tab</div>}
        oplTabContent={<div>OPL Tab</div>}
        smartShowTabContent={<div>Smart Show Tab</div>}
        codegenTabContent={<div>Codegen Tab</div>}
      />
    );

    expect(html).toContain('data-testid="opm-scope-tab-btn"');
    expect(html).toContain('data-testid="opm-sim-status"');
    expect(html).toContain('data-testid="opm-sim-toggle"');
    expect(html).toContain('data-testid="opm-sim-step"');
    expect(html).toContain('data-testid="opm-sim-reset"');
    expect(html).toContain('PAUSED');
  });
});
