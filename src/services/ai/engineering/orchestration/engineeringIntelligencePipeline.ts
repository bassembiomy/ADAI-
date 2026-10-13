import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { HybridRetriever } from '../retrieval/hybridRetriever';
import { ProjectMemoryManager } from '../memory/projectMemory';
import { ConversationMemoryManager } from '../memory/conversationMemory';
import { ModelMemoryManager } from '../memory/modelMemory';
import { EngineeringIntentInterpreter } from '../intent/engineeringIntentInterpreter';
import { RequestConfidencePolicy } from '../intent/requestConfidencePolicy';
import { EngineeringPlanner } from '../planning/engineeringPlanner';
import { ClarificationManager } from '../planning/clarificationManager';
import { ModelIrBuilder } from '../modelIr/modelIrBuilder';
import { ConceptToBlockMapper } from '../mapping/conceptToBlockMapper';
import { EngineeringValidationPipeline } from '../modelIr/engineeringValidationPipeline';
import { ModelIrCompiler } from '../modelIr/modelIrCompiler';
import { EngineeringArchitecturePlan, InformationRequirement } from '../contracts/architecturePlan';
import { BoundEngineeringModelIR } from '../contracts/modelIr';
import { EngineeringModelPlanV2, StructuredDiagnostic } from '../../contracts/engineeringModel';
import { CapabilityGap } from '../mapping/capabilityGap';
import { EngineeringPattern } from '../../planner/generalGraphPlanner';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface PipelineConfig {
  catalog: XbridgesCapabilityIndex;
  retriever: HybridRetriever;
  projectMemory: ProjectMemoryManager;
  conversationMemory: ConversationMemoryManager;
  modelMemory: ModelMemoryManager;
  patterns?: EngineeringPattern[];
  enabled?: boolean;
}

export interface PipelineRequest {
  input: string;
  sessionId: string;
  projectId: string;
  baseRevision: number;
  expectedBeforeHash?: string;
}

export type PipelineOutcome =
  | {
      status: 'compiled';
      plan: EngineeringModelPlanV2;
      architecturePlan: EngineeringArchitecturePlan;
      boundIr: BoundEngineeringModelIR;
      citations: string[];
      summary: string;
    }
  | {
      status: 'clarification_required';
      architecturePlan: EngineeringArchitecturePlan;
      question: InformationRequirement;
      prompt: string;
      alternatives?: { value: unknown; rationale: string }[];
    }
  | {
      status: 'capability_gap';
      gaps: CapabilityGap[];
      unsupported: string[];
      notes: string;
    }
  | {
      status: 'validation_failed';
      diagnostics: StructuredDiagnostic[];
    }
  | {
      status: 'fallback_to_legacy';
      reason: string;
    };

export class EngineeringIntelligencePipeline {
  private interpreter = new EngineeringIntentInterpreter();
  private confidencePolicy = new RequestConfidencePolicy();
  private planner = new EngineeringPlanner();
  private clarificationManager = new ClarificationManager();
  private irBuilder = new ModelIrBuilder();
  private mapper = new ConceptToBlockMapper();
  private validator = new EngineeringValidationPipeline();
  private compiler = new ModelIrCompiler();

  constructor(private config: PipelineConfig) {}

  /**
   * Processes a user request through the typed engineering intelligence pipeline.
   */
  public async processUserRequest(request: PipelineRequest): Promise<PipelineOutcome> {
    if (this.config.enabled === false) {
      return {
        status: 'fallback_to_legacy',
        reason: 'Engineering intelligence pipeline is disabled via configuration'
      };
    }

    // 0. Catalog and Fingerprint Availability Guard (Fail Closed)
    if (!this.config.catalog || !this.config.catalog.catalogFingerprint || this.config.catalog.totalBlocks === 0 || this.config.catalog.catalogFingerprint === 'stale') {
      return {
        status: 'capability_gap',
        gaps: [],
        unsupported: [],
        notes: 'Catalog unavailable or invalid/stale catalog fingerprint. Cannot execute engineering pipeline.'
      };
    }

    // 1. Semantic Intent Interpretation
    const conversationSnapshot = this.config.conversationMemory.getSnapshot(request.sessionId);
    const intentResult = await this.interpreter.interpret(
      request.input,
      conversationSnapshot ?? undefined
    );
    if (intentResult.status === 'unsupported') {
      return {
        status: 'fallback_to_legacy',
        reason: intentResult.reason
      };
    }
    const intent = intentResult.intent;

    // Check structured request confidence & clarification policy
    if (intentResult.structuredRequest) {
      const confidenceOutcome = this.confidencePolicy.evaluate(intentResult.structuredRequest);
      if (confidenceOutcome.status === 'clarification_required') {
        const blockingSlot = confidenceOutcome.clarificationQuestion;
        const infoReq: InformationRequirement = {
          id: blockingSlot.targetSlotId,
          slotName: blockingSlot.targetSlotId,
          classification: 'REQUIRED',
          reason: blockingSlot.reason,
          affectedDecisions: [],
          candidateValues: [],
          resolutionState: 'unresolved'
        };
        const archPlan: EngineeringArchitecturePlan = {
          schemaVersion: '1.0.0',
          planId: `arch_plan_${intentResult.structuredRequest.requestId}`,
          intentId: intentResult.intent.id,
          system: {
            name: 'Engineering System',
            conceptId: 'concept_system',
            description: intentResult.intent.objective
          },
          subsystems: [],
          components: [],
          connections: [],
          designDecisions: [],
          informationRequirements: [infoReq],
          assumptions: [],
          knowledgeEvidence: [],
          capabilityAssessment: {
            feasible: false,
            coveredConceptIds: [],
            unsupportedConceptIds: []
          },
          rationale: `Clarification required: ${blockingSlot.reason}`
        };

        return {
          status: 'clarification_required',
          architecturePlan: archPlan,
          question: infoReq,
          prompt: blockingSlot.question
        };
      }
    }

    // Record turn in conversation memory
    this.config.conversationMemory.recordTurn(request.sessionId, {
      role: 'user',
      content: request.input
    });

    // 2. Hybrid Engineering Knowledge Retrieval
    const queryDomain = intent.domainCandidates[0];
    let knowledge;
    let concepts: any[] = [];
    try {
      knowledge = await this.config.retriever.retrieve({
        query: intent.objective,
        domain: queryDomain
      });

      concepts = (knowledge as any).concepts || (knowledge as any).rankedConcepts || [];
      if (concepts.length === 0 && queryDomain) {
        knowledge = await this.config.retriever.retrieve({
          query: intent.objective
        });
        concepts = (knowledge as any).concepts || (knowledge as any).rankedConcepts || [];
      }
    } catch (retrieverErr: any) {
      return {
        status: 'capability_gap',
        gaps: [],
        unsupported: [],
        notes: `Engineering knowledge store failure: ${retrieverErr.message || 'Retrieval failed'}`
      };
    }

    if (concepts.length === 0) {
      return {
        status: 'capability_gap',
        gaps: [],
        unsupported: intent.systemConceptIds,
        notes: `No verified engineering concepts found for intent: "${intent.objective}"`
      };
    }

    // 3. Evidence-Backed Architecture Planning
    const projectSnapshot = this.config.projectMemory.getOrCreate(request.projectId);
    const planningResult = await this.planner.plan(
      intent,
      knowledge,
      projectSnapshot,
      intentResult.structuredRequest
    );

    if (planningResult.status === 'clarification_required') {
      const decision = this.clarificationManager.next(planningResult.plan);
      if (decision.type === 'clarification_needed') {
        return {
          status: 'clarification_required',
          architecturePlan: planningResult.plan,
          question: decision.slot,
          prompt: decision.prompt,
          alternatives: decision.alternatives
        };
      }
    } else if (planningResult.status === 'capability_gap') {
      return {
        status: 'capability_gap',
        gaps: [],
        unsupported: planningResult.unsupportedConcepts,
        notes: planningResult.notes
      };
    } else if (planningResult.status === 'invalid') {
      return {
        status: 'validation_failed',
        diagnostics: planningResult.errors.map(err => ({
          category: 'ENGINEERING',
          code: 'ARCHITECTURE_PLAN_INVALID',
          severity: 'ERROR',
          message: err
        }))
      };
    }

    const architecturePlan = planningResult.plan;

    // 4. Hierarchical Model IR Construction
    const modelFingerprint = sha256Hex(JSON.stringify({
      projectId: request.projectId,
      baseRevision: request.baseRevision,
      planId: architecturePlan.planId
    })).slice(0, 16);
    const ir = this.irBuilder.buildModelIr(
      architecturePlan,
      `model_${request.projectId}_${modelFingerprint}`,
      request.baseRevision
    );

    // 5. Concept-to-Block Capability Mapping
    const mappingResult = this.mapper.map(ir, this.config.catalog, this.config.patterns || []);
    if (mappingResult.status === 'capability_gap') {
      return {
        status: 'capability_gap',
        gaps: mappingResult.gaps,
        unsupported: mappingResult.unsupportedComponents,
        notes: 'One or more architecture concepts cannot be mapped to verified ADIA block capabilities.'
      };
    }

    const boundIr = mappingResult.boundIr;

    // 6. Staged Engineering Validation
    const validationReport = this.validator.validate(boundIr, {
      catalog: this.config.catalog
    });

    if (!validationReport.isValid) {
      return {
        status: 'validation_failed',
        diagnostics: validationReport.diagnostics
      };
    }

    // 7. Deterministic Model IR Compilation to EngineeringModelPlanV2
    const plan = this.compiler.compile(boundIr, {
      projectId: request.projectId,
      baseRevision: request.baseRevision,
      catalog: this.config.catalog,
      expectedBeforeHash: request.expectedBeforeHash
    });

    // Record model revision snapshot in model memory
    this.config.modelMemory.recordSnapshot({
      modelId: ir.modelId,
      projectId: request.projectId,
      revision: request.baseRevision,
      name: ir.name,
      targetDomain: ir.targetDomain,
      timestamp: Date.now(),
      modelPlanFingerprint: plan.planHash
    });

    return {
      status: 'compiled',
      plan,
      architecturePlan,
      boundIr,
      citations: (knowledge as any).provenanceCitations || concepts.map((c: any) => c.evidence || 'Verified knowledge base'),
      summary: architecturePlan.rationale
    };
  }
}
