/**
 * Explicit pressure-reference semantics of the Fluid, Gas, Isothermal Liquid and Moist Air domains (WP-17, F-064 rest; the twin of
 * vlabThermalMagneticReference.ts).
 *
 * Simscape: the across variable of these domains is the ABSOLUTE pressure and a conserving port that is not connected is OPEN, i.e. capped:
 * it carries no mass flow. Only a reservoir / reference block (Hydraulic Reference, Reservoir, Absolute Reference) fixes the pressure of a
 * network. The V-Lab assembler used to treat EVERY unconnected fluid or gas port as an atmosphere reference at 101325 Pa, and ground by
 * NAME every unconnected fluid / gas / liquid port called `n` or `b`. An open chamber port therefore leaked to the atmosphere (a gas chamber
 * with an open port B never charged: "gas_reservoir stalled at P/2") and a source delivering into a closed line saw a free sink.
 *
 * What replaces the name / domain rules:
 *  1. FLUID_REFERENCE_BLOCKS are the blocks that define the pressure datum: fluid_ref and gas_ref (1 atm, "Fluid Ground (Atm)" /
 *     "Absolute Reference (G)"), ma_ref (0 Pa, the absolute zero of the moist-air library text) and hydraulic_reference_il / reservoir_il.
 *  2. ABSOLUTE_PRESSURE_BLOCKS: blocks whose own equation fixes the absolute pressure of the node they sit on: an absolute pressure source
 *     or reservoir pins it, a capacity (capacitance, chamber, accumulator, piston chamber) integrates it from its initial pressure P0.
 *  3. INTERNAL_FLUID_REFERENCE_PORTS: a port that, left open BY DESIGN, is the pressure reference. Empty: every V-Lab fluid port is open
 *     (capped) when unconnected, as in Simscape. (A single-ended block such as pressure_source or fluid_capacitance has an IMPLICIT return
 *     to the absolute zero of pressure through its through variable; that is part of its equation, not an open port.)
 *  4. findFloatingFluidNetworks: a connected network with none of the above is common-mode indeterminate (every equation depends on
 *     pressure DIFFERENCES only) and is reported with a clear diagnostic instead of an opaque rank failure.
 */

export const FLUID_REFERENCE_BLOCKS: ReadonlySet<string> = new Set([
  'fluid_ref', 'gas_ref', 'ma_ref', 'hydraulic_reference_il', 'reservoir_il',
]);

/** Blocks whose own equation fixes the absolute pressure of their node (pin or integrated storage). */
export const ABSOLUTE_PRESSURE_BLOCKS: ReadonlySet<string> = new Set([
  'pressure_source', 'ctrl_pressure_source', 'gas_reservoir', 'gas_fixed_res',
  'fluid_capacitance', 'gas_chamber', 'ma_chamber', 'steam_accumulator', 'ma_rot_conv', 'ma_trans_conv',
]);

/** block type -> fluid ports tied to the pressure reference when left unconnected. Empty on purpose (see 3 above). */
export const INTERNAL_FLUID_REFERENCE_PORTS: Readonly<Record<string, readonly string[]>> = {};

export function isInternalFluidReferencePort(blockType: string, portId: string): boolean {
  return (INTERNAL_FLUID_REFERENCE_PORTS[blockType] ?? []).includes(portId);
}

export const isFluidLikeDomain = (domain: string | undefined): boolean => {
  const d = (domain ?? '').toLowerCase();
  return d === 'fluid' || d === 'gas' || d === 'isothermal_liquid';
};

export function floatingFluidReason(blocks: { blockId: string; blockType: string }[]): string {
  const names = blocks.slice(0, 6).map(b => `"${b.blockId}" (${b.blockType})`).join(', ') + (blocks.length > 6 ? `, +${blocks.length - 6} more` : '');
  return `Floating fluid network: ${names} ${blocks.length === 1 ? 'has' : 'have'} no pressure reference. ` +
    'Every connected Fluid / Gas / Isothermal Liquid / Moist Air network needs a pressure datum: add a reference block (Fluid Ground, Absolute Reference, ' +
    'Hydraulic Reference), an absolute Pressure Source / Reservoir, or a capacity with an initial pressure (capacitance, chamber, accumulator). ' +
    'An unconnected fluid port is open (capped, no flow), not an atmosphere.';
}
