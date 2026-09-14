import React from 'react';
import type { Multiplicity, SysmlRelationship } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';
import {
  evaluateSysmlConnection,
  type ConnectionEndpoint,
  type ConnectionPolicyDiagnostic,
} from '../../engine/sysml/connectionPolicy';

export interface GeneralizationInfo {
  parentChain?: Array<{ id: string; name: string }>;
  targetIsLeaf?: boolean;
  targetIsAbstract?: boolean;
  cycleDetected?: boolean;
}

export interface RelationshipEndEditorProps {
  relationship: SysmlRelationship;
  diagnostics?: SysmlDiagnostic[];
  /** Resolved endpoint families let the editor remove illegal relationship choices. */
  sourceEndpoint?: ConnectionEndpoint;
  targetEndpoint?: ConnectionEndpoint;
  diagram?: RelationshipDiagramContext;
  sourceIsRequirement?: boolean;
  targetIsRequirement?: boolean;
  generalizationInfo?: GeneralizationInfo;
  onChange: (relationship: SysmlRelationship) => void;
  onInvalidChange?: (rejection: RejectedRelationshipChange) => void;
}

export interface RejectedRelationshipChange {
  relationshipKind: SysmlRelationship['kind'];
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  diagnostic: ConnectionPolicyDiagnostic;
}

export type RelationshipDiagramContext = 'bdd' | 'ibd' | 'requirements' | 'rtm';

const RELATIONSHIP_KINDS: Array<{ kind: SysmlRelationship['kind']; label: string }> = [
  { kind: 'association', label: 'Association' },
  { kind: 'generalization', label: 'Generalization' },
  { kind: 'composition', label: 'Composition' },
  { kind: 'sharedAggregation', label: 'Aggregation' },
  { kind: 'allocation', label: 'Allocation' },
  { kind: 'deriveReqt', label: 'Derive Requirement (deriveReqt)' },
  { kind: 'refine', label: 'Refine' },
  { kind: 'satisfy', label: 'Satisfy' },
  { kind: 'verify', label: 'Verify' },
  { kind: 'trace', label: 'Trace' },
  { kind: 'copy', label: 'Copy' },
  { kind: 'binding', label: 'Binding' },
  { kind: 'dependency', label: 'Dependency' },
  { kind: 'requirementContainment', label: 'Requirement Containment (parent → child)' },
];

/**
 * Returns only relationship kinds legal for resolved endpoint families in the
 * active diagram.  This is deliberately policy-backed so the dropdown cannot
 * drift from command validation.
 */
export function filterRelationshipKinds(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  diagram: RelationshipDiagramContext,
): SysmlRelationship['kind'][] {
  return RELATIONSHIP_KINDS
    .filter(({ kind }) => evaluateSysmlConnection({ relationshipKind: kind, source, target, diagram }).allowed)
    .map(({ kind }) => kind);
}

/** Validates a kind received from a stale control or programmatic update. */
export function validateRelationshipKindUpdate(
  kind: SysmlRelationship['kind'],
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  diagram: RelationshipDiagramContext,
) {
  return evaluateSysmlConnection({ relationshipKind: kind, source, target, diagram });
}

/** Creates the callback payload for a rejected stale or programmatic change. */
export function createRejectedRelationshipChange(
  relationshipKind: SysmlRelationship['kind'],
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  diagram: RelationshipDiagramContext,
): RejectedRelationshipChange | undefined {
  const decision = validateRelationshipKindUpdate(relationshipKind, source, target, diagram);
  const diagnostic = decision.diagnostics[0];
  return diagnostic ? { relationshipKind, source, target, diagnostic } : undefined;
}

const AGGREGATION_KINDS: NonNullable<SysmlRelationship['sourceAggregation']>[] = ['none', 'shared', 'composite'];

// Canonical inheritance/governance codes surfaced in the guidance panel
// (OMG SysML 1.6 ADIA profile; mirrors policy.ts resolveInheritance).
const INHERITANCE_GUIDANCE_CODES = new Set([
  'INHERITANCE_CYCLE',
  'LEAF_SPECIALIZATION',
  'ABSTRACT_INSTANTIATION',
  'MISSING_SUPERTYPE',
]);

export function RelationshipEndEditor({
  relationship,
  diagnostics = [],
  sourceEndpoint,
  targetEndpoint,
  diagram = 'bdd',
  sourceIsRequirement = false,
  targetIsRequirement = false,
  generalizationInfo,
  onChange,
  onInvalidChange,
}: RelationshipEndEditorProps) {
  const resolvedSource: ConnectionEndpoint = sourceEndpoint ?? {
    id: relationship.sourceId,
    name: relationship.sourceId,
    family: sourceIsRequirement ? 'requirement' : 'unknown',
  };
  const resolvedTarget: ConnectionEndpoint = targetEndpoint ?? {
    id: relationship.targetId,
    name: relationship.targetId,
    family: targetIsRequirement ? 'requirement' : 'unknown',
  };
  const allowedRelationshipKinds = filterRelationshipKinds(resolvedSource, resolvedTarget, diagram);

  const update = (patch: Partial<SysmlRelationship>) => {
    const candidate = { ...relationship, ...patch };
    if (patch.kind) {
      const decision = validateRelationshipKindUpdate(candidate.kind, resolvedSource, resolvedTarget, diagram);
      if (!decision.allowed) {
        const rejection = createRejectedRelationshipChange(candidate.kind, resolvedSource, resolvedTarget, diagram);
        if (rejection) onInvalidChange?.(rejection);
        return;
      }
    }
    onChange(candidate);
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
  const isGeneralization = relationship.kind === 'generalization';

  const inheritanceDiagnostics = diagnostics.filter(d => INHERITANCE_GUIDANCE_CODES.has(d.code));
  const derivedGuidance: Array<{ code: string; message: string }> = [];
  if (generalizationInfo?.targetIsLeaf) {
    derivedGuidance.push({
      code: 'LEAF_SPECIALIZATION',
      message: `Target ${relationship.targetId} is a leaf block and cannot be specialized`,
    });
  }
  if (generalizationInfo?.cycleDetected) {
    derivedGuidance.push({
      code: 'INHERITANCE_CYCLE',
      message: `Inheritance cycle detected involving ${relationship.sourceId}`,
    });
  }
  if (generalizationInfo?.targetIsAbstract) {
    derivedGuidance.push({
      code: 'ABSTRACT_INSTANTIATION',
      message: `Target ${relationship.targetId} is abstract and cannot be directly instantiated; specialize it with a concrete subtype`,
    });
  }
  const generalizationChain = generalizationInfo?.parentChain ?? [];
  const hasInheritanceIssues = inheritanceDiagnostics.length > 0 || derivedGuidance.length > 0;

  return (
    <div className="sysml-editor space-y-4 text-xs" aria-label="Relationship End Editor">
      {/* Relationship Kind */}
      <div>
        <label className="block text-gray-300 font-semibold mb-1">
          Relationship Kind
          <select
            aria-label="Relationship kind"
            value={relationship.kind}
            onChange={e => update({ kind: e.target.value as any })}
            className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1 mt-1 text-gray-200"
          >
            {RELATIONSHIP_KINDS
              .filter(({ kind }) => allowedRelationshipKinds.includes(kind))
              .map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
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

      {/* Generalization inheritance guidance */}
      {isGeneralization && (
        <div className="space-y-2 rounded border border-gray-700 bg-[var(--surface-sunken)] p-2" aria-label="Inheritance guidance">
          <h4 className="font-semibold uppercase text-gray-400">Inheritance guidance</h4>
          {generalizationChain.length > 0 && (
            <div aria-label="Parent chain" className="text-gray-300">
              {generalizationChain.map(ancestor => ancestor.name).join(' → ')}
            </div>
          )}
          {inheritanceDiagnostics.length > 0 && (
            <div role="alert" aria-label="Inheritance diagnostics" className="space-y-1 text-red-300">
              {inheritanceDiagnostics.map((d, i) => (
                <div key={i} className="flex items-start gap-1">
                  <span className="font-semibold text-red-400">[{d.code}]</span>
                  <span>{d.message}</span>
                </div>
              ))}
            </div>
          )}
          {derivedGuidance.map((g, i) => (
            <div key={i} role="alert" className="flex items-start gap-1 text-amber-300">
              <span className="font-semibold text-amber-400">[{g.code}]</span>
              <span>{g.message}</span>
            </div>
          ))}
          {!hasInheritanceIssues && (
            <div className="text-gray-500">No inheritance issues detected</div>
          )}
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
              className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
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
              className="w-full rounded border border-gray-700 bg-[var(--surface-sunken)] px-2 py-1"
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
