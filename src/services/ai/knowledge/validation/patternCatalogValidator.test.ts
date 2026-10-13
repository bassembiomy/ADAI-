import { describe, expect, it } from 'vitest';
import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { normalizePatternCandidate } from '../normalization/patternNormalizer';
import { validatePatternCatalogCompatibility } from './patternCatalogValidator';

const catalog = buildXbridgesCapabilityIndex();
const source = { url: 'https://example.com/model', author: 'Example', license: 'CC-BY-4.0', ingestedAt: 1, originalSourceHash: 'a'.repeat(64) };
const base = normalizePatternCandidate({ name: 'Step integrator', domain: 'control', source, topology: { blocks: [{ blockId: 'Step', role: 'input' }, { blockId: 'Integrator', role: 'integrator' }, { blockId: 'Scope', role: 'output' }], connections: [{ sourceBlockRole: 'input', sourcePort: 'out', targetBlockRole: 'integrator', targetPort: 'in' }, { sourceBlockRole: 'integrator', sourcePort: 'out', targetBlockRole: 'output', targetPort: 'in1' }] }, exactMappings: {} }, catalog);

describe('validatePatternCatalogCompatibility', () => {
  it('accepts a catalog-compatible normalized pattern', () => {
    const pattern = { ...base, id: 'p', contentHash: 'b'.repeat(64) } as any;
    expect(validatePatternCatalogCompatibility(pattern, catalog).valid).toBe(true);
  });
  it('rejects unknown ports and stale fingerprints', () => {
    const bad = { ...base, id: 'p', contentHash: 'b'.repeat(64), evidence: { ...base.evidence, catalogFingerprint: catalog.catalogFingerprint }, topology: { ...base.topology, connections: [{ ...base.topology.connections[0], sourcePort: 'missing' }] } } as any;
    expect(validatePatternCatalogCompatibility(bad, catalog).valid).toBe(false);
    const stale = { ...base, id: 'p', contentHash: 'b'.repeat(64), evidence: { ...base.evidence, catalogFingerprint: 'old' } } as any;
    expect(validatePatternCatalogCompatibility(stale, catalog).diagnostics[0].code).toBe('STALE_CATALOG_FINGERPRINT');
  });
});
