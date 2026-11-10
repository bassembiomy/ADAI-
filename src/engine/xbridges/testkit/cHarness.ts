import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

export interface CRunInput {
  files: Record<string, string>;
  main?: string;
  flags?: string[];
  args?: string[];
}
export interface CRunResult { ok: boolean; compilerOutput: string; stdout: string; exitCode: number | null }

/** Compile with strict C99 (warnings are errors), run, return stdout and exit code. Always cleans up. */
export function compileAndRunC(input: CRunInput): CRunResult {
  const dir = mkdtempSync(join(tmpdir(), 'xbv-c-'));
  try {
    for (const [name, text] of Object.entries(input.files)) {
      const p = join(dir, name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, text);
    }
    let cFiles = Object.keys(input.files).filter((n) => n.endsWith('.c'));
    if (input.main !== undefined) cFiles = [input.main, ...cFiles.filter((n) => n !== input.main)];
    const exe = join(dir, 'prog');
    const cc = spawnSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', ...(input.flags ?? []),
      ...cFiles, '-lm', '-o', exe], { cwd: dir, encoding: 'utf8' });
    const compilerOutput = `${cc.stdout ?? ''}${cc.stderr ?? ''}`;
    if (cc.error || cc.status !== 0) return { ok: false, compilerOutput: cc.error ? `${cc.error.message}\n${compilerOutput}` : compilerOutput, stdout: '', exitCode: null };
    const run = spawnSync(exe, input.args ?? [], { cwd: dir, encoding: 'utf8' });
    return { ok: true, compilerOutput, stdout: run.stdout ?? '', exitCode: run.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
