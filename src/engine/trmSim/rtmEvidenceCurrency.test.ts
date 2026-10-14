// @vitest-environment jsdom
// WP-14 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.2
import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { createEmptyRepository, type SysmlRepository, type VerificationEvidence } from '../sysml/model';
import { buildTraceabilityMatrix } from '../sysml/rtm';
import { TraceabilityMatrix } from '../../components/sysml/TraceabilityMatrix';

const seed = (): SysmlRepository => {
  const r = createEmptyRepository();
  r.requirements.req1 = { id: 'req1', name: 'Heat up', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Heats', status: 'approved', version: '1' } as any;
  r.verificationCases.vcA = { id: 'vcA', name: 'A', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req1'] } as any;
  r.verificationCases.vcB = { id: 'vcB', name: 'B', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req1'] } as any;
  return r;
};

/** Evidence recorded against the current repository content (so deriveEvidenceStatus says current). */
const withEvidence = (repo: SysmlRepository, items: Array<Pick<VerificationEvidence, 'id' | 'verificationCaseId' | 'result' | 'executedAt'> & { simulation?: any }>): SysmlRepository => {
  const next = structuredClone(repo);
  for (const e of items) {
    next.evidence[e.id] = { requirementId: 'req1', revision: next.revision, status: 'current', ...e } as VerificationEvidence;
  }
  return next;
};

const row = (repo: SysmlRepository, options?: Parameters<typeof buildTraceabilityMatrix>[4]) => buildTraceabilityMatrix(repo, {}, undefined, [], options).rows[0];

describe('RTM: only the latest evidence per verification case counts', () => {
  it('a later pass replaces an earlier failure of the same case', () => {
    const repo = withEvidence(seed(), [
      { id: 'e1', verificationCaseId: 'vcA', result: 'failed', executedAt: '2026-10-14T10:00:00.000Z' },
      { id: 'e2', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T11:00:00.000Z' },
    ]);
    const r = row(repo);
    expect(r.status).toBe('verified');
    expect(r.verificationStatus).toBe('passed');
    expect(r.evidence).toEqual(['e1', 'e2']); // history is still listed
  });

  it('a later failure replaces an earlier pass of the same case', () => {
    const repo = withEvidence(seed(), [
      { id: 'e1', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T10:00:00.000Z' },
      { id: 'e2', verificationCaseId: 'vcA', result: 'failed', executedAt: '2026-10-14T11:00:00.000Z' },
    ]);
    expect(row(repo).status).toBe('failed');
    expect(row(repo).verificationStatus).toBe('failed');
  });

  it('insertion order does not matter, executedAt decides', () => {
    const repo = withEvidence(seed(), [
      { id: 'z-late', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T12:00:00.000Z' },
      { id: 'a-early', verificationCaseId: 'vcA', result: 'failed', executedAt: '2026-10-14T09:00:00.000Z' },
    ]);
    expect(row(repo).status).toBe('verified');
  });

  it('the latest result of every case counts: one current failure fails the requirement', () => {
    const repo = withEvidence(seed(), [
      { id: 'e1', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T12:00:00.000Z' },
      { id: 'e2', verificationCaseId: 'vcB', result: 'failed', executedAt: '2026-10-14T10:00:00.000Z' },
    ]);
    expect(row(repo).status).toBe('failed');
  });
});

describe('RTM: simulated-model currency', () => {
  const sim = { criterionId: 'c', modelFingerprint: 'old', trace: [] };

  it('a passing result whose model changed is stale, not verified', () => {
    const repo = withEvidence(seed(), [{ id: 'e1', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T10:00:00.000Z', simulation: sim }]);
    expect(row(repo).status).toBe('verified');
    const r = row(repo, { evidenceCurrency: e => (e.simulation?.modelFingerprint === 'old' ? 'stale' : 'current') });
    expect(r.status).toBe('stale');
    expect(r.verificationStatus).toBe('passed'); // the column shows the latest result; the status says it is stale
  });

  it('a failing result whose model changed is stale, not failed', () => {
    const repo = withEvidence(seed(), [{ id: 'e1', verificationCaseId: 'vcA', result: 'failed', executedAt: '2026-10-14T10:00:00.000Z', simulation: sim }]);
    expect(row(repo).status).toBe('failed');
    expect(row(repo, { evidenceCurrency: () => 'stale' }).status).toBe('stale');
  });

  it('the resolver is only asked about the latest evidence', () => {
    const repo = withEvidence(seed(), [
      { id: 'e1', verificationCaseId: 'vcA', result: 'failed', executedAt: '2026-10-14T10:00:00.000Z', simulation: sim },
      { id: 'e2', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T11:00:00.000Z', simulation: { ...sim, modelFingerprint: 'new' } },
    ]);
    const asked: string[] = [];
    const r = row(repo, { evidenceCurrency: e => { asked.push(e.id); return e.simulation?.modelFingerprint === 'new' ? 'current' : 'stale'; } });
    expect(r.status).toBe('verified');
    expect(asked).not.toContain('e1');
  });

  it('the TRM window shows the stale status from its evidenceCurrency prop', () => {
    const repo = withEvidence(seed(), [{ id: 'e1', verificationCaseId: 'vcA', result: 'passed', executedAt: '2026-10-14T10:00:00.000Z', simulation: sim }]);
    render(React.createElement(TraceabilityMatrix, { repository: repo, evidenceCurrency: () => 'stale' } as any));
    const rows = within(screen.getByRole('table')).getAllByRole('row').filter(r => r.hasAttribute('data-status'));
    expect(rows.map(r => r.getAttribute('data-status'))).toEqual(['stale']);
  });
});
