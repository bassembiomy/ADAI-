import type { SysmlRelationship, SysmlRepository } from './model';
import type { RequirementRelationshipKind } from './relationshipDefinitions';

export interface MigrationDiagnostic {
  relationshipId: string;
  code:
    | 'LEGACY_REQUIREMENT_COMPOSITION_MIGRATED'
    | 'LEGACY_REQUIREMENT_DERIVE_MIGRATED'
    | 'LEGACY_REQUIREMENT_TRACEABILITY_MIGRATED'
    | 'LEGACY_SATISFY_DIRECTION_REVERSED'
    | 'LEGACY_VERIFY_DIRECTION_REVERSED'
    | 'LEGACY_REFINE_DIRECTION_REVERSED';
  message: string;
}

export interface MigrationResult {
  migratedRelationships: Record<string, SysmlRelationship>;
  diagnostics: MigrationDiagnostic[];
  migratedCount: number;
}

export function migrateLegacyRelationship(
  rel: SysmlRelationship,
  repo: SysmlRepository,
): { relationship: SysmlRelationship; diagnostic?: MigrationDiagnostic } {
  const sourceIsReq = Boolean(repo.requirements[rel.sourceId]);
  const targetIsReq = Boolean(repo.requirements[rel.targetId]);
  const sourceIsBlockOrPart = Boolean(repo.definitions[rel.sourceId] || repo.usages[rel.sourceId]);
  const targetIsBlockOrPart = Boolean(repo.definitions[rel.targetId] || repo.usages[rel.targetId]);
  const sourceIsVerification = Boolean(repo.verificationCases[rel.sourceId]);
  const targetIsVerification = Boolean(repo.verificationCases[rel.targetId]);

  const rawKind = (rel.kind || (rel as any).type || '').toLowerCase();

  // 1. composition between requirements -> requirementContainment
  if ((rawKind === 'composition' || rawKind === 'containment') && sourceIsReq && targetIsReq) {
    return {
      relationship: { ...rel, kind: 'requirementContainment' },
      diagnostic: {
        relationshipId: rel.id,
        code: 'LEGACY_REQUIREMENT_COMPOSITION_MIGRATED',
        message: `Migrated legacy composition relationship "${rel.id}" between requirements to requirementContainment.`,
      },
    };
  }

  // 2. derive between requirements -> deriveReqt
  if ((rawKind === 'derive' || rawKind === 'derivation') && sourceIsReq && targetIsReq) {
    return {
      relationship: { ...rel, kind: 'deriveReqt' },
      diagnostic: {
        relationshipId: rel.id,
        code: 'LEGACY_REQUIREMENT_DERIVE_MIGRATED',
        message: `Migrated legacy derive relationship "${rel.id}" between requirements to deriveReqt.`,
      },
    };
  }

  // 3. traceability -> trace
  if (rawKind === 'traceability') {
    return {
      relationship: { ...rel, kind: 'trace' },
      diagnostic: {
        relationshipId: rel.id,
        code: 'LEGACY_REQUIREMENT_TRACEABILITY_MIGRATED',
        message: `Migrated legacy traceability relationship "${rel.id}" to trace.`,
      },
    };
  }

  // 4. satisfy: reversed if requirement -> block/part
  if (rawKind === 'satisfy' && sourceIsReq && targetIsBlockOrPart) {
    return {
      relationship: { ...rel, kind: 'satisfy', sourceId: rel.targetId, targetId: rel.sourceId },
      diagnostic: {
        relationshipId: rel.id,
        code: 'LEGACY_SATISFY_DIRECTION_REVERSED',
        message: `Reversed legacy satisfy relationship "${rel.id}" so design element is source and requirement is target.`,
      },
    };
  }

  // 5. verify: reversed if requirement -> verificationCase
  if (rawKind === 'verify' && sourceIsReq && targetIsVerification) {
    return {
      relationship: { ...rel, kind: 'verify', sourceId: rel.targetId, targetId: rel.sourceId },
      diagnostic: {
        relationshipId: rel.id,
        code: 'LEGACY_VERIFY_DIRECTION_REVERSED',
        message: `Reversed legacy verify relationship "${rel.id}" so verification case is source and requirement is target.`,
      },
    };
  }

  // 6. refine: reversed if requirement -> block/part
  if (rawKind === 'refine' && sourceIsReq && targetIsBlockOrPart) {
    return {
      relationship: { ...rel, kind: 'refine', sourceId: rel.targetId, targetId: rel.sourceId },
      diagnostic: {
        relationshipId: rel.id,
        code: 'LEGACY_REFINE_DIRECTION_REVERSED',
        message: `Reversed legacy refine relationship "${rel.id}" so refining element is source and requirement is target.`,
      },
    };
  }

  return { relationship: rel };
}

export function migrateProjectRelationships(repo: SysmlRepository): MigrationResult {
  const migratedRelationships: Record<string, SysmlRelationship> = {};
  const diagnostics: MigrationDiagnostic[] = [];
  let migratedCount = 0;

  for (const [id, rel] of Object.entries(repo.relationships)) {
    const result = migrateLegacyRelationship(rel, repo);
    migratedRelationships[id] = result.relationship;
    if (result.diagnostic) {
      diagnostics.push(result.diagnostic);
      migratedCount++;
    }
  }

  return {
    migratedRelationships,
    diagnostics,
    migratedCount,
  };
}
