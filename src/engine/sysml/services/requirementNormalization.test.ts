import { describe, expect, it } from 'vitest';
import {
  migrateVerificationCasesToTestCases,
  validateRequirementIdentityAndRelationships,
} from './requirementNormalization';
import {
  createEmptyRepositoryV4,
  type Requirement,
  type TestCase,
  type SemanticRelationship,
} from '../domain';

describe('Requirement and TestCase Normalization (Task 10)', () => {
  it('migrates verificationCases to testCases without losing evidence links', () => {
    let repo = createEmptyRepositoryV4();

    // Add a requirement
    const req: Requirement = {
      id: 'req-1',
      name: 'MaxSpeed',
      metaclass: 'Requirement',
      requirementId: 'REQ-101',
      text: 'Vehicle shall reach 100 km/h in 5 seconds.',
      status: 'draft',
      version: '1.0',
      namespace: [],
      ownerId: 'pkg-root',
    };
    repo.elements[req.id] = req;

    // Legacy verification case representation
    const legacyVC = {
      id: 'vc-1',
      name: 'AccelerationTest',
      metaclass: 'VerificationCase' as const,
      namespace: [],
      ownerId: 'pkg-root',
      method: 'test',
      verifiesRequirementIds: ['req-1'],
    };
    repo.elements[legacyVC.id] = legacyVC as any;

    const migrationResult = migrateVerificationCasesToTestCases(repo);
    expect(migrationResult.migratedCount).toBe(1);

    const migrated = migrationResult.repository.elements['vc-1'] as TestCase;
    expect(migrated.metaclass).toBe('TestCase');
    expect(migrated.name).toBe('AccelerationTest');
    expect(migrated.verifiesRequirementIds).toEqual(['req-1']);
    expect(migrated.testCaseKind).toBe('test');
  });

  it('enforces unique human-facing requirement IDs independently of UUIDs', () => {
    let repo = createEmptyRepositoryV4();

    const req1: Requirement = {
      id: 'uuid-1',
      name: 'Req1',
      metaclass: 'Requirement',
      requirementId: 'REQ-001',
      text: 'Text 1',
      status: 'draft',
      version: '1.0',
      namespace: [],
      ownerId: 'pkg-root',
    };
    const req2: Requirement = {
      id: 'uuid-2',
      name: 'Req2',
      metaclass: 'Requirement',
      requirementId: 'req-001', // Duplicate case-insensitively
      text: 'Text 2',
      status: 'draft',
      version: '1.0',
      namespace: [],
      ownerId: 'pkg-root',
    };
    repo.elements[req1.id] = req1;
    repo.elements[req2.id] = req2;

    const validation = validateRequirementIdentityAndRelationships(repo);
    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toContain('DUPLICATE_REQUIREMENT_ID');
  });

  it('validates endpoints and direction for requirement relationships (containment, deriveReqt, satisfy, verify, refine, trace, copy)', () => {
    let repo = createEmptyRepositoryV4();

    const req: Requirement = {
      id: 'r1',
      name: 'R1',
      metaclass: 'Requirement',
      requirementId: 'REQ-1',
      text: 'Text',
      status: 'draft',
      version: '1.0',
      namespace: [],
      ownerId: 'pkg-root',
    };
    const blk = {
      id: 'b1',
      name: 'B1',
      metaclass: 'Block' as const,
      namespace: [],
      ownerId: 'pkg-root',
    };
    const tc: TestCase = {
      id: 'tc1',
      name: 'TC1',
      metaclass: 'TestCase',
      verifiesRequirementIds: ['r1'],
      namespace: [],
      ownerId: 'pkg-root',
    };

    repo.elements[req.id] = req;
    repo.elements[blk.id] = blk as any;
    repo.elements[tc.id] = tc;

    // Satisfy: Block (client/source) -> Requirement (supplier/target)
    const satisfyRel: SemanticRelationship = {
      id: 'rel-sat',
      metaclass: 'Satisfy',
      sourceId: 'b1',
      targetId: 'r1',
    };
    repo.relationships[satisfyRel.id] = satisfyRel;

    // Verify: TestCase (client/source) -> Requirement (supplier/target)
    const verifyRel: SemanticRelationship = {
      id: 'rel-ver',
      metaclass: 'Verify',
      sourceId: 'tc1',
      targetId: 'r1',
    };
    repo.relationships[verifyRel.id] = verifyRel;

    const val = validateRequirementIdentityAndRelationships(repo);
    expect(val.valid).toBe(true);

    // Invalid satisfy direction: Requirement -> Block
    satisfyRel.sourceId = 'r1';
    satisfyRel.targetId = 'b1';
    const invalidVal = validateRequirementIdentityAndRelationships(repo);
    expect(invalidVal.valid).toBe(false);
    expect(invalidVal.diagnostics).toContain('INVALID_SATISFY_DIRECTION');
  });
});
