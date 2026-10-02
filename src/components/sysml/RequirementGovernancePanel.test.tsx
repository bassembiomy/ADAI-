// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { RequirementGovernancePanel } from './RequirementGovernancePanel';
import type { ModelBaseline, RequirementDefinition, SysmlRelationship, VerificationEvidence } from '../../engine/sysml/model';

describe('RequirementGovernancePanel', () => {
  afterEach(cleanup);
  const req: RequirementDefinition = {
    id: 'req1',
    requirementId: 'REQ-101',
    name: 'MaxSpeed',
    namespace: [],
    kind: 'requirement',
    text: 'Vehicle shall not exceed 120 km/h',
    status: 'stale',
    version: '1.2',
    copiedFromId: 'masterReq',
    baselineId: 'base1',
  };

  const masterReq: RequirementDefinition = {
    id: 'masterReq',
    requirementId: 'REQ-MASTER',
    name: 'MasterSpeed',
    namespace: [],
    kind: 'requirement',
    text: 'Vehicle shall not exceed 130 km/h (updated in master)',
    status: 'approved',
    version: '2.0',
  };

  const baselines: Record<string, ModelBaseline> = {
    base1: { id: 'base1', name: 'Baseline 1.0', revision: 2, createdAt: '2026-09-01T00:00:00Z', protected: true },
  };

  const suspectLinks: SysmlRelationship[] = [
    { id: 'rel1', kind: 'satisfy', sourceId: 'MotorBlock', targetId: 'req1', suspect: true, lastValidatedRevision: 2 },
  ];

  const evidenceHistory: VerificationEvidence[] = [
    { id: 'ev1', verificationCaseId: 'test1', requirementId: 'req1', revision: 2, result: 'passed', executedAt: '2026-09-02T10:00:00Z', status: 'stale' },
  ];

  it('resolves links, copy origin and deletion impact while keeping action IDs', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `65cb033e-421d-41e0-b789-87931d99101${i}`);
    const repo = createEmptyRepository();
    repo.definitions[ids[0]] = { id: ids[0], name: ' Controller ', kind: 'block', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.definitions[ids[1]] = { ...repo.definitions[ids[0]], id: ids[1], name: ' ' };
    const link: SysmlRelationship = { id: ids[2], kind: 'association', sourceId: ids[0], targetId: ids[1], suspect: true };
    const baseline = { ...baselines.base1, id: ids[3], name: ' Approved design ' };
    const onClearSuspect = vi.fn();
    const onCloneBaseline = vi.fn();
    const onAuthorizeBaseline = vi.fn();
    const { container } = render(<RequirementGovernancePanel
      repository={repo}
      requirement={{ ...req, copiedFromId: ids[4], baselineId: ids[3] }}
      masterRequirement={{ ...masterReq, id: ids[4], name: ' ' }}
      baselines={{ [ids[3]]: baseline }}
      suspectLinks={[link]}
      unresolvedUsageIds={[ids[5]]}
      invalidatedEvidenceIds={[ids[4]]}
      blockedBaselineIds={[ids[3]]}
      onClearSuspect={onClearSuspect}
      onCloneBaseline={onCloneBaseline}
      onAuthorizeBaseline={onAuthorizeBaseline}
    />);
    expect(screen.getByText('Controller -> Block')).toBeTruthy();
    expect(screen.getByText('Association')).toBeTruthy();
    expect(screen.getByText('Requirement')).toBeTruthy();
    expect(screen.getByText('Usage')).toBeTruthy();
    expect(screen.getByText('Evidence')).toBeTruthy();
    for (const id of ids) expect(container.textContent?.includes(id)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Validated' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clone Approved design' }));
    fireEvent.click(screen.getByRole('button', { name: 'Authorize Approved design' }));
    expect(onClearSuspect).toHaveBeenCalledWith(ids[2]);
    expect(onCloneBaseline).toHaveBeenCalledWith(ids[3]);
    expect(onAuthorizeBaseline).toHaveBeenCalledWith(ids[3]);
  });

  it('renders baselines, suspect links, sync from master, and evidence history', () => {
    const html = renderToStaticMarkup(
      <RequirementGovernancePanel
        requirement={req}
        masterRequirement={masterReq}
        baselines={baselines}
        suspectLinks={suspectLinks}
        evidenceHistory={evidenceHistory}
        onCreateBaseline={vi.fn()}
        onClearSuspect={vi.fn()}
        onSyncFromMaster={vi.fn()}
      />
    );

    expect(html).toContain('Requirement Governance');
    expect(html).toContain('Baseline 1.0');
    expect(html).toContain('Create Baseline');
    expect(html).toContain('SUSPECT');
    expect(html).toContain('Mark Validated');
    expect(html).toContain('Sync from Master');
    expect(html).toContain('Vehicle shall not exceed 130 km/h (updated in master)');
    expect(html).toContain('Verification Evidence');
    expect(html).toContain('passed');
  });
});
