import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface GeneratedCodeTestWorkspace {
  directory: string;
  cleanup: () => void;
}

/**
 * Creates an isolated location for generated C/C++ test artifacts.
 *
 * Cleanup is deliberately best effort: it must not replace the assertion or
 * compiler error that caused the test to fail. Node applies the bounded retry
 * settings to retryable recursive-removal failures on Windows.
 */
export function createGeneratedCodeTestWorkspace(label = 'workspace'): GeneratedCodeTestWorkspace {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `adia-generated-c-${label}-`));

  return {
    directory,
    cleanup: () => {
      try {
        fs.rmSync(directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100
        });
      } catch {
        // A locked artifact should not hide the test's original failure.
      }
    }
  };
}
