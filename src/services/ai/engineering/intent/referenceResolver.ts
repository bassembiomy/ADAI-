export interface MemoryContextForResolution {
  activeModel?: {
    id: string;
    name: string;
    primaryConceptId: string;
  } | null;
  recentConcepts?: string[];
  [key: string]: unknown;
}

export interface ReferenceDiagnostic {
  code: string;
  message: string;
  candidates?: string[];
}

export interface ReferenceResolutionResult {
  resolved: boolean;
  targetConceptId?: string;
  confidence: number;
  candidates?: string[];
  diagnostics?: ReferenceDiagnostic[];
}

const PRONOUNS = new Set([
  'it',
  'this',
  'that',
  'its',
  'the model',
  'the system',
  'the plant',
  'the controller'
]);

export class ReferenceResolver {
  public resolveReference(
    term: string,
    memory?: MemoryContextForResolution
  ): ReferenceResolutionResult {
    const normalized = term.trim().toLowerCase();
    if (!PRONOUNS.has(normalized)) {
      // Direct named concept reference
      return {
        resolved: true,
        targetConceptId: term,
        confidence: 0.8
      };
    }

    if (memory?.activeModel?.primaryConceptId) {
      return {
        resolved: true,
        targetConceptId: memory.activeModel.primaryConceptId,
        confidence: 0.95
      };
    }

    const recent = memory?.recentConcepts ?? [];
    if (recent.length === 1) {
      return {
        resolved: true,
        targetConceptId: recent[0],
        confidence: 0.9
      };
    }

    if (recent.length > 1) {
      return {
        resolved: false,
        confidence: 0.3,
        candidates: [...recent],
        diagnostics: [
          {
            code: 'AMBIGUOUS_PRONOUN_REFERENCE',
            message: `Pronoun '${term}' is ambiguous because multiple candidate concepts exist in context: ${recent.join(', ')}`,
            candidates: [...recent]
          }
        ]
      };
    }

    return {
      resolved: false,
      confidence: 0.0,
      candidates: [],
      diagnostics: [
        {
          code: 'UNRESOLVED_REFERENCE',
          message: `Pronoun '${term}' cannot be resolved because no prior model or concept is available in memory.`
        }
      ]
    };
  }
}
