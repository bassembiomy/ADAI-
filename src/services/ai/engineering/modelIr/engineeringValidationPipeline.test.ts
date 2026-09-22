import { describe, it, expect } from 'vitest';
import { EngineeringValidationPipeline } from './engineeringValidationPipeline';
import { EngineeringModelIR, BoundEngineeringModelIR } from '../contracts/modelIr';

describe('EngineeringValidationPipeline', () => {
  const pipeline = new EngineeringValidationPipeline();

  const createValidModelIr = (): BoundEngineeringModelIR => ({
    schemaVersion: '1.0.0',
    modelId: 'model_valid_bldc',
    name: 'BLDC Speed Loop',
    targetDomain: 'motor_control',
    baseRevision: 1,
    subsystems: [
      { id: 'sub_ctrl', name: 'Control' },
      { id: 'sub_plant', name: 'Plant' }
    ],
    components: [
      {
        id: 'comp_pid',
        name: 'Speed PI',
        conceptId: 'concept_speed_controller',
        subsystemId: 'sub_ctrl',
        parameters: [
          { name: 'kp', value: 1.2, source: 'user', confidence: 1.0, resolutionState: 'resolved' }
        ],
        capabilityBinding: {
          catalogBlockId: 'PID_CONTROLLER',
          catalogBlockType: 'PID_CONTROLLER',
          parameterMapping: { kp: 'Kp' },
          portMapping: { in: 'in1', out: 'out' }
        }
      },
      {
        id: 'comp_motor',
        name: 'Motor',
        conceptId: 'concept_motor',
        subsystemId: 'sub_plant',
        parameters: [],
        capabilityBinding: {
          catalogBlockId: 'AC_INDUCTION_MOTOR',
          catalogBlockType: 'AC_INDUCTION_MOTOR',
          parameterMapping: {},
          portMapping: { in: 'in1', out: 'out' }
        }
      }
    ],
    ports: [
      { id: 'comp_pid_out', componentId: 'comp_pid', name: 'out', direction: 'out', domain: 'electrical', dataType: 'voltage' },
      { id: 'comp_motor_in', componentId: 'comp_motor', name: 'in1', direction: 'in', domain: 'electrical', dataType: 'voltage' }
    ],
    connections: [
      { id: 'c1', fromPortId: 'comp_pid_out', toPortId: 'comp_motor_in', semanticType: 'voltage' }
    ],
    assumptions: [],
    unresolvedParameters: [],
    validationRules: [],
    traceLinks: [],
    rationale: 'Valid feedback loop'
  });

  it('passes a fully valid Model IR with all stages true and zero ERROR diagnostics', () => {
    const ir = createValidModelIr();
    const report = pipeline.validate(ir, {});

    expect(report.isValid).toBe(true);
    expect(report.status).toBe('passed');
    expect(report.stages.schemaAndIntegrity).toBe(true);
    expect(report.stages.parametersAndCompleteness).toBe(true);
    expect(report.stages.portsAndDimensions).toBe(true);
    expect(report.stages.topologyAndFeedback).toBe(true);
    expect(report.diagnostics.filter(d => d.severity === 'ERROR')).toHaveLength(0);
  });

  it('detects domain mismatch between connected ports with structured remediation', () => {
    const ir = createValidModelIr();
    // Inject physical domain mismatch: electrical connected to hydraulic without transducer!
    ir.ports[1].domain = 'hydraulic';

    const report = pipeline.validate(ir, {});
    expect(report.isValid).toBe(false);
    expect(report.status).toBe('failed');
    expect(report.stages.portsAndDimensions).toBe(false);

    const domainDiag = report.diagnostics.find(d => d.code === 'PHYSICAL_DOMAIN_MISMATCH');
    expect(domainDiag).toBeDefined();
    expect(domainDiag?.expected).toBe('electrical');
    expect(domainDiag?.actual).toBe('hydraulic');
    expect(domainDiag?.remediation).toContain('transducer');
  });

  it('detects direct algebraic loop without stateful block or integrator', () => {
    const loopIr: EngineeringModelIR = {
      schemaVersion: '1.0.0',
      modelId: 'model_loop',
      name: 'Algebraic Loop Model',
      targetDomain: 'control',
      baseRevision: 1,
      subsystems: [{ id: 'sub_core', name: 'Core' }],
      components: [
        {
          id: 'comp_gain1',
          name: 'Gain 1',
          conceptId: 'concept_gain',
          subsystemId: 'sub_core',
          parameters: [{ name: 'gain', value: 2, source: 'user', confidence: 1.0, resolutionState: 'resolved' }]
        },
        {
          id: 'comp_gain2',
          name: 'Gain 2',
          conceptId: 'concept_gain',
          subsystemId: 'sub_core',
          parameters: [{ name: 'gain', value: 3, source: 'user', confidence: 1.0, resolutionState: 'resolved' }]
        }
      ],
      ports: [
        { id: 'g1_out', componentId: 'comp_gain1', name: 'out', direction: 'out', domain: 'signal', dataType: 'number' },
        { id: 'g1_in', componentId: 'comp_gain1', name: 'in', direction: 'in', domain: 'signal', dataType: 'number' },
        { id: 'g2_out', componentId: 'comp_gain2', name: 'out', direction: 'out', domain: 'signal', dataType: 'number' },
        { id: 'g2_in', componentId: 'comp_gain2', name: 'in', direction: 'in', domain: 'signal', dataType: 'number' }
      ],
      connections: [
        { id: 'conn_1_to_2', fromPortId: 'g1_out', toPortId: 'g2_in', semanticType: 'signal' },
        { id: 'conn_2_to_1', fromPortId: 'g2_out', toPortId: 'g1_in', semanticType: 'signal' } // Pure feedforward cycle = algebraic loop!
      ],
      assumptions: [],
      unresolvedParameters: [],
      validationRules: [],
      traceLinks: [],
      rationale: 'Loop test'
    };

    const report = pipeline.validate(loopIr, { checkAlgebraicLoops: true });
    expect(report.isValid).toBe(false);
    expect(report.stages.topologyAndFeedback).toBe(false);
    expect(report.diagnostics.some(d => d.code === 'ALGEBRAIC_LOOP_DETECTED')).toBe(true);
  });
});
