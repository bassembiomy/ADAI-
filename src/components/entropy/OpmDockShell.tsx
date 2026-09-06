// src/components/entropy/OpmDockShell.tsx (skeleton: layout only)
import React from 'react';
import type { OpmDocks, OpmPage } from './OpmDockState';
interface Props { docks: OpmDocks; onDocksChange: (d: OpmDocks) => void; left: React.ReactNode; right: React.ReactNode; bottom: React.ReactNode; center: React.ReactNode; }
const PAGES: OpmPage[] = ['model', 'simulate', 'review'];
export const OpmDockShell: React.FC<Props> = ({ docks, onDocksChange, left, right, bottom, center }) => (
  <div className="flex h-full w-full flex-col">
    <div data-testid="opm-pagebar" className="flex items-center gap-2 border-b border-[#222] px-3" style={{ height: 44 }}>
      {PAGES.map(p => (
        <button key={p} data-testid={`opm-page-${p}`} aria-label={`${p} page`}
          onClick={() => onDocksChange({ ...docks, page: p })}
          className={docks.page === p ? 'text-orange-400 font-bold' : 'text-gray-500'}>{p}</button>
      ))}
      <span className="flex-1" />
      <button data-testid="opm-dock-toggle-left" aria-label="Toggle left dock" onClick={() => onDocksChange({ ...docks, left: !docks.left })}>L</button>
      <button data-testid="opm-dock-toggle-right" aria-label="Toggle right dock" onClick={() => onDocksChange({ ...docks, right: !docks.right })}>R</button>
      <button data-testid="opm-dock-toggle-bottom" aria-label="Toggle bottom dock" onClick={() => onDocksChange({ ...docks, bottom: !docks.bottom })}>B</button>
    </div>
    <div className="flex min-h-0 flex-1">
      {docks.left && <aside data-testid="opm-dock-left" className="w-60 shrink-0 overflow-y-auto border-r border-[#222]">{left}</aside>}
      <main data-testid="opm-dock-center" className="relative min-w-0 flex-1">{center}</main>
      {docks.right && <aside data-testid="opm-dock-right" className="w-80 shrink-0 overflow-y-auto border-l border-[#222]">{right}</aside>}
    </div>
    {docks.bottom && <footer data-testid="opm-dock-bottom" className="h-48 shrink-0 overflow-hidden border-t border-[#222]">{bottom}</footer>}
  </div>
);
