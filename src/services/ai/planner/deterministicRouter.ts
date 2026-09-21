import { z } from 'zod';
import { GeneralEngineeringRequest } from './generalIntent';
import { parseArithmeticOperands, parseEngineeringEntities } from './engineeringEntityParser';

export const PlannerIntentSchema = z.enum([
  'arithmetic',
  'pattern_workflow',
  'model_construction',
  'validation',
  'simulation',
  'unknown',
]);

export type PlannerIntent = z.infer<typeof PlannerIntentSchema>;

export const RoutingDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  remediation: z.string().optional(),
  failedPreconditions: z.array(z.string()).optional(),
});

export type RoutingDiagnostic = z.infer<typeof RoutingDiagnosticSchema>;

export interface NormalizedRoutingRequest extends GeneralEngineeringRequest {
  explicitIntent?: PlannerIntent;
  operands?: Array<{ value: number; unit?: string; baseUnit?: string; raw?: string }>;
  sourceMetadata?: Record<string, unknown>;
  entities?: Record<string, unknown>;
}

export type RoutingResult =
  | {
      status: 'routed';
      intent: PlannerIntent;
      normalizedRequest: NormalizedRoutingRequest;
    }
  | {
      status: 'clarification';
      diagnostics: RoutingDiagnostic[];
    };

export interface RoutingContext {
  conversationHistory?: Array<unknown>;
  priorTurn?: unknown;
  [key: string]: unknown;
}

/**
 * Normalizes the current-turn request by copying only fields present
 * on the supplied request, completely isolated from prior conversational context.
 */
export function normalizeCurrentTurn(request: GeneralEngineeringRequest): NormalizedRoutingRequest {
  const parsedOps = parseArithmeticOperands(request.objective || '');
  let operands = request.operands ? [...request.operands] : [...parsedOps.operands];

  if (operands.length === 0 && request.inputs && request.inputs.length > 0) {
    for (const inp of request.inputs) {
      if (typeof inp.value === 'number') {
        operands.push({ value: inp.value, raw: String(inp.value) });
      }
    }
  }

  if (operands.length === 1 && parsedOps.hasEachQualifier) {
    operands = [operands[0], operands[0]];
  }

  const parsedEntities = parseEngineeringEntities(request.objective || '');
  const entities = request.entities
    ? { ...request.entities }
    : (Object.keys(parsedEntities).length > 0 ? (parsedEntities as Record<string, unknown>) : undefined);

  return {
    intent: request.intent,
    objective: request.objective,
    targetBehaviors: [...(request.targetBehaviors || [])],
    inputs: [...(request.inputs || [])],
    outputs: [...(request.outputs || [])],
    constraints: [...(request.constraints || [])],
    optimization: request.optimization,
    rawPrompt: request.rawPrompt,
    sourceMetadata: request.sourceMetadata ? { ...request.sourceMetadata } : undefined,
    operands: operands.length > 0 ? operands : undefined,
    entities,
    explicitIntent: request.explicitIntent && PlannerIntentSchema.safeParse(request.explicitIntent).success
      ? request.explicitIntent as PlannerIntent
      : undefined,
  };
}

// Bounded candidate detector patterns with strict word boundaries
const ARITHMETIC_PATTERN = /\b(?:add|addition|sum|summation|plus|subtract|subtraction|minus|difference|multiply|multiplication|product\s+of|times|divide|division|divided\s+by|quotient|squared|cubed|pow|power\s+of|raise\s+to\s+(?:the\s+)?power|to\s+the\s+power\s+of)\b/i;
const GRAPH_EDIT_ADD_PATTERN = /\badd\s+(?:a\s+|an\s+|the\s+)?(?:gain|stage|block|component|node|connection|port|parameter|subsystem|circuit|model|sensor|actuator|filter)\b/gi;
const PATTERN_WORKFLOW_PATTERN = /\b(?:patternstore|patterns?|template|templates?|artifact|artifacts?|catalog\s+metadata|ingest(?:ion)?|provenance)\b/i;
const VALIDATION_PATTERN = /\b(?:validate|validation|verify|verification|check\s+(?:topology|model|consistency|bounds))\b/i;
const SIMULATION_PATTERN = /\b(?:simulate|simulation|run\s+simulation|step\s+response|transient\s+response)\b/i;
const MODEL_CONSTRUCTION_PATTERN = /\b(?:construct|create|build|design|assemble|synthesize|model|feedback|feed[-_\s]?forward|open[-_\s]?loop|closed[-_\s]?loop|control|loop|rlc|resonant|transfer[-_\s]?function|second[-_\s]?order|plant|integrat(?:e|ion|or)?|filter|filtering|motor|actuator|thermal|heat|cooling|logic|sequence|safety|interlock|gain|pid)\b/i;

export interface PreconditionCheck {
  eligible: boolean;
  failedPreconditions: string[];
  diagnostics?: RoutingDiagnostic[];
}

/**
 * Checks candidate preconditions for a given intent.
 */
export function checkPreconditions(
  intent: PlannerIntent,
  req: NormalizedRoutingRequest
): PreconditionCheck {
  if (intent === 'arithmetic') {
    const operands = req.operands || [];
    if (operands.length < 2) {
      return {
        eligible: false,
        failedPreconditions: ['finite_operands_required'],
        diagnostics: [
          {
            code: 'MISSING_ARITHMETIC_OPERAND',
            message: `Arithmetic operations require at least two finite operands, but found ${operands.length}.`,
            remediation: 'Specify both operand values explicitly (e.g. "add 5 and 7" or "multiply 10 by 100").',
            failedPreconditions: ['finite_operands_required'],
          },
        ],
      };
    }

    const nonFinite = operands.some(op => !Number.isFinite(op.value));
    if (nonFinite) {
      return {
        eligible: false,
        failedPreconditions: ['finite_operands_required'],
        diagnostics: [
          {
            code: 'INVALID_ARITHMETIC_OPERAND',
            message: 'One or more operands is not a finite number.',
            remediation: 'Provide valid finite numeric values.',
            failedPreconditions: ['finite_operands_required'],
          },
        ],
      };
    }

    return { eligible: true, failedPreconditions: [] };
  }

  if (intent === 'pattern_workflow') {
    const text = `${req.objective} ${(req.targetBehaviors || []).join(' ')}`.toLowerCase();
    if (/\b(?:ingest|publish|register)\b/i.test(text) && !req.sourceMetadata) {
      return {
        eligible: false,
        failedPreconditions: ['source_metadata_required'],
        diagnostics: [
          {
            code: 'MISSING_PATTERN_SOURCE_METADATA',
            message: 'Pattern ingestion requires valid source metadata (e.g. author, license, sourceUri).',
            remediation: 'Provide pattern source metadata before requesting ingestion or registration.',
            failedPreconditions: ['source_metadata_required'],
          },
        ],
      };
    }
    return { eligible: true, failedPreconditions: [] };
  }

  return { eligible: true, failedPreconditions: [] };
}

/**
 * Pure routing function that normalizes current turn request and
 * selects exactly one planner intent or returns clarification diagnostics.
 */
export function routeDeterministically(
  request: GeneralEngineeringRequest,
  _context?: RoutingContext
): RoutingResult {
  if (!request.objective || request.objective.trim().length === 0) {
    return {
      status: 'clarification',
      diagnostics: [
        {
          code: 'EMPTY_REQUEST_OBJECTIVE',
          message: 'The request objective is empty or contains only whitespace.',
          remediation: 'Please specify an engineering objective or operational command.',
        },
      ],
    };
  }

  const normalized = normalizeCurrentTurn(request);
  const text = `${normalized.objective} ${(normalized.targetBehaviors || []).join(' ')}`.trim();

  if (request.explicitIntent && !PlannerIntentSchema.safeParse(request.explicitIntent).success) {
    return {
      status: 'clarification',
      diagnostics: [
        {
          code: 'INVALID_EXPLICIT_INTENT',
          message: `The explicit planner intent "${request.explicitIntent}" is not supported.`,
          remediation: `Use one of: ${PlannerIntentSchema.options.join(', ')}.`,
        },
      ],
    };
  }

  // If explicit intent was specified, honor it if valid
  if (normalized.explicitIntent) {
    const pre = checkPreconditions(normalized.explicitIntent, normalized);
    if (!pre.eligible) {
      return {
        status: 'clarification',
        diagnostics: pre.diagnostics || [
          {
            code: 'PRECONDITION_FAILED',
            message: `Preconditions failed for explicit intent ${normalized.explicitIntent}: ${pre.failedPreconditions.join(', ')}`,
            failedPreconditions: pre.failedPreconditions,
          },
        ],
      };
    }
    return {
      status: 'routed',
      intent: normalized.explicitIntent,
      normalizedRequest: normalized,
    };
  }

  // Detect candidate intents
  const candidates: PlannerIntent[] = [];

  const hasArithmeticCandidate = () => {
    if (!ARITHMETIC_PATTERN.test(text)) return false;
    const stripped = text.replace(GRAPH_EDIT_ADD_PATTERN, ' ');
    return ARITHMETIC_PATTERN.test(stripped);
  };

  if (hasArithmeticCandidate()) {
    candidates.push('arithmetic');
  }
  if (PATTERN_WORKFLOW_PATTERN.test(text)) {
    candidates.push('pattern_workflow');
  }
  if (VALIDATION_PATTERN.test(text)) {
    candidates.push('validation');
  }
  if (SIMULATION_PATTERN.test(text)) {
    candidates.push('simulation');
  }
  if (MODEL_CONSTRUCTION_PATTERN.test(text) && !candidates.includes('arithmetic')) {
    candidates.push('model_construction');
  }

  // If conflicting intents detected
  if (candidates.length > 1) {
    if (candidates.includes('arithmetic') && (candidates.includes('pattern_workflow') || candidates.includes('model_construction'))) {
      return {
        status: 'clarification',
        diagnostics: [
          {
            code: 'AMBIGUOUS_PLANNER_INTENT',
            message: `Conflicting intents detected: ${candidates.join(', ')}. Unable to route deterministically.`,
            remediation: 'Clarify whether you want an arithmetic operation or a pattern store workflow.',
          },
        ],
      };
    }
  }

  if (candidates.length === 0) {
    return {
      status: 'routed',
      intent: 'unknown',
      normalizedRequest: normalized,
    };
  }

  // Stable precedence order: arithmetic -> pattern_workflow -> validation -> simulation -> model_construction
  const intentPrecedence: PlannerIntent[] = [
    'arithmetic',
    'pattern_workflow',
    'validation',
    'simulation',
    'model_construction',
  ];

  const selectedIntent = intentPrecedence.find(intent => candidates.includes(intent)) || candidates[0];
  const preCheck = checkPreconditions(selectedIntent, normalized);
  if (!preCheck.eligible) {
    return {
      status: 'clarification',
      diagnostics: preCheck.diagnostics || [
        {
          code: 'PRECONDITION_FAILED',
          message: `Preconditions failed for intent ${selectedIntent}`,
          failedPreconditions: preCheck.failedPreconditions,
        },
      ],
    };
  }

  return {
    status: 'routed',
    intent: selectedIntent,
    normalizedRequest: normalized,
  };
}
