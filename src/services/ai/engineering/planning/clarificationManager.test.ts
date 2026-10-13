import { describe, it, expect } from 'vitest';
import { ClarificationManager, SlotAnswer } from './clarificationManager';
import { EngineeringArchitecturePlan } from '../contracts/architecturePlan';
import { ProjectMemoryManager } from '../memory/projectMemory';

describe('ClarificationManager', () => {
  const manager = new ClarificationManager();

  const createMockPlan = (): EngineeringArchitecturePlan => ({
    schemaVersion: '1.0.0',
    planId: 'plan_bldc_clarify',
    intentId: 'intent_bldc',
    system: {
      name: 'BLDC Drive System',
      conceptId: 'concept_bldc_drive',
      description: 'Brushless DC Drive'
    },
    subsystems: [
      {
        id: 'sub_power',
        name: 'Power Stage',
        conceptId: 'concept_power_stage',
        functionalRoles: ['power']
      },
      {
        id: 'sub_control',
        name: 'Control Stage',
        conceptId: 'concept_controller',
        functionalRoles: ['control']
      }
    ],
    components: [
      {
        id: 'comp_inv',
        name: 'Inverter',
        conceptId: 'concept_inverter',
        subsystemId: 'sub_power',
        role: 'actuator',
        designParameters: {}
      }
    ],
    connections: [],
    designDecisions: [
      {
        id: 'dec_commutation',
        title: 'Motor Commutation Strategy',
        selectedAlternative: 'foc',
        consideredAlternatives: ['foc', 'six_step'],
        rationale: 'FOC provides smoother torque; six-step provides lower complexity.',
        affectedComponents: ['comp_inv']
      }
    ],
    informationRequirements: [
      {
        id: 'slot_secondary_tuning',
        slotName: 'current_filter_tau',
        classification: 'REQUIRED',
        reason: 'Current filter time constant',
        affectedDecisions: [],
        candidateValues: [],
        resolutionState: 'unresolved',
        valueSchema: 'number'
      },
      {
        id: 'slot_commutation',
        slotName: 'commutation_strategy',
        classification: 'REQUIRED',
        reason: 'Primary motor commutation strategy',
        affectedDecisions: ['dec_commutation', 'dec_inverter_gate_drive'],
        candidateValues: ['foc', 'six_step'],
        resolutionState: 'unresolved',
        valueSchema: 'string'
      }
    ],
    assumptions: [],
    knowledgeEvidence: [],
    capabilityAssessment: {
      feasible: true,
      coveredConceptIds: [],
      unsupportedConceptIds: []
    },
    rationale: 'BLDC drive architecture'
  });

  it('ranks unresolved REQUIRED slots by architecture impact (number of affected decisions)', () => {
    const plan = createMockPlan();
    const decision = manager.next(plan);

    expect(decision.type).toBe('clarification_needed');
    if (decision.type === 'clarification_needed') {
      // slot_commutation affects 2 decisions, while current_filter_tau affects 0 decisions
      expect(decision.slot.slotName).toBe('commutation_strategy');
      expect(decision.alternatives).toBeDefined();
      expect(decision.alternatives?.length).toBe(2);
      expect(decision.alternatives?.[0].rationale).toContain('FOC');
    }
  });

  it('parses valid answers, marks slot resolved, and never repeats resolved questions', () => {
    const plan = createMockPlan();
    const projectMemory = new ProjectMemoryManager();

    const answer: SlotAnswer = {
      slotId: 'slot_commutation',
      value: 'six_step',
      projectId: 'proj_bldc_test'
    };

    const result = manager.applyAnswer(plan, answer, projectMemory);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsedValue).toBe('six_step');

      // Now query next question: slot_commutation should NOT be repeated!
      const nextDecision = manager.next(result.updatedPlan);
      expect(nextDecision.type).toBe('clarification_needed');
      if (nextDecision.type === 'clarification_needed') {
        expect(nextDecision.slot.slotName).toBe('current_filter_tau');
      }

      // Check project memory recorded decision
      const activeDecisions = projectMemory.listActiveDecisions('proj_bldc_test');
      expect(activeDecisions.some(d => d.decisionKey === 'commutation_strategy')).toBe(true);
    }
  });

  it('rejects invalid answers with a precise correction prompt', () => {
    const plan = createMockPlan();

    // Invalid candidate value for commutation_strategy
    const badCandidateAnswer: SlotAnswer = {
      slotId: 'slot_commutation',
      value: 'steam_engine'
    };

    const badResult = manager.applyAnswer(plan, badCandidateAnswer);
    expect(badResult.success).toBe(false);
    if (!badResult.success) {
      expect(badResult.error).toContain('Invalid value');
      expect(badResult.correctionPrompt).toContain('foc');
      expect(badResult.correctionPrompt).toContain('six_step');
    }

    // Invalid number type for current_filter_tau
    const badNumberAnswer: SlotAnswer = {
      slotId: 'slot_secondary_tuning',
      value: 'not-a-number'
    };

    const badNumberResult = manager.applyAnswer(plan, badNumberAnswer);
    expect(badNumberResult.success).toBe(false);
    if (!badNumberResult.success) {
      expect(badNumberResult.error).toContain('Expected number');
    }
  });

  it('returns all_resolved when all REQUIRED slots are resolved', () => {
    const plan = createMockPlan();
    // Mark both resolved
    plan.informationRequirements[0].resolutionState = 'resolved';
    plan.informationRequirements[0].resolvedValue = 0.001;
    plan.informationRequirements[1].resolutionState = 'resolved';
    plan.informationRequirements[1].resolvedValue = 'foc';

    const decision = manager.next(plan);
    expect(decision.type).toBe('all_resolved');
  });
});
