import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from './model';
import { deriveEvidenceStatus, evaluateSysmlOperationGate, recordVerificationEvidence, semanticFingerprint, traceArtifactToRequirement } from './evidence';
import { buildTraceabilityMatrix } from './rtm';

function repository() {
  const repo = createEmptyRepository();
  repo.definitions.b = { id: 'b', name: 'Controller', namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.requirements.r = { id: 'r', name: 'Safety', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Safe', status: 'implemented', version: '1', owner: 'Systems' };
  repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'b', targetId: 'r' };
  repo.verificationCases.v = { id: 'v', name: 'Safety test', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['r'] };
  repo.relationships.vr = { id: 'vr', kind: 'verify', sourceId: 'v', targetId: 'r' };
  return repo;
}

describe('SysML verification evidence and artifact trace', () => {
  it('records evidence against the semantic fingerprint of its complete trace closure', () => {
    const result = recordVerificationEvidence(repository(), {
      id: 'e', verificationCaseId: 'v', requirementId: 'r', result: 'passed', executedAt: '2026-09-08T12:00:00Z', artifactUri: 'results/safety.json',
    });
    expect(result.repository.evidence.e.semanticFingerprint).toBeTruthy();
    expect(deriveEvidenceStatus(result.repository, 'e')).toBe('current');
    expect(buildTraceabilityMatrix(result.repository).rows[0].status).toBe('verified');
  });

  it('invalidates evidence after a traced semantic change but not a layout-only change', () => {
    const recorded = recordVerificationEvidence(repository(), {
      id: 'e', verificationCaseId: 'v', requirementId: 'r', result: 'passed', executedAt: '2026-09-08T12:00:00Z',
    }).repository;
    const layoutOnly = structuredClone(recorded) as typeof recorded & { layout?: unknown };
    layoutOnly.layout = { b: { x: 900, y: 400 } };
    expect(semanticFingerprint(layoutOnly, 'r')).toBe(semanticFingerprint(recorded, 'r'));
    expect(deriveEvidenceStatus(layoutOnly, 'e')).toBe('current');

    const semanticChange = structuredClone(recorded);
    (semanticChange.definitions.b as BlockDefinition).name = 'Changed Controller';
    semanticChange.revision += 1;
    expect(deriveEvidenceStatus(semanticChange, 'e')).toBe('stale');
  });

  it('links simulation and generated source artifacts bidirectionally into the RTM trace graph', () => {
    let repo = repository();
    repo = traceArtifactToRequirement(repo, { id: 'sim', name: 'Safety simulation', kind: 'simulation', ownerId: 'b', revision: 0 }, 'r').repository;
    repo = traceArtifactToRequirement(repo, { id: 'code', name: 'controller.c', kind: 'generatedArtifact', ownerId: 'b', revision: 1, uri: 'src/controller.c' }, 'r').repository;
    expect(repo.relationships['trace-sim-r']).toMatchObject({ sourceId: 'sim', targetId: 'r', kind: 'trace' });
    expect(repo.relationships['trace-code-r']).toMatchObject({ sourceId: 'code', targetId: 'r', kind: 'trace' });
  });

  it('fails simulation/report/export/verification gates closed for invalid repositories', () => {
    const repo = repository();
    repo.relationships.dangling = { id: 'dangling', kind: 'trace', sourceId: 'missing', targetId: 'r' };
    for (const operation of ['simulate', 'report', 'export', 'verify'] as const) {
      const gate = evaluateSysmlOperationGate(repo, operation);
      expect(gate.allowed).toBe(false);
      expect(gate.diagnostics.map(item => item.code)).toContain('MISSING_RELATIONSHIP_ENDPOINT');
    }
  });
});
