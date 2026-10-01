import type { SysmlRepository } from '../model';
import type {
  SysmlRepositoryV4,
  Block,
  Requirement,
  TestCase,
  SemanticRelationship,
  DiagramPresentation,
} from '../domain';
import { createEmptyRepositoryV4 } from '../domain';

export function migrateV3ToV4(
  v3: SysmlRepository,
  coordinates?: Record<string, any>,
  diagramPresentations?: Record<string, { elementIds: string[] }>
): SysmlRepositoryV4 {
  const v4 = createEmptyRepositoryV4();
  v4.revision = v3.revision;
  const canonicalOwnerId = (ownerId?: string | null): string =>
    !ownerId || ownerId === 'model' ? 'pkg-root' : ownerId;
  const registerElement = (element: SysmlRepositoryV4['elements'][string]): void => {
    v4.elements[element.id] = element;
    if (element.ownerId) {
      const owned = v4.indexes.byOwner[element.ownerId] ?? [];
      if (!owned.includes(element.id)) v4.indexes.byOwner[element.ownerId] = [...owned, element.id];
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
        generalIds: def.supertypeIds,
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
    } else if (def.kind === 'valueType') {
      registerElement({
        id: def.id,
        name: def.name,
        metaclass: 'ValueType',
        namespace: def.namespace || [],
        ownerId: canonicalOwnerId(def.ownerId),
        unitId: (def as any).unit,
        quantityKindId: (def as any).quantityKind,
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

  // 4. Migrate Relationships
  for (const [id, rel] of Object.entries(v3.relationships || {})) {
    const kindMap: Record<string, any> = {
      satisfy: 'Satisfy',
      verify: 'Verify',
      deriveReqt: 'DeriveReqt',
      refine: 'Refine',
      trace: 'Trace',
      copy: 'Copy',
      requirementContainment: 'Containment',
      association: 'Association',
      generalization: 'Generalization',
      composition: 'Association',
      aggregation: 'Association',
    };
    const metaclass = kindMap[rel.kind] || 'Association';
    const relationship: SemanticRelationship = {
      id: rel.id,
      name: rel.name,
      metaclass,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      suspect: rel.suspect,
    };
    v4.relationships[relationship.id] = relationship;

    if (!v4.indexes.bySourceEndpoint[rel.sourceId]) v4.indexes.bySourceEndpoint[rel.sourceId] = [];
    v4.indexes.bySourceEndpoint[rel.sourceId].push(relationship.id);

    if (!v4.indexes.byTargetEndpoint[rel.targetId]) v4.indexes.byTargetEndpoint[rel.targetId] = [];
    v4.indexes.byTargetEndpoint[rel.targetId].push(relationship.id);
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
