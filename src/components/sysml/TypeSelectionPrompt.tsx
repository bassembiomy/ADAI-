import React, { useState, useEffect } from 'react';
import type { TypeCandidate, TypedFeatureKind, TypeSelectionResult } from './typeSelectionTypes';
// Task 6 review fix: dialog selection/error/confirm colors resolve from the
// centralized semantic palette (presentation only; the selection gate above
// is unchanged and color never drives it).
import { semanticPresentationToken } from '../../engine/sysml/semanticPresentationStyles';

export type TypeSelectionId = Extract<TypeSelectionResult, { kind: 'selected' }>['typeId'];

export interface TypeSelectionPromptProps {
  isOpen: boolean;
  // Typed feature kind when known; still accepts the human-readable display
  // label (e.g. "Proxy Port") produced by getElementKindLabel so call sites
  // and rendered text stay unchanged.
  featureKind: TypedFeatureKind | (string & {});
  candidates: TypeCandidate[];
  onSelectType: (typeId: TypeSelectionId) => void;
  onCreateNewType?: () => void;
  onCancel: () => void;
  error?: string;
}

export const TypeSelectionPrompt: React.FC<TypeSelectionPromptProps> = ({
  isOpen,
  featureKind,
  candidates,
  onSelectType,
  onCreateNewType,
  onCancel,
  error,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (selectedId && !candidates.some(c => c.id === selectedId)) setSelectedId('');
  }, [candidates, selectedId]);

  useEffect(() => {
    if (!isOpen) setSelectedId('');
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // A typed feature can only be created from an explicitly selected
  // compatible candidate. The selection must still be present in the current
  // candidate list: stale ids (e.g. after the repository changed while the
  // chooser was open) can never confirm, so choosing no type cannot create
  // a typed feature and the first candidate is never selected silently.
  const hasValidSelection = selectedId !== '' && candidates.some(c => c.id === selectedId);

  const selectionToken = semanticPresentationToken('selection');
  const errorToken = semanticPresentationToken('error');
  // Dark text on the selection token keeps the selected-row and confirm
  // pairings above AA in both themes (white on the selection token is
  // ~3:1 and fails); neutral/disabled chrome below is untouched.
  const onSelectionText = '#111827';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="type-selection-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '24px',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          color: '#f9fafb',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h3 id="type-selection-title" style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
          Select Type for {featureKind}
        </h3>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              background: `color-mix(in srgb, ${errorToken} 20%, transparent)`,
              border: `1px solid ${errorToken}`,
              color: errorToken,
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#9ca3af' }}>
            Compatible Types ({candidates.length})
          </label>
          {candidates.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic', padding: '8px 0' }}>
              No compatible existing types found in the model.
            </div>
          ) : (
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid #374151',
                borderRadius: '4px',
                padding: '4px',
                background: '#111827',
              }}
            >
              {candidates.map(candidate => {
                const isSelected = selectedId === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      background: isSelected ? selectionToken : 'transparent',
                      color: isSelected ? onSelectionText : '#e5e7eb',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{candidate.name}</span>
                    <span style={{ fontSize: '11px', color: isSelected ? onSelectionText : '#6b7280' }}>
                      {candidate.id}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '8px',
          }}
        >
          {onCreateNewType ? (
            <button
              type="button"
              onClick={onCreateNewType}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #4b5563',
                background: '#374151',
                color: '#e5e7eb',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Create New Type
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #4b5563',
                background: 'transparent',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!hasValidSelection}
              onClick={() => {
                if (hasValidSelection) onSelectType(selectedId);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                border: 'none',
                background: hasValidSelection ? selectionToken : '#4b5563',
                color: hasValidSelection ? onSelectionText : '#ffffff',
                cursor: hasValidSelection ? 'pointer' : 'not-allowed',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
