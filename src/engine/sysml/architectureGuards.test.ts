import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPATIBILITY_ALLOWLIST,
  scanSourceForArchitectureViolations,
  verifySysmlArchitecture,
  type ArchitectureViolation,
} from '../../../scripts/verify_sysml_architecture';

describe('SysML Architecture Guardrails', () => {
  it('detects direct UI/AI writes to legacy semantic arrays (SYSML_ARCH_DIRECT_MUTATION)', () => {
    const code = `
      function onAddBlock(newBlock) {
        setBlocks(prev => [...prev, newBlock]);
      }
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/components/FakeComponent.tsx');
    expect(violations.some((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_DIRECT_MUTATION')).toBe(true);
  });

  it('detects UI ownership of SysML semantics (SYSML_ARCH_UI_SEMANTIC_STORAGE)', () => {
    const code = `
      import { useState } from 'react';
      import type { BlockData } from '../../types/sysml_types';
      export function BlockList() {
        const [blocks, setBlocks] = useState<BlockData[]>([]);
        return null;
      }
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/components/FakeBlockList.tsx');
    expect(violations.some((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_UI_SEMANTIC_STORAGE')).toBe(true);
  });

  it('detects silent type creation without explicit command (SYSML_ARCH_SILENT_CREATION)', () => {
    const code = `
      function resolveType(name: string) {
        if (!found) {
          // synthesize missing type silently
          return createPlaceholderType(name);
        }
      }
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/services/fakeResolver.ts');
    expect(violations.some((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_SILENT_CREATION')).toBe(true);
  });

  it('does not keep a file-wide App.tsx mutation allowlist', () => {
    const code = `
      setBlocks(current => [...current, block]);
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/App.tsx');
    const directMutation = violations.find((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_DIRECT_MUTATION');
    expect(directMutation).toBeDefined();
    expect(directMutation?.allowed).toBe(false);
  });

  it('limits the App projection exception to the named canonical projection function', () => {
    const appEntries = COMPATIBILITY_ALLOWLIST.filter(entry => entry.filePath === 'src/App.tsx');
    expect(appEntries).toEqual([]);
    expect(COMPATIBILITY_ALLOWLIST.filter(entry => entry.symbol === 'applyCanonicalSysmlResult'))
      .toMatchObject([{ filePath: 'src/services/sysmlProjectionState.ts', ruleId: 'SYSML_ARCH_DIRECT_MUTATION' }]);
  });

  it.each([
    ['property reconciliation', 'function reconcileEffect() { setBlocks(reconciled.blocks); }'],
    ['SysML undo/redo', 'function undoSysml() { setBlocks(snapshot.blocks); }'],
    ['requirements auto-layout', 'function autoLayout() { setBlocks(nextBlocks); }'],
    ['IBD port layout', 'function dragIbdPort() { setParts(nextParts); }'],
    ['keyboard paste', 'function handlePaste() { setBlocks(prev => [...prev, ...pasted]); }'],
    ['property definition creation', 'function createDefinition() { setParts(nextParts); }'],
    ['project restore/import', 'function hydrateLegacyProject() { setBlocks(loaded.blocks); }'],
  ])('does not allowlist active %s writes in App.tsx', (_label, code) => {
    const violations = scanSourceForArchitectureViolations(code, 'src/App.tsx');
    const directWrite = violations.find(v => v.ruleId === 'SYSML_ARCH_DIRECT_MUTATION');
    expect(directWrite).toBeDefined();
    expect(directWrite?.allowed).toBe(false);
  });

  it('allows a direct projection setter only inside applyCanonicalSysmlResult', () => {
    const code = `
      function applyCanonicalSysmlResult(result) { setBlocks(result.view.blocks); }
      function handlePaste(result) { setBlocks(result.view.blocks); }
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/services/sysmlProjectionState.ts')
      .filter(v => v.ruleId === 'SYSML_ARCH_DIRECT_MUTATION');
    expect(violations).toHaveLength(2);
    expect(violations.map(v => v.allowed)).toEqual([true, false]);
  });

  it('detects forbidden runtime mutations like setBlocks(prev => [...prev, newBlock]) in non-compatibility context', () => {
    const code = `
      function handleCanvasClick() {
        setBlocks(prev => [...prev, newBlock]);
      }
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/App.tsx');
    expect(violations.some((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_FORBIDDEN_RUNTIME_MUTATION' && !v.allowed)).toBe(true);
  });

  it('strictly forbids mergeLegacyDiagramIntoRepository anywhere', () => {
    const code = `
      mergeLegacyDiagramIntoRepository(repo, data);
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/App.tsx');
    expect(violations.some((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_FORBIDDEN_RUNTIME_MUTATION' && !v.allowed)).toBe(true);
  });

  it('scans migration scripts for silent type synthesis', () => {
    const root = mkdtempSync(join(tmpdir(), 'sysml-architecture-'));
    const scriptsDir = join(root, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, 'migrateLegacyTypes.ts'), 'export const migrate = name => createPlaceholderType(name);');

    try {
      const violations = verifySysmlArchitecture(root);
      expect(violations.some(v => v.ruleId === 'SYSML_ARCH_SILENT_CREATION' && !v.allowed)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs verifySysmlArchitecture across repository root without unallowed violations', () => {
    const result = verifySysmlArchitecture(process.cwd());
    const unallowed = result.filter((v: ArchitectureViolation) => !v.allowed);
    expect(unallowed).toEqual([]);
  });
});
