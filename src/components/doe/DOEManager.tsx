import React, { useState } from 'react';

export const DOEManager: React.FC<{ initialData?: any }> = ({ initialData }) => {
  const [factors, setFactors] = useState(initialData?.nodes?.length || 2);
  const [runs, setRuns] = useState(10);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">DOE Analysis</h2>
          <p className="text-gray-400 text-sm">Response Surface Methodology & GMDH Modeling</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-[#1a1a1a] border border-[#333] text-gray-300 rounded-xl hover:bg-[#222]">Import Data</button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-900/20 hover:bg-purple-500 font-bold">Analyze Results</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1">
        <div className="md:col-span-1 bg-[#141414] rounded-2xl border border-[#222] p-6">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Design Config</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1 uppercase">Factors</label>
              <input type="number" value={factors} onChange={(e) => setFactors(parseInt(e.target.value))} className="w-full bg-[#0d0d0d] border border-[#333] p-2 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 uppercase">Runs</label>
              <input type="number" value={runs} onChange={(e) => setRuns(parseInt(e.target.value))} className="w-full bg-[#0d0d0d] border border-[#333] p-2 rounded-lg text-sm" />
            </div>
          </div>
        </div>

        <div className="md:col-span-3 bg-[#141414] rounded-2xl border border-[#222] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-[#222] flex justify-between items-center bg-[#1a1a1a]">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Experimental Matrix</span>
            <span className="text-[10px] text-purple-500">Ready for Analysis</span>
          </div>
          <div className="flex-1 p-6 flex items-center justify-center text-gray-600 italic">
            {initialData ? 'Physical model data integrated. Click Analyze to begin RSM.' : 'No data loaded. Import from Excel or V-Lab.'}
          </div>
        </div>
      </div>
    </div>
  );
};
