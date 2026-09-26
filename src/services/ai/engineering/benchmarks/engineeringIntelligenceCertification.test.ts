import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { loadSeedConcepts, ACCEPTANCE_BENCHMARKS } from './engineeringIntelligenceCorpus';
import { computeConceptHash } from '../contracts/engineeringKnowledge';
import { ConceptStore } from '../knowledge/conceptStore';
import { FactStore } from '../knowledge/factStore';
import { ConceptGraphStore } from '../graph/conceptGraphStore';
import { HybridRetriever } from '../retrieval/hybridRetriever';
import { EngineeringIntelligencePipeline } from '../orchestration/engineeringIntelligencePipeline';
import { buildXbridgesCapabilityIndex, XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { ProjectMemoryManager } from '../memory/projectMemory';
import { ConversationMemoryManager } from '../memory/conversationMemory';
import { ModelMemoryManager } from '../memory/modelMemory';
import { ConceptToBlockMapper } from '../mapping/conceptToBlockMapper';
import { ModelIrBuilder } from '../modelIr/modelIrBuilder';
import { diffModelIr, applyModelIrDiff } from '../modelIr/modelIrDiff';
import { ClarificationManager } from '../planning/clarificationManager';
import { ReferenceResolver } from '../intent/referenceResolver';
import { EngineeringModelIR } from '../contracts/modelIr';

describe('Engineering Intelligence Certification Suite', () => {
  let tempDir: string;
  let catalog: XbridgesCapabilityIndex;
  let conceptStore: ConceptStore;
  let pipeline: EngineeringIntelligencePipeline;
  let projectMemory: ProjectMemoryManager;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-cert-suite-'));
    catalog = buildXbridgesCapabilityIndex();

    conceptStore = new ConceptStore({ storageDir: tempDir });
    const factStore = new FactStore({ storageDir: tempDir });
    const graphStore = new ConceptGraphStore({ storageDir: tempDir });

    // Seed all 12 verified cross-domain concepts
    const seedConcepts = loadSeedConcepts();
    for (const c of seedConcepts) {
      await conceptStore.put(c);
    }

    const retriever = new HybridRetriever({
      conceptStore,
      factStore,
      conceptGraphStore: graphStore
    });

    projectMemory = new ProjectMemoryManager();

    pipeline = new EngineeringIntelligencePipeline({
      catalog,
      retriever,
      projectMemory,
      conversationMemory: new ConversationMemoryManager(),
      modelMemory: new ModelMemoryManager()
    });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Cross-Domain Seeded Knowledge Invariants', () => {
    it('verifies all 12 seed concepts parse strictly and match cryptographic SHA-256 hashes', () => {
      const seedConcepts = loadSeedConcepts();
      expect(seedConcepts).toHaveLength(12);

      for (const concept of seedConcepts) {
        expect(concept.lifecycle).toBe('verified');
        expect(concept.confidence).toBe(1.0);
        expect(concept.contentHash).toHaveLength(64);
        expect(concept.contentHash).toBe(computeConceptHash(concept));
      }
    });

    it('identifies unsupported cross-domain concepts as capability gaps without inventing blocks', () => {
      const mapper = new ConceptToBlockMapper();
      const hydraulicIr: EngineeringModelIR = {
        schemaVersion: '1.0.0',
        modelId: 'model_hydraulic',
        name: 'Hydraulic Test',
        targetDomain: 'fluid_power',
        baseRevision: 0,
        subsystems: [{ id: 'sub_fluid', name: 'Fluid Stage' }],
        components: [
          {
            id: 'comp_piston',
            name: 'Hydraulic Piston',
            conceptId: 'concept_hydraulic_actuator',
            subsystemId: 'sub_fluid',
            parameters: []
          }
        ],
        ports: [],
        connections: [],
        assumptions: [],
        unresolvedParameters: [],
        validationRules: [],
        traceLinks: [],
        rationale: 'Hydraulic concept'
      };

      const result = mapper.map(hydraulicIr, catalog, []);
      expect(result.status).toBe('capability_gap');
      if (result.status === 'capability_gap') {
        expect(result.gaps[0].type).toBe('BLOCK_CAPABILITY_GAP');
        expect(result.gaps[0].conceptId).toBe('concept_hydraulic_actuator');
      }
    });
  });

  describe('2. Acceptance Benchmark A: Symbolic Arithmetic Summation', () => {
    it('executes Acceptance A end-to-end to compiled EngineeringModelPlanV2', async () => {
      const bench = ACCEPTANCE_BENCHMARKS.find(b => b.id === 'acceptance_a_addition')!;

      const result = await pipeline.processUserRequest({
        input: bench.input,
        sessionId: 'sess_cert_a',
        projectId: 'proj_cert_a',
        baseRevision: 1
      });

      expect(result.status).toBe('compiled');
      if (result.status === 'compiled') {
        expect(result.plan.schemaVersion).toBe('2.0.0');
        expect(result.plan.actions.some(a => a.kind === 'add_block' && a.blockType === 'Sum')).toBe(true);
        expect(result.citations.length).toBeGreaterThan(0);
        expect(result.architecturePlan.capabilityAssessment.feasible).toBe(true);
      }
    });
  });

  describe('3. Acceptance Benchmark B: BLDC Motor Speed Control Architecture', () => {
    it('executes Acceptance B: hierarchical decomposition, clarification, and compilation', async () => {
      const bench = ACCEPTANCE_BENCHMARKS.find(b => b.id === 'acceptance_b_bldc')!;

      // Step 1: Initial user request -> pauses at clarification
      const result1 = await pipeline.processUserRequest({
        input: bench.input,
        sessionId: 'sess_cert_b',
        projectId: 'proj_cert_b',
        baseRevision: 1
      });

      expect(result1.status).toBe('clarification_required');
      if (result1.status === 'clarification_required') {
        expect(result1.question.slotName).toBe('commutation_strategy');
        expect(result1.alternatives).toBeDefined();
        const altValues = result1.alternatives?.map(a => String(a.value));
        expect(altValues).toContain('foc');
        expect(altValues).toContain('six_step');

        // Check hierarchical decomposition
        const roles = result1.architecturePlan.subsystems.flatMap(s => s.functionalRoles);
        expect(roles).toContain('power');
        expect(roles).toContain('control');
        expect(roles).toContain('sensing');
        expect(roles).toContain('plant');

        // Step 2: User clarifies commutation strategy to FOC
        projectMemory.resolveSlot('proj_cert_b', 'commutation_strategy', 'foc');

        // Step 3: Re-execute with resolved requirement
        const result2 = await pipeline.processUserRequest({
          input: 'Use FOC commutation',
          sessionId: 'sess_cert_b',
          projectId: 'proj_cert_b',
          baseRevision: 1
        });

        // Now all required slots are resolved -> proceeds to compilation!
        expect(result2.status).toBe('compiled');
        if (result2.status === 'compiled') {
          expect(result2.plan.schemaVersion).toBe('2.0.0');
          expect(result2.plan.actions.length).toBeGreaterThan(0);
          expect(result2.citations).toBeDefined();
        }
      }
    });
  });

  describe('4. Acceptance Benchmark C: Sensorless Modification by Model IR Diff', () => {
    it('executes Acceptance C: localized diff replaces Hall sensor with sliding mode observer', () => {
      const builder = new ModelIrBuilder();

      // Base: Sensored BLDC Plan
      const basePlan = {
        schemaVersion: '1.0.0' as const,
        planId: 'plan_bldc_sensored',
        intentId: 'intent_base',
        system: { name: 'BLDC', conceptId: 'concept_bldc_drive', description: '' },
        subsystems: [
          { id: 'sub_power', name: 'Power', conceptId: 'cp', functionalRoles: ['power'] },
          { id: 'sub_control', name: 'Control', conceptId: 'cc', functionalRoles: ['control'] },
          { id: 'sub_sensing', name: 'Sensing', conceptId: 'cs', functionalRoles: ['sensing'] },
          { id: 'sub_plant', name: 'Plant', conceptId: 'cpl', functionalRoles: ['plant'] }
        ],
        components: [
          { id: 'comp_inv', name: 'Inverter', conceptId: 'concept_inverter', subsystemId: 'sub_power', role: 'actuator', designParameters: {} },
          { id: 'comp_ctrl', name: 'Controller', conceptId: 'concept_speed_controller', subsystemId: 'sub_control', role: 'controller', designParameters: {} },
          { id: 'comp_hall', name: 'Hall Sensor', conceptId: 'concept_hall_sensor', subsystemId: 'sub_sensing', role: 'sensor', designParameters: {} },
          { id: 'comp_motor', name: 'Motor', conceptId: 'concept_bldc_motor', subsystemId: 'sub_plant', role: 'plant', designParameters: {} }
        ],
        connections: [
          { id: 'c1', fromComponentId: 'comp_hall', fromPort: 'pos', toComponentId: 'comp_ctrl', toPort: 'sensor_in', semanticType: 'feedback' }
        ],
        designDecisions: [],
        informationRequirements: [],
        assumptions: [],
        knowledgeEvidence: [],
        capabilityAssessment: { feasible: true, coveredConceptIds: [], unsupportedConceptIds: [] },
        rationale: 'Sensored drive'
      };

      const baseIr = builder.buildModelIr(basePlan, 'model_bldc', 1);

      // Modified: Sensorless BLDC Plan
      const modifiedPlan = {
        ...basePlan,
        components: [
          { id: 'comp_inv', name: 'Inverter', conceptId: 'concept_inverter', subsystemId: 'sub_power', role: 'actuator', designParameters: {} },
          { id: 'comp_ctrl', name: 'Controller', conceptId: 'concept_speed_controller', subsystemId: 'sub_control', role: 'controller', designParameters: { mode: 'sensorless' } },
          { id: 'comp_smo', name: 'Sliding Mode Observer', conceptId: 'concept_smo_observer', subsystemId: 'sub_sensing', role: 'sensor', designParameters: {} },
          { id: 'comp_motor', name: 'Motor', conceptId: 'concept_bldc_motor', subsystemId: 'sub_plant', role: 'plant', designParameters: {} }
        ],
        connections: [
          { id: 'c1', fromComponentId: 'comp_smo', fromPort: 'estimated_pos', toComponentId: 'comp_ctrl', toPort: 'sensor_in', semanticType: 'feedback' }
        ]
      };

      const modifiedIr = builder.buildModelIr(modifiedPlan, 'model_bldc', 2);

      // Diff
      const diff = diffModelIr(baseIr, modifiedIr);

      // Invariants:
      // 1. Zero subsystems removed or added
      expect(diff.addedSubsystems).toHaveLength(0);
      expect(diff.removedSubsystems).toHaveLength(0);

      // 2. Power and plant components untouched
      expect(diff.unchangedComponentIds).toContain('comp_inv');
      expect(diff.unchangedComponentIds).toContain('comp_motor');

      // 3. Only sensing component replaced and control component updated
      expect(diff.removedComponents.map(c => c.id)).toEqual(['comp_hall']);
      expect(diff.addedComponents.map(c => c.id)).toEqual(['comp_smo']);
      expect(diff.modifiedComponents.map(c => c.id)).toEqual(['comp_ctrl']);

      // 4. Applying diff produces modifiedIr
      const patched = applyModelIrDiff(baseIr, diff);
      expect(patched.components.some(c => c.id === 'comp_smo')).toBe(true);
      expect(patched.components.some(c => c.id === 'comp_hall')).toBe(false);
    });
  });

  describe('5. Negative Safety & Fail-Closed Benchmarks', () => {
    it('quarantines unverified knowledge so it never reaches runtime planning', async () => {
      // Put a quarantined concept into conceptStore
      const quarantinedConcept = {
        schemaVersion: '1.0.0' as const,
        id: 'concept_unverified_antigravity',
        canonicalName: 'Antigravity Propulsion',
        aliases: ['warp'],
        domain: 'physics',
        description: 'Unverified external submission',
        functionalRoles: ['propulsion'],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [],
        outputs: [],
        designParameters: [],
        constraints: [],
        assumptions: [],
        applicableMethods: [],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'quarantined' as const, // QUARANTINED!
        confidence: 0.2,
        provenanceIds: ['untrusted_source'],
        contentHash: ''
      };
      quarantinedConcept.contentHash = computeConceptHash(quarantinedConcept);
      await conceptStore.put(quarantinedConcept);

      // Query with runtimePlanning = true
      const retriever = new HybridRetriever({
        conceptStore,
        factStore: new FactStore({ storageDir: tempDir }),
        conceptGraphStore: new ConceptGraphStore({ storageDir: tempDir })
      });

      const runtimeBundle = await retriever.retrieve({
        query: 'Antigravity Propulsion',
        runtimePlanning: true
      });

      // Must be completely excluded from runtime planning retrieval!
      expect(runtimeBundle.concepts.some(c => c.concept.id === 'concept_unverified_antigravity')).toBe(false);
    });

    it('rejects ambiguous pronoun without prior context', () => {
      const resolver = new ReferenceResolver();
      const res = resolver.resolveReference('it');
      expect(res.resolved).toBe(false);
      expect(res.diagnostics).toBeDefined();
      expect(res.diagnostics!.length).toBeGreaterThan(0);
      expect(res.diagnostics![0].message).toContain('cannot be resolved');

      // Also verify multiple candidates diagnostic
      const ambig = resolver.resolveReference('it', { recentConcepts: ['concept_motor', 'concept_pump'] });
      expect(ambig.resolved).toBe(false);
      expect(ambig.diagnostics![0].code).toBe('AMBIGUOUS_PRONOUN_REFERENCE');
    });

    it('clarification manager never repeats resolved questions', () => {
      const clarifier = new ClarificationManager();
      const plan = {
        schemaVersion: '1.0.0' as const,
        planId: 'plan_norepeat',
        intentId: 'i1',
        system: { name: 'S', conceptId: 'c1', description: '' },
        subsystems: [],
        components: [],
        connections: [],
        designDecisions: [],
        informationRequirements: [
          {
            id: 'slot_dc',
            slotName: 'dc_voltage',
            classification: 'REQUIRED' as const,
            reason: 'DC bus voltage',
            affectedDecisions: [],
            candidateValues: [24, 48],
            resolutionState: 'resolved' as const, // ALREADY RESOLVED
            resolvedValue: 24
          }
        ],
        assumptions: [],
        knowledgeEvidence: [],
        capabilityAssessment: { feasible: true, coveredConceptIds: [], unsupportedConceptIds: [] },
        rationale: ''
      };

      const decision = clarifier.next(plan);
      expect(decision.type).toBe('all_resolved');
    });
  });
});
