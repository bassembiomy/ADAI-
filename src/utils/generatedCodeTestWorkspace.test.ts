import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createGeneratedCodeTestWorkspace } from './generatedCodeTestWorkspace';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

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

  it('preserves an original compiler failure when cleanup fails', () => {
    const workspace = createGeneratedCodeTestWorkspace('failure');
    const compilerFailure = new Error('compiler failed');
    const cleanupFailure = new Error('workspace is locked');
    const rmSyncMock = vi.mocked(fs.rmSync);
    rmSyncMock.mockImplementationOnce(() => {
      throw cleanupFailure;
    });

    try {
      expect(() => {
        try {
          throw compilerFailure;
        } finally {
          workspace.cleanup();
        }
      }).toThrow(compilerFailure);
      expect(rmSyncMock).toHaveBeenCalledWith(workspace.directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100
      });
    } finally {
      fs.rmSync(workspace.directory, { recursive: true, force: true });
      rmSyncMock.mockClear();
    }
  });
});
