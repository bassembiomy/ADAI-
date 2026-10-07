import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('SysML Workspaces Toolbar Scroll parity', () => {
  const workspaces = [
    'src/components/sysml/UseCaseWorkspace.tsx',
    'src/components/sysml/ActivityWorkspace.tsx',
    'src/components/sysml/SequenceWorkspace.tsx',
  ];

  for (const relPath of workspaces) {
    it(`${relPath} includes adia-toolbar-scrollbar and overflow-x-auto in header`, () => {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
      expect(content).toContain('adia-toolbar-scrollbar');
      expect(content).toContain('overflow-x-auto');
      expect(content).toContain('handleHorizontalToolbarWheel');
    });
  }
});
