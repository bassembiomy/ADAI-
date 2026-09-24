import type { SysmlRepositoryV4, Requirement, TestCase, SemanticRelationship } from '../domain';

export interface MigrationResult {
  migratedCount: number;
  repository: SysmlRepositoryV4;
}

export function migrateVerificationCasesToTestCases(repo: SysmlRepositoryV4): MigrationResult {
  const nextElements = { ...repo.elements };
  let migratedCount = 0;

  for (const [id, element] of Object.entries(nextElements)) {
    if ((element as any).metaclass === 'VerificationCase') {
      const legacy = element as any;
      const testCase: TestCase = {
        id: legacy.id,
        name: legacy.name,
        metaclass: 'TestCase',
        namespace: legacy.namespace || [],
        ownerId: legacy.ownerId ?? null,
        verifiesRequirementIds: legacy.verifiesRequirementIds || [],
        testCaseKind: legacy.method === 'inspection' ? 'inspection' : legacy.method === 'analysis' ? 'analysis' : 'test',
        status: 'ready',
      };
      nextElements[id] = testCase;
      migratedCount++;
    }
  }

  // Update indexes
  const byType = { ...repo.indexes.byType };
  if (migratedCount > 0) {
    byType['TestCase'] = Object.values(nextElements)
      .filter((e) => e.metaclass === 'TestCase')
      .map((e) => e.id);
    delete byType['VerificationCase'];
  }

  return {
    migratedCount,
    repository: {
      ...repo,
      elements: nextElements,
      indexes: {
        ...repo.indexes,
        byType,
      },
    },
  };
}

export interface RequirementValidationResult {
  valid: boolean;
  diagnostics: string[];
}

export function validateRequirementIdentityAndRelationships(repo: SysmlRepositoryV4): RequirementValidationResult {
  const diagnostics: string[] = [];
  const reqIdSet = new Set<string>();

  // Check unique requirementIds
  for (const element of Object.values(repo.elements)) {
    if (element.metaclass === 'Requirement') {
      const req = element as Requirement;
      const normalizedReqId = req.requirementId?.trim().toLocaleUpperCase();
      if (!normalizedReqId) {
        diagnostics.push('EMPTY_REQUIREMENT_ID');
      } else if (reqIdSet.has(normalizedReqId)) {
        diagnostics.push('DUPLICATE_REQUIREMENT_ID');
      } else {
        reqIdSet.add(normalizedReqId);
      }
    }
  }

  // Check relationship endpoints and directions
  for (const rel of Object.values(repo.relationships)) {
    const src = repo.elements[rel.sourceId];
    const tgt = repo.elements[rel.targetId];

    if (!src || !tgt) continue;

    switch (rel.metaclass) {
      case 'Satisfy': {
        // Satisfier (Block/part/etc.) -> Requirement
        if (tgt.metaclass !== 'Requirement' || src.metaclass === 'Requirement') {
          diagnostics.push('INVALID_SATISFY_DIRECTION');
        }
        break;
      }
      case 'Verify': {
        // Verifier (TestCase) -> Requirement
        if (tgt.metaclass !== 'Requirement' || (src.metaclass !== 'TestCase' && (src as any).metaclass !== 'VerificationCase')) {
          diagnostics.push('INVALID_VERIFY_DIRECTION');
        }
        break;
      }
      case 'DeriveReqt':
      case 'Containment':
      case 'Copy': {
        // Requirement -> Requirement
        if (src.metaclass !== 'Requirement' || tgt.metaclass !== 'Requirement') {
          diagnostics.push('REQUIREMENT_RELATIONSHIP_ENDPOINTS_MUST_BE_REQUIREMENTS');
        }
        break;
      }
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
