/**
 * VibeDashboard.tsx
 * Status Orb & UI Dashboard component for the Antigravity Agent.
 */

import React, { useState } from 'react';
import { VibeExplanationModal } from './VibeExplanationModal';
import { HardwareSyncModal } from './HardwareSyncModal';

export type VibeStatus = 'GENERATING' | 'ORBITING' | 'ZERO_G' | 'REENTRY_FAILED';

export function getOrbDetails(status: VibeStatus) {
  switch (status) {
    case 'GENERATING':
      return { icon: '🌑', label: 'Generating...', color: 'text-gray-400' };
    case 'ORBITING':
      return { icon: '🌗', label: 'Orbiting...', color: 'text-amber-400' };
    case 'ZERO_G':
      return { icon: '🌕', label: 'Zero-G (Ready to Flash)', color: 'text-emerald-400' };
    case 'REENTRY_FAILED':
      return { icon: '☄️', label: 'Re-entry Failed', color: 'text-rose-500' };
  }
}

interface VibeDashboardProps {
  status: VibeStatus;
  diffLog: string;
  onHardwareSync: (mcalHeaderContent: string) => void;
}

export const VibeDashboard: React.FC<VibeDashboardProps> = ({ status, diffLog, onHardwareSync }) => {
  const [showExplain, setShowExplain] = useState(false);
  const [showSync, setShowSync] = useState(false);

  const orb = getOrbDetails(status);

  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg shadow-xl text-slate-100 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl animate-pulse">{orb.icon}</span>
          <div>
            <h3 className={`font-bold text-lg ${orb.color}`}>{orb.label}</h3>
            <p className="text-xs text-slate-400">Antigravity Autonomous C-Code Middleware</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowExplain(true)}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition"
          >
            👁️ Explain the Vibe
          </button>
          <button
            onClick={() => setShowSync(true)}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition"
          >
            ⚙️ Hardware Sync
          </button>
        </div>
      </div>

      {showExplain && <VibeExplanationModal diffLog={diffLog} onClose={() => setShowExplain(false)} />}
      {showSync && <HardwareSyncModal onSave={onHardwareSync} onClose={() => setShowSync(false)} />}
    </div>
  );
};
