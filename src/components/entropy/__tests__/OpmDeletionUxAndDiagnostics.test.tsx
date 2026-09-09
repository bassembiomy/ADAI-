import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { OpmRightPanelContent } from '../OpmRightPanelContent';
import { SmartShowPanel } from '../SmartShowPanel';
import type { AppNode, AppEdge } from '../EntropyTypes';
import { createSimulationState } from '../OpmSimulationEngine';
import { analyzeOpmDeletion } from '../OpmDeletionImpact';

describe('OPM Lifecycle Impact Review & Diagnostics UX (Task 7)', () => {
  const standaloneNode: AppNode = {
    id: 'proc-standalone',
    type: 'opmProcess',
    position: { x: 0, y: 0 },
    data: {
      name: 'Process Isolated',
      type: 'process',
      physical: false,
      states: [],
      attributes: [],
    },
  };

  const parentObj: AppNode = {
    id: 'obj-parent',
    type: 'opmObject',
    position: { x: 0, y: 0 },
    data: {
      name: 'Turbine Controller',
      type: 'object',
      physical: true,
      states: [
        { id: 'st-idle', name: 'Idle', isActive: false },
        { id: 'st-spin', name: 'Spinning', isActive: false },
      ],
      attributes: [],
    },
  };

  const childState1: AppNode = {
    id: 'st-idle',
    type: 'opmState',
    parentId: 'obj-parent',
    position: { x: 10, y: 10 },
    data: {
      name: 'Idle',
      type: 'state',
      physical: false,
      states: [],
      attributes: [],
      parentId: 'obj-parent',
    },
  };

  const childState2: AppNode = {
    id: 'st-spin',
    type: 'opmState',
    parentId: 'obj-parent',
    position: { x: 70, y: 10 },
    data: {
      name: 'Spinning',
      type: 'state',
      physical: false,
      states: [],
      attributes: [],
      parentId: 'obj-parent',
    },
  };

  const incidentEdge: AppEdge = {
    id: 'e-turb-spin',
    source: 'st-spin',
    target: 'proc-standalone',
    type: 'opmEdge',
    data: { type: 'consumption' },
  };

  const baseProps = {
    selectedEdge: null,
    onCloseInspector: vi.fn(),
    onUpdateNodeProp: vi.fn(),
    onConvertNodeType: vi.fn(),
    onAddStateToObject: vi.fn(),
    onManualActivateState: vi.fn(),
    onDeleteState: vi.fn(),
    onAddAttribute: vi.fn(),
    onAddPort: vi.fn(),
    onRemovePort: vi.fn(),
    onZoomInNode: vi.fn(),
    onConvertEdgeType: vi.fn(),
    rightTab: 'inspector',
    onRightTabChange: vi.fn(),
    simRunning: false,
    simTick: 0,
    tickMs: 500,
    onToggleSimulation: vi.fn(),
    onRunSimTick: vi.fn(),
    onResetSimulation: vi.fn(),
    activeOpmConfig: {},
    onOpmConfigChange: vi.fn(),
    scopeTabContent: <div>Scope</div>,
    oplTabContent: <div>OPL</div>,
    smartShowTabContent: <div>SmartShow</div>,
    codegenTabContent: <div>Codegen</div>,
  };

  it('computes low impact for isolated element and high impact for parent object', () => {
    const lowImpact = analyzeOpmDeletion(
      { nodes: [standaloneNode], edges: [] },
      { nodeIds: [standaloneNode.id] }
    );
    expect(lowImpact.isHighImpact).toBe(false);
    expect(lowImpact.summary.deletedNodeCount).toBe(1);
    expect(lowImpact.summary.descendantsCascadedCount).toBe(0);

    const highImpact = analyzeOpmDeletion(
      { nodes: [parentObj, childState1, childState2, standaloneNode], edges: [incidentEdge] },
      { nodeIds: [parentObj.id] }
    );
    expect(highImpact.isHighImpact).toBe(true);
    expect(highImpact.summary.descendantsCascadedCount).toBe(2);
    expect(highImpact.summary.deletedEdgeCount).toBe(1);
  });

  it('renders Delete Element button in right panel inspector', () => {
    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        {...baseProps}
        nodes={[standaloneNode]}
        edges={[]}
        selectedNode={standaloneNode}
        onDeleteSelectedNode={vi.fn()}
      />
    );

    expect(html).toContain('Delete Element');
  });

  it('renders Smart Show with diagnostics and element selection handles', () => {
    const cyc1: AppNode = {
      id: 'obj-a',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: { name: 'Alpha', type: 'object', physical: false, states: [], attributes: [] },
    };
    const cyc2: AppNode = {
      id: 'obj-b',
      type: 'opmObject',
      position: { x: 100, y: 0 },
      data: { name: 'Beta', type: 'object', physical: false, states: [], attributes: [] },
    };
    const e1: AppEdge = {
      id: 'e1',
      source: 'obj-a',
      target: 'obj-b',
      type: 'opmEdge',
      data: { type: 'aggregation' },
    };
    const e2: AppEdge = {
      id: 'e2',
      source: 'obj-b',
      target: 'obj-a',
      type: 'opmEdge',
      data: { type: 'aggregation' },
    };

    const html = renderToStaticMarkup(
      <SmartShowPanel
        nodes={[cyc1, cyc2]}
        edges={[e1, e2]}
        simState={createSimulationState()}
        simRunning={false}
        onSelectElement={vi.fn()}
      />
    );

    expect(html).toContain('BDD Diagnostics');
    expect(html).toContain('OPM_STRUCTURAL_CYCLE');
  });
});
