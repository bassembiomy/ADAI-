import type { SysmlRepository, SysmlRelationship } from '../model';
import type {
  RelationshipMetaclass,
  SemanticElement,
  SysmlRepositoryV4,
  Block,
  Requirement,
  TestCase,
  SemanticRelationship,
  DiagramPresentation,
} from '../domain';
import { createEmptyRepositoryV4 } from '../domain';
import { effectiveSupertypeIds } from '../services/supertypes';
import { connectorEndOf } from '../connectorEnds';

/**
 * Every V3 relationship kind and the V4 metaclass it becomes. Composition and
 * shared aggregation are UML Associations whose end carries the aggregation
 * kind, so they map to 'Association' with that end set (see below).
 * Exhaustive over `SysmlRelationship['kind']`: adding a V3 kind without a V4
 * mapping is a compile error, and a test checks no kind is lost.
 */
export const V4_RELATIONSHIP_METACLASS: Record<SysmlRelationship['kind'], RelationshipMetaclass> = {
  association: 'Association',
  sharedAggregation: 'Association',
  composition: 'Association',
  generalization: 'Generalization',
  dependency: 'Dependency',
  packageImport: 'PackageImport',
  elementImport: 'ElementImport',
  packageMerge: 'PackageMerge',
  allocation: 'Allocate',
  binding: 'BindingConnector',
  itemFlow: 'ItemFlow',
  requirementContainment: 'Containment',
  deriveReqt: 'DeriveReqt',
  satisfy: 'Satisfy',
  verify: 'Verify',
  refine: 'Refine',
  trace: 'Trace',
  copy: 'Copy',
  useCaseAssociation: 'Association',
  include: 'Include',
  extend: 'Extend',
  useCaseGeneralization: 'Generalization',
  useCaseRefine: 'Refine',
  useCaseSatisfy: 'Satisfy',
  useCaseTrace: 'Trace',
  // SysML 1.6 makes «conform» a Generalization; «expose» is a Dependency.
  // The V3 kind is kept in customProperties.sourceKind.
  conform: 'Generalization',
  expose: 'Dependency',
};

export function migrateV3ToV4(
  v3: SysmlRepository,
  coordinates?: Record<string, any>,
  diagramPresentations?: Record<string, { elementIds: string[] }>
): SysmlRepositoryV4 {
  const v4 = createEmptyRepositoryV4();
  v4.revision = v3.revision;
  const canonicalOwnerId = (ownerId?: string | null): string =>
    !ownerId || ownerId === 'model' ? 'pkg-root' : ownerId;
  const ownerSets = new Map<string, Set<string>>();
  const registerElement = (element: SysmlRepositoryV4['elements'][string]): void => {
    v4.elements[element.id] = element;
    if (element.ownerId) {
      let set = ownerSets.get(element.ownerId);
      if (!set) {
        set = new Set<string>();
        ownerSets.set(element.ownerId, set);
        v4.indexes.byOwner[element.ownerId] = [];
      }
      if (!set.has(element.id)) {
        set.add(element.id);
        v4.indexes.byOwner[element.ownerId].push(element.id);
      }
    }
  };

  // 1. Migrate Packages
  for (const [id, pkg] of Object.entries(v3.packages || {})) {
    if (id === 'pkg-root' || id === 'model') {
      if (v4.elements['pkg-root'] && pkg.name) {
        v4.elements['pkg-root'].name = pkg.name;
      }
      continue;
    }
    registerElement({
      id: pkg.id,
      name: pkg.name,
      metaclass: 'Package',
      namespace: pkg.namespace || [],
      ownerId: canonicalOwnerId(pkg.ownerId),
    });
  }

  // 1.1 Migrate Definitions (Blocks, ValueTypes, Interfaces)
  for (const [id, def] of Object.entries(v3.definitions || {})) {
    if (def.kind === 'block') {
      const block: Block = {
        id: def.id,
        name: def.name,
        metaclass: 'Block',
        namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        isAbstract: def.isAbstract,
        isLeaf: def.isLeaf,
        // Inheritance is the union of stored supertypes and drawn Generalizations.
        generalIds: effectiveSupertypeIds(v3, def.id),
      };
      registerElement(block);

      // Migrate owned properties
      for (const prop of def.properties || []) {
        const propMeta =
          prop.kind === 'part'
            ? 'PartProperty'
            : prop.kind === 'reference'
            ? 'ReferenceProperty'
            : prop.kind === 'flow'
            ? 'FlowProperty'
            : prop.kind === 'constraint'
            ? 'ConstraintProperty'
            : 'ValueProperty';
        registerElement({
          id: prop.id,
          name: prop.name,
          metaclass: propMeta as any,
          namespace: [],
          ownerId: block.id,
          typeId: prop.typeId,
          multiplicity: prop.multiplicity,
        } as any);
      }

      // Migrate owned ports
      for (const port of def.ports || []) {
        registerElement({
          id: port.id,
          name: port.name,
          metaclass: 'Port',
          portKind: port.kind === 'proxy'
            ? 'proxyPort'
            : port.kind === 'full'
              ? 'fullPort'
              : port.kind === 'flow'
                ? 'flowPort'
                : 'umlPort',
          namespace: [],
          ownerId: block.id,
          typeId: port.typeId,
          direction: port.direction,
          isConjugated: port.isConjugated,
          multiplicity: port.multiplicity,
        } as any);
      }
    } else if (def.kind === 'interface') {
      registerElement({
        id: def.id,
        name: def.name,
        metaclass: 'InterfaceBlock',
        namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        flowPropertyIds: [],
      } as any);
    } else if (def.kind === 'enumeration') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'Enumeration', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId), literalIds: [], customProperties: { literals: def.literals },
      } as SemanticElement);
    } else if (def.kind === 'signal') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'Signal', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
      } as SemanticElement);
    } else if (def.kind === 'unit') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'Unit', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId), symbol: def.symbol, quantityKindId: def.quantityKindId,
      } as SemanticElement);
    } else if (def.kind === 'quantityKind') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'QuantityKind', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId), symbol: def.symbol, description: def.description,
      } as SemanticElement);
    } else if (def.kind === 'view') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'View', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
      } as SemanticElement);
    } else if (def.kind === 'viewpoint') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'Viewpoint', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        stakeholderIds: def.stakeholderIds, concernIds: def.concernIds, concerns: def.concerns ?? [],
        purpose: def.purpose, languages: def.languages, presentation: def.presentation,
        methodText: def.methodText,
      } as SemanticElement);
    } else if (def.kind === 'stakeholder') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'Stakeholder', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId), concerns: def.concerns,
      } as SemanticElement);
    } else if (def.kind === 'activity') {
      // Nodes and edges stay on the Activity (ids only); partitions and
      // parameters are canonical owned elements.
      registerElement({
        id: def.id, name: def.name, metaclass: 'Activity', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        parameterIds: (def.parameters ?? []).map(parameter => parameter.id),
        nodeIds: (def.nodes ?? []).map(node => node.id),
        edgeIds: (def.edges ?? []).map(edge => edge.id),
        partitionIds: (def.partitions ?? []).map(partition => partition.id),
      } as SemanticElement);
      for (const partition of def.partitions ?? []) {
        registerElement({
          id: partition.id, name: partition.name, metaclass: 'ActivityPartition', namespace: def.namespace || [],
          ownerId: def.id, representsElementId: partition.representsId, nodeIds: [...(partition.nodeIds ?? [])],
        } as SemanticElement);
      }
      for (const parameter of def.parameters ?? []) {
        registerElement({
          id: parameter.id, name: parameter.name, metaclass: 'Parameter', namespace: def.namespace || [],
          ownerId: def.id, typeId: parameter.typeId, direction: parameter.direction,
        } as SemanticElement);
      }
    } else if (def.kind === 'interaction') {
      // Lifelines, messages and fragments stay on the Interaction (ids only).
      registerElement({
        id: def.id, name: def.name, metaclass: 'Interaction', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        lifelineIds: (def.lifelines ?? []).map(lifeline => lifeline.id),
        messageIds: (def.messages ?? []).map(message => message.id),
        fragmentIds: (def.fragments ?? []).map(fragment => fragment.id),
      } as SemanticElement);
    } else if (def.kind === 'constraintBlock') {
      registerElement({
        id: def.id, name: def.name, metaclass: 'ConstraintBlock', namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId), constraintIds: [],
        customProperties: { parameters: def.parameters, constraints: def.constraints },
      } as SemanticElement);
    } else if (def.kind === 'valueType') {
      registerElement({
        id: def.id,
        name: def.name,
        metaclass: 'ValueType',
        namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        unitId: def.unitId,
        quantityKindId: def.quantityKindId,
        unit: (def as any).unit,
        quantityKind: (def as any).quantityKind,
        customProperties: {
          ...((def as any).unit ? { unit: (def as any).unit } : {}),
          ...((def as any).quantityKind ? { quantityKind: (def as any).quantityKind } : {}),
        },
      } as any);
    }
  }

  // 1.2 Migrate usages that are not already represented by owned Block features.
  for (const usage of Object.values(v3.usages || {})) {
    if (v4.elements[usage.id]) continue;
    if (usage.kind === 'port') {
      registerElement({
        id: usage.id,
        name: usage.name,
        metaclass: 'Port',
        namespace: [],
        ownerId: canonicalOwnerId(usage.ownerId),
        typeId: usage.definitionId,
        portKind: 'umlPort',
        direction: 'inout',
        isConjugated: false,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      } as any);
    } else {
      registerElement({
        id: usage.id,
        name: usage.name,
        metaclass: usage.kind === 'part' ? 'PartProperty' : 'ReferenceProperty',
        namespace: [],
        ownerId: canonicalOwnerId(usage.ownerId),
        typeId: usage.typeId,
        aggregation: usage.aggregation,
        multiplicity: usage.multiplicity,
      } as any);
    }
  }

  // 2. Migrate Requirements
  for (const [id, req] of Object.entries(v3.requirements || {})) {
    const requirement: Requirement = {
      id: req.id,
      name: req.name,
      metaclass: 'Requirement',
      requirementId: req.requirementId,
      text: req.text,
      status: req.status,
      version: req.version,
      namespace: req.namespace || [],
      ownerId: canonicalOwnerId(req.ownerId),
      risk: req.risk,
      priority: req.priority,
      baselineId: req.baselineId,
      source: req.source,
      rationale: req.rationale,
      copiedFromId: req.copiedFromId,
    };
    registerElement(requirement);
  }

  // 3. Migrate VerificationCases to TestCase
  for (const [id, vc] of Object.entries(v3.verificationCases || {})) {
    const testCase: TestCase = {
      id: vc.id,
      name: vc.name,
      metaclass: 'TestCase',
      namespace: vc.namespace || [],
      ownerId: canonicalOwnerId(vc.ownerId),
      verifiesRequirementIds: vc.verifiesRequirementIds || [],
      testCaseKind: vc.method === 'inspection' ? 'inspection' : vc.method === 'analysis' ? 'analysis' : 'test',
      status: 'ready',
    };
    registerElement(testCase);
  }

  // 3.1 Migrate use-case elements. They were previously dropped, so a use
  // case could never be the endpoint of a V4 relationship.
  for (const actor of Object.values(v3.actors || {})) {
    registerElement({
      id: actor.id,
      name: actor.name,
      metaclass: 'Actor',
      namespace: actor.namespace || [],
      ownerId: canonicalOwnerId(actor.ownerId),
      customProperties: { isExternal: actor.isExternal, generalizationIds: actor.generalizationIds ?? [] },
    });
  }
  for (const useCase of Object.values(v3.useCases || {})) {
    registerElement({
      id: useCase.id,
      name: useCase.name,
      metaclass: 'UseCase',
      namespace: useCase.namespace || [],
      ownerId: canonicalOwnerId(useCase.ownerId),
      subjectIds: useCase.subjectId ? [useCase.subjectId] : [],
      extensionPointIds: useCase.extensionPointIds ?? [],
    } as SemanticElement);
  }

  // 4. Migrate Relationships
  for (const [id, rel] of Object.entries(v3.relationships || {})) {
    const metaclass = V4_RELATIONSHIP_METACLASS[rel.kind];
    const aggregation = rel.kind === 'composition' ? 'composite' : rel.kind === 'sharedAggregation' ? 'shared' : undefined;
    const relationship: SemanticRelationship = {
      id: rel.id,
      name: rel.name,
      metaclass: metaclass ?? 'Association',
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      suspect: rel.suspect,
      lastValidatedRevision: rel.lastValidatedRevision,
      // Association ends carry what V4 has no dedicated metaclass for:
      // composite/shared aggregation (diamond at the whole = source end), role
      // names, multiplicities and navigability.
      ...(aggregation || rel.sourceRole || rel.targetRole || rel.sourceMultiplicity || rel.targetMultiplicity
        ? {
            sourceEnd: {
              id: `${rel.id}:source`,
              role: rel.sourceRole,
              multiplicity: rel.sourceMultiplicity,
              aggregation: aggregation ?? rel.sourceAggregation ?? 'none',
              isNavigable: rel.sourceNavigable ?? false,
            },
            targetEnd: {
              id: `${rel.id}:target`,
              role: rel.targetRole,
              multiplicity: rel.targetMultiplicity,
              aggregation: rel.targetAggregation ?? 'none',
              isNavigable: rel.targetNavigable ?? true,
            },
          }
        : {}),
      customProperties: {
        sourceKind: rel.kind,
        ...(rel.visibility ? { visibility: rel.visibility } : {}),
        ...(rel.alias ? { alias: rel.alias } : {}),
        ...(rel.extensionPointId ? { extensionPointId: rel.extensionPointId } : {}),
      },
    };
    v4.relationships[relationship.id] = relationship;

    if (!v4.indexes.bySourceEndpoint[rel.sourceId]) v4.indexes.bySourceEndpoint[rel.sourceId] = [];
    v4.indexes.bySourceEndpoint[rel.sourceId].push(relationship.id);

    if (!v4.indexes.byTargetEndpoint[rel.targetId]) v4.indexes.byTargetEndpoint[rel.targetId] = [];
    v4.indexes.byTargetEndpoint[rel.targetId].push(relationship.id);
  }

  // 4.0 Connectors: IBD connectors were not part of the V4 view at all.
  for (const connector of Object.values(v3.connectors || {})) {
    // Format 5: a path-based end is the port it names, or the last part of its property path.
    const endpointId = (side: 'source' | 'target'): string => {
      const end = connectorEndOf(connector, side);
      if (!end) return side === 'source' ? connector.sourcePortId : connector.targetPortId;
      return end.portId ?? end.path[end.path.length - 1] ?? (side === 'source' ? connector.sourcePortId : connector.targetPortId);
    };
    const relationship: SemanticRelationship = {
      id: connector.id,
      metaclass: connector.kind === 'binding' ? 'BindingConnector' : 'Connector',
      ownerId: canonicalOwnerId(connector.ownerId),
      sourceId: endpointId('source'),
      targetId: endpointId('target'),
      customProperties: {
        sourceKind: connector.kind,
        ...(connector.itemFlowId ? { itemFlowId: connector.itemFlowId } : {}),
        ...(connectorEndOf(connector, 'source') ? { sourceEnd: connectorEndOf(connector, 'source') } : {}),
        ...(connectorEndOf(connector, 'target') ? { targetEnd: connectorEndOf(connector, 'target') } : {}),
      },
    };
    v4.relationships[relationship.id] = relationship;
    (v4.indexes.bySourceEndpoint[relationship.sourceId] ??= []).push(relationship.id);
    (v4.indexes.byTargetEndpoint[relationship.targetId] ??= []).push(relationship.id);
  }

  // 4.1 Preserve repository diagram identity and kind independently of presentations.
  for (const diagram of Object.values(v3.diagrams || {})) {
    v4.diagrams[diagram.id] = {
      id: diagram.id,
      name: diagram.name,
      metaclass: 'Diagram',
      diagramKind: diagram.diagramKind,
      namespace: diagram.namespace || [],
      ownerId: canonicalOwnerId(diagram.ownerId),
      contextElementId: diagram.contextElementId ? canonicalOwnerId(diagram.contextElementId) : undefined,
      presentationIds: [],
    };
  }

  // Rebuild byType index
  for (const el of Object.values(v4.elements)) {
    if (!v4.indexes.byType[el.metaclass]) v4.indexes.byType[el.metaclass] = [];
    v4.indexes.byType[el.metaclass].push(el.id);
  }

  // 5. Migrate Presentations
  const coords = coordinates ?? (v3 as any).coordinates ?? {};
  const diags = diagramPresentations ?? (v3 as any).diagramPresentations ?? {};
  for (const [diagramId, presData] of Object.entries(diags as Record<string, { elementIds: string[] }>)) {
    if (!v4.diagrams[diagramId]) {
      v4.diagrams[diagramId] = {
        id: diagramId,
        name: diagramId,
        metaclass: 'Diagram',
        diagramKind: 'bdd',
        namespace: [],
        ownerId: 'pkg-root',
        presentationIds: [],
      };
    }
    for (const elementId of presData.elementIds || []) {
      const presId = `pres_${diagramId}_${elementId}`;
      const c = coords[elementId] ?? {};
      const pres: DiagramPresentation = {
        id: presId,
        diagramId,
        semanticElementId: elementId,
        bounds: {
          x: c.x ?? 0,
          y: c.y ?? 0,
          width: c.width ?? 160,
          height: c.height ?? 100,
        },
      };
      v4.presentations[presId] = pres;
      if (!v4.indexes.byDiagram[diagramId]) v4.indexes.byDiagram[diagramId] = [];
      if (!v4.indexes.byDiagram[diagramId].includes(presId)) {
        v4.indexes.byDiagram[diagramId].push(presId);
      }
      if (!v4.diagrams[diagramId].presentationIds.includes(presId)) {
        v4.diagrams[diagramId].presentationIds.push(presId);
      }
    }
  }

  return v4;
}

export function serializeRepositoryV4(repo: SysmlRepositoryV4): string {
  // Deterministic sorting of keys
  const sortRecord = <T extends { id: string }>(rec: Record<string, T>): Record<string, T> => {
    const sortedKeys = Object.keys(rec).sort();
    const result: Record<string, T> = {};
    for (const key of sortedKeys) {
      result[key] = rec[key];
    }
    return result;
  };

  const canonical = {
    schemaVersion: 4,
    profileId: repo.profileId,
    revision: repo.revision,
    elements: sortRecord(repo.elements),
    relationships: sortRecord(repo.relationships),
    diagrams: sortRecord(repo.diagrams),
    presentations: sortRecord(repo.presentations),
    indexes: repo.indexes,
  };

  return JSON.stringify(canonical, null, 2);
}

export function deserializeRepositoryV4(json: string): SysmlRepositoryV4 {
  const parsed = JSON.parse(json);
  if (parsed.schemaVersion !== 4) {
    throw new Error(`Expected schemaVersion 4, received ${parsed.schemaVersion}`);
  }
  return parsed as SysmlRepositoryV4;
}

export function elementsOfKind(repoOrResult: any, kind: string): any[] {
  const repo = repoOrResult?.repository ?? repoOrResult;
  if (!repo || !repo.elements) return [];
  return Object.values(repo.elements).filter((el: any) => el.metaclass === kind);
}

export function presentationsForElement(repoOrResult: any, elementId: string): any[] {
  const repo = repoOrResult?.repository ?? repoOrResult;
  if (!repo || !repo.presentations) return [];
  return Object.values(repo.presentations).filter((p: any) => p.semanticElementId === elementId);
}
