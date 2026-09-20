import { XbridgesIntent } from '../../services/ai/planner/generalIntent';
import { resolveBlockCapability } from '../../services/ai/catalog/xbridgesCapabilityIndex';
import { deriveBehaviorsFromText } from '../textExtraction';
import { findTemplateForIntent } from '../../services/ai/templates/threePhaseInverter';
import { TaskState } from '../types';
import { createTaskState, recordAnswer } from '../requirementState';
import { ClarificationEngine, AnalysisResult } from '../clarificationEngine';
import { buildSpecification, EngineeringSpecification } from '../specificationEngine';
import { LlmProvider } from '../llmProvider';

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

/**
 * Deterministic intent classification from keywords only. Returns `undefined`
 * when no action verb is recognized (caller defaults to 'create'). The LLM is
 * deliberately not consulted here: clarification of ambiguous intent happens
 * once, validated, via extractLlmClarification in the workflow.
 */
export function classifyIntentFromKeywords(input: string): XbridgesIntent | undefined {
  const lower = input.toLowerCase();
  if (lower.startsWith('inspect') || lower.includes('inspect current') || lower.includes('show model') || lower.includes('list blocks')) {
    return 'inspect';
  }
  if (lower.startsWith('diagnose') || lower.includes('diagnose model') || lower.includes('detect fault') || lower.includes('topology error')) {
    return 'diagnose';
  }
  if (lower.startsWith('repair') || lower.includes('repair model') || lower.includes('auto-repair') || lower.includes('fix disconnected')) {
    return 'repair';
  }
  if (lower.startsWith('optimize') || lower.includes('optimize gain') || lower.includes('parameter search') || lower.includes('minimize') || lower.includes('maximize')) {
    return 'optimize';
  }
  if (lower.startsWith('modify') || lower.includes('modify gain') || lower.includes('update parameter') || lower.includes('change resistor')) {
    return 'modify';
  }
  return undefined;
}

export class RequestCollaborator {
  constructor(private readonly llm: LlmProvider) {}

  public async classifyRequest(input: string): Promise<ClassifiedRequest> {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    // 1. Deterministic keyword-based intent (LLM never classifies here).
    const intent: XbridgesIntent = classifyIntentFromKeywords(trimmed) ?? 'create';

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

    // 3. No LLM fallback: a target system must be recognizable deterministically
    // (template match, domain keyword, or catalog block). Invented target
    // systems from a model would bypass catalog validation downstream.

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

    // Behavior-named requests (thermal alarm, PID loop, motor drive, ...) are
    // supported through catalog-driven synthesis even when no single block is
    // named. Detection is deterministic keyword matching, never the LLM.
    if (!targetSystem && deriveBehaviorsFromText(trimmed).length > 0) {
      targetSystem = 'xbridges_behavioral_model';
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
