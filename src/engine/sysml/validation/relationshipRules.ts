import type { SysmlRepositoryV4, SemanticRelationship } from '../domain';

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
    // Association connects Classifiers (Blocks, InterfaceBlocks, etc.)
    const classifierMetaclasses = ['Block', 'InterfaceBlock', 'ConstraintBlock', 'AssociationBlock', 'DataType'];
    if (!classifierMetaclasses.includes(source.metaclass) || !classifierMetaclasses.includes(target.metaclass)) {
      diagnostics.push('ASSOCIATION_ENDPOINTS_MUST_BE_CLASSIFIERS');
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
