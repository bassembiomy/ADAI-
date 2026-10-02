// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(cleanup);
  it.each([false, true])('labels unnamed and unresolved endpoints in matrix view (virtual=%s)', virtual => {
    const repo = repository();
    repo.definitions.b.name = ' ';
    const missingId = '65cb033e-421d-41e0-b789-87931d991012';
    const verificationId = '65cb033e-421d-41e0-b789-87931d991013';
    repo.relationships.refine = { id: 'refine', kind: 'refine', sourceId: missingId, targetId: 'r' };
    repo.verificationCases[verificationId] = { id: verificationId, name: ' ', kind: 'verificationCase', namespace: [], method: 'test', verifiesRequirementIds: ['r'] };
    const { container } = render(<TraceabilityMatrix repository={repo} />);
    if (virtual) fireEvent.click(screen.getByRole('button', { name: 'Virtualized Grid' }));
    expect(screen.getByText('Block')).toBeTruthy();
    expect(screen.getByText('Verification Case')).toBeTruthy();
    if (!virtual) expect(screen.getByText('Element')).toBeTruthy();
    for (const id of [missingId, verificationId]) expect(container.textContent).not.toContain(id);
  });
  it('uses metaclasses for unnamed linked elements and preserves navigation IDs', () => {
    const repo = repository();
    const connectorId = '65cb033e-421d-41e0-b789-87931d991010';
    const evidenceId = '65cb033e-421d-41e0-b789-87931d991011';
    repo.connectors[connectorId] = { id: connectorId, kind: 'assembly', ownerId: 'b', sourcePortId: 'p1', targetPortId: 'p2' };
    repo.relationships.trace = { id: 'trace', kind: 'trace', sourceId: connectorId, targetId: 'r' };
    repo.evidence[evidenceId] = { id: evidenceId, requirementId: 'r', verificationCaseId: 'test', revision: 0, result: 'passed', executedAt: '' };
    const onNavigate = vi.fn();
    const { container } = render(<TraceabilityMatrix repository={repo} onNavigate={onNavigate} />);
    expect(screen.getByText('Controller')).toBeTruthy();
    expect(screen.getAllByText('Assembly').length).toBeGreaterThan(0);
    expect(screen.getByText('Evidence')).toBeTruthy();
    for (const id of [connectorId, evidenceId]) {
      expect(screen.queryByText(id)).toBeNull();
      expect(container.textContent?.includes(id)).toBe(false);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Assembly' }));
    expect(onNavigate).toHaveBeenCalledWith(connectorId);
  });
  it('renders accessible status text, metrics, filters, source cells, and export control', () => {
    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repository()} />);
    expect(html).toContain('traceability-grid');
    expect(html).toContain('engineering-table');
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

  it('renders a State display name for a satisfy endpoint rather than its UUID', () => {
    const repo = repository();
    repo.relationships.stateSatisfy = { id: 'stateSatisfy', kind: 'satisfy', sourceId: 'state-uuid-123', targetId: 'r' };

    const html = renderToStaticMarkup(<TraceabilityMatrix
      repository={repo}
      externalElements={[{ id: 'state-uuid-123', name: 'State_1', kind: 'state' }]}
    />);

    expect(html).toContain('State_1');
    expect(html).not.toContain('state-uuid-123');
  });

  it('renders deriveReqt, copy, refine, trace, and verify directional badges', () => {
    const repo = repository();
    repo.requirements.rDerived = {
      id: 'rDerived',
      name: 'Derived Safety',
      namespace: [],
      kind: 'requirement',
      requirementId: 'REQ-3',
      text: 'Derived',
      status: 'approved',
      version: '1',
    };
    repo.requirements.rCopy = {
      id: 'rCopy',
      name: 'Copy Safety',
      namespace: [],
      kind: 'requirement',
      requirementId: 'REQ-4',
      text: 'Copy',
      status: 'approved',
      version: '1',
    };
    repo.verificationCases.vc1 = {
      id: 'vc1',
      name: 'Safety Test Case',
      namespace: [],
      kind: 'verificationCase',
      method: 'test',
      verifiesRequirementIds: [],
    };
    repo.relationships.rDer = { id: 'rDer', kind: 'deriveReqt', sourceId: 'rDerived', targetId: 'r' };
    repo.relationships.rCp = { id: 'rCp', kind: 'copy', sourceId: 'rCopy', targetId: 'r' };
    repo.relationships.rRef = { id: 'rRef', kind: 'refine', sourceId: 'b', targetId: 'r' };
    repo.relationships.rTr = { id: 'rTr', kind: 'trace', sourceId: 'r', targetId: 'rCopy' };
    repo.relationships.rVer = { id: 'rVer', kind: 'verify', sourceId: 'vc1', targetId: 'r' };

    const html = renderToStaticMarkup(<TraceabilityMatrix repository={repo} />);
    expect(html).toContain('«deriveReqt»');
    expect(html).toContain('«copy»');
    expect(html).toContain('«refine»');
    expect(html).toContain('«trace»');
    expect(html).toContain('«verify»');
    expect(html).toContain('Safety Test Case');
  });
});
