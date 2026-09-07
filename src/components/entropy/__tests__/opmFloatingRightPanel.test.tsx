import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React, { useState } from 'react';
import { OpmFloatingWindow } from '../OpmFloatingWindow';
import { OpmRightPanelContent } from '../OpmRightPanelContent';
import { ExternalLink } from 'lucide-react';
import type { AppNode } from '../EntropyTypes';

describe('OPM Floating Right Panel Integration', () => {
  const mockNode: AppNode = {
    id: 'test-obj',
    type: 'opmObject',
    position: { x: 0, y: 0 },
    data: {
      name: 'Actuator',
      type: 'object',
      physical: true,
      states: [{ id: 's1', name: 'Ready', isActive: true, isInitial: true }],
      attributes: [],
      inputs: [],
      outputs: [],
    },
  };

  const TestHarness: React.FC<{ initialFloating?: boolean }> = ({ initialFloating = false }) => {
    const [isFloating, setIsFloating] = useState(initialFloating);
    const [rightTab, setRightTab] = useState('simControl');

    const panelContent = (
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
        rightTab={rightTab}
        onRightTabChange={setRightTab}
        simRunning={false}
        simTick={0}
        tickMs={50}
        onToggleSimulation={() => {}}
        onRunSimTick={() => {}}
        onResetSimulation={() => {}}
        activeOpmConfig={{ tickMs: 50, executionMode: 'discrete', traceLevel: 'full' }}
        onOpmConfigChange={() => {}}
        scopeTabContent={<div>Scope View</div>}
        oplTabContent={<div>OPL View</div>}
        smartShowTabContent={<div>Smart Show View</div>}
        codegenTabContent={<div>Codegen View</div>}
      />
    );

    return (
      <div data-testid="opm-workspace-root">
        {/* Docked Right Slot */}
        {!isFloating && (
          <div data-testid="opm-dock-right-container">
            <div
              data-testid="opm-right-dock-header"
              onDoubleClick={() => setIsFloating(true)}
            >
              <span>Inspector & Tools</span>
              <button
                data-testid="opm-float-right-panel-btn"
                onClick={() => setIsFloating(true)}
              >
                <ExternalLink size={12} />
              </button>
            </div>
            {panelContent}
          </div>
        )}

        {/* Floating Window */}
        {isFloating && (
          <OpmFloatingWindow
            isOpen={isFloating}
            title={mockNode.data.name}
            badge="OBJECT"
            onClose={() => setIsFloating(false)}
            onDock={() => setIsFloating(false)}
          >
            {panelContent}
          </OpmFloatingWindow>
        )}
      </div>
    );
  };

  it('renders in docked mode with dock header and popout button', () => {
    const html = renderToStaticMarkup(<TestHarness initialFloating={false} />);
    expect(html).toContain('data-testid="opm-dock-right-container"');
    expect(html).toContain('data-testid="opm-right-dock-header"');
    expect(html).toContain('data-testid="opm-float-right-panel-btn"');
    expect(html).toContain('Actuator');
    expect(html).not.toContain('data-testid="opm-floating-window"');
  });

  it('renders in floating mode with OpmFloatingWindow and controls', () => {
    const html = renderToStaticMarkup(<TestHarness initialFloating={true} />);
    expect(html).not.toContain('data-testid="opm-dock-right-container"');
    expect(html).toContain('data-testid="opm-floating-window"');
    expect(html).toContain('data-testid="opm-floating-dock-btn"');
    expect(html).toContain('data-testid="opm-floating-titlebar"');
    expect(html).toContain('Actuator');
  });
});
