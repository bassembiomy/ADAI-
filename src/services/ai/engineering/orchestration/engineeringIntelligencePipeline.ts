import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { HybridRetriever } from '../retrieval/hybridRetriever';
import { ProjectMemoryManager } from '../memory/projectMemory';
import { ConversationMemoryManager } from '../memory/conversationMemory';
import { ModelMemoryManager } from '../memory/modelMemory';
import { EngineeringIntentInterpreter } from '../intent/engineeringIntentInterpreter';
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

    // Record turn in conversation memory
    this.config.conversationMemory.recordTurn(request.sessionId, {
      role: 'user',
      content: request.input
    });

    // 2. Hybrid Engineering Knowledge Retrieval
    const queryDomain = intent.domainCandidates[0];
    let knowledge = await this.config.retriever.retrieve({
      query: intent.objective,
      domain: queryDomain
    });

    let concepts = (knowledge as any).concepts || (knowledge as any).rankedConcepts || [];
    if (concepts.length === 0 && queryDomain) {
      knowledge = await this.config.retriever.retrieve({
        query: intent.objective
      });
      concepts = (knowledge as any).concepts || (knowledge as any).rankedConcepts || [];
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
    const planningResult = await this.planner.plan(intent, knowledge, projectSnapshot);

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
