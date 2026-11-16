import type { Edge, Node } from '@xyflow/react';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';

/**
 * The run model of the canvas: every node is rebuilt through BLOCK_LIBRARY (live execute(), fresh state on Play), keeping
 * its parentId (subsystem membership, from the node data or the node itself) so the live Inport overrides reach top-level
 * Inports only (XBV-039). Used by the main-thread run and the worker run alike.
 */
export function buildCanvasRunModel(nodes: Node[], edges: Edge[]) {
  return {
    blocks: nodes.map(n => {
      const d = n.data as any;
      const parentId = d.parentId ?? (n as { parentId?: string }).parentId;
      const withParent = (block: any): any => (parentId !== undefined && block.parentId === undefined
        ? { ...block, parentId }
        : block);
      // Try to rebuild via BLOCK_LIBRARY to get live execute() function
      if (BLOCK_LIBRARY[d.type]) {
        try {
          const freshParams = { ...d.params };
          if (d.type === 'FUZZY_SURFACE_VIEWER' && typeof d.params.fisConfig === 'string') {
            const targetNode = nodes.find(x => x.id === d.params.fisConfig);
            if (targetNode && targetNode.data.type === 'FUZZY_INFERENCE_SYSTEM') {
              freshParams.fisConfig = targetNode.data.params;
            } else {
              freshParams.fisConfig = null;
            }
          }
          const freshBlock = BLOCK_LIBRARY[d.type](d.id, freshParams || {});
          // Always start with fresh state on Play - never resume trained/stale state
          return withParent({ ...freshBlock, id: d.id, state: freshBlock.state, params: { ...freshParams, ...freshBlock.params } });
        } catch (e) {
          return withParent(d); // fallback to raw data if rebuild fails
        }
      }
      return withParent(d);
    }),
    connections: edges.map(e => ({
      sourceBlock: e.source, sourcePort: e.sourceHandle!, targetBlock: e.target, targetPort: e.targetHandle!
    })),
  };
}
