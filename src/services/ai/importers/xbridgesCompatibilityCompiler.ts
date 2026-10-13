import { ExternalModel } from './externalModel';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { EngineeringPattern, computePatternContentHash } from '../knowledge/patternSchemas';
import { StructuredDiagnostic } from '../contracts/engineeringModel';

export interface CompatibilityResult {
  status: 'compatible' | 'incompatible';
  pattern?: EngineeringPattern;
  diagnostics: StructuredDiagnostic[];
}

interface BlockMapping {
  xbridgesBlockId: string;
  portMap: Record<string, string>; // externalPortId -> xbridgesPortId
  paramMap?: Record<string, string>; // externalParamName -> xbridgesParamName
}

// Explicit mapping table from standard external block types to canonical X-Bridges catalog block IDs
const EXTERNAL_TYPE_MAPPINGS: Record<string, BlockMapping> = {
  // Simulink types
  'Step': {
    xbridgesBlockId: 'Step',
    portMap: { 'out': 'out', 'out1': 'out', 'out_1': 'out' }
  },
  'Gain': {
    xbridgesBlockId: 'GAIN',
    portMap: { 'u': 'u', 'in': 'u', 'in1': 'u', 'in_1': 'u', 'y': 'y', 'out': 'y', 'out1': 'y', 'out_1': 'y' }
  },
  'Sum': {
    xbridgesBlockId: 'Sum',
    portMap: { 'in1': 'in1', 'in_1': 'in1', 'in2': 'in2', 'in_2': 'in2', 'out': 'out', 'out1': 'out', 'out_1': 'out' }
  },
  'PIDController': {
    xbridgesBlockId: 'PID_CONTROLLER',
    portMap: {
      'r': 'r',
      'in': 'r',
      'in1': 'r',
      'in_1': 'r',
      'y': 'y',
      'u': 'u',
      'out': 'u',
      'out1': 'u',
      'out_1': 'u'
    }
  },
  'LowPassFilter': {
    xbridgesBlockId: 'LOW_PASS_FILTER',
    portMap: { 'u': 'u', 'in': 'u', 'in1': 'u', 'in_1': 'u', 'y': 'y', 'out': 'y', 'out1': 'y', 'out_1': 'y' }
  },
  'DCVoltageSource': {
    xbridgesBlockId: 'DC_VOLTAGE_SOURCE',
    portMap: { 'v_pos': 'v_pos', 'v_neg': 'v_neg', 'p': 'v_pos', 'n': 'v_neg', 'out': 'v_pos' }
  },
  'TransferFcn': {
    xbridgesBlockId: 'TRANSFER_FUNCTION',
    portMap: { 'u': 'u', 'in': 'u', 'in1': 'u', 'in_1': 'u', 'y': 'y', 'out': 'y', 'out1': 'y', 'out_1': 'y' }
  },

  // Scilab / Xcos interface functions
  'STEP_FUNCTION': {
    xbridgesBlockId: 'Step',
    portMap: { 'p_out': 'out', 'out': 'out' }
  },
  'GAINBLK': {
    xbridgesBlockId: 'GAIN',
    portMap: { 'p_in': 'u', 'in': 'u', 'p_out': 'y', 'p_gain_out': 'y', 'out': 'y' }
  },
  'PID': {
    xbridgesBlockId: 'PID_CONTROLLER',
    portMap: { 'p_in': 'r', 'in': 'r', 'p_out': 'u', 'out': 'u' }
  },
  'CLR': {
    xbridgesBlockId: 'TRANSFER_FUNCTION',
    portMap: { 'p_in': 'u', 'in': 'u', 'p_out': 'y', 'out': 'y' }
  }
};

export function compileExternalPattern(
  external: ExternalModel,
  catalog: XbridgesCapabilityIndex
): CompatibilityResult {
  const diagnostics: StructuredDiagnostic[] = [];

  // 1. Check unsupported constructs
  if (external.unsupportedConstructs && external.unsupportedConstructs.length > 0) {
    for (const construct of external.unsupportedConstructs) {
      diagnostics.push({
        category: 'COMPILE',
        severity: 'ERROR',
        code: 'UNSUPPORTED_CONSTRUCT',
        message: `External model contains unsupported construct: ${construct}`,
        remediation: construct
      });
    }
  }

  // 2. Map components
  const roleByComponentId = new Map<string, string>();
  const mappingByComponentId = new Map<string, BlockMapping>();
  const exactMappings: Record<string, string> = {};
  const topologyBlocks: Array<{ blockId: string; role: string; defaultParams?: Record<string, unknown> }> = [];

  for (const comp of external.components) {
    const mapping = EXTERNAL_TYPE_MAPPINGS[comp.externalType];
    if (!mapping) {
      diagnostics.push({
        category: 'COMPILE',
        severity: 'ERROR',
        code: 'UNMAPPED_EXTERNAL_COMPONENT',
        message: `External component type '${comp.externalType}' has no explicit mapping to active X-Bridges catalog`,
        entityId: comp.id,
        remediation: `Component '${comp.name}' (${comp.externalType}) at ${comp.sourceLocation || comp.name}. No heuristic mapping allowed.`
      });
      continue;
    }

    // Verify target block exists in active catalog
    const capability = catalog.blocks.get(mapping.xbridgesBlockId);
    if (!capability) {
      diagnostics.push({
        category: 'COMPILE',
        severity: 'ERROR',
        code: 'UNSUPPORTED_BLOCK_IN_CATALOG',
        message: `Mapped block '${mapping.xbridgesBlockId}' is not registered in active X-Bridges catalog`,
        entityId: comp.id
      });
      continue;
    }

    // Verify component ports are recognized in port mapping and catalog
    const validPortIds = new Set(capability.ports.map(p => p.id));
    for (const port of comp.ports) {
      const mappedPort = mapping.portMap[port.id];
      if (!mappedPort || !validPortIds.has(mappedPort)) {
        diagnostics.push({
          category: 'COMPILE',
          severity: 'ERROR',
          code: 'UNMAPPED_EXTERNAL_PORT',
          message: `External port '${port.id}' on component '${comp.name}' cannot be mapped to block '${mapping.xbridgesBlockId}'`,
          entityId: comp.id,
          remediation: `Valid ports for ${mapping.xbridgesBlockId}: ${[...validPortIds].join(', ')}`
        });
      }
    }

    const role = comp.name.replace(/[^a-zA-Z0-9_]/g, '_');
    roleByComponentId.set(comp.id, role);
    mappingByComponentId.set(comp.id, mapping);
    exactMappings[role] = mapping.xbridgesBlockId;

    topologyBlocks.push({
      blockId: mapping.xbridgesBlockId,
      role,
      defaultParams: Object.keys(comp.parameters).length > 0 ? comp.parameters : undefined
    });
  }

  // 3. Map links
  const topologyConnections: Array<{
    sourceBlockRole: string;
    sourcePort: string;
    targetBlockRole: string;
    targetPort: string;
  }> = [];

  for (const link of external.links) {
    const srcRole = roleByComponentId.get(link.sourceComponentId);
    const dstRole = roleByComponentId.get(link.targetComponentId);
    const srcMapping = mappingByComponentId.get(link.sourceComponentId);
    const dstMapping = mappingByComponentId.get(link.targetComponentId);

    if (!srcRole || !dstRole || !srcMapping || !dstMapping) {
      diagnostics.push({
        category: 'COMPILE',
        severity: 'ERROR',
        code: 'INVALID_LINK_ENDPOINT',
        message: `Link '${link.id}' references unmapped component endpoints`,
        entityId: link.id
      });
      continue;
    }

    const mappedSrcPort = srcMapping.portMap[link.sourcePortId] || link.sourcePortId;
    const mappedDstPort = dstMapping.portMap[link.targetPortId] || link.targetPortId;

    topologyConnections.push({
      sourceBlockRole: srcRole,
      sourcePort: mappedSrcPort,
      targetBlockRole: dstRole,
      targetPort: mappedDstPort
    });
  }

  if (diagnostics.some(d => d.severity === 'ERROR')) {
    return {
      status: 'incompatible',
      diagnostics
    };
  }

  const rawPattern = {
    version: 1,
    name: external.name,
    description: `Quarantined imported pattern from ${external.sourceFormat} model (${external.provenance.source})`,
    domain: 'xbridges',
    lifecycle: 'quarantined' as const,
    provenance: {
      source: external.provenance.source,
      author: external.provenance.author,
      license: external.provenance.license,
      licenseApproved: false, // Quarantined until operator reviews license & promotion
      ingestedAt: Date.now(),
      originalSourceHash: external.provenance.checksum
    },
    requirements: {
      targetSystem: external.name,
      targetBehaviors: ['imported_simulation'],
      requiredInputs: [],
      requiredOutputs: []
    },
    topology: {
      blocks: topologyBlocks,
      connections: topologyConnections
    },
    exactMappings,
    simulationContract: {
      minDuration: 1.0,
      stepSize: 0.001,
      expectedObservables: []
    },
    evidence: {
      proofStatus: 'unproved' as const,
      catalogFingerprint: catalog.catalogFingerprint,
      qualityScore: 0.5,
      measuredAt: Date.now()
    }
  };

  const contentHash = computePatternContentHash(rawPattern);
  const baseId = `pattern_imported_${external.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  const pattern: EngineeringPattern = {
    ...rawPattern,
    id: `${baseId}_${contentHash}`,
    contentHash
  };

  return {
    status: 'compatible',
    pattern,
    diagnostics
  };
}
