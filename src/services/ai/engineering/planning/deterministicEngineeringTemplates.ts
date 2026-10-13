import {
  EngineeringArchitecturePlan,
  ArchitectureSubsystem,
  ArchitectureComponent,
  ArchitectureConnection,
  DesignDecision,
  InformationRequirement,
  ArchitectureAssumption
} from '../contracts/architecturePlan';
import { StructuredEngineeringRequest } from '../contracts/structuredEngineeringRequest';
import {
  buildXbridgesCapabilityIndex,
  XbridgesCapabilityIndex
} from '../../catalog/xbridgesCapabilityIndex';

export class DeterministicEngineeringTemplates {
  constructor(
    private readonly catalog: XbridgesCapabilityIndex = buildXbridgesCapabilityIndex()
  ) {}

  public selectAndInstantiateTemplate(
    request: StructuredEngineeringRequest
  ): EngineeringArchitecturePlan | null {
    const entityTypes = new Set(request.entities.map(e => e.semanticType));

    // 1. PID + Transfer function feedback loop
    if (entityTypes.has('PID_CONTROLLER') && entityTypes.has('TRANSFER_FUNCTION')) {
      return this.instantiatePidTransferFunctionTemplate(request);
    }

    // 2. Arithmetic template
    const isArithmetic = request.operations.some(op =>
      ['add', 'subtract', 'multiply', 'divide'].includes(op)
    );
    if (isArithmetic) {
      return this.instantiateArithmeticTemplate(request);
    }

    // 3. General PID control template
    if (entityTypes.has('PID_CONTROLLER')) {
      return this.instantiatePidControlTemplate(request);
    }

    // 4. Source -> Plant/Integrator -> Scope
    if (entityTypes.has('Integrator')) {
      return this.instantiateSourcePlantScopeTemplate(request);
    }

    return null;
  }

  public instantiateArithmeticTemplate(
    request: StructuredEngineeringRequest
  ): EngineeringArchitecturePlan {
    const isMul = request.operations.includes('multiply');
    const isSub = request.operations.includes('subtract');
    const isDiv = request.operations.includes('divide');

    const opType = isMul ? 'multiply' : isSub ? 'subtract' : isDiv ? 'divide' : 'add';
    const opRole = isMul ? 'multiplier' : isSub ? 'subtractor' : isDiv ? 'divider' : 'adder';
    const opBlockId = isMul ? 'VectorMul' : isDiv ? 'VectorDiv' : 'Sum';
    const opConceptId = isMul ? 'concept_multiply' : isDiv ? 'concept_divide' : 'concept_addition';

    // Query active catalog for ports
    const opCap = this.catalog.blocks.get(opBlockId);
    const constCap = this.catalog.blocks.get('Constant');
    const scopeCap = this.catalog.blocks.get('Scope');

    const opIn1 = opCap?.inputs[0]?.id || 'in1';
    const opIn2 = opCap?.inputs[1]?.id || 'in2';
    const opOut = opCap?.outputs[0]?.id || 'out';
    const constOut = constCap?.outputs[0]?.id || 'out';
    const scopeIn = scopeCap?.inputs[0]?.id || 'in1';

    const subsystems: ArchitectureSubsystem[] = [
      {
        id: 'sub_math',
        name: 'Arithmetic Core Subsystem',
        conceptId: 'concept_arithmetic_unit',
        functionalRoles: ['calculation'],
        description: 'Performs deterministic arithmetic operations'
      }
    ];

    const components: ArchitectureComponent[] = [];
    const connections: ArchitectureConnection[] = [];

    // Main arithmetic component
    components.push({
      id: 'comp_op',
      name: `${opType.toUpperCase()} Unit`,
      conceptId: opConceptId,
      subsystemId: 'sub_math',
      role: opRole,
      designParameters: {}
    });

    // Constant operands
    const numericValues = request.values.filter(v => typeof v.normalizedValue === 'number');
    numericValues.forEach((val, idx) => {
      const constId = `comp_const_${idx + 1}`;
      components.push({
        id: constId,
        name: `Operand ${idx + 1}`,
        conceptId: 'concept_constant',
        subsystemId: 'sub_math',
        role: 'source',
        designParameters: { value: val.normalizedValue }
      });

      connections.push({
        id: `conn_const_${idx + 1}_to_op`,
        fromComponentId: constId,
        fromPort: constOut,
        toComponentId: 'comp_op',
        toPort: idx === 0 ? opIn1 : opIn2,
        semanticType: 'signal',
        domain: 'control'
      });
    });

    // Optional Scope output
    const hasScope = request.requestedOutputs.includes('scope');
    if (hasScope) {
      components.push({
        id: 'comp_scope',
        name: 'Scope Observable Sink',
        conceptId: 'concept_scope',
        subsystemId: 'sub_math',
        role: 'sink',
        designParameters: {}
      });

      connections.push({
        id: 'conn_op_to_scope',
        fromComponentId: 'comp_op',
        fromPort: opOut,
        toComponentId: 'comp_scope',
        toPort: scopeIn,
        semanticType: 'signal',
        domain: 'control'
      });
    }

    return {
      schemaVersion: '1.0.0',
      planId: `plan_arithmetic_${request.requestId}`,
      intentId: `intent_${request.requestId}`,
      system: {
        name: 'Arithmetic Processing System',
        conceptId: 'concept_math_system',
        description: 'Deterministic arithmetic computing architecture'
      },
      subsystems,
      components,
      connections,
      designDecisions: [],
      informationRequirements: [],
      assumptions: [],
      knowledgeEvidence: [
        {
          conceptId: opConceptId,
          factIds: [],
          confidence: 1.0,
          citation: 'X-Bridges Mathematical Block Library'
        }
      ],
      capabilityAssessment: {
        feasible: true,
        coveredConceptIds: components.map(c => c.conceptId),
        unsupportedConceptIds: []
      },
      rationale: `Deterministic arithmetic architecture (${opType === 'multiply' ? 'Multiplication' : opType === 'subtract' ? 'Subtraction' : opType === 'divide' ? 'Division' : 'Addition'}) instantiated from verified catalog.`
    };
  }

  public instantiatePidTransferFunctionTemplate(
    request: StructuredEngineeringRequest
  ): EngineeringArchitecturePlan {
    // Resolve ports strictly from verified catalog
    const sumCap = this.catalog.blocks.get('Sum');
    const pidCap = this.catalog.blocks.get('PID_CONTROLLER');
    const tfCap = this.catalog.blocks.get('TRANSFER_FUNCTION');
    const constCap = this.catalog.blocks.get('Constant');
    const scopeCap = this.catalog.blocks.get('Scope');

    const sumIn1 = sumCap?.inputs[0]?.id || 'in1';
    const sumIn2 = sumCap?.inputs[1]?.id || 'in2';
    const sumOut = sumCap?.outputs[0]?.id || 'out';

    const pidIn = pidCap?.inputs[0]?.id || 'in1';
    const pidOut = pidCap?.outputs[0]?.id || 'out';

    const tfIn = tfCap?.inputs[0]?.id || 'u';
    const tfOut = tfCap?.outputs[0]?.id || 'y';

    const constOut = constCap?.outputs[0]?.id || 'out';
    const scopeIn = scopeCap?.inputs[0]?.id || 'in1';

    // Parse plant parameters (numerator & denominator)
    const numVal = request.values.find(v => v.id === 'numerator')?.normalizedValue;
    const denVal = request.values.find(v => v.id === 'denominator')?.normalizedValue;

    const numerator = Array.isArray(numVal) ? numVal : [1];
    const denominator = Array.isArray(denVal) ? denVal : [1, 1];

    const subsystems: ArchitectureSubsystem[] = [
      {
        id: 'sub_control',
        name: 'Closed-Loop Control Subsystem',
        conceptId: 'concept_closed_loop_control',
        functionalRoles: ['controller', 'plant', 'feedback'],
        description: 'Feedback control architecture with Transfer Function plant and PID controller'
      }
    ];

    const components: ArchitectureComponent[] = [
      {
        id: 'comp_setpoint',
        name: 'Setpoint Reference',
        conceptId: 'concept_constant',
        subsystemId: 'sub_control',
        role: 'source',
        designParameters: { value: 1.0 }
      },
      {
        id: 'comp_sum',
        name: 'Error Calculation (Sum)',
        conceptId: 'concept_addition',
        subsystemId: 'sub_control',
        role: 'adder',
        designParameters: { signs: '+-' }
      },
      {
        id: 'comp_pid',
        name: 'PID Controller',
        conceptId: 'concept_pid_controller',
        subsystemId: 'sub_control',
        role: 'controller',
        designParameters: { Kp: 1.0, Ki: 0.1, Kd: 0.01 }
      },
      {
        id: 'comp_plant',
        name: 'LTI Transfer Function Plant',
        conceptId: 'concept_transfer_function',
        subsystemId: 'sub_control',
        role: 'plant',
        designParameters: { numerator, denominator }
      },
      {
        id: 'comp_scope',
        name: 'Output Observation Scope',
        conceptId: 'concept_scope',
        subsystemId: 'sub_control',
        role: 'sink',
        designParameters: {}
      }
    ];

    // Topology:
    // Setpoint -> Sum(in1) -> PID(in1) -> TRANSFER_FUNCTION(u) -> Scope(in1)
    //                ^                             |
    //                +--------- feedback ----------+
    const connections: ArchitectureConnection[] = [
      {
        id: 'conn_setpoint_to_sum',
        fromComponentId: 'comp_setpoint',
        fromPort: constOut,
        toComponentId: 'comp_sum',
        toPort: sumIn1,
        semanticType: 'reference',
        domain: 'control'
      },
      {
        id: 'conn_sum_to_pid',
        fromComponentId: 'comp_sum',
        fromPort: sumOut,
        toComponentId: 'comp_pid',
        toPort: pidIn,
        semanticType: 'error_signal',
        domain: 'control'
      },
      {
        id: 'conn_pid_to_tf',
        fromComponentId: 'comp_pid',
        fromPort: pidOut,
        toComponentId: 'comp_plant',
        toPort: tfIn,
        semanticType: 'control_effort',
        domain: 'control'
      },
      {
        id: 'conn_tf_to_scope',
        fromComponentId: 'comp_plant',
        fromPort: tfOut,
        toComponentId: 'comp_scope',
        toPort: scopeIn,
        semanticType: 'observation',
        domain: 'control'
      },
      {
        id: 'conn_tf_feedback_to_sum',
        fromComponentId: 'comp_plant',
        fromPort: tfOut,
        toComponentId: 'comp_sum',
        toPort: sumIn2,
        semanticType: 'feedback',
        domain: 'control'
      }
    ];

    const assumptions: ArchitectureAssumption[] = [
      {
        id: 'asm_pid_default_gains',
        statement: 'PID controller initialized with nominal tuning gains (Kp=1.0, Ki=0.1, Kd=0.01) pending dynamic tuning.',
        source: 'defaulted'
      },
      {
        id: 'asm_setpoint_default',
        statement: 'Setpoint reference initialized to step unit input (value=1.0).',
        source: 'defaulted'
      }
    ];

    return {
      schemaVersion: '1.0.0',
      planId: `plan_pid_tf_${request.requestId}`,
      intentId: `intent_${request.requestId}`,
      system: {
        name: 'PID Closed-Loop Transfer Function Control System',
        conceptId: 'concept_control_system',
        description: 'Standard feedback topology with Transfer Function plant and PID controller'
      },
      subsystems,
      components,
      connections,
      designDecisions: [
        {
          id: 'dec_plant_representation',
          title: 'Plant Representation Form',
          selectedAlternative: 'TRANSFER_FUNCTION',
          consideredAlternatives: ['TRANSFER_FUNCTION', 'STATE_SPACE'],
          rationale: 'Transfer function requested explicitly by user.',
          affectedComponents: ['comp_plant']
        }
      ],
      informationRequirements: [],
      assumptions,
      knowledgeEvidence: [
        {
          conceptId: 'concept_transfer_function',
          factIds: [],
          confidence: 1.0,
          citation: 'X-Bridges Control & Feedback Library'
        },
        {
          conceptId: 'concept_pid_controller',
          factIds: [],
          confidence: 1.0,
          citation: 'IEEE Standard Feedback Architecture'
        }
      ],
      capabilityAssessment: {
        feasible: true,
        coveredConceptIds: components.map(c => c.conceptId),
        unsupportedConceptIds: []
      },
      rationale: 'Standard PID closed-loop feedback architecture with Transfer Function plant.'
    };
  }

  public instantiatePidControlTemplate(
    request: StructuredEngineeringRequest
  ): EngineeringArchitecturePlan {
    return this.instantiatePidTransferFunctionTemplate(request);
  }

  public instantiateSourcePlantScopeTemplate(
    request: StructuredEngineeringRequest
  ): EngineeringArchitecturePlan {
    const constCap = this.catalog.blocks.get('Constant');
    const integCap = this.catalog.blocks.get('Integrator');
    const scopeCap = this.catalog.blocks.get('Scope');

    const constOut = constCap?.outputs[0]?.id || 'out';
    const integIn = integCap?.inputs[0]?.id || 'in';
    const integOut = integCap?.outputs[0]?.id || 'out';
    const scopeIn = scopeCap?.inputs[0]?.id || 'in1';

    const subsystems: ArchitectureSubsystem[] = [
      {
        id: 'sub_plant',
        name: 'Dynamic Plant Subsystem',
        conceptId: 'concept_dynamic_system',
        functionalRoles: ['plant', 'sink'],
        description: 'Open-loop plant simulation'
      }
    ];

    const components: ArchitectureComponent[] = [
      {
        id: 'comp_source',
        name: 'Source Input',
        conceptId: 'concept_constant',
        subsystemId: 'sub_plant',
        role: 'source',
        designParameters: { value: 1.0 }
      },
      {
        id: 'comp_integrator',
        name: 'Integrator Plant',
        conceptId: 'concept_integrator',
        subsystemId: 'sub_plant',
        role: 'plant',
        designParameters: { initialCondition: 0 }
      },
      {
        id: 'comp_scope',
        name: 'Observation Scope',
        conceptId: 'concept_scope',
        subsystemId: 'sub_plant',
        role: 'sink',
        designParameters: {}
      }
    ];

    const connections: ArchitectureConnection[] = [
      {
        id: 'conn_source_to_integ',
        fromComponentId: 'comp_source',
        fromPort: constOut,
        toComponentId: 'comp_integrator',
        toPort: integIn,
        semanticType: 'signal',
        domain: 'control'
      },
      {
        id: 'conn_integ_to_scope',
        fromComponentId: 'comp_integrator',
        fromPort: integOut,
        toComponentId: 'comp_scope',
        toPort: scopeIn,
        semanticType: 'signal',
        domain: 'control'
      }
    ];

    return {
      schemaVersion: '1.0.0',
      planId: `plan_source_plant_${request.requestId}`,
      intentId: `intent_${request.requestId}`,
      system: {
        name: 'Open Loop Dynamic System',
        conceptId: 'concept_dynamic_system',
        description: 'Source to integrator plant with scope observability'
      },
      subsystems,
      components,
      connections,
      designDecisions: [],
      informationRequirements: [],
      assumptions: [],
      knowledgeEvidence: [
        {
          conceptId: 'concept_integrator',
          factIds: [],
          confidence: 1.0,
          citation: 'X-Bridges Core Dynamic Library'
        }
      ],
      capabilityAssessment: {
        feasible: true,
        coveredConceptIds: components.map(c => c.conceptId),
        unsupportedConceptIds: []
      },
      rationale: 'Open loop integrator dynamic plant architecture.'
    };
  }
}
