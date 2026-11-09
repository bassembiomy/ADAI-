/**
 * Drag-copy gesture shared by X-Bridges, V-Lab and OPM (right-drag and Ctrl + left-drag), one state machine:
 * idle -> pending (pressed, below the threshold) -> dragging (copies exist and follow the pointer) -> idle.
 * It holds no React state, so a state update can never lose a listener or leave a gesture half finished.
 */
import { copyBlocks, type CopyEdge, type CopyNode, type NodeShape } from './blockCopy';

export const DRAG_COPY_THRESHOLD_PX = 6;
/** How long after a drag the context menu event that follows the right-button release is still swallowed. */
const CONTEXT_MENU_GRACE_MS = 1000;

export interface DragCopyHost {
  getNodes: () => CopyNode[];
  getEdges: () => CopyEdge[];
  /** Replace nodes and edges together. */
  setGraph: (nodes: CopyNode[], edges: CopyEdge[]) => void;
  getZoom: () => number;
  /** Called once when the copies are created, before the diagram changes (undo). */
  pushHistory: () => void;
  /** Called once when the copies are dropped (save). */
  commit: () => void;
  /** Optional: tells the UI (cursor, badge) whether a copy is being dragged. */
  /** Where the canvas keeps names and nesting; X-Bridges when omitted. */
  shape?: NodeShape;
  onDraggingChange?: (dragging: boolean) => void;
}

export interface PointerDownEvent { button: number; ctrlKey?: boolean; clientX: number; clientY: number }
export interface PointerMoveEvent { clientX: number; clientY: number; buttons: number }
export interface PointerUpEvent { button?: number; clientX: number; clientY: number }

type Phase =
  | { kind: 'idle' }
  | { kind: 'pending'; nodeId: string; button: number; startX: number; startY: number }
  | {
    kind: 'dragging'; button: number; startX: number; startY: number;
    before: { nodes: CopyNode[]; edges: CopyEdge[] };
    base: Map<string, { x: number; y: number }>;
  };

export function createDragCopyController(host: DragCopyHost) {
  let phase: Phase = { kind: 'idle' };
  let swallowContextMenuUntil = 0;

  const setPhase = (next: Phase) => {
    const wasDragging = phase.kind === 'dragging';
    phase = next;
    const isDragging = next.kind === 'dragging';
    if (wasDragging !== isDragging) host.onDraggingChange?.(isDragging);
  };

  const place = (clientX: number, clientY: number) => {
    if (phase.kind !== 'dragging') return;
    const zoom = host.getZoom() || 1;
    const dx = (clientX - phase.startX) / zoom;
    const dy = (clientY - phase.startY) / zoom;
    const base = phase.base;
    host.setGraph(
      host.getNodes().map((n) => {
        const origin = base.get(n.id);
        return origin ? { ...n, position: { x: origin.x + dx, y: origin.y + dy } } : n;
      }),
      host.getEdges(),
    );
  };

  const startDragging = (p: Extract<Phase, { kind: 'pending' }>) => {
    const nodes = host.getNodes();
    const edges = host.getEdges();
    const source = nodes.find((n) => n.id === p.nodeId);
    if (!source) { setPhase({ kind: 'idle' }); return false; }
    const ids = source.selected ? nodes.filter((n) => n.selected).map((n) => n.id) : [p.nodeId];
    host.pushHistory();
    const result = copyBlocks(nodes, edges, ids, { offset: { x: 0, y: 0 }, shape: host.shape });
    const base = new Map<string, { x: number; y: number }>();
    for (const n of result.nodes) if (n.selected) base.set(n.id, { ...n.position });
    setPhase({ kind: 'dragging', button: p.button, startX: p.startX, startY: p.startY, before: { nodes, edges }, base });
    host.setGraph(
      [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...result.nodes],
      [...edges, ...result.edges],
    );
    return true;
  };

  const drop = (clientX: number, clientY: number, button: number) => {
    if (phase.kind !== 'dragging') return;
    place(clientX, clientY);
    if (button === 2) swallowContextMenuUntil = Date.now() + CONTEXT_MENU_GRACE_MS;
    setPhase({ kind: 'idle' });
    host.commit();
  };

  return {
    isActive: () => phase.kind !== 'idle',
    isDragging: () => phase.kind === 'dragging',

    /** Returns true when the press starts a copy gesture; the caller then stops the event. */
    pointerDown(e: PointerDownEvent, nodeId: string): boolean {
      if (phase.kind !== 'idle') return false;
      const isRight = e.button === 2;
      const isCtrlLeft = e.button === 0 && !!e.ctrlKey;
      if (!isRight && !isCtrlLeft) return false;
      if (!host.getNodes().some((n) => n.id === nodeId)) return false;
      swallowContextMenuUntil = 0;
      setPhase({ kind: 'pending', nodeId, button: e.button, startX: e.clientX, startY: e.clientY });
      return true;
    },

    pointerMove(e: PointerMoveEvent) {
      if (phase.kind === 'idle') return;
      if (phase.kind === 'pending') {
        if (e.buttons === 0) { setPhase({ kind: 'idle' }); return; }
        if (Math.hypot(e.clientX - phase.startX, e.clientY - phase.startY) < DRAG_COPY_THRESHOLD_PX) return;
        if (!startDragging(phase)) return;
        place(e.clientX, e.clientY);
        return;
      }
      if (e.buttons === 0) { drop(e.clientX, e.clientY, phase.button); return; }
      place(e.clientX, e.clientY);
    },

    pointerUp(e: PointerUpEvent) {
      if (phase.kind === 'idle') return;
      if (e.button !== undefined && e.button !== phase.button) return;
      if (phase.kind === 'pending') { setPhase({ kind: 'idle' }); return; }
      drop(e.clientX, e.clientY, phase.button);
    },

    /** Returns true when Escape cancelled a gesture. */
    keyDown(e: { key: string }): boolean {
      if (e.key !== 'Escape' || phase.kind === 'idle') return false;
      if (phase.kind === 'dragging') {
        const { nodes, edges } = phase.before;
        if (phase.button === 2) swallowContextMenuUntil = Date.now() + CONTEXT_MENU_GRACE_MS;
        setPhase({ kind: 'idle' });
        host.setGraph(nodes, edges);
      } else {
        setPhase({ kind: 'idle' });
      }
      return true;
    },

    /** True when a context menu event must be swallowed (gesture running, or just ended). */
    contextMenu(): boolean {
      if (phase.kind !== 'idle') return true;
      if (swallowContextMenuUntil > 0) {
        const swallow = Date.now() <= swallowContextMenuUntil;
        swallowContextMenuUntil = 0;
        return swallow;
      }
      return false;
    },
  };
}

export type DragCopyController = ReturnType<typeof createDragCopyController>;
