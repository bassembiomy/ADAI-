import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type ModelDiagramDefinition, type SysmlRepository } from '../engine/sysml/model';
import {
  createInitialNavigationState,
  enterBlockContext,
  navigateBack,
  navigateRoot,
  openExactDiagram,
  recoverNavigationState,
} from './sysmlDiagramNavigation';

function createRepoWithMultipleDiagrams(): SysmlRepository {
  const repo = createEmptyRepository();

  const bdd1: ModelDiagramDefinition = {
    id: 'bdd-top-level',
    name: 'Top-Level BDD',
    ownerId: 'model',
    namespace: [],
    kind: 'diagram',
    diagramKind: 'bdd',
  };
  const bdd2: ModelDiagramDefinition = {
    id: 'bdd-powertrain',
    name: 'Powertrain BDD',
    ownerId: 'model',
    namespace: [],
    kind: 'diagram',
    diagramKind: 'bdd',
  };
  const pkg1: ModelDiagramDefinition = {
    id: 'pkg-architecture',
    name: 'Architecture Package Diagram',
    ownerId: 'model',
    namespace: [],
    kind: 'diagram',
    diagramKind: 'package',
  };

  repo.diagrams[bdd1.id] = bdd1;
  repo.diagrams[bdd2.id] = bdd2;
  repo.diagrams[pkg1.id] = pkg1;

  const vehicle: BlockDefinition = {
    id: 'vehicle',
    name: 'Vehicle',
    ownerId: 'model',
    namespace: [],
    kind: 'block',
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
  const motor: BlockDefinition = {
    id: 'motor',
    name: 'Motor',
    ownerId: 'model',
    namespace: [],
    kind: 'block',
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };

  repo.definitions[vehicle.id] = vehicle;
  repo.definitions[motor.id] = motor;

  return repo;
}

describe('SysML Diagram Navigation Service', () => {
  it('activates exact diagram IDs when switching between multiple BDDs', () => {
    const repo = createRepoWithMultipleDiagrams();
    let state = createInitialNavigationState();

    state = openExactDiagram(state, repo, 'bdd-top-level');
    expect(state.activeDiagramId).toBe('bdd-top-level');
    expect(state.diagramKind).toBe('bdd');

    state = openExactDiagram(state, repo, 'bdd-powertrain');
    expect(state.activeDiagramId).toBe('bdd-powertrain');
    expect(state.diagramKind).toBe('bdd');

    state = openExactDiagram(state, repo, 'pkg-architecture');
    expect(state.activeDiagramId).toBe('pkg-architecture');
    expect(state.diagramKind).toBe('package');
  });

  it('entering a Block from a specific BDD records origin BDD and Root navigation restores that exact BDD', () => {
    const repo = createRepoWithMultipleDiagrams();
    let state = createInitialNavigationState();

    // 1. Open Powertrain BDD specifically
    state = openExactDiagram(state, repo, 'bdd-powertrain');
    expect(state.activeDiagramId).toBe('bdd-powertrain');

    // 2. Enter Block "Vehicle" (opens IBD)
    state = enterBlockContext(state, repo, 'vehicle');
    expect(state.activeDiagramId).toBe('vehicle');
    expect(state.diagramKind).toBe('ibd');
    expect(state.contextElementId).toBe('vehicle');
    expect(state.returnStack).toHaveLength(1);
    expect(state.returnStack[0].diagramId).toBe('bdd-powertrain');

    // 3. Return to Root
    state = navigateRoot(state, repo);
    expect(state.activeDiagramId).toBe('bdd-powertrain');
    expect(state.diagramKind).toBe('bdd');
    expect(state.contextElementId).toBeUndefined();
    expect(state.returnStack).toHaveLength(0);
  });

  it('nested block entry preserves return chain and step-by-step back navigation restores previous context', () => {
    const repo = createRepoWithMultipleDiagrams();
    let state = createInitialNavigationState();

    state = openExactDiagram(state, repo, 'bdd-top-level');
    state = enterBlockContext(state, repo, 'vehicle');
    state = enterBlockContext(state, repo, 'motor');

    expect(state.activeDiagramId).toBe('motor');
    expect(state.contextElementId).toBe('motor');
    expect(state.returnStack).toHaveLength(2);

    state = navigateBack(state, repo);
    expect(state.activeDiagramId).toBe('vehicle');
    expect(state.contextElementId).toBe('vehicle');
    expect(state.diagramKind).toBe('ibd');

    state = navigateBack(state, repo);
    expect(state.activeDiagramId).toBe('bdd-top-level');
    expect(state.diagramKind).toBe('bdd');
  });

  it('recovers gracefully from deleted or stale diagram IDs without mutating semantic ownership', () => {
    const repo = createRepoWithMultipleDiagrams();
    let state = createInitialNavigationState();
    state = openExactDiagram(state, repo, 'bdd-powertrain');
    state = enterBlockContext(state, repo, 'vehicle');

    // Stale: active diagram deleted
    delete repo.diagrams['bdd-powertrain'];
    const recovered = recoverNavigationState(state, repo);
    // Active was 'vehicle' in IBD, which is still a valid block definition
    expect(recovered.activeDiagramId).toBe('vehicle');

    // If context block is also deleted:
    delete repo.definitions['vehicle'];
    const fullyRecovered = recoverNavigationState(recovered, repo);
    // Should fall back to the remaining BDD: bdd-top-level
    expect(fullyRecovered.activeDiagramId).toBe('bdd-top-level');
    expect(fullyRecovered.diagramKind).toBe('bdd');
    // Definitions must remain unmodified
    expect(Object.keys(repo.definitions)).toContain('motor');
  });

  it('opening another diagram resets return stack so root navigation returns to the new diagram', () => {
    const repo = createRepoWithMultipleDiagrams();
    let state = createInitialNavigationState();

    // 1. Enter Block 'vehicle' from BDD-A ('bdd-top-level')
    state = openExactDiagram(state, repo, 'bdd-top-level');
    state = enterBlockContext(state, repo, 'vehicle');
    expect(state.activeDiagramId).toBe('vehicle');
    expect(state.returnStack).toHaveLength(1);
    expect(state.returnStack[0].diagramId).toBe('bdd-top-level');

    // 2. Open BDD-B ('bdd-powertrain') via tree/tab (openExactDiagram)
    state = openExactDiagram(state, repo, 'bdd-powertrain');
    expect(state.activeDiagramId).toBe('bdd-powertrain');
    expect(state.diagramKind).toBe('bdd');
    expect(state.returnStack).toHaveLength(0);

    // 3. Enter another Block ('motor') in BDD-B
    state = enterBlockContext(state, repo, 'motor');
    expect(state.activeDiagramId).toBe('motor');
    expect(state.returnStack).toHaveLength(1);
    expect(state.returnStack[0].diagramId).toBe('bdd-powertrain');

    // 4. Navigate Root must return to BDD-B, NOT stale BDD-A
    state = navigateRoot(state, repo);
    expect(state.activeDiagramId).toBe('bdd-powertrain');
    expect(state.diagramKind).toBe('bdd');
    expect(state.returnStack).toHaveLength(0);
  });
});
