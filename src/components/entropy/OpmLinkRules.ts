/**
 * ISO 19450 connection rules: which OPM link roles are allowed between
 * which node kinds. Pure TypeScript — used by the canvas `onConnect` gate.
 */
import type { OPMLinkType, OPMNodeType } from './EntropyTypes';

export interface OpmConnectionVerdict {
  allowed: boolean;
  reason?: string;
}

const OBJECTISH: OPMNodeType[] = ['object', 'requirement'];

export function validateOpmConnection(
  linkType: OPMLinkType,
  sourceType: OPMNodeType,
  targetType: OPMNodeType
): OpmConnectionVerdict {
  const srcIsObjectish = OBJECTISH.includes(sourceType);
  const tgtIsObjectish = OBJECTISH.includes(targetType);

  switch (linkType) {
    case 'agent':
    case 'instrument':
      if (srcIsObjectish && targetType === 'process') return { allowed: true };
      return {
        allowed: false,
        reason: `${linkType === 'agent' ? 'Agent' : 'Instrument'} links connect an Object (the enabler) to a Process.`,
      };
    case 'consumption':
      if ((srcIsObjectish || sourceType === 'state') && targetType === 'process') return { allowed: true };
      return { allowed: false, reason: 'Consumption links connect an Object or State to the Process that consumes it.' };
    case 'result':
      if (sourceType === 'process' && (tgtIsObjectish || targetType === 'state')) return { allowed: true };
      return { allowed: false, reason: 'Result links connect a Process to the Object or State it yields.' };
    case 'effect':
      if (sourceType === 'process' && (tgtIsObjectish || targetType === 'state')) return { allowed: true };
      if ((srcIsObjectish || sourceType === 'state') && targetType === 'process') return { allowed: true };
      return { allowed: false, reason: 'Effect links connect a Process with the Object or State it changes.' };
    case 'trigger':
    case 'condition':
      if ((srcIsObjectish || sourceType === 'state') && targetType === 'process') return { allowed: true };
      return { allowed: false, reason: `${linkType === 'trigger' ? 'Trigger' : 'Condition'} links connect a State (or Object) to the Process it gates.` };
    case 'aggregation':
    case 'generalization':
    case 'exhibition':
      if (srcIsObjectish && tgtIsObjectish) return { allowed: true };
      return { allowed: false, reason: `Structural ${linkType} links connect two Objects.` };
    case 'satisfies':
    case 'verifies':
      if (sourceType === 'requirement' && (tgtIsObjectish || targetType === 'process')) return { allowed: true };
      return { allowed: false, reason: `${linkType === 'satisfies' ? 'Satisfies' : 'Verifies'} links connect a Requirement to the Object or Process that fulfills it.` };
    default:
      return { allowed: true };
  }
}
