import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { UseCaseWorkspace } from './UseCaseWorkspace';

describe('UseCaseWorkspace', () => {
  it('renders workspace with toolbar and canvas elements', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <UseCaseWorkspace
          diagram={{ id: 'd-1', name: 'Powertrain Control', nodes: [], edges: [] }}
          onChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ReactFlowProvider>
    );

    expect(html).toContain('Powertrain Control');
    expect(html).toContain('+ Actor');
    expect(html).toContain('+ Use Case');
    expect(html).toContain('+ Subject');
    expect(html).toContain('Save');
  });
});
