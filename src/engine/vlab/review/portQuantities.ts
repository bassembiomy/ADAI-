/**
 * WP-09b: quantity + unit of every measurable (signal, direction `out`) port, so a Scope channel can say what it shows:
 * "<block name>.<port label> - <quantity> [<unit>]" (user section 9).
 *
 * This is the reviewed override table. scripts/vlab_review/genPortQuantities.ts writes `quantity` and `unit` into
 * src/utils/vlabLibrary.ts from it (nothing else in the library changes) and fails if a signal-out port has no entry.
 * connections.test.ts / scope_routing.test.ts fail whenever the committed library differs from this table.
 *
 * Every entry is derived from the block physics: the block's equation (vlabEquations.ts), its library description / port
 * label, and the Simscape block reference. Units are SI, written as plain text (`N*m`, `rad/s`). Special cases:
 *   - UNIT_INHERIT ('*'): the block is unit-polymorphic (a gain, filter, source or selector); the channel carries the unit
 *     of the signal wired to its input, which the library cannot know. Quantity names the operation instead.
 *   - '1': dimensionless (gate / logic / duty / modulation signals, ratios, weights).
 *   - transform_sensor.rx/ry/rz and angle_constraint.ang are published in DEGREES by their equations (x * 180/pi), so
 *     their unit is `deg`; this is recorded as finding F-049 (WP-19: SI would be rad).
 *   - UNSPECIFIED blocks are explicitly unsupported by the solver (vlabStructure.UNSUPPORTED_BLOCKS, F-025/F-035): their
 *     output has no defined physics yet, so the quantity is `unspecified` until the owning WP writes the spec.
 */
export const UNIT_INHERIT = '*';
export const UNSPECIFIED = 'unspecified (block unsupported)';

export interface PortQuantity { quantity: string; unit: string }

const q = (quantity: string, unit: string): PortQuantity => ({ quantity, unit });
const gate = q('gate signal', '1');
const sig = (what: string) => q(what, UNIT_INHERIT);

export const PORT_QUANTITIES: Record<string, PortQuantity> = {
  // ── sensors ──
  'v_sensor.v': q('voltage', 'V'),
  'i_sensor.i': q('current', 'A'),
  'gas_pressure_sensor.out': q('pressure', 'Pa'),
  'gas_flow_sensor.out': q('mass flow rate', 'kg/s'),
  'mag_flux_sensor.phi': q('magnetic flux', 'Wb'),
  'mag_mmf_sensor.f': q('magnetomotive force', 'A'),
  'force_sensor.f': q('force', 'N'),
  'rot_motion_sensor.w': q('angular velocity', 'rad/s'),
  'rot_motion_sensor.a': q('angle', 'rad'),
  'torque_sensor.t': q('torque', 'N*m'),
  'trans_motion_sensor.v': q('velocity', 'm/s'),
  'trans_motion_sensor.p': q('position', 'm'),
  'rot_multibody_interface.w': q('angular velocity', 'rad/s'),
  'trans_multibody_interface.v': q('velocity', 'm/s'),
  'heat_flow_sensor.h': q('heat flow rate', 'W'),
  'temp_sensor.t': q('temperature difference', 'K'),
  'pressure_sensor.out': q('pressure', 'Pa'),
  'flow_sensor.out': q('mass flow rate', 'kg/s'),
  'microwave_cavity.t': q('temperature', 'K'),
  'washing_basket.vis': q('load torque', 'N*m'),

  // ── moist air (MA) ──
  'ma_flow_sensor.m': q('mass flow rate', 'kg/s'),
  'ma_selector.t': q('temperature', 'K'),
  'ma_selector.p': q('pressure', 'Pa'),
  'ma_selector.w': q('moisture mass fraction', '1'),
  'ma_moisture_sensor.w': q('moisture mass fraction', '1'),
  'ma_pt_sensor.p': q('pressure', 'Pa'),
  'ma_thermo_sensor.rho': q('density', 'kg/m^3'),
  'ma_pipe.wd': q(UNSPECIFIED, UNIT_INHERIT),
  'ma_separator.w': q(UNSPECIFIED, UNIT_INHERIT),
  'ma_separator.d': q(UNSPECIFIED, UNIT_INHERIT),
  'ma_rot_conv.wd': q(UNSPECIFIED, UNIT_INHERIT),
  'ma_trans_conv.wd': q(UNSPECIFIED, UNIT_INHERIT),

  // ── multibody ──
  'belt_end.f': q('belt tension', 'N'),
  'belt_spool.t': q('torque', 'N*m'),
  'pulley.t': q('torque', 'N*m'),
  'transform_sensor.x': q('relative position x', 'm'),
  'transform_sensor.y': q('relative position y', 'm'),
  'transform_sensor.z': q('relative position z', 'm'),
  'transform_sensor.rx': q('relative rotation about x', 'deg'),
  'transform_sensor.ry': q('relative rotation about y', 'deg'),
  'transform_sensor.rz': q('relative rotation about z', 'deg'),
  'dist_constraint.d': q('distance', 'm'),
  'dist_constraint.f_reac': q('constraint reaction force', 'N'),
  'angle_constraint.ang': q('angle', 'deg'),
  'angle_constraint.t_reac': q('constraint reaction torque', 'N*m'),
  'grav_field.fm': q('gravity force magnitude', 'N'),
  'spring_damper_force.x': q('spring length', 'm'),
  'spring_damper_force.v': q('relative velocity', 'm/s'),
  'spring_damper_force.fm': q('force magnitude', 'N'),
  'external_force.fm': q('force magnitude', 'N'),
  'external_force.tm': q('torque magnitude', 'N*m'),
  'spherical_joint.fx': q('constraint force x', 'N'),
  'spherical_joint.fy': q('constraint force y', 'N'),
  'spherical_joint.fz': q('constraint force z', 'N'),
  'spherical_joint.f_reac': q('constraint force magnitude', 'N'),
  'spherical_joint.rx': q('rotation about x', 'rad'),
  'spherical_joint.ry': q('rotation about y', 'rad'),
  'spherical_joint.rz': q('rotation about z', 'rad'),
  'universal_joint.angle1': q('joint angle 1', 'rad'),
  'universal_joint.angle2': q('joint angle 2', 'rad'),
  'universal_joint.w1': q('angular velocity 1', 'rad/s'),
  'universal_joint.w2': q('angular velocity 2', 'rad/s'),
  'universal_joint.fx': q('constraint force x', 'N'),
  'universal_joint.fy': q('constraint force y', 'N'),
  'universal_joint.fz': q('constraint force z', 'N'),
  'universal_joint.f_reac': q('constraint force magnitude', 'N'),
  'universal_joint.t_reac': q('constraint torque magnitude', 'N*m'),

  // ── physical-signal math / sources (unit follows the wired input or the user's value) ──
  'ps_demux_3.a': sig('demux component 1'),
  'ps_demux_3.b': sig('demux component 2'),
  'ps_demux_3.c': sig('demux component 3'),
  'ps_delay.y': sig('delayed signal'),
  'ps_add.y': sig('sum'),
  'ps_subtract.y': sig('difference'),
  'ps_gain.y': sig('scaled signal'),
  'ps_product.y': sig('product'),
  'ps_divide.y': sig('quotient'),
  'ps_math.y': sig('function value'),
  'ps_sum.y': sig('sum'),
  'ps_integrator.y': sig('time integral'),
  'ps_transfer_fcn.y': sig('filtered signal'),
  'ps_lookup_1d.y': sig('table value'),
  'ps_lookup_2d.y': sig('table value'),
  'ps_abs.y': sig('absolute value'),
  'ps_saturation.y': sig('limited signal'),
  'ps_dead_zone.y': sig('dead-zone output'),
  'ps_switch.y': sig('selected signal'),
  'ps_min.y': sig('minimum'),
  'ps_max.y': sig('maximum'),
  'ps_rms.y': sig('rms value'),
  'ps_pi_ctrl.u': sig('controller output'),
  'ps_pid_ctrl.u': sig('controller output'),
  'ps_lpf.y': sig('filtered signal'),
  'ps_integrator_gen.y': sig('time integral'),
  'ps_moving_avg.y': sig('moving average'),
  'ps_sample_hold.y': sig('held signal'),
  'ps_smith_predictor.u': sig('controller output'),
  'ps_second_order_filter.y': sig('filtered signal'),
  'ps_state_feedback.u': sig('controller output'),
  'ps_sliding_mode.u': sig('controller output'),
  'ps_stair_gen.y': sig('staircase value'),
  'ps_washout.y': sig('washout output'),
  'ps_sr_flipflop.q': q('logic state Q', '1'),
  'ps_sr_flipflop.nq': q('logic state not-Q', '1'),
  'constant.y': sig('constant value'),
  'ps_constant.y': sig('constant value'),
  'ps_sine.y': sig('sine value'),
  'ps_step.y': sig('step value'),
  'ps_ramp.y': sig('ramp value'),
  'vlab_probe.out': sig('probed signal'),
  'inport.out': sig('subsystem input'),
  'luenberger_observer.xhat': sig('state estimate'),

  // ── machine / converter control ──
  'bldc_commutation.abc': q('phase commutation pattern', '1'),
  'bldc_current_ctrl.vabc': q('phase voltage reference', 'V'),
  'bldc_pwm_ctrl.g': gate,
  'dcdc_ctrl.ctrl': q('duty cycle', '1'),
  'dc_voltage_ctrl.ctrl': q('duty cycle', '1'),
  'dc_current_ctrl.v_ref': q('voltage reference', 'V'),
  'pfc_rectifier_ctrl.vabc_ref': q('modulation reference', '1'),
  'pfc_rectifier_ctrl.vis': sig('visualization signal'),
  'cycloconverter_ctrl.p': q('gate pulses', '1'),
  'cycloconverter_ctrl.vis': sig('visualization signal'),
  'ps_sine_3phase.abc': q('three-phase sine voltage', 'V'),
  'ps_sine_3phase.wt': q('electrical angle', 'rad'),
  'hysteresis_ctrl_3ph.s': q('switching state', '1'),
  'velocity_ctrl.tq_unsat': q('torque reference', 'N*m'),
  'im_scalar_ctrl.vabc': q('phase voltage reference', 'V'),
  'im_foc_ctrl.g': gate,
  'im_foc_ctrl.vabc': q('phase voltage reference', 'V'),
  'im_foc_ctrl.vis': sig('visualization signal'),
  'im_dtc_ctrl.g': gate,
  'im_curr_ctrl.vdq_ref': q('dq voltage reference', 'V'),
  'pmsm_curr_ctrl.vdq_ref': q('dq voltage reference', 'V'),
  'pmsm_ref_gen.idq_ref': q('dq current reference', 'A'),
  'pmsm_ref_gen.tq_ref_sat': q('limited torque reference', 'N*m'),
  'pmsm_ref_gen.tq_lim': q('torque limit', 'N*m'),
  'pmsm_foc.g': gate,
  'pmsm_foc.vis': sig('visualization signal'),
  'pmsm_field_weakening.idq_ref_fw': q('field-weakened dq current reference', 'A'),
  'pmsm_tq_est.tq_est': q('estimated torque', 'N*m'),
  'clarke_transform.ab0': sig('alpha-beta-zero components'),
  'inv_clarke_transform.abc': sig('abc components'),
  'park_transform.dq0': sig('dq0 components'),
  'inv_park_transform.abc': sig('abc components'),
  'sym_comp_transform.seq': sig('sequence components'),
  'inv_sym_comp_transform.abc': sig('abc components'),
  'im_flux_observer.idqsef': q('stator current in field frame', 'A'),
  'im_flux_observer.imr': q('rotor magnetizing current', 'A'),
  'im_flux_observer.theta': q('rotor flux angle', 'rad'),
  'im_flux_observer.we': q('synchronous speed', 'rad/s'),
  'quad_decoder.vel': q('angular velocity', 'rad/s'),
  'quad_decoder.pos': q('angular position', 'rad'),
  'resolver_to_digital.vel': q('angular velocity', 'rad/s'),
  'resolver_to_digital.ang': q('angle', 'rad'),

  // ── 3-level / Vienna PWM and thyristor generators ──
  ...Object.fromEntries(['pwm_3ph_3level', 'pwm_vienna'].flatMap(b => [
    ...['a', 'b', 'c'].map(p => [`${b}.g${p}`, q(`gate signal ${p.toUpperCase()}`, '1')] as const),
    ...['a', 'b', 'c'].map(p => [`${b}.m${p}`, q(`modulation index ${p.toUpperCase()}`, '1')] as const),
  ])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [`thyristor_6pulse.g${n}`, q(`gate signal ${n}`, '1')] as const)),
  ...Object.fromEntries(['delta', 'wye'].flatMap(s => [1, 2, 3, 4, 5, 6].map(n => [`thyristor_12pulse.${s}_g${n}`, q(`${s} bridge gate signal ${n}`, '1')] as const))),

  // ── learning / pedagogical blocks ──
  'lms_adaptive_filter.y': sig('filter output'),
  'lms_adaptive_filter.err': sig('estimation error'),
  'lms_adaptive_filter.w1': q('filter weight 1', '1'),
  'lms_adaptive_filter.w2': q('filter weight 2', '1'),
  'neural_neuron_learning.y': q('neuron output', '1'),
  'neural_neuron_learning.err': sig('output error'),
  'neural_neuron_learning.w1': q('weight 1', '1'),
  'neural_neuron_learning.w2': q('weight 2', '1'),
  'neural_neuron_learning.bias': q('bias', '1'),
  'rl_q_learning_controller.action': sig('selected action'),
  'rl_q_learning_controller.max_q': q('maximum Q value', '1'),
  'ac_motor_pid_control.omega': q('angular velocity', 'rad/s'),
  'ac_motor_pid_control.error': q('speed error', 'rad/s'),
  'ac_motor_pid_control.te': q('electromagnetic torque', 'N*m'),
};
