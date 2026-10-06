import type { SysmlEntityCollection, SysmlRepository } from '../model';
import type { ExternalSemanticEndpoint } from '../semanticEndpointIndex';

export function projectStateEndpoints(states: unknown): Map<string, ExternalSemanticEndpoint> {
  const endpoints = new Map<string, ExternalSemanticEndpoint>();
  if (!Array.isArray(states)) return endpoints;
  for (const state of states) {
    if (state && typeof state.id === 'string' && state.id.length > 0) {
      endpoints.set(state.id, { id: state.id, name: typeof state.name === 'string' && state.name.length > 0 ? state.name : state.id, family: 'state' });
    }
  }
  return endpoints;
}

export function projectStateEndpointSignature(states: unknown): string {
  return JSON.stringify([...projectStateEndpoints(states)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function hasMatchingProjectStateContext(signature: string | undefined, states: unknown): boolean {
  return typeof signature === 'string' && signature === projectStateEndpointSignature(states);
}

const CANONICAL_SYML_KEYS = new Set([
  'sysmlRepository',
  'canonicalSysmlRepository',
  'sysmlCoordinates',
  'coordinates',
  'diagramPresentations',
]);

export const STREAMED_REPOSITORY_COLLECTIONS: readonly SysmlEntityCollection[] = [
  'packages',
  'diagrams',
  'definitions',
  'usages',
  'connectors',
  'relationships',
  'requirements',
  'verificationCases',
  'evidence',
  'baselines',
  'artifacts',
  'actors',
  'subjects',
  'useCases',
  'extensionPoints',
  'diagramReferences',
];

export function createRepositoryStreamBase(repository: SysmlRepository): SysmlRepository {
  const base = { ...repository };
  for (const collection of STREAMED_REPOSITORY_COLLECTIONS) {
    (base as any)[collection] = {};
  }
  return base;
}

export function appendRepositoryChunk(
  repository: SysmlRepository,
  collection: SysmlEntityCollection,
  entries: readonly (readonly [string, any])[],
): void {
  const target = repository[collection] as Record<string, any>;
  for (const [id, entity] of entries) target[id] = entity;
}

export function appendCoordinateChunk(
  coordinates: Record<string, any>,
  entries: readonly (readonly [string, any])[],
): void {
  for (const [diagramId, diagramCoordinates] of entries) {
    coordinates[diagramId] = diagramCoordinates;
  }
}

export async function streamEntriesInChunks<T>(
  entries: readonly T[],
  chunkSize: number,
  emit: (chunk: readonly T[]) => void | Promise<void>,
  yieldControl: () => Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    await emit(entries.slice(offset, offset + chunkSize));
    if (offset + chunkSize < entries.length) await yieldControl();
  }
}

/**
 * Keeps the non-SysML project metadata needed by App hydration without
 * cloning the canonical graph a second time across the Worker boundary.
 */
export function stripCanonicalPayloadForHydration(payload: Record<string, unknown>, preloadedValid = true, validatedStateSignature?: string): Record<string, unknown> {
  // App must reload the original graph when validating cross-model State endpoints,
  // or when worker validation failed. Never discard its recovery source.
  if (!preloadedValid
    || (validatedStateSignature !== undefined && !hasMatchingProjectStateContext(validatedStateSignature, payload.states))
    || (validatedStateSignature === undefined && projectStateEndpoints(payload.states).size > 0)) return payload;
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!CANONICAL_SYML_KEYS.has(key)) metadata[key] = value;
  }
  return metadata;
}
