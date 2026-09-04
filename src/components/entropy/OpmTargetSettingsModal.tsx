/**
 * Modal dialog for configuring target embedded C execution settings,
 * buffer sizing, overflow policies, and MISRA profiles.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { OpmTargetSettings } from '../../engine/opm/executableTypes';
import { validateTargetSettings } from '../../engine/opm/schemaAdapter';
import { X, Save, Download, Cpu } from 'lucide-react';

export interface OpmTargetSettingsModalProps {
  isOpen: boolean;
  settings: OpmTargetSettings;
  onSave: (settings: OpmTargetSettings) => void;
  onClose: () => void;
  onExportZip?: () => void;
}

export const OpmTargetSettingsModal: React.FC<OpmTargetSettingsModalProps> = ({
  isOpen,
  settings: initialSettings,
  onSave,
  onClose,
  onExportZip,
}) => {
  const [form, setForm] = useState<OpmTargetSettings>({ ...initialSettings });

  useEffect(() => {
    setForm({ ...initialSettings });
  }, [initialSettings, isOpen]);

  const validation = useMemo(() => validateTargetSettings(form), [form]);
  const errorsByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of validation.diagnostics) map.set(d.source.propertyPath, d.message);
    return map;
  }, [validation]);
  const hasErrors = validation.diagnostics.some((d) => d.severity === 'error');

  if (!isOpen) return null;

  const renderFieldError = (path: string) => {
    const msg = errorsByPath.get(path);
    if (!msg) return null;
    return (
      <div data-opm-path={path} className="text-[10px] text-red-400 font-mono mt-0.5">
        {msg}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#181818] border border-[#333] rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="h-12 bg-[#202020] border-b border-[#333] px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-sky-400">
            <Cpu size={18} />
            <span>OPM Embedded C Target Settings</span>
          </div>
          <button
            data-testid="close-settings-btn"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 text-xs overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">C Standard</label>
              <select
                data-testid="target-c-standard-select"
                value={form.cStandard}
                onChange={(e) => setForm({ ...form, cStandard: e.target.value as any })}
                className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="c99">ISO C99</option>
                <option value="c11">ISO C11</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Base Tick Period (ms)</label>
              <input
                data-testid="settings-tick-ms-input"
                data-opm-path="settings.tickMs"
                aria-label="Base tick period in milliseconds"
                type="number"
                value={form.tickMs}
                onChange={(e) => setForm({ ...form, tickMs: Number(e.target.value) })}
                className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white"
              />
              {renderFieldError('settings.tickMs')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Event Queue Capacity</label>
              <input
                data-testid="settings-queue-capacity-input"
                data-opm-path="settings.eventQueueCapacity"
                aria-label="Event queue capacity"
                type="number"
                value={form.eventQueueCapacity}
                onChange={(e) => setForm({ ...form, eventQueueCapacity: Number(e.target.value) })}
                className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white"
              />
              {renderFieldError('settings.eventQueueCapacity')}
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Queue Overflow Policy</label>
              <select
                data-testid="settings-overflow-policy-select"
                value={form.eventOverflow}
                onChange={(e) => setForm({ ...form, eventOverflow: e.target.value as any })}
                className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="rejectNewest">Reject Newest (Drop)</option>
                <option value="dropOldest">Drop Oldest (Ring)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Max Staged Writes</label>
              <input
                data-testid="settings-max-writes-input"
                data-opm-path="settings.maxStagedWrites"
                aria-label="Max staged writes"
                type="number"
                value={form.maxStagedWrites}
                onChange={(e) => setForm({ ...form, maxStagedWrites: Number(e.target.value) })}
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white"
              />
              {renderFieldError('settings.maxStagedWrites')}
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Max Transitions</label>
              <input
                data-testid="settings-max-transitions-input"
                data-opm-path="settings.maxTransitions"
                aria-label="Max transitions"
                type="number"
                value={form.maxTransitions}
                onChange={(e) => setForm({ ...form, maxTransitions: Number(e.target.value) })}
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white"
              />
              {renderFieldError('settings.maxTransitions')}
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Trace Capacity</label>
              <input
                data-testid="settings-trace-capacity-input"
                data-opm-path="settings.traceCapacity"
                aria-label="Trace capacity"
                type="number"
                value={form.traceCapacity}
                onChange={(e) => setForm({ ...form, traceCapacity: Number(e.target.value) })}
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs text-white"
              />
              {renderFieldError('settings.traceCapacity')}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">MISRA Compliance Profile</label>
            <select
              data-testid="settings-misra-select"
              value={form.misraProfile}
              onChange={(e) => setForm({ ...form, misraProfile: e.target.value as any })}
              className="w-full bg-[#111] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white"
            >
              <option value="MISRA_C_2012_STRICT">MISRA C:2012 Strict</option>
              <option value="MISRA_C_2012_ADVISORY">MISRA C:2012 Advisory</option>
              <option value="NONE">None (Relaxed)</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 bg-[#202020] border-t border-[#333] px-4 flex items-center justify-between">
          <div>
            {onExportZip && (
              <button
                data-testid="export-zip-btn"
                onClick={onExportZip}
                disabled={hasErrors}
                title={hasErrors ? 'Resolve validation errors before exporting' : undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded hover:bg-emerald-900 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={14} /> Export C Package (.zip)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
            >
              Cancel
            </button>
            <button
              data-testid="save-settings-btn"
              onClick={() => {
                const checked = validateTargetSettings(form);
                if (checked.diagnostics.some((d) => d.severity === 'error')) return;
                onSave(checked.settings ?? form);
                onClose();
              }}
              disabled={hasErrors}
              title={hasErrors ? 'Resolve validation errors before saving' : undefined}
              className="flex items-center gap-1 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-xs shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} /> Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

