import { sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface CatalogResolutionOutcome {
  totalEntities: number;
  resolvedCount: number;
  gapCount: number;
  gaps?: Array<{ entityId: string; semanticType: string; reason: string }>;
}

export interface RequestUnderstandingAuditEvent {
  eventId: string;
  timestamp: string;
  normalizedRequestHash: string;
  extractorOutcome: 'ready' | 'clarification_required' | 'unsupported' | 'invalid';
  routeSource: 'deterministic' | 'llm_interpretation' | 'legacy_fallback';
  unresolvedSlotIds: string[];
  catalogResolutionOutcome: CatalogResolutionOutcome;
  planHash?: string;
  stageDurationsMs: {
    normalizationMs?: number;
    extractionMs?: number;
    catalogResolutionMs?: number;
    planningMs?: number;
    totalMs: number;
  };
  fallbackReason?: string;
  redactedInput: string;
}

const API_KEY_PATTERNS = [
  /\b(?:AIza[0-9A-Za-z-_]{35})\b/g,
  /\b(?:sk-[0-9A-Za-z]{20,})\b/g,
  /\b(?:ghp_[0-9A-Za-z]{36})\b/g,
  /\b(?:Bearer\s+[0-9A-Za-z-._~+/]+=*)\b/gi,
  /(?:api[_-]?key|secret|password)\s*[:=]\s*["']?([0-9A-Za-z!@#$%^&*()_+=\-`~[\]{}|;:,.<>?/]{6,})["']?/gi
];

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Redacts sensitive credentials, tokens, and PII from input text
 * while preserving engineering entities, numbers, and operational keywords.
 */
export function redactSensitiveContent(input: string): string {
  let redacted = input;

  // Redact emails
  redacted = redacted.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');

  // Redact API keys and explicit passwords/secrets
  for (const pat of API_KEY_PATTERNS) {
    redacted = redacted.replace(pat, (match) => {
      if (/^bearer\s+/i.test(match)) {
        return 'Bearer [REDACTED_TOKEN]';
      }
      if (/^(?:api[_-]?key|secret|password)/i.test(match)) {
        const parts = match.split(/[:=]/);
        return `${parts[0]}: [REDACTED_SECRET]`;
      }
      return '[REDACTED_API_KEY]';
    });
  }

  return redacted;
}

export class RequestUnderstandingAuditor {
  private readonly events: RequestUnderstandingAuditEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 1000) {
    this.maxEvents = Math.max(1, maxEvents);
  }

  public recordEvent(
    data: Omit<RequestUnderstandingAuditEvent, 'eventId' | 'timestamp'> & {
      eventId?: string;
      timestamp?: string;
    }
  ): RequestUnderstandingAuditEvent {
    const timestamp = data.timestamp || new Date().toISOString();
    const eventId =
      data.eventId ||
      `audit_${sha256Hex(`${data.normalizedRequestHash}:${timestamp}:${this.events.length}`).slice(0, 16)}`;

    const event: RequestUnderstandingAuditEvent = {
      eventId,
      timestamp,
      normalizedRequestHash: data.normalizedRequestHash,
      extractorOutcome: data.extractorOutcome,
      routeSource: data.routeSource,
      unresolvedSlotIds: [...data.unresolvedSlotIds],
      catalogResolutionOutcome: {
        totalEntities: data.catalogResolutionOutcome.totalEntities,
        resolvedCount: data.catalogResolutionOutcome.resolvedCount,
        gapCount: data.catalogResolutionOutcome.gapCount,
        gaps: data.catalogResolutionOutcome.gaps ? [...data.catalogResolutionOutcome.gaps] : undefined
      },
      planHash: data.planHash,
      stageDurationsMs: { ...data.stageDurationsMs },
      fallbackReason: data.fallbackReason,
      redactedInput: redactSensitiveContent(data.redactedInput)
    };

    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(event);

    return event;
  }

  public getEvents(): RequestUnderstandingAuditEvent[] {
    return [...this.events];
  }

  public getEventsByRequestHash(hash: string): RequestUnderstandingAuditEvent[] {
    return this.events.filter(e => e.normalizedRequestHash === hash);
  }

  public getLatestEvent(): RequestUnderstandingAuditEvent | undefined {
    return this.events.length > 0 ? this.events[this.events.length - 1] : undefined;
  }

  public clear(): void {
    this.events.length = 0;
  }
}

export const requestUnderstandingAuditor = new RequestUnderstandingAuditor();
