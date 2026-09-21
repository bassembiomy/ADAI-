import { z } from 'zod';
import { GeneralEngineeringRequest } from './generalIntent';

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
 * Pure routing function that normalizes current turn request and
 * selects exactly one planner intent or returns clarification diagnostics.
 */
export function routeDeterministically(
  request: GeneralEngineeringRequest,
  _context?: RoutingContext
): RoutingResult {
  return {
    status: 'routed',
    intent: 'unknown',
    normalizedRequest: {
      intent: request.intent,
      objective: request.objective,
      targetBehaviors: [...request.targetBehaviors],
      inputs: [...request.inputs],
      outputs: [...request.outputs],
      constraints: [...request.constraints],
      optimization: request.optimization,
      rawPrompt: request.rawPrompt,
    },
  };
}
