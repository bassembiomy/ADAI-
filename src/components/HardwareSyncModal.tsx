/**
 * HardwareSyncModal.tsx
 * Allows uploading/editing physical MCU driver header stubs safely inside mcal_dio.h user blocks.
 */

import React, { useState } from 'react';

interface HardwareSyncModalProps {
  onSave: (mcalHeaderContent: string) => void;
  onClose: () => void;
}

export const HardwareSyncModal: React.FC<HardwareSyncModalProps> = ({ onSave, onClose }) => {
  const [content, setContent] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl">
        <h3 className="text-xl font-bold text-slate-100 mb-2">⚙️ Hardware Sync (mcal_dio.h)</h3>
        <p className="text-xs text-slate-400 mb-4">
          Paste physical MCU DIO channel mappings. Engine core files are strictly protected and remain immutable.
        </p>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full h-48 bg-slate-950 p-3 rounded text-xs font-mono text-slate-200 border border-slate-800 focus:outline-none focus:border-indigo-500"
          placeholder="/* USER CODE BEGIN MCAL_DIO */\n#define IN_SENSOR_PIN (0U)\n/* USER CODE END MCAL_DIO */"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">Cancel</button>
          <button
            onClick={() => {
              onSave(content);
              onClose();
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded font-medium"
          >
            Save Sync
          </button>
        </div>
      </div>
    </div>
  );
};
