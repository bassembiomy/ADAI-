import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { Diagnostic } from '../contracts/diagnostics';
import { AdiaBlockCatalog, CatalogBlock } from '../../../agent/adiaBlockCatalog';
import { PlanValidator } from './planValidator';

export interface PreflightOptions {
  currentRevision: number;
  allowedBridgePairs?: Array<{ fromDomain: any; toDomain: any }>;
  catalog?: typeof AdiaBlockCatalog;
  plugins?: PreflightRulePlugin[];
}

export interface PreflightResult {
  readonly passed: boolean;
  readonly diagnostics: Diagnostic[];
  readonly resolvedBlocks: Map<string, CatalogBlock>;
  readonly sortedBlockIds?: string[];
}

export type PreflightRulePlugin = (
  plan: EngineeringModelPlan,
  context: {
    catalog: typeof AdiaBlockCatalog;
    resolvedBlocks: Map<string, CatalogBlock>;
    options: PreflightOptions;
  }
) => Diagnostic[];

// 1. Inverter and Power Electronic Topology Rule Plugin
export const inverterRulePlugin: PreflightRulePlugin = (plan) => {
  const diagnostics: Diagnostic[] = [];

  const inverterBlocks = plan.blocks.filter(b => {
    const defId = b.blockDefinitionId.toUpperCase();
    return defId === 'THREE_PHASE_INVERTER' || defId.includes('INVERTER') || defId.includes('H_BRIDGE');
  });

  for (const invBlock of inverterBlocks) {
    const posConn = plan.connections.find(
      c => c.toBlockId === invBlock.id && (c.toPortId === 'vdc_p' || c.toPortId === 'dc_pos')
    );
    const negConn = plan.connections.find(
      c => c.toBlockId === invBlock.id && (c.toPortId === 'vdc_n' || c.toPortId === 'dc_neg')
    );

    if (!posConn) {
      diagnostics.push({
        category: 'ENGINEERING',
        code: 'MISSING_ENVIRONMENT_REFERENCE',
        severity: 'ERROR',
        message: `Inverter bridge '${invBlock.id}' requires an electrical DC voltage source connected to positive rail 'vdc_p'.`,
        entityId: invBlock.id,
        portId: 'vdc_p',
      });
    }

    if (!negConn) {
      diagnostics.push({
        category: 'ENGINEERING',
        code: 'MISSING_DC_RAIL_RETURN',
        severity: 'ERROR',
        message: `Inverter bridge '${invBlock.id}' is missing negative DC rail return on 'vdc_n'. A complete physical inverter circuit requires both positive and negative DC rail returns.`,
        entityId: invBlock.id,
        portId: 'vdc_n',
      });
    }

    const acPhasePorts = ['va', 'vb', 'vc'];
    const connectedAcPorts = plan.connections
      .filter(c => c.fromBlockId === invBlock.id && acPhasePorts.includes(c.fromPortId))
      .map(c => c.fromPortId);

    if (connectedAcPorts.length < acPhasePorts.length) {
      diagnostics.push({
        category: 'ENGINEERING',
        code: 'MISSING_LOAD_REFERENCE',
        severity: 'ERROR',
        message: `Inverter bridge '${invBlock.id}' 3-phase AC outputs (va, vb, vc) must connect to an AC load or machine. Missing: ${acPhasePorts.filter(p => !connectedAcPorts.includes(p)).join(', ')}.`,
        entityId: invBlock.id,
      });
    }
  }

  const pwmBlocks = plan.blocks.filter(b => b.blockDefinitionId === 'THREE_PHASE_PWM');
  for (const pwm of pwmBlocks) {
    const refPorts = ['va_ref', 'vb_ref', 'vc_ref'];
    const connectedRefPorts = plan.connections
      .filter(c => c.toBlockId === pwm.id && refPorts.includes(c.toPortId))
      .map(c => c.toPortId);

    if (connectedRefPorts.length < refPorts.length) {
      diagnostics.push({
        category: 'ENGINEERING',
        code: 'MISSING_LOAD_REFERENCE',
        severity: 'ERROR',
        message: `PWM modulator '${pwm.id}' reference inputs (va_ref, vb_ref, vc_ref) must connect to a modulation voltage reference generator. Missing: ${refPorts.filter(p => !connectedRefPorts.includes(p)).join(', ')}.`,
        entityId: pwm.id,
      });
    }
  }

  return diagnostics;
};

// 2. Port Domain & Signal Compatibility Rule Plugin
export const portCompatibilityRulePlugin: PreflightRulePlugin = (plan, { resolvedBlocks }) => {
  const diagnostics: Diagnostic[] = [];

  for (const conn of plan.connections) {
    const fromDef = resolvedBlocks.get(conn.fromBlockId);
    const toDef = resolvedBlocks.get(conn.toBlockId);
    if (!fromDef || !toDef) continue;

    const fromPort = fromDef.ports.find(p => p.id === conn.fromPortId);
    const toPort = toDef.ports.find(p => p.id === conn.toPortId);
    if (!fromPort || !toPort) continue;

    const fromType = (fromPort.type || '').toLowerCase();
    const toType = (toPort.type || '').toLowerCase();

    if ((fromType === 'logical' && toType === 'power') || (fromType === 'power' && toType === 'logical')) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'GATE_PHYSICAL_PORT_MISMATCH',
        severity: 'ERROR',
        message: `Gate-to-physical port mismatch: Cannot connect logical gate port '${conn.fromBlockId}.${conn.fromPortId}' (${fromType}) to physical power port '${conn.toBlockId}.${conn.toPortId}' (${toType}).`,
        entityId: conn.id,
      });
    }

    if (fromDef.id === 'Constant' && toType === 'power') {
      diagnostics.push({
        category: 'ENGINEERING',
        code: 'PORT_DOMAIN_MISMATCH',
        severity: 'ERROR',
        message: `Port domain mismatch: Cannot connect signal block '${conn.fromBlockId}' (Constant) to electrical power rail '${conn.toPortId}'. An electrical DC voltage source is required.`,
        entityId: conn.id,
      });
    }
  }

  return diagnostics;
};

// 3. Disconnected Island Detection Rule Plugin
export const disconnectedIslandsRulePlugin: PreflightRulePlugin = (plan) => {
  const diagnostics: Diagnostic[] = [];
  if (plan.blocks.length <= 1) return diagnostics;

  const connectedBlocks = new Set<string>();
  for (const c of plan.connections) {
    connectedBlocks.add(c.fromBlockId);
    connectedBlocks.add(c.toBlockId);
  }

  for (const b of plan.blocks) {
    if (!connectedBlocks.has(b.id)) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'DISCONNECTED_ISLAND',
        severity: 'WARNING',
        message: `Block '${b.id}' is disconnected from the model graph (no input or output connections).`,
        entityId: b.id,
      });
    }
  }

  return diagnostics;
};

// 4. Source / Sink Reachability Rule Plugin
export const sourceSinkReachabilityRulePlugin: PreflightRulePlugin = (plan, { resolvedBlocks }) => {
  const diagnostics: Diagnostic[] = [];
  if (plan.blocks.length === 0) return diagnostics;

  const sources = plan.blocks.filter(b => {
    const def = resolvedBlocks.get(b.id);
    if (!def) return false;
    const inPorts = def.ports.filter(p => p.direction === 'input');
    const outPorts = def.ports.filter(p => p.direction === 'output');
    return inPorts.length === 0 && outPorts.length > 0;
  });

  for (const src of sources) {
    const hasOutConn = plan.connections.some(c => c.fromBlockId === src.id);
    if (!hasOutConn) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'UNREACHABLE_SOURCE',
        severity: 'WARNING',
        message: `Source block '${src.id}' outputs are not connected to any downstream block.`,
        entityId: src.id,
      });
    }
  }

  return diagnostics;
};

export const DEFAULT_PREFLIGHT_PLUGINS: PreflightRulePlugin[] = [
  inverterRulePlugin,
  portCompatibilityRulePlugin,
  disconnectedIslandsRulePlugin,
  sourceSinkReachabilityRulePlugin,
];

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
        actual: plan.baseRevision,
      });
    }

    // 2. Base validation via PlanValidator
    const validatorResult = PlanValidator.validateEngineeringModelPlan(plan, catalog as any, {
      expectedRevision: options.currentRevision,
      allowedBridgePairs: options.allowedBridgePairs,
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

    // 4. Execute modular rule plugins
    const plugins = options.plugins || DEFAULT_PREFLIGHT_PLUGINS;
    const pluginContext = { catalog, resolvedBlocks, options };

    for (const plugin of plugins) {
      const pluginDiags = plugin(plan, pluginContext);
      for (const diag of pluginDiags) {
        if (!diagnostics.some(d => d.code === diag.code && d.entityId === diag.entityId && d.portId === diag.portId)) {
          diagnostics.push(diag);
        }
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
      sortedBlockIds: sortedBlockIds.length === blockIds.length ? sortedBlockIds : blockIds,
    };
  }
}
