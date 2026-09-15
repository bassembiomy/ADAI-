import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';

export interface DiagramReferenceItem {
  id: string;
  name: string;
  kind?: string;
}

export interface UseCaseReferencePickerProps {
  selectedDiagramId?: string;
  availableDiagrams: readonly DiagramReferenceItem[];
  onSelectDiagram: (diagramId: string | undefined) => void;
  onNavigate?: (diagramId: string) => void;
}

export const UseCaseReferencePicker: React.FC<UseCaseReferencePickerProps> = ({
  selectedDiagramId,
  availableDiagrams,
  onSelectDiagram,
  onNavigate,
}) => {
  const selectedExists = selectedDiagramId
    ? availableDiagrams.some((d) => d.id === selectedDiagramId)
    : true;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 items-center">
        <select
          value={selectedDiagramId || ''}
          onChange={(e) => onSelectDiagram(e.target.value || undefined)}
          className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none text-xs"
        >
          <option value="">-- None (No Behavior Diagram) --</option>
          {availableDiagrams.map((diag) => (
            <option key={diag.id} value={diag.id}>
              {diag.name} ({diag.kind || 'diagram'})
            </option>
          ))}
        </select>

        {selectedDiagramId && onNavigate && selectedExists && (
          <button
            type="button"
            onClick={() => onNavigate(selectedDiagramId)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded text-xs transition-colors"
            title="Open Diagram"
          >
            <ExternalLink size={12} />
            <span>Open Diagram</span>
          </button>
        )}
      </div>

      {!selectedExists && selectedDiagramId && (
        <div
          data-testid="unresolved-diagram-warning"
          className="flex items-center gap-2 p-2 bg-amber-950/40 border border-amber-600/60 rounded text-[11px] text-amber-200"
        >
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <div>
            <span className="font-semibold">Unresolved Diagram Reference:</span>{' '}
            <span className="font-mono text-amber-300">{selectedDiagramId}</span>
            <div className="text-[10px] text-amber-300/80">
              The referenced behavior diagram was deleted or does not exist.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
