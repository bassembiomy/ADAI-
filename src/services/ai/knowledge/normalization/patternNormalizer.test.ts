import { describe, expect, it } from 'vitest';
import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { normalizePatternCandidate } from './patternNormalizer';

const catalog = buildXbridgesCapabilityIndex();
const source = { url: 'https://example.com/model', author: 'Example', license: 'CC-BY-4.0', ingestedAt: 1, originalSourceHash: 'a'.repeat(64) };

describe('normalizePatternCandidate', () => {
  it('normalizes a structured pattern as quarantined catalog-aware data', () => {
    const pattern = normalizePatternCandidate({
      name: 'Step integrator', domain: 'control', source,
      topology: {
        blocks: [
          { blockId: 'Step', role: 'input', defaultParams: { stepTime: 1, initialValue: 0, finalValue: 1 } },
          { blockId: 'Integrator', role: 'integrator', defaultParams: { initialCondition: 0 } },
          { blockId: 'Scope', role: 'output' },
        ],
        connections: [
          { sourceBlockRole: 'input', sourcePort: 'out', targetBlockRole: 'integrator', targetPort: 'in' },
          { sourceBlockRole: 'integrator', sourcePort: 'out', targetBlockRole: 'output', targetPort: 'in1' },
        ],
      }, exactMappings: {},
    }, catalog);
    expect(pattern.lifecycle).toBe('quarantined');
    expect(pattern.evidence.catalogFingerprint).toBe(catalog.catalogFingerprint);
  });

  it('rejects unknown mappings and dangling roles', () => {
    expect(() => normalizePatternCandidate({ name: 'Bad', domain: 'x', source, topology: { blocks: [{ blockId: 'Missing', role: 'x' }], connections: [] }, exactMappings: {} }, catalog)).toThrow(/UNKNOWN_PATTERN_BLOCK/);
    expect(() => normalizePatternCandidate({ name: 'Bad', domain: 'x', source, topology: { blocks: [{ blockId: 'Constant', role: 'x' }], connections: [{ sourceBlockRole: 'x', sourcePort: 'out', targetBlockRole: 'missing', targetPort: 'in' }] }, exactMappings: {} }, catalog)).toThrow(/DANGLING_PATTERN_CONNECTION/);
  });
});
