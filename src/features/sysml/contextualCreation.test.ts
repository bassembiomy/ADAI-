import { describe, expect, it } from 'vitest';
import type { SysmlRepositoryV4 } from '../../engine/sysml/domain';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { planContextualCreation } from './contextualCreation';
import { executeSysmlCommand, createSysmlGatewayState } from '../../services/sysmlCommandGateway';
import { createEmptyRepository } from '../../engine/sysml/model';

describe('planContextualCreation', () => {
  const repository: SysmlRepositoryV4 = {
    ...createEmptyRepositoryV4(),
    elements: {
      'pkg-1': {
        id: 'pkg-1',
        name: 'Package1',
        metaclass: 'Package',
        namespace: [],
        ownerId: 'pkg-root',
      },
      controller: {
        id: 'controller',
        name: 'Controller',
        metaclass: 'Block',
        namespace: [],
        ownerId: 'pkg-1',
      },
      'control-if': {
        id: 'control-if',
        name: 'ControlIF',
        metaclass: 'InterfaceBlock',
        namespace: [],
        ownerId: 'pkg-1',
      },
    },
    diagrams: {},
  };

  it.each(['tree', 'canvas', 'propertyPanel'] as const)(
    'creates a proxy port under the resolved block from %s',
    (source) => {
      const plan = planContextualCreation({
        repository,
        source,
        selectedId: 'controller',
        intent: { metaclass: 'Port', portKind: 'proxyPort', typeId: 'control-if' },
      });
      expect(plan).toMatchObject({
        kind: 'command',
        command: {
          type: 'createOwnedPort',
          ownerBlockId: 'controller',
          portKind: 'proxyPort',
          typeId: 'control-if',
        },
      });
    }
  );

  it('does not request a parent when the property panel is bound to a block', () => {
    expect(
      planContextualCreation({
        repository,
        source: 'propertyPanel',
        selectedId: 'controller',
        intent: { metaclass: 'Port', portKind: 'standardPort' },
      }).kind
    ).not.toBe('parentSelection');
  });

  it('returns disabled when no legal owner is selected', () => {
    const plan = planContextualCreation({
      repository,
      source: 'canvas',
      intent: { metaclass: 'Port', portKind: 'standardPort' },
    });
    expect(plan).toEqual({
      kind: 'disabled',
      code: 'LEGAL_OWNER_REQUIRED',
      reason: 'Select a Block to add a Port.',
    });
  });

  it('requests type selection for typed port when typeId is missing', () => {
    const plan = planContextualCreation({
      repository,
      source: 'propertyPanel',
      selectedId: 'controller',
      intent: { metaclass: 'Port', portKind: 'proxyPort' },
    });
    expect(plan.kind).toBe('typeSelection');
  });

  it('creates valid Block, Package, Requirement, and ValueType accepted by executeSysmlCommand', () => {
    const initialRepo = createEmptyRepository();
    initialRepo.packages['pkg-1'] = { id: 'pkg-1', name: 'Package1', kind: 'package', namespace: [], ownerId: 'model' };
    let gatewayState = createSysmlGatewayState(initialRepo);

    // 1. Create Package
    const pkgPlan = planContextualCreation({
      repository,
      source: 'tree',
      selectedId: 'pkg-1',
      intent: { metaclass: 'Package', name: 'Subsystem' },
    });
    expect(pkgPlan.kind).toBe('command');
    if (pkgPlan.kind === 'command') {
      const res = executeSysmlCommand(gatewayState, pkgPlan.command);
      expect(res.committed).toBe(true);
      const createdPkg = Object.values(res.repository.packages).find(p => p.name === 'Subsystem');
      expect(createdPkg).toBeDefined();
      expect(createdPkg?.ownerId).toBe('pkg-1');
      gatewayState = { ...gatewayState, ...res };
    }

    // 2. Create Block
    const blkPlan = planContextualCreation({
      repository,
      source: 'tree',
      selectedId: 'pkg-1',
      intent: { metaclass: 'Block', name: 'Engine' },
    });
    expect(blkPlan.kind).toBe('command');
    if (blkPlan.kind === 'command') {
      const res = executeSysmlCommand(gatewayState, blkPlan.command);
      expect(res.committed).toBe(true);
      const createdBlk = Object.values(res.repository.definitions).find(b => b.name === 'Engine');
      expect(createdBlk).toBeDefined();
      expect(createdBlk?.kind).toBe('block');
      expect(createdBlk?.ownerId).toBe('pkg-1');
      gatewayState = { ...gatewayState, ...res };
    }

    // 3. Create Requirement
    const reqPlan = planContextualCreation({
      repository,
      source: 'tree',
      selectedId: 'pkg-1',
      intent: { metaclass: 'Requirement', name: 'SafetyReq' },
    });
    expect(reqPlan.kind).toBe('command');
    if (reqPlan.kind === 'command') {
      const res = executeSysmlCommand(gatewayState, reqPlan.command);
      expect(res.committed).toBe(true);
      const createdReq = Object.values(res.repository.requirements).find(r => r.name === 'SafetyReq');
      expect(createdReq).toBeDefined();
      expect(createdReq?.kind).toBe('requirement');
    }
  });

  it('routes Operation and Constraint creation as Block feature updates', () => {
    const canonicalRepo = createEmptyRepository();
    canonicalRepo.definitions['controller'] = {
      id: 'controller',
      kind: 'block',
      name: 'Controller',
      namespace: [],
      ownerId: 'pkg-1',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: ['existingOp'],
      constraints: [],
    };
    let gatewayState = createSysmlGatewayState(canonicalRepo);

    // Operation
    const opPlan = planContextualCreation({
      repository: canonicalRepo as any,
      source: 'propertyPanel',
      selectedId: 'controller',
      intent: { metaclass: 'Operation', name: 'executeDiagnostics' },
    });
    expect(opPlan.kind).toBe('command');
    if (opPlan.kind === 'command') {
      const res = executeSysmlCommand(gatewayState, opPlan.command);
      expect(res.committed).toBe(true);
      const blk = res.repository.definitions['controller'] as any;
      expect(blk.operations).toEqual(['existingOp', 'executeDiagnostics']);
    }

    // Constraint
    const constraintPlan = planContextualCreation({
      repository,
      source: 'propertyPanel',
      selectedId: 'controller',
      intent: { metaclass: 'Constraint', name: 'power <= 100W' },
    });
    expect(constraintPlan.kind).toBe('command');
    if (constraintPlan.kind === 'command') {
      const res = executeSysmlCommand(gatewayState, constraintPlan.command);
      expect(res.committed).toBe(true);
      const blk = res.repository.definitions['controller'] as any;
      expect(blk.constraints).toEqual(['power <= 100W']);
    }
  });

  it('rejects Activity instead of storing a malformed generic definition', () => {
    const plan = planContextualCreation({
      repository,
      source: 'tree',
      selectedId: 'pkg-1',
      intent: { metaclass: 'Activity' },
    });

    expect(plan).toEqual({
      kind: 'disabled',
      code: 'UNSUPPORTED_CONTEXTUAL_METACLASS',
      reason: 'Activity creation is not yet available through the canonical editor gateway.',
    });
  });
});
