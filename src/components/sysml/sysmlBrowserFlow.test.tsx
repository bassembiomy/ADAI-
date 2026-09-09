import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { TraceabilityMatrix } from './TraceabilityMatrix';

describe('SysML browser flow release surface', () => {
  it('renders navigable, filterable, non-color-only RTM release evidence', () => {
    const repo = createEmptyRepository();
    repo.requirements.r = { id: 'r', name: 'Safety', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Safe', status: 'stale', version: '1', owner: 'Systems' };
    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repo} />);
    expect(html).toContain('role="region"');
    expect(html).toContain('Search requirements');
    expect(html).toContain('Filter by traceability status');
    expect(html).toContain('Traceability status: stale');
    expect(html).toContain('Export CSV');
  });
});
