import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { UseCaseNodeComponent, ActorNodeComponent, BoundaryNodeComponent } from './UseCaseNodes';

describe('UseCase Nodes with Warm Light Selection', () => {
  it('renders use case ellipse with sysml header tag, extension points, and warm light selection', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <UseCaseNodeComponent
          {...({
            data: { label: 'Maintain Velocity', extensionPoints: ['BrakeApplied'] },
            selected: true,
          } as any)}
        />
      </ReactFlowProvider>
    );
    expect(html).toContain('Maintain Velocity');
    expect(html).toContain('«use case»');
    expect(html).toContain('BrakeApplied');
    expect(html).toContain('border-amber-400');
  });

  it('renders actor with «actor» stereotype and warm light', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <ActorNodeComponent
          {...({
            data: { label: 'Vehicle Operator' },
            selected: true,
          } as any)}
        />
      </ReactFlowProvider>
    );
    expect(html).toContain('Vehicle Operator');
    expect(html).toContain('«actor»');
    expect(html).toContain('border-amber-400');
  });

  it('renders system boundary with subject label', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <BoundaryNodeComponent
          {...({
            data: { label: 'Speed Control System' },
            selected: false,
          } as any)}
        />
      </ReactFlowProvider>
    );
    expect(html).toContain('Speed Control System');
    expect(html).toContain('«subject»');
  });
});
