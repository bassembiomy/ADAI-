import React, { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';

interface LegendRow {
  label: string;
  kind:
    | 'solid-filled' | 'solid-hollow' | 'double-filled'
    | 'dashed-filled' | 'dashed-hollow'
    | 'tri-filled' | 'tri-hollow' | 'circle';
}

const Glyph: React.FC<{ kind: LegendRow['kind'] }> = ({ kind }) => {
  const c = '#9ca3af';
  const dashed = kind.startsWith('dashed') ? '4 3' : undefined;
  let head: React.ReactNode;
  if (kind === 'solid-filled' || kind === 'dashed-filled') {
    head = <polygon points="26 4.5, 33 8, 26 11.5" fill={c} />;
  } else if (kind === 'solid-hollow' || kind === 'dashed-hollow') {
    head = <polygon points="26 4.5, 33 8, 26 11.5" fill="#141414" stroke={c} strokeWidth="1.2" />;
  } else if (kind === 'double-filled') {
    head = (
      <>
        <polygon points="26 4.5, 33 8, 26 11.5" fill={c} />
        <polygon points="8 4.5, 1 8, 8 11.5" fill={c} />
      </>
    );
  } else if (kind === 'tri-filled') {
    head = <polygon points="8 2, 1 8, 8 14" fill={c} />;
  } else if (kind === 'tri-hollow') {
    head = <polygon points="8 2, 1 8, 8 14" fill="#141414" stroke={c} strokeWidth="1.2" />;
  } else {
    head = <circle cx="4.5" cy="8" r="3.5" fill={c} />;
  }
  return (
    <svg width="34" height="16" className="shrink-0">
      <line x1="6" y1="8" x2="26" y2="8" stroke={c} strokeWidth="1.5" strokeDasharray={dashed} />
      {head}
    </svg>
  );
};

const SECTIONS: { title: string; rows: LegendRow[] }[] = [
  {
    title: 'Procedural',
    rows: [
      { label: 'Agent — executes', kind: 'solid-filled' },
      { label: 'Instrument — uses', kind: 'solid-hollow' },
      { label: 'Consumption', kind: 'solid-filled' },
      { label: 'Result', kind: 'solid-filled' },
      { label: 'Effect — changes', kind: 'double-filled' },
    ],
  },
  {
    title: 'Event',
    rows: [
      { label: 'Trigger', kind: 'dashed-filled' },
      { label: 'Condition', kind: 'dashed-hollow' },
    ],
  },
  {
    title: 'Structural',
    rows: [
      { label: 'Aggregation (whole)', kind: 'tri-filled' },
      { label: 'Generalization', kind: 'tri-hollow' },
      { label: 'Exhibition', kind: 'circle' },
      { label: 'Satisfies / Verifies', kind: 'dashed-filled' },
    ],
  },
];

export const OpmLegend: React.FC<{ onOpenHelp?: () => void }> = ({ onOpenHelp }) => {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-[#161616]/90 border border-[#2d2d2d] rounded-md px-2 py-1 text-[10px] text-[#999] hover:text-white shadow-lg"
          title="ISO 19450 OPD notation legend"
        >
          <BookOpen size={11} /> ISO 19450 Notation
        </button>
        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 bg-[#161616]/90 border border-orange-500/40 text-orange-400 hover:text-orange-300 hover:border-orange-500/80 rounded-md px-2 py-1 text-[10px] font-semibold shadow-lg transition-colors"
            title="Open OPM & ENTROPY Embedded C Guide"
          >
            📖 OPM Guide
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-10 w-56 bg-[#141414]/95 backdrop-blur-md border border-[#2d2d2d] rounded-lg p-2.5 shadow-xl">
      <button
        onClick={() => setOpen(false)}
        className="w-full flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-orange-400 mb-1.5"
      >
        ISO 19450 Notation <ChevronDown size={12} />
      </button>
      <div className="mb-1.5">
        <div className="text-[8px] uppercase text-[#666] font-bold mb-0.5">Blocks</div>
        <div className="flex items-center gap-1.5 py-[1px]">
          <span className="h-3 w-8 shrink-0 rounded-[2px] border-2 border-emerald-500 bg-emerald-950/80" />
          <span className="text-[9px] text-[#bbb]">Object</span>
        </div>
        <div className="flex items-center gap-1.5 py-[1px]">
          <span className="h-3 w-8 shrink-0 rounded-full border-2 border-sky-500 bg-sky-950/80" />
          <span className="text-[9px] text-[#bbb]">Process</span>
        </div>
        <div className="flex items-center gap-1.5 py-[1px]">
          <span className="h-3 w-8 shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
          <span className="text-[9px] text-[#bbb]">State (active)</span>
        </div>
        <div className="flex items-center gap-1.5 py-[1px]">
          <span className="h-3 w-8 shrink-0 rounded-[2px] border-2 border-dashed border-purple-500 bg-purple-950/60" />
          <span className="text-[9px] text-[#bbb]">Requirement</span>
        </div>
      </div>
      <div className="mb-1.5">
        <div className="text-[8px] uppercase text-[#666] font-bold mb-0.5">Ports</div>
        <div className="flex items-center gap-1.5 py-[1px]">
          <span className="rounded border border-white/10 bg-black/85 px-1.5 py-px text-[8px] font-bold text-white">Consume</span>
          <span className="text-[9px] text-[#bbb]">Port pill (always labeled)</span>
        </div>
      </div>
      <div className="mb-1.5">
        <div className="text-[8px] uppercase text-[#666] font-bold mb-0.5">Links</div>
        <div className="flex items-center gap-1.5 py-[1px]">
          <span className="rounded-full border border-sky-500/40 bg-[#0d0d0d] px-1.5 py-px text-[8px] font-bold text-sky-300">✨ Result</span>
          <span className="text-[9px] text-[#bbb]">Midpoint type chip</span>
        </div>
      </div>
      {SECTIONS.map(s => (
        <div key={s.title} className="mb-1.5">
          <div className="text-[8px] uppercase text-[#666] font-bold mb-0.5">{s.title}</div>
          {s.rows.map(r => (
            <div key={r.label} className="flex items-center gap-1.5 py-[1px]">
              <Glyph kind={r.kind} />
              <span className="text-[9px] text-[#bbb]">{r.label}</span>
            </div>
          ))}
        </div>
      ))}
      {onOpenHelp && (
        <button
          onClick={onOpenHelp}
          className="w-full mt-2 pt-1.5 border-t border-[#2d2d2d] flex items-center justify-center gap-1.5 text-[9px] font-bold text-orange-400 hover:text-orange-300 transition-colors"
        >
          <BookOpen size={11} /> Open Full OPM &amp; C Guide
        </button>
      )}
    </div>
  );
};
