import { describe, it, expect } from 'vitest';
import { compileExternalPattern } from './xbridgesCompatibilityCompiler';
import { ExternalModel } from './externalModel';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('X-Bridges Compatibility Compiler Comprehensive Tests', () => {
  const catalog = buildXbridgesCapabilityIndex();

  it('maps PIDController, Sum, and LowPassFilter accurately to catalog blocks', () => {
    const external: ExternalModel = {
      name: 'AdvancedFeedbackLoop',
      sourceFormat: 'simulink',
      provenance: { source: 'feedback.slx', author: 'engineer', license: 'Apache-2.0' },
      components: [
        {
          id: 'step_1',
          name: 'Setpoint',
          externalType: 'Step',
          parameters: {},
          ports: [{ id: 'out', direction: 'out' }]
        },
        {
          id: 'sum_1',
          name: 'ErrorSum',
          externalType: 'Sum',
          parameters: {},
          ports: [{ id: 'in1', direction: 'in' }, { id: 'in2', direction: 'in' }, { id: 'out', direction: 'out' }]
        },
        {
          id: 'pid_1',
          name: 'MainPID',
          externalType: 'PIDController',
          parameters: { Kp: 1.5, Ki: 0.2 },
          ports: [{ id: 'r', direction: 'in' }, { id: 'u', direction: 'out' }]
        },
        {
          id: 'lpf_1',
          name: 'FeedbackFilter',
          externalType: 'LowPassFilter',
          parameters: {},
          ports: [{ id: 'u', direction: 'in' }, { id: 'y', direction: 'out' }]
        }
      ],
      links: [
        {
          id: 'l1',
          sourceComponentId: 'step_1',
          sourcePortId: 'out',
          targetComponentId: 'sum_1',
          targetPortId: 'in1'
        },
        {
          id: 'l2',
          sourceComponentId: 'sum_1',
          sourcePortId: 'out',
          targetComponentId: 'pid_1',
          targetPortId: 'r'
        }
      ],
      unsupportedConstructs: []
    };

    const result = compileExternalPattern(external, catalog);
    expect(result.status).toBe('compatible');
    expect(result.pattern).toBeDefined();
    expect(result.pattern?.topology.blocks.map(b => b.blockId)).toEqual([
      'Step',
      'Sum',
      'PID_CONTROLLER',
      'LOW_PASS_FILTER'
    ]);
    expect(result.pattern?.topology.connections).toHaveLength(2);
  });

  it('fails with UNSUPPORTED_CONSTRUCT when unsupported scripts or blocks exist', () => {
    const external: ExternalModel = {
      name: 'BadConstructModel',
      sourceFormat: 'simulink',
      provenance: { source: 'bad.slx', author: 'engineer', license: 'MIT' },
      components: [],
      links: [],
      unsupportedConstructs: ['MATLAB Function block with eval()', 'S-Function C MEX']
    };

    const result = compileExternalPattern(external, catalog);
    expect(result.status).toBe('incompatible');
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every(d => d.code === 'UNSUPPORTED_CONSTRUCT')).toBe(true);
  });
});
