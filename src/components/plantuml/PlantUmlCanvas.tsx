import React from 'react';
import type { VisualDiagramElement, VisualDiagramModel } from '../../features/plantuml/model/visualDiagramModel';

export function PlantUmlCanvas({ diagram, selectedId, onSelect, onDrop }: { diagram: VisualDiagramModel; selectedId?: string; onSelect: (id: string) => void; onDrop: (kind: string, point: { x: number; y: number }) => void }) {
  return <main className="relative min-w-0 flex-1 overflow-auto bg-[#111827]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const kind = event.dataTransfer.getData('application/x-adia-plantuml-kind'); if (kind) onDrop(kind, { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY }); }} aria-label="PlantUML canvas">
    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
    {diagram.elements.map((element: VisualDiagramElement) => <button key={element.id} type="button" onClick={() => onSelect(element.id)} className={`absolute rounded-lg border px-4 py-3 text-left shadow-lg transition ${selectedId === element.id ? 'border-orange-400 ring-2 ring-orange-400/40' : 'border-slate-600'} bg-slate-800 text-slate-100`} style={{ left: element.position.x, top: element.position.y, width: element.size.width, minHeight: element.size.height }}><span className="block text-xs font-semibold">{element.label || 'Unnamed block'}</span><span className="mt-1 block text-[10px] text-slate-400">{element.kind}</span></button>)}
  </main>;
}
