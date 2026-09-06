import * as fs from 'node:fs';
import * as path from 'node:path';
import { TargetRegistry } from '../../engine/targetPacks/TargetRegistry';
import { getDefaultTargetRegistry } from '../../engine/targetPacks/defaultTargetPacks';
import type { TargetVerificationRecipe } from '../../engine/targetPacks/targetPackTypes';
import {
  type ActivityEvidence,
  computeFileSha256,
} from './smVerificationEvidence';
import { runTool } from './smToolRunner';

export interface TargetCompileDetails {
  targetId: string | null;
  packVersion: string | null;
  packHash: string | null;
  compiler: string | null;
  compilerVersion: string | null;
  outputFile: string | null;
  outputHash: string | null;
  diagnostics: readonly string[];
}

export interface TargetCompileRequest {
  targetId: string | null;
  packVersion?: string;
  sourceDir: string;
  productionFiles?: readonly string[];
  registry?: TargetRegistry;
  timeoutMs?: number;
  overrideRecipe?: Partial<TargetVerificationRecipe>;
}

export interface SMTargetCompileAdapter {
  compile(request: TargetCompileRequest): Promise<ActivityEvidence<TargetCompileDetails>>;
}

export async function compileTargetPackage(
  request: TargetCompileRequest,
): Promise<ActivityEvidence<TargetCompileDetails>> {
  if (!request.targetId) {
    return {
      activity: 'target-compilation',
      status: 'NOT_RUN',
      summary: 'No target configured for state machine package.',
      command: null,
      details: {
        targetId: null,
        packVersion: null,
        packHash: null,
        compiler: null,
        compilerVersion: null,
        outputFile: null,
        outputHash: null,
        diagnostics: [],
      },
    };
  }

  const registry = request.registry ?? getDefaultTargetRegistry();
  const manifest = registry.getTarget(request.targetId, request.packVersion);

  if (!manifest) {
    return {
      activity: 'target-compilation',
      status: 'FAIL',
      summary: `Configured target pack '${request.targetId}' not found in registry.`,
      command: null,
      details: {
        targetId: request.targetId,
        packVersion: null,
        packHash: null,
        compiler: null,
        compilerVersion: null,
        outputFile: null,
        outputHash: null,
        diagnostics: [`Target pack '${request.targetId}' is not registered`],
      },
    };
  }

  const recipe: TargetVerificationRecipe = {
    ...(manifest.verificationRecipe ?? {
      executable: manifest.pinnedToolchains[0]?.name ?? 'gcc',
      args: ['-c', '{sources}', '-o', '{outputFile}'],
      sourceGlobs: ['*.c'],
      includeDirectories: ['.'],
      outputPath: 'firmware.elf',
      versionArgs: ['--version'],
    }),
    ...(request.overrideRecipe ?? {}),
  };

  // Resolve sources
  let sourceFiles: string[] = [];
  if (request.productionFiles && request.productionFiles.length > 0) {
    sourceFiles = [...request.productionFiles];
  } else if (fs.existsSync(request.sourceDir)) {
    const entries = fs.readdirSync(request.sourceDir);
    sourceFiles = entries.filter((file) => file.endsWith('.c'));
  }

  const expandedArgs: string[] = [];
  for (const arg of recipe.args) {
    if (arg === '{sources}') {
      expandedArgs.push(...sourceFiles);
    } else if (arg.includes('{sources}')) {
      for (const src of sourceFiles) {
        expandedArgs.push(arg.replaceAll('{sources}', src));
      }
    } else if (arg.includes('{outputFile}')) {
      expandedArgs.push(arg.replaceAll('{outputFile}', recipe.outputPath));
    } else {
      expandedArgs.push(arg);
    }
  }

  const result = await runTool({
    executable: recipe.executable,
    args: expandedArgs,
    cwd: request.sourceDir,
    timeoutMs: request.timeoutMs ?? 60_000,
    versionArgs: recipe.versionArgs ?? ['--version'],
  });

  if (!result.available) {
    return {
      activity: 'target-compilation',
      status: 'NOT_RUN',
      summary: `Configured target compiler '${recipe.executable}' is not available on host: ${result.command.stderr || 'Command not found'}`,
      command: result.command,
      details: {
        targetId: request.targetId,
        packVersion: manifest.packVersion,
        packHash: manifest.contentHash,
        compiler: recipe.executable,
        compilerVersion: null,
        outputFile: null,
        outputHash: null,
        diagnostics: [result.command.stderr || 'Command not found'],
      },
    };
  }

  const diagnostics: string[] = [];
  if (result.command.stderr.trim().length > 0) {
    diagnostics.push(...result.command.stderr.trim().split(/\r?\n/));
  }
  if (result.command.exitCode !== 0 && diagnostics.length === 0 && result.command.stdout.trim().length > 0) {
    diagnostics.push(...result.command.stdout.trim().split(/\r?\n/));
  }

  if (result.command.exitCode !== 0) {
    return {
      activity: 'target-compilation',
      status: 'FAIL',
      summary: `Target compilation failed with exit code ${result.command.exitCode}`,
      command: result.command,
      details: {
        targetId: request.targetId,
        packVersion: manifest.packVersion,
        packHash: manifest.contentHash,
        compiler: recipe.executable,
        compilerVersion: result.command.toolVersion,
        outputFile: null,
        outputHash: null,
        diagnostics,
      },
    };
  }

  const outputPath = path.resolve(request.sourceDir, recipe.outputPath);
  if (!fs.existsSync(outputPath)) {
    return {
      activity: 'target-compilation',
      status: 'FAIL',
      summary: `Target compilation succeeded but expected output artifact '${recipe.outputPath}' was not produced.`,
      command: result.command,
      details: {
        targetId: request.targetId,
        packVersion: manifest.packVersion,
        packHash: manifest.contentHash,
        compiler: recipe.executable,
        compilerVersion: result.command.toolVersion,
        outputFile: recipe.outputPath,
        outputHash: null,
        diagnostics: [`Expected artifact '${recipe.outputPath}' not found`],
      },
    };
  }

  const outputHash = computeFileSha256(outputPath);

  return {
    activity: 'target-compilation',
    status: 'PASS',
    summary: `Target compilation succeeded for ${request.targetId} (${manifest.packVersion}), producing ${recipe.outputPath}.`,
    command: result.command,
    details: {
      targetId: request.targetId,
      packVersion: manifest.packVersion,
      packHash: manifest.contentHash,
      compiler: recipe.executable,
      compilerVersion: result.command.toolVersion,
      outputFile: recipe.outputPath,
      outputHash,
      diagnostics: [],
    },
  };
}

export const createTargetCompileAdapter = (
  registry?: TargetRegistry,
): SMTargetCompileAdapter => ({
  compile: (request) => compileTargetPackage({ ...request, registry: request.registry ?? registry }),
});
