/**
 * WP-09c: vector / composite port plan. The shared mechanism (width / channelNames / composite on a library port, see
 * vlabVectorPorts.ts) is applied block by block; a port that is a vector by its label / description / equation text but still
 * runs a scalar equation is listed here (`<block id>.<port id>`) until its owner marks it (`width` + `channelNames` in
 * vlabLibrary.ts) together with the vector equation. vector_ports.test.ts fails as soon as a listed port is marked (delete the
 * entry then) and when a listed port disappears.
 *
 * WP-12b emptied the inverter / PWM stages, WP-20b emptied the controllers: the backlog is empty. Gate vectors of the controllers
 * are width-3 m_abc / leg-state vectors (the vabc input of pwm_3ph_2level), not six-pulse sets: the library has no consumer of a
 * six-gate vector. Deliberate exception: im_foc_ctrl.vabc stays a SCALAR (the amplitude of the phase voltage reference set),
 * because the shipped labs vfd_inverter_drive and smart_washing_machine (VLabWorkspace.tsx) wire it to the scalar amp input of the
 * inverter; its vector form is g.
 */
export interface PlannedVectorPort {
  width: number;
  channelNames: string[];
  /** work package that owns the block's equation (and therefore the marking) */
  owner: 'WP-12' | 'WP-20';
  note?: string;
}

/** `<block id>.<port id>` -> plan */
export const VECTOR_PORT_BACKLOG: Record<string, PlannedVectorPort> = {};
