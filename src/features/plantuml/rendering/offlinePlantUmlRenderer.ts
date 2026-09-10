export interface RenderResult { svg?: string; error?: { code: 'render-failed'; message: string }; }
export type LocalPlantUmlRender = (source: string, options?: { format?: 'svg' }) => Promise<string>;

import type { VisualDiagramModel } from '../model/visualDiagramModel';

const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));

/**
 * Deterministic renderer used by the browser workspace. It is deliberately
 * local and dependency-free: the visual model remains authoritative while
 * the generated PlantUML source remains the interoperability artifact.
 */
export function renderVisualDiagramToSvg(model: VisualDiagramModel): string {
  const padding = 32;
  const maxX = Math.max(640, ...model.elements.map((item) => item.position.x + item.size.width + padding));
  const maxY = Math.max(420, ...model.elements.map((item) => item.position.y + item.size.height + padding));
  const byId = new Map(model.elements.map((item) => [item.id, item]));
  const lines = model.relationships.flatMap((relationship) => {
    const source = byId.get(relationship.sourceId); const target = byId.get(relationship.targetId);
    if (!source || !target) return [];
    const x1 = source.position.x + source.size.width / 2; const y1 = source.position.y + source.size.height / 2;
    const x2 = target.position.x + target.size.width / 2; const y2 = target.position.y + target.size.height / 2;
    const label = relationship.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" fill="#cbd5e1" font-size="11" text-anchor="middle">${escapeXml(relationship.label)}</text>` : '';
    return [`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f59e0b" stroke-width="2" marker-end="url(#adia-arrow)"/>${label}`];
  });
  const nodes = model.elements.map((item) => {
    const isUseCase = item.kind === 'use-case';
    const isActor = item.kind === 'actor';
    const rx = isUseCase ? Math.min(item.size.height / 2, 36) : 10;
    return `<g><rect x="${item.position.x}" y="${item.position.y}" width="${item.size.width}" height="${item.size.height}" rx="${rx}" fill="#1e293b" stroke="#f97316" stroke-width="2"/><text x="${item.position.x + item.size.width / 2}" y="${item.position.y + item.size.height / 2 + 4}" fill="#f8fafc" font-size="13" text-anchor="middle">${isActor ? '◉ ' : ''}${escapeXml(item.label || item.kind)}</text><text x="${item.position.x + 8}" y="${item.position.y + 16}" fill="#94a3b8" font-size="9">${escapeXml(item.kind)}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX} ${maxY}" role="img" aria-label="${escapeXml(model.title || 'PlantUML diagram')}"><defs><marker id="adia-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"/></marker></defs><rect width="100%" height="100%" fill="#111827"/>${lines.join('')}${nodes.join('')}</svg>`;
}

/** UI-facing boundary for a bundled Electron-local PlantUML renderer. No network fallback is permitted. */
export class OfflinePlantUmlRenderer {
  constructor(private readonly localRender: LocalPlantUmlRender) {}

  async render(source: string, options: { format?: 'svg' } = {}): Promise<RenderResult> {
    try { return { svg: await this.localRender(source, { format: options.format ?? 'svg' }) }; }
    catch (error) { return { error: { code: 'render-failed', message: error instanceof Error ? error.message : String(error) } }; }
  }
}
