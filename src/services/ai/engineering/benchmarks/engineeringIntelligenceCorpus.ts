import * as fs from 'fs';
import * as path from 'path';
import { EngineeringConcept, EngineeringConceptSchema } from '../contracts/engineeringKnowledge';

export function loadSeedConcepts(): EngineeringConcept[] {
  const filePath = path.join(process.cwd(), 'resources', 'engineering-knowledge', 'verified_concepts.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Seed concepts file not found at: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed.map((c: unknown) => EngineeringConceptSchema.parse(c));
}

export interface AcceptanceBenchmarkCase {
  id: string;
  name: string;
  description: string;
  input: string;
  expectedDomain: string;
  expectedPrimaryConcept: string;
  expectedOutcome: 'compiled' | 'clarification_required' | 'capability_gap';
}

export const ACCEPTANCE_BENCHMARKS: AcceptanceBenchmarkCase[] = [
  {
    id: 'acceptance_a_addition',
    name: 'Acceptance A: Symbolic Arithmetic Summation',
    description: 'Addition request maps to two operands and Sum block without selecting or hallucinating arbitrary blocks',
    input: 'Add two numbers',
    expectedDomain: 'arithmetic',
    expectedPrimaryConcept: 'concept_addition',
    expectedOutcome: 'compiled'
  },
  {
    id: 'acceptance_b_bldc',
    name: 'Acceptance B: BLDC Motor Speed Control Architecture',
    description: 'BLDC speed control produces hierarchical power/control/sensing/plant decomposition and clarifies commutation strategy (FOC vs six-step)',
    input: 'Design a BLDC motor speed control loop',
    expectedDomain: 'motor_control',
    expectedPrimaryConcept: 'concept_bldc_drive',
    expectedOutcome: 'clarification_required'
  },
  {
    id: 'acceptance_c_sensorless_diff',
    name: 'Acceptance C: Sensorless Modification by Model IR Diff',
    description: 'Modification request ("make it sensorless") computes localized diff swapping sensor for observer without rebuilding entire model',
    input: 'make it sensorless',
    expectedDomain: 'motor_control',
    expectedPrimaryConcept: 'concept_bldc_drive',
    expectedOutcome: 'compiled'
  }
];

export const NEGATIVE_SAFETY_BENCHMARKS = [
  {
    id: 'neg_invented_block',
    name: 'Rejection of Invented Catalog Block IDs',
    description: 'The LLM cannot invent non-existent block types (e.g. QUANTUM_WARP_DRIVE); mapper must return BLOCK_CAPABILITY_GAP'
  },
  {
    id: 'neg_unverified_quarantine',
    name: 'Quarantine of Unverified Knowledge',
    description: 'Unverified external knowledge records remain quarantined and are never returned to runtime planning'
  },
  {
    id: 'neg_ambiguous_pronoun',
    name: 'Ambiguous Pronoun Fail-Closed',
    description: 'Requests with pronouns ("make it faster") without prior conversation context are rejected with diagnostics'
  },
  {
    id: 'neg_no_repeat_clarification',
    name: 'Clarification No-Repeat Guarantee',
    description: 'Clarification manager never asks the user the same resolved question twice'
  }
];
