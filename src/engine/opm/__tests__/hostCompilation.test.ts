import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateOpmCArtifacts } from '../cGenerator';
import { compileExecutableOpm } from '../pipeline';
import { makeApplianceFixture } from '../fixtures';
import { resolveRequiredOpmCompiler } from '../cHostHarness';

const REPO_ROOT = process.cwd();
const STRICT_FLAGS = ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror'];

describe('OPM mandatory host compilation', () => {
  it('resolves the mandatory qualification compiler (fails, never skips)', () => {
    const compiler = resolveRequiredOpmCompiler(REPO_ROOT);
    expect(typeof compiler).toBe('string');
    expect(compiler.length).toBeGreaterThan(0);
    expect(fs.existsSync(compiler)).toBe(true);
  });

  it('strictly compiles and runs the generated C99 example harness', () => {
    // Throws when the qualification compiler is unavailable: strict FAIL, no skip.
    const compiler = resolveRequiredOpmCompiler(REPO_ROOT);

    const fixture = makeApplianceFixture();
    const comp = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(comp.model).toBeDefined();
    const artifacts = generateOpmCArtifacts(comp.model!);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-host-'));
    try {
      for (const file of artifacts.files) {
        fs.writeFileSync(path.join(dir, file.name), file.content, 'utf8');
      }
      const exeName = process.platform === 'win32' ? 'harness.exe' : 'harness';
      const args = [
        ...STRICT_FLAGS,
        'opm_model.c',
        'opm_runtime.c',
        'opm_io.c',
        'opm_trace.c',
        'main_example.c',
        '-o',
        exeName,
      ];
      if (process.platform !== 'win32') {
        args.push('-lm');
      }
      // Argument vector, no shell string. Any failure throws -> test FAILS.
      // Prepend the compiler's bin dir so bundled binutils win over any
      // stale host mingw on PATH.
      execFileSync(compiler, args, {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: `${path.dirname(compiler)}${path.delimiter}${process.env.PATH ?? ''}`,
        },
      });

      const stdout = execFileSync(path.join(dir, exeName), [], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as unknown as string;
      expect(stdout).toContain('Initialized OPM embedded runtime.');
      expect(stdout).toContain('Stepped 10 ticks successfully.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});
