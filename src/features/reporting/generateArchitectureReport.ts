import type { HierarchySourceModel } from './reportHierarchyEngine';
import type { ReportModelDiagnostics } from '../../services/reportModelConsistency';
import type { BlockData } from '../../types/sysml_types';
import {
  renderBddDiagram,
  renderRequirementsDiagram,
  renderStateMachineDiagrams,
} from './reportDiagrams';
import {
  renderInteractiveDiagramHierarchy,
  generateDiagramScript,
  buildReportHierarchy,
} from './reportHierarchyEngine';
import { escapeHtml } from './reportDiagramModel';

export interface ArchitectureReportOptions {
  projectName?: string;
  author?: string;
  version?: string;
}

export function generateArchitectureReport(
  source: HierarchySourceModel,
  diagnostics?: ReportModelDiagnostics,
  options?: ArchitectureReportOptions,
): string {
  const projectName = options?.projectName || 'System Architecture';
  const author = options?.author || 'Engineer';
  const version = options?.version || '1.0.0';

  const style = `
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; color: #333; padding: 40px; line-height: 1.6; max-width: 900px; margin: 0 auto; }
    h1 { color: #f97316; border-bottom: 2px solid #f97316; padding-bottom: 10px; margin-bottom: 20px; }
    h2 { color: #222; border-bottom: 1px solid #eee; margin-top: 40px; padding-bottom: 5px; page-break-after: avoid; }
    h3 { color: #444; margin-top: 25px; font-size: 1.1em; page-break-after: avoid; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 40px; }
    .tree { margin-left: 20px; border-left: 1px solid #ddd; padding-left: 15px; }
    .item { margin-bottom: 15px; }
    .item-header { font-weight: bold; color: #000; }
    .props { font-size: 0.9em; color: #555; margin-left: 10px; }
    .tag { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; }
    .diagram-container { margin: 16px 0; }
    .diagram-cell { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
    .diagram-card { margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; page-break-inside: avoid; }
    .diagram-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: #334155; }
    .diagram-link-btn { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #fff; color: #ea580c; border: 1px solid #fed7aa; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.15s ease; }
    .diagram-link-btn:hover { background: #ea580c; color: #ffffff; border-color: #ea580c; box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25); }
    .diagram-preview-body { padding: 16px; display: flex; justify-content: center; align-items: center; cursor: zoom-in; background: #fafafa; overflow-x: auto; transition: background 0.15s ease; }
    .diagram-preview-body:hover { background: #f1f5f9; }
    .diagram-hint { text-align: center; padding: 6px; font-size: 11px; color: #94a3b8; border-top: 1px dashed #e2e8f0; background: #ffffff; }
    .consistency-summary { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px; font-size: 0.9em; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; font-size: 0.9em; }
    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
    th { background-color: #f5f5f5; color: #333; }
    @media print {
      .diagram-link-btn, .diagram-hint { display: none !important; }
      .diagram-cell { page-break-inside: avoid; }
      .diagram-card { border: 1px solid #ddd; box-shadow: none; }
      svg { max-width: 100% !important; height: auto !important; }
    }
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(projectName)} Report</title><style>${style}</style></head><body>`;
  html += `<h1>${escapeHtml(projectName)}</h1>`;
  html += `<div class="meta"><strong>Author:</strong> ${escapeHtml(author)} &bull; <strong>Date:</strong> ${escapeHtml(new Date().toLocaleString())} &bull; <strong>Engine:</strong> ${escapeHtml(version)}</div>`;

  // Consistency diagnostics summary
  if (diagnostics) {
    const removedRelCount = diagnostics.removedRelationshipIds?.length || 0;
    const removedConnCount = diagnostics.removedConnectorIds?.length || 0;
    const totalRemoved = removedRelCount + removedConnCount;
    const errorCount = diagnostics.errors?.length || 0;

    html += `<div class="consistency-summary">
      <strong>Model Consistency Summary:</strong> removed connections: ${totalRemoved} (relationships: ${removedRelCount}, connectors: ${removedConnCount}) &bull; errors: ${errorCount}
    </div>`;
  }

  // 1. Requirements
  const reqs = source.blocks.filter(b => b.stereotype === 'requirement');
  if (reqs.length > 0) {
    html += `<h2>1. Requirements</h2>`;
    html += renderRequirementsDiagram({ blocks: source.blocks, relationships: source.relationships });

    html += `<table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.9em;">`;
    html += `<tr style="background-color: #f5f5f5; text-align: left; color: #333;">
              <th style="padding: 10px; border: 1px solid #ddd;">ID</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Name</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Status</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Priority</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Assigned To</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Description</th>
            </tr>`;

    // Hierarchy map
    const childrenMap = new Map<string, string[]>();
    const parentSet = new Set<string>();

    source.relationships.forEach(rel => {
      const s = source.blocks.find(b => b.id === rel.sourceId);
      const t = source.blocks.find(b => b.id === rel.targetId);
      if (s?.stereotype === 'requirement' && t?.stereotype === 'requirement') {
        if (rel.type === 'composition' || rel.type === 'derive' || rel.type === 'deriveReqt') {
          if (!childrenMap.has(rel.sourceId)) childrenMap.set(rel.sourceId, []);
          childrenMap.get(rel.sourceId)!.push(rel.targetId);
          parentSet.add(rel.targetId);
        }
      }
    });

    const roots = reqs.filter(r => !parentSet.has(r.id));
    const renderReqRow = (r: BlockData, level: number): string => {
      const prefix = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(level) + (level > 0 ? '└ ' : '');
      let rowHtml = `<tr>
        <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; color: #888;">${escapeHtml(r.reqId || '')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${prefix}${escapeHtml(r.name)}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.status || 'Draft')}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.priority || 'Medium')}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.assignedTo || 'Unassigned')}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.description || '')}</td>
      </tr>`;
      const children = childrenMap.get(r.id) || [];
      children.forEach(childId => {
        const child = reqs.find(x => x.id === childId);
        if (child) {
          rowHtml += renderReqRow(child, level + 1);
        }
      });
      return rowHtml;
    };

    const targetRoots = roots.length > 0 ? roots : reqs;
    targetRoots.forEach(r => {
      html += renderReqRow(r, 0);
    });
    html += `</table>`;
  }

  // 2. System Architecture (BDD)
  const bddBlocks = source.blocks.filter(b => b.stereotype !== 'requirement');
  if (bddBlocks.length > 0) {
    html += `<h2>2. System Architecture (BDD)</h2>`;
    html += renderBddDiagram({
      blocks: source.blocks,
      relationships: source.relationships,
      parts: source.parts,
    });
    html += `<div class="tree">`;
    bddBlocks.forEach(b => {
      html += `<div class="item">
              <div class="item-header">«${escapeHtml(b.stereotype)}» ${escapeHtml(b.name)}</div>`;
      if (b.properties && b.properties.length > 0) {
        html += `<div class="props"><strong>Properties:</strong><ul>`;
        b.properties.forEach(p => {
          html += `<li>${escapeHtml(p.name)}: ${escapeHtml(p.type)} ${p.defaultValue ? '= ' + escapeHtml(p.defaultValue) : ''}</li>`;
        });
        html += `</ul></div>`;
      }
      if (b.ports && b.ports.length > 0) {
        html += `<div class="props"><strong>Ports:</strong><ul>`;
        b.ports.forEach(p => {
          html += `<li>${escapeHtml(p.name)} : ${escapeHtml(p.type)} (${escapeHtml(p.kind || 'standard')})</li>`;
        });
        html += `</ul></div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  // 3. Interactive Hierarchy & IBD
  if (source.parts.length > 0) {
    html += `<h2>3. Internal Structure (IBD & Hierarchy)</h2>`;
    html += renderInteractiveDiagramHierarchy(source, { title: projectName });
  }

  // 4. State Machine
  if (source.layers.length > 0 && source.states.length > 0) {
    html += `<h2>4. State Machine Diagrams</h2>`;
    const figures = renderStateMachineDiagrams({
      layers: source.layers,
      states: source.states,
      junctions: source.junctions,
      transitions: source.transitions,
    });
    figures.forEach(fig => {
      html += fig;
    });
  }

  const registry = buildReportHierarchy(source);
  html += generateDiagramScript(registry);
  html += `</body></html>`;

  return html;
}
