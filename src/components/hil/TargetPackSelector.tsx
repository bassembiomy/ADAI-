import React, { useState, useMemo } from 'react';
import { Cpu, Zap, HardDrive, Wrench, Layers, Info } from 'lucide-react';
import { getDefaultTargetRegistry } from '../../engine/targetPacks/defaultTargetPacks';
import type { TargetPackManifest, DriverMode } from '../../engine/targetPacks/targetPackTypes';

interface TargetPackSelectorProps {
  selectedTargetId: string;
  selectedDriverMode?: DriverMode;
  onSelectTarget: (targetId: string, driverMode: DriverMode, manifest: TargetPackManifest) => void;
  headerAction?: React.ReactNode;
}

export const TargetPackSelector: React.FC<TargetPackSelectorProps> = ({
  selectedTargetId,
  selectedDriverMode = 'vendor',
  onSelectTarget,
  headerAction,
}) => {
  const registry = useMemo(() => getDefaultTargetRegistry(), []);
  const targetIds = useMemo(() => registry.getAllTargetIds(), [registry]);

  const currentManifest = useMemo(() => {
    return registry.getTarget(selectedTargetId) || registry.getTarget(targetIds[0]);
  }, [registry, selectedTargetId, targetIds]);

  const [activeDriverMode, setActiveDriverMode] = useState<DriverMode>(selectedDriverMode);

  const handleTargetChange = (targetId: string) => {
    const manifest = registry.getTarget(targetId);
    if (manifest) {
      const mode = manifest.supportedDriverModes.includes(activeDriverMode)
        ? activeDriverMode
        : manifest.supportedDriverModes[0];
      setActiveDriverMode(mode);
      onSelectTarget(targetId, mode, manifest);
    }
  };

  const handleDriverModeChange = (mode: DriverMode) => {
    setActiveDriverMode(mode);
    if (currentManifest) {
      onSelectTarget(currentManifest.targetId, mode, currentManifest);
    }
  };

  if (!currentManifest) return null;

  const flashRegion = currentManifest.memoryRegions.find(r => r.name === 'flash');
  const sramRegion = currentManifest.memoryRegions.find(r => r.name === 'sram');

  const flashSizeKb = flashRegion ? Math.round(flashRegion.size / 1024) : 0;
  const sramSizeKb = sramRegion ? Math.round(sramRegion.size / 1024) : 0;

  return (
    <div className="bg-[#121212] border border-[#262626] rounded-xl p-4 text-[#e0e0e0] flex flex-col gap-4 shadow-lg">
      {/* Header & Dropdown */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#222]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#f97316]/10 border border-[#f97316]/30 rounded-lg text-[#f97316]">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Target Pack Registry
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                <Info size={10} /> Pack v{currentManifest.packVersion} · Static analysis only
              </span>
            </h3>
            <p className="text-xs text-[#888]">Immutable target device definition & stable MCAL contract</p>
          </div>
        </div>

        {/* Device Picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#aaa] font-medium shrink-0">Device Pack:</label>
          <select
            value={currentManifest.targetId}
            onChange={(e) => handleTargetChange(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] text-xs font-mono text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#f97316] transition-colors cursor-pointer"
          >
            {targetIds.map((id) => {
              const pack = registry.getTarget(id);
              return (
                <option key={id} value={id}>
                  {pack ? pack.displayName : id}
                </option>
              );
            })}
          </select>
          {headerAction}
        </div>
      </div>

      {/* Grid: Device Specs & Driver Modes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Core & Clock */}
        <div className="bg-[#181818] border border-[#262626] rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[#888] font-medium">
            <span className="flex items-center gap-1.5 text-white">
              <Zap size={14} className="text-amber-400" /> Core & Clock
            </span>
            <span className="font-mono text-[10px] bg-[#222] px-1.5 py-0.5 rounded text-[#aaa]">
              {currentManifest.device.architecture}
            </span>
          </div>
          <div className="text-sm font-bold text-white font-mono">{currentManifest.displayName}</div>
          <div className="flex items-center justify-between text-[11px] text-[#aaa]">
            <span>Architecture: <strong className="text-white">{currentManifest.device.core}</strong></span>
            <span>Clock: <strong className="text-amber-400 font-mono">{(currentManifest.device.maxCpuClockHz / 1e6).toFixed(0)} MHz</strong></span>
          </div>
        </div>

        {/* Memory Profile */}
        <div className="bg-[#181818] border border-[#262626] rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[#888] font-medium">
            <span className="flex items-center gap-1.5 text-white">
              <HardDrive size={14} className="text-cyan-400" /> Memory Profile
            </span>
            <span className="font-mono text-[10px] text-[#888]">
              Hash: {currentManifest.contentHash.slice(0, 8)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="text-[#888] text-[10px]">FLASH Memory</div>
              <div className="font-mono font-semibold text-cyan-400">{flashSizeKb} KB</div>
            </div>
            <div>
              <div className="text-[#888] text-[10px]">SRAM Capacity</div>
              <div className="font-mono font-semibold text-purple-400">{sramSizeKb} KB</div>
            </div>
          </div>
        </div>

        {/* Driver Mode Selector */}
        <div className="bg-[#181818] border border-[#262626] rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[#888] font-medium">
            <span className="flex items-center gap-1.5 text-white">
              <Layers size={14} className="text-[#f97316]" /> Driver Execution Mode
            </span>
          </div>
          <div className="flex gap-1.5 mt-1">
            {currentManifest.supportedDriverModes.map((mode) => (
              <button
                key={mode}
                onClick={() => handleDriverModeChange(mode)}
                className={`flex-1 py-1 px-2 text-[11px] font-mono font-semibold rounded border transition-colors ${
                  activeDriverMode === mode
                    ? 'bg-[#f97316]/20 border-[#f97316] text-[#f97316]'
                    : 'bg-[#222] border-[#333] text-[#aaa] hover:text-white'
                }`}
              >
                {mode === 'vendor' ? 'Vendor HAL' : 'Bare Metal'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Peripherals & Toolchains */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs bg-[#161616] p-2.5 rounded-lg border border-[#222]">
        {/* Capability Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#777] font-semibold uppercase tracking-wider mr-1">Peripherals:</span>
          {currentManifest.capabilityManifest.supportedPeripherals.map((periph) => (
            <span
              key={periph}
              className="px-2 py-0.5 text-[10px] font-mono bg-[#222] text-[#ccc] border border-[#333] rounded"
            >
              {periph}
            </span>
          ))}
        </div>

        {/* Toolchain Pin & Certification */}
        <div className="flex items-center gap-3 shrink-0 text-[11px] text-[#888]">
          <span className="flex items-center gap-1">
            <Wrench size={12} className="text-amber-400" /> Toolchain:{' '}
            <strong className="text-white font-mono">
              {currentManifest.pinnedToolchains[0]?.name || 'gcc'}@{currentManifest.pinnedToolchains[0]?.version || '10.3'}
            </strong>
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <Info size={12} /> Static analysis only
          </span>
        </div>
      </div>
    </div>
  );
};
