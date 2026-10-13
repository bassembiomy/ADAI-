import { BLOCK_DIMENSIONS, DEFAULT_DIMENSIONS } from './blockDimensions';
import { libraryBlock } from '../../engine/vlab/vlabConnectionRules';

/**
 * The symbol key a block is drawn with: the library `icon`, exactly what the palette tile draws (an instance copy's own icon only for
 * a block the library does not know). A node drawn by its block id would show a generic labelled box instead of the palette symbol.
 */
export function symbolTypeOf(blockType: string, instanceIcon?: string): string {
  return libraryBlock(blockType)?.icon ?? instanceIcon ?? blockType;
}

/** Box of a block: the dimensions of its symbol key (as the palette sizes it), else those registered under the block id. */
export function blockBox(blockType: string, instanceIcon?: string) {
  return BLOCK_DIMENSIONS[symbolTypeOf(blockType, instanceIcon)] ?? BLOCK_DIMENSIONS[blockType] ?? DEFAULT_DIMENSIONS;
}

export const HANDLE_SIZE = 12;
export const PORT_PITCH = 20;

export interface PortSlot {
  id: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  /** distance of the port centre from the middle of its side, in px */
  offset: number;
  /** centre of the handle in the unrotated block box, in px */
  x: number;
  y: number;
}

export interface NodeLayout {
  width: number;
  height: number;
  slots: Map<string, PortSlot>;
}

/**
 * Where each port of a block sits: on the side named by its `pos`, spread symmetrically with PORT_PITCH between neighbours.
 * The box grows with the number of ports on a side (blockDimensions is the minimum), so two handles never overlap.
 */
export function computeNodeLayout(blockType: string, ports: { id: string; pos?: string; position?: string }[], instanceIcon?: string): NodeLayout {
  const bySide: Record<string, { id: string }[]> = {};
  for (const port of ports) {
    if (!port) continue;
    const side = port.pos || port.position || 'left';
    (bySide[side] ||= []).push(port);
  }
  const base = blockBox(blockType, instanceIcon);
  const maxVertical = Math.max(bySide.left?.length || 0, bySide.right?.length || 0, 1);
  const maxHorizontal = Math.max(bySide.top?.length || 0, bySide.bottom?.length || 0, 1);
  const height = Math.max(base.height, maxVertical * PORT_PITCH + 10);
  const width = Math.max(base.width, maxHorizontal * PORT_PITCH + 10);
  const slots = new Map<string, PortSlot>();
  for (const [side, list] of Object.entries(bySide)) {
    list.forEach((port, index) => {
      const offset = list.length > 1 ? (index - (list.length - 1) / 2) * PORT_PITCH : 0;
      const s = (['left', 'right', 'top', 'bottom'].includes(side) ? side : 'left') as PortSlot['side'];
      const horizontalSide = s === 'top' || s === 'bottom';
      slots.set(port.id, {
        id: port.id, side: s, offset,
        x: horizontalSide ? width / 2 + offset : (s === 'left' ? 0 : width),
        y: horizontalSide ? (s === 'top' ? 0 : height) : height / 2 + offset,
      });
    });
  }
  return { width, height, slots };
}

/** True when two handle squares overlap. */
export const handlesOverlap = (a: PortSlot, b: PortSlot): boolean =>
  Math.abs(a.x - b.x) < HANDLE_SIZE && Math.abs(a.y - b.y) < HANDLE_SIZE;
