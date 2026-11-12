import React, { useState } from 'react';
import type { EventDef } from '../../types/sm_types';

export interface ChartEventsEditorProps {
  events: readonly EventDef[];
  onAdd: () => void;
  /** Applies a rename; returns the validation message, or null when it was applied. */
  onRename: (id: string, name: string) => string | null;
  onScopeChange: (id: string, scope: EventDef['scope']) => void;
  onDelete: (id: string) => void;
}

interface EventRowProps {
  event: EventDef;
  onRename: ChartEventsEditorProps['onRename'];
  onScopeChange: ChartEventsEditorProps['onScopeChange'];
  onDelete: ChartEventsEditorProps['onDelete'];
}

const EventRow: React.FC<EventRowProps> = ({ event, onRename, onScopeChange, onDelete }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? event.name;

  const commit = (value: string) => {
    if (value === event.name) { setDraft(null); setError(null); return; }
    const message = onRename(event.id, value);
    if (message === null) { setDraft(null); setError(null); } else { setDraft(value); setError(message); }
  };

  return (
    <div className="group border-b border-[#1a1a1a] last:border-0 px-4 py-1.5" data-testid="chart-event-row">
      <div className="flex items-center gap-2">
        <input data-help-feature="app-event-name" data-help-source="src/App.tsx"
          aria-label={`Event name ${event.name}`}
          aria-invalid={error !== null}
          value={shown}
          onChange={(e) => {
            setDraft(e.target.value);
            const message = onRename(event.id, e.target.value);
            setError(message);
            if (message === null) setDraft(null);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
          className={`h-6 flex-1 min-w-0 text-[10px] font-mono bg-[#0d0d0d] border rounded px-1.5 ${error ? 'border-red-500' : 'border-[#222]'}`}
        />
        <select data-help-feature="app-event-scope" data-help-source="src/App.tsx"
          aria-label={`Scope of event ${event.name}`}
          value={event.scope}
          onChange={(e) => onScopeChange(event.id, e.target.value as EventDef['scope'])}
          className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
        >
          <option value="input">Input</option>
          <option value="local">Local</option>
        </select>
        <button data-help-feature="app-event-delete" data-help-source="src/App.tsx"
          type="button"
          aria-label={`Delete event ${event.name}`}
          onClick={() => onDelete(event.id)}
          className="text-[#444] hover:text-red-500 opacity-60 group-hover:opacity-100 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[9px] text-red-500">{error}</p>}
    </div>
  );
};

/** "Events" section of the variables panel: list, add, rename, scope and delete chart events. */
export const ChartEventsEditor: React.FC<ChartEventsEditorProps> = ({
  events, onAdd, onRename, onScopeChange, onDelete,
}) => (
  <div className="border-t border-[#222]" data-testid="chart-events-editor">
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Events</span>
      <button data-help-feature="app-event-add" data-help-source="src/App.tsx"
        type="button"
        onClick={onAdd}
        className="h-6 px-2 rounded bg-[#f97316] text-[#0a0a0a] text-[10px] font-bold hover:bg-[#ea580c]"
      >
        ADD EVENT
      </button>
    </div>
    <div>
      {events.map((event) => (
        <EventRow key={event.id} event={event} onRename={onRename} onScopeChange={onScopeChange} onDelete={onDelete} />
      ))}
      {events.length === 0 && (
        <p className="px-4 pb-3 text-[10px] text-[#555]">
          No events. Input events are posted from outside; local events are raised with <span className="font-mono">send(NAME);</span>.
        </p>
      )}
    </div>
  </div>
);
