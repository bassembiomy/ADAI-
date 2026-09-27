import type {
  SysmlRepository,
  BlockDefinition,
  ValueTypeDefinition,
  InterfaceDefinition,
  PartUsage,
  PortUsage,
  ConnectorUsage,
  SysmlRelationship,
  RequirementDefinition,
  VerificationCase,
  Multiplicity,
} from './model';
import type { PresentationCoordinates } from '../../services/sysmlCommandGateway';

export interface LargeModelResult {
  repository: SysmlRepository;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
  stats: {
    totalElements: number;
    definitionsCount: number;
    usagesCount: number;
    connectorsCount: number;
    relationshipsCount: number;
    requirementsCount: number;
    verificationCasesCount: number;
    diagramCount: number;
  };
}

export interface GeneratorOptions {
  targetElementCount: number;
  seed?: number;
  elementsPerDiagram?: number;
}

const DEFAULT_MULTIPLICITY: Multiplicity = {
  lower: 1,
  upper: 1,
  ordered: false,
  unique: true,
};

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
function createRng(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a deterministic synthetic SysML repository with exact or bounded counts.
 */
export function generateSysmlModel(options: GeneratorOptions): LargeModelResult {
  const { targetElementCount, seed = 42, elementsPerDiagram = 100 } = options;
  const rng = createRng(seed);

  // Proportions that sum to 1.0:
  // 35% blocks, 5% value types, 5% interfaces (45% definitions)
  // 20% part usages, 5% port usages (25% usages)
  // 5% connectors
  // 10% relationships
  // 12% requirements
  // 3% verification cases
  const blockCount = Math.max(1, Math.round(targetElementCount * 0.35));
  const valueTypeCount = Math.max(1, Math.round(targetElementCount * 0.05));
  const interfaceCount = Math.max(1, Math.round(targetElementCount * 0.05));

  const partCount = Math.max(1, Math.round(targetElementCount * 0.20));
  const portCount = Math.max(1, Math.round(targetElementCount * 0.05));
  const connectorCount = Math.max(1, Math.round(targetElementCount * 0.05));

  const requirementCount = Math.max(1, Math.round(targetElementCount * 0.12));
  const verificationCount = Math.max(1, Math.round(targetElementCount * 0.03));

  // Remainder goes to relationships
  const currentTotal = blockCount + valueTypeCount + interfaceCount + partCount + portCount + connectorCount + requirementCount + verificationCount;
  const relationshipCount = Math.max(1, targetElementCount - currentTotal);

  const definitions: Record<string, BlockDefinition | ValueTypeDefinition | InterfaceDefinition> = {};
  const usages: Record<string, PartUsage | PortUsage> = {};
  const connectors: Record<string, ConnectorUsage> = {};
  const relationships: Record<string, SysmlRelationship> = {};
  const requirements: Record<string, RequirementDefinition> = {};
  const verificationCases: Record<string, VerificationCase> = {};
  const coordinates: Record<string, PresentationCoordinates> = {};

  const allBlockIds: string[] = [];
  const allReqIds: string[] = [];
  const allElementIds: string[] = [];

  // 1. Generate ValueTypes
  for (let i = 0; i < valueTypeCount; i++) {
    const id = `vt_${i + 1}`;
    const vt: ValueTypeDefinition = {
      id,
      name: `ValueType_${i + 1}`,
      namespace: ['Model', 'Types'],
      kind: 'valueType',
      unit: i % 2 === 0 ? 'kg' : 'm/s',
      dimension: 'scalar',
    };
    definitions[id] = vt;
    allElementIds.push(id);
  }

  // 2. Generate Interfaces
  for (let i = 0; i < interfaceCount; i++) {
    const id = `iface_${i + 1}`;
    const iface: InterfaceDefinition = {
      id,
      name: `Interface_${i + 1}`,
      namespace: ['Model', 'Interfaces'],
      kind: 'interface',
      features: [`operation_${i}_a`, `operation_${i}_b`],
    };
    definitions[id] = iface;
    allElementIds.push(id);
  }

  // 3. Generate Blocks
  for (let i = 0; i < blockCount; i++) {
    const id = `blk_${i + 1}`;
    allBlockIds.push(id);
    const propCount = 1 + Math.floor(rng() * 3); // 1-3 properties
    const portDefCount = 1 + Math.floor(rng() * 2); // 1-2 port defs

    const block: BlockDefinition = {
      id,
      name: `Block_${i + 1}`,
      namespace: ['Model', 'Architecture'],
      kind: 'block',
      isAbstract: i % 10 === 0,
      isLeaf: i % 5 === 0,
      properties: Array.from({ length: propCount }, (_, pIdx) => ({
        id: `${id}_p${pIdx + 1}`,
        name: `prop_${pIdx + 1}`,
        kind: 'value',
        typeId: `vt_${(pIdx % valueTypeCount) + 1}`,
        multiplicity: DEFAULT_MULTIPLICITY,
      })),
      ports: Array.from({ length: portDefCount }, (_, ptIdx) => ({
        id: `${id}_port${ptIdx + 1}`,
        name: `port_${ptIdx + 1}`,
        kind: 'full',
        typeId: `iface_${(ptIdx % interfaceCount) + 1}`,
        direction: ptIdx % 2 === 0 ? 'in' : 'out',
        isConjugated: false,
        multiplicity: DEFAULT_MULTIPLICITY,
      })),
      operations: [`exec_${i}`],
      constraints: [`val_${i} > 0`],
    };
    definitions[id] = block;
    allElementIds.push(id);

    // Spatial layout
    const col = i % 50;
    const row = Math.floor(i / 50);
    coordinates[id] = {
      x: col * 220 + 50,
      y: row * 160 + 50,
      width: 180,
      height: 120,
    };
  }

  // 4. Generate Usages (Parts & Ports)
  for (let i = 0; i < partCount; i++) {
    const id = `part_${i + 1}`;
    const ownerId = allBlockIds[i % allBlockIds.length];
    const typeId = allBlockIds[(i + 1) % allBlockIds.length];
    const part: PartUsage = {
      id,
      kind: 'part',
      name: `partUsage_${i + 1}`,
      ownerId,
      typeId,
      aggregation: i % 3 === 0 ? 'composite' : 'shared',
      multiplicity: DEFAULT_MULTIPLICITY,
    };
    usages[id] = part;
    allElementIds.push(id);
    coordinates[id] = {
      x: (coordinates[ownerId]?.x ?? 0) + 20,
      y: (coordinates[ownerId]?.y ?? 0) + 40,
      width: 120,
      height: 60,
    };
  }

  for (let i = 0; i < portCount; i++) {
    const id = `port_usage_${i + 1}`;
    const ownerId = allBlockIds[i % allBlockIds.length];
    const portUsage: PortUsage = {
      id,
      kind: 'port',
      name: `portUsage_${i + 1}`,
      ownerId,
      definitionId: `${ownerId}_port1`,
    };
    usages[id] = portUsage;
    allElementIds.push(id);
  }

  // 5. Generate Connectors
  for (let i = 0; i < connectorCount; i++) {
    const id = `conn_${i + 1}`;
    const ownerId = allBlockIds[i % allBlockIds.length];
    const targetBlockId = allBlockIds[(i + 1) % allBlockIds.length];
    connectors[id] = {
      id,
      kind: 'assembly',
      ownerId,
      sourcePortId: `${ownerId}_port1`,
      targetPortId: `${targetBlockId}_port1`,
    };
    allElementIds.push(id);
  }

  // 6. Generate Requirements
  for (let i = 0; i < requirementCount; i++) {
    const id = `req_${i + 1}`;
    allReqIds.push(id);
    const req: RequirementDefinition = {
      id,
      name: `Requirement_${i + 1}`,
      namespace: ['Model', 'Requirements'],
      kind: 'requirement',
      requirementId: `REQ-${(i + 1).toString().padStart(5, '0')}`,
      text: `System shall satisfy requirement condition ${i + 1} deterministically.`,
      status: i % 4 === 0 ? 'verified' : i % 2 === 0 ? 'approved' : 'draft',
      version: '1.0.0',
      priority: i % 3 === 0 ? 'high' : 'medium',
      risk: i % 5 === 0 ? 'critical' : 'low',
    };
    requirements[id] = req;
    allElementIds.push(id);
  }

  // 7. Generate Verification Cases
  for (let i = 0; i < verificationCount; i++) {
    const id = `ver_${i + 1}`;
    const verifiedReqId = allReqIds[i % allReqIds.length];
    const vc: VerificationCase = {
      id,
      name: `VerificationCase_${i + 1}`,
      namespace: ['Model', 'Verification'],
      kind: 'verificationCase',
      method: i % 2 === 0 ? 'test' : 'analysis',
      verifiesRequirementIds: verifiedReqId ? [verifiedReqId] : [],
    };
    verificationCases[id] = vc;
    allElementIds.push(id);
  }

  // 8. Generate Relationships (generalization, satisfy, association, etc.)
  const kinds: SysmlRelationship['kind'][] = [
    'generalization',
    'association',
    'satisfy',
    'dependency',
    'verify',
  ];
  for (let i = 0; i < relationshipCount; i++) {
    const id = `rel_${i + 1}`;
    const kind = kinds[i % kinds.length];
    let sourceId: string;
    let targetId: string;

    if (kind === 'satisfy' && allReqIds.length > 0) {
      sourceId = allBlockIds[i % allBlockIds.length];
      targetId = allReqIds[i % allReqIds.length];
    } else if (kind === 'verify' && allReqIds.length > 0) {
      sourceId = `ver_${(i % verificationCount) + 1}`;
      targetId = allReqIds[i % allReqIds.length];
    } else {
      sourceId = allBlockIds[i % allBlockIds.length];
      targetId = allBlockIds[(i + 1) % allBlockIds.length];
    }

    relationships[id] = {
      id,
      kind,
      sourceId,
      targetId,
      sourceMultiplicity: DEFAULT_MULTIPLICITY,
      targetMultiplicity: DEFAULT_MULTIPLICITY,
    };
    allElementIds.push(id);
  }

  // 9. Generate Diagram Presentations
  const diagramPresentations: Record<string, { elementIds: string[] }> = {};
  const totalElements = allElementIds.length;
  const diagramCount = Math.max(1, Math.ceil(totalElements / elementsPerDiagram));

  // Root diagram has the first slice
  diagramPresentations['diagram-root'] = {
    elementIds: allElementIds.slice(0, Math.min(elementsPerDiagram, totalElements)),
  };

  for (let d = 1; d < diagramCount; d++) {
    const dId = `diagram-sub-${d}`;
    const start = (d * elementsPerDiagram) % totalElements;
    const end = Math.min(start + elementsPerDiagram, totalElements);
    diagramPresentations[dId] = {
      elementIds: allElementIds.slice(start, end),
    };
  }

  const repository: SysmlRepository = {
    schemaVersion: 3,
    profileId: 'OMG-SysML-1.6-ADIA',
    revision: 1,
    packages: { model: { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' } },
    diagrams: {},
    definitions,
    usages,
    connectors,
    relationships,
    requirements,
    verificationCases,
    evidence: {},
    baselines: {},
    artifacts: {},
    auditTrail: [],
    actors: {},
    subjects: {},
    useCases: {},
    extensionPoints: {},
    diagramReferences: {},
  };

  return {
    repository,
    coordinates,
    diagramPresentations,
    stats: {
      totalElements,
      definitionsCount: Object.keys(definitions).length,
      usagesCount: Object.keys(usages).length,
      connectorsCount: Object.keys(connectors).length,
      relationshipsCount: Object.keys(relationships).length,
      requirementsCount: Object.keys(requirements).length,
      verificationCasesCount: Object.keys(verificationCases).length,
      diagramCount: Object.keys(diagramPresentations).length,
    },
  };
}

export function generate1kModel(seed = 42): LargeModelResult {
  return generateSysmlModel({ targetElementCount: 1_000, seed, elementsPerDiagram: 50 });
}

export function generate10kModel(seed = 42): LargeModelResult {
  return generateSysmlModel({ targetElementCount: 10_000, seed, elementsPerDiagram: 100 });
}

export function generate50kModel(seed = 42): LargeModelResult {
  return generateSysmlModel({ targetElementCount: 50_000, seed, elementsPerDiagram: 150 });
}

export function generate100kModel(seed = 42): LargeModelResult {
  return generateSysmlModel({ targetElementCount: 100_000, seed, elementsPerDiagram: 200 });
}
