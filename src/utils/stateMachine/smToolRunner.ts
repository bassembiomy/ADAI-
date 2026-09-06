import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  type CommandEvidence,
  computeFileSha256,
} from './smVerificationEvidence';

export interface ToolRunRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  env?: Readonly<Record<string, string>>;
  versionArgs?: readonly string[];
  inputFiles?: readonly string[];
  outputFiles?: readonly string[];
}

export interface ToolRunResult {
  command: CommandEvidence;
  available: boolean;
  timedOut: boolean;
  error?: Error;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024; // 1 MB

const probeToolVersion = async (
  executable: string,
  versionArgs: readonly string[],
  cwd: string,
  env?: Readonly<Record<string, string>>,
): Promise<string | null> => {
  return new Promise<string | null>((resolvePromise) => {
    try {
      const proc = spawn(executable, [...versionArgs], {
        cwd,
        shell: false,
        env: env ? { ...process.env, ...env } : process.env,
        windowsHide: true,
      });

      let stdout = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        resolvePromise(null);
      }, 5_000);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && stdout.trim().length > 0) {
          const firstLine = stdout.trim().split(/\r?\n/)[0];
          resolvePromise(firstLine.trim());
        } else {
          resolvePromise(null);
        }
      });

      proc.on('error', () => {
        clearTimeout(timer);
        resolvePromise(null);
      });
    } catch {
      resolvePromise(null);
    }
  });
};

export const runTool = async (request: ToolRunRequest): Promise<ToolRunResult> => {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = request.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const cwd = resolve(request.cwd);

  const inputHashes: Record<string, string> = {};
  if (request.inputFiles) {
    for (const filePath of request.inputFiles) {
      inputHashes[filePath] = computeFileSha256(resolve(cwd, filePath));
    }
  }

  let toolVersion: string | null = null;
  if (request.versionArgs && request.versionArgs.length > 0) {
    toolVersion = await probeToolVersion(
      request.executable,
      request.versionArgs,
      cwd,
      request.env,
    );
  }

  return new Promise<ToolRunResult>((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let childError: Error | undefined;

    let child;
    try {
      child = spawn(request.executable, [...request.args], {
        cwd,
        shell: false,
        env: request.env ? { ...process.env, ...request.env } : process.env,
        windowsHide: true,
      });
    } catch (err) {
      const error = err as Error;
      const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
      const durationMs = Date.now() - startTime;
      resolvePromise({
        available: !isEnoent,
        timedOut: false,
        error,
        command: {
          executable: request.executable,
          args: request.args,
          cwd,
          toolVersion,
          exitCode: null,
          signal: null,
          timedOut: false,
          stdout: '',
          stderr: error.message,
          startedAt,
          durationMs,
          inputHashes,
          outputHashes: {},
        },
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutTruncated) return;
      if (stdout.length + chunk.length > maxBuffer) {
        stdout += chunk.toString('utf8', 0, Math.max(0, maxBuffer - stdout.length));
        stdout += '\n[TRUNCATED]';
        stdoutTruncated = true;
      } else {
        stdout += chunk.toString('utf8');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrTruncated) return;
      if (stderr.length + chunk.length > maxBuffer) {
        stderr += chunk.toString('utf8', 0, Math.max(0, maxBuffer - stderr.length));
        stderr += '\n[TRUNCATED]';
        stderrTruncated = true;
      } else {
        stderr += chunk.toString('utf8');
      }
    });

    child.on('error', (err) => {
      childError = err;
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const isEnoent = (childError as NodeJS.ErrnoException)?.code === 'ENOENT';

      const outputHashes: Record<string, string> = {};
      if (request.outputFiles) {
        for (const filePath of request.outputFiles) {
          outputHashes[filePath] = computeFileSha256(resolve(cwd, filePath));
        }
      }

      resolvePromise({
        available: !isEnoent,
        timedOut,
        error: childError,
        command: {
          executable: request.executable,
          args: request.args,
          cwd,
          toolVersion,
          exitCode: isEnoent ? null : code,
          signal: signal ?? null,
          timedOut,
          stdout,
          stderr: childError && !stderr ? childError.message : stderr,
          startedAt,
          durationMs,
          inputHashes,
          outputHashes,
        },
      });
    });
  });
};
