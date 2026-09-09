import React from 'react';
import type { VisualDiagramElement, VisualDiagramModel } from '../../features/plantuml/model/visualDiagramModel';

export function PlantUmlPropertiesPanel({ diagram, selectedId, onChange }: { diagram: VisualDiagramModel; selectedId?: string; onChange: (element: VisualDiagramElement) => void }) {
  const selected = diagram.elements.find((element) => element.id === selectedId);
  return <aside className="w-64 shrink-0 border-l border-slate-700/70 bg-slate-950/70 p-4" aria-label="PlantUML properties"><div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Properties</div>{selected ? <label className="block text-xs text-slate-300">Label<input value={selected.label} onChange={(event) => onChange({ ...selected, label: event.target.value })} className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-orange-400" /></label> : <p className="text-xs text-slate-500">Select a block to edit its properties.</p>}</aside>;
}
