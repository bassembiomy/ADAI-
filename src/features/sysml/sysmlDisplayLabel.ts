export function friendlySysmlKind(kind: string | undefined, fallback = 'Element'): string {
  const source = kind?.trim() || fallback;
  return source
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim();
}

export function sysmlObjectLabel(
  value: { name?: string; metaclass?: string; kind?: string; id?: string } | null | undefined,
  fallbackKind = 'Element',
): string {
  const name = value?.name?.trim();
  if (name) return name;
  return friendlySysmlKind(value?.metaclass ?? value?.kind, fallbackKind);
}

export function resolveSysmlReferenceLabel(
  repository: any,
  id: string | null | undefined,
  fallbackKind?: string,
): string {
  if (!id) return friendlySysmlKind(fallbackKind);
  const itemFlow = repository?.itemFlows?.[id];
  const value = repository?.elements?.[id]
    ?? repository?.relationships?.[id]
    ?? repository?.diagrams?.[id]
    ?? itemFlow
    ?? repository?.packages?.[id]
    ?? repository?.definitions?.[id]
    ?? repository?.usages?.[id]
    ?? repository?.requirements?.[id]
    ?? repository?.verificationCases?.[id]
    ?? repository?.artifacts?.[id]
    ?? repository?.connectors?.[id]
    ?? repository?.actors?.[id]
    ?? repository?.subjects?.[id]
    ?? repository?.useCases?.[id]
    ?? repository?.extensionPoints?.[id];
  const effectiveFallback = fallbackKind ?? (itemFlow && value === itemFlow ? 'ItemFlow' : 'Element');
  return value ? sysmlObjectLabel(value, effectiveFallback) : friendlySysmlKind(effectiveFallback);
}
