import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RequirementGovernancePanel } from './RequirementGovernancePanel';
import type { ModelBaseline, RequirementDefinition, SysmlRelationship, VerificationEvidence } from '../../engine/sysml/model';

describe('RequirementGovernancePanel', () => {
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
