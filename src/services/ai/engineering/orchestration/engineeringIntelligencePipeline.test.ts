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
      input: 'Add two numbers',
      sessionId: 'sess_test_1',
      projectId: 'proj_pipeline_test',
      baseRevision: 1
    });

    expect(result.status).toBe('compiled');
    if (result.status === 'compiled') {
      expect(result.plan).toBeDefined();
      expect(result.plan.schemaVersion).toBe('2.0.0');
      expect(result.plan.actions.some(a => a.kind === 'add_block' && a.blockType === 'Sum')).toBe(true);
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
});
