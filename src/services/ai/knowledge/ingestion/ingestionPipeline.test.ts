import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PatternStore } from '../patternStore';
import { ingestCandidate, promoteQuarantinedPattern } from './ingestionPipeline';
import { SourceCandidate, PromotionReview } from './ingestionSchemas';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

describe('Ingestion Pipeline (Task 9 Steps 2-4)', () => {
  let testStoreDir = '';
  let store: PatternStore;

  const validSampleJson = JSON.stringify({
    name: 'External Inverter Model',
    description: 'Reference model with <script>alert("xss")</script> tags to sanitize',
    domain: 'electrical',
    requirements: {
      targetSystem: 'three_phase_inverter',
      targetBehaviors: ['inversion'],
      requiredInputs: ['dc_in'],
      requiredOutputs: ['ac_out']
    },
    topology: {
      blocks: [
        { blockId: 'DC_VOLTAGE_SOURCE', role: 'src' }
      ],
      connections: []
    },
    exactMappings: {
      src: 'DC_VOLTAGE_SOURCE'
    },
    simulationContract: {
      minDuration: 0.1,
      stepSize: 0.001,
      expectedObservables: ['out']
    }
  });

  const validChecksum = sha256Hex(validSampleJson);

  const candidateFixture: SourceCandidate = {
    sourceUrl: 'https://raw.githubusercontent.com/community/models/main/inverter.json',
    origin: 'https://raw.githubusercontent.com',
    title: 'Community Inverter Model',
    content: validSampleJson,
    contentType: 'application/json',
    checksum: validChecksum,
    license: 'MIT',
    author: 'Community',
    retrievedAt: 1710000000000
  };

  beforeEach(async () => {
    testStoreDir = path.resolve(process.cwd(), `temp_test_ingestion_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    store = new PatternStore({ storageDir: testStoreDir });
    await store.init();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testStoreDir)) {
        fs.rmSync(testStoreDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    } catch {
      // ignore
    }
  });

  it('ingests a lawful candidate into quarantine with sanitized metadata and recorded provenance', async () => {
    const quarantined = await ingestCandidate(candidateFixture, store);

    expect(quarantined.lifecycle).toBe('quarantined');
    expect(quarantined.provenance.source).toBe(candidateFixture.sourceUrl);
    expect(quarantined.provenance.license).toBe('MIT');
    expect(quarantined.provenance.originalSourceHash).toBe(validChecksum);
    expect(quarantined.description).not.toContain('<script>');

    // Check store has the quarantined pattern
    const fromStore = await store.get(quarantined.id);
    expect(fromStore.lifecycle).toBe('quarantined');
  });

  it('accepts metadata-only source fetches without parsing them as executable pattern JSON', async () => {
    const metadataCandidate: SourceCandidate = {
      ...candidateFixture,
      sourceUrl: 'https://www.mathworks.com/help/simulink/',
      origin: 'https://www.mathworks.com',
      title: 'Simulink documentation',
      content: 'Documentation metadata only.',
      contentType: 'text/plain',
      checksum: sha256Hex('Documentation metadata only.'),
      metadataOnly: true,
    };
    const quarantined = await ingestCandidate(metadataCandidate, store);
    expect(quarantined.lifecycle).toBe('quarantined');
    expect(quarantined.topology.blocks).toHaveLength(0);
    expect(quarantined.description).toContain('Documentation metadata only.');
  });

  it('rejects candidate violating policy and does NOT write to store', async () => {
    const invalidCandidate = {
      ...candidateFixture,
      isPaywalled: true
    };

    await expect(ingestCandidate(invalidCandidate, store)).rejects.toThrow(/Policy check failed/);
    const list = await store.list();
    expect(list).toHaveLength(0);
  });

  it('detects duplicates by originalSourceHash and avoids duplicate insertions', async () => {
    const first = await ingestCandidate(candidateFixture, store);
    const second = await ingestCandidate(candidateFixture, store);

    expect(second.id).toBe(first.id);
    const list = await store.list();
    expect(list).toHaveLength(1);
  });

  it('promotes quarantined pattern only with explicit operator review, proof evidence, and catalog fingerprint', async () => {
    const quarantined = await ingestCandidate(candidateFixture, store);
    expect(quarantined.lifecycle).toBe('quarantined');

    const review: PromotionReview = {
      reviewer: 'Lead Systems Engineer',
      reviewedAt: 1710000500000,
      approvedTargetLifecycle: 'verified',
      notes: 'Fully verified with isolated worker simulation and clean audit.',
      proofEvidenceRunId: 'xbr_evidence_run_777',
      catalogFingerprint: 'cat_verified_fingerprint_abc'
    };

    const promoted = await promoteQuarantinedPattern(quarantined.id, store, review);
    expect(promoted.lifecycle).toBe('verified');
    expect(promoted.evidence.proofStatus).toBe('proved');
    expect(promoted.evidence.engineRunId).toBe('xbr_evidence_run_777');
    expect(promoted.evidence.catalogFingerprint).toBe('cat_verified_fingerprint_abc');

    // Retrieve from store to verify persisted promotion
    const reloaded = await store.get(promoted.id);
    expect(reloaded.lifecycle).toBe('verified');
  });
});
