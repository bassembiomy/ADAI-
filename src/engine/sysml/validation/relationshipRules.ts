import type { SysmlRepositoryV4, SemanticRelationship } from '../domain';
import { evaluateSysmlConnection, familyOfMetaclass } from '../connectionPolicy';

export interface RelationshipEndpointValidationResult {
  valid: boolean;
  diagnostics: string[];
}

export function validateRelationshipEndpoints(
  repo: SysmlRepositoryV4,
  rel: SemanticRelationship
): RelationshipEndpointValidationResult {
  const diagnostics: string[] = [];

  const source = repo.elements[rel.sourceId];
  const target = repo.elements[rel.targetId];

  if (!source) {
    diagnostics.push('SOURCE_ELEMENT_NOT_FOUND');
    return { valid: false, diagnostics };
  }
  if (!target) {
    diagnostics.push('TARGET_ELEMENT_NOT_FOUND');
    return { valid: false, diagnostics };
  }

  if (rel.metaclass === 'Connector' || rel.metaclass === 'BindingConnector') {
    // Connector endpoints must be features (ports, properties, etc.), not high-level root blocks
    const featureMetaclasses = [
      'Port',
      'PartProperty',
      'ReferenceProperty',
      'ValueProperty',
      'FlowProperty',
      'ConstraintProperty',
    ];
    if (!featureMetaclasses.includes(source.metaclass) || !featureMetaclasses.includes(target.metaclass)) {
      diagnostics.push('CONNECTOR_ENDPOINTS_MUST_BE_FEATURES');
    }
  }

  if (rel.metaclass === 'Association') {
    // Association connects classifiers; the shared connection policy decides
    // which families count, so this check cannot drift from the other tables.
    const decision = evaluateSysmlConnection({
      relationshipKind: 'association',
      diagram: 'bdd',
      // Placeholder ids: only the endpoint families are judged here.
      source: { id: 'source', name: source.name, family: familyOfMetaclass(source.metaclass) },
      target: { id: 'target', name: target.name, family: familyOfMetaclass(target.metaclass) },
    });
    if (!decision.allowed) {
      diagnostics.push('ASSOCIATION_ENDPOINTS_MUST_BE_CLASSIFIERS');
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
