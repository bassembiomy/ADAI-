import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Model Explorer theme contract (Task 16)', () => {
  const modelExplorerDir = path.resolve(__dirname);
  const targetFiles = [
    'modelExplorer.css',
    'ModelExplorer.tsx',
    'ModelExplorerToolbar.tsx',
    'ModelTreeRow.tsx',
    'ModelExplorerMenu.tsx',
    'RelationshipWizard.tsx',
    'MoveImpactDialog.tsx',
    'VirtualTree.tsx',
    'AppModelExplorer.tsx',
  ];

  it('prohibits hard-coded Tailwind slate/gray/zinc/blue color classes across all Model Explorer components', () => {
    const forbiddenClassRegex = /(?:bg|text|border|ring|divide)-(?:slate|gray|zinc|neutral|stone|blue)-(?:50|100|200|300|400|500|600|700|800|900|950)/g;
    const violations: string[] = [];

    for (const filename of targetFiles) {
      const filePath = path.join(modelExplorerDir, filename);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        let match;
        while ((match = forbiddenClassRegex.exec(line)) !== null) {
          violations.push(`${filename}:${index + 1} -> ${match[0]}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('prohibits raw hex color literals in Model Explorer components and styles', () => {
    const forbiddenHexRegex = /#([0-9a-fA-F]{3,8})\b/g;
    const violations: string[] = [];

    for (const filename of targetFiles) {
      const filePath = path.join(modelExplorerDir, filename);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        let match;
        while ((match = forbiddenHexRegex.exec(line)) !== null) {
          violations.push(`${filename}:${index + 1} -> ${match[0]}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('verifies modelExplorer.css consumes ADIA theme tokens', () => {
    const cssPath = path.join(modelExplorerDir, 'modelExplorer.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('var(--surface-canvas)');
    expect(css).toContain('var(--surface-panel)');
    expect(css).toContain('var(--text-primary)');
    expect(css).toContain('var(--border-default)');
    expect(css).toContain('var(--diagram-node-selected)');
  });
});
