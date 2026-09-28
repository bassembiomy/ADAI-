import type { ConnectionEndpoint } from './connectionPolicy';
import { classifyCanonicalEndpoint } from './connectionPolicy';
import type { SysmlRepository } from './model';

export interface ExternalSemanticEndpoint {
  id: string;
  name: string;
  family: 'state';
  ownerId?: string;
}

export interface SemanticEndpointContext {
  externalEndpoints?: ReadonlyMap<string, ExternalSemanticEndpoint>;
}

export function resolveRepositoryEndpoint(
  repo: SysmlRepository,
  id: string,
): ConnectionEndpoint | undefined {
  const element =
    repo.packages[id] ??
    repo.diagrams[id] ??
    repo.definitions[id] ??
    repo.usages[id] ??
    repo.connectors[id] ??
    repo.relationships[id] ??
    repo.requirements[id] ??
    repo.verificationCases[id] ??
    repo.evidence[id] ??
    repo.baselines[id] ??
    repo.artifacts[id] ??
    repo.actors?.[id] ??
    repo.subjects?.[id] ??
    repo.useCases?.[id] ??
    repo.extensionPoints?.[id];

  if (element) {
    return classifyCanonicalEndpoint(element);
  }

  for (const def of Object.values(repo.definitions)) {
    if (def.kind === 'block') {
      const prop = def.properties?.find(p => p.id === id);
      if (prop) {
        return {
          id: prop.id,
          name: prop.name,
          family: 'property',
          ownerId: def.id,
          typeId: prop.typeId,
        };
      }
      const port = def.ports?.find(p => p.id === id);
      if (port) {
        return {
          id: port.id,
          name: port.name,
          family: 'port',
          ownerId: def.id,
        };
      }
    }
  }

  return undefined;
}

export function resolveSemanticEndpoint(
  repo: SysmlRepository,
  id: string,
  context: SemanticEndpointContext = {},
): ConnectionEndpoint | undefined {
  const external = context.externalEndpoints?.get(id);
  if (external) return external;
  return resolveRepositoryEndpoint(repo, id);
}
