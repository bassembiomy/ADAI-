/**
 * WP-09c: vector / composite port plan. The shared mechanism (width / channelNames / composite on a library port, see
 * vlabVectorPorts.ts) is applied to the transform and generator blocks in WP-09c. The ports below ARE vectors by their
 * label / description / equation text, but the blocks that own them still run scalar placeholder equations, so marking
 * them now would hand those equations an array they do not read. Each owner marks its ports (`width` + `channelNames`
 * in vlabLibrary.ts) together with the vector equation; vector_ports.test.ts fails as soon as a listed port is marked
 * (delete the entry then) and when a listed port disappears.
 *
 * Widths: abc / abc-derived = 3 (a, b, c); dq = 2 (d, q). Gate vectors `g` are 6-pulse gate sets (g1..g6) and need the
 * owner's confirmation before they are marked.
 */
export interface PlannedVectorPort {
  width: number;
  channelNames: string[];
  /** work package that owns the block's equation (and therefore the marking) */
  owner: 'WP-12' | 'WP-20';
  note?: string;
}

const abc = (owner: PlannedVectorPort['owner'], note?: string): PlannedVectorPort => ({ width: 3, channelNames: ['a', 'b', 'c'], owner, note });
const dq = (owner: PlannedVectorPort['owner'], note?: string): PlannedVectorPort => ({ width: 2, channelNames: ['d', 'q'], owner, note });
const gates = (owner: PlannedVectorPort['owner']): PlannedVectorPort => ({
  width: 6, channelNames: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'], owner, note: 'six-pulse gate vector: owner confirms the width / order',
});

/** `<block id>.<port id>` -> plan */
export const VECTOR_PORT_BACKLOG: Record<string, PlannedVectorPort> = {
  // inverter / PWM stages: pwm_3ph_2level.vabc and pwm_3ph_3level.vabc are width-3 since WP-12b (no entry left)
  // three-phase controllers
  'bldc_commutation.abc': abc('WP-20', 'hall-decoded phase pattern'),
  'bldc_current_ctrl.vabc': abc('WP-20'),
  'pfc_rectifier_ctrl.vabc_sens': abc('WP-20'),
  'pfc_rectifier_ctrl.iabc_sens': abc('WP-20'),
  'pfc_rectifier_ctrl.vabc_ref': abc('WP-20'),
  'cycloconverter_ctrl.vabc': abc('WP-20'),
  'hysteresis_ctrl_3ph.iabc_ref': abc('WP-20'),
  'hysteresis_ctrl_3ph.iabc': abc('WP-20'),
  'hysteresis_ctrl_3ph.s': abc('WP-20', 'switching state per phase'),
  'im_scalar_ctrl.vabc': abc('WP-20'),
  'im_foc_ctrl.iabc': abc('WP-20'),
  'im_foc_ctrl.vabc': abc('WP-20'),
  'im_dtc_ctrl.vabc': abc('WP-20'),
  'im_dtc_ctrl.iabc': abc('WP-20'),
  'im_flux_observer.iabc': abc('WP-20'),
  'pmsm_foc.iabc_s': abc('WP-20'),
  // dq controllers
  'im_curr_ctrl.idq_ref': dq('WP-20'),
  'im_curr_ctrl.idq': dq('WP-20'),
  'im_curr_ctrl.vdq_ff': dq('WP-20'),
  'im_curr_ctrl.vdq_ref': dq('WP-20'),
  'im_flux_observer.idqsef': dq('WP-20', 'stator current in field coordinates'),
  'pmsm_curr_ctrl.idq_ref': dq('WP-20'),
  'pmsm_curr_ctrl.idq': dq('WP-20'),
  'pmsm_curr_ctrl.vdq_ff': dq('WP-20'),
  'pmsm_curr_ctrl.vdq_ref': dq('WP-20'),
  'pmsm_ref_gen.idq_ref': dq('WP-20'),
  'pmsm_field_weakening.idq_ref': dq('WP-20'),
  'pmsm_field_weakening.vdq': dq('WP-20'),
  'pmsm_field_weakening.idq_ref_fw': dq('WP-20'),
  'pmsm_tq_est.idq': dq('WP-20'),
  // gate vectors
  'bldc_pwm_ctrl.g': gates('WP-20'),
  'im_foc_ctrl.g': gates('WP-20'),
  'im_dtc_ctrl.g': gates('WP-20'),
  'pmsm_foc.g': gates('WP-20'),
};
