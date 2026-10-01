import { describe, expect, it } from 'vitest';
import { loadVerifiedRuntimePatterns } from './runtimePatternGateway';
import { computePatternContentHash, derivePatternId } from './patternSchemas';

function validPattern() {
  const payload = {
    version: 1,
    name: 'Runtime PID',
    description: 'Verified runtime pattern',
    domain: 'control',
    provenance: {
      source: 'test', author: 'ADIA', license: 'MIT', licenseApproved: true, ingestedAt: 1
    },
    lifecycle: 'verified' as const,
    requirements: {
      targetSystem: 'closed_loop_pid', targetBehaviors: ['control'], requiredInputs: [], requiredOutputs: []
    },
    topology: { blocks: [], connections: [] },
    exactMappings: {},
    simulationContract: { minDuration: 1, stepSize: 0.01, expectedObservables: [] },
    evidence: { proofStatus: 'proved' as const, catalogFingerprint: 'catalog', qualityScore: 1 }
  };
  const contentHash = computePatternContentHash(payload);
  return { ...payload, id: derivePatternId(payload.name, contentHash), contentHash };
}

describe('loadVerifiedRuntimePatterns', () => {
  it('loads checksum-valid, licensed, verified records through the runtime bridge', async () => {
    const pattern = validPattern();
    const result = await loadVerifiedRuntimePatterns({ patternStoreList: async () => [pattern] });
    expect(result).toEqual([pattern]);
  });

  it('fails closed when a runtime record checksum is invalid', async () => {
    const pattern = { ...validPattern(), description: 'tampered after hashing' };
    await expect(loadVerifiedRuntimePatterns({ patternStoreList: async () => [pattern] }))
      .rejects.toThrow(/PATTERN_CHECKSUM_MISMATCH/);
  });
});
