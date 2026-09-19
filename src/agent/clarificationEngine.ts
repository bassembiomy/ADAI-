import { TaskState, RequirementConflict, Assumption } from './types';
import { findTemplateForIntent } from '../services/ai/templates/threePhaseInverter';
import { resolveRequirements } from '../services/ai/planner/requirementResolver';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';

export interface ClarificationQuestion {
  id: string;
  key: string;
  question: string;
  recommendedDefault?: string;
  rationale: string;
  options?: string[];
  isCritical?: boolean;
}

export type AnalysisResult =
  | { status: 'complete'; completenessScore: 1.0 }
  | {
      status: 'question';
      question: ClarificationQuestion;
      missingKey: string;
      completenessScore: number;
    }
  | {
      status: 'conflict';
      conflict: RequirementConflict;
      completenessScore: number;
    }
  | { status: 'blocked'; reason: string };

interface RequirementItemSpec {
  key: string;
  question: string;
  recommendedDefault: string;
  rationale: string;
  options?: string[];
  isCritical?: boolean;
}


const AIR_FRYER_REQUIRED_SPECS: RequirementItemSpec[] = [
  {
    key: 'targetTemperature',
    question: 'What is the target operating temperature for the air fryer (e.g., 180°C - 200°C)?',
    recommendedDefault: '200°C',
    rationale: 'A target temperature is required to size heating elements and model thermal transfer.'
  },
  {
    key: 'powerRating',
    question: 'What is the maximum electrical power rating for the heating element (e.g., 1500W, 1800W)?',
    recommendedDefault: '1800W',
    rationale: 'Heating wattage defines the electrical load and heating ramp rate.'
  },
  {
    key: 'supplyVoltage',
    question: 'What is the mains supply voltage (e.g., 230V AC or 120V AC)?',
    recommendedDefault: '230V AC',
    rationale: 'Supply voltage determines electrical stage isolation and component voltage ratings.'
  },
  {
    key: 'temperatureSensor',
    question: 'What temperature sensor should be used for chamber sensing (e.g., NTC 100k, PT100 RTD)?',
    recommendedDefault: 'NTC 100k thermistor',
    rationale: 'Sensor characteristics determine ADC signal conditioning and sensing latency.'
  },
  {
    key: 'controlMethod',
    question: 'What control algorithm should regulate temperature (e.g., PID, Hysteresis / Bang-bang)?',
    recommendedDefault: 'PID temperature control',
    rationale: 'Control strategy dictates firmware code generation and closed-loop stability.'
  },
  {
    key: 'safetyMaxTemperature',
    question: 'What is the absolute maximum safety cutoff temperature (e.g., 240°C)?',
    recommendedDefault: '240°C',
    rationale: 'Mandatory thermal fuse / safety cutoff prevents thermal runaway.'
  },
  {
    key: 'successCriteria',
    question: 'What are the verification success criteria (e.g., heat up in < 4 min, overshoot < 5°C)?',
    recommendedDefault: 'Rise time to target < 4 min with overshoot < 5°C',
    rationale: 'Quantifiable criteria are required for automated simulation pass/fail reporting.'
  }
];

function extractNumeric(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const match = val.match(/-?\d+(\.\d+)?/);
    if (match) return parseFloat(match[0]);
  }
  return null;
}

/**
 * Analyzes requirement state completeness and returns either complete, next question, or conflict.
 */
export function analyzeCompleteness(
  state: TaskState,
  _projectContext?: Record<string, unknown>
): AnalysisResult {
  const answers = state.requirementState.answers;
  const targetSystem = state.requirementState.targetSystem.toLowerCase();

  // 1. Check for active unresolved conflicts
  const existingConflict = state.requirementState.conflicts.find(c => !c.resolved);
  if (existingConflict) {
    return {
      status: 'conflict',
      conflict: existingConflict,
      completenessScore: state.requirementState.completenessScore || 0
    };
  }

  // 2. Perform automated conflict detection (e.g. target temp > safety limit)
  const targetTempNum = extractNumeric(answers['targetTemperature']);
  const safetyLimitNum = extractNumeric(answers['safetyMaxTemperature']);
  if (targetTempNum !== null && safetyLimitNum !== null && targetTempNum > safetyLimitNum) {
    const conflict: RequirementConflict = {
      id: `conf-${Date.now()}`,
      description: `Target operating temperature (${answers['targetTemperature']}) exceeds maximum safety limit (${answers['safetyMaxTemperature']}).`,
      involvedKeys: ['targetTemperature', 'safetyMaxTemperature'],
      resolved: false
    };
    return {
      status: 'conflict',
      conflict,
      completenessScore: 0.5
    };
  }

  // Find template by target system or objective
  const matchedTemplate =
    findTemplateForIntent(targetSystem) ||
    findTemplateForIntent(state.requirementState.objective);

  const isAirFryer =
    targetSystem.includes('air-fryer') ||
    targetSystem.includes('air fryer') ||
    state.requirementState.objective.toLowerCase().includes('air fryer') ||
    targetSystem === '';

  const requiredSpecs: RequirementItemSpec[] = matchedTemplate
    ? matchedTemplate.requiredQuestions.map(q => ({
        key: q.key,
        question: q.question,
        recommendedDefault: q.recommendedDefault || '',
        rationale: q.rationale,
        options: q.options,
        isCritical: q.isCritical ?? true
      }))
    : isAirFryer
    ? AIR_FRYER_REQUIRED_SPECS.map(s => ({ ...s, isCritical: true }))
    : [];

  if (requiredSpecs.length === 0) {
    const generalRes = resolveRequirements(state, buildXbridgesCapabilityIndex());
    if (generalRes.conflicts && generalRes.conflicts.length > 0) {
      const c = generalRes.conflicts[0];
      return {
        status: 'conflict',
        conflict: {
          id: `conf-${Date.now()}`,
          description: c.description,
          involvedKeys: c.involvedKeys,
          resolved: false,
        },
        completenessScore: 0.5,
      };
    }
    if (generalRes.nextQuestion) {
      return {
        status: 'question',
        missingKey: generalRes.nextQuestion.key,
        completenessScore: generalRes.complete ? 1.0 : 0.4,
        question: generalRes.nextQuestion,
      };
    }
    return {
      status: 'complete',
      completenessScore: 1.0,
    };
  }

  let answeredCount = 0;
  let nextMissingSpec: RequirementItemSpec | null = null;

  for (const spec of requiredSpecs) {
    if (answers[spec.key] && String(answers[spec.key]).trim() !== '') {
      answeredCount++;
    } else if (spec.isCritical && !nextMissingSpec) {
      nextMissingSpec = spec;
    }
  }

  const baseScore = Number((answeredCount / requiredSpecs.length).toFixed(2));

  // If a critical required item is missing, ask for it immediately
  if (nextMissingSpec) {
    return {
      status: 'question',
      missingKey: nextMissingSpec.key,
      completenessScore: baseScore,
      question: {
        id: `q-${nextMissingSpec.key}`,
        key: nextMissingSpec.key,
        question: nextMissingSpec.question,
        recommendedDefault: nextMissingSpec.recommendedDefault,
        rationale: nextMissingSpec.rationale,
        options: nextMissingSpec.options,
        isCritical: nextMissingSpec.isCritical
      }
    };
  }

  // 3. Check for any unapproved assumptions/proposals in legacy mode
  if (!matchedTemplate || matchedTemplate.id === 'air_fryer') {
    const unapprovedAssumption = state.requirementState.assumptions.find(
      a => a.status === 'pending_approval'
    );
    if (unapprovedAssumption) {
      return {
        status: 'question',
        missingKey: `unapproved_${unapprovedAssumption.key}`,
        completenessScore: 0.9,
        question: {
          id: `q-approve-${unapprovedAssumption.key}`,
          key: unapprovedAssumption.key,
          question: `We proposed a default fan speed of ${unapprovedAssumption.value} for ${unapprovedAssumption.key} (${unapprovedAssumption.description}). Do you approve this default?`,
          recommendedDefault: String(unapprovedAssumption.value),
          rationale: `Engineering defaults require explicit approval before entering the specification: ${unapprovedAssumption.description}`
        }
      };
    }
  }

  return {
    status: 'complete',
    completenessScore: 1.0
  };

}

export class ClarificationEngine {
  public static analyze(state: TaskState): AnalysisResult {
    return analyzeCompleteness(state);
  }
}
