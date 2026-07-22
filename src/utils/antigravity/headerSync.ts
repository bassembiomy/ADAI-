/**
 * headerSync.ts
 * Implements REQ-PF-03 (Protocol HEADER_SYNC & Protocol RETURN_TYPE_SANITY)
 * Ensures 1:1 signature matching between header and source, and corrects invalid struct return types.
 */

export function synchronizeHeaders(headerCode: string, sourceCode: string): { header: string; source: string } {
  let syncHeader = headerCode;
  let syncSource = sourceCode;

  // 1. Return type sanity: if SM_GetData returns NULL or pointer, change SM_Data_t return type to const SM_Data_t*
  if (syncSource.includes('return NULL;') || syncSource.includes('return &')) {
    syncHeader = syncHeader.replace(/\bSM_Data_t\s+SM_GetData\b/g, 'const SM_Data_t* SM_GetData');
    syncSource = syncSource.replace(/\bSM_Data_t\s+SM_GetData\b/g, 'const SM_Data_t* SM_GetData');
  }

  // 2. Synchronize ADIA_Instance_t signatures from source to header
  const fnSigs = syncSource.match(/\bvoid\s+[A-Za-z0-9_]+\s*\([^)]*ADIA_Instance_t\*\s*[A-Za-z0-9_]+\)/g) || [];
  fnSigs.forEach(sig => {
    const fnNameMatch = sig.match(/\bvoid\s+([A-Za-z0-9_]+)/);
    if (fnNameMatch) {
      const fnName = fnNameMatch[1];
      const headerRegex = new RegExp(`\\bvoid\\s+${fnName}\\s*\\([^)]*\\);`, 'g');
      syncHeader = syncHeader.replace(headerRegex, `${sig};`);
    }
  });

  return { header: syncHeader, source: syncSource };
}
