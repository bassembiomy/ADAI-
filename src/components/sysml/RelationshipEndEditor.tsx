import React from 'react';
import type { Multiplicity, SysmlRelationship } from '../../engine/sysml/model';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';
import { sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';
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

/**
 * Text field that edits a local draft and commits on blur/Enter. Committing
 * per keystroke re-normalized the value mid-typing (e.g. "0" became "0..1"
 * and "*" was dropped), so values like "0..*" could never be entered.
 */
function DraftTextInput({ value, onCommit, ...rest }: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [draft, setDraft] = React.useState(value);
  // The draft last handed to onCommit: the blur that follows an Enter must not commit it again (a second undo step).
  const committedDraft = React.useRef<string | null>(null);
  React.useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value || draft === committedDraft.current) return;
    committedDraft.current = draft;
    onCommit(draft);
  };
  return (
    <input
      {...rest}
      value={draft}
      onChange={e => { committedDraft.current = null; setDraft(e.target.value); }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { committedDraft.current = null; setDraft(value); }
        rest.onKeyDown?.(e);
      }}
    />
  );
}

const formatMult = (m?: Multiplicity) => (m ? (m.lower === m.upper ? `${m.lower}` : `${m.lower}..${m.upper}`) : '');

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
    name: '',
    family: sourceIsRequirement ? 'requirement' : 'unknown',
  };
  const resolvedTarget: ConnectionEndpoint = targetEndpoint ?? {
    id: relationship.targetId,
    name: '',
    family: targetIsRequirement ? 'requirement' : 'unknown',
  };
  const sourceLabel = sysmlObjectLabel(resolvedSource, resolvedSource.family);
  const targetLabel = sysmlObjectLabel(resolvedTarget, resolvedTarget.family);
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

  const parseMult = (text: string, current?: Multiplicity): Multiplicity | undefined => {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const [lowerText, upperText = lowerText] = trimmed.split('..').map(part => part.trim());
    // "*" alone means 0..*; a "*" lower bound is not meaningful.
    const lower = lowerText === '*' ? 0 : Math.max(0, parseInt(lowerText, 10) || 0);
    const parsedUpper = parseInt(upperText, 10);
    const upper = upperText === '*' ? '*' : Number.isFinite(parsedUpper) ? Math.max(lower, parsedUpper) : lower;
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
      message: `Target ${targetLabel} is a leaf block and cannot be specialized`,
    });
  }
  if (generalizationInfo?.cycleDetected) {
    derivedGuidance.push({
      code: 'INHERITANCE_CYCLE',
      message: `Inheritance cycle detected involving ${sourceLabel}`,
    });
  }
  if (generalizationInfo?.targetIsAbstract) {
    derivedGuidance.push({
      code: 'ABSTRACT_INSTANTIATION',
      message: `Target ${targetLabel} is abstract and cannot be directly instantiated; specialize it with a concrete subtype`,
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
          Source End ({sourceLabel}) {isContainment && <span className="text-orange-400">· Container (parent)</span>}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Role name {isContainment && <span className="text-gray-400 font-normal">(Container (parent))</span>}
            <DraftTextInput
              aria-label="Source role name"
              value={relationship.sourceRole || ''}
              onCommit={text => update({ sourceRole: text.trim() || undefined })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
              placeholder="e.g. parent"
            />
          </label>
          <label>
            Multiplicity
            <DraftTextInput
              aria-label="Source multiplicity"
              value={formatMult(relationship.sourceMultiplicity)}
              onCommit={text => update({ sourceMultiplicity: parseMult(text, relationship.sourceMultiplicity) })}
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
          Target End ({targetLabel}) {isContainment && <span className="text-orange-400">· Nested (child)</span>}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Role name {isContainment && <span className="text-gray-400 font-normal">(Nested (child))</span>}
            <DraftTextInput
              aria-label="Target role name"
              value={relationship.targetRole || ''}
              onCommit={text => update({ targetRole: text.trim() || undefined })}
              className="w-full rounded border border-gray-700 bg-transparent px-2 py-1"
              placeholder="e.g. child"
            />
          </label>
          <label>
            Multiplicity
            <DraftTextInput
              aria-label="Target multiplicity"
              value={formatMult(relationship.targetMultiplicity)}
              onCommit={text => update({ targetMultiplicity: parseMult(text, relationship.targetMultiplicity) })}
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
