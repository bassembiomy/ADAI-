import React, { useEffect, useState } from 'react';
import type { FixedPointFormat } from '../../types/sm_types';
import { changeWordLength, describeFixedPoint, fractionLengthProblem } from '../../utils/stateMachine/smChartSettingsEditing';

export interface FixedPointFormatEditorProps {
  /** Name used in the accessible labels, e.g. the variable name. */
  label: string;
  value: FixedPointFormat;
  onChange: (format: FixedPointFormat) => void;
  disabled?: boolean;
}

const WORD_LENGTHS: FixedPointFormat['wordLength'][] = [8, 16, 32];

/** Signed / word length / fraction length controls of a fixdt variable, with inline validation. */
export const FixedPointFormatEditor: React.FC<FixedPointFormatEditorProps> = ({ label, value, onChange, disabled }) => {
  const [fractionDraft, setFractionDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = fractionDraft ?? String(value.fractionLength);
  const error = fractionDraft === null ? null : fractionLengthProblem(fractionDraft, value.wordLength);

  useEffect(() => { setFractionDraft(null); }, [value.fractionLength, value.wordLength]);

  return (
    <div className="col-span-2 space-y-1 rounded border border-[#222] bg-[#0d0d0d] px-2 py-1.5" data-testid="fixed-point-editor">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[10px] text-[#aaa]">
          <input data-help-feature="app-variable-fixed-signed" data-help-source="src/App.tsx"
            type="checkbox"
            aria-label={`Signed ${label}`}
            checked={value.signed}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, signed: e.target.checked })}
          />
          Signed
        </label>
        <label className="flex items-center gap-1 text-[10px] text-[#aaa]">
          Word
          <select data-help-feature="app-variable-fixed-word" data-help-source="src/App.tsx"
            aria-label={`Word length ${label}`}
            value={value.wordLength}
            disabled={disabled}
            onChange={(e) => {
              const result = changeWordLength(value, Number(e.target.value) as FixedPointFormat['wordLength']);
              setNotice(result.fractionClamped ? `Fraction length reduced to ${result.format.fractionLength} to fit the word length.` : null);
              onChange(result.format);
            }}
            className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
          >
            {WORD_LENGTHS.map((bits) => <option key={bits} value={bits}>{bits}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] text-[#aaa]">
          Fraction
          <input data-help-feature="app-variable-fixed-fraction" data-help-source="src/App.tsx"
            type="number"
            min={0}
            max={value.wordLength}
            step={1}
            aria-label={`Fraction length ${label}`}
            aria-invalid={error !== null}
            value={shown}
            disabled={disabled}
            onChange={(e) => {
              const text = e.target.value;
              setNotice(null);
              if (fractionLengthProblem(text, value.wordLength) === null) {
                setFractionDraft(null);
                onChange({ ...value, fractionLength: Number(text) });
              } else {
                setFractionDraft(text);
              }
            }}
            className={`h-6 w-14 text-[10px] font-mono bg-[#0d0d0d] border rounded px-1 ${error ? 'border-red-500' : 'border-[#222]'}`}
          />
        </label>
      </div>
      {error && <p role="alert" className="text-[9px] text-red-500">{error}</p>}
      {!error && notice && <p role="status" className="text-[9px] text-amber-500">{notice}</p>}
      <p className="text-[9px] font-mono text-[#555]">{describeFixedPoint(value)}</p>
    </div>
  );
};
