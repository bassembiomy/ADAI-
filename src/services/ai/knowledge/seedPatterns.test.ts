import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { populateSeedPatterns, SEED_PATTERNS } from './seedPatterns';
import { PatternManifestSchema } from './patternSchemas';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { isPatternCatalogCompatible } from './patternRetrieval';

describe('Seed Engineering Patterns (Task 8 Step 5)', () => {
  const resourcesDir = path.resolve(process.cwd(), 'resources', 'engineering-patterns');

  beforeEach(() => {
    try {
      if (fs.existsSync(resourcesDir)) {
        fs.rmSync(resourcesDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    } catch {
      // ignore
    }
  });

  it('populates and verifies seed patterns in resources/engineering-patterns', async () => {
    const store = await populateSeedPatterns(resourcesDir);
    const list = await store.list();

    expect(list.length).toBeGreaterThanOrEqual(3);

    // Verify manifest
    const manifestFile = path.join(resourcesDir, 'manifest.json');
    expect(fs.existsSync(manifestFile)).toBe(true);

    const manifestData = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const parsedManifest = PatternManifestSchema.parse(manifestData);
    expect(Object.keys(parsedManifest.patterns).length).toBeGreaterThanOrEqual(3);

    const capabilities = buildXbridgesCapabilityIndex();
    for (const pattern of list) {
      const compatible = isPatternCatalogCompatible(pattern, capabilities);
      expect(compatible).toBe(true);
      expect(pattern.lifecycle).toBe('verified');
      expect(pattern.provenance.licenseApproved).toBe(true);
      expect(pattern.evidence.proofStatus).toBe('proved');
    }
  });
});
