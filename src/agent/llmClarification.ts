/**
 * LLM Clarification (Advisory, Non-Authoritative)
 *
 * Ollama may help interpret free-form user text, but it is never trusted as
 * an authority:
 *
 *  1. Only intent and coarse entities are requested (behaviors + objective).
 *     Blocks, ports, parameters, quantities, and topologies can NEVER come
 *     from the model — the installed catalog is the single source of truth.
 *  2. Every field the model returns is re-validated deterministically:
 *     unknown intents and unknown behavior names are dropped silently.
 *  3. The call is bounded by health checks and hard timeouts. If Ollama is
 *     unavailable, slow, or returns malformed output, the deterministic
 *     extraction path proceeds exactly as if no model existed.
 *  4. An LLM-suggested intent may only replace the default 'create' intent;
 *     it can never override a deterministically recognized action verb.
 */

import { LlmProvider } from './llmProvider';
import { XbridgesIntent } from '../services/ai/planner/generalIntent';

/** The only intents a clarification may ever suggest. */
export const CLARIFIABLE_INTENTS: readonly XbridgesIntent[] = [
  'create',
  'inspect',
  'modify',
  'diagnose',
  'repair',
  'optimize',
];

/**
 * Canonical behavior vocabulary. A clarification may only ever contribute
 * behaviors from this list; anything else is dropped. Kept in sync with the
 * deterministic keyword table in generalXbridgesWorkflow.deriveBehaviorsFromText.
 */
export const KNOWN_BEHAVIOR_VOCABULARY: readonly string[] = [
  'closed_loop_control',
  'speed_control',
  'low_pass_filter',
  'thermal_alarm_logic',
  'motor_drive',
  'feed_forward',
  'thermal_control',
  'logical_sequencing',
];

export interface LlmClarification {
  /** Suggested intent (only honored where canApplyLlmIntent allows). */
  intent?: XbridgesIntent;
  /** Behaviors validated against KNOWN_BEHAVIOR_VOCABULARY (sorted, unique). */
  behaviors: string[];
  /** Trimmed, length-capped objective restatement. */
  objective?: string;
}

export interface ClarificationOptions {
  /** Hard wall-clock cap for health + generation combined. Default 4000 ms. */
  timeoutMs?: number;
}

const MAX_OBJECTIVE_CHARS = 500;

/** Verbs that deterministically mark a creation request. */
const CREATE_VERB_PATTERN = /\b(create|build|make|add|new|generate|design|synthes\w+|implement)\b/i;

/**
 * Deterministically validates a raw clarification payload. Never throws and
 * never invents content: unknown fields are ignored, invalid values dropped.
 */
export function validateLlmClarificationPayload(raw: unknown): LlmClarification {
  const result: LlmClarification = { behaviors: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const data = raw as Record<string, unknown>;

  const intent = data.intent;
  if (typeof intent === 'string') {
    const normalized = intent.trim().toLowerCase();
    const match = CLARIFIABLE_INTENTS.find(i => normalized.includes(i));
    if (match) result.intent = match;
  }

  if (Array.isArray(data.behaviors)) {
    const known = new Set<string>();
    for (const b of data.behaviors) {
      if (typeof b === 'string') {
        const normalized = b.trim().toLowerCase();
        if ((KNOWN_BEHAVIOR_VOCABULARY as readonly string[]).includes(normalized)) {
          known.add(normalized);
        }
      }
    }
    result.behaviors = [...known].sort();
  }

  if (typeof data.objective === 'string') {
    const trimmed = data.objective.trim().slice(0, MAX_OBJECTIVE_CHARS);
    if (trimmed.length > 0) result.objective = trimmed;
  }

  return result;
}

/**
 * An LLM intent may only replace the *default* 'create' classification and
 * only when the user text carries no explicit creation verb. Deterministic
 * keyword matches always win.
 */
export function canApplyLlmIntent(input: string, deterministicIntent: XbridgesIntent): boolean {
  return deterministicIntent === 'create' && !CREATE_VERB_PATTERN.test(input);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>(resolve => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(undefined);
      });
  });
}

/**
 * Runs a bounded, validated clarification round-trip against the local LLM.
 * Returns `undefined` when Ollama is unavailable, slow, malformed, or empty —
 * the caller must behave identically in that case.
 */
export async function extractLlmClarification(
  llm: LlmProvider,
  input: string,
  options?: ClarificationOptions,
): Promise<LlmClarification | undefined> {
  const timeoutMs = options?.timeoutMs ?? 4000;
  try {
    const health = await withTimeout(llm.health(), timeoutMs);
    if (!health || !health.available) return undefined;

    const generated = await withTimeout(
      llm.generate<Record<string, unknown>>(
        {
          prompt:
            `Extract engineering intent from this request. Reply with JSON only, using keys ` +
            `"intent" (one of: ${CLARIFIABLE_INTENTS.join(', ')}), "behaviors" ` +
            `(subset of: ${KNOWN_BEHAVIOR_VOCABULARY.join(', ')}), and "objective" ` +
            `(short restatement). Request: ${input}`,
          systemPrompt:
            'You are an intent extractor for an engineering modeling agent. ' +
            'Respond with a single JSON object and nothing else.',
          temperature: 0,
        },
        {
          type: 'object',
          properties: {
            intent: { type: 'string', enum: [...CLARIFIABLE_INTENTS] },
            behaviors: {
              type: 'array',
              items: { type: 'string', enum: [...KNOWN_BEHAVIOR_VOCABULARY] },
            },
            objective: { type: 'string' },
          },
        },
      ),
      timeoutMs,
    );
    if (!generated || !generated.success || generated.data === undefined || generated.data === null) {
      return undefined;
    }

    const clarified = validateLlmClarificationPayload(generated.data);
    if (!clarified.intent && clarified.behaviors.length === 0 && !clarified.objective) {
      return undefined;
    }
    return clarified;
  } catch {
    return undefined;
  }
}
