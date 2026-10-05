import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from './model';
import {
  resolveRepositoryEndpoint,
  resolveSemanticEndpoint,
  type ExternalSemanticEndpoint,
  type SemanticEndpointContext,
} from './semanticEndpointIndex';

describe('semanticEndpointIndex', () => {
  it('does not resolve nonexistent state IDs even if the ID contains state', () => {
    const repo = createEmptyRepository();
    repo.requirements.req1 = {
      id: 'req1',
      name: 'Req 1',
      kind: 'requirement',
      namespace: [],
      requirementId: 'REQ-1',
      text: 'Must be fast',
      status: 'draft',
      version: '1',
    };

    const emptyContext: SemanticEndpointContext = { externalEndpoints: new Map() };
    expect(resolveSemanticEndpoint(repo, 'nonexistent-state-id', emptyContext)).toBeUndefined();
    expect(resolveSemanticEndpoint(repo, 'state-machine-node-123', emptyContext)).toBeUndefined();
  });

  it('resolves real external State endpoints when present in context', () => {
    const repo = createEmptyRepository();
    const externalMap = new Map<string, ExternalSemanticEndpoint>([
      ['state-active', { id: 'state-active', name: 'Active', family: 'state' }],
    ]);
    const context: SemanticEndpointContext = { externalEndpoints: externalMap };

    const resolved = resolveSemanticEndpoint(repo, 'state-active', context);
    expect(resolved).toEqual({
      id: 'state-active',
      name: 'Active',
      family: 'state',
    });
  });

  it('resolves repository-backed definitions, usages, requirements, and nested features', () => {
    const repo = createEmptyRepository();
    repo.definitions.block1 = {
      id: 'block1',
      name: 'Engine',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [
        {
          id: 'prop1',
          name: 'rpm',
          kind: 'value',
          typeId: 'Real',
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
      ],
      ports: [
        {
          id: 'port1',
          name: 'fuelIn',
          kind: 'standard',
          direction: 'in',
          typeId: 'FuelPortType',
          isConjugated: false,
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
      ],
      operations: [],
      constraints: [],
    };

    expect(resolveRepositoryEndpoint(repo, 'block1')).toEqual({
      id: 'block1',
      name: 'Engine',
      family: 'block',
    });
    expect(resolveRepositoryEndpoint(repo, 'prop1')).toEqual({
      id: 'prop1',
      name: 'rpm',
      family: 'property',
      ownerId: 'block1',
      typeId: 'Real',
    });
    expect(resolveRepositoryEndpoint(repo, 'port1')).toEqual({
      id: 'port1',
      name: 'fuelIn',
      family: 'port',
      ownerId: 'block1',
    });
  });
});
