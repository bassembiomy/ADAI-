/**
 * reentryEngine.ts
 * Self-healing AST / string repair engine for C compilation errors.
 */

import { sanitizePointers } from './pointerShield';
import { sanitizeComments } from './commentSanitizer';
import { synchronizeHeaders } from './headerSync';

export function patchCodeInMemory(
  files: Record<string, string>,
  _errors: string[]
): { patchedFiles: Record<string, string>; patchesApplied: string[] } {
  const patched: Record<string, string> = { ...files };
  const patchesApplied: string[] = [];

  Object.keys(patched).forEach(fn => {
    const orig = patched[fn];
    let updated = sanitizeComments(orig);
    updated = sanitizePointers(updated);

    if (updated !== orig) {
      patched[fn] = updated;
      patchesApplied.push(`Applied AST pointer/comment repair to ${fn}`);
    }
  });

  // Synchronize headers with source
  Object.keys(patched).forEach(fn => {
    if (fn.endsWith('.h')) {
      const cFile = fn.replace(/\.h$/, '.c');
      if (patched[cFile]) {
        const synced = synchronizeHeaders(patched[fn], patched[cFile]);
        if (synced.header !== patched[fn] || synced.source !== patched[cFile]) {
          patched[fn] = synced.header;
          patched[cFile] = synced.source;
          patchesApplied.push(`Synchronized prototypes and return types between ${fn} and ${cFile}`);
        }
      }
    }
  });

  return { patchedFiles: patched, patchesApplied };
}
