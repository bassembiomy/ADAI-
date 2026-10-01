import { describe, expect, it } from 'vitest';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  buildCanonicalSysmlProjectPayload,
  loadCanonicalSysmlProject,
  type SysmlGatewayState,
} from '../../../services/sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from '../../../services/sysmlDiagramWorkspace';
import { createEmptyRepository, type BlockDefinition, type PackageDefinition } from '../model';

describe('Contextual Editing Save, Load, and Undo Identity (Task 7 Step 5)', () => {
  it('proves end-to-end identity across creation, editing, undo, redo, and persistence reload', () => {
    // 1. Initial seeded state
    const initialRepo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    let state = createSysmlGatewayState(initialRepo);

    // 2. Create Package 'Powertrain'
    const pkg: PackageDefinition = {
      id: 'pkg-powertrain',
      name: 'Powertrain',
      kind: 'package',
      namespace: ['Model'],
      ownerId: 'model',
    };
    let res = executeSysmlCommand(state, {
      type: 'createAndPresent',
      element: pkg,
      diagramId: 'adia-default-bdd',
      presentation: { x: 100, y: 100, width: 220, height: 140 },
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };

    // 3. Create Block 'Motor' inside 'Powertrain'
    const block: BlockDefinition = {
      id: 'block-motor',
      name: 'Motor',
      kind: 'block',
      namespace: ['Model', 'Powertrain'],
      ownerId: 'pkg-powertrain',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [
        {
          id: 'port-p1',
          name: 'p1',
          direction: 'in',
          kind: 'flow',
          typeId: 'Type1',
          isConjugated: false,
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
      ],
      operations: [],
      constraints: [],
    };
    res = executeSysmlCommand(state, {
      type: 'createAndPresent',
      element: block,
      diagramId: 'adia-default-bdd',
      presentation: { x: 150, y: 200, width: 160, height: 100 },
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };

    // 4. Update Presentation Coordinates (drag movement)
    res = executeSysmlCommand(state, {
      type: 'updatePresentation',
      diagramId: 'adia-default-bdd',
      elementId: 'block-motor',
      presentation: { x: 300, y: 400, width: 180, height: 120 },
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.diagramPresentations?.['adia-default-bdd']?.presentations?.['block-motor']?.bounds).toMatchObject({
      x: 300,
      y: 400,
    });

    // 5. Test Undo of Presentation Move
    const undoMoveRes = executeSysmlCommand(state, { type: 'undo' });
    expect(undoMoveRes.committed).toBe(true);
    state = { ...state, ...undoMoveRes };
    expect(state.diagramPresentations?.['adia-default-bdd']?.presentations?.['block-motor']?.bounds).toMatchObject({
      x: 150,
      y: 200,
    });

    // 6. Test Redo of Presentation Move
    const redoMoveRes = executeSysmlCommand(state, { type: 'redo' });
    expect(redoMoveRes.committed).toBe(true);
    state = { ...state, ...redoMoveRes };
    expect(state.diagramPresentations?.['adia-default-bdd']?.presentations?.['block-motor']?.bounds).toMatchObject({
      x: 300,
      y: 400,
    });

    // 7. Save to Canonical Project Payload
    const payload = buildCanonicalSysmlProjectPayload(state, {
      version: '1.0.0',
      projectName: 'Contextual Identity Test',
    });

    // 8. Reload from Payload and assert exact identity
    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.packages['pkg-powertrain']).toBeDefined();
    expect(loaded.repository.packages['pkg-powertrain'].name).toBe('Powertrain');
    expect(loaded.repository.packages['pkg-powertrain'].ownerId).toBe('model');

    expect(loaded.repository.definitions['block-motor']).toBeDefined();
    const loadedMotor = loaded.repository.definitions['block-motor'] as BlockDefinition;
    expect(loadedMotor.name).toBe('Motor');
    expect(loadedMotor.ownerId).toBe('pkg-powertrain');
    expect(loadedMotor.ports[0]).toMatchObject({
      id: 'port-p1',
      name: 'p1',
      direction: 'in',
      kind: 'flow',
    });

    // Assert diagram presentation bounds preserved exactly
    const loadedBounds = loaded.diagramPresentations['adia-default-bdd']?.presentations?.['block-motor']?.bounds;
    expect(loadedBounds).toMatchObject({
      x: 300,
      y: 400,
      width: 180,
      height: 120,
    });
  });
});
