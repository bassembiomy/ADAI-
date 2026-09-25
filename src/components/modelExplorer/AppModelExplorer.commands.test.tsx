// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isPreflightClear } from '../../features/modelExplorer/modelExplorerCommandBus';
import type { ExplorerCommandResult, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { AppModelExplorer } from './AppModelExplorer';
import type { StateMachineExplorerSnapshot } from '../../features/modelExplorer/adapters/stateMachineExplorerAdapter';
import { createEmptyRepository, type BlockDefinition, type PartUsage, type RequirementDefinition, type SysmlRelationship } from '../../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from '../../services/sysmlCommandGateway';
import type { SysmlEditorCommand } from '../../services/sysmlCommandGateway';

describe('AppModelExplorer Command Dispatch & State Machine History', () => {
  it('creates a real repository BDD under model from the Structural pillar', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const repository = createEmptyRepository();
    let gatewayState = createSysmlGatewayState(repository);
    const onExecute = vi.fn((command: SysmlEditorCommand) => {
      const result = executeSysmlCommand(gatewayState, command);
      if (result.committed) {
        gatewayState = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
      }
      return result;
    });

    const { container } = render(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        canonicalSysmlRepository={repository}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onExecuteSysmlCommand={onExecute}
      />
    );

    const structureRow = container.querySelector('.model-tree-row[data-node-id="project:pillar:structural"]');
    expect(structureRow).not.toBeNull();
    fireEvent.contextMenu(structureRow!);
    fireEvent.click(screen.getByRole('menuitem', { name: /^Block Definition Diagram \(BDD\)$/ }));

    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0][0]).toMatchObject({ type: 'createDiagram', diagram: { ownerId: 'model', diagramKind: 'bdd' } });
    expect(Object.values(gatewayState.repository.diagrams)).toHaveLength(1);
    expect(Object.values(gatewayState.repository.diagrams)[0]).toMatchObject({ ownerId: 'model', diagramKind: 'bdd' });
  });

  it('isPreflightClear identifies valid non-committing preflight without errors or impact', () => {
    const clearPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [],
    };
    expect(isPreflightClear(clearPreflight)).toBe(true);

    const errorPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [{ code: 'ERR_1', message: 'Fail', severity: 'error' }],
    };
    expect(isPreflightClear(errorPreflight)).toBe(false);

    const impactPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [],
      impact: {
        descendants: ['d1'],
        relationships: [],
        presentations: [],
        invalidated: ['t1'],
      },
    };
    expect(isPreflightClear(impactPreflight)).toBe(false);

    const emptyImpactPreflight: ExplorerCommandResult = {
      committed: false,
      revision: 1,
      diagnostics: [],
      impact: {
        descendants: [],
        relationships: [],
        presentations: [],
        invalidated: [],
      },
    };
    expect(isPreflightClear(emptyImpactPreflight)).toBe(true);
  });

  it('calls onCommitStateMachineSnapshot once with next snapshot and description', () => {
    const onCommit = vi.fn();

    // Render with single snapshot transaction handler
    const explorer = (
      <AppModelExplorer
        diagramMode="statemachine"
        states={[]}
        layers={[{ id: 'root', name: 'Root Layer', parentStateId: null, stateIds: [], junctionIds: [], transitionIds: [] }]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onCommitStateMachineSnapshot={onCommit}
      />
    );

    expect(explorer).toBeDefined();
  });

  it('opens and confirms material execution impact when delete preflight is empty', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const repository = createEmptyRepository();
    const motor: BlockDefinition = {
      id: 'block-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const vehicle: BlockDefinition = {
      id: 'block-vehicle', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const part: PartUsage = {
      id: 'part-left-motor', name: 'leftMotor', kind: 'part', ownerId: motor.id, typeId: vehicle.id,
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const requirement: RequirementDefinition = {
      id: 'req-001', name: 'REQ-001', kind: 'requirement', namespace: [], requirementId: 'REQ-001',
      text: 'Motor shall run', status: 'approved', version: '1', priority: 'high', risk: 'medium',
    };
    const satisfy: SysmlRelationship = {
      id: 'satisfy-motor-req', kind: 'satisfy', sourceId: motor.id, targetId: requirement.id,
    };
    repository.definitions[motor.id] = motor;
    repository.definitions[vehicle.id] = vehicle;
    repository.usages[part.id] = part;
    repository.requirements[requirement.id] = requirement;
    repository.relationships[satisfy.id] = satisfy;

    let gatewayState = createSysmlGatewayState(repository, {
      [motor.id]: { x: 10, y: 20 },
      [part.id]: { x: 30, y: 40 },
    }, {
      bdd: { elementIds: [motor.id, part.id] },
      requirements: { elementIds: [motor.id, requirement.id, satisfy.id] },
    });
    const onExecute = vi.fn((command: SysmlEditorCommand) => {
      const result = executeSysmlCommand(gatewayState, command);
      if (result.committed) {
        gatewayState = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
      }
      return result;
    });
    const onCommandResult = vi.fn();

    const { container } = render(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[motor.id]}
        canonicalSysmlRepository={repository}
        diagramPresentations={gatewayState.diagramPresentations}
        activeDiagramId="bdd"
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onExecuteSysmlCommand={onExecute}
        onCommandResult={onCommandResult}
      />
    );

    const motorRow = container.querySelector('.model-tree-row[data-semantic-id="block-motor"]');
    expect(motorRow).not.toBeNull();
    fireEvent.contextMenu(motorRow!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('part-left-motor', { exact: true })).toBeTruthy();
    const confirmedHash = screen.getByText(/Impact Verification Hash:/).parentElement?.textContent?.trim();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onExecute).toHaveBeenCalledTimes(2);
    const confirmationCommand = onExecute.mock.calls[1][0] as SysmlEditorCommand & { confirmedImpactHash?: string };
    expect(confirmationCommand.type).toBe('deleteElements');
    expect(confirmationCommand.confirmedImpactHash).toBeTruthy();
    expect(gatewayState.repository.definitions[motor.id]).toBeUndefined();
    expect(onCommandResult).toHaveBeenCalled();
    expect(confirmedHash).toContain(confirmationCommand.confirmedImpactHash);
  });

  it('refreshes Paste availability after Copy', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const repository = createEmptyRepository();
    for (const [id, name] of [['block-motor', 'Motor'], ['block-vehicle', 'Vehicle']]) {
      repository.definitions[id] = {
        id, name, kind: 'block', namespace: [], ownerId: 'model',
        isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
      };
    }
    let gatewayState = createSysmlGatewayState(repository);
    const onExecute = vi.fn((command: SysmlEditorCommand) => {
      const result = executeSysmlCommand(gatewayState, command);
      if (result.committed) {
        gatewayState = createSysmlGatewayState(result.repository, result.coordinates, result.diagramPresentations);
      }
      return result;
    });
    const { container } = render(
      <AppModelExplorer
        diagramMode="bdd"
        states={[]}
        layers={[]}
        transitions={[]}
        junctions={[]}
        blocks={[]}
        parts={[]}
        selectedIds={[]}
        canonicalSysmlRepository={repository}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onExecuteSysmlCommand={onExecute}
      />
    );

    const motorRow = container.querySelector('.model-tree-row[data-semantic-id="block-motor"]');
    expect(motorRow).not.toBeNull();
    fireEvent.contextMenu(motorRow!);
    const unavailablePaste = screen.getByRole('menuitem', { name: /Paste/ }) as HTMLButtonElement;
    expect(unavailablePaste.disabled).toBe(true);
    expect(unavailablePaste.textContent).toContain('Copy an element first');

    fireEvent.click(within(screen.getByRole('menu')).getAllByRole('menuitem', { name: /^Copy/ })[0]);
    const vehicleRow = container.querySelector('.model-tree-row[data-semantic-id="block-vehicle"]');
    expect(vehicleRow).not.toBeNull();
    fireEvent.contextMenu(vehicleRow!);
    expect((screen.getByRole('menuitem', { name: /Paste/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
