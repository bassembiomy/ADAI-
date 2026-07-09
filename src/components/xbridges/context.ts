// src/components/xbridges/context.ts
import React from 'react';

export const WorkspaceContext = React.createContext<{
  saveHistory: () => void;
} | null>(null);
