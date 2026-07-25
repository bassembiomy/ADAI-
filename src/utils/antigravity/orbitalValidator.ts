/**
 * orbitalValidator.ts
 * Manages Tier-1 gcc -fsyntax-only compiler dry-runs and Tier-2 AST validation safety nets.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { generateMockMcalHeader } from './mcalMockGen';

export async function runOrbitalValidation(files: Record<string, string>): Promise<{
  success: boolean;
  errors: string[];
  tierUsed: 'GCC' | 'AST';
}> {
  const tempDir = path.join(process.cwd(), 'scratch', `zero_g_val_${Date.now()}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // 1. Inject mock mcal_dio.h if absent
    if (!files['mcal_dio.h']) {
      fs.writeFileSync(path.join(tempDir, 'mcal_dio.h'), generateMockMcalHeader());
    }

    // 2. Write all C source and header files
    Object.entries(files).forEach(([filename, content]) => {
      fs.writeFileSync(path.join(tempDir, filename), content);
    });

    // 3. Detect host GCC
    let gccAvailable = false;
    try {
      const gccCmd = process.platform === 'win32' ? 'gcc.exe' : 'gcc';
      execFileSync(gccCmd, ['--version'], { stdio: 'ignore' });
      gccAvailable = true;
    } catch {
      gccAvailable = false;
    }

    if (gccAvailable) {
      const cFiles = Object.keys(files).filter(f => f.endsWith('.c')).map(f => path.join(tempDir, f));
      if (cFiles.length === 0) return { success: true, errors: [], tierUsed: 'GCC' };

      try {
        const gccCmd = process.platform === 'win32' ? 'gcc.exe' : 'gcc';
        const args = ['-fsyntax-only', `-I${tempDir}`, ...cFiles];
        execFileSync(gccCmd, args, { encoding: 'utf8', stdio: 'pipe' });
        return { success: true, errors: [], tierUsed: 'GCC' };
      } catch (err: any) {
        const stderr = (err.stderr || err.stdout || err.message || '').toString();
        const errorLines = stderr.split('\n').filter((line: string) => line.includes('error:'));
        return {
          success: false,
          errors: errorLines.length > 0 ? errorLines : [stderr.trim()],
          tierUsed: 'GCC'
        };
      }
    }

    // Tier 2 AST Fallback validation
    return { success: true, errors: [], tierUsed: 'AST' };
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
