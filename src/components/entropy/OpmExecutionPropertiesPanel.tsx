/**
 * Property panel for inspecting and editing OPM executable attributes,
 * guards, actions, transitions, and timers with source-linked diagnostics.
 *
 * Every editable control carries `data-opm-path` with the canonical engine
 * property path so diagnostics navigation can focus the exact target
 * (Task 6 Issue 1). Display-name edits never copy raw text into
 * `cIdentifier` — identifiers are always derived via `toCIdentifier`.
 */

import React from 'react';
import type { AppNode, AppEdge } from './EntropyTypes';
import type {
  OpmExecutionConfig,
  OpmDiagnostic,
  OpmAttribute,
  OpmAssignment,
  OpmProcessExecution,
  OpmStateExecution,
  OpmObjectExecution,
  OpmLinkExecution,
  OpmScalarType,
  OpmEnumMember,
  OpmEventDefinition,
  OpmEnumDefinition,
  CanonicalOpmValue,
} from '../../engine/opm/executableTypes';
import { Settings, Plus, Trash2, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';

export interface OpmExecutionSelection {
  type: 'object' | 'state' | 'process' | 'link' | 'canvas';
  id?: string;
  name?: string;
  execution?: any;
  element?: AppNode | AppEdge;
}

export interface OpmExecutionPropertiesPanelProps {
  selection?: OpmExecutionSelection | null;
  executionConfig?: OpmExecutionConfig;
  onUpdateSelectionExecution: (updatedExecution: any) => void;
  onUpdateExecutionConfig?: (config: OpmExecutionConfig) => void;
  onOpenSettings?: () => void;
  diagnostics?: OpmDiagnostic[];
  /** All writable attributes in the diagram for legal reference selection. */
  writableAttributes?: readonly Pick<OpmAttribute, 'id' | 'displayName'>[];
}

/** Derive a legal C identifier from a display name. Never copies raw text. */
export function toCIdentifier(displayName: string, fallback: string): string {
  const sanitized = displayName
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || fallback;
}

let stableIdCounter = 0;
export function nextStableId(prefix: string): string {
  stableIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${stableIdCounter}`;
}

// ---------------------------------------------------------------------------
// TypedValueEditor
// ---------------------------------------------------------------------------

export interface TypedValueEditorProps {
  type: OpmScalarType;
  value: CanonicalOpmValue | string | number | boolean | null;
  enumOptions?: readonly OpmEnumMember[];
  onChange: (next: CanonicalOpmValue | string | number | boolean | null) => void;
  /** data-testid prefix for the rendered control. */
  testId?: string;
  /** Canonical engine property path for diagnostics focus. */
  opmPath?: string;
  label?: string;
}

export const TypedValueEditor: React.FC<TypedValueEditorProps> = ({
  type,
  value,
  enumOptions = [],
  onChange,
  testId = 'typed-value-input',
  opmPath,
  label,
}) => {
  const pathProps = opmPath ? { 'data-opm-path': opmPath } : {};
  const ariaProps = label ? { 'aria-label': label } : {};

  if (type.kind === 'bool') {
    const checked = value === true;
    return (
      <input
        data-testid={testId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        {...pathProps}
        {...ariaProps}
        className="rounded border-[#333] bg-[#0d0d0d] text-emerald-500 w-3.5 h-3.5"
      />
    );
  }

  if (type.kind === 'enum') {
    const currentMemberId =
      typeof value === 'object' && value !== null ? (value as { memberId: string }).memberId : String(value ?? '');
    return (
      <select
        data-testid={testId}
        value={currentMemberId}
        onChange={(e) => {
          const member = enumOptions.find((m) => m.id === e.target.value);
          if (member) {
            onChange({ enumId: type.enumId, memberId: member.id, cIdentifier: member.cIdentifier });
          }
        }}
        {...pathProps}
        {...ariaProps}
        className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono w-20"
      >
        <option value="">-- select --</option>
        {enumOptions.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
    );
  }

  // Numeric kinds: int32 / uint32 / float32 — always stay numbers.
  const numericValue =
    typeof value === 'number' ? value : typeof value === 'boolean' ? Number(value) : Number(value);
  return (
    <input
      data-testid={testId}
      type="number"
      value={Number.isFinite(numericValue) ? numericValue : 0}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      {...pathProps}
      {...ariaProps}
      className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono w-20"
    />
  );
};

// ---------------------------------------------------------------------------
// AssignmentRows
// ---------------------------------------------------------------------------

export interface AssignmentRowsProps {
  value: readonly OpmAssignment[];
  writableAttributes: readonly Pick<OpmAttribute, 'id' | 'displayName'>[];
  onChange: (next: OpmAssignment[]) => void;
  /** Canonical engine path prefix, e.g. `processExecution.assignments`. */
  basePath?: string;
  /** data-testid prefix for row controls. */
  testIdPrefix?: string;
}

export const AssignmentRows: React.FC<AssignmentRowsProps> = ({
  value,
  writableAttributes,
  onChange,
  basePath = 'assignments',
  testIdPrefix = 'assignment',
}) => {
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const patch = (index: number, p: Partial<OpmAssignment>) => {
    const next = [...value];
    next[index] = { ...next[index], ...p };
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-1.5">
      {value.map((asgn, idx) => (
        <div
          key={asgn.id}
          className="p-1.5 bg-black/40 border border-[#2d2d2d] rounded flex items-center gap-1"
        >
          <select
            data-testid="target-attr-select"
            aria-label={`Assignment ${idx + 1} target attribute`}
            data-opm-path={`${basePath}[${idx}].targetAttributeId`}
            value={asgn.targetAttributeId}
            onChange={(e) => patch(idx, { targetAttributeId: e.target.value })}
            className="bg-[#111] border border-[#333] rounded px-1 py-0.5 text-xs text-white font-mono w-24"
          >
            <option value="">-- target --</option>
            {writableAttributes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName || a.id}
              </option>
            ))}
          </select>
          <select
            data-testid="assignment-op-select"
            aria-label={`Assignment ${idx + 1} operator`}
            data-opm-path={`${basePath}[${idx}].operator`}
            value={asgn.operator}
            onChange={(e) => patch(idx, { operator: e.target.value as any })}
            className="bg-[#111] border border-[#333] rounded px-1 py-0.5 text-xs text-gray-300"
          >
            <option value="=">=</option>
            <option value="+=">+=</option>
            <option value="-=">-=</option>
            <option value="*=">*=</option>
            <option value="/=">/=</option>
          </select>
          <input
            data-testid="assignment-expr-input"
            aria-label={`Assignment ${idx + 1} expression`}
            data-opm-path={`${basePath}[${idx}].expression`}
            value={asgn.expression}
            onChange={(e) => patch(idx, { expression: e.target.value })}
            placeholder="expression"
            className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-xs text-white font-mono flex-1"
          />
          <label className="flex items-center gap-0.5 text-[9px] text-gray-400" title="Enabled">
            <input
              data-testid={`${testIdPrefix}-enabled-checkbox`}
              aria-label={`Assignment ${idx + 1} enabled`}
              data-opm-path={`${basePath}[${idx}].enabled`}
              type="checkbox"
              checked={asgn.enabled !== false}
              onChange={(e) => patch(idx, { enabled: e.target.checked })}
            />
          </label>
          <button
            data-testid={`${testIdPrefix}-move-up-btn`}
            aria-label={`Move assignment ${idx + 1} up`}
            data-opm-path={`${basePath}[${idx}].order`}
            onClick={() => move(idx, -1)}
            disabled={idx === 0}
            className="text-gray-400 hover:text-white p-0.5 disabled:opacity-30"
          >
            <ArrowUp size={12} />
          </button>
          <button
            data-testid={`${testIdPrefix}-move-down-btn`}
            aria-label={`Move assignment ${idx + 1} down`}
            data-opm-path={`${basePath}[${idx}].order`}
            onClick={() => move(idx, 1)}
            disabled={idx === value.length - 1}
            className="text-gray-400 hover:text-white p-0.5 disabled:opacity-30"
          >
            <ArrowDown size={12} />
          </button>
          <button
            data-testid="delete-assignment-btn"
            aria-label={`Delete assignment ${idx + 1}`}
            onClick={() => remove(idx)}
            className="text-red-500 hover:text-red-400 p-0.5"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export const OpmExecutionPropertiesPanel: React.FC<OpmExecutionPropertiesPanelProps> = ({
  selection,
  executionConfig,
  onUpdateSelectionExecution,
  onUpdateExecutionConfig,
  onOpenSettings,
  diagnostics = [],
  writableAttributes = [],
}) => {
  const enumById = (() => {
    const map = new Map<string, OpmEnumDefinition>();
    for (const e of executionConfig?.enums ?? []) map.set(e.id, e);
    return map;
  })();

  const events: readonly OpmEventDefinition[] = executionConfig?.events ?? [];

  const renderDiagnostics = () => {
    if (diagnostics.length === 0) return null;
    return (
      <div className="mt-4 flex flex-col gap-1.5">
        <span className="font-bold text-amber-400 flex items-center gap-1">
          <AlertTriangle size={14} /> Model Diagnostics ({diagnostics.length})
        </span>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {diagnostics.map((d, i) => (
            <div
              key={i}
              data-opm-path={d.source.propertyPath}
              className={`p-1.5 rounded text-[10px] font-mono border ${
                d.severity === 'error'
                  ? 'bg-red-950/40 text-red-300 border-red-900/60'
                  : 'bg-amber-950/40 text-amber-300 border-amber-900/60'
              }`}
            >
              <span className="font-bold">[{d.code}]</span> {d.message}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const updateEvent = (index: number, patch: Partial<OpmEventDefinition>) => {
    if (!executionConfig || !onUpdateExecutionConfig) return;
    const next = [...executionConfig.events];
    next[index] = { ...next[index], ...patch };
    onUpdateExecutionConfig({ ...executionConfig, events: next });
  };

  const addEvent = () => {
    if (!executionConfig || !onUpdateExecutionConfig) return;
    const id = nextStableId('ev');
    const ev: OpmEventDefinition = {
      id,
      displayName: `event_${executionConfig.events.length + 1}`,
      cIdentifier: toCIdentifier(`event_${executionConfig.events.length + 1}`, id),
    };
    onUpdateExecutionConfig({ ...executionConfig, events: [...executionConfig.events, ev] });
  };

  const deleteEvent = (index: number) => {
    if (!executionConfig || !onUpdateExecutionConfig) return;
    onUpdateExecutionConfig({
      ...executionConfig,
      events: executionConfig.events.filter((_, i) => i !== index),
    });
  };

  const updateEnum = (index: number, patch: Partial<OpmEnumDefinition>) => {
    if (!executionConfig || !onUpdateExecutionConfig) return;
    const next = [...executionConfig.enums];
    next[index] = { ...next[index], ...patch };
    onUpdateExecutionConfig({ ...executionConfig, enums: next });
  };

  const addEnum = () => {
    if (!executionConfig || !onUpdateExecutionConfig) return;
    const id = nextStableId('en');
    const en: OpmEnumDefinition = {
      id,
      displayName: `enum_${executionConfig.enums.length + 1}`,
      cIdentifier: toCIdentifier(`enum_${executionConfig.enums.length + 1}`, id),
      members: [],
    };
    onUpdateExecutionConfig({ ...executionConfig, enums: [...executionConfig.enums, en] });
  };

  const deleteEnum = (index: number) => {
    if (!executionConfig || !onUpdateExecutionConfig) return;
    onUpdateExecutionConfig({
      ...executionConfig,
      enums: executionConfig.enums.filter((_, i) => i !== index),
    });
  };

  const renderEventEnumTables = () => {
    if (!executionConfig) return null;
    return (
      <div className="mt-3 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase text-gray-400">
              Events ({events.length})
            </span>
            <button
              data-testid="add-event-btn"
              aria-label="Add event"
              onClick={addEvent}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-800 rounded hover:bg-sky-900"
            >
              <Plus size={10} /> Add Event
            </button>
          </div>
          <div className="space-y-1">
            {executionConfig.events.map((ev, idx) => (
              <div key={ev.id} className="flex items-center gap-1">
                <input
                  data-testid="event-name-input"
                  aria-label={`Event ${idx + 1} display name`}
                  data-opm-path={`events[${idx}].displayName`}
                  value={ev.displayName}
                  onChange={(e) =>
                    updateEvent(idx, {
                      displayName: e.target.value,
                      cIdentifier: toCIdentifier(e.target.value, ev.id),
                    })
                  }
                  className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono flex-1"
                />
                <button
                  data-testid="delete-event-btn"
                  aria-label={`Delete event ${idx + 1}`}
                  onClick={() => deleteEvent(idx)}
                  className="text-red-500 hover:text-red-400 p-0.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase text-gray-400">
              Enums ({executionConfig.enums.length})
            </span>
            <button
              data-testid="add-enum-btn"
              aria-label="Add enum"
              onClick={addEnum}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-purple-950 text-purple-400 border border-purple-800 rounded hover:bg-purple-900"
            >
              <Plus size={10} /> Add Enum
            </button>
          </div>
          <div className="space-y-1">
            {executionConfig.enums.map((en, idx) => (
              <div key={en.id} className="flex items-center gap-1">
                <input
                  data-testid="enum-name-input"
                  aria-label={`Enum ${idx + 1} display name`}
                  data-opm-path={`enums[${idx}].displayName`}
                  value={en.displayName}
                  onChange={(e) =>
                    updateEnum(idx, {
                      displayName: e.target.value,
                      cIdentifier: toCIdentifier(e.target.value, en.id),
                    })
                  }
                  className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono flex-1"
                />
                <span className="text-[9px] text-gray-500 font-mono">
                  {en.members.length} members
                </span>
                <button
                  data-testid="delete-enum-btn"
                  aria-label={`Delete enum ${idx + 1}`}
                  onClick={() => deleteEnum(idx)}
                  className="text-red-500 hover:text-red-400 p-0.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (!selection || selection.type === 'canvas') {
    return (
      <div className="flex flex-col h-full p-3 gap-3 bg-[#161616] text-gray-300 text-xs">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-2">
          <span className="font-extrabold uppercase text-gray-400 tracking-wider">
            Model Settings
          </span>
          {onOpenSettings && (
            <button
              data-testid="open-settings-btn"
              onClick={onOpenSettings}
              className="flex items-center gap-1 text-[10px] px-2 py-1 bg-sky-950 text-sky-400 border border-sky-800 rounded hover:bg-sky-900"
            >
              <Settings size={12} /> Target Settings
            </button>
          )}
        </div>

        <div className="text-gray-500 italic text-[11px]">
          Select an Object, State, Process, or Link to inspect and configure executable behavior.
        </div>

        {renderEventEnumTables()}
        {renderDiagnostics()}
      </div>
    );
  }

  // --- Object Inspector ---
  if (selection.type === 'object') {
    const exec: OpmObjectExecution = selection.execution || { enabled: true, attributes: [] };
    const attributes = exec.attributes || [];

    const handleAddAttribute = () => {
      const n = attributes.length + 1;
      const displayName = `var_${n}`;
      const newAttr: OpmAttribute = {
        id: nextStableId('attr'),
        displayName,
        cIdentifier: toCIdentifier(displayName, `var_${n}`),
        type: { kind: 'float32' },
        initialValue: 0,
        overflow: 'wrap',
        access: 'readWrite',
        persistent: false,
      };
      onUpdateSelectionExecution({ ...exec, attributes: [...attributes, newAttr] });
    };

    const handleUpdateAttribute = (index: number, patch: Partial<OpmAttribute>) => {
      const next = [...attributes];
      next[index] = { ...next[index], ...patch };
      onUpdateSelectionExecution({ ...exec, attributes: next });
    };

    const handleDeleteAttribute = (index: number) => {
      const next = attributes.filter((_, i) => i !== index);
      onUpdateSelectionExecution({ ...exec, attributes: next });
    };

    const handleMoveAttribute = (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= attributes.length) return;
      const next = [...attributes];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      onUpdateSelectionExecution({ ...exec, attributes: next });
    };

    return (
      <div className="flex flex-col h-full p-3 gap-3 bg-[#161616] text-gray-300 text-xs overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-2">
          <span className="font-extrabold uppercase text-emerald-400 tracking-wider">
            Object: {selection.name}
          </span>
          <button
            data-testid="add-attr-btn"
            aria-label="Add attribute"
            onClick={handleAddAttribute}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded hover:bg-emerald-900 font-bold"
          >
            <Plus size={12} /> Add Attribute
          </button>
        </div>

        <div className="space-y-2">
          {attributes.map((attr, idx) => {
            const enumDef =
              attr.type.kind === 'enum' ? enumById.get(attr.type.enumId) : undefined;
            return (
              <div
                key={attr.id}
                className="p-2 bg-black/40 border border-[#2d2d2d] rounded flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <input
                    data-testid="attr-name-input"
                    aria-label={`Attribute ${idx + 1} display name`}
                    data-opm-path={`objectExecution.attributes[${idx}].displayName`}
                    value={attr.displayName}
                    onChange={(e) =>
                      handleUpdateAttribute(idx, {
                        displayName: e.target.value,
                        cIdentifier: toCIdentifier(e.target.value, attr.id),
                      })
                    }
                    placeholder="Attribute name"
                    className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-xs text-white font-mono flex-1"
                  />
                  <button
                    data-testid="attr-move-up-btn"
                    aria-label={`Move attribute ${idx + 1} up`}
                    data-opm-path={`objectExecution.attributes[${idx}].order`}
                    onClick={() => handleMoveAttribute(idx, -1)}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-white p-1 disabled:opacity-30"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    data-testid="attr-move-down-btn"
                    aria-label={`Move attribute ${idx + 1} down`}
                    data-opm-path={`objectExecution.attributes[${idx}].order`}
                    onClick={() => handleMoveAttribute(idx, 1)}
                    disabled={idx === attributes.length - 1}
                    className="text-gray-400 hover:text-white p-1 disabled:opacity-30"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    data-testid="delete-attr-btn"
                    aria-label={`Delete attribute ${idx + 1}`}
                    onClick={() => handleDeleteAttribute(idx)}
                    className="text-red-500 hover:text-red-400 p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <select
                    data-testid="attr-type-select"
                    aria-label={`Attribute ${idx + 1} type`}
                    data-opm-path={`objectExecution.attributes[${idx}].type`}
                    value={attr.type.kind === 'enum' ? `enum:${attr.type.enumId}` : attr.type.kind}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith('enum:')) {
                        handleUpdateAttribute(idx, {
                          type: { kind: 'enum', enumId: v.slice(5) },
                          initialValue: '',
                        });
                      } else {
                        handleUpdateAttribute(idx, {
                          type: { kind: v as any },
                          initialValue: v === 'bool' ? false : 0,
                        });
                      }
                    }}
                    className="bg-[#111] border border-[#333] rounded px-1 py-0.5 text-[10px] text-gray-300 flex-1"
                  >
                    <option value="bool">bool</option>
                    <option value="int32">int32</option>
                    <option value="uint32">uint32</option>
                    <option value="float32">float32</option>
                    {(executionConfig?.enums ?? []).map((en) => (
                      <option key={en.id} value={`enum:${en.id}`}>
                        enum:{en.displayName}
                      </option>
                    ))}
                  </select>

                  <TypedValueEditor
                    type={attr.type}
                    value={attr.initialValue}
                    enumOptions={enumDef?.members}
                    testId="attr-initial-input"
                    opmPath={`objectExecution.attributes[${idx}].initialValue`}
                    label={`Attribute ${idx + 1} initial value`}
                    onChange={(next) => handleUpdateAttribute(idx, { initialValue: next })}
                  />
                </div>

                <div className="flex items-center gap-2 text-[9px] text-gray-400">
                  <label className="flex items-center gap-1">
                    Access:
                    <select
                      data-testid="attr-access-select"
                      aria-label={`Attribute ${idx + 1} access mode`}
                      data-opm-path={`objectExecution.attributes[${idx}].access`}
                      value={attr.access}
                      onChange={(e) =>
                        handleUpdateAttribute(idx, { access: e.target.value as any })
                      }
                      className="bg-[#111] border border-[#333] rounded px-1 py-0.5 text-[9px] text-gray-300"
                    >
                      <option value="readWrite">readWrite</option>
                      <option value="readOnly">readOnly</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Persistent:
                    <input
                      data-testid="attr-persistent-checkbox"
                      aria-label={`Attribute ${idx + 1} persistent`}
                      data-opm-path={`objectExecution.attributes[${idx}].persistent`}
                      type="checkbox"
                      checked={Boolean(attr.persistent)}
                      onChange={(e) =>
                        handleUpdateAttribute(idx, { persistent: e.target.checked })
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}

          {attributes.length === 0 && (
            <div className="text-gray-500 italic text-[11px] py-2">
              No executable attributes defined. Click &quot;Add Attribute&quot; to add stateful variables.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Process Inspector ---
  if (selection.type === 'process') {
    const exec: OpmProcessExecution = selection.execution || {
      enabled: true,
      activation: 'cyclic',
      inputAttributeIds: [],
      outputAttributeIds: [],
      guard: '',
      assignments: [],
      priority: 1,
      debounceMs: 0,
      reentrancy: 'reject',
    };

    const handleAddAssignment = () => {
      const newAsgn: OpmAssignment = {
        id: nextStableId('asgn'),
        targetAttributeId: '',
        operator: '=',
        expression: '0',
        enabled: true,
      };
      onUpdateSelectionExecution({
        ...exec,
        assignments: [...(exec.assignments || []), newAsgn],
      });
    };

    return (
      <div className="flex flex-col h-full p-3 gap-3 bg-[#161616] text-gray-300 text-xs overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-2">
          <span className="font-extrabold uppercase text-sky-400 tracking-wider">
            Process: {selection.name}
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-activation">
              Activation Mode
            </label>
            <select
              id="proc-activation"
              data-testid="process-activation-select"
              data-opm-path="processExecution.activation"
              value={exec.activation}
              onChange={(e) =>
                onUpdateSelectionExecution({ ...exec, activation: e.target.value as any })
              }
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white"
            >
              <option value="cyclic">cyclic</option>
              <option value="triggered">triggered</option>
              <option value="both">both</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-period">
                Period (ms)
              </label>
              <input
                id="proc-period"
                data-testid="process-period-input"
                data-opm-path="processExecution.periodMs"
                type="number"
                value={exec.periodMs ?? ''}
                onChange={(e) =>
                  onUpdateSelectionExecution({
                    ...exec,
                    periodMs: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 100"
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-priority">
                Priority
              </label>
              <input
                id="proc-priority"
                data-testid="process-priority-input"
                data-opm-path="processExecution.priority"
                type="number"
                value={exec.priority ?? 1}
                onChange={(e) =>
                  onUpdateSelectionExecution({ ...exec, priority: Number(e.target.value) })
                }
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-guard">
              Guard Expression
            </label>
            <input
              id="proc-guard"
              data-testid="guard-expr-input"
              data-opm-path="processExecution.guard"
              value={exec.guard || ''}
              onChange={(e) => onUpdateSelectionExecution({ ...exec, guard: e.target.value })}
              placeholder="e.g. temperature.value < 100.0"
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
            />
          </div>

          <div className="pt-2 border-t border-[#2d2d2d]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase text-gray-400">
                Action Assignments
              </span>
              <button
                data-testid="add-assignment-btn"
                aria-label="Add assignment"
                onClick={handleAddAssignment}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-800 rounded hover:bg-sky-900"
              >
                <Plus size={10} /> Add Assignment
              </button>
            </div>

            <AssignmentRows
              value={exec.assignments || []}
              writableAttributes={writableAttributes}
              basePath="processExecution.assignments"
              onChange={(next) => onUpdateSelectionExecution({ ...exec, assignments: next })}
            />
          </div>
        </div>
      </div>
    );
  }

  // --- State Inspector ---
  if (selection.type === 'state') {
    const exec: OpmStateExecution = selection.execution || {
      enabled: true,
      initial: false,
      terminal: false,
      entryAssignments: [],
      exitAssignments: [],
    };

    const handleAddEntry = () => {
      const newAsgn: OpmAssignment = {
        id: nextStableId('asgn'),
        targetAttributeId: '',
        operator: '=',
        expression: '0',
        enabled: true,
      };
      onUpdateSelectionExecution({
        ...exec,
        entryAssignments: [...(exec.entryAssignments || []), newAsgn],
      });
    };

    const handleAddExit = () => {
      const newAsgn: OpmAssignment = {
        id: nextStableId('asgn'),
        targetAttributeId: '',
        operator: '=',
        expression: '0',
        enabled: true,
      };
      onUpdateSelectionExecution({
        ...exec,
        exitAssignments: [...(exec.exitAssignments || []), newAsgn],
      });
    };

    return (
      <div className="flex flex-col h-full p-3 gap-3 bg-[#161616] text-gray-300 text-xs overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-2">
          <span className="font-extrabold uppercase text-amber-400 tracking-wider">
            State: {selection.name}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                data-testid="state-initial-checkbox"
                aria-label="Initial state"
                data-opm-path="stateExecution.initial"
                type="checkbox"
                checked={Boolean(exec.initial)}
                onChange={(e) => onUpdateSelectionExecution({ ...exec, initial: e.target.checked })}
              />
              Initial State
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                data-testid="state-terminal-checkbox"
                aria-label="Terminal state"
                data-opm-path="stateExecution.terminal"
                type="checkbox"
                checked={Boolean(exec.terminal)}
                onChange={(e) =>
                  onUpdateSelectionExecution({ ...exec, terminal: e.target.checked })
                }
              />
              Terminal State
            </label>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="state-timeout">
              Timeout Duration (ms)
            </label>
            <input
              id="state-timeout"
              data-testid="state-timeout-input"
              data-opm-path="stateExecution.timeoutMs"
              type="number"
              value={exec.timeoutMs ?? ''}
              onChange={(e) =>
                onUpdateSelectionExecution({
                  ...exec,
                  timeoutMs: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="e.g. 5000"
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="state-timeout-ev">
              Timeout Event
            </label>
            <select
              id="state-timeout-ev"
              data-testid="state-timeout-event-select"
              data-opm-path="stateExecution.timeoutEventId"
              value={exec.timeoutEventId || ''}
              onChange={(e) =>
                onUpdateSelectionExecution({ ...exec, timeoutEventId: e.target.value || undefined })
              }
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
            >
              <option value="">-- none --</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-[#2d2d2d]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase text-gray-400">Entry Actions</span>
              <button
                data-testid="add-entry-assignment-btn"
                aria-label="Add entry assignment"
                onClick={handleAddEntry}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded hover:bg-amber-900"
              >
                <Plus size={10} /> Add Entry
              </button>
            </div>
            <AssignmentRows
              value={exec.entryAssignments || []}
              writableAttributes={writableAttributes}
              basePath="stateExecution.entryAssignments"
              testIdPrefix="entry-assignment"
              onChange={(next) => onUpdateSelectionExecution({ ...exec, entryAssignments: next })}
            />
          </div>

          <div className="pt-2 border-t border-[#2d2d2d]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase text-gray-400">Exit Actions</span>
              <button
                data-testid="add-exit-assignment-btn"
                aria-label="Add exit assignment"
                onClick={handleAddExit}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded hover:bg-amber-900"
              >
                <Plus size={10} /> Add Exit
              </button>
            </div>
            <AssignmentRows
              value={exec.exitAssignments || []}
              writableAttributes={writableAttributes}
              basePath="stateExecution.exitAssignments"
              testIdPrefix="exit-assignment"
              onChange={(next) => onUpdateSelectionExecution({ ...exec, exitAssignments: next })}
            />
          </div>
        </div>
      </div>
    );
  }

  // --- Link Inspector ---
  if (selection.type === 'link') {
    const exec: OpmLinkExecution = selection.execution || {
      enabled: true,
      guard: '',
      assignments: [],
      priority: 1,
      delayMs: 0,
    };

    const handleAddAssignment = () => {
      const newAsgn: OpmAssignment = {
        id: nextStableId('asgn'),
        targetAttributeId: '',
        operator: '=',
        expression: '0',
        enabled: true,
      };
      onUpdateSelectionExecution({
        ...exec,
        assignments: [...(exec.assignments || []), newAsgn],
      });
    };

    return (
      <div
        data-testid="link-execution-inspector"
        className="flex flex-col h-full p-3 gap-3 bg-[#161616] text-gray-300 text-xs overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-2">
          <span className="font-extrabold uppercase text-orange-400 tracking-wider">
            Link Execution
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-event">
              Event Trigger
            </label>
            <select
              id="link-event"
              data-testid="link-event-select"
              data-opm-path="linkExecution.eventId"
              value={exec.eventId || ''}
              onChange={(e) =>
                onUpdateSelectionExecution({ ...exec, eventId: e.target.value || undefined })
              }
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
            >
              <option value="">-- none --</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-guard">
              Guard Expression
            </label>
            <input
              id="link-guard"
              data-testid="guard-expr-input"
              data-opm-path="linkExecution.guard"
              value={exec.guard || ''}
              onChange={(e) => onUpdateSelectionExecution({ ...exec, guard: e.target.value })}
              placeholder="e.g. ready == true"
              className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-prio">
                Priority
              </label>
              <input
                id="link-prio"
                data-testid="link-priority-input"
                data-opm-path="linkExecution.priority"
                type="number"
                value={exec.priority ?? 1}
                onChange={(e) =>
                  onUpdateSelectionExecution({ ...exec, priority: Number(e.target.value) })
                }
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-delay">
                Delay (ms)
              </label>
              <input
                id="link-delay"
                data-testid="link-delay-input"
                data-opm-path="linkExecution.delayMs"
                type="number"
                value={exec.delayMs ?? 0}
                onChange={(e) =>
                  onUpdateSelectionExecution({ ...exec, delayMs: Number(e.target.value) })
                }
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[#2d2d2d] space-y-2">
            <span className="text-[10px] font-bold uppercase text-gray-400">
              State Transition
            </span>
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-trans-owner">
                Owner Object ID
              </label>
              <input
                id="link-trans-owner"
                data-testid="link-transition-owner-input"
                data-opm-path="linkExecution.transition.ownerObjectId"
                value={exec.transition?.ownerObjectId || ''}
                onChange={(e) =>
                  onUpdateSelectionExecution({
                    ...exec,
                    transition: {
                      ownerObjectId: e.target.value,
                      targetStateId: exec.transition?.targetStateId || '',
                      sourceStateId: exec.transition?.sourceStateId,
                    },
                  })
                }
                placeholder="e.g. obj_boiler"
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-trans-src">
                  Source State ID
                </label>
                <input
                  id="link-trans-src"
                  data-testid="link-transition-source-input"
                  data-opm-path="linkExecution.transition.sourceStateId"
                  value={exec.transition?.sourceStateId || ''}
                  onChange={(e) =>
                    onUpdateSelectionExecution({
                      ...exec,
                      transition: {
                        ownerObjectId: exec.transition?.ownerObjectId || '',
                        targetStateId: exec.transition?.targetStateId || '',
                        sourceStateId: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="optional"
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-trans-tgt">
                  Target State ID
                </label>
                <input
                  id="link-trans-tgt"
                  data-testid="link-transition-target-input"
                  data-opm-path="linkExecution.transition.targetStateId"
                  value={exec.transition?.targetStateId || ''}
                  onChange={(e) =>
                    onUpdateSelectionExecution({
                      ...exec,
                      transition: {
                        ownerObjectId: exec.transition?.ownerObjectId || '',
                        targetStateId: e.target.value,
                        sourceStateId: exec.transition?.sourceStateId,
                      },
                    })
                  }
                  placeholder="e.g. st_on"
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>
            {(exec.transition?.targetStateId || exec.transition?.ownerObjectId) && (
              <button
                data-testid="link-transition-clear-btn"
                aria-label="Clear transition"
                data-opm-path="linkExecution.transition"
                onClick={() =>
                  onUpdateSelectionExecution({ ...exec, transition: undefined })
                }
                className="text-[10px] px-2 py-0.5 bg-red-950 text-red-400 border border-red-800 rounded hover:bg-red-900"
              >
                Clear Transition
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-[#2d2d2d]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase text-gray-400">
                Link Assignments
              </span>
              <button
                data-testid="add-assignment-btn"
                aria-label="Add link assignment"
                onClick={handleAddAssignment}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-orange-950 text-orange-400 border border-orange-800 rounded hover:bg-orange-900"
              >
                <Plus size={10} /> Add Assignment
              </button>
            </div>
            <AssignmentRows
              value={exec.assignments || []}
              writableAttributes={writableAttributes}
              basePath="linkExecution.assignments"
              onChange={(next) => onUpdateSelectionExecution({ ...exec, assignments: next })}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
};
