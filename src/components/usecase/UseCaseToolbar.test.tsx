import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseCaseToolbar } from './UseCaseToolbar';

describe('UseCaseToolbar', () => {
  it('renders creation buttons and diagram title', () => {
    const html = renderToStaticMarkup(
      <UseCaseToolbar
        diagramName="Flight Control Use Cases"
        onAddActor={vi.fn()}
        onAddUseCase={vi.fn()}
        onAddBoundary={vi.fn()}
        onAutoLayout={vi.fn()}
        onFitView={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html).toContain('Flight Control');
    expect(html).toContain('+ Actor');
    expect(html).toContain('+ Use Case');
    expect(html).toContain('+ Subject');
    expect(html).toContain('Auto Layout');
    expect(html).toContain('Fit');
    expect(html).toContain('Save');
  });

  it('renders a diagram selector when multiple diagrams are available and onSelectDiagram is passed', () => {
    const onSelect = vi.fn();
    const diagrams = [
      { id: 'diag-1', name: 'Primary Flight Ops' },
      { id: 'diag-2', name: 'Emergency Landing' },
    ];
    const html = renderToStaticMarkup(
      <UseCaseToolbar
        diagramName="Primary Flight Ops"
        availableDiagrams={diagrams}
        activeDiagramId="diag-1"
        onSelectDiagram={onSelect}
        onAddActor={vi.fn()}
        onAddUseCase={vi.fn()}
        onAddBoundary={vi.fn()}
        onAutoLayout={vi.fn()}
        onFitView={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html).toContain('Primary Flight Ops');
    expect(html).toContain('Emergency Landing');
    expect(html).toContain('Select Use Case Diagram');
  });
});
