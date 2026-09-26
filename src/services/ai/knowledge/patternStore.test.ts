import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  EngineeringPatternSchema,
  PatternManifestSchema,
  EngineeringPattern,
  computePatternContentHash,
  derivePatternId
} from './patternSchemas';
import { PatternStore, PatternStoreOptions } from './patternStore';

describe('Pattern Store & Schemas (Task 8)', () => {
  const validPatternPayload: Omit<EngineeringPattern, 'contentHash' | 'id'> = {
    version: 1,
    name: 'Three-Phase Inverter Bridge',
    description: 'Standard 3-phase DC-AC inverter with PWM switching and LC filter',
    domain: 'electrical',
    provenance: {
      source: 'reviewed_corpus',
      author: 'ADIA Core Team',
      license: 'Apache-2.0',
      licenseApproved: true,
      ingestedAt: 1710000000000,
      originalSourceHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    lifecycle: 'verified',
    requirements: {
      targetSystem: 'three_phase_inverter',
      targetBehaviors: ['dc_ac_inversion', 'sinusoidal_output'],
      requiredInputs: ['dc_voltage_source'],
      requiredOutputs: ['phase_a', 'phase_b', 'phase_c'],
      operatingRanges: {
        dc_bus_voltage: { min: 200, max: 800, unit: 'V' }
      }
    },
    topology: {
      blocks: [
        { blockId: 'DC_VOLTAGE_SOURCE', role: 'source', defaultParams: { voltage: 400 } },
        { blockId: 'THREE_PHASE_INVERTER', role: 'bridge', defaultParams: { switching_freq: 10000 } }
      ],
      connections: [
        {
          sourceBlockRole: 'source',
          sourcePort: 'v_out',
          targetBlockRole: 'bridge',
          targetPort: 'dc_in'
        }
      ]
    },
    exactMappings: {
      source: 'DC_VOLTAGE_SOURCE',
      bridge: 'THREE_PHASE_INVERTER'
    },
    simulationContract: {
      minDuration: 0.1,
      stepSize: 1e-5,
      expectedObservables: ['v_phase_a', 'current_thd'],
      tolerance: { current_thd: 0.05 }
    },
    evidence: {
      proofStatus: 'proved',
      catalogFingerprint: 'cat_fp_verified_123',
      engineRunId: 'xbr_run_evidence_999',
      measuredAt: 1710000100000,
      qualityScore: 0.98
    }
  };

  let testStoreDir = '';
  let testCounter = 0;

  beforeEach(() => {
    testStoreDir = path.resolve(process.cwd(), `temp_test_pattern_store_${Date.now()}_${++testCounter}`);
    fs.mkdirSync(testStoreDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testStoreDir)) {
        fs.rmSync(testStoreDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    } catch {
      // ignore teardown lock
    }
  });

  // -------------------------------------------------------------------------
  // Step 1: Strict Schema Validation Tests
  // -------------------------------------------------------------------------
  describe('Step 1: Strict schema parsing', () => {
    it('validates a complete, valid pattern with strict types', () => {
      const contentHash = computePatternContentHash(validPatternPayload);
      const id = derivePatternId('three_phase_inverter_bridge', contentHash);
      const fullPattern: EngineeringPattern = {
        ...validPatternPayload,
        id,
        contentHash
      };

      const parsed = EngineeringPatternSchema.parse(fullPattern);
      expect(parsed.id).toBe(id);
      expect(parsed.contentHash).toBe(contentHash);
      expect(parsed.lifecycle).toBe('verified');
      expect(parsed.provenance.license).toBe('Apache-2.0');
    });

    it('fails when unknown/arbitrary properties are injected (strict schema)', () => {
      const contentHash = computePatternContentHash(validPatternPayload);
      const id = derivePatternId('three_phase_inverter_bridge', contentHash);
      const invalidPattern = {
        ...validPatternPayload,
        id,
        contentHash,
        unknownInjectedProp: 'malicious or invalid'
      };

      expect(() => EngineeringPatternSchema.parse(invalidPattern)).toThrow();
    });

    it('fails when mandatory provenance or license fields are missing or invalid', () => {
      const corrupted = {
        ...validPatternPayload,
        id: 'pat_test_123',
        contentHash: 'hash123',
        provenance: {
          // missing source and license
          author: 'Author'
        }
      };

      expect(() => EngineeringPatternSchema.parse(corrupted)).toThrow();
    });

    it('fails when simulation contract or evidence is invalid', () => {
      const corrupted = {
        ...validPatternPayload,
        id: 'pat_test_123',
        contentHash: 'hash123',
        evidence: {
          proofStatus: 'invalid_status', // must be 'proved' | 'unproved' | 'failed'
          catalogFingerprint: '',
          qualityScore: 2.5 // must be between 0 and 1
        }
      };

      expect(() => EngineeringPatternSchema.parse(corrupted)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: Content-Addressed Immutability and Store Tests
  // -------------------------------------------------------------------------
  describe('Step 2 & 3: Content-addressed store & immutability', () => {
    it('generates ID with contentHash suffix and preserves immutability on put', async () => {
      const store = new PatternStore({ storageDir: testStoreDir });
      await store.init();

      const saved = await store.put(validPatternPayload);
      expect(saved.id).toContain(saved.contentHash.slice(0, 16));
      expect(saved.contentHash).toHaveLength(64);

      // Fetch back
      const retrieved = await store.get(saved.id);
      expect(retrieved).toEqual(saved);

      // Overwriting existing content hash with same content is idempotent / succeeds
      const putAgain = await store.put(validPatternPayload);
      expect(putAgain.id).toBe(saved.id);
    });

    it('changing any content property produces a new version and distinct content hash', async () => {
      const store = new PatternStore({ storageDir: testStoreDir });
      await store.init();

      const v1 = await store.put(validPatternPayload);

      // Mutate topology param
      const modifiedPayload = {
        ...validPatternPayload,
        topology: {
          ...validPatternPayload.topology,
          blocks: [
            { blockId: 'DC_VOLTAGE_SOURCE', role: 'source', defaultParams: { voltage: 800 } }
          ]
        }
      };

      const v2 = await store.put(modifiedPayload);
      expect(v2.id).not.toBe(v1.id);
      expect(v2.contentHash).not.toBe(v1.contentHash);

      // Both versions exist concurrently in store
      const list = await store.list();
      expect(list.map(p => p.id)).toContain(v1.id);
      expect(list.map(p => p.id)).toContain(v2.id);
    });

    it('rejects put when attempting to overwrite an ID with mismatched content hash (fail closed)', async () => {
      const store = new PatternStore({ storageDir: testStoreDir });
      await store.init();

      const v1 = await store.put(validPatternPayload);

      // Attempt to tamper with the pattern file on disk
      const filePath = path.join(testStoreDir, 'patterns', `${v1.id}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      fs.writeFileSync(filePath, JSON.stringify({ ...v1, name: 'Tampered Name' }), 'utf8');

      // Attempting to read tampered pattern fails closed
      await expect(store.get(v1.id)).rejects.toThrow(/CHECKSUM_MISMATCH/);
    });

    it('fails closed when manifest is corrupted', async () => {
      const store = new PatternStore({ storageDir: testStoreDir });
      await store.init();

      await store.put(validPatternPayload);

      // Corrupt manifest file
      const manifestPath = path.join(testStoreDir, 'manifest.json');
      fs.writeFileSync(manifestPath, '{ corrupted json: true ', 'utf8');

      const reloadedStore = new PatternStore({ storageDir: testStoreDir });
      await expect(reloadedStore.init()).rejects.toThrow(/MANIFEST_CORRUPTED/);
    });
  });
});
