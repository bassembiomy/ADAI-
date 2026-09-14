import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { UseCaseEdgeComponent } from './UseCaseEdges';

describe('UseCaseEdges', () => {
  it('renders edge component with label for include relationship', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <svg>
          <UseCaseEdgeComponent
            id="edge-1"
            source="uc-1"
            target="uc-2"
            sourceX={0}
            sourceY={0}
            targetX={100}
            targetY={100}
            sourcePosition={'right' as any}
            targetPosition={'left' as any}
            data={{ type: 'include' }}
            selected={true}
          />
        </svg>
      </ReactFlowProvider>
    );
    expect(html).toContain('include');
  });
});
