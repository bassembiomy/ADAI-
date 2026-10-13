import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { EngineeringPattern } from '../patternSchemas';

export interface PatternNormalizationInput {
  name: string;
  description?: string;
  domain: string;
  source: { url: string; author: string; license: string; licenseApproved?: boolean; ingestedAt: number; originalSourceHash: string };
  requirements?: Partial<EngineeringPattern['requirements']>;
  topology: {
    blocks: Array<{ blockId: string; role: string; defaultParams?: Record<string, unknown> }>;
    connections: Array<{ sourceBlockRole: string; sourcePort: string; targetBlockRole: string; targetPort: string }>;
  };
  exactMappings: Record<string, string>;
  simulationContract?: Partial<EngineeringPattern['simulationContract']>;
}

export function normalizePatternCandidate(
  input: PatternNormalizationInput,
  catalog: XbridgesCapabilityIndex,
): Omit<EngineeringPattern, 'id' | 'contentHash'> {
  if (!input.name.trim() || !input.domain.trim()) throw new Error('PATTERN_METADATA_REQUIRED: name and domain are required.');
  if (input.topology.blocks.length === 0) throw new Error('PATTERN_TOPOLOGY_REQUIRED: at least one block is required.');
  const roles = new Set<string>();
  for (const block of input.topology.blocks) {
    if (roles.has(block.role)) throw new Error(`DUPLICATE_PATTERN_ROLE: '${block.role}'.`);
    roles.add(block.role);
    const type = input.exactMappings[block.role] || block.blockId;
    if (!catalog.blocks.has(type)) throw new Error(`UNKNOWN_PATTERN_BLOCK: '${type}'.`);
    if (block.defaultParams && typeof block.defaultParams !== 'object') throw new Error(`INVALID_PATTERN_PARAMS: '${block.role}'.`);
  }
  for (const connection of input.topology.connections) {
    if (!roles.has(connection.sourceBlockRole) || !roles.has(connection.targetBlockRole)) {
      throw new Error('DANGLING_PATTERN_CONNECTION: connection role is not declared.');
    }
  }
  return {
    version: 1,
    name: input.name.trim(),
    description: input.description?.trim() || 'Quarantined engineering reference.',
    domain: input.domain.trim(),
    provenance: {
      source: input.source.url,
      author: input.source.author,
      license: input.source.license,
      licenseApproved: input.source.licenseApproved === true,
      ingestedAt: input.source.ingestedAt,
      originalSourceHash: input.source.originalSourceHash,
    },
    lifecycle: 'quarantined',
    requirements: {
      targetSystem: input.requirements?.targetSystem || 'xbridges',
      targetBehaviors: input.requirements?.targetBehaviors || [],
      requiredInputs: input.requirements?.requiredInputs || [],
      requiredOutputs: input.requirements?.requiredOutputs || [],
      operatingRanges: input.requirements?.operatingRanges,
    },
    topology: input.topology,
    exactMappings: { ...input.exactMappings },
    simulationContract: {
      minDuration: input.simulationContract?.minDuration || 0.1,
      stepSize: input.simulationContract?.stepSize || 0.001,
      expectedObservables: input.simulationContract?.expectedObservables || [],
      tolerance: input.simulationContract?.tolerance,
    },
    evidence: {
      proofStatus: 'unproved',
      catalogFingerprint: catalog.catalogFingerprint,
      qualityScore: 0,
    },
  };
}
