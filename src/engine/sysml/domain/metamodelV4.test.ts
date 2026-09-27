import { describe, expect, it } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  addSemanticRelationshipV4,
  addDiagramPresentationV4,
  type SysmlRepositoryV4,
  type Block,
  type InterfaceBlock,
  type ValueType,
  type Unit,
  type QuantityKind,
  type PartProperty,
  type ValueProperty,
  type Diagram,
  type DiagramPresentation,
  type SemanticRelationship,
} from './index';

describe('Canonical SysML Schema v4 Metamodel', () => {
  it('enforces stable IDs, explicit ownership, namespaces, and metaclass discrimination', () => {
    const repo = createEmptyRepositoryV4();
    const block: Block = {
      id: 'block-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: ['System', 'Powertrain'],
      ownerId: 'pkg-powertrain',
      isAbstract: false,
      isLeaf: false,
      generalIds: [],
    };

    addSemanticElementV4(repo, block);

    expect(repo.elements['block-motor']).toBeDefined();
    expect(repo.elements['block-motor'].metaclass).toBe('Block');
    expect(repo.elements['block-motor'].ownerId).toBe('pkg-powertrain');
    expect(repo.elements['block-motor'].namespace).toEqual(['System', 'Powertrain']);
    expect(repo.indexes.byOwner['pkg-powertrain']).toContain('block-motor');
    expect(repo.indexes.byType['Block']).toContain('block-motor');
    expect(repo.indexes.byNamespace['System::Powertrain']).toContain('block-motor');
  });

  it('rejects global ID collision across elements, relationships, and presentations', () => {
    const repo = createEmptyRepositoryV4();
    const block: Block = {
      id: 'id-collision-1',
      name: 'Block1',
      metaclass: 'Block',
      namespace: [],
      ownerId: null,
      isAbstract: false,
      isLeaf: false,
      generalIds: [],
    };
    addSemanticElementV4(repo, block);

    // Attempting to add a relationship with the same ID must throw
    const rel: SemanticRelationship = {
      id: 'id-collision-1',
      metaclass: 'Association',
      sourceId: 'block-1',
      targetId: 'block-2',
    };
    expect(() => addSemanticRelationshipV4(repo, rel)).toThrow(/ID collision/i);
  });

  it('instantiates first-class classifiers, value types, quantity kinds, and units', () => {
    const repo = createEmptyRepositoryV4();

    const qk: QuantityKind = {
      id: 'qk-torque',
      name: 'Torque',
      metaclass: 'QuantityKind',
      namespace: ['Units'],
      ownerId: 'pkg-units',
      symbol: 'τ',
    };
    const unit: Unit = {
      id: 'unit-nm',
      name: 'NewtonMeter',
      metaclass: 'Unit',
      namespace: ['Units'],
      ownerId: 'pkg-units',
      symbol: 'N·m',
      quantityKindId: 'qk-torque',
    };
    const vt: ValueType = {
      id: 'vt-torque',
      name: 'TorqueValue',
      metaclass: 'ValueType',
      namespace: ['Types'],
      ownerId: 'pkg-types',
      quantityKindId: 'qk-torque',
      unitId: 'unit-nm',
    };
    const ifBlock: InterfaceBlock = {
      id: 'if-power',
      name: 'PowerInterface',
      metaclass: 'InterfaceBlock',
      namespace: ['Interfaces'],
      ownerId: 'pkg-interfaces',
      isAbstract: false,
      isLeaf: false,
      generalIds: [],
    };

    addSemanticElementV4(repo, qk);
    addSemanticElementV4(repo, unit);
    addSemanticElementV4(repo, vt);
    addSemanticElementV4(repo, ifBlock);

    expect(repo.elements['qk-torque'].metaclass).toBe('QuantityKind');
    expect(repo.elements['unit-nm'].metaclass).toBe('Unit');
    expect(repo.elements['vt-torque'].metaclass).toBe('ValueType');
    expect(repo.elements['if-power'].metaclass).toBe('InterfaceBlock');
  });

  it('instantiates first-class properties with typed specifications and multiplicity', () => {
    const repo = createEmptyRepositoryV4();

    const partProp: PartProperty = {
      id: 'prop-left-motor',
      name: 'leftMotor',
      metaclass: 'PartProperty',
      namespace: ['Vehicle'],
      ownerId: 'block-vehicle',
      typeId: 'block-motor',
      aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const valProp: ValueProperty = {
      id: 'prop-max-torque',
      name: 'maxTorque',
      metaclass: 'ValueProperty',
      namespace: ['Motor'],
      ownerId: 'block-motor',
      typeId: 'vt-torque',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      defaultValue: { kind: 'literalReal', value: 350.5 },
    };

    addSemanticElementV4(repo, partProp);
    addSemanticElementV4(repo, valProp);

    expect(repo.elements['prop-left-motor'].metaclass).toBe('PartProperty');
    expect(repo.elements['prop-max-torque'].metaclass).toBe('ValueProperty');
    expect((repo.elements['prop-max-torque'] as ValueProperty).defaultValue).toEqual({
      kind: 'literalReal',
      value: 350.5,
    });
  });

  it('stores typed Diagram and DiagramPresentation without string compartment serialization', () => {
    const repo = createEmptyRepositoryV4();

    const diagram: Diagram = {
      id: 'diag-bdd-1',
      name: 'Vehicle BDD',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: ['pres-1'],
    };

    const presentation: DiagramPresentation = {
      id: 'pres-1',
      diagramId: 'diag-bdd-1',
      semanticElementId: 'block-motor',
      bounds: { x: 100, y: 150, width: 200, height: 120 },
      visibleCompartments: ['properties', 'operations'],
    };

    addSemanticElementV4(repo, diagram);
    addDiagramPresentationV4(repo, presentation);

    expect(repo.diagrams['diag-bdd-1']).toBeDefined();
    expect(repo.presentations['pres-1']).toBeDefined();
    expect(repo.presentations['pres-1'].bounds).toEqual({ x: 100, y: 150, width: 200, height: 120 });
    expect(repo.indexes.byDiagram['diag-bdd-1']).toContain('pres-1');
  });
});
