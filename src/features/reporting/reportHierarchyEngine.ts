import type { BlockData, PartData, ConnectorData, RelationshipData } from '../../types/sysml_types';
import type { StateData, Layer, TransitionData, JunctionData } from '../../types/sm_types';
import { escapeHtml } from './reportDiagramModel';
import { renderBddDiagram, renderIbdDiagram, renderStateMachineDiagrams } from './reportDiagrams';

export interface HierarchySourceModel {
  blocks: readonly BlockData[];
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
  relationships: readonly RelationshipData[];
  states: readonly StateData[];
  layers: readonly Layer[];
  transitions: readonly TransitionData[];
  junctions: readonly JunctionData[];
}

export interface HierarchyLayerInfo {
  layerId: string;
  type: 'bdd' | 'ibd' | 'statemachine' | 'req';
  title: string;
  elementCount: number;
  connectionCount: number;
}

export class ReportHierarchyRegistry {
  private childLayerMap = new Map<string, HierarchyLayerInfo>();
  public layers = new Map<string, { title: string; type: string; svgContent?: string }>();

  public registerChildLayer(nodeId: string, info: HierarchyLayerInfo) {
    this.childLayerMap.set(nodeId, info);
    this.layers.set(info.layerId, { title: info.title, type: info.type });
  }

  public hasChildLayer(nodeId: string): boolean {
    return this.childLayerMap.has(nodeId);
  }

  public getChildLayerType(nodeId: string): ('bdd' | 'ibd' | 'statemachine' | 'req') | undefined {
    return this.childLayerMap.get(nodeId)?.type;
  }

  public getChildLayerId(nodeId: string): string | undefined {
    return this.childLayerMap.get(nodeId)?.layerId;
  }

  public getChildLayerInfo(nodeId: string): HierarchyLayerInfo | undefined {
    return this.childLayerMap.get(nodeId);
  }
}

export function buildReportHierarchy(model: HierarchySourceModel): ReportHierarchyRegistry {
  const registry = new ReportHierarchyRegistry();

  // 1. Map BDD Blocks with IBD Parts or Ports to their IBD Context Layer
  for (const block of model.blocks) {
    if (block.stereotype === 'requirement') continue;
    const blockParts = model.parts.filter(p => p.blockId === block.id);
    const blockConnectors = model.connectors.filter(c => {
      const s = model.parts.find(p => p.id === c.sourcePartId);
      const t = model.parts.find(p => p.id === c.targetPartId);
      return (s && s.blockId === block.id) || (t && t.blockId === block.id);
    });

    if (blockParts.length > 0) {
      registry.registerChildLayer(block.id, {
        layerId: `ibd-${block.id}`,
        type: 'ibd',
        title: `IBD · ${block.name}`,
        elementCount: blockParts.length,
        connectionCount: blockConnectors.length,
      });
    }
  }

  // 2. Map IBD Parts with Nested Sub-Parts to their Sub-IBD Layer
  for (const part of model.parts) {
    if (!part.typeId) continue;
    const typeBlock = model.blocks.find(b => b.id === part.typeId);
    const subParts = model.parts.filter(p => p.blockId === part.typeId);
    const subConnectors = model.connectors.filter(c => {
      const s = model.parts.find(p => p.id === c.sourcePartId);
      const t = model.parts.find(p => p.id === c.targetPartId);
      return (s && s.blockId === part.typeId) || (t && t.blockId === part.typeId);
    });

    if (subParts.length > 0 && typeBlock) {
      registry.registerChildLayer(part.id, {
        layerId: `ibd-${typeBlock.id}`,
        type: 'ibd',
        title: `Internal Sub-Structure · ${part.name} (${typeBlock.name})`,
        elementCount: subParts.length,
        connectionCount: subConnectors.length,
      });
    }
  }

  // 3. Map States with Child Sub-States to their Sub-State Machine Layer
  for (const state of model.states) {
    const childLayer = model.layers.find(l => l.parentStateId === state.id);
    const childStates = model.states.filter(s => childLayer ? childLayer.stateIds.includes(s.id) : (state.children ?? []).includes(s.id));
    const childTransitions = model.transitions.filter(t => childLayer ? childLayer.transitionIds.includes(t.id) : false);

    if (childLayer || childStates.length > 0) {
      const layerId = childLayer ? `sm-${childLayer.id}` : `sm-sub-${state.id}`;
      registry.registerChildLayer(state.id, {
        layerId,
        type: 'statemachine',
        title: `State Machine · ${state.name} Sub-States`,
        elementCount: childStates.length,
        connectionCount: childTransitions.length,
      });
    }
  }

  return registry;
}

export function generateDiagramScript(registry: ReportHierarchyRegistry): string {
  return `
    <script>
      (function() {
        window.ADIA_DIAGRAM_NAV = {
          registry: {},
          state: {},

          initContainer(diagId, rootLayerId, rootTitle) {
            this.state[diagId] = {
              history: [{ layerId: rootLayerId, title: rootTitle }],
              zoom: 1,
              panX: 0,
              panY: 0
            };
            this.updateBreadcrumbs(diagId);
          },

          drillDown(diagId, targetLayerId, targetTitle) {
            const containerState = this.state[diagId];
            if (!containerState) return;

            const targetEl = document.getElementById('layer-' + targetLayerId);
            if (!targetEl) return;

            // Hide all layers in this container
            const container = document.getElementById(diagId);
            if (!container) return;
            const allLayers = container.querySelectorAll('.diagram-layer-view');
            allLayers.forEach(el => el.style.display = 'none');

            // Show target layer with smooth fade
            targetEl.style.display = 'block';
            targetEl.style.opacity = '0';
            setTimeout(() => {
              targetEl.style.transition = 'opacity 0.2s ease-in-out';
              targetEl.style.opacity = '1';
            }, 10);

            containerState.history.push({ layerId: targetLayerId, title: targetTitle });
            containerState.zoom = 1;
            containerState.panX = 0;
            containerState.panY = 0;
            this.updateBreadcrumbs(diagId);
            this.updateTransform(diagId);
          },

          navBack(diagId) {
            const containerState = this.state[diagId];
            if (!containerState || containerState.history.length <= 1) return;

            containerState.history.pop();
            const current = containerState.history[containerState.history.length - 1];

            const container = document.getElementById(diagId);
            if (!container) return;
            const allLayers = container.querySelectorAll('.diagram-layer-view');
            allLayers.forEach(el => el.style.display = 'none');

            const activeEl = document.getElementById('layer-' + current.layerId);
            if (activeEl) {
              activeEl.style.display = 'block';
              activeEl.style.opacity = '1';
            }

            this.updateBreadcrumbs(diagId);
            this.updateTransform(diagId);
          },

          navJump(diagId, index) {
            const containerState = this.state[diagId];
            if (!containerState || index < 0 || index >= containerState.history.length) return;

            containerState.history = containerState.history.slice(0, index + 1);
            const current = containerState.history[containerState.history.length - 1];

            const container = document.getElementById(diagId);
            if (!container) return;
            const allLayers = container.querySelectorAll('.diagram-layer-view');
            allLayers.forEach(el => el.style.display = 'none');

            const activeEl = document.getElementById('layer-' + current.layerId);
            if (activeEl) {
              activeEl.style.display = 'block';
              activeEl.style.opacity = '1';
            }

            this.updateBreadcrumbs(diagId);
            this.updateTransform(diagId);
          },

          updateBreadcrumbs(diagId) {
            const containerState = this.state[diagId];
            const bcContainer = document.getElementById('bc-' + diagId);
            if (!containerState || !bcContainer) return;

            const canBack = containerState.history.length > 1;
            let html = '';
            if (canBack) {
              html += '<button class="diagram-back-btn" onclick="window.ADIA_DIAGRAM_NAV.navBack(\\'' + diagId + '\\')">⬅ Back</button>';
            }

            containerState.history.forEach((crumb, idx) => {
              const isLast = idx === containerState.history.length - 1;
              if (idx > 0) html += '<span class="crumb-sep">/</span>';
              if (isLast) {
                html += '<span class="crumb active">' + crumb.title + '</span>';
              } else {
                html += '<span class="crumb" onclick="window.ADIA_DIAGRAM_NAV.navJump(\\'' + diagId + '\\', ' + idx + ')">' + crumb.title + '</span>';
              }
            });

            bcContainer.innerHTML = html;
          },

          zoom(diagId, factor) {
            const s = this.state[diagId];
            if (!s) return;
            s.zoom = Math.max(0.2, Math.min(5, s.zoom * factor));
            this.updateTransform(diagId);
          },

          zoomDiagram(diagId, factor) {
            this.zoom(diagId, factor);
          },

          resetDiagramZoom(diagId) {
            this.resetZoom(diagId);
          },

          resetZoom(diagId) {
            const s = this.state[diagId];
            if (!s) return;
            s.zoom = 1;
            s.panX = 0;
            s.panY = 0;
            this.updateTransform(diagId);
          },

          updateTransform(diagId) {
            const container = document.getElementById(diagId);
            if (!container) return;
            const svgs = container.querySelectorAll('svg');
            const s = this.state[diagId] || { zoom: 1, panX: 0, panY: 0 };
            svgs.forEach(svg => {
              svg.style.transform = 'scale(' + s.zoom + ')';
              svg.style.transformOrigin = 'top center';
            });
          }
        };
      })();
    </script>
  `;
}

export function renderInteractiveDiagramHierarchy(
  model: HierarchySourceModel,
  options?: { containerId?: string; title?: string },
): string {
  const containerId = options?.containerId ?? 'adia-diagram-hierarchy';
  const title = options?.title ?? 'System Architecture';
  const registry = buildReportHierarchy(model);

  // 1. Render root BDD
  const rootBddSvg = renderBddDiagram({
    blocks: model.blocks,
    relationships: model.relationships,
    parts: model.parts,
    containerId,
  });

  const layerViews: string[] = [];

  // 2. Render each IBD layer for blocks with parts
  for (const block of model.blocks) {
    if (block.stereotype === 'requirement') continue;
    const blockParts = model.parts.filter(p => p.blockId === block.id);
    if (blockParts.length === 0) continue;

    const blockConnectors = model.connectors.filter(c => {
      const s = model.parts.find(p => p.id === c.sourcePartId);
      const t = model.parts.find(p => p.id === c.targetPartId);
      return (s && s.blockId === block.id) || (t && t.blockId === block.id);
    });

    const ibdSvg = renderIbdDiagram({
      contextBlock: block,
      parts: blockParts,
      connectors: blockConnectors,
      blocks: model.blocks,
      allParts: model.parts,
      containerId,
    });

    layerViews.push(`<div id="layer-ibd-${escapeHtml(block.id)}" class="diagram-layer-view" style="display:none">\n${ibdSvg}\n</div>`);
  }

  // 3. Render State Machine layers if available
  if (model.layers.length > 0 && model.states.length > 0) {
    const smFigures = renderStateMachineDiagrams({
      layers: model.layers,
      states: model.states,
      junctions: model.junctions,
      transitions: model.transitions,
    });
    model.layers.forEach((layer, idx) => {
      const fig = smFigures[idx] ?? '';
      if (fig) {
        layerViews.push(`<div id="layer-sm-${escapeHtml(layer.id)}" class="diagram-layer-view" style="display:none">\n${fig}\n</div>`);
      }
    });
  }

  return `
<div class="diagram-card" id="${escapeHtml(containerId)}">
  <div class="diagram-header" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 8px 8px 0 0;">
    <div id="bc-${escapeHtml(containerId)}" class="diagram-breadcrumbs" style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #1e293b;"></div>
    <div class="diagram-controls" style="display: flex; gap: 4px;">
      <button class="diagram-ctrl-btn" onclick="window.ADIA_DIAGRAM_NAV.zoom('${escapeHtml(containerId)}', 1.2)" style="padding: 4px 8px; font-size: 12px; cursor: pointer; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;">➕ Zoom</button>
      <button class="diagram-ctrl-btn" onclick="window.ADIA_DIAGRAM_NAV.zoom('${escapeHtml(containerId)}', 0.8)" style="padding: 4px 8px; font-size: 12px; cursor: pointer; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;">➖ Zoom</button>
      <button class="diagram-ctrl-btn" onclick="window.ADIA_DIAGRAM_NAV.resetZoom('${escapeHtml(containerId)}')" style="padding: 4px 8px; font-size: 12px; cursor: pointer; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;">↺ Reset</button>
    </div>
  </div>
  <div class="diagram-body" style="padding: 16px; overflow: auto; background: #ffffff;">
    <div id="layer-bdd-root" class="diagram-layer-view active">
      ${rootBddSvg}
    </div>
    ${layerViews.join('\n')}
  </div>
  ${generateDiagramScript(registry)}
  <script>
    if (typeof window !== 'undefined' && window.ADIA_DIAGRAM_NAV) {
      window.ADIA_DIAGRAM_NAV.initContainer('${escapeHtml(containerId)}', 'bdd-root', '${escapeHtml(title)}');
    }
  </script>
</div>
  `.trim();
}

