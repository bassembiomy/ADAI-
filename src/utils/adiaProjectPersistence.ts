export type UnifiedProjectInput = Readonly<Record<string, unknown> & {
  version: string;
  projectName: string;
}>;

export function createUnifiedProjectPayload(
  input: UnifiedProjectInput,
  now: () => Date = () => new Date(),
): Record<string, unknown> {
  return { ...input, timestamp: now().toISOString() };
}

export function createProjectSnapshot(payload: Record<string, unknown>): string {
  const { timestamp: _timestamp, ...stable } = payload;
  return JSON.stringify(stable);
}

export function hasUnsavedProjectChanges(
  current: Record<string, unknown>,
  cleanSnapshot: string | null,
): boolean {
  return cleanSnapshot !== null && createProjectSnapshot(current) !== cleanSnapshot;
}
