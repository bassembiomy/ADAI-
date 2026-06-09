import React, { useMemo, useState } from 'react';
import { ChevronLeft, Cpu, Settings2, FileText, Code2, Play } from 'lucide-react';
import { HILDriverPanel } from './HILDriverPanel';
import { HILSignalMapper } from './HILSignalMapper';
import { HILDashboard } from './HILDashboard';
import { HILConfig, HILSessionState } from '../../engine/hil/hilTypes';
import { generateHALCode } from '../../engine/hil/hilCodeGenerator';

interface HILWorkspaceProps {
  config: HILConfig;
  onChangeConfig: (config: HILConfig) => void;
  sessionState: HILSessionState;
  onChangeSessionState: React.Dispatch<React.SetStateAction<HILSessionState>>;
  variables: Array<{ id: string; name: string; type: string }>;
  onBack: () => void;
}

export const HILWorkspace: React.FC<HILWorkspaceProps> = ({
  config,
  onChangeConfig,
  sessionState,
  onChangeSessionState,
  variables,
  onBack
}) => {
  const [activeFileTab, setActiveFileTab] = useState('hal_config.h');

  // Compute live generated C code whenever channels or mappings change
  const generatedFiles = useMemo(() => {
    // Temporarily set enabled to true just for live preview generation
    return generateHALCode({ ...config, enabled: true }, variables);
  }, [config, variables]);

  const activeFileContent = useMemo(() => {
    const file = generatedFiles.find(f => f.name === activeFileTab);
    return file ? file.content : '/* No code generated. Define drivers and mappings first. */';
  }, [generatedFiles, activeFileTab]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden select-none">
      {/* Header bar */}
      <header className="h-14 bg-[#141414] border-b border-[#222] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Cpu className="text-[#f97316]" size={22} />
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white">Hardware-in-the-Loop (HIL) Workspace</h1>
              <p className="text-[10px] text-[#888] mt-[-2px]">ADIA Advanced HAL Code Generation & Hardware Control</p>
            </div>
          </div>
        </div>

        {/* Global MCU configuration controls */}
        <div className="flex items-center gap-4 bg-[#1c1c1c] border border-[#2d2d2d] rounded-lg px-3 py-1">
          {/* Target Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#888] font-bold uppercase">MCU Target:</span>
            <select
              value={config.target}
              onChange={(e) => onChangeConfig({ ...config, target: e.target.value as any })}
              className="bg-[#0a0a0a] border border-[#333] rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
            >
              <option value="STM32F4">STM32F4xx</option>
              <option value="STM32F1">STM32F1xx</option>
              <option value="Arduino_Uno">Arduino Uno</option>
              <option value="Arduino_Mega">Arduino Mega</option>
              <option value="ESP32">ESP32 NodeMCU</option>
              <option value="Generic">Generic Simulation</option>
            </select>
          </div>

          {/* Clock Speed Input */}
          <div className="flex items-center gap-1.5 border-l border-[#2d2d2d] pl-3">
            <span className="text-[10px] text-[#888] font-bold uppercase">Clock:</span>
            <input
              type="number"
              value={config.clockSpeed}
              onChange={(e) => onChangeConfig({ ...config, clockSpeed: parseInt(e.target.value) || 16 })}
              className="w-12 bg-[#0a0a0a] border border-[#333] rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
            />
            <span className="text-[10px] text-[#666] font-mono">MHz</span>
          </div>

          {/* HIL Mode Toggle */}
          <div className="flex items-center gap-1.5 border-l border-[#2d2d2d] pl-3">
            <span className="text-[10px] text-[#888] font-bold uppercase">HIL Compile:</span>
            <button
              onClick={() => onChangeConfig({ ...config, enabled: !config.enabled })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.enabled ? 'bg-[#f97316]' : 'bg-[#333]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main content split panel layout */}
      <div className="flex-1 grid grid-rows-12 gap-4 p-4 overflow-hidden">
        
        {/* Top Region: Configuration Panels (Drivers, Mappers, and Code Preview) */}
        <div className="row-span-7 grid grid-cols-12 gap-4 overflow-hidden">
          {/* Driver Setup */}
          <div className="col-span-4 h-full overflow-hidden">
            <HILDriverPanel
              channels={config.channels}
              onChange={(channels) => onChangeConfig({ ...config, channels })}
            />
          </div>

          {/* Variable Mapper */}
          <div className="col-span-4 h-full overflow-hidden">
            <HILSignalMapper
              channels={config.channels}
              mappings={config.mappings}
              availableVariables={variables}
              onChange={(mappings) => onChangeConfig({ ...config, mappings })}
            />
          </div>

          {/* Generated HAL Code Preview */}
          <div className="col-span-4 bg-[#121212] border border-[#222] rounded-xl p-4 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <div>
                <h2 className="text-md font-bold text-[#e0e0e0] flex items-center gap-1.5">
                  <Code2 size={16} className="text-[#f97316]" />
                  HAL Code Preview
                </h2>
                <p className="text-xs text-[#888]">Live compilation files for microcontroller</p>
              </div>
            </div>

            {/* Tab switchers */}
            <div className="flex border-b border-[#222] gap-1 overflow-x-auto shrink-0 mb-3 no-scrollbar">
              {generatedFiles.length > 0 ? (
                generatedFiles.map(f => (
                  <button
                    key={f.name}
                    onClick={() => setActiveFileTab(f.name)}
                    className={`px-3 py-1.5 text-[10px] font-mono border-t-2 border-transparent transition-all rounded-t select-none ${
                      activeFileTab === f.name
                        ? 'border-[#f97316] bg-[#1a1a1a] text-[#f97316] font-semibold'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {f.name}
                  </button>
                ))
              ) : (
                <div className="text-[10px] text-[#555] py-1">No driver files available.</div>
              )}
            </div>

            {/* C-Code Content display */}
            <div className="flex-1 overflow-auto bg-[#080808] border border-[#222] rounded-lg p-3 text-xs font-mono text-emerald-500/90 no-scrollbar select-text leading-relaxed">
              <pre className="whitespace-pre">
                <code>{activeFileContent}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Bottom Region: Dashboard and Real-Time monitors */}
        <div className="row-span-5 h-full overflow-hidden">
          <HILDashboard
            channels={config.channels}
            mappings={config.mappings}
            sessionState={sessionState}
            onChangeSessionState={onChangeSessionState}
            commPort={config.commPort}
            onChangeCommPort={(commPort) => onChangeConfig({ ...config, commPort })}
            baudRate={config.baudRate}
            onChangeBaudRate={(baudRate) => onChangeConfig({ ...config, baudRate })}
          />
        </div>

      </div>
    </div>
  );
};
