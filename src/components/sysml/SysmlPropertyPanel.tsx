import React, { useState, useEffect, useCallback } from 'react';
import {
  getInspectorSchema,
  type InspectorSelection,
  type InspectorSchema,
  type InspectorField,
} from '../../features/sysml/inspectorSchema';
import type { SysmlCommand } from '../../engine/sysml/commands/types';

export interface SysmlPropertyPanelProps {
  selection: InspectorSelection;
  onExecuteCommand?: (command: SysmlCommand) => void;
  className?: string;
}

export const SysmlPropertyPanel: React.FC<SysmlPropertyPanelProps> = ({
  selection,
  onExecuteCommand,
  className = '',
}) => {
  const schema: InspectorSchema | null = getInspectorSchema(selection);

  if (!schema) {
    return (
      <div className={`p-4 text-xs text-[var(--text-muted)] ${className}`}>
        No SysML element selected.
      </div>
    );
  }

  return (
    <div
      aria-label="SysML Property Inspector"
      className={`sysml-property-panel flex flex-col h-full bg-[var(--surface-panel)] border-l border-[var(--border-default)] p-3 overflow-y-auto text-xs ${className}`}
    >
      <div className="panel-header mb-4 pb-2 border-b border-[var(--border-default)]">
        <h3 className="font-semibold text-sm text-[var(--text-primary)]">{schema.title}</h3>
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">{schema.metaclass}</span>
      </div>

      <div className="panel-fields flex flex-col gap-3 flex-1">
        {schema.fields.map((field) => (
          <PropertyFieldRow
            key={field.key}
            field={field}
            onCommit={(val) => {
              if (field.toCommand && onExecuteCommand) {
                const cmd = field.toCommand(val);
                onExecuteCommand(cmd);
              }
            }}
          />
        ))}
      </div>

      {schema.actions.length > 0 && (
        <div className="panel-actions mt-4 pt-3 border-t border-[var(--border-default)] flex gap-2">
          {schema.actions.map((action) => (
            <button
              key={action.id}
              disabled={!action.enabled}
              title={action.disabledReason}
              onClick={() => {
                if (action.toCommand && onExecuteCommand) {
                  onExecuteCommand(action.toCommand());
                }
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                action.id === 'delete'
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]'
              } ${!action.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface PropertyFieldRowProps {
  field: InspectorField;
  onCommit: (val: unknown) => void;
}

const PropertyFieldRow: React.FC<PropertyFieldRowProps> = ({ field, onCommit }) => {
  const [localVal, setLocalVal] = useState<unknown>(field.value);
  const fieldLabelId = `field-${field.key}-label`;
  const warningId = field.referenceWarning ? `field-${field.key}-warning` : undefined;

  useEffect(() => {
    setLocalVal(field.value);
  }, [field.value]);

  const handleBlur = () => {
    if (localVal !== field.value) {
      onCommit(localVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  const readOnlyValue = field.valueType === 'stringList' && Array.isArray(field.value)
    ? field.value.join(', ')
    : field.valueType === 'multiSelect' && Array.isArray(field.value)
    ? field.value.map(value => field.options?.find(option => option.value === value)?.label ?? '').join(', ')
    : field.valueType === 'select'
      ? field.options?.find(option => option.value === field.value)?.label ?? ''
      : String(field.value ?? '');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        {field.mode === 'readOnly' ? (
          <span id={fieldLabelId} className="text-[11px] font-medium text-[var(--text-secondary)]">
            {field.label}
          </span>
        ) : (
          <label htmlFor={`field-${field.key}`} className="text-[11px] font-medium text-[var(--text-secondary)]">
            {field.label}
          </label>
        )}
        {field.mode === 'readOnly' && (
          <span className="text-[10px] text-[var(--text-muted)] italic" title={field.readOnlyReason}>
            Read-only
          </span>
        )}
      </div>

      {field.mode === 'readOnly' ? (
        <div
          id={`field-${field.key}`}
          role="textbox"
          aria-readonly="true"
          aria-labelledby={fieldLabelId}
          aria-describedby={warningId}
          className="px-2 py-1 bg-[var(--surface-canvas)] rounded border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs select-text cursor-default"
          title={field.readOnlyReason}
        >
          {readOnlyValue}
        </div>
      ) : field.valueType === 'select' && field.options ? (
        <select
          id={`field-${field.key}`}
          aria-label={field.label}
          aria-describedby={warningId}
          value={String(localVal ?? '')}
          onChange={(e) => {
            setLocalVal(e.target.value);
            onCommit(e.target.value);
          }}
          className="px-2 py-1 bg-[var(--surface-canvas)] rounded border border-[var(--border-default)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--brand-primary)]"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.valueType === 'multiSelect' && field.options ? (
        <div
          id={`field-${field.key}`}
          role="group"
          aria-label={field.label}
          aria-describedby={warningId}
          className="flex flex-col gap-1 px-2 py-1 bg-[var(--surface-canvas)] rounded border border-[var(--border-default)] max-h-32 overflow-y-auto"
        >
          {field.options.length === 0 && <span className="text-[10px] text-[var(--text-muted)] italic">Nothing available to choose.</span>}
          {field.options.map((opt) => {
            const selected = Array.isArray(localVal) ? (localVal as unknown[]).map(String) : [];
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter(value => value !== opt.value);
                    setLocalVal(next);
                    onCommit(next);
                  }}
                  className="rounded border-[var(--border-default)] text-[var(--brand-primary)]"
                />
                <span className="text-xs text-[var(--text-primary)]">{opt.label}</span>
              </label>
            );
          })}
        </div>
      ) : field.valueType === 'stringList' ? (
        <textarea
          id={`field-${field.key}`}
          aria-label={field.label}
          rows={3}
          placeholder="One entry per line"
          value={Array.isArray(localVal) ? (localVal as unknown[]).join('\n') : String(localVal ?? '')}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={() => {
            const lines = (typeof localVal === 'string' ? localVal : (Array.isArray(localVal) ? (localVal as unknown[]).join('\n') : ''))
              .split('\n').map(line => line.trim()).filter(Boolean);
            const original = (Array.isArray(field.value) ? (field.value as unknown[]).map(String) : []);
            if (lines.join('\n') !== original.join('\n')) onCommit(lines);
          }}
          className="px-2 py-1 bg-[var(--surface-canvas)] rounded border border-[var(--border-default)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--brand-primary)]"
        />
      ) : field.valueType === 'boolean' ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            id={`field-${field.key}`}
            type="checkbox"
            checked={Boolean(localVal)}
            onChange={(e) => {
              setLocalVal(e.target.checked);
              onCommit(e.target.checked);
            }}
            className="rounded border-[var(--border-default)] text-[var(--brand-primary)]"
          />
          <span className="text-xs text-[var(--text-primary)]">{field.label}</span>
        </label>
      ) : (
        <input
          id={`field-${field.key}`}
          name={field.key}
          aria-label={field.key === 'name' ? 'Element Name' : field.label}
          type="text"
          value={String(localVal ?? '')}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="px-2 py-1 bg-[var(--surface-canvas)] rounded border border-[var(--border-default)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--brand-primary)]"
        />
      )}
      {field.referenceWarning && (
        <p id={warningId} role="status" className="text-[10px] text-[var(--text-muted)]">
          {field.referenceWarning}
        </p>
      )}
    </div>
  );
};
