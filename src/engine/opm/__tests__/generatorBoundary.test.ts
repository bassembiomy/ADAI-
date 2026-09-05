import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const FORBIDDEN_IMPORT_PATTERNS = [
  /stateMachineCodeGenerator/i,
  /stateMachineRuntimeBundle/i,
  /XbridgesEngine/i,
  /XbridgesLibrary/i,
  /xbridgeBlockRegistry/i,
  /xbridgeDomainModel/i,
  /xbridgesAdapter/i,
  /src\/engine\/xbridges/i,
  /src\/utils\/stateMachine/i,
];

describe('OPM Generator Boundary Isolation Gate', () => {
  it('scans OPM source files and rejects any import from State Machine or X-Bridges generators', () => {
    const opmDir = path.resolve(__dirname, '..');
    const sourceFiles = findSourceFiles(opmDir);
    expect(sourceFiles.length).toBeGreaterThan(5);

    const violations: { file: string; importLine: string }[] = [];

    const importRegex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (/^\s*\/\//.test(line)) continue; // ignore single-line comments
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(line)) !== null) {
          const importPath = match[1] || match[2];
          for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
            if (pattern.test(importPath)) {
              violations.push({
                file: path.relative(process.cwd(), file),
                importLine: line.trim(),
              });
            }
          }
        }
      }
    }

    expect(
      violations,
      `Detected OPM source files importing protected State Machine / X-Bridges generator modules:\n` +
        violations.map(v => `  ${v.file}: ${v.importLine}`).join('\n'),
    ).toHaveLength(0);
  });
});
