import { TaskState, Assumption } from './types';
import { analyzeCompleteness } from './clarificationEngine';

export interface EngineeringRequirement {
  id: string;
  category: 'thermal' | 'electrical' | 'control' | 'safety' | 'verification' | 'mechanical';
  description: string;
  sourceAnswerKey: string;
  value: string | number;
}

export interface EngineeringSpecification {
  id: string;
  taskId: string;
  title: string;
  targetSystem: string;
  requirements: EngineeringRequirement[];
  assumptions: Assumption[];
  safetyLimits: string[];
  successCriteria: string[];
  approved: boolean;
  createdAt: string;
}

/**
 * Builds a deterministic structured engineering specification from validated TaskState.
 * Rejects specifications with unapproved assumptions, unresolved conflicts, or missing parameters.
 */
export function buildSpecification(state: TaskState): EngineeringSpecification {
  // Check completeness first
  const analysis = analyzeCompleteness(state);
  if (analysis.status === 'conflict') {
    throw new Error(
      `Cannot build specification: unresolved conflicts exist (${analysis.conflict.description})`
    );
  }

  // Check unapproved assumptions
  const unapproved = state.requirementState.assumptions.filter(a => a.status === 'pending_approval');
  if (unapproved.length > 0) {
    const keys = unapproved.map(a => a.key).join(', ');
    throw new Error(`Cannot build specification: unapproved assumptions remain (${keys})`);
  }

  // Check unresolved conflicts in state
  const unresolvedConflicts = state.requirementState.conflicts.filter(c => !c.resolved);
  if (unresolvedConflicts.length > 0) {
    throw new Error(
      `Cannot build specification: unresolved conflicts exist (${unresolvedConflicts.map(c => c.description).join('; ')})`
    );
  }

  if (analysis.status !== 'complete') {
    throw new Error(
      `Cannot build specification: requirements are incomplete (status: ${analysis.status})`
    );
  }

  const answers = state.requirementState.answers;
  const targetSystem = state.requirementState.targetSystem;
  const now = new Date().toISOString();

  let reqIndex = 1;
  const makeId = () => `REQ-${targetSystem.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)}-${String(reqIndex++).padStart(3, '0')}`;

  const requirements: EngineeringRequirement[] = [];

  if (answers['targetTemperature']) {
    requirements.push({
      id: makeId(),
      category: 'thermal',
      description: 'Chamber operating cooking temperature target',
      sourceAnswerKey: 'targetTemperature',
      value: answers['targetTemperature']
    });
  }

  if (answers['powerRating']) {
    requirements.push({
      id: makeId(),
      category: 'electrical',
      description: 'Maximum electric heating power dissipation',
      sourceAnswerKey: 'powerRating',
      value: answers['powerRating']
    });
  }

  if (answers['supplyVoltage']) {
    requirements.push({
      id: makeId(),
      category: 'electrical',
      description: 'Mains input electrical supply voltage',
      sourceAnswerKey: 'supplyVoltage',
      value: answers['supplyVoltage']
    });
  }

  if (answers['temperatureSensor']) {
    requirements.push({
      id: makeId(),
      category: 'control',
      description: 'Chamber temperature sensor transducer feedback',
      sourceAnswerKey: 'temperatureSensor',
      value: answers['temperatureSensor']
    });
  }

  if (answers['controlMethod']) {
    requirements.push({
      id: makeId(),
      category: 'control',
      description: 'Closed-loop temperature regulation algorithm',
      sourceAnswerKey: 'controlMethod',
      value: answers['controlMethod']
    });
  }

  if (answers['safetyMaxTemperature']) {
    requirements.push({
      id: makeId(),
      category: 'safety',
      description: 'Maximum thermal safety shutdown temperature threshold',
      sourceAnswerKey: 'safetyMaxTemperature',
      value: answers['safetyMaxTemperature']
    });
  }

  if (answers['successCriteria']) {
    requirements.push({
      id: makeId(),
      category: 'verification',
      description: 'Automated transient simulation & control performance criteria',
      sourceAnswerKey: 'successCriteria',
      value: answers['successCriteria']
    });
  }

  if (answers['fan'] || answers['fanSpeed'] || answers['fanType']) {
    const key = answers['fan'] ? 'fan' : answers['fanSpeed'] ? 'fanSpeed' : 'fanType';
    requirements.push({
      id: makeId(),
      category: 'mechanical',
      description: 'Chamber convection air circulation fan specification',
      sourceAnswerKey: key,
      value: answers[key]
    });
  }

  if (answers['operatingModes'] || answers['modes']) {
    const key = answers['operatingModes'] ? 'operatingModes' : 'modes';
    requirements.push({
      id: makeId(),
      category: 'control',
      description: 'Air fryer operating and cooking modes',
      sourceAnswerKey: key,
      value: answers[key]
    });
  }

  const safetyLimits: string[] = [];
  if (answers['safetyMaxTemperature']) {
    safetyLimits.push(answers['safetyMaxTemperature']);
  }

  const successCriteria: string[] = [];
  if (answers['successCriteria']) {
    successCriteria.push(answers['successCriteria']);
  }

  return {
    id: `spec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    taskId: state.id,
    title: `${state.requirementState.objective} — Formal Engineering Specification`,
    targetSystem,
    requirements,
    assumptions: state.requirementState.assumptions.filter(a => a.status === 'approved'),
    safetyLimits,
    successCriteria,
    approved: false,
    createdAt: now
  };
}
