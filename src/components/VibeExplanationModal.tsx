/**
 * VibeExplanationModal.tsx
 * Modal presenting the antigravity_patches.diff log and auto-fix annotations.
 */

import React from 'react';

interface VibeExplanationModalProps {
  diffLog: string;
  onClose: () => void;
}

export const VibeExplanationModal: React.FC<VibeExplanationModalProps> = ({ diffLog, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-100">🤖 Antigravity Auto-Fix Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg font-bold">×</button>
        </div>
        <pre className="bg-slate-950 p-4 rounded text-xs text-emerald-400 font-mono overflow-auto max-h-96 border border-slate-800">
          {diffLog || '# Zero-G Verification Passed.\n# No auto-patches were required for this generation run.'}
        </pre>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
