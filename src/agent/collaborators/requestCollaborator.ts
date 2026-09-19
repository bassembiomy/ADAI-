import { XbridgesIntent } from '../../services/ai/planner/generalIntent';
import { resolveBlockCapability } from '../../services/ai/catalog/xbridgesCapabilityIndex';
import { findTemplateForIntent } from '../../services/ai/templates/threePhaseInverter';
import { TaskState } from '../types';
import { createTaskState, recordAnswer } from '../requirementState';
import { ClarificationEngine, AnalysisResult } from '../clarificationEngine';
import { buildSpecification, EngineeringSpecification } from '../specificationEngine';
import { LlmProvider } from '../llmProvider';
import { intentExtractionPrompt } from '../promptTemplates';

export interface ClassifiedRequest {
  intent: XbridgesIntent;
  targetSystem: string;
  objective: string;
  isSupported: boolean;
  unsupportedReason?: string;
}

export interface RequestHandlingResult {
  status: 'clarifying' | 'awaiting_specification_approval' | 'completed' | 'blocked';
  message: string;
  intent: XbridgesIntent;
  taskState?: TaskState;
  specification?: EngineeringSpecification;
  inspectionDetails?: Record<string, unknown>;
  diagnostics?: Array<{ category: string; message: string; severity?: string }>;
}

export class RequestCollaborator {
  constructor(private readonly llm: LlmProvider) {}

  public async classifyRequest(input: string): Promise<ClassifiedRequest> {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    // 1. Check for explicit or keyword-based intent
    let intent: XbridgesIntent = 'create';
    if (lower.startsWith('inspect') || lower.includes('inspect current') || lower.includes('show model') || lower.includes('list blocks')) {
      intent = 'inspect';
    } else if (lower.startsWith('diagnose') || lower.includes('diagnose model') || lower.includes('detect fault') || lower.includes('topology error')) {
      intent = 'diagnose';
    } else if (lower.startsWith('repair') || lower.includes('repair model') || lower.includes('auto-repair') || lower.includes('fix disconnected')) {
      intent = 'repair';
    } else if (lower.startsWith('optimize') || lower.includes('optimize gain') || lower.includes('parameter search') || lower.includes('minimize') || lower.includes('maximize')) {
      intent = 'optimize';
    } else if (lower.startsWith('modify') || lower.includes('modify gain') || lower.includes('update parameter') || lower.includes('change resistor')) {
      intent = 'modify';
    }

    // 2. Determine target system
    let targetSystem: string | undefined;
    const matchedTemplate = findTemplateForIntent(trimmed);
    if (matchedTemplate) {
      targetSystem = matchedTemplate.id;
    }

    if (!targetSystem) {
      if (lower.includes('air fryer') || lower.includes('air-fryer') || lower.includes('thermal control')) {
        targetSystem = 'air-fryer';
      } else if (lower.includes('inverter') || lower.includes('three-phase') || lower.includes('3-phase')) {
        targetSystem = 'three_phase_inverter';
      } else {
        // Check catalog blocks
        const tokens = trimmed.split(/[\s,._-]+/);
        for (const token of tokens) {
          if (token.length > 2) {
            const cap = resolveBlockCapability(token);
            if (cap) {
              targetSystem = `xbridges_${cap.id.toLowerCase()}`;
              break;
            }
          }
        }
      }
    }

    // 3. Fallback to LLM if needed
    if (!targetSystem) {
      try {
        const intentReq = intentExtractionPrompt(trimmed);
        const result = await this.llm.generate<{ intent?: string; targetSystem?: string; summary?: string }>(
          intentReq,
          { type: 'object' }
        );
        if (result.success && result.data) {
          if (result.data.intent) {
            const llmIntent = result.data.intent.toLowerCase();
            if (llmIntent.includes('inspect')) intent = 'inspect';
            else if (llmIntent.includes('diag')) intent = 'diagnose';
            else if (llmIntent.includes('repair')) intent = 'repair';
            else if (llmIntent.includes('opt')) intent = 'optimize';
            else if (llmIntent.includes('modif')) intent = 'modify';
            else if (llmIntent.includes('create')) intent = 'create';
          }
          if (result.data.targetSystem) {
            targetSystem = result.data.targetSystem;
          }
        }
      } catch {
        // Deterministic fallback
      }
    }

    // If intent is inspection, diagnosis, repair, modify, or general xbridges circuit
    if (!targetSystem && (intent === 'inspect' || intent === 'diagnose' || intent === 'repair' || intent === 'modify' || intent === 'optimize')) {
      targetSystem = 'xbridges_active_model';
    }

    // Generic circuit keywords
    if (!targetSystem) {
      if (lower.includes('circuit') || lower.includes('filter') || lower.includes('converter') || lower.includes('model') || lower.includes('rl') || lower.includes('rc') || lower.includes('rlc') || lower.includes('power supply')) {
        targetSystem = 'xbridges_model';
      }
    }

    // Check for unsupported domains
    if (
      lower.includes('warp drive') ||
      lower.includes('quantum engine') ||
      lower.includes('rocket engine propulsion') ||
      lower.includes('airplane rocket')
    ) {
      return {
        intent,
        targetSystem: 'unsupported',
        objective: trimmed,
        isSupported: false,
        unsupportedReason: `Unsupported engineering intent: '${trimmed}'. Supported domains: Three-Phase Inverter ('three_phase_inverter'), Air-Fryer Thermal Control ('air-fryer'), and registered X-Bridges catalog blocks. Please specify a supported engineering system.`
      };
    }

    if (!targetSystem) {
      return {
        intent,
        targetSystem: 'unsupported',
        objective: trimmed,
        isSupported: false,
        unsupportedReason: `Unsupported engineering intent: '${trimmed}'. Supported domains: Three-Phase Inverter ('three_phase_inverter'), Air-Fryer Thermal Control ('air-fryer'), and registered X-Bridges catalog blocks. Please specify a supported engineering system.`
      };
    }

    return {
      intent,
      targetSystem,
      objective: trimmed,
      isSupported: true
    };
  }

  public initTask(classified: ClassifiedRequest): TaskState {
    const taskState = createTaskState(classified.objective, classified.targetSystem);
    const matchedTemplate = findTemplateForIntent(classified.objective);
    if (matchedTemplate && matchedTemplate.defaultAssumptions.length > 0) {
      taskState.requirementState.assumptions = matchedTemplate.defaultAssumptions.map((a, idx) => ({
        id: `assump-${matchedTemplate.id}-${idx + 1}`,
        key: a.key,
        value: a.value,
        description: a.rationale,
        status: 'approved' as const
      }));
    }
    return taskState;
  }
}
