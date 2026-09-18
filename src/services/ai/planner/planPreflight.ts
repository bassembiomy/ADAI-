import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { Diagnostic } from '../contracts/diagnostics';
import { AdiaBlockCatalog, CatalogBlock } from '../../../agent/adiaBlockCatalog';
import { PlanValidator } from './planValidator';

export interface PreflightOptions {
  currentRevision: number;
  allowedBridgePairs?: Array<{ fromDomain: any; toDomain: any }>;
  catalog?: typeof AdiaBlockCatalog;
}

export interface PreflightResult {
  readonly passed: boolean;
  readonly diagnostics: Diagnostic[];
  readonly resolvedBlocks: Map<string, CatalogBlock>;
  readonly sortedBlockIds?: string[];
}

export class PlanPreflight {
  public static preflight(
    plan: EngineeringModelPlan,
    options: PreflightOptions
  ): PreflightResult {
    const catalog = options.catalog || AdiaBlockCatalog;
    const diagnostics: Diagnostic[] = [];
    const resolvedBlocks = new Map<string, CatalogBlock>();

    // 1. Revision scope check
    if (options.currentRevision !== undefined && plan.baseRevision !== options.currentRevision) {
      diagnostics.push({
        category: 'SCHEMA',
        code: 'STALE_BASE_REVISION',
        severity: 'ERROR',
        message: `Plan targeted revision ${plan.baseRevision}, but project is at revision ${options.currentRevision}.`,
        expected: options.currentRevision,
        actual: plan.baseRevision
      });
    }

    // 2. Base validation via PlanValidator
    const validatorResult = PlanValidator.validateEngineeringModelPlan(plan, catalog, {
      expectedRevision: options.currentRevision,
      allowedBridgePairs: options.allowedBridgePairs
    });

    for (const diag of validatorResult.diagnostics) {
      if (!diagnostics.some(d => d.code === diag.code && d.entityId === diag.entityId && d.portId === diag.portId)) {
        diagnostics.push(diag);
      }
    }

    // 3. Resolve each block
    for (const block of plan.blocks) {
      const def = catalog.findById(block.blockDefinitionId);
      if (def) {
        resolvedBlocks.set(block.id, def);
      }
    }

    // 4. Missing environment/reference blocks detection
    const hasInverterBridge = plan.blocks.some(b => {
      const defId = b.blockDefinitionId.toUpperCase();
      return defId.includes('INVERTER') || defId.includes('H_BRIDGE') || defId === 'PWM_3PH_2LEVEL';
    });

    if (hasInverterBridge) {
      const hasVoltageSource = plan.blocks.some(b => {
        const defId = b.blockDefinitionId.toUpperCase();
        return (
          defId.includes('VOLTAGE') ||
          defId.includes('SOURCE') ||
          defId.includes('BATTERY') ||
          defId === 'CONSTANT'
        );
      });

      if (!hasVoltageSource) {
        diagnostics.push({
          category: 'ENGINEERING',
          code: 'MISSING_ENVIRONMENT_REFERENCE',
          severity: 'ERROR',
          message: 'Inverter power topology requires an electrical voltage source (e.g. DC_VOLTAGE_SOURCE) to establish rail potential.'
        });
      }
    }

    // 5. Build topological dependency order from connections
    const blockIds = plan.blocks.map(b => b.id);
    const inDegree = new Map<string, number>(blockIds.map(id => [id, 0]));
    const adj = new Map<string, string[]>(blockIds.map(id => [id, []]));

    for (const conn of plan.connections) {
      if (adj.has(conn.fromBlockId) && inDegree.has(conn.toBlockId)) {
        adj.get(conn.fromBlockId)!.push(conn.toBlockId);
        inDegree.set(conn.toBlockId, (inDegree.get(conn.toBlockId) || 0) + 1);
      }
    }

    const queue: string[] = blockIds.filter(id => inDegree.get(id) === 0);
    const sortedBlockIds: string[] = [];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      sortedBlockIds.push(curr);
      for (const neighbor of adj.get(curr) || []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    const hasErrors = diagnostics.some(d => d.severity === 'ERROR');

    return {
      passed: !hasErrors,
      diagnostics,
      resolvedBlocks,
      sortedBlockIds: sortedBlockIds.length === blockIds.length ? sortedBlockIds : blockIds
    };
  }
}
