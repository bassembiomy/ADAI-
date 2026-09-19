import { describe, it, expect } from 'vitest';
import { retrieveCompatiblePatterns, PatternRetrievalQuery } from './patternRetrieval';
import { EngineeringPattern } from './patternSchemas';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('Pattern Retrieval (Task 8 Step 4)', () => {
  const capabilityIndex = buildXbridgesCapabilityIndex();

  const makeTestPattern = (
    id: string,
    overrides: Partial<EngineeringPattern> = {}
  ): EngineeringPattern => {
    return {
      version: 1,
      id,
      name: `Pattern ${id}`,
      description: 'Test description',
      domain: 'electrical',
      provenance: {
        source: 'reviewed_corpus',
        author: 'ADIA Core',
        license: 'Apache-2.0',
        licenseApproved: true,
        ingestedAt: 1710000000000
      },
      lifecycle: 'verified',
      requirements: {
        targetSystem: 'inverter',
        targetBehaviors: ['dc_ac_inversion'],
        requiredInputs: ['dc_voltage_source'],
        requiredOutputs: ['phase_a']
      },
      topology: {
        blocks: [
          { blockId: 'STEP', role: 'source' },
          { blockId: 'GAIN', role: 'amplifier' }
        ],
        connections: [
          { sourceBlockRole: 'source', sourcePort: 'out', targetBlockRole: 'amplifier', targetPort: 'u' }
        ]
      },
      exactMappings: {
        source: 'STEP',
        amplifier: 'GAIN'
      },
      simulationContract: {
        minDuration: 0.1,
        stepSize: 1e-4,
        expectedObservables: ['out']
      },
      evidence: {
        proofStatus: 'proved',
        catalogFingerprint: 'cat_fp_123',
        qualityScore: 0.95
      },
      contentHash: 'a'.repeat(64),
      ...overrides
    };
  };

  it('filters out patterns whose lifecycle is not allowed (quarantined / deprecated by default)', () => {
    const verified = makeTestPattern('pat_verified', { lifecycle: 'verified' });
    const reviewed = makeTestPattern('pat_reviewed', { lifecycle: 'reviewed' });
    const quarantined = makeTestPattern('pat_quarantined', { lifecycle: 'quarantined' });
    const deprecated = makeTestPattern('pat_deprecated', { lifecycle: 'deprecated' });

    const patterns = [verified, reviewed, quarantined, deprecated];
    const results = retrieveCompatiblePatterns({ targetSystem: 'inverter' }, patterns, capabilityIndex);

    const ids = results.map(r => r.pattern.id);
    expect(ids).toContain('pat_verified');
    expect(ids).toContain('pat_reviewed');
    expect(ids).not.toContain('pat_quarantined');
    expect(ids).not.toContain('pat_deprecated');
  });

  it('strictly excludes patterns with unsupported blocks or invalid ports in active catalog', () => {
    const compatible = makeTestPattern('pat_compatible', {
      topology: {
        blocks: [{ blockId: 'STEP', role: 'src' }],
        connections: []
      },
      exactMappings: { src: 'STEP' }
    });

    const incompatibleBlock = makeTestPattern('pat_incompatible_block', {
      topology: {
        blocks: [{ blockId: 'NON_EXISTENT_QUANTUM_DRIVE', role: 'src' }],
        connections: []
      },
      exactMappings: { src: 'NON_EXISTENT_QUANTUM_DRIVE' }
    });

    const incompatiblePort = makeTestPattern('pat_incompatible_port', {
      topology: {
        blocks: [
          { blockId: 'STEP', role: 's1' },
          { blockId: 'GAIN', role: 'g1' }
        ],
        connections: [
          { sourceBlockRole: 's1', sourcePort: 'invalid_non_existent_port', targetBlockRole: 'g1', targetPort: 'u' }
        ]
      },
      exactMappings: { s1: 'STEP', g1: 'GAIN' }
    });

    const results = retrieveCompatiblePatterns(
      { targetSystem: 'inverter' },
      [compatible, incompatibleBlock, incompatiblePort],
      capabilityIndex
    );

    const ids = results.map(r => r.pattern.id);
    expect(ids).toContain('pat_compatible');
    expect(ids).not.toContain('pat_incompatible_block');
    expect(ids).not.toContain('pat_incompatible_port');
  });

  it('ranks patterns deterministically by requirements match, quality score, then stable ID', () => {
    const p1 = makeTestPattern('pat_a', {
      requirements: {
        targetSystem: 'inverter',
        targetBehaviors: ['dc_ac_inversion', 'harmonic_filter'],
        requiredInputs: ['dc_in'],
        requiredOutputs: ['ac_out']
      },
      evidence: { proofStatus: 'proved', catalogFingerprint: 'f1', qualityScore: 0.8 }
    });

    const p2 = makeTestPattern('pat_b', {
      requirements: {
        targetSystem: 'inverter',
        targetBehaviors: ['dc_ac_inversion', 'harmonic_filter'],
        requiredInputs: ['dc_in'],
        requiredOutputs: ['ac_out']
      },
      evidence: { proofStatus: 'proved', catalogFingerprint: 'f1', qualityScore: 0.95 }
    });

    const p3 = makeTestPattern('pat_c', {
      requirements: {
        targetSystem: 'inverter',
        targetBehaviors: ['dc_ac_inversion'],
        requiredInputs: ['dc_in'],
        requiredOutputs: ['ac_out']
      },
      evidence: { proofStatus: 'proved', catalogFingerprint: 'f1', qualityScore: 0.99 }
    });

    const query: PatternRetrievalQuery = {
      targetSystem: 'inverter',
      targetBehaviors: ['dc_ac_inversion', 'harmonic_filter'],
      requiredInputs: ['dc_in'],
      requiredOutputs: ['ac_out']
    };

    const results = retrieveCompatiblePatterns(query, [p1, p2, p3], capabilityIndex);

    // p2 matches 4/4 requirements with 0.95 quality
    // p1 matches 4/4 requirements with 0.8 quality
    // p3 matches 3/4 requirements with 0.99 quality
    expect(results[0].pattern.id).toBe('pat_b');
    expect(results[1].pattern.id).toBe('pat_a');
    expect(results[2].pattern.id).toBe('pat_c');
  });
});
