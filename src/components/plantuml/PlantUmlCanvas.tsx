import React, { useRef } from 'react';
import type { VisualDiagramElement, VisualDiagramModel } from '../../features/plantuml/model/visualDiagramModel';

export function PlantUmlCanvas({ diagram, selectedId, onSelect, onDrop, onMove, connectSourceId, onConnect }: { diagram: VisualDiagramModel; selectedId?: string; onSelect: (id: string) => void; onDrop: (kind: string, point: { x: number; y: number }) => void; onMove?: (id: string, position: { x: number; y: number }) => void; connectSourceId?: string; onConnect?: (sourceId: string, targetId: string) => void }) {
  const dragRef = useRef<{ id: string; pointerId: number; clientX: number; clientY: number; x: number; y: number }>();
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onMove?.(drag.id, {
      x: Math.max(0, drag.x + event.clientX - drag.clientX),
      y: Math.max(0, drag.y + event.clientY - drag.clientY),
    });
  };
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    moveDrag(event);
    dragRef.current = undefined;
  };
  return <main data-help-feature="live:components/plantuml/PlantUmlCanvas:7f600af7db2f" className="relative min-w-0 flex-1 overflow-auto bg-[#111827]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const kind = event.dataTransfer.getData('application/x-adia-plantuml-kind'); if (kind) onDrop(kind, { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY }); }} aria-label="PlantUML canvas">
    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
    {diagram.elements.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/80 px-8 py-6 text-center shadow-xl"><div className="text-sm font-semibold text-slate-200">Start designing your diagram</div><div className="mt-2 text-xs text-slate-400">Choose a block from the left palette, then drag it here.</div></div></div>}
    {diagram.elements.map((element: VisualDiagramElement) => <button data-help-feature="ui:plantuml/PlantUmlCanvas:c575d1f11a0a" data-help-source="src/components/plantuml/PlantUmlCanvas.tsx" key={element.id} type="button" onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { id: element.id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: element.position.x, y: element.position.y }; onSelect(element.id); }} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={() => { dragRef.current = undefined; }} onLostPointerCapture={() => { dragRef.current = undefined; }} onClick={(event) => { event.stopPropagation(); if (connectSourceId && connectSourceId !== element.id) onConnect?.(connectSourceId, element.id); else onSelect(element.id); }} className={`absolute cursor-grab rounded-lg border px-4 py-3 text-left shadow-lg transition-colors transition-shadow active:cursor-grabbing ${selectedId === element.id ? 'border-orange-400 ring-2 ring-orange-400/40' : connectSourceId === element.id ? 'border-orange-300 ring-2 ring-orange-300/30' : 'border-slate-600'} bg-slate-800 text-slate-100`} style={{ left: element.position.x, top: element.position.y, width: element.size.width, minHeight: element.size.height }}><span className="block text-xs font-semibold">{element.label || 'Unnamed block'}</span><span className="mt-1 block text-[10px] text-slate-400">{element.kind}</span></button>)}
  </main>;
}
