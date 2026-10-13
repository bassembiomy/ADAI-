import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Module Workspaces Toolbar Scroll parity', () => {
  const workspaces = [
    'src/components/xbridges/XbridgesWorkspace.tsx',
    'src/components/vlab/VLabWorkspace.tsx',
    'src/components/hil/HILWorkspace.tsx',
    'src/components/plantuml/PlantUmlWorkspace.tsx',
  ];

  for (const relPath of workspaces) {
    it(`${relPath} includes adia-toolbar-scrollbar and overflow-x-auto`, () => {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
      expect(content).toContain('adia-toolbar-scrollbar');
      expect(content).toContain('overflow-x-auto');
      expect(content).toContain('handleHorizontalToolbarWheel');
    });
  }
});
