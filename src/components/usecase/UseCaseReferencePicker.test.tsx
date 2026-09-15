import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseCaseReferencePicker } from './UseCaseReferencePicker';

describe('UseCaseReferencePicker', () => {
  const availableDiagrams = [
    { id: 'act-login', name: 'User Login Scenario', kind: 'activity' },
    { id: 'seq-auth', name: 'Authentication Sequence', kind: 'sequence' },
    { id: 'stm-flight', name: 'Flight Mode State Machine', kind: 'stateMachine' },
  ];

  it('renders dropdown with available behavior diagrams', () => {
    const html = renderToStaticMarkup(
      <UseCaseReferencePicker
        selectedDiagramId="act-login"
        availableDiagrams={availableDiagrams}
        onSelectDiagram={vi.fn()}
      />
    );

    expect(html).toContain('User Login Scenario');
    expect(html).toContain('Authentication Sequence');
    expect(html).toContain('Flight Mode State Machine');
    expect(html).toContain('activity');
  });

  it('displays warning badge when referenced diagram is unresolved / stale', () => {
    const html = renderToStaticMarkup(
      <UseCaseReferencePicker
        selectedDiagramId="act-deleted-diagram"
        availableDiagrams={availableDiagrams}
        onSelectDiagram={vi.fn()}
      />
    );

    expect(html).toContain('Unresolved Diagram Reference');
    expect(html).toContain('act-deleted-diagram');
  });

  it('renders open/navigate action button when callback is provided', () => {
    const html = renderToStaticMarkup(
      <UseCaseReferencePicker
        selectedDiagramId="act-login"
        availableDiagrams={availableDiagrams}
        onSelectDiagram={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(html).toContain('Open Diagram');
  });
});
