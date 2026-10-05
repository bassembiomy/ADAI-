import {
  buildXbridgesCapabilityIndex,
  XbridgesBlockCapability,
  XbridgesCapabilityIndex
} from '../../catalog/xbridgesCapabilityIndex';
import { RequestEntity } from '../contracts/structuredEngineeringRequest';
import { CompositionResolver } from '../mapping/compositionResolver';

export type CatalogEntityResolutionResult =
  | {
      status: 'resolved';
      canonicalBlockId: string;
      inputPortIds: string[];
      outputPortIds: string[];
      parameterNames: string[];
      blockCapability: XbridgesBlockCapability;
      confidence: number;
    }
  | {
      status: 'capability_gap';
      requestedAlias: string;
      reason: string;
    }
  | {
      status: 'ambiguous';
      requestedAlias: string;
      candidateBlockIds: string[];
      reason: string;
    };

export interface EntityGroundingGap {
  entityId: string;
  semanticType: string;
  reason: string;
}

export interface GroundEntitiesResult {
  allResolved: boolean;
  groundedEntities: RequestEntity[];
  gaps: EntityGroundingGap[];
}

export class CatalogEntityResolver {
  private readonly catalog: XbridgesCapabilityIndex;
  private readonly compositionResolver: CompositionResolver;

  // Verified alias mappings directly backed by canonical catalog blocks
  private static readonly VERIFIED_ALIASES: Record<string, string> = {
    'constant': 'Constant',
    'cnstant': 'Constant',
    'source': 'Constant',
    'sum': 'Sum',
    'adder': 'Sum',
    'add': 'Sum',
    'addition': 'Sum',
    'subtraction': 'Sum',
    'subtract': 'Sum',
    'vectormul': 'VectorMul',
    'multiply': 'VectorMul',
    'multiplier': 'VectorMul',
    'product': 'VectorMul',
    'pid': 'PID_CONTROLLER',
    'pid controller': 'PID_CONTROLLER',
    'pid_controller': 'PID_CONTROLLER',
    'controller': 'PID_CONTROLLER',
    'transfer function': 'TRANSFER_FUNCTION',
    'transfer_function': 'TRANSFER_FUNCTION',
    'tf': 'TRANSFER_FUNCTION',
    'discrete transfer function': 'DISCRETE_TRANSFER_FUNCTION',
    'discrete_transfer_function': 'DISCRETE_TRANSFER_FUNCTION',
    'scope': 'Scope',
    'display': 'Scope',
    'plot': 'Scope',
    'integrator': 'Integrator',
    'gain': 'Gain'
  };

  constructor(catalog?: XbridgesCapabilityIndex) {
    this.catalog = catalog ?? buildXbridgesCapabilityIndex();
    this.compositionResolver = new CompositionResolver();
  }

  /**
   * Resolves a semantic type or natural language alias to a verified catalog block.
   * Never invents block IDs, ports, or parameters.
   */
  public resolve(aliasOrSemanticType: string): CatalogEntityResolutionResult {
    if (!aliasOrSemanticType || typeof aliasOrSemanticType !== 'string') {
      return {
        status: 'capability_gap',
        requestedAlias: String(aliasOrSemanticType),
        reason: 'Empty or invalid entity identifier provided.'
      };
    }

    const trimmed = aliasOrSemanticType.trim();
    const lower = trimmed.toLowerCase();

    // 1. Direct exact catalog block lookup
    if (this.catalog.blocks.has(trimmed)) {
      return this.buildResolvedResult(trimmed);
    }

    // 2. Direct catalog alias lookup from buildXbridgesCapabilityIndex()
    const catalogAlias = this.catalog.aliases.get(lower);
    if (catalogAlias && this.catalog.blocks.has(catalogAlias)) {
      return this.buildResolvedResult(catalogAlias);
    }

    // 3. Verified aliases dictionary
    if (CatalogEntityResolver.VERIFIED_ALIASES[lower]) {
      const canonicalId = CatalogEntityResolver.VERIFIED_ALIASES[lower];
      if (this.catalog.blocks.has(canonicalId)) {
        return this.buildResolvedResult(canonicalId);
      }
    }

    // 4. Composition resolver verified concept mapping
    const conceptKey = `concept_${lower.replace(/[\s-]+/g, '_')}`;
    const compResolved = this.compositionResolver.resolveConcept(conceptKey, this.catalog);
    if (compResolved && this.catalog.blocks.has(compResolved.blockId)) {
      return this.buildResolvedResult(compResolved.blockId);
    }

    // 5. Capability gap: Reject unverified or invented blocks
    return {
      status: 'capability_gap',
      requestedAlias: trimmed,
      reason: `Block '${trimmed}' not found in catalog or verified capability mappings. Block capabilities cannot be invented.`
    };
  }

  /**
   * Grounds all entities in a structured request against the catalog.
   */
  public groundEntities(entities: readonly RequestEntity[]): GroundEntitiesResult {
    const groundedEntities: RequestEntity[] = [];
    const gaps: EntityGroundingGap[] = [];

    for (const ent of entities) {
      const resolution = this.resolve(ent.semanticType);
      if (resolution.status === 'resolved') {
        groundedEntities.push({
          ...ent,
          catalogBlockId: resolution.canonicalBlockId,
          confidence: Math.min(ent.confidence, resolution.confidence)
        });
      } else {
        gaps.push({
          entityId: ent.id,
          semanticType: ent.semanticType,
          reason: resolution.status === 'capability_gap' ? resolution.reason : 'Ambiguous mapping'
        });
      }
    }

    return {
      allResolved: gaps.length === 0,
      groundedEntities,
      gaps
    };
  }

  private buildResolvedResult(blockId: string): CatalogEntityResolutionResult {
    const block = this.catalog.blocks.get(blockId)!;
    const inputPortIds = block.inputs.map(p => p.id);
    const outputPortIds = block.outputs.map(p => p.id);
    const parameterNames = [...block.parameterNames];

    return {
      status: 'resolved',
      canonicalBlockId: block.id,
      inputPortIds,
      outputPortIds,
      parameterNames,
      blockCapability: block,
      confidence: 1.0
    };
  }
}
