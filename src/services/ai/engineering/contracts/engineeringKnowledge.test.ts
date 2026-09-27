import { describe, it, expect } from 'vitest';
import {
  EngineeringConceptSchema,
  EngineeringFactSchema,
  computeConceptHash,
  computeFactHash,
  EngineeringConcept,
  EngineeringFact
} from './engineeringKnowledge';

describe('engineeringKnowledge contracts', () => {
  describe('EngineeringConceptSchema - Cross-domain valid examples', () => {
    it('validates an arithmetic concept (adder)', () => {
      const conceptData = {
        schemaVersion: '1.0.0',
        id: 'concept.math.addition',
        canonicalName: 'Addition Operator',
        aliases: ['adder', 'sum', 'plus'],
        domain: 'arithmetic',
        description: 'Computes arithmetic sum of two or more real numeric inputs',
        functionalRoles: ['compute', 'summation'],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: ['concept.math.accumulate'],
        inputs: [
          { name: 'u1', type: 'real', domain: 'signal', description: 'Operand 1' },
          { name: 'u2', type: 'real', domain: 'signal', description: 'Operand 2' }
        ],
        outputs: [
          { name: 'y', type: 'real', domain: 'signal', description: 'Sum output' }
        ],
        designParameters: [],
        constraints: ['u1 and u2 must have compatible units'],
        assumptions: ['Real number addition without overflow in floating point'],
        applicableMethods: ['algebraic'],
        validationRuleIds: ['rule.math.dimension_check'],
        referenceIds: ['ref.iso.math_ops'],
        lifecycle: 'verified' as const,
        confidence: 1.0,
        provenanceIds: ['source.iso.standards'],
        contentHash: ''
      };
      conceptData.contentHash = computeConceptHash(conceptData);

      const parsed = EngineeringConceptSchema.parse(conceptData);
      expect(parsed.id).toBe('concept.math.addition');
      expect(parsed.domain).toBe('arithmetic');
      expect(parsed.contentHash).toHaveLength(64);
    });

    it('validates a motor control concept (bldc motor with hall feedback)', () => {
      const conceptData = {
        schemaVersion: '1.0.0',
        id: 'concept.electromechanical.bldc_motor',
        canonicalName: 'Brushless DC Permanent Magnet Motor',
        aliases: ['BLDC', 'permanent magnet brushless motor'],
        domain: 'electromechanical',
        description: 'Synchronous electric motor powered by DC source via an inverter',
        functionalRoles: ['plant', 'actuator', 'torque_source'],
        requiredConcepts: ['concept.electrical.three_phase_inverter'],
        optionalConcepts: ['concept.sensing.hall_sensors', 'concept.sensing.encoder'],
        alternatives: ['concept.electromechanical.pmsm', 'concept.electromechanical.dc_motor'],
        inputs: [
          { name: 'v_a', type: 'voltage', domain: 'electrical', unit: 'V' },
          { name: 'v_b', type: 'voltage', domain: 'electrical', unit: 'V' },
          { name: 'v_c', type: 'voltage', domain: 'electrical', unit: 'V' },
          { name: 'tau_load', type: 'torque', domain: 'mechanical_rotational', unit: 'N*m' }
        ],
        outputs: [
          { name: 'omega_m', type: 'angular_velocity', domain: 'mechanical_rotational', unit: 'rad/s' },
          { name: 'theta_m', type: 'angular_position', domain: 'mechanical_rotational', unit: 'rad' },
          { name: 'i_a', type: 'current', domain: 'electrical', unit: 'A' }
        ],
        designParameters: [
          { name: 'poles', type: 'integer', description: 'Pole count', defaultValue: 8, required: true },
          { name: 'kv', type: 'real', unit: 'rpm/V', description: 'Velocity constant', required: true }
        ],
        constraints: ['Max winding temperature 150 degC'],
        assumptions: ['Balanced 3-phase windings', 'Negligible magnetic saturation'],
        applicableMethods: ['foc', 'six_step_commutation'],
        validationRuleIds: ['rule.em.back_emf_consistency'],
        referenceIds: ['ref.ieee.motor_standards'],
        lifecycle: 'verified' as const,
        confidence: 0.98,
        provenanceIds: ['source.textbook.electric_drives'],
        contentHash: ''
      };
      conceptData.contentHash = computeConceptHash(conceptData);

      const parsed = EngineeringConceptSchema.parse(conceptData);
      expect(parsed.id).toBe('concept.electromechanical.bldc_motor');
      expect(parsed.inputs).toHaveLength(4);
    });

    it('validates thermal and hydraulic concepts', () => {
      const thermalConcept = {
        schemaVersion: '1.0.0',
        id: 'concept.thermal.heat_exchanger',
        canonicalName: 'Liquid-to-Air Heat Exchanger',
        aliases: ['radiator', 'cooler'],
        domain: 'thermal',
        description: 'Transfers thermal energy from liquid coolant to ambient airflow',
        functionalRoles: ['thermal_sink', 'energy_transfer'],
        requiredConcepts: [],
        optionalConcepts: ['concept.thermal.coolant_pump'],
        alternatives: [],
        inputs: [{ name: 'coolant_in', domain: 'thermal_fluid', unit: 'degC' }],
        outputs: [{ name: 'coolant_out', domain: 'thermal_fluid', unit: 'degC' }],
        designParameters: [{ name: 'effectiveness', type: 'real', defaultValue: 0.85 }],
        constraints: ['Effectiveness between 0 and 1'],
        assumptions: ['Counterflow geometry'],
        applicableMethods: ['lmtd', 'ntu'],
        validationRuleIds: [],
        referenceIds: ['ref.incropera.heat_transfer'],
        lifecycle: 'reviewed' as const,
        confidence: 0.95,
        provenanceIds: ['source.textbook.incropera'],
        contentHash: ''
      };
      thermalConcept.contentHash = computeConceptHash(thermalConcept);
      expect(EngineeringConceptSchema.safeParse(thermalConcept).success).toBe(true);

      const hydraulicConcept = {
        schemaVersion: '1.0.0',
        id: 'concept.hydraulic.cylinder',
        canonicalName: 'Double-Acting Hydraulic Cylinder',
        aliases: ['hydraulic ram', 'linear hydraulic actuator'],
        domain: 'hydraulic',
        description: 'Converts fluid pressure into bidirectional linear mechanical force',
        functionalRoles: ['actuator', 'linear_motion'],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [
          { name: 'port_a', domain: 'hydraulic', unit: 'Pa' },
          { name: 'port_b', domain: 'hydraulic', unit: 'Pa' }
        ],
        outputs: [
          { name: 'rod_position', domain: 'mechanical_translational', unit: 'm' },
          { name: 'rod_force', domain: 'mechanical_translational', unit: 'N' }
        ],
        designParameters: [
          { name: 'bore_diameter', type: 'real', unit: 'm', required: true }
        ],
        constraints: ['Operating pressure <= 210 bar'],
        assumptions: ['Incompressible fluid'],
        applicableMethods: ['pascal_law'],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'quarantined' as const,
        confidence: 0.8,
        provenanceIds: ['source.manual.hydraulic_guide'],
        contentHash: ''
      };
      hydraulicConcept.contentHash = computeConceptHash(hydraulicConcept);
      expect(EngineeringConceptSchema.safeParse(hydraulicConcept).success).toBe(true);
    });

    it('validates state machine and signal processing concepts', () => {
      const stateMachine = {
        schemaVersion: '1.0.0',
        id: 'concept.logic.finite_state_machine',
        canonicalName: 'Finite State Machine',
        aliases: ['FSM', 'state transition controller'],
        domain: 'control_logic',
        description: 'Discrete event controller with finite discrete states and transition logic',
        functionalRoles: ['supervisor', 'sequencer'],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: ['concept.logic.petri_net'],
        inputs: [{ name: 'events', domain: 'signal', type: 'discrete' }],
        outputs: [{ name: 'active_state', domain: 'signal', type: 'enum' }],
        designParameters: [],
        constraints: ['Deterministic transitions without deadlock'],
        assumptions: ['Synchronous clocking'],
        applicableMethods: ['moore', 'mealy'],
        validationRuleIds: ['rule.logic.deadlock_free'],
        referenceIds: [],
        lifecycle: 'verified' as const,
        confidence: 0.99,
        provenanceIds: ['source.textbook.automata'],
        contentHash: ''
      };
      stateMachine.contentHash = computeConceptHash(stateMachine);
      expect(EngineeringConceptSchema.safeParse(stateMachine).success).toBe(true);

      const filter = {
        schemaVersion: '1.0.0',
        id: 'concept.dsp.kalman_filter',
        canonicalName: 'Discrete Kalman Filter',
        aliases: ['linear quadratic estimator', 'LQE'],
        domain: 'signal_processing',
        description: 'Optimal recursive data processing algorithm estimating system state',
        functionalRoles: ['estimator', 'observer'],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: ['concept.dsp.complementary_filter'],
        inputs: [
          { name: 'measurement', domain: 'signal' },
          { name: 'control_input', domain: 'signal' }
        ],
        outputs: [
          { name: 'estimated_state', domain: 'signal' },
          { name: 'covariance', domain: 'signal' }
        ],
        designParameters: [],
        constraints: ['Covariance matrix must remain positive semi-definite'],
        assumptions: ['Zero-mean Gaussian noise'],
        applicableMethods: ['kalman_update'],
        validationRuleIds: [],
        referenceIds: ['ref.kalman.1960'],
        lifecycle: 'verified' as const,
        confidence: 0.95,
        provenanceIds: ['source.paper.kalman_1960'],
        contentHash: ''
      };
      filter.contentHash = computeConceptHash(filter);
      expect(EngineeringConceptSchema.safeParse(filter).success).toBe(true);
    });
  });

  describe('EngineeringConceptSchema - Negative validation', () => {
    it('fails on unknown extra properties due to strict mode', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'concept.test',
        canonicalName: 'Test',
        aliases: [],
        domain: 'math',
        description: 'Test',
        functionalRoles: [],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [],
        outputs: [],
        designParameters: [],
        constraints: [],
        assumptions: [],
        applicableMethods: [],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'verified',
        confidence: 0.9,
        provenanceIds: [],
        contentHash: 'a'.repeat(64),
        unknownForbiddenProperty: 'should_fail'
      };
      expect(() => EngineeringConceptSchema.parse(invalid)).toThrow();
    });

    it('fails on invalid confidence (negative or > 1)', () => {
      const base = {
        schemaVersion: '1.0.0',
        id: 'concept.test',
        canonicalName: 'Test',
        aliases: [],
        domain: 'math',
        description: 'Test',
        functionalRoles: [],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [],
        outputs: [],
        designParameters: [],
        constraints: [],
        assumptions: [],
        applicableMethods: [],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'verified' as const,
        confidence: 1.5, // invalid
        provenanceIds: [],
        contentHash: 'a'.repeat(64)
      };
      expect(() => EngineeringConceptSchema.parse(base)).toThrow();
      expect(() => EngineeringConceptSchema.parse({ ...base, confidence: -0.1 })).toThrow();
    });

    it('fails on invalid contentHash length', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'concept.test',
        canonicalName: 'Test',
        aliases: [],
        domain: 'math',
        description: 'Test',
        functionalRoles: [],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [],
        outputs: [],
        designParameters: [],
        constraints: [],
        assumptions: [],
        applicableMethods: [],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'verified' as const,
        confidence: 0.9,
        provenanceIds: [],
        contentHash: 'too_short'
      };
      expect(() => EngineeringConceptSchema.parse(invalid)).toThrow();
    });
  });

  describe('EngineeringFactSchema - Cross-domain and negative tests', () => {
    it('validates a physical fact with verified provenance', () => {
      const factData = {
        schemaVersion: '1.0.0',
        id: 'fact.copper.resistivity',
        subjectConceptId: 'concept.materials.copper',
        predicate: 'hasElectricalResistivityAt20C',
        object: {
          type: 'number' as const,
          value: 1.68e-8
        },
        conditions: ['temperature == 20 degC', 'purity >= 99.9%'],
        units: 'ohm*m',
        confidence: 0.99,
        verified: true,
        sourceId: 'source.handbook.crc_chem_phys',
        documentId: 'doc.crc.section_12',
        sectionLocator: 'Table 12-4, page 12-42',
        extractionMethod: 'human_verified' as const,
        review: {
          reviewerId: 'engineer.lead.bassem',
          reviewedAt: 1718000000000,
          status: 'approved' as const,
          notes: 'Standard CRC handbook value'
        },
        version: 1,
        validFrom: 1718000000000,
        supersedes: undefined,
        contentHash: ''
      };
      factData.contentHash = computeFactHash(factData);

      const parsed = EngineeringFactSchema.parse(factData);
      expect(parsed.id).toBe('fact.copper.resistivity');
      expect(parsed.verified).toBe(true);
      expect(parsed.contentHash).toHaveLength(64);
    });

    it('rejects fact with unknown fields or malformed confidence', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'fact.test',
        subjectConceptId: 'concept.test',
        predicate: 'testPredicate',
        object: { type: 'string', value: 'hello' },
        conditions: [],
        confidence: 2.0, // invalid
        verified: false,
        sourceId: 'source.1',
        documentId: 'doc.1',
        sectionLocator: 'sec 1',
        extractionMethod: 'rule',
        review: { status: 'pending' },
        version: 1,
        validFrom: 1000,
        contentHash: 'f'.repeat(64)
      };
      expect(() => EngineeringFactSchema.parse(invalid)).toThrow();
    });

    it('validates fact hash determinism', () => {
      const fact1 = {
        schemaVersion: '1.0.0',
        id: 'fact.1',
        subjectConceptId: 'concept.1',
        predicate: 'relation',
        object: { type: 'number' as const, value: 42 },
        conditions: [],
        confidence: 0.9,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: 'p.1',
        extractionMethod: 'human_verified' as const,
        review: { status: 'approved' as const },
        version: 1,
        validFrom: 1000,
        contentHash: ''
      };
      const hash1 = computeFactHash(fact1);
      const hash2 = computeFactHash({ ...fact1 });
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
