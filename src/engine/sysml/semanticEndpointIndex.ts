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
          ...(prop.kind === 'part' || prop.kind === 'reference' ? { propertyKind: prop.kind } : {}),
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
    // Activity nodes, pins, partitions and parameters are relationship ends too
    // (e.g. «allocate» from an action or swimlane). They behave as behaviours.
    if (def.kind === 'activity') {
      const node = def.nodes?.find(candidate => candidate.id === id
        || candidate.pins?.some(pin => pin.id === id));
      const partition = def.partitions?.find(candidate => candidate.id === id);
      const parameter = def.parameters?.find(candidate => candidate.id === id);
      const nested = node ?? partition ?? parameter;
      if (nested) {
        const pin = node?.pins?.find(candidate => candidate.id === id);
        return {
          id,
          name: pin?.name || nested.name || '',
          family: 'activity',
          ownerId: def.id,
        };
      }
    }
    // Lifelines, messages and combined fragments are relationship ends too;
    // they behave as the interaction that owns them.
    if (def.kind === 'interaction') {
      const nested = def.lifelines?.find(candidate => candidate.id === id)
        ?? def.messages?.find(candidate => candidate.id === id)
        ?? def.fragments?.find(candidate => candidate.id === id);
      if (nested) {
        return {
          id,
          name: 'name' in nested ? nested.name || '' : '',
          family: 'interaction',
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
