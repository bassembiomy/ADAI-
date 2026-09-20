import {
  GeneralEngineeringRequest,
  RequirementConstraint,
  RequirementValue,
} from './generalIntent';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { TaskState } from '../../../agent/types';

export type { GeneralEngineeringRequest };

export interface ClarificationQuestion {
  id: string;
  key: string;
  question: string;
  recommendedDefault?: string;
  rationale: string;
  options?: string[];
  isCritical?: boolean;
  priorityWeight?: number;
}

export interface RequirementConflictItem {
  code: 'REQUIREMENT_CONFLICT';
  description: string;
  involvedKeys: string[];
}

export interface RequirementResolution {
  complete: boolean;
  nextQuestion?: ClarificationQuestion;
  unresolvedKeys: string[];
  canonicalRequest?: GeneralEngineeringRequest;
  conflicts?: RequirementConflictItem[];
}

interface QuestionCandidate extends ClarificationQuestion {
  safetyRank: number; // 0 = highest safety priority, 1 = operating/source, 2 = load/specs
  dependencyRank: number; // 0 = root, 1 = downstream
}

function extractNumber(val: unknown): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const m = val.match(/-?\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return null;
}

function normalizeRequestInput(input: GeneralEngineeringRequest | TaskState): GeneralEngineeringRequest {
  if ('requirementState' in input) {
    const rs = input.requirementState;
    const answers = rs.answers || {};
    const inputs: RequirementValue[] = [];
    const outputs: RequirementValue[] = [];

    for (const [k, v] of Object.entries(answers)) {
      if (k.toLowerCase().includes('voltage') || k.toLowerCase().includes('supply') || k.toLowerCase().includes('in')) {
        inputs.push({ name: k, value: v as any, unit: typeof v === 'string' && v.includes('V') ? 'V' : undefined });
      } else {
        outputs.push({ name: k, value: v as any });
      }
    }

    return {
      intent: 'create',
      objective: rs.objective || rs.targetSystem || 'Engineering Model',
      targetBehaviors: [],
      inputs,
      outputs,
      constraints: (rs.constraints || []).map((c: any, i: number) => ({
        name: typeof c === 'string' ? `constraint_${i + 1}` : (c?.id || `constraint_${i + 1}`),
        type: 'max',
        target: typeof c === 'string' ? c : (c?.description || c?.target || `constraint_${i + 1}`),
        value: 0,
      })),
    };
  }
  return input;
}

export function resolveRequirements(
  input: GeneralEngineeringRequest | TaskState,
  _catalog: XbridgesCapabilityIndex
): RequirementResolution {
  const req = normalizeRequestInput(input);
  const conflicts: RequirementConflictItem[] = [];
  const unresolvedKeys: string[] = [];
  const questionCandidates: QuestionCandidate[] = [];

  // 1. Conflict detection: conflicting input values or constraint violations
  const inputNames = new Map<string, RequirementValue>();
  let hasVoltageIn = false;
  let voltageVal1: number | null = null;
  let voltageKey1: string | null = null;

  for (const inp of req.inputs) {
    const lowerName = inp.name.toLowerCase();
    const num = extractNumber(inp.value);
    if (lowerName.includes('v_in') || lowerName.includes('voltage') || lowerName.includes('vdc')) {
      hasVoltageIn = true;
      if (num !== null) {
        if (voltageVal1 !== null && Math.abs(voltageVal1 - num) > 1e-6) {
          conflicts.push({
            code: 'REQUIREMENT_CONFLICT',
            description: `Conflicting input voltage specifications detected: ${voltageKey1} (${voltageVal1}V) vs ${inp.name} (${num}V)`,
            involvedKeys: [voltageKey1!, inp.name],
          });
        } else {
          voltageVal1 = num;
          voltageKey1 = inp.name;
        }
      }
    }
    inputNames.set(inp.name, inp);
  }

  // Check constraint vs output violations
  for (const c of req.constraints) {
    const matchingOut = req.outputs.find(o => o.name === c.target);
    if (matchingOut) {
      const outNum = extractNumber(matchingOut.value);
      const limitNum = extractNumber(c.value);
      if (outNum !== null && limitNum !== null) {
        if (c.type === 'max' && outNum > limitNum) {
          conflicts.push({
            code: 'REQUIREMENT_CONFLICT',
            description: `Output ${matchingOut.name} value (${outNum}) exceeds maximum constraint limit (${limitNum})`,
            involvedKeys: [matchingOut.name, c.name],
          });
        } else if (c.type === 'min' && outNum < limitNum) {
          conflicts.push({
            code: 'REQUIREMENT_CONFLICT',
            description: `Output ${matchingOut.name} value (${outNum}) is below minimum constraint limit (${limitNum})`,
            involvedKeys: [matchingOut.name, c.name],
          });
        }
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      complete: false,
      unresolvedKeys: Array.from(new Set(conflicts.flatMap(c => c.involvedKeys))),
      conflicts,
    };
  }

  // 2. Intent-specific requirement completeness
  if (req.intent === 'create') {
    const objectiveText = `${req.objective} ${req.targetBehaviors.join(' ')}`.toLowerCase();
    const isFilterRequest = /\b(low[ -]?pass|high[ -]?pass|band[ -]?pass|filter|filtering)\b/.test(objectiveText);

    if (isFilterRequest) {
      const values = [...req.inputs, ...req.outputs];
      const hasValue = (key: string) => values.some(value => value.name.toLowerCase() === key);
      const filterQuestions: Array<{
        key: string;
        question: string;
        rationale: string;
        recommendedDefault?: string;
        dependencyRank: number;
      }> = [
        {
          key: 'input_signal',
          question: 'What is the input signal type, amplitude, and frequency range?',
          rationale: 'The input signal characteristics determine the required source and filter operating range.',
          dependencyRank: 0,
        },
        {
          key: 'cutoff_frequency',
          question: 'What cutoff frequency should the filter use?',
          rationale: 'The cutoff frequency defines the filter transfer function.',
          dependencyRank: 1,
        },
        {
          key: 'filter_order',
          question: 'What filter order is required?',
          rationale: 'Filter order determines attenuation slope and implementation complexity.',
          recommendedDefault: '1',
          dependencyRank: 1,
        },
        {
          key: 'output_signal',
          question: 'Which filtered output should be observed or connected to a sink?',
          rationale: 'An explicit output is required to verify filter behavior in simulation.',
          recommendedDefault: 'Display the filtered signal on Scope',
          dependencyRank: 2,
        },
      ];

      for (const item of filterQuestions) {
        if (hasValue(item.key)) continue;
        unresolvedKeys.push(item.key);
        questionCandidates.push({
          id: `q_${item.key}`,
          key: item.key,
          question: item.question,
          rationale: item.rationale,
          recommendedDefault: item.recommendedDefault,
          isCritical: true,
          safetyRank: 1,
          dependencyRank: item.dependencyRank,
        });
      }
    } else {
      // Power-conversion models require an operating source / DC bus voltage.
      const hasSource = req.inputs.some(
      i =>
        i.name === 'source_voltage' ||
        i.name.toLowerCase().includes('voltage') ||
        i.name.toLowerCase().includes('vdc') ||
        i.name.toLowerCase().includes('supply')
    );
      if (!hasSource) {
        unresolvedKeys.push('source_voltage');
        questionCandidates.push({
        id: 'q_source_voltage',
        key: 'source_voltage',
        question: 'What is the nominal DC bus or input source voltage (e.g., 400V, 48V, 24V)?',
        recommendedDefault: '400V',
        rationale: 'Source voltage dictates device voltage breakdown ratings and DC rail modeling.',
        options: ['400V', '48V', '24V', '12V'],
        isCritical: true,
        safetyRank: 1,
        dependencyRank: 0,
        });
      }

      // Power-conversion models require a load specification or target output behavior.
      const hasLoad = req.outputs.some(
      o =>
        o.name === 'load_specification' ||
        o.name.toLowerCase().includes('load') ||
        o.name.toLowerCase().includes('target_frequency') ||
        o.name.toLowerCase().includes('motor') ||
        o.name.toLowerCase().includes('power')
    );
      if (!hasLoad) {
        unresolvedKeys.push('load_specification');
        questionCandidates.push({
        id: 'q_load_specification',
        key: 'load_specification',
        question: 'What is the connected load type and rating (e.g., RL_LOAD, AC_INDUCTION_MOTOR, RESISTIVE)?',
        recommendedDefault: 'RL_LOAD',
        rationale: 'Load characteristics determine output filter requirements and current capacity.',
        options: ['RL_LOAD', 'AC_INDUCTION_MOTOR', 'RESISTIVE', 'PMSM'],
        isCritical: true,
        safetyRank: 2,
        dependencyRank: 1,
        });
      }
    }
  } else if (req.intent === 'optimize') {
    if (!req.optimization) {
      unresolvedKeys.push('optimization_objective');
      questionCandidates.push({
        id: 'q_opt_objective',
        key: 'optimization_objective',
        question: 'What is the optimization objective and metric (e.g., minimize_overshoot, minimize_thd)?',
        rationale: 'A target objective metric is required to evaluate candidates.',
        isCritical: true,
        safetyRank: 1,
        dependencyRank: 0,
      });
    } else {
      const opt = req.optimization;
      for (const p of opt.parametersToTune) {
        if (p.min >= p.max || (p.min === 0 && p.max === 0)) {
          const key = `optimization_bounds_${p.blockId}_${p.parameterName}`;
          unresolvedKeys.push(key);
          questionCandidates.push({
            id: `q_${key}`,
            key,
            question: `What are the search bounds [min, max] for tuning parameter ${p.parameterName} on block ${p.blockId}?`,
            rationale: 'Valid lower and upper numerical bounds are mandatory for bounded parameter search.',
            isCritical: true,
            safetyRank: 1,
            dependencyRank: 1,
          });
        }
      }
    }
  }

  // Sort candidate questions deterministically:
  // 1. safetyRank (ascending)
  // 2. dependencyRank (ascending)
  // 3. stable alphabetical key
  questionCandidates.sort((a, b) => {
    if (a.safetyRank !== b.safetyRank) return a.safetyRank - b.safetyRank;
    if (a.dependencyRank !== b.dependencyRank) return a.dependencyRank - b.dependencyRank;
    return a.key.localeCompare(b.key);
  });

  const nextQuestion = questionCandidates.length > 0 ? questionCandidates[0] : undefined;
  const complete = unresolvedKeys.length === 0 && conflicts.length === 0;

  return {
    complete,
    nextQuestion,
    unresolvedKeys,
    canonicalRequest: complete ? req : undefined,
  };
}
