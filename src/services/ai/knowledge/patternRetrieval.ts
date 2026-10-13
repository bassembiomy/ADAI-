import { EngineeringPattern } from './patternSchemas';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

export interface PatternRetrievalQuery {
  intent?: string;
  targetSystem?: string;
  targetBehaviors?: string[];
  requiredInputs?: string[];
  requiredOutputs?: string[];
  domain?: string;
  allowedLifecycles?: Array<EngineeringPattern['lifecycle']>;
}

export interface RankedPatternMatch {
  pattern: EngineeringPattern;
  requirementsScore: number;
  matchedBehaviors: string[];
  matchedInputs: string[];
  matchedOutputs: string[];
  qualityScore: number;
}

function findBlockCapability(
  blockId: string,
  capabilities: XbridgesCapabilityIndex
) {
  const direct = capabilities.blocks.get(blockId);
  if (direct) return direct;
  const canonical = capabilities.aliases.get(blockId.trim().toLowerCase());
  if (canonical) return capabilities.blocks.get(canonical);
  return undefined;
}

/**
 * Checks if a pattern is completely compatible with active X-Bridges block capabilities.
 * Returns false if any block ID or port ID is not in the active catalog.
 */
export function isPatternCatalogCompatible(
  pattern: EngineeringPattern,
  capabilities: XbridgesCapabilityIndex
): boolean {
  const roleToBlockCap = new Map<string, ReturnType<typeof findBlockCapability>>();

  // Verify all blocks exist
  for (const block of pattern.topology.blocks) {
    const catalogBlock = findBlockCapability(block.blockId, capabilities);
    if (!catalogBlock) {
      return false;
    }
    roleToBlockCap.set(block.role, catalogBlock);
  }

  // Also check exactMappings if specified
  for (const [_role, blockId] of Object.entries(pattern.exactMappings)) {
    if (!findBlockCapability(blockId, capabilities)) {
      return false;
    }
  }

  // Verify all connections connect existing ports on existing blocks
  for (const conn of pattern.topology.connections) {
    const sourceCap = roleToBlockCap.get(conn.sourceBlockRole);
    const targetCap = roleToBlockCap.get(conn.targetBlockRole);

    if (!sourceCap || !targetCap) {
      return false;
    }

    const sourceHasPort = sourceCap.ports.some(p => p.id === conn.sourcePort || p.id.toLowerCase() === conn.sourcePort.toLowerCase());
    const targetHasPort = targetCap.ports.some(p => p.id === conn.targetPort || p.id.toLowerCase() === conn.targetPort.toLowerCase());

    if (!sourceHasPort || !targetHasPort) {
      return false;
    }
  }

  return true;
}

/**
 * Deterministically retrieves and ranks patterns compatible with the active catalog.
 * Strict ordering:
 * 1. Lifecycle filter (default: reviewed, verified)
 * 2. Exact catalog capability compatibility
 * 3. Requirements match score (descending)
 * 4. Evidence quality score (descending)
 * 5. Stable pattern ID (ascending)
 */
export function retrieveCompatiblePatterns(
  query: PatternRetrievalQuery,
  patterns: readonly EngineeringPattern[],
  capabilities: XbridgesCapabilityIndex
): RankedPatternMatch[] {
  const allowedLifecycles = query.allowedLifecycles || ['reviewed', 'verified'];

  const matched: RankedPatternMatch[] = [];

  for (const pattern of patterns) {
    // 1. Lifecycle filter
    if (!allowedLifecycles.includes(pattern.lifecycle)) {
      continue;
    }

    if (!pattern.provenance.licenseApproved || pattern.evidence.proofStatus !== 'proved') {
      continue;
    }

    if (pattern.evidence.catalogFingerprint !== capabilities.catalogFingerprint) {
      continue;
    }

    // Domain filter if specified
    if (query.domain && pattern.domain !== 'general' && pattern.domain !== query.domain) {
      continue;
    }

    // 2. Exact capability compatibility
    if (!isPatternCatalogCompatible(pattern, capabilities)) {
      continue;
    }

    // 3. Match requirements
    const targetBehaviors = query.targetBehaviors || [];
    const requiredInputs = query.requiredInputs || [];
    const requiredOutputs = query.requiredOutputs || [];

    const matchedBehaviors = targetBehaviors.filter(b =>
      pattern.requirements.targetBehaviors.includes(b)
    );
    const matchedInputs = requiredInputs.filter(i =>
      pattern.requirements.requiredInputs.includes(i)
    );
    const matchedOutputs = requiredOutputs.filter(o =>
      pattern.requirements.requiredOutputs.includes(o)
    );

    let requirementsScore =
      matchedBehaviors.length + matchedInputs.length + matchedOutputs.length;

    if (
      query.targetSystem &&
      pattern.requirements.targetSystem.toLowerCase() === query.targetSystem.toLowerCase()
    ) {
      requirementsScore += 10;
    }

    matched.push({
      pattern,
      requirementsScore,
      matchedBehaviors,
      matchedInputs,
      matchedOutputs,
      qualityScore: pattern.evidence.qualityScore
    });
  }

  // Deterministic sorting: requirementsScore desc -> qualityScore desc -> ID asc
  return matched.sort((a, b) => {
    if (b.requirementsScore !== a.requirementsScore) {
      return b.requirementsScore - a.requirementsScore;
    }
    if (b.qualityScore !== a.qualityScore) {
      return b.qualityScore - a.qualityScore;
    }
    return a.pattern.id.localeCompare(b.pattern.id);
  });
}
