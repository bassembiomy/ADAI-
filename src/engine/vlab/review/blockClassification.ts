/**
 * WP-03: explicit block classification and documented allow-lists for the catalog contract tests.
 *
 * Every live VLAB_LIBRARY block id appears in exactly one class list below. The contract test fails when a
 * library block is unclassified or a listed id no longer exists, so adding or removing a block forces a
 * conscious classification decision.
 *
 *   physical    conserving-network element: across/through variables on conserving-domain ports
 *   signal      non-conserving signal processing / control (physical-signal ports only)
 *   measurement sensor: reads across/through of a network and outputs a physical signal
 *   source      ideal or controlled source driving a network or a signal
 *   utility     NON-SIMULATING block (no network contribution): needs a written reason below
 */

export type BlockClass = 'physical' | 'signal' | 'measurement' | 'source' | 'utility';

const PHYSICAL = [
  'resistor', 'variable_resistor', 'infinite_resistance', 'capacitor', 'inductor', 'memristor', 'gyrator', 'transformer',
  'opamp', 'switch', 'diode', 'nmos', 'igbt', 'rotational_electromechanical_converter', 'translational_electromechanical_converter',
  'pmsm', 'dc_motor', 'ac_motor', 'bldc_motor', 'thermal_resistor', 'ground', 'busbar', 'phase_splitter', 'delta_ref', 'open_circuit',
  'gas_ref', 'gas_cap', 'gas_chamber', 'gas_reservoir', 'gas_resistance', 'gas_inf_resistance', 'gas_restriction', 'gas_pipe',
  'gas_fixed_res', 'gas_rotational_conv', 'gas_translational_conv',
  'mag_ref', 'reluctance', 'fundamental_reluctance', 'variable_reluctance', 'permanent_magnet', 'em_converter', 'reluctance_force',
  'gear_box', 'lever', 'wheel_axle', 'rot_multibody_interface', 'trans_multibody_interface',
  'inertia', 'rot_ref', 'rot_spring', 'rot_damper', 'rot_friction', 'rot_hard_stop',
  'mass', 'trans_ref', 'trans_spring', 'trans_damper', 'trans_friction', 'trans_hard_stop',
  'ma_ref', 'ma_chamber', 'ma_pipe', 'ma_separator', 'ma_rot_conv', 'ma_trans_conv',
  'pwm_3ph_2level', 'belt_end', 'belt_spool', 'pulley',
  'world_frame', 'ref_frame', 'rigid_transform', 'dist_constraint', 'angle_constraint', 'grav_field', 'spring_damper_force', 'external_force',
  'revolute_joint', 'prismatic_joint', 'spherical_joint', 'universal_joint', 'weld_joint', 'common_gear', 'rack_pinion',
  'conductive_heat', 'convective_heat', 'radiative_heat', 'thermal_mass', 'thermal_ref',
  'washing_basket', 'washing_fluid', 'magnetron', 'upper_heater', 'steam_generator', 'microwave_inverter', 'microwave_cavity',
  'fluid_ref', 'fluid_resistance', 'orifice', 'fluid_capacitance', 'fluid_inertance', 'check_valve', 'relief_valve',
  'steam_generator_fluid', 'steam_accumulator', 'steam_nozzle', 'hydraulic_reference_il', 'pipe_il', 'restriction_il',
];

const SIGNAL = [
  'ps_demux_3', 'ps_delay', 'ps_add', 'ps_subtract', 'ps_gain', 'ps_product', 'ps_divide', 'ps_math', 'ps_sum', 'ps_integrator',
  'ps_transfer_fcn', 'ps_lookup_1d', 'ps_lookup_2d', 'ps_abs', 'ps_saturation', 'ps_dead_zone', 'ps_switch', 'ps_min', 'ps_max', 'ps_rms',
  'bldc_commutation', 'bldc_current_ctrl', 'bldc_pwm_ctrl', 'dcdc_ctrl', 'pfc_rectifier_ctrl', 'cycloconverter_ctrl',
  'ps_pi_ctrl', 'ps_pid_ctrl', 'ps_lpf', 'ps_integrator_gen', 'ps_moving_avg', 'ps_sr_flipflop', 'ps_sample_hold', 'ps_smith_predictor',
  'ps_sine_3phase', 'ps_second_order_filter', 'ps_state_feedback', 'ps_sliding_mode', 'ps_stair_gen', 'ps_washout',
  'dc_current_ctrl', 'dc_voltage_ctrl', 'hysteresis_ctrl_3ph', 'velocity_ctrl', 'im_scalar_ctrl', 'im_foc_ctrl', 'im_dtc_ctrl', 'im_curr_ctrl',
  'clarke_transform', 'inv_clarke_transform', 'park_transform', 'inv_park_transform', 'sym_comp_transform', 'inv_sym_comp_transform',
  'im_flux_observer', 'luenberger_observer', 'quad_decoder', 'resolver_to_digital',
  'pmsm_curr_ctrl', 'pmsm_ref_gen', 'pmsm_foc', 'pmsm_field_weakening', 'pmsm_tq_est',
  'pwm_3ph_3level', 'pwm_vienna', 'thyristor_6pulse', 'thyristor_12pulse',
  'lms_adaptive_filter', 'neural_neuron_learning', 'rl_q_learning_controller', 'ac_motor_pid_control',
  'ps_simulink_conv', 'simulink_ps_conv',
];

const MEASUREMENT = [
  'v_sensor', 'i_sensor', 'gas_pressure_sensor', 'gas_flow_sensor', 'mag_flux_sensor', 'mag_mmf_sensor',
  'force_sensor', 'rot_motion_sensor', 'torque_sensor', 'trans_motion_sensor',
  'ma_flow_sensor', 'ma_selector', 'ma_moisture_sensor', 'ma_pt_sensor', 'ma_thermo_sensor',
  'transform_sensor', 'heat_flow_sensor', 'temp_sensor', 'pressure_sensor', 'flow_sensor',
];

const SOURCE = [
  'dc_voltage', 'ac_voltage', 'three_phase_source', 'controlled_voltage', 'dc_current', 'vcvs', 'vccs', 'cccs', 'ccvs',
  'gas_flow_source', 'gas_pressure_source', 'mag_mmf_source', 'mag_flux_source', 'mag_controlled_mmf',
  'force_source', 'torque_source', 'ang_vel_source', 'ma_moisture_source', 'ma_flow_source', 'ma_pressure_source',
  'constant', 'ps_constant', 'ps_sine', 'ps_step', 'ps_ramp',
  'heat_src', 'temp_src', 'ctrl_heat_src', 'ctrl_temp_src', 'pressure_source', 'ctrl_pressure_source', 'mass_flow_source', 'pump_il',
];

/** Non-simulating blocks. Each needs a written reason. A conserving-domain port on any of these is a contract failure. */
export const UTILITY_REASONS: Record<string, string> = {
  scope: 'Sink: records signals; contributes no equation to the network (readout only).',
  ps_terminator: 'Sink: terminates an unused signal output; no state and no output.',
  vlab_probe: 'Annotation/tap: pass-through probe point for the scope routing path; carries no physics of its own.',
  conn_label: 'Annotation: names a net for readability; no electrical/physical effect.',
  subsystem: 'Container: flattened away by DAEAssembler.flattenSubsystems before assembly; owns no unknowns.',
  inport: 'Subsystem boundary marker: flattened away with its subsystem; owns no unknowns.',
  outport: 'Subsystem boundary marker: flattened away with its subsystem; owns no unknowns.',
  solver_config: 'Configuration: solver tolerances/step settings consumed by the engine; no network equation.',
  mech_config: 'Configuration: multibody mechanism settings (gravity vector, solver hints); no network equation.',
  doe_custom: 'Statistical design-of-experiments model with no ports; not part of any physical network.',
  ma_properties: 'Parameter provider: moist-air property constants; no ports, no network equation.',
  belt_properties: 'Parameter provider: belt density/Young modulus injected into belt consumers by DAEAssembler.injectBeltMaterial; non-conserving property link only.',
};

const UTILITY = Object.keys(UTILITY_REASONS);

export const BLOCK_CLASS_LISTS: Record<BlockClass, string[]> = {
  physical: PHYSICAL, signal: SIGNAL, measurement: MEASUREMENT, source: SOURCE, utility: UTILITY,
};

export const BLOCK_CLASSIFICATION: Record<string, BlockClass> = (() => {
  const out: Record<string, BlockClass> = {};
  for (const [cls, ids] of Object.entries(BLOCK_CLASS_LISTS) as [BlockClass, string[]][]) {
    for (const id of ids) out[id] ??= cls; // duplicates across lists are rejected by contract.test.ts
  }
  return out;
})();

/** Domains that carry conserving across/through variables (a utility or signal block must not own one). */
export const CONSERVING_DOMAINS = new Set([
  'electrical', 'thermal', 'translational', 'rotational', 'magnetic', 'fluid', 'gas', 'isothermal_liquid', 'frame', 'multibodyframe',
]);

/** Every explicit port domain the assembler understands (lower case). Anything else is a typo or a bulk fallback. */
export const KNOWN_PORT_DOMAINS = new Set([
  ...CONSERVING_DOMAINS, 'physical', 'beltproperty', 'any',
]);

/** `Any` is a Simulink<->PS boundary wildcard and is only legal on these converters (single source: the connection rules, WP-07). */
export { ANY_DOMAIN_BLOCKS } from '../vlabConnectionRules';

/**
 * Equation keys that are not a live library block id. Each is a documented alias or a legacy leftover.
 * The orphan test fails when a key is missing here (new orphan) AND when an entry here is no longer an orphan
 * or no longer exists (stale allowance), so the list can only shrink.
 */
export const ORPHAN_EQUATION_KEYS: Record<string, string> = {
  Inport: 'Capitalised alias of `inport`; DAEAssembler lists both spellings for old saved models.',
  Outport: 'Capitalised alias of `outport`; DAEAssembler lists both spellings for old saved models.',
  Subsystem: 'Capitalised alias of `subsystem`; DAEAssembler lists both spellings for old saved models.',
  heat_sensor: 'Legacy id replaced by heat_flow_sensor/temp_sensor; kept so old saved models still resolve (F: orphan).',
  reservoir_il: 'Removed from the catalog (replaced by hydraulic_reference_il); equation left behind (F: orphan).',
  vfd_controller: 'Legacy id with no library block, symbol or definition (F: orphan).',
};

/** `case` labels of the DAEAssembler allocation switch that are not live library ids. */
export const ORPHAN_DAE_CASES: Record<string, string> = {
  heat_sensor: 'Legacy id, same as ORPHAN_EQUATION_KEYS.heat_sensor.',
};

/** VLAB_COMPONENT_DEFINITIONS keys that are not live library ids (legacy short names). */
export const ORPHAN_DEFINITION_KEYS: Record<string, string> = {
  ma_flow_src: 'Legacy short name of ma_flow_source.',
  ma_pres_src: 'Legacy short name of ma_pressure_source.',
  ma_props: 'Legacy short name of ma_properties.',
  heat_sensor: 'Legacy id, same as ORPHAN_EQUATION_KEYS.heat_sensor.',
  reservoir_il: 'Removed block, same as ORPHAN_EQUATION_KEYS.reservoir_il.',
};

/**
 * Parameter keys an equation reads that are not library parameters, per block.
 *  - a library key string: legacy synonym of that library parameter (backward compatibility)
 *  - '@injected': value injected at assembly time (not user-editable), not a library parameter
 * Anything else an equation reads that the library does not expose is reported as `params-hidden`.
 * (WP-08: equations read ONLY canonical library keys; legacy synonyms such as torque/force/resistance are mapped to
 * the canonical key at model load by vlabModelMigration.ts, so no synonym is listed here any more.)
 */
export const PARAM_ALIASES: Record<string, Record<string, string>> = {
  belt_end: { belt_density: '@injected', belt_youngs: '@injected', density: '@injected', youngs: '@injected' },
  belt_spool: { belt_density: '@injected', belt_youngs: '@injected', density: '@injected', youngs: '@injected' },
  pulley: { belt_density: '@injected', belt_youngs: '@injected', density: '@injected', youngs: '@injected' },
};

/**
 * Library parameters that are real and consumed, but outside the block's equation factory: initial-state seeding
 * (vlabPhysics.ts), reference-node targets (DAEAssembler.ts) and UI-only settings (VLabWorkspace.tsx). The params-dead
 * check skips them. params.test.ts proves each name is really referenced by the named repo-relative source file.
 */
export const ENGINE_CONSUMED_PARAMS: Record<string, { file: string; params: string[] }[]> = {
  neural_neuron_learning: [{ file: 'src/engine/vlab/vlabPhysics.ts', params: ['initW1', 'initW2', 'initBias'] }],
  hydraulic_reference_il: [
    { file: 'src/engine/vlab/DAEAssembler.ts', params: ['referencePressure', 'pressureType', 'atmosphericPressure', 'elevationCorrection', 'referenceElevation'] },
    { file: 'src/components/vlab/VLabWorkspace.tsx', params: ['initializationPriority'] },
  ],
};
