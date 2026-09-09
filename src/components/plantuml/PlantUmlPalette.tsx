import React from 'react';

export interface PlantUmlPaletteItem { kind: string; label: string; }
export function PlantUmlPalette({ items, onAdd }: { items: PlantUmlPaletteItem[]; onAdd: (kind: string) => void }) {
  return <aside className="w-52 shrink-0 border-r border-slate-700/70 bg-slate-950/70 p-3" aria-label="PlantUML palette">
    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">Diagram blocks</div>
    <p className="mb-3 text-[10px] leading-4 text-slate-500">Click a block to add it, or drag it onto the canvas.</p>
    <div className="space-y-2">{items.map((item) => <button key={item.kind} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-adia-plantuml-kind', item.kind)} onClick={() => onAdd(item.kind)} className="flex w-full items-center gap-2 rounded border border-slate-600 bg-slate-900 px-3 py-2.5 text-left text-xs font-medium text-slate-100 transition hover:border-orange-400 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400">{item.label}</button>)}</div>
  </aside>;
}
