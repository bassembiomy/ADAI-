import React, { useEffect, useRef, useState } from 'react';
import { describeBounds } from '../../engine/vlab/vlabParams';
import { getParamSpec, validateParamText } from './vlabParamEditing';

export interface VLabParamFieldProps {
  blockType: string;
  paramKey: string;
  /** the serialized parameter `{ value, unit, label }` */
  param: { value?: unknown; unit?: string; label?: string };
  /** called with the validated number (numeric parameter) or the raw text (text parameter) */
  onCommit: (value: number | string) => void;
  className?: string;
  /** help-system data attributes (data-help-*) are forwarded to the <input> */
  [dataAttribute: `data-${string}`]: string | undefined;
  /** renders the <input> itself (so the caller owns its data-help attributes); it receives the field's props */
  children?: (inputProps: React.InputHTMLAttributes<HTMLInputElement>) => React.ReactElement;
}

const INPUT_CLASS = 'w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none';

/**
 * Parameter editor. A numeric parameter is a text box validated ONLY by the WP-08 schema: the entered text is kept after blur,
 * a valid value is committed to the model as a number, an invalid or out-of-bounds text shows an inline error and is never
 * silently reverted. The SI unit is shown next to the box.
 */
export const VLabParamField: React.FC<VLabParamFieldProps> = ({ blockType, paramKey, param, onCommit, className, children, ...rest }) => {
  const dataProps = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-')));
  const spec = getParamSpec(blockType, paramKey);
  const numeric = spec ? typeof spec.value === 'number' : typeof (param.value ?? 0) === 'number';
  const unit = param.unit || spec?.unit || '';
  const [text, setText] = useState(String(param.value ?? ''));
  const [error, setError] = useState<string | null>(null);
  const committed = useRef<unknown>(param.value);

  // the model changed from outside (undo, another selection, open): show its value. Our own commits do not re-sync.
  useEffect(() => {
    if (param.value === committed.current) return;
    committed.current = param.value;
    setText(String(param.value ?? ''));
    setError(null);
  }, [param.value]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setText(next);
    if (!numeric) {
      committed.current = next;
      onCommit(next);
      return;
    }
    const result = validateParamText(next, spec);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    committed.current = result.value;
    onCommit(result.value);
  };

  const bounds = spec ? describeBounds(spec) : '';
  const errorId = `vlab-param-error-${paramKey}`;
  const renderInput = children ?? ((props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...dataProps} {...props} />);
  return (
    <div className="space-y-1" data-testid={`vlab-param-${paramKey}`}>
      <div className="relative">
        {renderInput({
          type: 'text',
          inputMode: numeric ? 'decimal' : undefined,
          spellCheck: false,
          autoComplete: 'off',
          'aria-label': param.label || paramKey,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? errorId : undefined,
          title: bounds ? `${param.label || paramKey}${unit ? ` [${unit}]` : ''}: ${bounds}` : undefined,
          value: text,
          onChange,
          className: `${className ?? INPUT_CLASS} ${error ? '!border-red-500 text-red-300' : ''} ${numeric && unit ? 'pr-12' : ''}`,
        })}
        {numeric && unit && (
          <span data-testid={`vlab-param-unit-${paramKey}`} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-gray-500">{unit}</span>
        )}
      </div>
      {error && <div id={errorId} role="alert" className="text-[10px] text-red-400">{error}</div>}
    </div>
  );
};
