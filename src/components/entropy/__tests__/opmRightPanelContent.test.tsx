import { describe, it, expect, vi } from 'vitest';
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

  it('accepts executionConfig, onUpdateSelectionExecution, and diagnostics props', () => {
    const onUpdateExec = vi.fn();
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
        executionConfig={{
          version: 1,
          events: [{ id: 'ev-1', displayName: 'tick_event', cIdentifier: 'tick_event' }],
          enums: [],
          settings: {} as any,
        }}
        onUpdateSelectionExecution={onUpdateExec}
        writableAttributes={[{ id: 'attr-1', displayName: 'temperature' }]}
        diagnostics={[]}
      />
    );
    expect(html).toContain('Power Unit');
  });

  it('renders Link Execution Inspector with guard expression, event trigger, delay, and transition fields', () => {
    const mockEdge = {
      id: 'edge-1',
      source: 'st-1',
      target: 'proc-1',
      type: 'opmEdge',
      data: {
        type: 'condition',
        linkType: 'condition',
        execution: {
          enabled: true,
          guard: 'temperature > 100',
          eventId: 'ev-1',
          delayMs: 250,
          priority: 2,
          transition: {
            ownerObjectId: 'obj-1',
            sourceStateId: 'st-1',
            targetStateId: 'st-2',
          },
          assignments: [
            { id: 'asgn-1', targetAttributeId: 'attr-1', operator: '=', expression: '1', enabled: true },
          ],
        },
      },
    };

    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        selectedNode={null}
        selectedEdge={mockEdge as any}
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
        executionConfig={{
          version: 1,
          events: [{ id: 'ev-1', displayName: 'tick_event', cIdentifier: 'tick_event' }],
          enums: [],
          settings: {} as any,
        }}
        onUpdateSelectionExecution={() => {}}
        writableAttributes={[{ id: 'attr-1', displayName: 'temperature' }]}
        diagnostics={[]}
      />
    );

    expect(html).toContain('data-testid="link-execution-inspector"');
    expect(html).toContain('data-testid="guard-expr-input"');
    expect(html).toContain('temperature &gt; 100');
    expect(html).toContain('data-testid="link-delay-input"');
    expect(html).toContain('250');
    expect(html).toContain('data-testid="link-priority-input"');
    expect(html).toContain('2');
    expect(html).toContain('data-testid="link-transition-target-input"');
    expect(html).toContain('st-2');
  });

  it('renders State Execution Inspector with initial, terminal, timeout, and entry/exit actions', () => {
    const mockStateNode = {
      id: 'st-1',
      type: 'opmState',
      position: { x: 50, y: 50 },
      data: {
        name: 'Heating',
        type: 'state',
        execution: {
          enabled: true,
          initial: true,
          terminal: false,
          timeoutMs: 3000,
          timeoutEventId: 'ev-1',
          entryAssignments: [
            { id: 'asgn-entry-1', targetAttributeId: 'attr-1', operator: '=', expression: '1', enabled: true },
          ],
          exitAssignments: [
            { id: 'asgn-exit-1', targetAttributeId: 'attr-1', operator: '=', expression: '0', enabled: true },
          ],
        },
      },
    };

    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        selectedNode={mockStateNode as any}
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
        executionConfig={{
          version: 1,
          events: [{ id: 'ev-1', displayName: 'tick_event', cIdentifier: 'tick_event' }],
          enums: [],
          settings: {} as any,
        }}
        onUpdateSelectionExecution={() => {}}
        writableAttributes={[{ id: 'attr-1', displayName: 'temperature' }]}
        diagnostics={[]}
      />
    );

    expect(html).toContain('data-testid="state-initial-checkbox"');
    expect(html).toContain('data-testid="state-terminal-checkbox"');
    expect(html).toContain('data-testid="state-timeout-input"');
    expect(html).toContain('3000');
    expect(html).toContain('data-testid="state-timeout-event-select"');
    expect(html).toContain('data-testid="add-entry-assignment-btn"');
    expect(html).toContain('data-testid="add-exit-assignment-btn"');
  });

  it('renders Object Typed Attributes manager with typed inputs and add attribute button', () => {
    const mockObjectWithExec = {
      ...mockNode,
      data: {
        ...mockNode.data,
        execution: {
          enabled: true,
          attributes: [
            {
              id: 'attr-1',
              displayName: 'temperature',
              cIdentifier: 'temperature',
              type: { kind: 'float32' },
              initialValue: 25.5,
              overflow: 'wrap',
              access: 'readWrite',
              persistent: false,
            },
          ],
        },
      },
    };

    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        selectedNode={mockObjectWithExec as any}
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
        executionConfig={{ version: 1, events: [], enums: [], settings: {} as any }}
        onUpdateSelectionExecution={() => {}}
        writableAttributes={[{ id: 'attr-1', displayName: 'temperature' }]}
        diagnostics={[]}
      />
    );

    expect(html).toContain('data-testid="add-attr-btn"');
    expect(html).toContain('data-testid="attr-name-input"');
    expect(html).toContain('temperature');
    expect(html).toContain('data-testid="attr-type-select"');
  });

  it('renders Process Execution Inspector with activation mode, guard, and action assignments', () => {
    const mockProcessNode = {
      id: 'proc-1',
      type: 'opmProcess',
      position: { x: 200, y: 100 },
      data: {
        name: 'Heat Water',
        type: 'process',
        execution: {
          enabled: true,
          activation: 'cyclic',
          periodMs: 100,
          priority: 3,
          guard: 'temp < 100',
          assignments: [
            { id: 'asgn-p-1', targetAttributeId: 'attr-1', operator: '+=', expression: '2', enabled: true },
          ],
        },
      },
    };

    const html = renderToStaticMarkup(
      <OpmRightPanelContent
        selectedNode={mockProcessNode as any}
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
        executionConfig={{ version: 1, events: [], enums: [], settings: {} as any }}
        onUpdateSelectionExecution={() => {}}
        writableAttributes={[{ id: 'attr-1', displayName: 'temperature' }]}
        diagnostics={[]}
      />
    );

    expect(html).toContain('data-testid="process-activation-select"');
    expect(html).toContain('data-testid="process-period-input"');
    expect(html).toContain('data-testid="guard-expr-input"');
    expect(html).toContain('temp &lt; 100');
    expect(html).toContain('data-testid="add-assignment-btn"');
  });
});




