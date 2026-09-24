import { describe, expect, it } from 'vitest';
import {
  projectBddDiagram,
  projectIbdDiagram,
  projectRequirementsDiagram,
  projectModelBrowser,
} from './canonicalProjections';
import {
  createEmptyRepositoryV4,
  type Block,
  type Port,
  type PartProperty,
  type ValueProperty,
  type Requirement,
  type DiagramPresentation,
} from '../domain';

describe('Canonical Repository Projections (Task 11)', () => {
  it('projects BDD view model with compartments and dynamic name resolution', () => {
    let repo = createEmptyRepositoryV4();

    const blk: Block = {
      id: 'blk-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: ['Components'],
      ownerId: 'pkg-root',
    };
    repo.elements[blk.id] = blk;

    const valProp: ValueProperty = {
      id: 'prop-rpm',
      name: 'maxRpm',
      metaclass: 'ValueProperty',
      namespace: [],
      ownerId: 'blk-motor',
      typeId: 'vt-int',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      defaultValue: { kind: 'literalInteger', value: 6000 },
    };
    repo.elements[valProp.id] = valProp;
    repo.indexes.byOwner['blk-motor'] = [valProp.id];

    // Presentation on BDD-1
    const pres: DiagramPresentation = {
      id: 'pres-1',
      diagramId: 'bdd-1',
      elementId: 'blk-motor',
      bounds: { x: 100, y: 120, width: 200, height: 150 },
      visibleCompartments: ['values'],
    };
    repo.presentations[pres.id] = pres;
    repo.indexes.byDiagram['bdd-1'] = [pres.id];

    const projection = projectBddDiagram(repo, 'bdd-1');
    expect(projection.nodes.length).toBe(1);
    expect(projection.nodes[0].name).toBe('Motor');
    expect(projection.nodes[0].x).toBe(100);
    expect(projection.nodes[0].y).toBe(120);
    expect(projection.nodes[0].compartments.values).toContain('maxRpm : vt-int = 6000');

    // Renaming block updates projection label dynamically
    blk.name = 'ElectricMotor';
    const updatedProj = projectBddDiagram(repo, 'bdd-1');
    expect(updatedProj.nodes[0].name).toBe('ElectricMotor');
  });

  it('projects IBD view model with context, parts, ports, and connectors', () => {
    let repo = createEmptyRepositoryV4();

    const bVehicle: Block = { id: 'b-v', name: 'Vehicle', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const bMotor: Block = { id: 'b-m', name: 'Motor', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const partMotor: PartProperty = {
      id: 'p-m',
      name: 'motor',
      metaclass: 'PartProperty',
      namespace: [],
      ownerId: 'b-v',
      typeId: 'b-m',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      aggregation: 'composite',
    };
    const portPwr: Port = {
      id: 'port-p',
      name: 'pwrIn',
      metaclass: 'Port',
      portKind: 'proxyPort',
      namespace: [],
      ownerId: 'b-m',
      typeId: 'b-m',
    };

    repo.elements[bVehicle.id] = bVehicle;
    repo.elements[bMotor.id] = bMotor;
    repo.elements[partMotor.id] = partMotor;
    repo.elements[portPwr.id] = portPwr;
    repo.indexes.byOwner['b-v'] = [partMotor.id];
    repo.indexes.byOwner['b-m'] = [portPwr.id];

    // Presentation on IBD-1 (context: bVehicle)
    const presPart: DiagramPresentation = {
      id: 'pres-part',
      diagramId: 'ibd-1',
      elementId: 'p-m',
      bounds: { x: 50, y: 50, width: 220, height: 180 },
    };
    repo.presentations[presPart.id] = presPart;
    repo.indexes.byDiagram['ibd-1'] = [presPart.id];

    const ibdProj = projectIbdDiagram(repo, 'ibd-1', 'b-v');
    expect(ibdProj.contextBlockId).toBe('b-v');
    expect(ibdProj.parts.length).toBe(1);
    expect(ibdProj.parts[0].name).toBe('motor : Motor');
    expect(ibdProj.parts[0].ports.length).toBe(1);
    expect(ibdProj.parts[0].ports[0].name).toBe('pwrIn');
  });

  it('projects Requirements diagram and Model Browser tree', () => {
    let repo = createEmptyRepositoryV4();

    const req: Requirement = {
      id: 'r1',
      name: 'SafetyReq',
      metaclass: 'Requirement',
      requirementId: 'REQ-SAF-01',
      text: 'Must brake under 30 meters.',
      status: 'approved',
      version: '1.2',
      namespace: [],
      ownerId: 'pkg-root',
    };
    repo.elements[req.id] = req;

    const presReq: DiagramPresentation = {
      id: 'pres-req',
      diagramId: 'req-diag-1',
      elementId: 'r1',
      bounds: { x: 300, y: 100, width: 250, height: 120 },
    };
    repo.presentations[presReq.id] = presReq;
    repo.indexes.byDiagram['req-diag-1'] = [presReq.id];

    const reqProj = projectRequirementsDiagram(repo, 'req-diag-1');
    expect(reqProj.requirements.length).toBe(1);
    expect(reqProj.requirements[0].requirementId).toBe('REQ-SAF-01');
    expect(reqProj.requirements[0].text).toBe('Must brake under 30 meters.');

    // Model Browser projection
    const tree = projectModelBrowser(repo);
    expect(tree.rootNodes.length).toBe(1);
    expect(tree.allNodes['r1']).toBeDefined();
    expect(tree.allNodes['r1'].label).toBe('«requirement» SafetyReq [REQ-SAF-01]');
  });
});
