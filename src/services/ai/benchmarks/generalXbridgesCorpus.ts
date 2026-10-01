/**
 * Cross-Domain Acceptance Corpus for General X-Bridges Engineering Agent
 *
 * Defines acceptance cases across all catalog-supported domains:
 * electrical, control, signal processing, robotics, thermal, hydraulic, logic, mixed-rate.
 *
 * Also defines negative cases for unknown blocks/ports, incompatible connections,
 * insufficient requirements, unsupported physics, stale/replayed approvals,
 * provider offline, malformed LLM output, cancellation, worker crash, save failure, reload mismatch.
 */

export type CorpusDomain =
  | 'electrical'
  | 'control'
  | 'signal_processing'
  | 'robotics'
  | 'thermal'
  | 'hydraulic'
  | 'logic'
  | 'mixed_rate';

export interface AcceptanceCase {
  id: string;
  domain: CorpusDomain;
  description: string;
  naturalLanguagePrompt: string;
  clarificationAnswers: string[];
  expectedGraphRoles: {
    requiredBlockTypes: string[];
    prohibitedBlockTypes?: string[];
    minBlocks: number;
    minConnections: number;
  };
  prohibitedInventedIds: string[];
  proofCriteria: {
    mustCompile: boolean;
    mustSimulate: boolean;
    requireRunId: boolean;
    prohibitSyntheticMetrics: boolean;
  };
  persistedFingerprintCheck: {
    expectValidHash: boolean;
    expectStateRestoration: boolean;
  };
}

export type NegativeCategory =
  | 'unknown_blocks_or_ports'
  | 'incompatible_connections'
  | 'insufficient_requirements'
  | 'unsupported_physics'
  | 'stale_replayed_approval'
  | 'provider_offline'
  | 'malformed_llm_output'
  | 'cancellation'
  | 'worker_crash'
  | 'save_failure'
  | 'reload_mismatch';

export interface NegativeCase {
  id: string;
  category: NegativeCategory;
  description: string;
  prompt: string;
  clarificationAnswers?: string[];
  injectedFault?: 'disable_add' | 'disable_connect' | 'disable_update' | 'disable_save' | 'disable_simulate' | 'corrupt_reload';
  expectedOutcome: {
    status: 'blocked' | 'error' | 'refused' | 'rolled_back' | 'clarifying';
    zeroMutations: boolean;
    expectedDiagnosticPattern?: RegExp;
  };
}

/**
 * Positive cross-domain acceptance cases.
 * Every case specifies catalog-verified block types and prohibited hallucinated IDs.
 */
export const ACCEPTANCE_CASES: AcceptanceCase[] = [
  {
    id: 'corpus_electrical_inverter',
    domain: 'electrical',
    description: 'Three-phase SPWM DC-AC Inverter with real rail connections and load',
    naturalLanguagePrompt: 'Create a three-phase inverter model',
    clarificationAnswers: ['400V', '10000Hz', '50Hz'],
    expectedGraphRoles: {
      requiredBlockTypes: [
        'DC_VOLTAGE_SOURCE',
        'VOLTAGE_REFERENCE_GENERATOR',
        'THREE_PHASE_PWM',
        'THREE_PHASE_INVERTER',
        'THREE_PHASE_LOAD',
      ],
      minBlocks: 5,
      minConnections: 4,
    },
    prohibitedInventedIds: [
      'FANTASY_QUANTUM_INVERTER',
      'MAGIC_AC_SOURCE',
      'SYNTHETIC_SUPERCAPACITOR',
      'IMAGINARY_BUS_BAR',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_control_closed_loop_pid',
    domain: 'control',
    description: 'Closed-loop PID servo controller with error summing and feedback',
    naturalLanguagePrompt: 'Design a closed-loop PID control loop with setpoint and feedback',
    clarificationAnswers: ['Kp=2.0, Ki=0.5, Kd=0.05'],
    expectedGraphRoles: {
      requiredBlockTypes: [
        'Constant',
        'Sum',
        'PID_CONTROLLER',
        'INTEGRATOR_CONTINUOUS',
        'Scope',
      ],
      minBlocks: 4,
      minConnections: 3,
    },
    prohibitedInventedIds: [
      'NEURAL_BRAIN_CONTROLLER',
      'QUANTUM_FEEDBACK_GATE',
      'MAGIC_STABILIZER',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_signal_processing_filter',
    domain: 'signal_processing',
    description: 'Continuous low-pass signal filter receiving sinusoidal excitation',
    naturalLanguagePrompt: 'Create a lowpass signal filter circuit for noise suppression',
    clarificationAnswers: ['cutoff frequency 100 rad/s'],
    expectedGraphRoles: {
      requiredBlockTypes: ['TRANSFER_FUNCTION', 'Scope'],
      minBlocks: 2,
      minConnections: 1,
    },
    prohibitedInventedIds: [
      'TELEPATHIC_NOISE_REMOVER',
      'INFINITE_Q_RESONATOR',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_robotics_vacuum_motion',
    domain: 'robotics',
    description: 'Autonomous robot vacuum velocity controller with odometry sensor fusion',
    naturalLanguagePrompt: 'Configure robot vacuum wheel control and odometry feedback',
    clarificationAnswers: ['wheel speed 0.5 m/s'],
    expectedGraphRoles: {
      requiredBlockTypes: ['ROBOT_VACUUM_ODOMETRY_SENSOR', 'ROBOT_VACUUM_VELOCITY_PID'],
      minBlocks: 2,
      minConnections: 1,
    },
    prohibitedInventedIds: [
      'ANTIGRAVITY_HOVER_DRIVE',
      'WARP_VACUUM_SUCTION',
      'TACHYON_ODOMETRY',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_thermal_air_fryer_loop',
    domain: 'thermal',
    description: 'Air fryer thermal loop with heat target setpoint and sensor scope',
    naturalLanguagePrompt: 'Create thermal model for air fryer heating chamber',
    clarificationAnswers: ['target temperature 200 C'],
    expectedGraphRoles: {
      requiredBlockTypes: ['Constant', 'AIR_FRYER_LEARNING_MODEL', 'Scope'],
      minBlocks: 2,
      minConnections: 1,
    },
    prohibitedInventedIds: [
      'PERPETUAL_HEAT_PUMP',
      'COLD_FUSION_ELEMENT',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_hydraulic_fluid_coupling',
    domain: 'hydraulic',
    description: 'CFD-DEM fluid coupling interface with water solver and drum',
    naturalLanguagePrompt: 'Construct hydraulic fluid phase coupling with SPH water solver',
    clarificationAnswers: ['viscosity 0.001 Pa.s'],
    expectedGraphRoles: {
      requiredBlockTypes: ['CFD_SPH_WATER_SOLVER', 'DEM_FLUID_COUPLING'],
      minBlocks: 2,
      minConnections: 1,
    },
    prohibitedInventedIds: [
      'INFINITE_PRESSURE_INJECTOR',
      'SUPERFLUID_ANOMALY_GENERATOR',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_logic_safety_interlock',
    domain: 'logic',
    description: 'Sequential safety interlock logic gate latching system',
    naturalLanguagePrompt: 'Build a safety interlock logic sequence with D flip-flop latch',
    clarificationAnswers: ['clock period 10ms'],
    expectedGraphRoles: {
      requiredBlockTypes: ['Constant', 'DFlipFlop', 'Scope'],
      minBlocks: 3,
      minConnections: 2,
    },
    prohibitedInventedIds: [
      'QUANTUM_ENTANGLED_GATE',
      'SUPRASONIC_LOGIC_RELAY',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
  {
    id: 'corpus_mixed_rate_continuous_discrete',
    domain: 'mixed_rate',
    description: 'Mixed-rate architecture with continuous integrator and discrete sampler',
    naturalLanguagePrompt: 'Build open_loop feedforward controller with continuous integration and discrete sampling',
    clarificationAnswers: ['sample rate 100Hz'],
    expectedGraphRoles: {
      requiredBlockTypes: ['Step', 'Gain', 'Integrator', 'Scope'],
      minBlocks: 3,
      minConnections: 2,
    },
    prohibitedInventedIds: [
      'NON_CAUSAL_TIME_WARP_SAMPLER',
      'TIME_TRAVEL_BUFFER',
    ],
    proofCriteria: {
      mustCompile: true,
      mustSimulate: true,
      requireRunId: true,
      prohibitSyntheticMetrics: true,
    },
    persistedFingerprintCheck: {
      expectValidHash: true,
      expectStateRestoration: true,
    },
  },
];

/**
 * Negative cases covering safety boundaries, failure injection, and refusal.
 */
export const NEGATIVE_CASES: NegativeCase[] = [
  {
    id: 'neg_unknown_blocks',
    category: 'unknown_blocks_or_ports',
    description: 'Request specifying non-existent hallucinated blocks is rejected',
    prompt: 'Synthesize a FANTASY_HYPERDRIVE_9000 connected to MAGIC_TACHYON_CONVERTER',
    expectedOutcome: {
      status: 'blocked',
      zeroMutations: true,
      expectedDiagnosticPattern: /unsupported|unknown|not found|cannot/i,
    },
  },
  {
    id: 'neg_unsupported_physics',
    category: 'unsupported_physics',
    description: 'Physically impossible or unsimulatable requests are explicitly refused',
    prompt: 'Build a perpetual motion machine that generates infinite energy from vacuum',
    expectedOutcome: {
      status: 'blocked',
      zeroMutations: true,
      expectedDiagnosticPattern: /unsupported|refus/i,
    },
  },
  {
    id: 'neg_insufficient_requirements',
    category: 'insufficient_requirements',
    description: 'Vague prompts stop at clarification and make zero workspace mutations',
    prompt: 'Make it better',
    expectedOutcome: {
      status: 'clarifying',
      zeroMutations: true,
    },
  },
  {
    id: 'neg_stale_replayed_approval',
    category: 'stale_replayed_approval',
    description: 'Replaying an already-consumed approval token fails without state modification',
    prompt: 'Create an RC lowpass filter',
    clarificationAnswers: ['cutoff 50Hz'],
    expectedOutcome: {
      status: 'error',
      zeroMutations: true,
      expectedDiagnosticPattern: /token|expired|invalid|consumed/i,
    },
  },
  {
    id: 'neg_provider_offline',
    category: 'provider_offline',
    description: 'Provider unreachable falls back fail-closed with honest status and zero mutation',
    prompt: 'Inspect current schematic',
    expectedOutcome: {
      status: 'error',
      zeroMutations: true,
      expectedDiagnosticPattern: /unavailable|offline|health/i,
    },
  },
  {
    id: 'neg_malformed_llm_output',
    category: 'malformed_llm_output',
    description: 'Corrupted or non-JSON model response is handled safely without crashing',
    prompt: 'Create motor drive',
    expectedOutcome: {
      status: 'blocked',
      zeroMutations: true,
      expectedDiagnosticPattern: /unsupported|fail|invalid/i,
    },
  },
  {
    id: 'neg_cancellation_mid_execution',
    category: 'cancellation',
    description: 'Execution aborted mid-flight rolls back all partial mutations to snapshot',
    prompt: 'Create a three-phase inverter model',
    clarificationAnswers: ['400V', '10000Hz', '50Hz'],
    injectedFault: 'disable_connect',
    expectedOutcome: {
      status: 'rolled_back',
      zeroMutations: true,
    },
  },
  {
    id: 'neg_worker_crash_during_proof',
    category: 'worker_crash',
    description: 'Worker crash during plan proof blocks plan approval and mutates nothing',
    prompt: 'Create an open_loop feedforward controller',
    injectedFault: 'disable_simulate',
    expectedOutcome: {
      status: 'blocked',
      zeroMutations: true,
    },
  },
  {
    id: 'neg_save_failure_rollback',
    category: 'save_failure',
    description: 'Save failure at transaction commit triggers full rollback',
    prompt: 'Create an open_loop feedforward controller',
    injectedFault: 'disable_save',
    expectedOutcome: {
      status: 'rolled_back',
      zeroMutations: true,
    },
  },
  {
    id: 'neg_reload_fingerprint_mismatch',
    category: 'reload_mismatch',
    description: 'Reloading corrupted model detects fingerprint mismatch',
    prompt: 'Create an open_loop feedforward controller',
    injectedFault: 'corrupt_reload',
    expectedOutcome: {
      status: 'error',
      zeroMutations: true,
      expectedDiagnosticPattern: /fingerprint|mismatch|corrupt|checksum/i,
    },
  },
];
