import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { OpmSimulationScope } from '../OpmSimulationScope';
import { AppNode, AppEdge } from '../EntropyTypes';

describe('OpmSimulationScope', () => {
  const mockNodes: AppNode[] = [
    {
      id: 'proc-1',
      type: 'process',
      position: { x: 0, y: 0 },
      data: { id: 'proc-1', name: 'WaterBoiling', type: 'process', isFiring: true } as any,
    },
    {
      id: 'obj-1',
      type: 'object',
      position: { x: 100, y: 100 },
      data: {
        id: 'obj-1',
        name: 'Water',
        type: 'object',
        states: [
          { id: 'st-cold', name: 'Cold', isActive: false },
          { id: 'st-hot', name: 'Hot', isActive: true },
        ],
      } as any,
    },
  ];

  const mockEdges: AppEdge[] = [];

  it('renders channels for active processes and object states', () => {
    const html = renderToStaticMarkup(
      <OpmSimulationScope
        simRunning={true}
        currentTick={3}
        tickMs={200}
        nodes={mockNodes}
        edges={mockEdges}
        recentLogs={[]}
      />
    );

    expect(html).toContain('WaterBoiling');
    expect(html).toContain('Water::Hot');
    expect(html).toContain('data-testid="opm-scope-timeline"');
    expect(html).toContain('data-testid="opm-scope-tick-counter"');
  });

  it('displays tick counter and simulation parameters', () => {
    const html = renderToStaticMarkup(
      <OpmSimulationScope
        simRunning={true}
        currentTick={5}
        tickMs={150}
        nodes={mockNodes}
        edges={mockEdges}
        recentLogs={[]}
      />
    );

    expect(html).toContain('Tick 5 (750ms)');
    expect(html).toContain('data-testid="opm-scope-clear"');
    expect(html).toContain('data-testid="opm-scope-zoom-select"');
  });

  it('renders idle message when no processes or states exist', () => {
    const html = renderToStaticMarkup(
      <OpmSimulationScope
        simRunning={false}
        currentTick={0}
        tickMs={100}
        nodes={[]}
        edges={[]}
        recentLogs={[]}
      />
    );

    expect(html).toContain('No active process or state signals detected');
  });
});
