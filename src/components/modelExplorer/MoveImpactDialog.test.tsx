import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MoveImpactDialog } from './MoveImpactDialog';
import type { ExplorerImpact } from '../../features/modelExplorer/modelExplorerTypes';

describe('MoveImpactDialog', () => {
  const sampleImpact: ExplorerImpact = {
    descendants: ['substate-1', 'substate-2'],
    relationships: ['rel-trans-1'],
    presentations: ['diag-symbol-1'],
    invalidated: ['t1: Invalid cross-region transition'],
  };

  it('renders impact details with invalidated items and confirmation hash', () => {
    const html = renderToStaticMarkup(
      <MoveImpactDialog
        isOpen={true}
        impact={sampleImpact}
        impactHash="hash-abc-123"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).toContain('Confirm Structural Move');
    expect(html).toContain('Invalid cross-region transition');
    expect(html).toContain('Affected Relationships (1)');
    expect(html).toContain('rel-trans-1');
    expect(html).toContain('substate-1');
    expect(html).toContain('hash-abc-123');
    expect(html).toContain('Confirm');
    expect(html).toContain('Cancel');
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <MoveImpactDialog
        isOpen={false}
        impact={sampleImpact}
        impactHash="hash-abc-123"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).toBe('');
  });
});
