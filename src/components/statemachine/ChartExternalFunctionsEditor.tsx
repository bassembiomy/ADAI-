import React, { useEffect, useState } from 'react';
import type { ExternalFunctionDef, VariableType } from '../../types/sm_types';
import { nextParamName, validateExternalFunctionDraft } from '../../utils/stateMachine/smChartSettingsEditing';

/** Types an external function parameter or return value may have (the engine's list). */
export const EXTERNAL_FUNCTION_TYPES: readonly VariableType[] = [
  'bool', 'int', 'uint', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'float', 'single', 'double',
];

export interface ChartExternalFunctionsEditorProps {
  functions: readonly ExternalFunctionDef[];
  /** Variable names and ids and event names an external function may not reuse. */
  reservedNames: ReadonlySet<string>;
  /** Number of places that call each function by name, for the delete hint. */
  callCounts?: Readonly<Record<string, number>>;
  onAdd: () => void;
  /** Called with a complete, valid declaration only. */
  onChange: (def: ExternalFunctionDef) => void;
  onDelete: (id: string) => void;
}

interface RowProps {
  def: ExternalFunctionDef;
  functions: readonly ExternalFunctionDef[];
  reservedNames: ReadonlySet<string>;
  callCount: number;
  onChange: ChartExternalFunctionsEditorProps['onChange'];
  onDelete: ChartExternalFunctionsEditorProps['onDelete'];
}

const inputClass = (invalid: boolean) =>
  `h-6 min-w-0 text-[10px] font-mono bg-[#0d0d0d] border rounded px-1.5 ${invalid ? 'border-red-500' : 'border-[#222]'}`;

const FunctionRow: React.FC<RowProps> = ({ def, functions, reservedNames, callCount, onChange, onDelete }) => {
  // The draft is applied to the chart only while it is valid; otherwise the messages stay under the row.
  const [draft, setDraft] = useState<ExternalFunctionDef>(def);
  useEffect(() => { setDraft(def); }, [def]);

  const problems = validateExternalFunctionDraft(functions, draft, reservedNames);
  const pending = draft !== def;

  const edit = (patch: Partial<ExternalFunctionDef>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (validateExternalFunctionDraft(functions, next, reservedNames).length === 0) onChange(next);
  };
  const editParam = (index: number, patch: Partial<ExternalFunctionDef['params'][number]>) =>
    edit({ params: draft.params.map((param, at) => (at === index ? { ...param, ...patch } : param)) });

  return (
    <div className="group border-b border-[#1a1a1a] last:border-0 px-4 py-2 space-y-1.5" data-testid="chart-external-function-row">
      <div className="flex items-center gap-2">
        <input data-help-feature="app-extfn-name" data-help-source="src/App.tsx"
          aria-label={`External function name ${def.name}`}
          aria-invalid={problems.length > 0}
          value={draft.name}
          onChange={(e) => edit({ name: e.target.value })}
          className={`${inputClass(problems.length > 0)} flex-1`}
        />
        <select data-help-feature="app-extfn-return" data-help-source="src/App.tsx"
          aria-label={`Return type of ${def.name}`}
          value={draft.returnType}
          onChange={(e) => edit({ returnType: e.target.value as VariableType })}
          className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
        >
          {EXTERNAL_FUNCTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <button data-help-feature="app-extfn-delete" data-help-source="src/App.tsx"
          type="button"
          aria-label={`Delete external function ${def.name}`}
          onClick={() => onDelete(def.id)}
          className="text-[#444] hover:text-red-500 opacity-60 group-hover:opacity-100 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <label className="flex items-center gap-2 text-[9px] text-[#666]">
        Header
        <input data-help-feature="app-extfn-header" data-help-source="src/App.tsx"
          aria-label={`Header of ${def.name}`}
          spellCheck={false}
          value={draft.header}
          onChange={(e) => edit({ header: e.target.value })}
          className={`${inputClass(false)} flex-1`}
        />
      </label>
      <div className="space-y-1">
        {draft.params.map((param, index) => (
          <div key={index} className="flex items-center gap-2" data-testid="chart-external-function-param">
            <input data-help-feature="app-extfn-param" data-help-source="src/App.tsx"
              aria-label={`Parameter ${index + 1} name of ${def.name}`}
              spellCheck={false}
              value={param.name}
              onChange={(e) => editParam(index, { name: e.target.value })}
              className={`${inputClass(false)} flex-1`}
            />
            <select data-help-feature="app-extfn-param" data-help-source="src/App.tsx"
              aria-label={`Parameter ${index + 1} type of ${def.name}`}
              value={param.type}
              onChange={(e) => editParam(index, { type: e.target.value as VariableType })}
              className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
            >
              {EXTERNAL_FUNCTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button data-help-feature="app-extfn-param" data-help-source="src/App.tsx"
              type="button"
              aria-label={`Remove parameter ${index + 1} of ${def.name}`}
              onClick={() => edit({ params: draft.params.filter((_, at) => at !== index) })}
              className="text-[#444] hover:text-red-500"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button data-help-feature="app-extfn-param" data-help-source="src/App.tsx"
          type="button"
          aria-label={`Add parameter to ${def.name}`}
          onClick={() => edit({ params: [...draft.params, { name: nextParamName(draft), type: 'int32' }] })}
          className="h-5 px-1.5 rounded border border-[#333] text-[9px] text-[#aaa] hover:border-[#f97316] hover:text-[#f97316]"
        >
          + PARAMETER
        </button>
      </div>
      <label className="flex items-center gap-2 text-[9px] text-[#666]">
        Simulation
        <input data-help-feature="app-extfn-simulation" data-help-source="src/App.tsx"
          aria-label={`Simulation expression of ${def.name}`}
          spellCheck={false}
          placeholder="e.g. x * 2"
          value={draft.simulation}
          onChange={(e) => edit({ simulation: e.target.value })}
          className={`${inputClass(problems.some((message) => message.includes('simulation')))} flex-1 font-mono`}
        />
      </label>
      {problems.map((message) => (
        <p key={message} role="alert" className="text-[9px] text-red-500">{message}</p>
      ))}
      {pending && problems.length > 0 && (
        <p className="text-[9px] text-amber-500">Not applied to the chart until the errors are fixed.</p>
      )}
      {callCount > 0 && (
        <p className="text-[9px] text-[#555]">Called in {callCount} place{callCount === 1 ? '' : 's'} of the chart. Renaming does not update the calls.</p>
      )}
    </div>
  );
};

/** "External functions" section of the variables panel: hand-written C functions the chart may call. */
export const ChartExternalFunctionsEditor: React.FC<ChartExternalFunctionsEditorProps> = ({
  functions, reservedNames, callCounts, onAdd, onChange, onDelete,
}) => (
  <div className="border-t border-[#222]" data-testid="chart-external-functions-editor">
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">External functions</span>
      <button data-help-feature="app-extfn-add" data-help-source="src/App.tsx"
        type="button"
        onClick={onAdd}
        className="h-6 px-2 rounded bg-[#f97316] text-[#0a0a0a] text-[10px] font-bold hover:bg-[#ea580c]"
      >
        ADD FUNCTION
      </button>
    </div>
    <div>
      {functions.map((def) => (
        <FunctionRow
          key={def.id}
          def={def}
          functions={functions}
          reservedNames={reservedNames}
          callCount={callCounts?.[def.name] ?? 0}
          onChange={onChange}
          onDelete={onDelete}
        />
      ))}
      {functions.length === 0 && (
        <p className="px-4 pb-3 text-[10px] text-[#555]">
          No external functions. Declare a hand-written C function to call it from guards and actions, for example <span className="font-mono">y = scale(x);</span>. The simulation expression stands in for the C code.
        </p>
      )}
    </div>
  </div>
);
