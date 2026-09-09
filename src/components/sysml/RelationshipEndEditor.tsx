import React from 'react';
import type { Multiplicity, SysmlRelationship } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';

export interface RelationshipEndEditorProps {
  relationship: SysmlRelationship;
  diagnostics?: SysmlDiagnostic[];
  sourceIsRequirement?: boolean;
  targetIsRequirement?: boolean;
  onChange: (relationship: SysmlRelationship) => void;
}

const AGGREGATION_KINDS: NonNullable<SysmlRelationship['sourceAggregation']>[] = ['none', 'shared', 'composite'];

export function RelationshipEndEditor({
  relationship,
  diagnostics = [],
  sourceIsRequirement = false,
  targetIsRequirement = false,
  onChange,
}: RelationshipEndEditorProps) {
  const update = (patch: Partial<SysmlRelationship>) => {
    onChange({ ...relationship, ...patch });
  };

  const parseMult = (text: string, current?: Multiplicity): Multiplicity => {
    const trimmed = text.trim();
    const parts = trimmed.split('..');
    const lower = parseInt(parts[0], 10) || 0;
    const upper = parts[1] === '*' ? '*' : parseInt(parts[1] || parts[0], 10) || 1;
    return {
      lower,
      upper,
      ordered: current?.ordered ?? false,
      unique: current?.unique ?? true,
    };
  };

  const relDiagnostics = diagnostics.filter(
    d => d.elementId === relationship.id || d.propertyPath?.startsWith(`relationships.${relationship.id}`)
  );

  const isContainment = relationship.kind === 'requirementContainment';

  return (
    <div className="space-y-4 text-xs" aria-label="Relationship End Editor">
      {/* Relationship Kind */}
      <div>
        <label className="block text-gray-300 font-semibold mb-1">
          Relationship Kind
          <select
            aria-label="Relationship kind"
            value={relationship.kind}
            onChange={e => update({ kind: e.target.value as any })}
            className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1 mt-1 text-gray-200"
          >
            <option value="association">Association</option>
            <option value="generalization">Generalization</option>
            <option value="composition">Composition</option>
            <option value="sharedAggregation">Aggregation</option>
            <option value="allocation">Allocation</option>
            <option value="deriveReqt">Derive Requirement (deriveReqt)</option>
            <option value="refine">Refine</option>
            <option value="satisfy">Satisfy</option>
            <option value="verify">Verify</option>
            <option value="trace">Trace</option>
            <option value="copy">Copy</option>
            <option value="dependency">Dependency</option>
            <option value="requirementContainment" disabled={!(sourceIsRequirement && targetIsRequirement)}>
              Requirement Containment (parent → child)
            </option>
          </select>
        </label>
      </div>

      {/* Diagnostics */}
      {relDiagnostics.length > 0 && (
        <div role="alert" className="space-y-1 rounded border border-red-700 bg-red-950/40 p-2 text-red-300">
          {relDiagnostics.map((d, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="font-semibold text-red-400">[{d.code}]</span>
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Source End */}
      <fieldset className="rounded border border-gray-700 p-2 space-y-2">
        <legend className="px-1 font-semibold text-gray-300">
          Source End ({relationship.sourceId}) {isContainment && <span className="text-orange-400">· Container (parent)</span>}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Role name {isContainment && <span className="text-gray-400 font-normal">(Container (parent))</span>}
            <input
              aria-label="Source role name"
              value={relationship.sourceRole || ''}
              onChange={e => update({ sourceRole: e.target.value || undefined })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
              placeholder="e.g. parent"
            />
          </label>
          <label>
            Multiplicity
            <input
              aria-label="Source multiplicity"
              value={relationship.sourceMultiplicity ? `${relationship.sourceMultiplicity.lower}..${relationship.sourceMultiplicity.upper}` : ''}
              onChange={e => update({ sourceMultiplicity: parseMult(e.target.value, relationship.sourceMultiplicity) })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
              placeholder="1 or 0..1"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={relationship.sourceNavigable !== false}
              onChange={e => update({ sourceNavigable: e.target.checked })}
            />
            Navigable
          </label>
          <label>
            Aggregation
            <select
              value={relationship.sourceAggregation || (relationship.kind === 'composition' ? 'composite' : relationship.kind === 'sharedAggregation' ? 'shared' : 'none')}
              onChange={e => update({ sourceAggregation: e.target.value as any })}
              className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1"
            >
              {AGGREGATION_KINDS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      {/* Target End */}
      <fieldset className="rounded border border-gray-700 p-2 space-y-2">
        <legend className="px-1 font-semibold text-gray-300">
          Target End ({relationship.targetId}) {isContainment && <span className="text-orange-400">· Nested (child)</span>}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Role name {isContainment && <span className="text-gray-400 font-normal">(Nested (child))</span>}
            <input
              aria-label="Target role name"
              value={relationship.targetRole || ''}
              onChange={e => update({ targetRole: e.target.value || undefined })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
              placeholder="e.g. child"
            />
          </label>
          <label>
            Multiplicity
            <input
              aria-label="Target multiplicity"
              value={relationship.targetMultiplicity ? `${relationship.targetMultiplicity.lower}..${relationship.targetMultiplicity.upper}` : ''}
              onChange={e => update({ targetMultiplicity: parseMult(e.target.value, relationship.targetMultiplicity) })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
              placeholder="* or 0..*"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={relationship.targetNavigable !== false}
              onChange={e => update({ targetNavigable: e.target.checked })}
            />
            Navigable
          </label>
          <label>
            Aggregation
            <select
              value={relationship.targetAggregation || 'none'}
              onChange={e => update({ targetAggregation: e.target.value as any })}
              className="w-full rounded border border-gray-700 bg-[#1e1e1e] px-2 py-1"
            >
              {AGGREGATION_KINDS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
    </div>
  );
}
