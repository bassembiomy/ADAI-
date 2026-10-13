/**
 * Explicit mechanical-reference semantics (WP-13, F-064 rest; the mechanical twin of vlabElectricalReference.ts).
 *
 * Simscape: a Rotational / Translational conserving port that is left unconnected is OPEN (zero through torque / force);
 * only a Mechanical Rotational / Translational Reference block defines the zero-speed inertial frame. The V-Lab assembler
 * used to pin ANY unconnected port named c / b / n / ref / gnd to zero speed by name, which silently turned the open end
 * of a spring, damper or source into a fixed wall.
 *
 * What replaces the name rule:
 *  1. MECHANICAL_REFERENCE_BLOCKS (rot_ref, trans_ref) are the only blocks that define zero speed for a net they are wired to.
 *  2. INTERNAL_MECHANICAL_REFERENCE_PORTS: a block whose model needs an internal reference BY DESIGN declares the port that is
 *     tied to the inertial frame when it is left open. Empty by design: no Simscape Foundation mechanical block has an
 *     implicit case (the electrical machines carry the frame inside their own equations, INTERNAL_MECHANICAL_REFERENCE).
 *  3. ABSOLUTE_MOTION_BLOCKS: blocks whose equation fixes the absolute speed of the node they sit on (an inertia or a mass
 *     integrates the absolute speed, a machine rotor and the Multibody interfaces are tied to a frame).
 *  4. findFloatingMechanicalNetworks: a connected mechanical network that has none of the above is common-mode
 *     indeterminate (every equation depends only on speed DIFFERENCES) and is reported with a clear diagnostic.
 *  5. findOpenSourcePorts: an ideal torque / force source with an open port cannot deliver its through variable
 *     (KCL at the open node forces it to zero) and is reported by name.
 */
import { INTERNAL_MECHANICAL_REFERENCE } from './vlabElectricalReference';

export const MECHANICAL_REFERENCE_BLOCKS: ReadonlySet<string> = new Set(['rot_ref', 'trans_ref']);

/** block type -> mechanical ports that the block itself ties to the inertial frame when they are unconnected. */
export const INTERNAL_MECHANICAL_REFERENCE_PORTS: Readonly<Record<string, readonly string[]>> = {
  // Empty by design (WP-13). Add `type: ['port']` here, with a comment naming the model reason, if a block really needs one.
};

export function isInternalMechanicalReferencePort(blockType: string, portId: string): boolean {
  return (INTERNAL_MECHANICAL_REFERENCE_PORTS[blockType] ?? []).includes(portId);
}

export const isMechanicalDomain = (domain: string | undefined): boolean => {
  const d = (domain ?? '').toLowerCase();
  return d === 'rotational' || d === 'translational';
};

/** Blocks whose own equation fixes the absolute speed of their node, so a network that contains one is not floating. */
export const ABSOLUTE_MOTION_BLOCKS: ReadonlySet<string> = new Set([
  'inertia', 'mass',
  // single-ended loads and ratio blocks that tie the ABSOLUTE speeds of their ports (w1 = ratio w2, v = r w, ...)
  'washing_basket', 'washing_fluid', 'gear_box', 'common_gear', 'rack_pinion', 'wheel_axle',
  ...Object.keys(INTERNAL_MECHANICAL_REFERENCE),
  'rot_multibody_interface', 'trans_multibody_interface',
]);

/** Ideal sources whose through variable has to go somewhere: an open port is an inconsistent model (F = 0 at an open node). */
export const THROUGH_SOURCE_BLOCKS: ReadonlySet<string> = new Set(['torque_source', 'force_source']);

export interface MechanicalBlockNets {
  blockId: string;
  blockType: string;
  /** union-find roots of the block's mechanical ports (all the ports of one block count as one network: conservative) */
  roots: string[];
}

export interface FloatingMechanicalNetwork {
  blocks: { blockId: string; blockType: string }[];
}

export function findFloatingMechanicalNetworks(
  blocks: MechanicalBlockNets[],
  referenceRoots: ReadonlySet<string>,
): FloatingMechanicalNetwork[] {
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
    if (ABSOLUTE_MOTION_BLOCKS.has(b.blockType) || MECHANICAL_REFERENCE_BLOCKS.has(b.blockType)) g.referenced = true;
    if (b.roots.some(r => referenceRoots.has(r))) g.referenced = true;
    groups.set(key, g);
  }
  // a lone single-block network has no through element to be indeterminate (nothing to report)
  return [...groups.values()].filter(g => !g.referenced && g.blocks.length > 1).map(g => ({ blocks: g.blocks }));
}

export function floatingMechanicalReason(n: FloatingMechanicalNetwork): string {
  const names = n.blocks.slice(0, 6).map(b => `"${b.blockId}" (${b.blockType})`).join(', ') + (n.blocks.length > 6 ? `, +${n.blocks.length - 6} more` : '');
  return `Floating mechanical network: ${names} ${n.blocks.length === 1 ? 'has' : 'have'} no Mechanical Rotational / Translational Reference and no inertia or mass. ` +
    'Every connected mechanical network needs a reference (add a Mechanical Rotational Reference or Mechanical Translational Reference block); ' +
    'an unconnected mechanical port is open, not fixed to the frame.';
}

/**
 * Ports of an ideal torque / force source that are open (the net holds that single port and is not a reference).
 * `ports[i].netSize` is the number of block ports on the port's net.
 */
export function findOpenSourcePorts(
  ports: { blockId: string; blockType: string; portId: string; netSize: number; referenced: boolean }[],
): { blockId: string; blockType: string; portId: string }[] {
  return ports
    .filter(p => THROUGH_SOURCE_BLOCKS.has(p.blockType) && p.netSize === 1 && !p.referenced)
    .map(({ blockId, blockType, portId }) => ({ blockId, blockType, portId }));
}

export function openSourcePortReason(p: { blockId: string; blockType: string; portId: string }): string {
  const what = p.blockType === 'torque_source' ? 'torque' : 'force';
  const ref = p.blockType === 'torque_source' ? 'Mechanical Rotational Reference' : 'Mechanical Translational Reference';
  return `Block "${p.blockId}" (${p.blockType}): port ${p.portId.toUpperCase()} is unconnected (open), so the ideal ${what} source has nowhere to ` +
    `deliver its ${what}: the through variable of an open mechanical port is zero. Connect port ${p.portId.toUpperCase()} to the mechanical network ` +
    `or to a ${ref}.`;
}
