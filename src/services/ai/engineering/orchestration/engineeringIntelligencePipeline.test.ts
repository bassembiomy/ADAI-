import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EngineeringIntelligencePipeline } from './engineeringIntelligencePipeline';
import { buildXbridgesCapabilityIndex, XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { ProjectMemoryManager } from '../memory/projectMemory';
import { ConversationMemoryManager } from '../memory/conversationMemory';
import { ModelMemoryManager } from '../memory/modelMemory';
import { ConceptStore } from '../knowledge/conceptStore';
import { FactStore } from '../knowledge/factStore';
import { SourceDocumentStore } from '../knowledge/sourceDocumentStore';
import { ConceptGraphStore } from '../graph/conceptGraphStore';
import { HybridRetriever } from '../retrieval/hybridRetriever';
import { computeConceptHash } from '../contracts/engineeringKnowledge';
import * as fs from 'fs';
import * as path from 'path';

import * as os from 'os';

// Integration tests for engineering intelligence pipeline
describe('EngineeringIntelligencePipeline', () => {
  let catalog: XbridgesCapabilityIndex;
  let pipeline: EngineeringIntelligencePipeline;
  let conceptStore: ConceptStore;
  const tempDir = path.join(os.tmpdir(), 'adia-test-pipeline-' + Date.now());

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeAll(async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    catalog = buildXbridgesCapabilityIndex();

    conceptStore = new ConceptStore({ storageDir: tempDir });
    const factStore = new FactStore({ storageDir: tempDir });
    const docStore = new SourceDocumentStore({ storageDir: tempDir });
    const graphStore = new ConceptGraphStore({ storageDir: tempDir });

    // Seed verified addition concept
    const addConcept = {
      schemaVersion: '1.0.0' as const,
      id: 'concept_addition',
      canonicalName: 'Addition',
      aliases: ['add', 'sum'],
      domain: 'arithmetic',
      description: 'Sum of numeric signals',
      functionalRoles: ['calculation'],
      requiredConcepts: [],
      optionalConcepts: [],
      alternatives: [],
      inputs: [
        { name: 'in1', type: 'number' },
        { name: 'in2', type: 'number' }
      ],
      outputs: [
        { name: 'sum', type: 'number' }
      ],
      designParameters: [],
      constraints: [],
      assumptions: [],
      applicableMethods: ['algebraic'],
      validationRuleIds: [],
      referenceIds: [],
      lifecycle: 'verified' as const,
      confidence: 1.0,
      provenanceIds: ['source_math'],
      contentHash: ''
    };
    addConcept.contentHash = computeConceptHash(addConcept);
    await conceptStore.put(addConcept);

    const retriever = new HybridRetriever({
      conceptStore,
      factStore,
      conceptGraphStore: graphStore
    });

    pipeline = new EngineeringIntelligencePipeline({
      catalog,
      retriever,
      projectMemory: new ProjectMemoryManager(),
      conversationMemory: new ConversationMemoryManager(),
      modelMemory: new ModelMemoryManager()
    });
  });

  it('runs end-to-end pipeline for arithmetic request and compiles EngineeringModelPlanV2', async () => {
    const result = await pipeline.processUserRequest({
      input: 'Add 10 and 20',
      sessionId: 'sess_test_1',
      projectId: 'proj_pipeline_test',
      baseRevision: 1
    });

    expect(result.status).toBe('compiled');
    if (result.status === 'compiled') {
      expect(result.plan).toBeDefined();
      expect(result.plan.schemaVersion).toBe('2.0.0');
      expect(result.plan.actions.some((a: any) => a.kind === 'add_block' && a.blockType === 'Sum')).toBe(true);
      expect(result.citations).toBeDefined();
      expect(result.summary).toContain('Addition');
    }
  });

  it('pauses at clarification stage when required parameters are unresolved', async () => {
    // Seed verified BLDC concept requiring commutation strategy
    const bldcConcept = {
      schemaVersion: '1.0.0' as const,
      id: 'concept_bldc_drive',
      canonicalName: 'BLDC Motor Drive',
      aliases: ['brushless dc'],
      domain: 'motor_control',
      description: 'Permanent magnet brushless DC motor drive',
      functionalRoles: ['system'],
      requiredConcepts: [],
      optionalConcepts: [],
      alternatives: [],
      inputs: [],
      outputs: [],
      designParameters: [
        {
          name: 'commutation_strategy',
          type: 'string',
          description: 'Commutation method (foc or six_step)',
          required: true
        }
      ],
      constraints: [],
      assumptions: [],
      applicableMethods: ['foc', 'six_step'],
      validationRuleIds: [],
      referenceIds: [],
      lifecycle: 'verified' as const,
      confidence: 1.0,
      provenanceIds: ['source_bldc'],
      contentHash: ''
    };
    bldcConcept.contentHash = computeConceptHash(bldcConcept);
    await conceptStore.put(bldcConcept);

    const result = await pipeline.processUserRequest({
      input: 'Build a BLDC motor drive',
      sessionId: 'sess_test_2',
      projectId: 'proj_bldc_clarify',
      baseRevision: 1
    });

    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      expect(result.question).toBeDefined();
      expect(result.question.slotName).toBe('commutation_strategy');
      expect(result.prompt).toBeDefined();
    }
  });

  it('fails closed when catalog is unavailable or catalog fingerprint is missing or stale', async () => {
    const brokenCatalog = {
      catalogFingerprint: 'stale',
      totalBlocks: 0,
      blocks: new Map(),
      aliases: new Map(),
      categories: []
    } as any;

    const pipelineWithBrokenCatalog = new EngineeringIntelligencePipeline({
      catalog: brokenCatalog,
      retriever: (pipeline as any).config.retriever,
      projectMemory: new ProjectMemoryManager(),
      conversationMemory: new ConversationMemoryManager(),
      modelMemory: new ModelMemoryManager()
    });

    const result = await pipelineWithBrokenCatalog.processUserRequest({
      input: 'Add 10 and 20',
      sessionId: 'sess_stale_cat',
      projectId: 'proj_stale_cat',
      baseRevision: 1
    });

    expect(result.status).toBe('capability_gap');
    if (result.status === 'capability_gap') {
      expect(result.notes).toMatch(/catalog unavailable or invalid\/stale/i);
    }
  });

  it('fails closed when knowledge store or retriever encounters an unexpected error', async () => {
    const brokenRetriever = {
      retrieve: () => Promise.reject(new Error('Database disk image is malformed'))
    } as any;

    const pipelineWithBrokenStore = new EngineeringIntelligencePipeline({
      catalog,
      retriever: brokenRetriever,
      projectMemory: new ProjectMemoryManager(),
      conversationMemory: new ConversationMemoryManager(),
      modelMemory: new ModelMemoryManager()
    });

    const result = await pipelineWithBrokenStore.processUserRequest({
      input: 'Add 10 and 20',
      sessionId: 'sess_broken_store',
      projectId: 'proj_broken_store',
      baseRevision: 1
    });

    expect(result.status).toBe('capability_gap');
    if (result.status === 'capability_gap') {
      expect(result.notes).toMatch(/knowledge store failure/i);
    }
  });

  it('never downgrades an invalid architecture plan into an unverified legacy plan', async () => {
    // A request that fails validation or architecture planning
    const invalidPipeline = new EngineeringIntelligencePipeline({
      catalog,
      retriever: (pipeline as any).config.retriever,
      projectMemory: new ProjectMemoryManager(),
      conversationMemory: new ConversationMemoryManager(),
      modelMemory: new ModelMemoryManager()
    });

    // Mock planner to return invalid
    (invalidPipeline as any).planner = {
      plan: () => Promise.resolve({
        status: 'invalid',
        errors: ['Algebraic loop detected between components']
      })
    };

    const result = await invalidPipeline.processUserRequest({
      input: 'Add 10 and 20',
      sessionId: 'sess_invalid_plan',
      projectId: 'proj_invalid_plan',
      baseRevision: 1
    });

    expect(result.status).toBe('validation_failed');
    expect(result.status).not.toBe('fallback_to_legacy');
    if (result.status === 'validation_failed') {
      expect(result.diagnostics[0].message).toContain('Algebraic loop detected');
    }
  });
});
