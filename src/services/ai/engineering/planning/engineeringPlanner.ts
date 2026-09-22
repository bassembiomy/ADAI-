import {
  EngineeringArchitecturePlan,
  ArchitectureSubsystem,
  ArchitectureComponent,
  ArchitectureConnection,
  DesignDecision,
  InformationRequirement,
  KnowledgeEvidence
} from '../contracts/architecturePlan';
import { EngineeringIntent } from '../contracts/semanticIntent';
import { RetrievedKnowledgeBundle } from '../retrieval/hybridRetriever';
import { ProjectMemorySnapshot } from '../contracts/memory';
import { InformationClassifier } from './informationClassifier';
import { validateArchitecturePlan } from './architecturePlanValidator';

export type ArchitecturePlanningResult =
  | {
      status: 'ok';
      plan: EngineeringArchitecturePlan;
    }
  | {
      status: 'clarification_required';
      plan: EngineeringArchitecturePlan;
      unresolvedSlots: InformationRequirement[];
    }
  | {
      status: 'capability_gap';
      unsupportedConcepts: string[];
      notes: string;
    }
  | {
      status: 'invalid';
      errors: string[];
    };

export class EngineeringPlanner {
  private classifier = new InformationClassifier();

  public async plan(
    intent: EngineeringIntent,
    knowledge: RetrievedKnowledgeBundle,
    memory: ProjectMemorySnapshot
  ): Promise<ArchitecturePlanningResult> {
    const conceptsList = (knowledge as any).concepts || (knowledge as any).rankedConcepts || [];

    // 1. Identify primary system concept
    const primaryConcept = conceptsList[0]?.concept;
    if (!primaryConcept) {
      return {
        status: 'capability_gap',
        unsupportedConcepts: intent.systemConceptIds,
        notes: 'No relevant engineering concepts retrieved for intent.'
      };
    }

    const systemName = primaryConcept.canonicalName;
    const planId = `plan_${intent.id}_${Date.now()}`;

    // 2. Expand subsystems & components based on concept domain and functional roles
    const subsystems: ArchitectureSubsystem[] = [];
    const components: ArchitectureComponent[] = [];
    const connections: ArchitectureConnection[] = [];
    const designDecisions: DesignDecision[] = [];
    const informationRequirements: InformationRequirement[] = [];

    if (primaryConcept.domain === 'arithmetic') {
      const subMath: ArchitectureSubsystem = {
        id: 'sub_math',
        name: 'Math Core Subsystem',
        conceptId: 'concept_arithmetic_unit',
        functionalRoles: ['calculation'],
        description: 'Performs core arithmetic operations'
      };
      subsystems.push(subMath);

      components.push({
        id: 'comp_adder',
        name: primaryConcept.canonicalName,
        conceptId: primaryConcept.id,
        subsystemId: subMath.id,
        role: 'adder',
        designParameters: {}
      });
    } else if (
      primaryConcept.domain === 'motor_control' ||
      primaryConcept.id.includes('bldc') ||
      intent.operations.includes('speed_control')
    ) {
      // Motor Control domain: power, control, sensing, plant
      const subPower: ArchitectureSubsystem = {
        id: 'sub_power',
        name: 'Power Stage Subsystem',
        conceptId: 'concept_power_stage',
        functionalRoles: ['power'],
        description: 'Inverter and DC bus power distribution'
      };
      const subControl: ArchitectureSubsystem = {
        id: 'sub_control',
        name: 'Control Subsystem',
        conceptId: 'concept_controller',
        functionalRoles: ['control'],
        description: 'Speed and current regulation logic'
      };
      const subSensing: ArchitectureSubsystem = {
        id: 'sub_sensing',
        name: 'Sensing Subsystem',
        conceptId: 'concept_sensor_suite',
        functionalRoles: ['sensing'],
        description: 'Rotor position, current, and speed measurement'
      };
      const subPlant: ArchitectureSubsystem = {
        id: 'sub_plant',
        name: 'Plant Subsystem',
        conceptId: 'concept_motor_plant',
        functionalRoles: ['plant'],
        description: 'BLDC motor and mechanical load dynamics'
      };

      subsystems.push(subPower, subControl, subSensing, subPlant);

      const compInverter: ArchitectureComponent = {
        id: 'comp_inverter',
        name: 'Three Phase Inverter',
        conceptId: 'concept_inverter',
        subsystemId: subPower.id,
        role: 'actuator',
        designParameters: {}
      };
      const compController: ArchitectureComponent = {
        id: 'comp_controller',
        name: 'Speed Controller',
        conceptId: 'concept_speed_controller',
        subsystemId: subControl.id,
        role: 'controller',
        designParameters: {}
      };
      const compSensor: ArchitectureComponent = {
        id: 'comp_sensor',
        name: 'Position Sensor',
        conceptId: intent.sensors[0] || 'concept_hall_sensor',
        subsystemId: subSensing.id,
        role: 'sensor',
        designParameters: {}
      };
      const compMotor: ArchitectureComponent = {
        id: 'comp_motor',
        name: 'BLDC Motor',
        conceptId: intent.plants[0] || 'concept_bldc_motor',
        subsystemId: subPlant.id,
        role: 'plant',
        designParameters: {}
      };

      components.push(compInverter, compController, compSensor, compMotor);

      // Design decision: commutation strategy (FOC vs Six-Step)
      const commutationSlot = memory.resolvedSlots['commutation_strategy'];
      designDecisions.push({
        id: 'dec_commutation_strategy',
        title: 'Motor Commutation Strategy',
        selectedAlternative: (commutationSlot as string) || 'foc',
        consideredAlternatives: ['foc', 'six_step'],
        rationale: 'FOC delivers lower torque ripple and higher efficiency; six-step provides lower computational complexity.',
        affectedComponents: [compController.id, compInverter.id]
      });
    } else {
      // General fallback concept decomposition
      const subGeneral: ArchitectureSubsystem = {
        id: 'sub_core',
        name: `${primaryConcept.canonicalName} Core Subsystem`,
        conceptId: primaryConcept.id,
        functionalRoles: primaryConcept.functionalRoles.length > 0 ? primaryConcept.functionalRoles : ['general'],
        description: primaryConcept.description
      };
      subsystems.push(subGeneral);

      components.push({
        id: `comp_${primaryConcept.id}`,
        name: primaryConcept.canonicalName,
        conceptId: primaryConcept.id,
        subsystemId: subGeneral.id,
        role: primaryConcept.functionalRoles[0] || 'core',
        designParameters: {}
      });
    }

    // 3. Information Classification for all active concept parameters
    for (const ranked of conceptsList) {
      const c = ranked.concept;
      const paramsList = Array.isArray(c.designParameters)
        ? c.designParameters
        : Object.entries(c.designParameters || {}).map(([name, def]: any) => ({ name, ...def }));

      for (const p of paramsList) {
        const paramName = p.name;
        const userProvided =
          memory.resolvedSlots[paramName] ??
          intent.inputs.find(i => i.name === paramName)?.type;

        const slot = this.classifier.classifySlot({
          slotName: paramName,
          definition: {
            type: p.type || 'string',
            default: p.defaultValue ?? (p as any).default,
            unit: p.unit,
            description: p.description,
            required: p.required
          },
          userProvidedValue: userProvided,
          conceptId: c.id,
          candidateValues: paramName.includes('commutation') ? ['foc', 'six_step'] : undefined,
          affectedDecisions: designDecisions.map(d => d.id)
        });

        informationRequirements.push(slot);
      }
    }

    // 4. Generate assumptions for defaulted/inferred slots
    const assumptions = this.classifier.generateAssumptions(informationRequirements);

    // 5. Build Knowledge Evidence citations
    const knowledgeEvidence: KnowledgeEvidence[] = conceptsList.map((rc: any) => ({
      conceptId: rc.concept.id,
      factIds: rc.evidenceFactIds || [],
      confidence: rc.concept.confidence,
      citation: rc.citations?.[0] || rc.evidence || 'Verified engineering knowledge base'
    }));

    // 6. Capability Assessment
    const plan: EngineeringArchitecturePlan = {
      schemaVersion: '1.0.0',
      planId,
      intentId: intent.id,
      system: {
        name: systemName,
        conceptId: primaryConcept.id,
        description: primaryConcept.description
      },
      subsystems,
      components,
      connections,
      designDecisions,
      informationRequirements,
      assumptions,
      knowledgeEvidence,
      capabilityAssessment: {
        feasible: true,
        coveredConceptIds: [primaryConcept.id, ...components.map(c => c.conceptId)],
        unsupportedConceptIds: []
      },
      rationale: `Architecture derived from concept '${primaryConcept.canonicalName}' with verified engineering evidence.`
    };

    // 7. Validate plan
    const validation = validateArchitecturePlan(plan);
    if (!validation.valid) {
      return {
        status: 'invalid',
        errors: validation.errors
      };
    }

    // 8. Check for unresolved REQUIRED slots
    const unresolvedRequired = informationRequirements.filter(
      r => r.classification === 'REQUIRED' && r.resolutionState === 'unresolved'
    );

    if (unresolvedRequired.length > 0) {
      return {
        status: 'clarification_required',
        plan,
        unresolvedSlots: unresolvedRequired
      };
    }

    return {
      status: 'ok',
      plan
    };
  }
}
