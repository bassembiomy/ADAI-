/**
 * Explicit electrical-reference semantics (WP-10, F-064).
 *
 * Simscape: an Electrical conserving port that is left unconnected is OPEN (zero through current); only an
 * Electrical Reference block (ee_lib / fl_lib "Electrical Reference") defines 0 V, and every connected electrical
 * network needs one. The V-Lab assembler used to pin ANY unconnected port named b / c / n / ref / gnd to ground by name,
 * which silently shorted e.g. the open terminal of a resistor or a capacitor to 0 V.
 *
 * What replaces the name rule:
 *  1. ELECTRICAL_REFERENCE_BLOCKS: the only blocks that define ground for a net they are wired to.
 *  2. INTERNAL_REFERENCE_PORTS: a block whose model needs an internal reference BY DESIGN declares the ports that are tied
 *     to ground when they are left open (a documented, per-block, per-port exception; nothing is inferred from a name).
 *  3. IMPLICIT_ABSOLUTE_POTENTIAL_BLOCKS: blocks whose equation fixes an absolute node potential (an output measured
 *     against the model ground, e.g. the op-amp output), so the electrical network they sit in is not floating.
 *  4. findFloatingElectricalNetworks (below, used by the assembler): a connected electrical network without any of the above is
 *     reported with a clear diagnostic instead of being silently grounded.
 */

/** Blocks that define the 0 V reference of the net they are wired to. */
export const ELECTRICAL_REFERENCE_BLOCKS: ReadonlySet<string> = new Set(['ground', 'delta_ref']);

/**
 * block type -> conserving ports that the block itself ties to the model ground when they are unconnected
 * (an internal reference declared by the block's model, e.g. an implicit star point of a machine model).
 */
export const INTERNAL_REFERENCE_PORTS: Readonly<Record<string, readonly string[]>> = {
  // Empty by design (WP-10): the full V-Lab suite needs no internal reference. A machine neutral without a through variable
  // (ac_motor.n, pmsm.n) is an isolated node held at 0 V by the node row itself, not by a name rule. Add `type: ['port']`
  // here, with a comment naming the model reason, when a block really needs one.
};

/**
 * Blocks whose equations fix an absolute node potential relative to the model ground (V_out = f(...) with no return
 * terminal). A network containing one of them is determined and therefore not floating.
 */
export const IMPLICIT_ABSOLUTE_POTENTIAL_BLOCKS: ReadonlySet<string> = new Set([
  'opamp', 'three_phase_source',
]);

export function isInternalReferencePort(blockType: string, portId: string): boolean {
  return (INTERNAL_REFERENCE_PORTS[blockType] ?? []).includes(portId);
}

/** One connected electrical network that nothing defines a reference potential for. */
export interface FloatingElectricalNetwork {
  blocks: { blockId: string; blockType: string }[];
}

/**
 * Connected electrical networks (blocks joined through shared nets; all conserving electrical ports of one block are
 * treated as one network, which is conservative for galvanically isolated parts) that contain no ground, no
 * internally grounded open port and no block with an implicit absolute potential.
 * `electricalBlocks[i].roots` are the union-find roots of the block's electrical ports; `referenceRoots` are the nets
 * pinned to 0 V (reference blocks and INTERNAL_REFERENCE_PORTS).
 */
export function findFloatingElectricalNetworks(
  electricalBlocks: { blockId: string; blockType: string; roots: string[] }[],
  referenceRoots: ReadonlySet<string>,
): FloatingElectricalNetwork[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    if (!parent.has(a)) parent.set(a, a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  for (const b of electricalBlocks) {
    if (b.roots.length === 0) continue;
    const head = find(b.roots[0]);
    for (const r of b.roots.slice(1)) parent.set(find(r), head);
  }
  const groups = new Map<string, { blocks: { blockId: string; blockType: string }[]; referenced: boolean }>();
  for (const b of electricalBlocks) {
    if (b.roots.length === 0) continue;
    const key = find(b.roots[0]);
    const g = groups.get(key) ?? { blocks: [], referenced: false };
    g.blocks.push({ blockId: b.blockId, blockType: b.blockType });
    if (IMPLICIT_ABSOLUTE_POTENTIAL_BLOCKS.has(b.blockType) || ELECTRICAL_REFERENCE_BLOCKS.has(b.blockType)) g.referenced = true;
    if (b.roots.some(r => referenceRoots.has(r))) g.referenced = true;
    groups.set(key, g);
  }
  return [...groups.values()].filter(g => !g.referenced).map(g => ({ blocks: g.blocks }));
}

export function floatingNetworkReason(n: FloatingElectricalNetwork): string {
  const names = n.blocks.slice(0, 6).map(b => `"${b.blockId}" (${b.blockType})`).join(', ') + (n.blocks.length > 6 ? `, +${n.blocks.length - 6} more` : '');
  return `Floating electrical network: ${names} ${n.blocks.length === 1 ? 'has' : 'have'} no Electrical Reference. ` +
    'Every connected electrical network needs a ground (add an Electrical Reference block); an unconnected electrical port is open, not grounded.';
}
