import { EngineeringPattern, computePatternContentHash, derivePatternId } from './patternSchemas';
import { PatternStore } from './patternStore';
import * as path from 'path';

export const SEED_PATTERNS: Array<Omit<EngineeringPattern, 'contentHash' | 'id'>> = [
  {
    version: 1,
    name: 'Three-Phase Inverter Bridge',
    description: 'Three-phase DC to AC bridge converter with PWM switching and LC filter',
    domain: 'electrical',
    provenance: {
      source: 'reviewed_corpus',
      author: 'ADIA Core Engineering',
      license: 'Apache-2.0',
      licenseApproved: true,
      ingestedAt: 1710000000000,
      originalSourceHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    lifecycle: 'verified',
    requirements: {
      targetSystem: 'three_phase_inverter',
      targetBehaviors: ['dc_ac_inversion', 'sinusoidal_ac_output'],
      requiredInputs: ['dc_voltage_source'],
      requiredOutputs: ['phase_a', 'phase_b', 'phase_c'],
      operatingRanges: {
        dc_bus_voltage: { min: 200, max: 800, unit: 'V' }
      }
    },
    topology: {
      blocks: [
        { blockId: 'DC_VOLTAGE_SOURCE', role: 'dc_source', defaultParams: { voltage: 400 } },
        { blockId: 'THREE_PHASE_INVERTER', role: 'inverter_bridge', defaultParams: { switching_freq: 10000 } }
      ],
      connections: [
        {
          sourceBlockRole: 'dc_source',
          sourcePort: 'v_pos',
          targetBlockRole: 'inverter_bridge',
          targetPort: 'vdc_p'
        }
      ]
    },
    exactMappings: {
      dc_source: 'DC_VOLTAGE_SOURCE',
      inverter_bridge: 'THREE_PHASE_INVERTER'
    },
    simulationContract: {
      minDuration: 0.05,
      stepSize: 1e-5,
      expectedObservables: ['v_phase_a', 'current_thd'],
      tolerance: { current_thd: 0.05 }
    },
    evidence: {
      proofStatus: 'proved',
      catalogFingerprint: 'xbridges_cat_verified_seed',
      engineRunId: 'xbr_seed_run_001',
      measuredAt: 1710000000000,
      qualityScore: 0.98
    }
  },
  {
    version: 1,
    name: 'Closed-Loop PID Control Loop',
    description: 'Feedback control loop with setpoint step input, PID controller, and first-order gain plant',
    domain: 'control',
    provenance: {
      source: 'reviewed_corpus',
      author: 'ADIA Core Engineering',
      license: 'Apache-2.0',
      licenseApproved: true,
      ingestedAt: 1710000000000
    },
    lifecycle: 'verified',
    requirements: {
      targetSystem: 'closed_loop_pid',
      targetBehaviors: ['error_regulation', 'setpoint_tracking'],
      requiredInputs: ['setpoint_step'],
      requiredOutputs: ['plant_output']
    },
    topology: {
      blocks: [
        { blockId: 'Step', role: 'setpoint', defaultParams: { step_time: 1, initial_value: 0, final_value: 1 } },
        { blockId: 'Sum', role: 'error_detector', defaultParams: { signs: '+-' } },
        { blockId: 'PID_CONTROLLER', role: 'controller', defaultParams: { Kp: 2.0, Ki: 0.5, Kd: 0.1 } },
        { blockId: 'Gain', role: 'plant', defaultParams: { gain: 5.0 } }
      ],
      connections: [
        { sourceBlockRole: 'setpoint', sourcePort: 'out', targetBlockRole: 'error_detector', targetPort: 'in1' },
        { sourceBlockRole: 'error_detector', sourcePort: 'out', targetBlockRole: 'controller', targetPort: 'error' },
        { sourceBlockRole: 'controller', sourcePort: 'u', targetBlockRole: 'plant', targetPort: 'u' },
        { sourceBlockRole: 'plant', sourcePort: 'y', targetBlockRole: 'error_detector', targetPort: 'in2' }
      ]
    },
    exactMappings: {
      setpoint: 'Step',
      error_detector: 'Sum',
      controller: 'PID_CONTROLLER',
      plant: 'Gain'
    },
    simulationContract: {
      minDuration: 5.0,
      stepSize: 0.001,
      expectedObservables: ['plant_output', 'control_signal']
    },
    evidence: {
      proofStatus: 'proved',
      catalogFingerprint: 'xbridges_cat_verified_seed',
      engineRunId: 'xbr_seed_run_002',
      measuredAt: 1710000000000,
      qualityScore: 0.95
    }
  },
  {
    version: 1,
    name: 'Signal Filtering and Conditioning',
    description: 'Second-order lowpass signal filtering for sensor noise attenuation',
    domain: 'signal_processing',
    provenance: {
      source: 'reviewed_corpus',
      author: 'ADIA Core Engineering',
      license: 'Apache-2.0',
      licenseApproved: true,
      ingestedAt: 1710000000000
    },
    lifecycle: 'verified',
    requirements: {
      targetSystem: 'signal_filter',
      targetBehaviors: ['harmonic_attenuation', 'noise_filtering'],
      requiredInputs: ['raw_signal'],
      requiredOutputs: ['filtered_signal']
    },
    topology: {
      blocks: [
        { blockId: 'WaveformGen', role: 'signal_generator', defaultParams: { waveform: 'sine', frequency: 50, amplitude: 1 } },
        { blockId: 'LOW_PASS_FILTER', role: 'lowpass_filter', defaultParams: { cutoff_frequency: 100 } }
      ],
      connections: [
        { sourceBlockRole: 'signal_generator', sourcePort: 'out', targetBlockRole: 'lowpass_filter', targetPort: 'u' }
      ]
    },
    exactMappings: {
      signal_generator: 'WaveformGen',
      lowpass_filter: 'LOW_PASS_FILTER'
    },
    simulationContract: {
      minDuration: 0.2,
      stepSize: 0.0001,
      expectedObservables: ['filtered_signal']
    },
    evidence: {
      proofStatus: 'proved',
      catalogFingerprint: 'xbridges_cat_verified_seed',
      engineRunId: 'xbr_seed_run_003',
      measuredAt: 1710000000000,
      qualityScore: 0.96
    }
  }
];

export async function populateSeedPatterns(resourcesDir?: string): Promise<PatternStore> {
  const targetDir = resourcesDir || path.resolve(process.cwd(), 'resources', 'engineering-patterns');
  const store = new PatternStore({ storageDir: targetDir });
  await store.init();

  for (const seed of SEED_PATTERNS) {
    await store.put(seed);
  }

  return store;
}
