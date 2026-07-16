// src/components/xbridges/context.ts
import React from 'react';

export const WorkspaceContext = React.createContext<{
  saveHistory: () => void;
  updateBlock?: (id: string, newData: any) => void;
  onOpenScope?: (blockId: string) => void;
  onNodeMouseDown?: (e: React.MouseEvent, node: any) => void;
  isTargetBlock?: (blockId: string) => boolean;
  isSimulating?: boolean;
  getColor?: (nodeType: string) => string;
} | null>(null);
