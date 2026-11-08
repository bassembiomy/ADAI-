import type { ModelDiagnostic } from '../../../engine/xbridges/types';
import {
  XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE,
  XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE,
} from '../../../help/diagnosticGuidance';

export type XbHelpTopicId = 'xbridges-simulation' | 'xbridges-code-generation';

export interface DescribedDiagnostic {
  code: string;
  severity: ModelDiagnostic['severity'];
  message: string;
  blockIds: string[];
  /** What the code means and what to do, taken from the help reference. */
  meaning: string;
  helpTopicId: XbHelpTopicId;
  helpSectionId: 'errors';
}

export interface DiagnosticCounts {
  errors: number;
  warnings: number;
  infos: number;
}

const SEVERITY_PREFIX = /^(Error|Warning|Info): /;

const has = (table: Record<string, string>, code: string) => Object.prototype.hasOwnProperty.call(table, code);

/** Adds the help meaning and the help chapter of the diagnostic's code. Embedded (XB_) codes belong to code generation. */
export function describeDiagnostic(d: ModelDiagnostic): DescribedDiagnostic {
  let helpTopicId: XbHelpTopicId = 'xbridges-simulation';
  let guidance: string | undefined;
  if (has(XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE, d.code)) {
    guidance = XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE[d.code];
  } else if (has(XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE, d.code)) {
    guidance = XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE[d.code];
    helpTopicId = 'xbridges-code-generation';
  }
  return {
    code: d.code,
    severity: d.severity,
    message: d.message,
    blockIds: d.blockIds ? [...d.blockIds] : [],
    meaning: guidance !== undefined
      ? guidance.replace(SEVERITY_PREFIX, '')
      : 'This code has no help entry yet. Read the message for the block and the cause.',
    helpTopicId,
    helpSectionId: 'errors',
  };
}

export function countDiagnostics(list: readonly ModelDiagnostic[]): DiagnosticCounts {
  const counts: DiagnosticCounts = { errors: 0, warnings: 0, infos: 0 };
  for (const d of list) {
    if (d.severity === 'error') counts.errors++;
    else if (d.severity === 'warning') counts.warnings++;
    else counts.infos++;
  }
  return counts;
}

/** Identity of a diagnostic: code + sorted block ids + message. */
export function diagnosticKey(d: ModelDiagnostic): string {
  return JSON.stringify([d.code, [...(d.blockIds ?? [])].sort(), d.message]);
}

/** `current` items not yet in `known`, without repeats, in order. */
export function newDiagnostics(known: readonly ModelDiagnostic[], current: readonly ModelDiagnostic[]): ModelDiagnostic[] {
  const seen = new Set(known.map(diagnosticKey));
  const out: ModelDiagnostic[] = [];
  for (const d of current) {
    const key = diagnosticKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** `existing` followed by the items of `incoming` it does not hold yet; never drops an earlier item. */
export function mergeDiagnostics(existing: readonly ModelDiagnostic[], incoming: readonly ModelDiagnostic[]): ModelDiagnostic[] {
  return [...existing, ...newDiagnostics(existing, incoming)];
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
