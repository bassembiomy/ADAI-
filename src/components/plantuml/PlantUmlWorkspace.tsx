import React, { useMemo, useState } from 'react';
import { getSequencePaletteItems } from '../../features/plantuml/adapters/sequenceAdapter';
import { getUseCasePaletteItems } from '../../features/plantuml/adapters/useCaseAdapter';
import { validateVisualDiagram } from '../../features/plantuml/model/diagramValidation';
import type { VisualDiagramElement, VisualDiagramModel } from '../../features/plantuml/model/visualDiagramModel';
import { PlantUmlCanvas } from './PlantUmlCanvas';
import { PlantUmlPalette } from './PlantUmlPalette';
import { PlantUmlPropertiesPanel } from './PlantUmlPropertiesPanel';
import { renderVisualDiagramToSvg } from '../../features/plantuml/rendering/offlinePlantUmlRenderer';

export function PlantUmlWorkspace({ diagram, onChange, onSave, onExport }: { diagram: VisualDiagramModel; onChange: (diagram: VisualDiagramModel) => void; onSave?: () => void; onExport?: () => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const palette = useMemo(() => diagram.type === 'sequence' ? getSequencePaletteItems() : getUseCasePaletteItems(), [diagram.type]);
  const validation = validateVisualDiagram(diagram);
  const add = (kind: string, position = { x: 120 + diagram.elements.length * 24, y: 100 + diagram.elements.length * 20 }) => {
    const element: VisualDiagramElement = { id: `element-${Date.now().toString(36)}`, kind, label: palette.find((item) => item.kind === kind)?.label ?? kind, position, size: { width: 160, height: 72 }, style: {} };
    onChange({ ...diagram, elements: [...diagram.elements, element] }); setSelectedId(element.id);
  };
  const preview = renderVisualDiagramToSvg(diagram);
  return <section className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-100" aria-label="PlantUML workspace"><header className="flex items-center justify-between border-b border-slate-700 bg-slate-950/80 px-4 py-3"><div><h2 className="text-sm font-semibold">{diagram.title || 'Untitled diagram'}</h2><p className="text-[11px] text-slate-400">Visual {diagram.type === 'sequence' ? 'sequence' : 'use-case'} modeling · offline preview</p></div><div className="flex gap-2"><button type="button" onClick={onSave} className="rounded bg-orange-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-orange-400">Save</button><button type="button" onClick={onExport} className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-orange-400">Export source</button></div></header><div className="flex min-h-0 flex-1"><PlantUmlPalette items={palette} onAdd={add} /><div className="grid min-w-0 flex-1 grid-cols-2"><PlantUmlCanvas diagram={diagram} selectedId={selectedId} onSelect={setSelectedId} onDrop={add} /><div className="overflow-auto border-l border-slate-700 bg-[#111827] p-3" aria-label="Offline PlantUML preview"><div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Rendered preview</div><div dangerouslySetInnerHTML={{ __html: preview }} /></div></div><PlantUmlPropertiesPanel diagram={diagram} selectedId={selectedId} onChange={(element) => onChange({ ...diagram, elements: diagram.elements.map((item) => item.id === element.id ? element : item) })} /></div><footer className="border-t border-slate-700 bg-slate-950/80 px-4 py-2 text-[11px] text-slate-400">{validation.valid ? 'Ready to render offline' : `${validation.issues.length} validation issue${validation.issues.length === 1 ? '' : 's'} · fix before export`}</footer></section>;
}
