/**
 * Explicit Thermal and Magnetic reference semantics (WP-15, F-011 and F-064 rest; the twin of vlabMechanicalReference.ts).
 *
 * Simscape Foundation, Thermal domain: the across variable is the ABSOLUTE temperature in K, measured against the Thermal
 * Reference block, which is absolute zero (0 K). A Temperature Sensor outputs T_A - T_B, so it reads the absolute temperature
 * when B sits on the reference. A Thermal Mass (Q = m c dT/dt), a Temperature Source and every blackbody radiation term
 * (Q = sigma eps A (T_A^4 - T_B^4)) are therefore referred to that zero. The V-Lab assembler used to pin the Thermal Reference
 * (and EVERY unconnected thermal port) at 293.15 K, which made sensors read T - 293.15 K and turned each open thermal
 * port into an infinite 20 degC sink.
 *
 * Simscape Foundation, Magnetic domain: the across variable is the magnetomotive force (mmf) and the through variable is the
 * magnetic flux; the Magnetic Reference defines mmf = 0. An unconnected magnetic port is open (zero flux). The assembler used
 * to ground any unconnected magnetic port called `n` by name.
 *
 * What replaces the name / domain rules:
 *  1. THERMAL_REFERENCE_BLOCKS and MAGNETIC_REFERENCE_BLOCKS are the only blocks that define the zero of their domain.
 *  2. INTERNAL_THERMAL_REFERENCE_PORTS: a port that, left open BY DESIGN, is the thermal reference. These are pure
 *     measurement / single-ended ports, which carry no heat flow, so the tie is energetically neutral.
 *  3. ABSOLUTE_TEMPERATURE_BLOCKS: blocks whose equation fixes the absolute temperature of the node they sit on (a Thermal
 *     Mass integrates the absolute temperature, a Temperature Source pins it, a chamber carries a temperature state).
 *  4. findFloatingThermalNetworks / findFloatingMagneticNetworks: a connected network that has none of the above is
 *     common-mode indeterminate (every equation depends only on differences) and is reported with a clear diagnostic.
 *  5. An ideal heat source / heater with an open port cannot deliver its heat; the derived required-port table
 *     (vlabRequiredPorts.ts, generated from the Jacobian) rejects it before assembly with the port named.
 */

export const THERMAL_REFERENCE_BLOCKS: ReadonlySet<string> = new Set(['thermal_ref']);
export const MAGNETIC_REFERENCE_BLOCKS: ReadonlySet<string> = new Set(['mag_ref']);

/**
 * Absolute zero: the Simscape Thermal Reference. Temperatures are absolute (K) everywhere in the engine.
 * Ambient temperature is NEVER taken from the reference: convection / radiation to the surroundings is wired to a
 * Temperature Source (or to a block parameter such as ambient_temp on the appliance blocks).
 */
export const THERMAL_REFERENCE_TEMPERATURE = 0;

/** block type -> thermal ports tied to the thermal reference when they are left unconnected (a measurement is referred to 0 K). */
export const INTERNAL_THERMAL_REFERENCE_PORTS: Readonly<Record<string, readonly string[]>> = {
  // Temperature Sensor: T_out = T_A - T_B. An open B reads the absolute temperature (T_B = 0 K), no heat flows (sensor is ideal).
  temp_sensor: ['b'],
  // Controlled Temperature Source: T_A - T_B = S. An open B makes it the single-ended absolute source T_A = S (as Temperature Source).
  ctrl_temp_src: ['b'],
};

export function isInternalThermalReferencePort(blockType: string, portId: string): boolean {
  return (INTERNAL_THERMAL_REFERENCE_PORTS[blockType] ?? []).includes(portId);
}

export const isThermalDomain = (domain: string | undefined): boolean => (domain ?? '').toLowerCase() === 'thermal';
export const isMagneticDomain = (domain: string | undefined): boolean => (domain ?? '').toLowerCase() === 'magnetic';

/** Blocks whose own equation fixes the absolute temperature of their node, so a network that contains one is not floating. */
export const ABSOLUTE_TEMPERATURE_BLOCKS: ReadonlySet<string> = new Set([
  'thermal_mass', 'temp_src',
  // appliance chambers carry a temperature state (ambient from their own parameter)
  'ma_chamber', 'microwave_cavity',
]);

export interface DomainBlockNets {
  blockId: string;
  blockType: string;
  /** union-find roots of the block's ports of this domain (all the ports of one block count as one network: conservative) */
  roots: string[];
}

export interface FloatingDomainNetwork {
  blocks: { blockId: string; blockType: string }[];
}

function findFloating(
  blocks: DomainBlockNets[],
  referenceRoots: ReadonlySet<string>,
  isReferencing: (blockType: string) => boolean,
): FloatingDomainNetwork[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    if (!parent.has(a)) parent.set(a, a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  for (const b of blocks) {
    if (b.roots.length === 0) continue;
    const head = find(b.roots[0]);
    for (const r of b.roots.slice(1)) parent.set(find(r), head);
  }
  const groups = new Map<string, { blocks: { blockId: string; blockType: string }[]; referenced: boolean }>();
  for (const b of blocks) {
    if (b.roots.length === 0) continue;
    const key = find(b.roots[0]);
    const g = groups.get(key) ?? { blocks: [], referenced: false };
    g.blocks.push({ blockId: b.blockId, blockType: b.blockType });
    if (isReferencing(b.blockType)) g.referenced = true;
    if (b.roots.some(r => referenceRoots.has(r))) g.referenced = true;
    groups.set(key, g);
  }
  // a lone single-block network has no through element to be indeterminate (nothing to report)
  return [...groups.values()].filter(g => !g.referenced && g.blocks.length > 1).map(g => ({ blocks: g.blocks }));
}

export const findFloatingThermalNetworks = (blocks: DomainBlockNets[], referenceRoots: ReadonlySet<string>): FloatingDomainNetwork[] =>
  findFloating(blocks, referenceRoots, t => ABSOLUTE_TEMPERATURE_BLOCKS.has(t) || THERMAL_REFERENCE_BLOCKS.has(t));

export const findFloatingMagneticNetworks = (blocks: DomainBlockNets[], referenceRoots: ReadonlySet<string>): FloatingDomainNetwork[] =>
  findFloating(blocks, referenceRoots, t => MAGNETIC_REFERENCE_BLOCKS.has(t));

const names = (n: FloatingDomainNetwork): string =>
  n.blocks.slice(0, 6).map(b => `"${b.blockId}" (${b.blockType})`).join(', ') + (n.blocks.length > 6 ? `, +${n.blocks.length - 6} more` : '');

export function floatingThermalReason(n: FloatingDomainNetwork): string {
  return `Floating thermal network: ${names(n)} ${n.blocks.length === 1 ? 'has' : 'have'} no Thermal Reference, Thermal Mass or Temperature Source. ` +
    'Every connected thermal network needs a temperature datum (add a Thermal Reference block, 0 K, or a Temperature Source); ' +
    'an unconnected thermal port is open (adiabatic), not fixed to an ambient temperature.';
}

export function floatingMagneticReason(n: FloatingDomainNetwork): string {
  return `Floating magnetic network: ${names(n)} ${n.blocks.length === 1 ? 'has' : 'have'} no Magnetic Reference. ` +
    'Every connected magnetic network needs a Magnetic Reference block (mmf = 0): the magnetic circuit equations only fix mmf DIFFERENCES. ' +
    'An unconnected magnetic port is open (zero flux), not grounded.';
}

