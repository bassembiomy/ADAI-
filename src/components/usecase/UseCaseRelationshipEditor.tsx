import React from 'react';
import { Tag, Trash2, ArrowRight, CornerDownRight } from 'lucide-react';
import type { UseCaseRelationshipType } from '../../types/usecase_types';

export interface UseCaseRelationshipData {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  sourceRole?: string;
  targetRole?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  extensionPoint?: string;
}

export interface UseCaseRelationshipEditorProps {
  relationship: UseCaseRelationshipData;
  sourceName?: string;
  targetName?: string;
  availableExtensionPoints?: string[];
  onChangeKind?: (newKind: UseCaseRelationshipType) => void;
  onUpdateRelationship?: (patch: Partial<UseCaseRelationshipData>) => void;
  onDelete?: () => void;
}

export const UseCaseRelationshipEditor: React.FC<UseCaseRelationshipEditorProps> = ({
  relationship,
  sourceName = 'Source',
  targetName = 'Target',
  availableExtensionPoints = [],
  onChangeKind,
  onUpdateRelationship,
  onDelete,
}) => {
  return (
    <div className="space-y-4 text-xs text-zinc-200">
      <div className="flex items-center justify-between pb-2 border-b border-[#333]">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
          <Tag size={14} className="text-amber-400" />
          <span>Relationship Details</span>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 text-red-400 hover:text-red-300 px-2 py-1 bg-red-950/40 hover:bg-red-900/50 rounded border border-red-800 text-[11px] transition-colors"
          >
            <Trash2 size={11} />
            <span>Delete Relationship</span>
          </button>
        )}
      </div>

      {/* Connected Endpoints */}
      <div className="p-2.5 bg-[#202023] rounded border border-[#333] space-y-1">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Endpoints</div>
        <div className="flex items-center gap-2 text-zinc-200 font-medium">
          <span className="truncate">{sourceName}</span>
          <ArrowRight size={12} className="text-amber-400 shrink-0" />
          <span className="truncate">{targetName}</span>
        </div>
      </div>

      {/* Relationship Type */}
      <div className="space-y-1.5">
        <label className="text-zinc-400 font-medium">Stereotype / Kind</label>
        <select
          value={relationship.kind}
          onChange={(e) => onChangeKind?.(e.target.value as UseCaseRelationshipType)}
          className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="association">Association</option>
          <option value="include">«include»</option>
          <option value="extend">«extend»</option>
          <option value="generalization">Generalization</option>
          <option value="satisfy">«satisfy»</option>
          <option value="refine">«refine»</option>
          <option value="trace">«trace»</option>
        </select>
      </div>

      {/* Extension Point (for extend relationships) */}
      {relationship.kind === 'extend' && (
        <div className="space-y-1.5">
          <label className="text-zinc-400 font-medium flex items-center gap-1">
            <CornerDownRight size={12} className="text-amber-400" />
            <span>Extension Point</span>
          </label>
          <select
            value={relationship.extensionPoint || ''}
            onChange={(e) => onUpdateRelationship?.({ extensionPoint: e.target.value || undefined })}
            className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="">-- None (Whole Use Case) --</option>
            {availableExtensionPoints.map((ep) => (
              <option key={ep} value={ep}>
                {ep}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Roles & Multiplicity (for associations) */}
      {relationship.kind === 'association' && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#333]">
          <div className="space-y-1">
            <label className="text-zinc-400 text-[11px]">Source Role</label>
            <input
              type="text"
              value={relationship.sourceRole || ''}
              onChange={(e) => onUpdateRelationship?.({ sourceRole: e.target.value })}
              placeholder="e.g. operator"
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-zinc-100 text-xs focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-zinc-400 text-[11px]">Target Role</label>
            <input
              type="text"
              value={relationship.targetRole || ''}
              onChange={(e) => onUpdateRelationship?.({ targetRole: e.target.value })}
              placeholder="e.g. system"
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-zinc-100 text-xs focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-zinc-400 text-[11px]">Source Multiplicity</label>
            <input
              type="text"
              value={relationship.sourceMultiplicity || ''}
              onChange={(e) => onUpdateRelationship?.({ sourceMultiplicity: e.target.value })}
              placeholder="1..*"
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-zinc-100 text-xs focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-zinc-400 text-[11px]">Target Multiplicity</label>
            <input
              type="text"
              value={relationship.targetMultiplicity || ''}
              onChange={(e) => onUpdateRelationship?.({ targetMultiplicity: e.target.value })}
              placeholder="1"
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-zinc-100 text-xs focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
