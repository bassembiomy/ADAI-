import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PatternStore } from '../patternStore';
import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { normalizePatternCandidate } from '../normalization/patternNormalizer';
import { proveAndReviewPattern } from './patternPromotionService';

describe('proveAndReviewPattern', () => {
  it('promotes only a licensed, compatible, proved pattern', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'adia-pattern-'));
    try {
      const catalog = buildXbridgesCapabilityIndex();
      const store = new PatternStore({ storageDir: dir });
      const payload = normalizePatternCandidate({ name: 'Step integrator', domain: 'control', source: { url: 'https://example.com', author: 'A', license: 'MIT', licenseApproved: true, ingestedAt: Date.now(), originalSourceHash: 'a'.repeat(64) }, topology: { blocks: [{ blockId: 'Step', role: 'input' }, { blockId: 'Integrator', role: 'integrator' }, { blockId: 'Scope', role: 'output' }], connections: [{ sourceBlockRole: 'input', sourcePort: 'out', targetBlockRole: 'integrator', targetPort: 'in' }, { sourceBlockRole: 'integrator', sourcePort: 'out', targetBlockRole: 'output', targetPort: 'in1' }] }, exactMappings: {} }, catalog);
      const stored = await store.put(payload);
      const promoted = await proveAndReviewPattern(stored.id, store, catalog, async () => ({ status: 'proved', engineRunId: 'engine_run_1' }), { reviewer: 'test', notes: 'Reviewed', approvedTargetLifecycle: 'verified' });
      expect(promoted.lifecycle).toBe('verified');
      expect(promoted.evidence.engineRunId).toBe('engine_run_1');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
