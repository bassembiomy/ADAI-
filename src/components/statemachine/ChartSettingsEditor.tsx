import React, { useEffect, useState } from 'react';
import type { FixedPointRounding, TimingFaultPolicy } from '../../types/sm_types';
import {
  codePrefixFileHints,
  codePrefixInputProblem,
  storedCodePrefix,
} from '../../utils/stateMachine/smChartSettingsEditing';

export interface ChartSettingsEditorProps {
  fixedPointRounding: FixedPointRounding | undefined;
  onFixedPointRoundingChange: (rounding: FixedPointRounding | undefined) => void;
  /** Undefined means 'latch' (fault on a late or early tick). */
  timingFaultPolicy?: TimingFaultPolicy;
  onTimingFaultPolicyChange?: (policy: TimingFaultPolicy | undefined) => void;
  /** Stored prefix; undefined is the default 'SM'. */
  codePrefix: string | undefined;
  onCodePrefixChange: (prefix: string | undefined) => void;
  /** Stateflow default: enter the chart on the first step. */
  enterAtFirstStep: boolean;
  onEnterAtFirstStepChange: (enabled: boolean) => void;
}

/** "Chart settings" section of the variables panel: fixed-point rounding, late/early tick policy, code prefix and first-step entry. */
export const ChartSettingsEditor: React.FC<ChartSettingsEditorProps> = ({
  fixedPointRounding, onFixedPointRoundingChange, timingFaultPolicy, onTimingFaultPolicyChange, codePrefix, onCodePrefixChange, enterAtFirstStep, onEnterAtFirstStepChange,
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? codePrefix ?? '';
  const error = codePrefixInputProblem(shown);
  const hints = codePrefixFileHints(error === null ? storedCodePrefix(shown) : codePrefix);

  useEffect(() => { setDraft(null); }, [codePrefix]);

  return (
    <div className="border-t border-[#222] px-4 py-2 space-y-2" data-testid="chart-settings-editor">
      <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Chart settings</span>
      <label className="flex items-center justify-between gap-2 text-[10px] text-[#aaa]">
        Fixed-point rounding
        <select data-help-feature="app-chart-fixed-rounding" data-help-source="src/App.tsx"
          aria-label="Fixed-point rounding"
          value={fixedPointRounding ?? 'floor'}
          onChange={(e) => onFixedPointRoundingChange(e.target.value === 'nearest' ? 'nearest' : undefined)}
          className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
        >
          <option value="floor">Floor</option>
          <option value="nearest">Nearest</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-[10px] text-[#aaa]">
        Late/early tick
        <select data-help-feature="app-chart-timing-policy" data-help-source="src/App.tsx"
          aria-label="Late/early tick policy"
          value={timingFaultPolicy ?? 'latch'}
          onChange={(e) => onTimingFaultPolicyChange?.(e.target.value === 'monitor' ? 'monitor' : undefined)}
          className="h-6 max-w-[11rem] text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
        >
          <option value="latch">Latch fault (default)</option>
          <option value="monitor">Monitor and continue (Stateflow)</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-[10px] text-[#aaa]">
        <input data-help-feature="app-chart-enter-first-step" data-help-source="src/App.tsx"
          type="checkbox"
          aria-label="Enter chart at first step (chart settings)"
          checked={enterAtFirstStep}
          onChange={(e) => onEnterAtFirstStepChange(e.target.checked)}
        />
        Enter chart at 1st step (Stateflow default)
      </label>
      <div>
        <label className="flex items-center justify-between gap-2 text-[10px] text-[#aaa]">
          Code prefix
          <input data-help-feature="app-chart-code-prefix" data-help-source="src/App.tsx"
            aria-label="Code prefix"
            aria-invalid={error !== null}
            placeholder="SM"
            spellCheck={false}
            value={shown}
            onChange={(e) => {
              const text = e.target.value;
              if (codePrefixInputProblem(text) === null) { setDraft(null); onCodePrefixChange(storedCodePrefix(text)); } else setDraft(text);
            }}
            className={`h-6 w-28 text-[10px] font-mono bg-[#0d0d0d] border rounded px-1.5 ${error ? 'border-red-500' : 'border-[#222]'}`}
          />
        </label>
        {error && <p role="alert" className="mt-1 text-[9px] text-red-500">{error}</p>}
        <p className="mt-1 text-[9px] font-mono text-[#555]" data-testid="code-prefix-files">Files: {hints.join(', ')}</p>
      </div>
    </div>
  );
};
