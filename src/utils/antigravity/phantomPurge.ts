/**
 * phantomPurge.ts
 * Implements REQ-OV-03 (Protocol PHANTOM_PURGE)
 * Purges variables from SM_Data_t C struct that do not exist in the JSON model and are not engine-reserved.
 */

export function purgePhantomVariables(structCode: string, jsonModel: any): string {
  if (!structCode || !jsonModel || !Array.isArray(jsonModel.variables)) {
    return structCode;
  }

  const validNames = new Set<string>([
    'current_state',
    'previous_state',
    'state_timer',
    'state_entry_time',
    'error_code',
    ...jsonModel.variables.map((v: any) => v.name)
  ]);

  const lines = structCode.split('\n');
  const filteredLines = lines.filter(line => {
    const memberMatch = /^\s*(volatile\s+)?([A-Za-z0-9_]+\s*\*?)\s+([A-Za-z0-9_]+);/.exec(line.trim());
    if (memberMatch) {
      const varName = memberMatch[3];
      return validNames.has(varName);
    }
    return true;
  });

  return filteredLines.join('\n');
}
