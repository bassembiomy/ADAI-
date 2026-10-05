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
  const value = findSysmlReference(repository, id);
  const effectiveFallback = fallbackKind ?? (itemFlow && value === itemFlow ? 'ItemFlow' : 'Element');
  return value ? sysmlObjectLabel(value, effectiveFallback) : friendlySysmlKind(effectiveFallback);
}

export function hasSysmlReference(repository: any, id: string | null | undefined): boolean {
  return Boolean(id && findSysmlReference(repository, id));
}

/** Nodes, pins, partitions and parameters nested inside an Activity definition. */
function findActivityNestedReference(repository: any, id: string): any {
  for (const definition of Object.values<any>(repository?.definitions ?? {})) {
    if (definition?.kind !== 'activity') continue;
    for (const node of definition.nodes ?? []) {
      if (node.id === id) return node;
      const pin = (node.pins ?? []).find((candidate: any) => candidate.id === id);
      if (pin) return pin;
    }
    const nested = [...(definition.partitions ?? []), ...(definition.parameters ?? [])].find((candidate: any) => candidate.id === id);
    if (nested) return nested;
  }
  return undefined;
}

/** Lifelines, messages and combined fragments nested inside an Interaction definition. */
function findInteractionNestedReference(repository: any, id: string): any {
  for (const definition of Object.values<any>(repository?.definitions ?? {})) {
    if (definition?.kind !== 'interaction') continue;
    const lifeline = (definition.lifelines ?? []).find((candidate: any) => candidate.id === id);
    if (lifeline) return lifeline;
    const message = (definition.messages ?? []).find((candidate: any) => candidate.id === id);
    if (message) {
      const operation = typeof message.signatureId === 'string' && message.sort !== 'asynchSignal' ? message.signatureId.split('(')[0].trim() : '';
      return { ...message, name: message.name?.trim() || operation, kind: 'message' };
    }
    const fragment = (definition.fragments ?? []).find((candidate: any) => candidate.id === id);
    if (fragment) return { ...fragment, name: `${fragment.operator} fragment`, kind: 'fragment' };
  }
  return undefined;
}

function findSysmlReference(repository: any, id: string): any {
  return findDirectSysmlReference(repository, id)
    ?? findActivityNestedReference(repository, id)
    ?? findInteractionNestedReference(repository, id)
    ?? findBlockFeatureReference(repository, id);
}

/**
 * Format 5: a part is a Block property and a part-owned port is a path plus a
 * port id, so a reference can be a property id, a Block port id, or a property
 * path (`a/b`, named by its last property).
 */
function findBlockFeatureReference(repository: any, id: string): any {
  const definitions = repository?.definitions;
  if (!definitions) return undefined;
  const key = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  for (const definition of Object.values<any>(definitions)) {
    if (definition?.kind !== 'block') continue;
    const property = (definition.properties ?? []).find((candidate: any) => candidate.id === key);
    if (property) return property;
    const port = (definition.ports ?? []).find((candidate: any) => candidate.id === key);
    if (port) return { ...port, kind: 'port' };
  }
  return undefined;
}

function findDirectSysmlReference(repository: any, id: string): any {
  return repository?.elements?.[id]
    ?? repository?.relationships?.[id]
    ?? repository?.diagrams?.[id]
    ?? repository?.itemFlows?.[id]
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
}
