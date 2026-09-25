import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type SysmlRepositoryV4,
  type Block,
  type Diagram,
  type DiagramPresentation,
  type Requirement,
  type PartProperty,
} from '../domain';
import { dispatchSysmlCommand } from './dispatcher';
import type { CommandContext, CreateAndPresentElementCommand } from './types';

describe('CreateAndPresentElementCommand', () => {
  let repo: SysmlRepositoryV4;
  const uiContext: CommandContext = { source: 'ui', actor: 'engineer' };

  beforeEach(() => {
    repo = createEmptyRepositoryV4();
    const bddDiag: Diagram = {
      id: 'diag-bdd-1',
      name: 'Main BDD',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const reqDiag: Diagram = {
      id: 'diag-req-1',
      name: 'System Requirements',
      metaclass: 'Diagram',
      diagramKind: 'requirements',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    addSemanticElementV4(repo, bddDiag);
    addSemanticElementV4(repo, reqDiag);
  });

  const block: Block = {
    id: 'block-motor',
    name: 'ElectricMotor',
    metaclass: 'Block',
    namespace: [],
    ownerId: 'pkg-root',
    isAbstract: false,
    isLeaf: false,
  };

  const presentation: DiagramPresentation = {
    id: 'pres-motor-bdd',
    diagramId: 'diag-bdd-1',
    semanticElementId: 'block-motor',
    bounds: { x: 100, y: 150, width: 200, height: 120 },
  };

  it('commits exactly one semantic element and one presentation', () => {
    const startRevision = repo.revision;
    const result = dispatchSysmlCommand(
      repo,
      {
        type: 'CreateAndPresentElement',
        element: block,
        presentation,
      },
      uiContext
    );

    expect(result.success).toBe(true);
    expect(result.state.elements[block.id]).toBeDefined();
    expect(result.state.presentations[presentation.id]).toBeDefined();
    expect(result.state.presentations[presentation.id].semanticElementId).toBe(block.id);
    expect(result.state.revision).toBe(startRevision + 1);
    expect(result.state.diagrams['diag-bdd-1'].presentationIds).toContain(presentation.id);
  });

  it('commits neither side when presentation validation fails', () => {
    const invalidCommand: CreateAndPresentElementCommand = {
      type: 'CreateAndPresentElement',
      element: {
        id: 'block-fail',
        name: 'FailBlock',
        metaclass: 'Block',
        namespace: [],
        ownerId: 'pkg-root',
      } as Block,
      presentation: {
        id: 'pres-fail',
        diagramId: 'non-existent-diagram',
        semanticElementId: 'block-fail',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
    };

    const result = dispatchSysmlCommand(repo, invalidCommand, uiContext);
    expect(result.success).toBe(false);
    expect(result.state).toBe(repo);
    expect(result.state.elements['block-fail']).toBeUndefined();
  });

  it('rejects a presentation that references a different semantic identity', () => {
    const result = dispatchSysmlCommand(repo, {
      type: 'CreateAndPresentElement',
      element: block,
      presentation: { ...presentation, semanticElementId: 'different-element' },
    }, uiContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('PRESENTATION_SEMANTIC_ID_MISMATCH');
    expect(result.state).toBe(repo);
  });

  it('does not silently create a missing diagram when displaying an existing element', () => {
    addSemanticElementV4(repo, block);
    const result = dispatchSysmlCommand(repo, {
      type: 'DisplayExistingElement',
      presentation: { ...presentation, diagramId: 'missing-diagram' },
    }, uiContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('DIAGRAM_NOT_FOUND');
    expect(result.state.diagrams['missing-diagram']).toBeUndefined();
  });

  it('rejects displaying an existing element on an incompatible diagram', () => {
    addSemanticElementV4(repo, block);
    const part: PartProperty = {
      id: 'part-existing',
      name: 'existingPart',
      metaclass: 'PartProperty',
      namespace: [],
      ownerId: block.id,
      aggregation: 'composite',
      typeId: block.id,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    addSemanticElementV4(repo, part);

    const result = dispatchSysmlCommand(repo, {
      type: 'DisplayExistingElement',
      presentation: {
        id: 'pres-part-on-req',
        diagramId: 'diag-req-1',
        semanticElementId: part.id,
        bounds: { x: 0, y: 0, width: 100, height: 80 },
      },
    }, uiContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_DIAGRAM_ELEMENT');
    expect(result.state).toBe(repo);
  });

  it('rejects a duplicate DisplayExistingElement without changing revision', () => {
    addSemanticElementV4(repo, block);
    const first = dispatchSysmlCommand(repo, {
      type: 'DisplayExistingElement',
      presentation,
    }, uiContext);
    expect(first.success).toBe(true);

    const duplicate = dispatchSysmlCommand(first.state, {
      type: 'DisplayExistingElement',
      presentation: { ...presentation, id: 'pres-motor-duplicate' },
    }, uiContext);

    expect(duplicate.success).toBe(false);
    expect(duplicate.code).toBe('ALREADY_PRESENTED');
    expect(duplicate.revision).toBe(first.revision);
    expect(duplicate.state).toBe(first.state);
  });

  it('rejects illegal ownership with ILLEGAL_OWNERSHIP and commits neither side', () => {
    const req: Requirement = {
      id: 'req-1',
      name: 'Req1',
      metaclass: 'Requirement',
      namespace: [],
      ownerId: 'pkg-root',
      requirementId: 'REQ-1',
      text: 'Shall operate',
      status: 'draft',
      version: '1.0',
    };
    addSemanticElementV4(repo, req);

    const illegalBlock: Block = {
      id: 'block-under-req',
      name: 'IllegalBlock',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'req-1',
    };

    const cmd: CreateAndPresentElementCommand = {
      type: 'CreateAndPresentElement',
      element: illegalBlock,
      presentation: {
        id: 'pres-illegal',
        diagramId: 'diag-bdd-1',
        semanticElementId: 'block-under-req',
        bounds: { x: 50, y: 50, width: 100, height: 100 },
      },
    };

    const result = dispatchSysmlCommand(repo, cmd, uiContext);
    expect(result.success).toBe(false);
    expect(result.code).toBe('ILLEGAL_OWNERSHIP');
    expect(result.state.elements['block-under-req']).toBeUndefined();
    expect(result.state.presentations['pres-illegal']).toBeUndefined();
  });

  it('rejects invalid diagram presentation element kind with INVALID_DIAGRAM_ELEMENT', () => {
    addSemanticElementV4(repo, block);
    const part: PartProperty = {
      id: 'part-prop-1',
      name: 'actuator',
      metaclass: 'PartProperty',
      namespace: [],
      ownerId: 'block-motor',
      aggregation: 'composite',
      typeId: 'type-1',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const cmd: CreateAndPresentElementCommand = {
      type: 'CreateAndPresentElement',
      element: part,
      presentation: {
        id: 'pres-part-req',
        diagramId: 'diag-req-1', // Requirements diagram does not host PartProperty
        semanticElementId: 'part-prop-1',
        bounds: { x: 10, y: 10, width: 100, height: 80 },
      },
    };

    const result = dispatchSysmlCommand(repo, cmd, uiContext);
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_DIAGRAM_ELEMENT');
  });

  it('enforces duplicate-presentation policy with ALREADY_PRESENTED', () => {
    // First, create and present the block
    const res1 = dispatchSysmlCommand(
      repo,
      {
        type: 'CreateAndPresentElement',
        element: block,
        presentation,
      },
      uiContext
    );
    expect(res1.success).toBe(true);

    // Now try to present the same element on the same diagram again
    const duplicatePresentationCmd: CreateAndPresentElementCommand = {
      type: 'CreateAndPresentElement',
      element: block,
      presentation: {
        id: 'pres-duplicate-id',
        diagramId: 'diag-bdd-1',
        semanticElementId: block.id, // target semantic ID already presented on diag-bdd-1
        bounds: { x: 300, y: 300, width: 100, height: 100 },
      },
    };

    const res2 = dispatchSysmlCommand(res1.state, duplicatePresentationCmd, uiContext);
    expect(res2.success).toBe(false);
    expect(res2.code).toBe('ALREADY_PRESENTED');
  });
});
