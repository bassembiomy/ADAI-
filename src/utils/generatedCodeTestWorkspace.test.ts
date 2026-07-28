import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createGeneratedCodeTestWorkspace } from './generatedCodeTestWorkspace';

describe('createGeneratedCodeTestWorkspace', () => {
  it('creates unique generated-code directories under the operating-system temp directory and cleans them up', () => {
    const first = createGeneratedCodeTestWorkspace('first');
    const second = createGeneratedCodeTestWorkspace('second');

    try {
      expect(first.directory).toEqual(expect.stringContaining(os.tmpdir()));
      expect(second.directory).toEqual(expect.stringContaining(os.tmpdir()));
      expect(first.directory).not.toBe(second.directory);
      expect(path.basename(first.directory)).toMatch(/^adia-generated-c-first-/);
      expect(fs.existsSync(first.directory)).toBe(true);
      expect(fs.existsSync(second.directory)).toBe(true);
    } finally {
      first.cleanup();
      second.cleanup();
    }

    expect(fs.existsSync(first.directory)).toBe(false);
    expect(fs.existsSync(second.directory)).toBe(false);
  });

  it('preserves a test failure while cleaning up the generated-code directory', () => {
    const workspace = createGeneratedCodeTestWorkspace('failure');
    const testFailure = new Error('compiler failed');

    expect(() => {
      try {
        throw testFailure;
      } finally {
        workspace.cleanup();
      }
    }).toThrow(testFailure);
    expect(fs.existsSync(workspace.directory)).toBe(false);
  });
});
