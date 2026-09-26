import React, { useState, useEffect, useRef } from 'react';
import type { CanonicalPortKind } from '../../services/sysmlOwnedFeatureCommands';

export interface PortToolMenuProps {
  activePortTool: CanonicalPortKind | null;
  onSelectPortTool: (kind: CanonicalPortKind) => void;
  onClearPortTool: () => void;
}

const PORT_OPTIONS: Array<{ kind: CanonicalPortKind; label: string; description: string }> = [
  { kind: 'umlPort', label: 'Standard UML Port', description: 'Generic UML 2.5 Port with no SysML stereotype' },
  { kind: 'proxyPort', label: 'Proxy Port', description: 'SysML 1.6 ProxyPort typed by an InterfaceBlock' },
  { kind: 'fullPort', label: 'Full Port', description: 'SysML 1.6 FullPort typed by a Block' },
  { kind: 'flowPort', label: 'Legacy Flow Port', description: 'SysML 1.6 Annex C Legacy FlowPort' },
];

export const PortToolMenu: React.FC<PortToolMenuProps> = ({
  activePortTool,
  onSelectPortTool,
  onClearPortTool,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClearPortTool();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClearPortTool]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOption = PORT_OPTIONS.find(o => o.kind === activePortTool);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`palette-button ${activePortTool ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Port tools"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '4px',
          border: activePortTool ? '1px solid #3b82f6' : '1px solid #4b5563',
          background: activePortTool ? '#1e3a8a' : '#1f2937',
          color: '#f9fafb',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        <span>{activeOption ? activeOption.label : 'Port'}</span>
        <span style={{ fontSize: '10px' }}>▼</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            zIndex: 50,
            minWidth: '220px',
            padding: '4px',
          }}
        >
          {PORT_OPTIONS.map(option => {
            const isSelected = activePortTool === option.kind;
            return (
              <button
                key={option.kind}
                role="menuitem"
                type="button"
                onClick={() => {
                  onSelectPortTool(option.kind);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  background: isSelected ? '#2563eb' : 'transparent',
                  color: isSelected ? '#ffffff' : '#e5e7eb',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '13px' }}>{option.label}</span>
                <span style={{ fontSize: '11px', color: isSelected ? '#dbeafe' : '#9ca3af' }}>
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
