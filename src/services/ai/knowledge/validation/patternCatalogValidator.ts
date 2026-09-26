import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { validateGeneratedGraph, InternalBlockSpec, InternalConnSpec } from '../../planner/generatedGraphValidator';
import { EngineeringPattern } from '../patternSchemas';

export interface PatternCatalogValidationResult {
  valid: boolean;
  diagnostics: Array<{ code: string; message: string; severity: 'ERROR' | 'WARNING' | 'INFO' }>;
}

export function validatePatternCatalogCompatibility(
  pattern: EngineeringPattern,
  catalog: XbridgesCapabilityIndex,
): PatternCatalogValidationResult {
  if (pattern.evidence.catalogFingerprint !== 'quarantined_unproved' && pattern.evidence.catalogFingerprint !== catalog.catalogFingerprint) {
    return { valid: false, diagnostics: [{ code: 'STALE_CATALOG_FINGERPRINT', severity: 'ERROR', message: 'Pattern was created against a different X-Bridges catalog.' }] };
  }
  const blocks: InternalBlockSpec[] = pattern.topology.blocks.map((block, index) => ({
    id: block.role,
    type: pattern.exactMappings[block.role] || block.blockId,
    params: block.defaultParams || {},
    position: { x: 100 + index * 250, y: 150 },
  }));
  const connections: InternalConnSpec[] = pattern.topology.connections.map(connection => ({
    fromBlockId: connection.sourceBlockRole,
    fromPortId: connection.sourcePort,
    toBlockId: connection.targetBlockRole,
    toPortId: connection.targetPort,
  }));
  const result = validateGeneratedGraph(blocks, connections, catalog);
  return {
    valid: result.valid,
    diagnostics: result.diagnostics.map(diagnostic => ({ code: diagnostic.code, message: diagnostic.message, severity: diagnostic.severity })),
  };
}
