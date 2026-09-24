import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type SysmlRepositoryV4,
  type Block,
} from '../domain';
import {
  createSemanticElement,
  type CreateElementInput,
} from './elementFactory';

describe('elementFactory', () => {
  let repo: SysmlRepositoryV4;

  beforeEach(() => {
    repo = createEmptyRepositoryV4();
    const motorBlock: Block = {
      id: 'block-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
      isAbstract: false,
      isLeaf: false,
      ownedPropertyIds: [],
      ownedPortIds: [],
      ownedOperationIds: [],
      ownedConstraintIds: [],
    };
    addSemanticElementV4(repo, motorBlock);
  });

  const testCaseInput: CreateElementInput = {
    metaclass: 'TestCase',
    name: 'TC_MotorTorque',
    ownerId: 'pkg-root',
  };

  const propertyInput: CreateElementInput = {
    metaclass: 'PartProperty',
    name: 'leftMotor',
    ownerId: 'block-vehicle',
  };

  it('creates TestCase rather than VerificationCase', () => {
    const outcome = createSemanticElement(testCaseInput, repo);
    expect(outcome).toMatchObject({
      ok: true,
      element: {
        metaclass: 'TestCase',
        name: 'TC_MotorTorque',
      },
    });
  });

  it('does not invent a requested property type', () => {
    const outcome = createSemanticElement(
      { ...propertyInput, requestedTypeName: 'MissingType' },
      repo
    );
    expect(outcome).toMatchObject({
      ok: false,
      code: 'TYPE_NOT_FOUND',
    });
    if (!outcome.ok && outcome.code === 'TYPE_NOT_FOUND') {
      expect(outcome.createNewTypeAction).toBeDefined();
      expect(outcome.createNewTypeAction?.suggestedName).toBe('MissingType');
    }
  });

  it('resolves requestedTypeName when type exists in repo', () => {
    const outcome = createSemanticElement(
      { ...propertyInput, requestedTypeName: 'Motor' },
      repo
    );
    expect(outcome).toMatchObject({
      ok: true,
      element: {
        metaclass: 'PartProperty',
        typeId: 'block-motor',
      },
    });
  });

  it('creates generic UML port without implicit SysML stereotype', () => {
    const portOutcome = createSemanticElement(
      { metaclass: 'Port', name: 'p1', ownerId: 'block-motor' },
      repo
    );
    expect(portOutcome).toMatchObject({
      ok: true,
      element: {
        metaclass: 'Port',
        name: 'p1',
      },
    });
  });

  it('does not mutate the repository during element creation', () => {
    const elementCountBefore = Object.keys(repo.elements).length;
    createSemanticElement({ metaclass: 'Block', name: 'NewBlock' }, repo);
    expect(Object.keys(repo.elements).length).toBe(elementCountBefore);
  });
});
