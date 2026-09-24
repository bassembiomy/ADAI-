import { describe, expect, it } from 'vitest';
import {
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

  it('allows violations when covered by temporary compatibility allowlist', () => {
    const code = `
      setBlocks(current => [...current, block]);
    `;
    const violations = scanSourceForArchitectureViolations(code, 'src/App.tsx');
    const directMutation = violations.find((v: ArchitectureViolation) => v.ruleId === 'SYSML_ARCH_DIRECT_MUTATION');
    expect(directMutation).toBeDefined();
    expect(directMutation?.allowed).toBe(true);
  });

  it('runs verifySysmlArchitecture across repository root without unallowed violations', () => {
    const result = verifySysmlArchitecture(process.cwd());
    const unallowed = result.filter((v: ArchitectureViolation) => !v.allowed);
    expect(unallowed).toEqual([]);
  });
});
