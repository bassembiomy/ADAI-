import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { nextRtmFocusIndex, TraceabilityMatrix } from './TraceabilityMatrix';

function repository() {
  const repo = createEmptyRepository();
  repo.requirements.r = { id: 'r', name: 'Safety', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'System shall be safe', status: 'implemented', version: '1', owner: 'Systems', risk: 'high' };
  repo.definitions.b = { id: 'b', name: 'Controller', namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'b', targetId: 'r' };
  return repo;
}

describe('professional traceability matrix workspace', () => {
  it('renders accessible status text, metrics, filters, source cells, and export control', () => {
    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repository()} />);
    expect(html).toContain('Requirements Traceability Matrix');
    expect(html).toContain('covered');
    expect(html).toContain('Controller');
    expect(html).toContain('aria-label="Filter by traceability status"');
    expect(html).toContain('Export CSV');
    expect(html).toContain('data-status="covered"');
  });

  it('provides bounded keyboard row navigation', () => {
    expect(nextRtmFocusIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextRtmFocusIndex(2, 'ArrowDown', 3)).toBe(2);
    expect(nextRtmFocusIndex(1, 'ArrowUp', 3)).toBe(0);
    expect(nextRtmFocusIndex(1, 'Home', 3)).toBe(0);
    expect(nextRtmFocusIndex(1, 'End', 3)).toBe(2);
  });

  it('renders baseline comparison selector and change-set filter dropdown', () => {
    const repo = repository();
    repo.baselines.base1 = {
      id: 'base1',
      name: 'Baseline 1.0',
      revision: 1,
      createdAt: '2026-09-08',
      protected: true,
    };
    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repo} />);
    expect(html).toContain('aria-label="Compare with baseline"');
    expect(html).toContain('Baseline 1.0');
    expect(html).toContain('aria-label="Filter by change type"');
  });

  it('renders hierarchy and covering blocks with relationship connection types', () => {
    const repo = repository();
    repo.requirements.rChild = {
      id: 'rChild',
      name: 'Sub-Safety',
      namespace: [],
      kind: 'requirement',
      requirementId: 'REQ-2',
      text: 'Child safe spec',
      status: 'approved',
      version: '1',
    };
    repo.relationships.rc = {
      id: 'rc',
      kind: 'requirementContainment',
      sourceId: 'r',
      targetId: 'rChild',
    };

    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repo} />);
    expect(html).toContain('Hierarchy &amp; Relations');
    expect(html).toContain('«containment»');
    expect(html).toContain('Sub-Safety');
    expect(html).toContain('REQ-2');
    expect(html).toContain('«satisfy»');
    expect(html).toContain('Controller');
  });
});
