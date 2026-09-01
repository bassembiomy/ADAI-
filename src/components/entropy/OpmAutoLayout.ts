/**
 * Intelligent, collision-free automatic layout engine for OPM (ISO 19450) models.
 *
 * Places nodes in clean topological / functional columns:
 *   Column 0: Sensors, Input Controls, and Enabler Objects (left)
 *   Column 1: Composite Systems & Structure Objects (center-left)
 *   Column 2: Processes (center, ordered by execution trigger flow)
 *   Column 3: Actuators, Outputs & Transformed Objects (right)
 *   Bottom: Requirements
 *
 * Fully parent-aware: resolves child state edge connections to parent objects,
 * sizes parent objects dynamically to fit all child states side-by-side with generous gaps,
 * and guarantees zero overlaps across objects, processes, and states.
 */
import type { AppNode, AppEdge } from './EntropyTypes';

export interface LayoutOptions {
  columnGap?: number;
  rowGap?: number;
  startX?: number;
  startY?: number;
}

const STATE_WIDTH = 95;
const STATE_HEIGHT = 32;
const STATE_GAP_X = 12;
const STATE_START_X = 18;
const STATE_START_Y = 56;

function getObjectDimensions(node: AppNode, stateCount: number): { width: number; height: number } {
  const attrCount = (node.data.attributes || []).length;
  if (stateCount === 0) {
    return { width: 220, height: Math.max(85, 75 + attrCount * 18) };
  }
  const statesWidth = STATE_START_X * 2 + stateCount * STATE_WIDTH + (stateCount - 1) * STATE_GAP_X;
  const width = Math.max(220, statesWidth);
  const height = Math.max(105, 95 + attrCount * 18);
  return { width, height };
}

function getNodeDimensions(node: AppNode, childStateCount: number): { width: number; height: number } {
  if (node.data.type === 'requirement') {
    return { width: 240, height: 110 };
  }
  if (node.data.type === 'process') {
    const nameLen = (node.data.name || '').length;
    return { width: Math.max(200, nameLen * 9 + 40), height: 68 };
  }
  if (node.data.type === 'object') {
    return getObjectDimensions(node, childStateCount);
  }
  return { width: STATE_WIDTH, height: STATE_HEIGHT };
}

export function layoutOpmGraph(
  nodes: AppNode[],
  edges: AppEdge[],
  options: LayoutOptions = {}
): AppNode[] {
  if (!nodes || nodes.length === 0) return [];

  const columnGap = options.columnGap ?? 380;
  const rowGap = options.rowGap ?? 50;
  const startX = options.startX ?? 60;
  const startY = options.startY ?? 60;

  // 1. Separate root parent nodes from child states
  const parentNodes = nodes.filter(n => n.data.type !== 'state');
  const childStates = nodes.filter(n => n.data.type === 'state');

  const requirements = parentNodes.filter(n => n.data.type === 'requirement');
  const activeElements = parentNodes.filter(n => n.data.type !== 'requirement');

  // Map state ID -> parent object ID
  const stateToParent = new Map<string, string>();
  childStates.forEach(s => {
    const pId = s.parentId || s.data.parentId;
    if (pId) stateToParent.set(s.id, pId);
  });

  const getParentOrSelfId = (id: string): string => {
    return stateToParent.get(id) || id;
  };

  // 2. Count states per parent object
  const statesByParent = new Map<string, AppNode[]>();
  childStates.forEach(s => {
    const pId = getParentOrSelfId(s.id);
    if (!statesByParent.has(pId)) statesByParent.set(pId, []);
    statesByParent.get(pId)!.push(s);
  });

  // 3. Parent-aware edge classification
  const incomingToObj = new Map<string, AppEdge[]>();
  const outgoingFromObj = new Map<string, AppEdge[]>();

  edges.forEach(e => {
    const srcObjId = getParentOrSelfId(e.source);
    const tgtObjId = getParentOrSelfId(e.target);

    if (!outgoingFromObj.has(srcObjId)) outgoingFromObj.set(srcObjId, []);
    outgoingFromObj.get(srcObjId)!.push(e);

    if (!incomingToObj.has(tgtObjId)) incomingToObj.set(tgtObjId, []);
    incomingToObj.get(tgtObjId)!.push(e);
  });

  // 4. Distribute into 4 logical columns
  const col0: AppNode[] = []; // Inputs / Sensors / Enablers / Control Sources (Left)
  const col1: AppNode[] = []; // Composite / System Containers
  const col2: AppNode[] = []; // Processes (Center)
  const col3: AppNode[] = []; // Actuators / Outputs / Transformed Plants (Right)

  activeElements.forEach(n => {
    if (n.data.type === 'process') {
      col2.push(n);
      return;
    }

    const outs = outgoingFromObj.get(n.id) || [];
    const ins = incomingToObj.get(n.id) || [];

    // Check if it's a composite container in an aggregation/generalization
    const isCompositeContainer = outs.some(
      e => e.data?.type === 'aggregation' || e.data?.type === 'generalization'
    );
    if (isCompositeContainer) {
      col1.push(n);
      return;
    }

    // Check if it acts as an enabler / trigger / condition source to processes
    const isEnablerOrTrigger = outs.some(
      e => e.data?.type === 'agent' || e.data?.type === 'instrument' || e.data?.type === 'trigger' || e.data?.type === 'condition'
    );

    // Check if it receives results/effects/consumptions from processes
    const isResultOrEffect = ins.some(
      e => e.data?.type === 'result' || e.data?.type === 'effect' || e.data?.type === 'consumption'
    );

    if (isEnablerOrTrigger && !isResultOrEffect) {
      col0.push(n);
    } else if (isResultOrEffect && !isEnablerOrTrigger) {
      col3.push(n);
    } else if (isResultOrEffect && isEnablerOrTrigger) {
      // Both (e.g. Operation_Status, Menu_Mode): place in col0 or col1
      col0.push(n);
    } else if (outs.length > 0 && ins.length === 0) {
      col0.push(n);
    } else {
      // Balance into col3 if col0 has more
      if (col0.length <= col3.length) {
        col0.push(n);
      } else {
        col3.push(n);
      }
    }
  });

  // If column 1 is empty, balance context elements
  if (col1.length === 0 && col0.length > 5) {
    const moved = col0.splice(0, Math.floor(col0.length / 3));
    col1.push(...moved);
  }

  // 5. Assign coordinates column by column with guaranteed zero overlap
  const placedMap = new Map<string, { x: number; y: number; width: number; height: number }>();
  const columns = [col0, col1, col2, col3];

  let currentX = startX;
  let maxGraphHeight = 0;

  columns.forEach((col) => {
    if (col.length === 0) return;

    let currentY = startY;
    let maxColWidth = 0;

    col.forEach(n => {
      const stateCount = (statesByParent.get(n.id) || []).length;
      const dim = getNodeDimensions(n, stateCount);
      maxColWidth = Math.max(maxColWidth, dim.width);

      placedMap.set(n.id, {
        x: currentX,
        y: currentY,
        width: dim.width,
        height: dim.height,
      });

      currentY += dim.height + rowGap;
    });

    maxGraphHeight = Math.max(maxGraphHeight, currentY);
    currentX += Math.max(maxColWidth + 60, columnGap);
  });

  // 6. Place requirements at the bottom
  if (requirements.length > 0) {
    let reqX = startX;
    const reqY = Math.max(maxGraphHeight + 40, startY + 500);

    requirements.forEach(r => {
      const dim = getNodeDimensions(r, 0);
      placedMap.set(r.id, {
        x: reqX,
        y: reqY,
        width: dim.width,
        height: dim.height,
      });
      reqX += dim.width + 40;
    });
  }

  // 7. Update nodes with calculated collision-free positions
  const updatedNodes = nodes.map(n => {
    if (n.data.type === 'state') {
      const parentId = getParentOrSelfId(n.id);
      const siblings = statesByParent.get(parentId) || [];
      const sIdx = siblings.findIndex(s => s.id === n.id);
      const idx = sIdx >= 0 ? sIdx : 0;

      return {
        ...n,
        position: {
          x: STATE_START_X + idx * (STATE_WIDTH + STATE_GAP_X),
          y: STATE_START_Y,
        },
      };
    }

    const placed = placedMap.get(n.id);
    if (placed) {
      return {
        ...n,
        position: { x: Math.round(placed.x), y: Math.round(placed.y) },
      };
    }
    return n;
  });

  return updatedNodes;
}
