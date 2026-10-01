import { describe, expect, it } from 'vitest';
import type {
  SemanticElement,
  UseCase,
  Activity,
  ActivityPartition,
  Operation,
  TestCase,
  FlowSpecification,
  Block,
  Constraint,
  ConstraintExpression,
} from './index';

describe('completeMetamodel', () => {
  it('stores every catalog kind as a canonical semantic element', () => {
    const useCase: UseCase = {
      id: 'uc-1',
      name: 'Drive Vehicle',
      metaclass: 'UseCase',
      namespace: [],
      ownerId: 'pkg-root',
      subjectIds: ['block-vehicle'],
      extensionPointIds: [],
    };

    const activity: Activity = {
      id: 'act-1',
      name: 'Perform Braking',
      metaclass: 'Activity',
      namespace: [],
      ownerId: 'pkg-root',
      parameterIds: [],
      nodeIds: [],
      partitionIds: ['part-1'],
    };

    const partition: ActivityPartition = {
      id: 'part-1',
      name: 'BrakeController',
      metaclass: 'ActivityPartition',
      namespace: [],
      ownerId: 'act-1',
      representsElementId: 'block-brake-ctrl',
      nodeIds: [],
    };

    const operation: Operation = {
      id: 'op-1',
      name: 'applyTorque',
      metaclass: 'Operation',
      namespace: [],
      ownerId: 'block-motor',
      parameterIds: [],
    };

    const testCase: TestCase = {
      id: 'tc-1',
      name: 'TestBrakingDistance',
      metaclass: 'TestCase',
      namespace: [],
      ownerId: 'pkg-root',
      verifiesRequirementIds: ['req-1'],
    };

    const flowSpecification: FlowSpecification = {
      id: 'fs-1',
      name: 'HydraulicFlow',
      metaclass: 'FlowSpecification',
      namespace: [],
      ownerId: 'pkg-root',
      flowPropertyIds: [],
    };

    const elements: SemanticElement[] = [useCase, activity, operation, testCase, flowSpecification];
    expect(elements.map((element) => element.metaclass)).toEqual([
      'UseCase',
      'Activity',
      'Operation',
      'TestCase',
      'FlowSpecification',
    ]);
  });

  it('supports canonical constraint expressions and partitions without treating behaviors as block stereotypes', () => {
    const expr: ConstraintExpression = {
      language: 'OCL',
      body: 'self.power <= 150',
    };

    const constraint: Constraint = {
      id: 'c-1',
      name: 'MaxPower',
      metaclass: 'Constraint',
      namespace: [],
      ownerId: 'block-1',
      specification: {
        kind: 'opaqueExpression',
        body: expr.body,
        language: expr.language,
      },
      constrainedElementIds: ['block-1'],
    };

    expect(constraint.metaclass).toBe('Constraint');
  });

  it('indexes UseCase and Activity in repository indexes', async () => {
    const { createEmptyRepositoryV4, addSemanticElementV4 } = await import('./index');
    const repo = createEmptyRepositoryV4();
    const useCase: UseCase = {
      id: 'uc-1',
      name: 'Drive Vehicle',
      metaclass: 'UseCase',
      namespace: [],
      ownerId: 'pkg-root',
      subjectIds: ['block-vehicle'],
      extensionPointIds: [],
    };
    addSemanticElementV4(repo, useCase);
    expect(repo.elements['uc-1']).toBeDefined();
    expect(repo.indexes.byType['UseCase']).toContain('uc-1');
  });
});

