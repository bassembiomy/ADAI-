import { describe, expect, it } from 'vitest';
import { writeGeneratedArtifacts } from './smFileWriter';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('smFileWriter', () => {
  it('preserves existing custom user platform files across regenerations (GEN-INT-005)', () => {
    const workspace = createGeneratedCodeTestWorkspace('preservation-test');
    const inputPath = join(workspace.directory, 'platform/sm_inputs.c');

    const firstRun = [
      { name: 'generated/sm_core.c', content: '// core v1', overwritePolicy: 'ALWAYS' as const },
      { name: 'platform/sm_inputs.c', content: '// user starter', overwritePolicy: 'CREATE_IF_MISSING' as const }
    ];

    writeGeneratedArtifacts(workspace.directory, firstRun);
    expect(readFileSync(inputPath, 'utf8')).toContain('// user starter');

    // Modify user file
    writeFileSync(inputPath, '// CUSTOM USER CODE');

    // Second run
    writeGeneratedArtifacts(workspace.directory, firstRun);
    expect(readFileSync(inputPath, 'utf8')).toBe('// CUSTOM USER CODE');
  });

  it('rejects path traversal attempts outside target directory', () => {
    const workspace = createGeneratedCodeTestWorkspace('traversal-test');
    expect(() => writeGeneratedArtifacts(workspace.directory, [{ name: '../outside.c', content: 'hack', overwritePolicy: 'ALWAYS' }])).toThrow('Path traversal forbidden');
    expect(() => writeGeneratedArtifacts(workspace.directory, [{ name: '/absolute/path.c', content: 'hack', overwritePolicy: 'ALWAYS' }])).toThrow('Path traversal forbidden');
    expect(() => writeGeneratedArtifacts(workspace.directory, [{ name: 'C:escape.c', content: 'hack', overwritePolicy: 'ALWAYS' }])).toThrow('Path traversal forbidden');
    expect(() => writeGeneratedArtifacts(workspace.directory, [{ name: 'sub/../../outside.c', content: 'hack', overwritePolicy: 'ALWAYS' }])).toThrow('Path traversal forbidden');
  });

  it('allows valid nested paths with dots in filenames and creates directories recursively', () => {
    const workspace = createGeneratedCodeTestWorkspace('valid-dots-test');
    expect(() => writeGeneratedArtifacts(workspace.directory, [
      { name: 'production/sm_core.c', content: '// production', overwritePolicy: 'ALWAYS' },
      { name: 'tests/test_sm_init.c', content: '// test', overwritePolicy: 'ALWAYS' },
      { name: 'verification/test_manifest.json', content: '{}', overwritePolicy: 'ALWAYS' },
      { name: 'generated/foo..bar.c', content: '// ok', overwritePolicy: 'ALWAYS' },
    ])).not.toThrow();
  });
});
