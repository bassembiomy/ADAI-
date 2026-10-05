import type {
  SysmlRepository,
  BlockDefinition,
  ValueTypeDefinition,
  InterfaceDefinition,
  ConnectorUsage,
  SysmlRelationship,
  RequirementDefinition,
  VerificationCase,
  Multiplicity,
  PackageDefinition,
  ModelDiagramDefinition,
} from './model';
import type { PresentationCoordinates } from '../../services/sysmlCommandGateway';
import type { StateMachineModelV5 } from '../../utils/stateMachine/smModel';
import { defaultSMVerificationConfig } from '../../utils/stateMachine/smModel';
import type { StateData, TransitionData, JunctionData } from '../../types/sm_types';

export type ScalabilityTopology = 'broad' | 'deep' | 'dense' | 'distributed';

export interface ScalabilityFixtureOptions {
  semanticCount: number;
  seed?: number;
  topology?: ScalabilityTopology;
  activeDiagramCount?: number;
  ordinaryDiagramDensity?: number;
  stressDiagramDensity?: number;
}

export interface ScalabilityCounts {
  totalSemanticElements: number;
  packages: number;
  blocks: number;
  valueTypes: number;
  interfaces: number;
  properties: number;
  ports: number;
  connectors: number;
  relationships: number;
  requirements: number;
  verificationCases: number;
  stateMachineEntities: number;
  diagrams: number;
}

export interface ScalabilityFixtureResult {
  repository: SysmlRepository;
  stateMachine: StateMachineModelV5;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
  counts: ScalabilityCounts;
}

export interface LargeModelResult {
  repository: SysmlRepository;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
  stats: {
    totalElements: number;
    definitionsCount: number;
    partsCount: number;
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
  // 20% part properties (a part is only a Block property, format 5)
  // 5% connectors
  // 10% relationships
  // 12% requirements
  // 3% verification cases
  const blockCount = Math.max(1, Math.round(targetElementCount * 0.35));
  const valueTypeCount = Math.max(1, Math.round(targetElementCount * 0.05));
  const interfaceCount = Math.max(1, Math.round(targetElementCount * 0.05));

  const partCount = Math.max(1, Math.round(targetElementCount * 0.20));
  const connectorCount = Math.max(1, Math.round(targetElementCount * 0.05));

  const requirementCount = Math.max(1, Math.round(targetElementCount * 0.12));
  const verificationCount = Math.max(1, Math.round(targetElementCount * 0.03));

  // Remainder goes to relationships
  const currentTotal = blockCount + valueTypeCount + interfaceCount + partCount + connectorCount + requirementCount + verificationCount;
  const relationshipCount = Math.max(1, targetElementCount - currentTotal);

  const definitions: Record<string, BlockDefinition | ValueTypeDefinition | InterfaceDefinition> = {};
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

  // 4. Generate parts: part/reference properties of their owner Block (no usage records).
  for (let i = 0; i < partCount; i++) {
    const id = `part_${i + 1}`;
    const ownerId = allBlockIds[i % allBlockIds.length];
    const typeId = allBlockIds[(i + 1) % allBlockIds.length];
    (definitions[ownerId] as BlockDefinition).properties.push({
      id,
      name: `part_${i + 1}`,
      kind: i % 3 === 0 ? 'part' : 'reference',
      typeId,
      multiplicity: DEFAULT_MULTIPLICITY,
    });
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
  const totalElements = allElementIds.length + partCount;
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
    usages: {},
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
      partsCount: partCount,
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

/**
 * Generate a deterministic scalability fixture with exact semantic counting,
 * mixed model profile (packages, blocks, properties, ports, connectors, relationships,
 * requirements, verification cases, state machine, diagrams), and configurable topology.
 */
export function generateScalabilityFixture(options: ScalabilityFixtureOptions): ScalabilityFixtureResult {
  const {
    semanticCount,
    seed = 42,
    topology = 'distributed',
    activeDiagramCount = 2,
    ordinaryDiagramDensity = 250,
    stressDiagramDensity = 2500,
  } = options;

  if (semanticCount < 10) {
    throw new Error(`semanticCount must be at least 10, got ${semanticCount}`);
  }

  // 1. Exact count allocations
  let packagesCount = 1;
  if (topology === 'broad') {
    packagesCount = Math.min(20, Math.max(2, Math.floor(semanticCount * 0.005)));
  } else if (topology === 'deep') {
    packagesCount = Math.min(50, Math.max(3, Math.floor(semanticCount * 0.01)));
  } else if (topology === 'dense') {
    packagesCount = Math.min(10, Math.max(2, Math.floor(semanticCount * 0.005)));
  } else {
    packagesCount = Math.min(100, Math.max(3, Math.floor(semanticCount * 0.01)));
  }

  const diagramsCount = Math.max(2, activeDiagramCount);
  const smCount = Math.max(4, Math.floor(semanticCount * 0.02));

  let remaining = semanticCount - packagesCount - diagramsCount - smCount;

  const valueTypesCount = Math.max(2, Math.floor(remaining * 0.04));
  const interfacesCount = Math.max(2, Math.floor(remaining * 0.04));
  const requirementsCount = Math.max(5, Math.floor(remaining * 0.12));
  const verificationCasesCount = Math.max(2, Math.floor(remaining * 0.03));

  let connectorsCount = topology === 'dense'
    ? Math.max(5, Math.floor(remaining * 0.08))
    : Math.max(2, Math.floor(remaining * 0.04));

  let blocksFraction = 0.25;
  if (topology === 'broad') blocksFraction = 0.30;
  if (topology === 'dense') blocksFraction = 0.20;
  if (topology === 'deep') blocksFraction = 0.25;

  const blocksCount = Math.max(5, Math.floor(remaining * blocksFraction));
  let propertiesCount = Math.max(5, Math.floor(remaining * 0.20));
  // Guarantee at least 2 ports per connector owner
  const portsCount = Math.max(connectorsCount * 2, Math.floor(remaining * 0.10));

  const subTotal =
    packagesCount +
    diagramsCount +
    smCount +
    valueTypesCount +
    interfacesCount +
    requirementsCount +
    verificationCasesCount +
    connectorsCount +
    blocksCount +
    propertiesCount +
    portsCount;

  let relationshipsCount = semanticCount - subTotal;
  if (relationshipsCount < 1) {
    const diff = 1 - relationshipsCount;
    propertiesCount = Math.max(1, propertiesCount - diff);
    relationshipsCount = semanticCount - (
      packagesCount +
      diagramsCount +
      smCount +
      valueTypesCount +
      interfacesCount +
      requirementsCount +
      verificationCasesCount +
      connectorsCount +
      blocksCount +
      propertiesCount +
      portsCount
    );
  }

  // 2. Packages
  const packages: Record<string, PackageDefinition> = {
    model: { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' },
  };

  for (let p = 1; p < packagesCount; p++) {
    const pkgId = `pkg_${p}`;
    let ownerId: string;
    let parentNs: string[];

    if (topology === 'deep') {
      ownerId = p === 1 ? 'model' : `pkg_${p - 1}`;
      parentNs = ownerId === 'model' ? ['Model'] : [...packages[ownerId].namespace, packages[ownerId].name];
    } else if (topology === 'broad' || topology === 'dense') {
      ownerId = 'model';
      parentNs = ['Model'];
    } else {
      // distributed
      const parentIndex = Math.floor((p - 1) / 3);
      ownerId = parentIndex === 0 ? 'model' : `pkg_${parentIndex}`;
      parentNs = ownerId === 'model' ? ['Model'] : [...packages[ownerId].namespace, packages[ownerId].name];
    }

    packages[pkgId] = {
      id: pkgId,
      kind: 'package',
      name: `Package_${p}`,
      namespace: parentNs,
      ownerId,
    };
  }

  // 3. Definitions (ValueTypes, Interfaces, Blocks)
  const definitions: Record<string, BlockDefinition | ValueTypeDefinition | InterfaceDefinition> = {};
  const allBlockIds: string[] = [];

  for (let i = 0; i < valueTypesCount; i++) {
    const id = `vt_${i + 1}`;
    definitions[id] = {
      id,
      kind: 'valueType',
      name: `ValueType_${i + 1}`,
      namespace: ['Model', 'Types'],
      unit: i % 2 === 0 ? 'kg' : 'm/s',
      dimension: 'scalar',
    };
  }

  for (let i = 0; i < interfacesCount; i++) {
    const id = `iface_${i + 1}`;
    definitions[id] = {
      id,
      kind: 'interface',
      name: `Interface_${i + 1}`,
      namespace: ['Model', 'Interfaces'],
      features: [`op_${i}_a`, `op_${i}_b`],
    };
  }

  const pkgKeys = Object.keys(packages);
  for (let i = 0; i < blocksCount; i++) {
    const id = `blk_${i + 1}`;
    allBlockIds.push(id);
    const ownerPkgId = pkgKeys[i % pkgKeys.length];
    const ns = ownerPkgId === 'model' ? ['Model'] : [...packages[ownerPkgId].namespace, packages[ownerPkgId].name];

    let supertypeIds: string[] | undefined;
    if (topology === 'deep' && i > 0 && i % 4 === 0) {
      supertypeIds = [`blk_${i}`];
    }

    definitions[id] = {
      id,
      kind: 'block',
      name: `Block_${i + 1}`,
      namespace: ns,
      isAbstract: i % 10 === 0,
      isLeaf: i % 7 === 0,
      supertypeIds,
      properties: [],
      ports: [],
      operations: [`exec_${i}`],
      constraints: [`val_${i} > 0`],
    };
  }

  // 4. Properties
  for (let p = 0; p < propertiesCount; p++) {
    const bIdx = p % blocksCount;
    const blockId = allBlockIds[bIdx];
    const pNum = Math.floor(p / blocksCount) + 1;
    const propId = `prop_${blockId}_${pNum}`;
    const kind = p % 3 === 0 ? 'part' : p % 3 === 1 ? 'reference' : 'value';

    let typeId: string;
    if (kind === 'value') {
      typeId = `vt_${(p % valueTypesCount) + 1}`;
    } else {
      typeId = allBlockIds[(bIdx + 1) % blocksCount];
    }

    (definitions[blockId] as BlockDefinition).properties.push({
      id: propId,
      name: `prop_${pNum}`,
      kind,
      typeId,
      multiplicity: DEFAULT_MULTIPLICITY,
    });
  }

  // 5. Ports (assigned deterministically across blocks)
  for (let pt = 0; pt < portsCount; pt++) {
    const bIdx = pt % blocksCount;
    const blockId = allBlockIds[bIdx];
    const ptNum = Math.floor(pt / blocksCount) + 1;
    const portId = `port_${blockId}_${ptNum}`;
    const direction = ptNum % 2 === 1 ? 'out' : 'in';
    const typeId = `iface_${(pt % interfacesCount) + 1}`;

    (definitions[blockId] as BlockDefinition).ports.push({
      id: portId,
      name: `port_${ptNum}`,
      kind: 'full',
      direction,
      typeId,
      isConjugated: false,
      multiplicity: DEFAULT_MULTIPLICITY,
    });
  }

  // 6. Connectors (valid format 5 assembly connectors on owner blocks)
  const connectors: Record<string, ConnectorUsage> = {};
  for (let c = 0; c < connectorsCount; c++) {
    const connId = `conn_${c + 1}`;
    const bIdx = c % blocksCount;
    const ownerBlock = definitions[allBlockIds[bIdx]] as BlockDefinition;

    let portOut = ownerBlock.ports.find(p => p.direction === 'out');
    let portIn = ownerBlock.ports.find(p => p.direction === 'in');

    if (!portOut || !portIn) {
      // Fallback to any ports on owner
      portOut = ownerBlock.ports[0];
      portIn = ownerBlock.ports[ownerBlock.ports.length > 1 ? 1 : 0];
    }

    connectors[connId] = {
      id: connId,
      kind: 'assembly',
      ownerId: ownerBlock.id,
      sourcePortId: portOut.id,
      targetPortId: portIn.id,
      sourceEnd: { path: [], portId: portOut.id },
      targetEnd: { path: [], portId: portIn.id },
    };
  }

  // 7. Requirements
  const requirements: Record<string, RequirementDefinition> = {};
  const allReqIds: string[] = [];
  for (let r = 0; r < requirementsCount; r++) {
    const reqId = `req_${r + 1}`;
    allReqIds.push(reqId);
    requirements[reqId] = {
      id: reqId,
      name: `Requirement_${r + 1}`,
      namespace: ['Model', 'Requirements'],
      kind: 'requirement',
      requirementId: `REQ-${(r + 1).toString().padStart(6, '0')}`,
      text: `Deterministic scalability requirement ${r + 1}`,
      status: r % 4 === 0 ? 'verified' : r % 2 === 0 ? 'approved' : 'draft',
      version: '1.0.0',
      priority: r % 3 === 0 ? 'high' : 'medium',
      risk: r % 5 === 0 ? 'critical' : 'low',
    };
  }

  // 8. Verification Cases
  const verificationCases: Record<string, VerificationCase> = {};
  for (let v = 0; v < verificationCasesCount; v++) {
    const verId = `ver_${v + 1}`;
    const targetReqId = allReqIds[v % allReqIds.length];
    verificationCases[verId] = {
      id: verId,
      name: `VerificationCase_${v + 1}`,
      namespace: ['Model', 'Verification'],
      kind: 'verificationCase',
      method: v % 2 === 0 ? 'test' : 'analysis',
      verifiesRequirementIds: [targetReqId],
    };
  }

  // 9. Relationships
  const relationships: Record<string, SysmlRelationship> = {};
  const kinds: SysmlRelationship['kind'][] = ['satisfy', 'verify', 'generalization', 'association', 'dependency'];

  for (let rel = 0; rel < relationshipsCount; rel++) {
    const relId = `rel_${rel + 1}`;
    const kind = kinds[rel % kinds.length];
    let sourceId: string;
    let targetId: string;

    if (kind === 'satisfy') {
      sourceId = allBlockIds[rel % allBlockIds.length];
      targetId = allReqIds[rel % allReqIds.length];
    } else if (kind === 'verify') {
      sourceId = `ver_${(rel % verificationCasesCount) + 1}`;
      targetId = allReqIds[rel % allReqIds.length];
    } else if (kind === 'generalization') {
      if (allBlockIds.length > 1) {
        const b1 = (rel % (allBlockIds.length - 1)) + 1; // 1 to length - 1
        const b2 = rel % b1; // 0 to b1 - 1
        sourceId = allBlockIds[b1];
        targetId = allBlockIds[b2];
      } else {
        sourceId = allBlockIds[0];
        targetId = allBlockIds[0];
      }
    } else {
      sourceId = allBlockIds[rel % allBlockIds.length];
      targetId = allBlockIds[(rel + 1) % allBlockIds.length];
    }

    relationships[relId] = {
      id: relId,
      kind,
      sourceId,
      targetId,
      sourceMultiplicity: DEFAULT_MULTIPLICITY,
      targetMultiplicity: DEFAULT_MULTIPLICITY,
    };
  }

  // 10. State Machine Entities
  const layerId = 'sm_l_1';
  const junctionId = 'sm_j_1';
  const numStates = Math.max(2, Math.floor((smCount - 2) * 0.6));
  const numTransitions = smCount - 2 - numStates;

  const states: StateData[] = [];
  for (let s = 0; s < numStates; s++) {
    const sid = `sm_s_${s + 1}`;
    states.push({
      id: sid,
      name: `State_${s + 1}`,
      x: 100 + (s % 10) * 150,
      y: 100 + Math.floor(s / 10) * 120,
      width: 120,
      height: 80,
      entry: '',
      during: '',
      exit: '',
      isActive: s === 0,
      color: '#3b82f6',
      parentId: null,
      children: [],
      priority: s + 1,
      isParallel: false,
      regionId: null,
      autostart: s === 0,
    });
  }

  const transitions: TransitionData[] = [];
  for (let t = 0; t < numTransitions; t++) {
    const tid = `sm_t_${t + 1}`;
    const src = states[t % numStates].id;
    const tgt = states[(t + 1) % numStates].id;
    transitions.push({
      id: tid,
      sourceId: src,
      targetId: tgt,
      condition: `x > ${t}`,
      action: `y = ${t}`,
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: t + 1,
    });
  }

  const junctions: JunctionData[] = [
    {
      id: junctionId,
      name: 'init_junction',
      x: 50,
      y: 50,
      color: '#000000',
      parentId: null,
      type: 'initial',
      autostart: true,
    },
  ];

  const layers = [
    {
      id: layerId,
      name: 'RootLayer',
      parentStateId: null,
      stateIds: states.map(s => s.id),
      transitionIds: transitions.map(t => t.id),
      junctionIds: [junctionId],
      decomposition: 'OR' as const,
    },
  ];

  const stateMachine: StateMachineModelV5 = {
    schemaVersion: 5,
    tickMs: 10,
    states,
    junctions,
    transitions,
    variables: [],
    layers,
    safetyMode: false,
    verification: defaultSMVerificationConfig(),
  };

  // 11. Diagrams
  const diagrams: Record<string, ModelDiagramDefinition> = {
    'diagram-ordinary': {
      id: 'diagram-ordinary',
      kind: 'diagram',
      diagramKind: 'bdd',
      name: 'Ordinary BDD',
      namespace: ['Model'],
      ownerId: 'model',
    },
    'diagram-stress': {
      id: 'diagram-stress',
      kind: 'diagram',
      diagramKind: 'bdd',
      name: 'Stress BDD',
      namespace: ['Model'],
      ownerId: 'model',
    },
  };

  for (let d = 3; d <= diagramsCount; d++) {
    const dId = `diagram-${d}`;
    diagrams[dId] = {
      id: dId,
      kind: 'diagram',
      diagramKind: 'bdd',
      name: `Diagram ${d}`,
      namespace: ['Model'],
      ownerId: 'model',
    };
  }

  // 12. Coordinates and Presentations
  const coordinates: Record<string, PresentationCoordinates> = {};
  const presentedCandidates = [...allBlockIds, ...allReqIds];

  for (let i = 0; i < presentedCandidates.length; i++) {
    const id = presentedCandidates[i];
    const col = i % 50;
    const row = Math.floor(i / 50);
    coordinates[id] = {
      x: col * 240 + 50,
      y: row * 160 + 50,
      width: 180,
      height: 120,
    };
  }

  const diagramPresentations: Record<string, { elementIds: string[] }> = {};
  const ordinaryTarget = Math.min(
    ordinaryDiagramDensity,
    Math.max(100, Math.min(500, presentedCandidates.length))
  );
  diagramPresentations['diagram-ordinary'] = {
    elementIds: presentedCandidates.slice(0, ordinaryTarget),
  };

  const stressTarget = Math.max(
    ordinaryTarget + 1,
    Math.min(stressDiagramDensity, presentedCandidates.length)
  );
  diagramPresentations['diagram-stress'] = {
    elementIds: presentedCandidates.slice(0, stressTarget),
  };

  const diagKeys = Object.keys(diagrams);
  for (let d = 2; d < diagKeys.length; d++) {
    const dId = diagKeys[d];
    const sliceStart = (d * 50) % presentedCandidates.length;
    diagramPresentations[dId] = {
      elementIds: presentedCandidates.slice(sliceStart, sliceStart + 100),
    };
  }

  const repository: SysmlRepository = {
    schemaVersion: 3,
    profileId: 'OMG-SysML-1.6-ADIA',
    revision: 1,
    packages,
    diagrams,
    definitions,
    usages: {},
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

  const counts: ScalabilityCounts = {
    totalSemanticElements: semanticCount,
    packages: packagesCount,
    blocks: blocksCount,
    valueTypes: valueTypesCount,
    interfaces: interfacesCount,
    properties: propertiesCount,
    ports: portsCount,
    connectors: connectorsCount,
    relationships: relationshipsCount,
    requirements: requirementsCount,
    verificationCases: verificationCasesCount,
    stateMachineEntities: smCount,
    diagrams: diagramsCount,
  };

  return {
    repository,
    stateMachine,
    coordinates,
    diagramPresentations,
    counts,
  };
}
