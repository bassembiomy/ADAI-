import React from 'react';
import { semanticPresentationToken } from '../../engine/sysml/semanticPresentationStyles';

const PORT_ACTIONS = [
  { kind: 'standard', label: 'Standard', role: 'standardPort', title: 'Add Standard UML Port' },
  { kind: 'flow', label: 'Flow', role: 'flowPort', title: 'Add Flow Port' },
  { kind: 'proxy', label: 'Proxy', role: 'proxyPort', title: 'Add Proxy Port' },
  { kind: 'full', label: 'Full', role: 'fullPort', title: 'Add Full Port' },
] as const;

export interface PortKindActionsProps {
  onAddPort: (kind: 'standard' | 'flow' | 'proxy' | 'full') => void;
  className?: string;
}

export const PortKindActions: React.FC<PortKindActionsProps> = ({
  onAddPort,
  className = '',
}) => {
  return (
    <div className={`flex gap-1 items-center ${className}`.trim()}>
      {PORT_ACTIONS.map(({ kind, label, role, title }) => {
        const token = semanticPresentationToken(role);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onAddPort(kind)}
            className="h-6 px-2 text-[11px] font-medium rounded border hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            style={{ borderColor: token, color: token, backgroundColor: 'transparent' }}
            title={title}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
