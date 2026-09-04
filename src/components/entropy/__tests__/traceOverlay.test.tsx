import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { OpmLiveTraceOverlay } from '../OpmLiveTraceOverlay';
import { OpmDiagnosticsBadge } from '../OpmDiagnosticsBadge';
import { createOpmSimulationController } from '../OpmSimulationEngine';
import type { AppNode, AppEdge } from '../EntropyTypes';

describe('OPM live trace overlay and diagnostics badge', () => {
  it('instantiates OpmLiveTraceOverlay with live variables and active states', () => {
    const hudProps = {
      activeStates: { obj_boiler: 'st_boiler_heating' },
      variableValues: { temperature_value: 25.0, count: 5 },
      firingProcessIds: ['proc_heat'],
      traversedLinkIds: ['edge_1'],
      timeMs: 100,
      stepIndex: 1,
    };

    const element = React.createElement(OpmLiveTraceOverlay, hudProps);
    expect(element.type).toBe(OpmLiveTraceOverlay);
    expect(element.props.variableValues.temperature_value).toBe(25.0);
    expect(element.props.activeStates.obj_boiler).toBe('st_boiler_heating');
    expect(element.props.firingProcessIds).toContain('proc_heat');
  });

  it('instantiates OpmDiagnosticsBadge with diagnostic items', () => {
    const onSelectElement = vi.fn();
    const element = React.createElement(OpmDiagnosticsBadge, {
      diagnostics: [
        {
          code: 'OPM_STATE_INITIAL_REQUIRED',
          severity: 'error',
          message: 'Initial state required',
          source: { elementId: 'obj_1', propertyPath: 'states' },
        },
      ],
      onSelectElement,
    });

    expect(element.type).toBe(OpmDiagnosticsBadge);
    expect(element.props.diagnostics).toHaveLength(1);
  });

  it('HUD renders from the canonical snapshot: values, active states, firing, traversed links, time and diagnostics', () => {
    const controller = createOpmSimulationController();
    const nodes: AppNode[] = [
      {
        id: 'obj_counter',
        type: 'opmObject',
        position: { x: 0, y: 0 },
        data: {
          name: 'Counter',
          type: 'object',
          physical: false,
          objectExecution: {
            enabled: true,
            attributes: [
              {
                id: 'counter',
                displayName: 'counter',
                cIdentifier: 'counter',
                type: { kind: 'int32' },
                initialValue: 0,
                overflow: 'wrap',
                access: 'readWrite',
                persistent: false,
              },
            ],
          },
        },
      },
      {
        id: 'proc_inc',
        type: 'opmProcess',
        position: { x: 200, y: 0 },
        data: {
          name: 'Inc',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 10,
            inputAttributeIds: ['counter'],
            outputAttributeIds: ['counter'],
            guard: '',
            assignments: [
              { id: 'a1', targetAttributeId: 'counter', operator: '+=', expression: '1', enabled: true },
            ],
            priority: 1,
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
    ];
    const edges: AppEdge[] = [
      {
        id: 'result-link',
        source: 'proc_inc',
        target: 'obj_counter',
        data: {
          type: 'result',
          linkExecution: { enabled: true, guard: '', assignments: [], priority: 1, delayMs: 0 },
        },
      } as AppEdge,
    ];
    expect(controller.compile(nodes, edges).ok).toBe(true);
    controller.step();
    controller.step();
    controller.step();
    const snapshot = controller.getSnapshot();
    expect(snapshot?.values['counter']).toBe(3);
    expect(snapshot?.traversedLinkIds).toContain('result-link');

    const html = renderToStaticMarkup(
      React.createElement(OpmLiveTraceOverlay, {
        activeStates: { ...(snapshot?.activeStates ?? {}) },
        variableValues: { ...(snapshot?.values ?? {}) } as Record<string, boolean | number | string>,
        recentTrace: (snapshot?.trace ?? []).map(t => ({ phase: t.phase, description: t.description })),
        firingProcessIds: [...(snapshot?.firedProcessIds ?? [])],
        traversedLinkIds: [...(snapshot?.traversedLinkIds ?? [])],
        timeMs: snapshot?.timeMs ?? 0,
        stepIndex: snapshot?.stepIndex ?? 0,
        diagnostics: [...(snapshot?.diagnostics ?? [])],
      }),
    );
    // Snapshot values drive the HUD.
    expect(html).toContain('counter');
    expect(html).toContain('proc_inc');
    // Traversed links are surfaced for edge animation.
    expect(html).toContain('result-link');
    expect(html).toContain('hud-traversed-links');
    // Snapshot time/step drive the HUD header.
    expect(html).toContain(`#${snapshot?.stepIndex}`);
  });

  it('traversed links from the snapshot animate the HUD traversed section', () => {
    const html = renderToStaticMarkup(
      React.createElement(OpmLiveTraceOverlay, {
        activeStates: {},
        variableValues: { counter: 3 },
        firingProcessIds: ['proc_inc'],
        traversedLinkIds: ['result-link'],
        timeMs: 30,
        stepIndex: 3,
      }),
    );
    expect(html).toContain('result-link');
    expect(html).toContain('animate-pulse');
  });

  it('diagnostics badge navigates via a single NavigateToOpmDiagnostic callback with exact source ref', () => {
    const onNavigate = vi.fn();
    const source = { elementId: 'obj_1', propertyPath: 'states' };
    const element = React.createElement(OpmDiagnosticsBadge, {
      diagnostics: [
        {
          code: 'OPM_STATE_INITIAL_REQUIRED',
          severity: 'error' as const,
          message: 'Initial state required',
          source,
        },
      ],
      onNavigateToDiagnostic: onNavigate,
    });
    // The single callback receives the full source ref (element + property path).
    expect(element.props.onNavigateToDiagnostic).toBeDefined();
    element.props.onNavigateToDiagnostic?.(source);
    expect(onNavigate).toHaveBeenCalledWith(source);
    expect(onNavigate).toHaveBeenCalledTimes(1);

    // The focus control is tagged with data-opm-path={source.propertyPath}.
    const html = renderToStaticMarkup(
      React.createElement(OpmDiagnosticsBadge, {
        diagnostics: [
          {
            code: 'OPM_STATE_INITIAL_REQUIRED',
            severity: 'error' as const,
            message: 'Initial state required',
            source,
          },
        ],
        onNavigateToDiagnostic: onNavigate,
        defaultExpanded: true,
      }),
    );
    expect(html).toContain('data-opm-path="states"');
    expect(html).toContain('OPM_STATE_INITIAL_REQUIRED');
  });

  it('failed steps preserve the prior HUD display', () => {
    const controller = createOpmSimulationController();
    const nodes: AppNode[] = [
      {
        id: 'obj_counter',
        type: 'opmObject',
        position: { x: 0, y: 0 },
        data: {
          name: 'Counter',
          type: 'object',
          physical: false,
          objectExecution: {
            enabled: true,
            attributes: [
              {
                id: 'counter',
                displayName: 'counter',
                cIdentifier: 'counter',
                type: { kind: 'int32' },
                initialValue: 0,
                overflow: 'wrap',
                access: 'readWrite',
                persistent: false,
              },
            ],
          },
        },
      },
      {
        id: 'proc_inc',
        type: 'opmProcess',
        position: { x: 200, y: 0 },
        data: {
          name: 'Inc',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 10,
            inputAttributeIds: ['counter'],
            outputAttributeIds: ['counter'],
            guard: '',
            assignments: [
              { id: 'a1', targetAttributeId: 'counter', operator: '+=', expression: '1', enabled: true },
            ],
            priority: 1,
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
    ];
    const edges: AppEdge[] = [
      {
        id: 'result-link',
        source: 'proc_inc',
        target: 'obj_counter',
        data: {
          type: 'result',
          linkExecution: { enabled: true, guard: '', assignments: [], priority: 1, delayMs: 0 },
        },
      } as AppEdge,
    ];
    controller.compile(nodes, edges);
    controller.step();
    const prior = controller.getSnapshot();
    expect(prior?.values['counter']).toBe(1);
    controller.step(Number.NaN);
    const preserved = controller.getSnapshot();
    expect(preserved?.values['counter']).toBe(1);

    const html = renderToStaticMarkup(
      React.createElement(OpmLiveTraceOverlay, {
        activeStates: { ...(preserved?.activeStates ?? {}) },
        variableValues: { ...(preserved?.values ?? {}) } as Record<string, boolean | number | string>,
        firingProcessIds: [...(preserved?.firedProcessIds ?? [])],
        traversedLinkIds: [...(preserved?.traversedLinkIds ?? [])],
        timeMs: preserved?.timeMs ?? 0,
        stepIndex: preserved?.stepIndex ?? 0,
      }),
    );
    expect(html).toContain('counter');
    expect(html).toContain('result-link');
  });
});
