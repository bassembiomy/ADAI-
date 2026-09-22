import { describe, it, expect } from 'vitest';
import { InformationClassifier } from './informationClassifier';
import { validateArchitecturePlan } from './architecturePlanValidator';
import { EngineeringPlanner } from './engineeringPlanner';
import { EngineeringIntent } from '../contracts/semanticIntent';
import { RetrievedKnowledgeBundle } from '../retrieval/hybridRetriever';
import { ProjectMemorySnapshot } from '../contracts/memory';
import { EngineeringConcept } from '../contracts/engineeringKnowledge';

describe('InformationClassifier', () => {
  const classifier = new InformationClassifier();

  it('classifies missing parameter with default as DEFAULTABLE and records assumption', () => {
    const slot = classifier.classifySlot({
      slotName: 'supply_voltage',
      definition: {
        type: 'number',
        default: 24,
        unit: 'V',
        description: 'Nominal DC bus supply voltage',
        required: true
      },
      userProvidedValue: undefined,
      conceptId: 'concept_inverter',
      affectedDecisions: ['dec_inverter_topology']
    });

    expect(slot.classification).toBe('DEFAULTABLE');
    expect(slot.resolutionState).toBe('defaulted');
    expect(slot.resolvedValue).toBe(24);
    expect(slot.defaultProvenance).toBeDefined();

    const assumptions = classifier.generateAssumptions([slot]);
    expect(assumptions).toHaveLength(1);
    expect(assumptions[0].statement).toContain('supply_voltage');
    expect(assumptions[0].source).toBe('defaulted');
  });

  it('classifies essential parameter without default or user input as REQUIRED unresolved', () => {
    const slot = classifier.classifySlot({
      slotName: 'commutation_strategy',
      definition: {
        type: 'string',
        description: 'Motor commutation strategy (foc | six_step)',
        required: true
      },
      candidateValues: ['foc', 'six_step'],
      userProvidedValue: undefined,
      conceptId: 'concept_bldc_controller',
      affectedDecisions: ['dec_commutation_mode']
    });

    expect(slot.classification).toBe('REQUIRED');
    expect(slot.resolutionState).toBe('unresolved');
    expect(slot.resolvedValue).toBeUndefined();
    expect(slot.candidateValues).toEqual(['foc', 'six_step']);
  });

  it('classifies user-supplied value as resolved regardless of default', () => {
    const slot = classifier.classifySlot({
      slotName: 'target_speed',
      definition: {
        type: 'number',
        default: 1000,
        unit: 'rpm',
        required: true
      },
      userProvidedValue: 3000,
      conceptId: 'concept_speed_controller'
    });

    expect(slot.resolutionState).toBe('resolved');
    expect(slot.resolvedValue).toBe(3000);
  });

  it('classifies non-essential missing parameter without default as OPTIONAL', () => {
    const slot = classifier.classifySlot({
      slotName: 'thermal_monitoring_rate',
      definition: {
        type: 'number',
        required: false,
        description: 'Optional thermal monitoring sample rate'
      },
      userProvidedValue: undefined,
      conceptId: 'concept_bldc_drive'
    });

    expect(slot.classification).toBe('OPTIONAL');
    expect(slot.resolutionState).toBe('unresolved');
  });
});

describe('ArchitecturePlanValidator', () => {
  it('validates a valid architecture plan with zero errors', () => {
    const validPlan = {
      schemaVersion: '1.0.0' as const,
      planId: 'plan_add_1',
      intentId: 'intent_add_1',
      system: {
        name: 'Summation System',
        conceptId: 'concept_addition',
        description: 'Adds two signals'
      },
      subsystems: [
        {
          id: 'sub_math',
          name: 'Math Core',
          conceptId: 'concept_arithmetic_unit',
          functionalRoles: ['calculation']
        }
      ],
      components: [
        {
          id: 'comp_adder',
          name: 'Adder',
          conceptId: 'concept_addition',
          subsystemId: 'sub_math',
          role: 'adder',
          designParameters: {}
        }
      ],
      connections: [],
      designDecisions: [],
      informationRequirements: [],
      assumptions: [],
      knowledgeEvidence: [],
      capabilityAssessment: {
        feasible: true,
        coveredConceptIds: ['concept_addition'],
        unsupportedConceptIds: []
      },
      rationale: 'Simple direct summation'
    };

    const result = validateArchitecturePlan(validPlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an architecture plan where a catalog block ID leaked into conceptId', () => {
    const leakyPlan = {
      schemaVersion: '1.0.0' as const,
      planId: 'plan_leak_1',
      intentId: 'intent_1',
      system: {
        name: 'Inverter System',
        conceptId: 'concept_inverter',
        description: 'Power stage'
      },
      subsystems: [
        {
          id: 'sub_power',
          name: 'Power Subsystem',
          conceptId: 'concept_power_stage',
          functionalRoles: ['power']
        }
      ],
      components: [
        {
          id: 'comp_inv',
          name: 'Inverter Block',
          conceptId: 'xbridges_inverter_v1', // LEAKED CATALOG ID!
          subsystemId: 'sub_power',
          role: 'inverter',
          designParameters: {}
        }
      ],
      connections: [],
      designDecisions: [],
      informationRequirements: [],
      assumptions: [],
      knowledgeEvidence: [],
      capabilityAssessment: {
        feasible: true,
        coveredConceptIds: [],
        unsupportedConceptIds: []
      },
      rationale: 'Faulty plan with block ID'
    };

    const result = validateArchitecturePlan(leakyPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('illegally contains catalog block ID'))).toBe(true);
  });
});

describe('EngineeringPlanner', () => {
  const planner = new EngineeringPlanner();

  const mockAdditionConcept: EngineeringConcept = {
    schemaVersion: '1.0.0',
    id: 'concept_addition',
    canonicalName: 'Addition',
    aliases: ['sum', 'plus'],
    domain: 'arithmetic',
    description: 'Computes sum of two inputs',
    functionalRoles: ['calculation'],
    requiredConcepts: [],
    optionalConcepts: [],
    alternatives: [],
    inputs: [
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' }
    ],
    outputs: [
      { name: 'sum', type: 'number' }
    ],
    designParameters: [],
    constraints: [],
    assumptions: [],
    applicableMethods: ['algebraic'],
    validationRuleIds: [],
    referenceIds: [],
    lifecycle: 'verified',
    confidence: 1.0,
    provenanceIds: ['prov_math'],
    contentHash: 'hash_add'
  };

  it('plans simple arithmetic addition without selecting block IDs', async () => {
    const intent: EngineeringIntent = {
      schemaVersion: '1.0.0',
      id: 'intent_add',
      intent: 'create',
      objective: 'Add two numbers',
      domainCandidates: ['arithmetic'],
      systemConceptIds: ['concept_addition'],
      operations: [{ type: 'add', parameters: { a: 1, b: 2 } }],
      controlledVariables: [],
      actuators: [],
      plants: [],
      sensors: [],
      inputs: ['in1', 'in2'],
      outputs: ['sum'],
      constraints: [],
      requestedFidelity: 'symbolic',
      references: [],
      confidence: 0.95,
      unknownTerms: [],
      unresolvedReferences: [],
      evidence: []
    };

    const bundle: RetrievedKnowledgeBundle = {
      concepts: [
        {
          concept: mockAdditionConcept,
          score: 1.0,
          scoreBreakdown: {
            lexicalScore: 1.0,
            exactAliasBonus: 0,
            sourceWeightBonus: 0,
            graphBonus: 0
          },
          evidence: 'Math std'
        }
      ],
      facts: [],
      relationships: [],
      runtimeEligibleOnly: true
    };

    const memory: ProjectMemorySnapshot = {
      projectId: 'proj_arithmetic',
      projectName: 'Arithmetic Project',
      decisions: [],
      assumptions: [],
      resolvedSlots: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = await planner.plan(intent, bundle, memory);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.plan.system.conceptId).toBe('concept_addition');
      expect(result.plan.components.length).toBeGreaterThan(0);
      expect(result.plan.components.every(c => !c.conceptId.startsWith('xbridges_'))).toBe(true);
      expect(result.plan.capabilityAssessment.feasible).toBe(true);
    }
  });

  it('produces power/control/sensing/plant/load subsystems for BLDC and keeps FOC vs six-step as alternatives', async () => {
    const intent: EngineeringIntent = {
      schemaVersion: '1.0.0',
      id: 'intent_bldc',
      intent: 'create',
      objective: 'Design a BLDC motor speed control loop',
      domainCandidates: ['motor_control', 'electrical'],
      systemConceptIds: ['concept_bldc_drive'],
      operations: [{ type: 'speed_control' }],
      controlledVariables: ['rotor_speed'],
      actuators: ['concept_inverter'],
      plants: ['concept_bldc_motor'],
      sensors: ['concept_hall_sensor'],
      inputs: ['speed_setpoint'],
      outputs: ['measured_speed'],
      constraints: [],
      requestedFidelity: 'dynamic',
      references: [],
      confidence: 0.9,
      unknownTerms: [],
      unresolvedReferences: [],
      evidence: []
    };

    const bldcConcept: EngineeringConcept = {
      schemaVersion: '1.0.0',
      id: 'concept_bldc_drive',
      canonicalName: 'BLDC Motor Drive',
      aliases: ['brushless dc drive'],
      domain: 'motor_control',
      description: 'Permanent magnet brushless DC motor drive system',
      functionalRoles: ['system', 'motion_control'],
      requiredConcepts: [
        'concept_inverter',
        'concept_speed_controller',
        'concept_bldc_motor'
      ],
      optionalConcepts: ['concept_hall_sensor'],
      alternatives: [],
      inputs: [{ name: 'speed_setpoint', type: 'number', unit: 'rpm' }],
      outputs: [{ name: 'measured_speed', type: 'number', unit: 'rpm' }],
      designParameters: [
        {
          name: 'commutation_strategy',
          type: 'string',
          description: 'Commutation method: foc or six_step',
          required: true
        },
        {
          name: 'supply_voltage',
          type: 'number',
          defaultValue: 24,
          unit: 'V',
          description: 'DC bus voltage',
          required: true
        }
      ],
      constraints: ['supply_voltage > 0'],
      assumptions: ['Balanced 3-phase winding'],
      applicableMethods: ['foc', 'six_step'],
      validationRuleIds: [],
      referenceIds: [],
      lifecycle: 'verified',
      confidence: 1.0,
      provenanceIds: ['prov_bldc'],
      contentHash: 'hash_bldc'
    };

    const bundle: RetrievedKnowledgeBundle = {
      concepts: [
        {
          concept: bldcConcept,
          score: 1.0,
          scoreBreakdown: {
            lexicalScore: 1.0,
            exactAliasBonus: 0,
            sourceWeightBonus: 0,
            graphBonus: 0
          },
          evidence: 'Motor Control Handbook'
        }
      ],
      facts: [],
      relationships: [],
      runtimeEligibleOnly: true
    };

    const memory: ProjectMemorySnapshot = {
      projectId: 'proj_bldc',
      projectName: 'BLDC Project',
      decisions: [],
      assumptions: [],
      resolvedSlots: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = await planner.plan(intent, bundle, memory);
    // Notice: commutation_strategy is REQUIRED without default, so it triggers clarification_required!
    expect(result.status).toBe('clarification_required');
    if (result.status === 'clarification_required') {
      const plan = result.plan;
      // Functional subsystems should include power, control, sensing, plant/load
      const roles = plan.subsystems.flatMap(s => s.functionalRoles);
      expect(roles).toContain('power');
      expect(roles).toContain('control');
      expect(roles).toContain('plant');

      // Check design decisions: commutation mode should have FOC and six-step as alternatives
      const commutationDecision = plan.designDecisions.find(d => d.id.includes('commutation'));
      expect(commutationDecision).toBeDefined();
      expect(commutationDecision?.consideredAlternatives).toEqual(expect.arrayContaining(['foc', 'six_step']));

      // Check supply_voltage is defaulted and listed as assumption
      expect(plan.assumptions.some(a => a.statement.includes('supply_voltage'))).toBe(true);

      // Check unresolved requirement
      expect(result.unresolvedSlots.some(s => s.slotName === 'commutation_strategy')).toBe(true);
    }
  });
});
