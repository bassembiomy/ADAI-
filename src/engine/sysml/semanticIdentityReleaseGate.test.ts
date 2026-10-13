import { describe, expect, it } from 'vitest';
import {
  createEmptyRepositoryV4,
  type Block,
  type PartProperty,
  type Requirement,
  type SemanticRelationship,
  type Diagram,
} from './domain';
import { createTransactionManager, type TransactionManager } from './commands/dispatcher';
import { projectBddDiagram, projectIbdDiagram, projectRequirementsDiagram } from './projection/canonicalProjections';
import { serializeRepositoryV4, deserializeRepositoryV4 } from './persistence/migrateV3ToV4';

describe('Mandatory Semantic Identity Release Gate (Task 15)', () => {
  it('strictly preserves semantic identity across diagrams, projections, renaming, and round-trip persistence', () => {
    let repo = createEmptyRepositoryV4();
    const mgr: TransactionManager = createTransactionManager(repo);
    const ctx = { source: 'ui' as const, actor: 'release-gate' };

    // 1. Create Motor and Vehicle Blocks
    const motorBlock: Block = {
      id: 'blk-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    const vehicleBlock: Block = {
      id: 'blk-vehicle',
      name: 'Vehicle',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    mgr.dispatch({ type: 'CreateElement', element: motorBlock }, ctx);
    mgr.dispatch({ type: 'CreateElement', element: vehicleBlock }, ctx);

    // 2. Create Diagrams: BDD-A, BDD-B, Vehicle IBD, and Requirement Diagram
    const bddA: Diagram = {
      id: 'diag-bdd-a',
      name: 'BDD-A',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const bddB: Diagram = {
      id: 'diag-bdd-b',
      name: 'BDD-B',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const ibdVehicle: Diagram = {
      id: 'diag-ibd-v',
      name: 'Vehicle IBD',
      metaclass: 'Diagram',
      diagramKind: 'ibd',
      contextElementId: 'blk-vehicle',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const reqDiag: Diagram = {
      id: 'diag-req',
      name: 'Requirement Diagram',
      metaclass: 'Diagram',
      diagramKind: 'requirements',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    mgr.dispatch({ type: 'CreateElement', element: bddA }, ctx);
    mgr.dispatch({ type: 'CreateElement', element: bddB }, ctx);
    mgr.dispatch({ type: 'CreateElement', element: ibdVehicle }, ctx);
    mgr.dispatch({ type: 'CreateElement', element: reqDiag }, ctx);

    // 3. Display the exact same Motor ID on both BDDs (2 presentations, 1 definition)
    mgr.dispatch(
      {
        type: 'DisplayExistingElement',
        presentation: {
          id: 'pres-motor-bdd-a',
          diagramId: 'diag-bdd-a',
          semanticElementId: 'blk-motor',
          bounds: { x: 50, y: 50, width: 160, height: 100 },
        },
      },
      ctx
    );
    mgr.dispatch(
      {
        type: 'DisplayExistingElement',
        presentation: {
          id: 'pres-motor-bdd-b',
          diagramId: 'diag-bdd-b',
          semanticElementId: 'blk-motor',
          bounds: { x: 80, y: 80, width: 160, height: 100 },
        },
      },
      ctx
    );

    // 4. Create one leftMotor : Motor PartProperty owned by Vehicle and display on Vehicle IBD
    const leftMotorProp: PartProperty = {
      id: 'prop-left-motor',
      name: 'leftMotor',
      metaclass: 'PartProperty',
      namespace: [],
      ownerId: 'blk-vehicle',
      typeId: 'blk-motor',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      aggregation: 'composite',
    };
    mgr.dispatch({ type: 'CreateElement', element: leftMotorProp }, ctx);
    mgr.dispatch(
      {
        type: 'DisplayExistingElement',
        presentation: {
          id: 'pres-leftmotor-ibd',
          diagramId: 'diag-ibd-v',
          semanticElementId: 'prop-left-motor',
          bounds: { x: 40, y: 60, width: 200, height: 120 },
        },
      },
      ctx
    );

    // 5. Create one Requirement with requirement ID REQ-001
    const req: Requirement = {
      id: 'req-001-uuid',
      name: 'MaxTorqueReq',
      metaclass: 'Requirement',
      requirementId: 'REQ-001',
      text: 'Motor shall supply 400 Nm peak torque.',
      status: 'approved',
      version: '1.0',
      namespace: [],
      ownerId: 'pkg-root',
    };
    mgr.dispatch({ type: 'CreateElement', element: req }, ctx);

    // 6. Create one Motor «satisfy» REQ-001 relationship and display on Requirement Diagram
    const satisfyRel: SemanticRelationship = {
      id: 'rel-motor-satisfy-req',
      name: 'satisfy-peak-torque',
      metaclass: 'Satisfy',
      sourceId: 'blk-motor',
      targetId: 'req-001-uuid',
    };
    mgr.dispatch({ type: 'CreateRelationship', relationship: satisfyRel }, ctx);
    // The relationship diagram renders Satisfy from its endpoint presentations;
    // presenting the Requirement alone is not enough to display Motor «satisfy» REQ-001.
    mgr.dispatch(
      {
        type: 'DisplayExistingElement',
        presentation: {
          id: 'pres-req-node',
          diagramId: 'diag-req',
          semanticElementId: 'req-001-uuid',
          bounds: { x: 100, y: 100, width: 220, height: 110 },
        },
      },
      ctx
    );
    mgr.dispatch(
      {
        type: 'DisplayExistingElement',
        presentation: {
          id: 'pres-motor-req',
          diagramId: 'diag-req',
          semanticElementId: 'blk-motor',
          bounds: { x: 360, y: 100, width: 180, height: 110 },
        },
      },
      ctx
    );

    expect(
      Object.values(mgr.getState().presentations)
        .filter((presentation) => presentation.diagramId === 'diag-req')
        .map((presentation) => presentation.semanticElementId)
    ).toEqual(expect.arrayContaining(['blk-motor', 'req-001-uuid']));
    expect(projectRequirementsDiagram(mgr.getState(), 'diag-req').requirements.map(node => node.elementId))
      .toContain('req-001-uuid');

    // Verification checkpoint 1: Canonical Counts
    let state = mgr.getState();
    const motorDefs = Object.values(state.elements).filter((e) => e.name === 'Motor' && e.metaclass === 'Block');
    expect(motorDefs.length).toBe(1);
    expect(motorDefs[0].id).toBe('blk-motor');

    const leftMotorProps = Object.values(state.elements).filter((e) => e.name === 'leftMotor' && e.metaclass === 'PartProperty');
    expect(leftMotorProps.length).toBe(1);

    const reqList = Object.values(state.elements).filter((e) => e.metaclass === 'Requirement' && (e as Requirement).requirementId === 'REQ-001');
    expect(reqList.length).toBe(1);

    const satisfyList = Object.values(state.relationships).filter((r) => r.metaclass === 'Satisfy');
    expect(satisfyList.length).toBe(1);

    // Motor is still one semantic definition with independent BDD and Requirements presentations.
    const motorPresentations = Object.values(state.presentations).filter((p) => p.semanticElementId === 'blk-motor');
    expect(motorPresentations.length).toBe(3);
    expect(motorPresentations.find((presentation) => presentation.diagramId === 'diag-req')?.bounds)
      .toEqual({ x: 360, y: 100, width: 180, height: 110 });
    expect(state.relationships['rel-motor-satisfy-req']).toMatchObject({
      metaclass: 'Satisfy',
      sourceId: 'blk-motor',
      targetId: 'req-001-uuid',
    });

    // 7. Rename Motor to BLDCMotor and assert every projection dynamically resolves new name with unchanged IDs and counts
    mgr.dispatch(
      {
        type: 'RenameElement',
        elementId: 'blk-motor',
        newName: 'BLDCMotor',
      },
      ctx
    );

    state = mgr.getState();
    expect(state.elements['blk-motor'].name).toBe('BLDCMotor');

    // Projections dynamically resolve BLDCMotor
    const bddAProj = projectBddDiagram(state, 'diag-bdd-a');
    expect(bddAProj.nodes[0].name).toBe('BLDCMotor');
    expect(bddAProj.nodes[0].elementId).toBe('blk-motor');

    const bddBProj = projectBddDiagram(state, 'diag-bdd-b');
    expect(bddBProj.nodes[0].name).toBe('BLDCMotor');
    expect(bddBProj.nodes[0].elementId).toBe('blk-motor');

    const ibdProj = projectIbdDiagram(state, 'diag-ibd-v', 'blk-vehicle');
    expect(ibdProj.parts[0].name).toBe('leftMotor : BLDCMotor');
    expect(ibdProj.parts[0].elementId).toBe('prop-left-motor');

    // 8. Serialize, reload, and verify all assertions hold identically
    const serialized = serializeRepositoryV4(state);
    const reloaded = deserializeRepositoryV4(serialized);

    expect(reloaded.elements['blk-motor'].name).toBe('BLDCMotor');
    expect(reloaded.elements['blk-motor'].id).toBe('blk-motor');
    expect(reloaded.elements['prop-left-motor'].name).toBe('leftMotor');
    expect(reloaded.elements['req-001-uuid'].name).toBe('MaxTorqueReq');
    expect((reloaded.elements['req-001-uuid'] as Requirement).requirementId).toBe('REQ-001');
    expect(reloaded.relationships['rel-motor-satisfy-req'].metaclass).toBe('Satisfy');

    const reloadedMotorPres = Object.values(reloaded.presentations).filter((p) => p.semanticElementId === 'blk-motor');
    expect(reloadedMotorPres.length).toBe(3);
    expect(reloadedMotorPres.find((presentation) => presentation.diagramId === 'diag-req')?.bounds)
      .toEqual({ x: 360, y: 100, width: 180, height: 110 });
    expect(
      Object.values(reloaded.presentations)
        .filter((presentation) => presentation.diagramId === 'diag-req')
        .map((presentation) => presentation.semanticElementId)
    ).toEqual(expect.arrayContaining(['blk-motor', 'req-001-uuid']));
    expect(projectRequirementsDiagram(reloaded, 'diag-req').requirements.map(node => node.elementId))
      .toContain('req-001-uuid');
  });
});
