/**
 * antigravityRunner.ts
 * Master coordinator for the Antigravity Agent pipeline.
 */

import { sanitizePointers } from './pointerShield';
import { sanitizeComments } from './commentSanitizer';
import { synchronizeHeaders } from './headerSync';
import { purgePhantomVariables } from './phantomPurge';
import { runOrbitalValidation } from './orbitalValidator';
import { patchCodeInMemory } from './reentryEngine';

export async function runAntigravityPipeline(
  rawFiles: Record<string, string>,
  jsonModel?: any
): Promise<{
  success: boolean;
  files: Record<string, string>;
  diffLog: string;
  loopsUsed: number;
  status: 'ZERO_G' | 'REENTRY_FAILED';
}> {
  let currentFiles: Record<string, string> = {};
  const diffEntries: string[] = [];

  // Phase 1: Pre-flight interception
  Object.entries(rawFiles).forEach(([filename, content]) => {
    let sanitized = sanitizeComments(content);
    sanitized = sanitizePointers(sanitized);
    if (filename.endsWith('.h') && filename.includes('config')) {
      sanitized = purgePhantomVariables(sanitized, jsonModel);
    }
    currentFiles[filename] = sanitized;
  });

  // Header synchronization
  Object.keys(currentFiles).forEach(f => {
    if (f.endsWith('.h')) {
      const cFile = f.replace(/\.h$/, '.c');
      if (currentFiles[cFile]) {
        const synced = synchronizeHeaders(currentFiles[f], currentFiles[cFile]);
        currentFiles[f] = synced.header;
        currentFiles[cFile] = synced.source;
      }
    }
  });

  let loop = 0;
  const maxLoops = 3;
  let validationResult = await runOrbitalValidation(currentFiles);

  while (!validationResult.success && loop < maxLoops) {
    loop++;
    const { patchedFiles, patchesApplied } = patchCodeInMemory(currentFiles, validationResult.errors);
    
    // If no new patches can be applied, break safety loop to prevent infinite retries
    if (patchesApplied.length === 0) {
      diffEntries.push(`Loop ${loop}: Unable to resolve compiler error: ${validationResult.errors[0] || 'Unknown error'}`);
      break;
    }

    currentFiles = patchedFiles;
    patchesApplied.forEach(p => diffEntries.push(`Loop ${loop}: ${p}`));
    validationResult = await runOrbitalValidation(currentFiles);
  }

  const diffLog = [
    `# Antigravity Auto-Patch Log - ${new Date().toISOString()}`,
    `# Status: ${validationResult.success ? 'ZERO_G' : 'REENTRY_FAILED'}`,
    `# Loops Executed: ${loop}`,
    ...diffEntries
  ].join('\n');

  return {
    success: validationResult.success,
    files: currentFiles,
    diffLog,
    loopsUsed: loop,
    status: validationResult.success ? 'ZERO_G' : 'REENTRY_FAILED'
  };
}
