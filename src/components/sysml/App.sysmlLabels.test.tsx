// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { validateRequirementContainment } from '../../engine/sysml/validation';
import { elementPresentationColor, isValidPresentationColor } from '../../engine/sysml/semanticPresentationStyles';
import { classifyBddRelationshipPresentation } from '../../services/sysmlConnectionUi';
import { calculateBddParallelRoute, resolveBddPropertyRelationshipGeometry } from '../../services/sysmlBddRelationshipGeometry';
import { calculateSeparatedRelationshipPath } from '../../utils/sysmlConnectionRouting';
import { resolveSysmlReferenceLabel, sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';
import { computeBlockDisplayBounds } from './blockLayout';

// Exercise the actual legacy render callback without booting unrelated editors,
// workers and persistence in the monolithic App. All geometry/label code is real.
const sourceFile = ts.createSourceFile('App.tsx', readFileSync('src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluateNode(predicate: (node: ts.Node) => boolean, scope: Record<string, unknown>) {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!found && predicate(node)) found = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error('App render expression not found');
  const expression = ts.isVariableDeclaration(found)
    ? ts.isCallExpression(found.initializer!) && found.initializer.expression.getText(sourceFile) === 'useCallback'
      ? found.initializer.arguments[0] : found.initializer!
    : found;
  const output = ts.transpileModule(`const value = (${expression.getText(sourceFile)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), `${output}; return value;`)(...Object.values(scope));
}

const uuid = (n: number) => `65cb033e-421d-41e0-b789-87931d99101${n}`;
function renderRelationship(type = 'association', property = false, label = '') {
  const block = (id: string, name: string, x: number) => ({ id, name, x, y: 10, width: 160, height: 100, stereotype: type === 'requirementContainment' ? 'requirement' : 'block', properties: [], ports: [], operations: [], constraints: [], classes: [] });
  const source = block(uuid(0), ' Controller ', 10);
  const target = block(uuid(1), ' ', 250);
  if (property) (source.properties as unknown[]).push({ id: uuid(3), name: ' ', typeId: target.id, kind: 'part', multiplicity: '1' });
  const rel = { id: uuid(2), sourceId: property ? uuid(3) : source.id, targetId: target.id, type, label };
  const select = vi.fn();
  const callback = evaluateNode(node => ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'renderRelationships', {
    React, computeBlockDisplayBounds, classifyBddRelationshipPresentation,
    calculateBddParallelRoute, resolveBddPropertyRelationshipGeometry, calculateSeparatedRelationshipPath,
    elementPresentationColor, isValidPresentationColor, validateRequirementContainment,
    sysmlObjectLabel, resolveSysmlReferenceLabel,
    diagramMode: type === 'requirementContainment' ? 'requirements' : 'bdd',
    culledDiagram: undefined, isDragging: false, isPanning: false,
    sysmlCanvasView: { blocks: [source, target], packages: [], parts: [], relationships: [rel] },
    activeDiagramElementIds: new Set([source.id, target.id, uuid(3)]),
    blocksById: new Map([[source.id, source], [target.id, target]]), partsById: new Map(),
    selectedIds: [], setSelectedIds: select, sysmlDiagramPresentations: {}, activeSysmlDiagramId: 'diagram',
    canonicalSysmlRepository: createEmptyRepository(), requirementsDiagramScope: { visibleRelationshipIds: new Set([rel.id]) },
  });
  return { ...render(<svg>{callback()}</svg>), select };
}

describe('legacy App SysML labels', () => {
  afterEach(cleanup);
  it('uses a region label in validation messages for unnamed layers', () => {
    const label = evaluateNode(node => ts.isVariableDeclaration(node)
      && node.name.getText(sourceFile) === 'layerName'
      && node.initializer?.getText(sourceFile).includes("layer.id === 'root'") === true,
    { layer: { id: uuid(4), name: ' ' }, sysmlObjectLabel });
    expect(label).toBe('Region');
  });
  it.each(['sPortName', 'tPortName'])('labels unnamed exported connector ports (%s)', name => {
    const value = evaluateNode(node => ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name, {
      sBlock: { ports: [] }, tBlock: { ports: [] }, c: { sourcePortId: uuid(0), targetPortId: uuid(1) }, sysmlObjectLabel,
    });
    expect(value).toBe('Port');
  });
  it('resolves baseline and suspect-link notifications without internal IDs', () => {
    const repo = createEmptyRepository();
    repo.baselines[uuid(0)] = { id: uuid(0), name: ' Design review ', revision: 1, createdAt: '', protected: true };
    repo.relationships[uuid(1)] = { id: uuid(1), kind: 'association', sourceId: 'a', targetId: 'b' };
    const cases = [
      ['Working copy of ', 'Working copy of Design review'],
      ['Cloned protected baseline ', 'Cloned protected baseline Design review into unprotected working copy Working design'],
      ['Recorded explicit deletion authorization for protected baseline ', 'Recorded explicit deletion authorization for protected baseline Design review'],
      ['Cleared suspect flag on link: ', 'Cleared suspect flag on link: Association'],
    ];
    for (const [prefix, expected] of cases) {
      const value = evaluateNode(node => ts.isTemplateExpression(node) && node.head.text === prefix, {
        canonicalSysmlRepository: repo, baselineId: uuid(0), relId: uuid(1),
        res: { baseline: { id: uuid(2), name: ' Working design ' } }, sysmlObjectLabel, resolveSysmlReferenceLabel,
      });
      expect(value).toBe(expected);
    }
  });
  it('shows package diagram labels while retaining IDs for navigation', () => {
    const repo = createEmptyRepository();
    const openExactDiagramById = vi.fn();
    const content = evaluateNode(node => ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'packageDiagramChooser.diagramIds.map', {
      React, Button: 'button', packageDiagramChooser: { diagramIds: [uuid(0)] }, canonicalSysmlRepository: repo,
      setActivePackageDiagramId: vi.fn(), openExactDiagramById, setPackageDiagramChooser: vi.fn(), sysmlObjectLabel,
    });
    const { container } = render(<div>{content}</div>);
    expect(screen.getByRole('button', { name: 'Package Diagram' })).toBeTruthy();
    expect(container.textContent).not.toContain(uuid(0));
    fireEvent.click(screen.getByRole('button'));
    expect(openExactDiagramById).toHaveBeenCalledWith(uuid(0), { preserveReturnStack: true });
  });
  it('exports legacy requirement links with display names and metaclasses', () => {
    const requirement = { id: 'requirement', name: 'Safety', stereotype: 'requirement' };
    const unnamed = { id: uuid(0), name: ' ', stereotype: 'block' };
    const jsonToSheet = vi.fn();
    const callback = evaluateNode(node => ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'exportExcel', {
      orderedReqs: [{ req: requirement, level: 0 }], blocks: [requirement, unnamed], parts: [],
      relationships: [{ id: 'rel', sourceId: requirement.id, targetId: uuid(0), type: 'trace' }],
      sysmlObjectLabel,
      XLSX: { utils: { json_to_sheet: jsonToSheet, book_new: vi.fn(), book_append_sheet: vi.fn() }, writeFile: vi.fn() },
    });
    callback();
    expect(jsonToSheet.mock.calls[0][0][0].Links).toBe('[trace] Block');
    expect(JSON.stringify(jsonToSheet.mock.calls[0][0])).not.toContain(uuid(0));
  });
  it('renders names and metaclasses in relationship titles while selecting by semantic ID', () => {
    const { container, select } = renderRelationship();
    expect(screen.getByText('Association: Controller -> Block')).toBeTruthy();
    expect(screen.getByText('Association')).toBeTruthy();
    for (const n of [0, 1, 2]) expect(container.textContent).not.toContain(uuid(n));
    const relationship = container.querySelector(`[data-semantic-id="${uuid(2)}"]`)!;
    fireEvent.click(relationship);
    expect(select).toHaveBeenCalledWith([uuid(2)]);
  });
  it('preserves a trimmed relationship name in title and badge', () => {
    renderRelationship('association', false, ' Controls ');
    expect(screen.getByText('Controls: Controller -> Block')).toBeTruthy();
    expect(screen.getByText('Controls')).toBeTruthy();
  });
  it('labels unnamed property ends without leaking the property ID', () => {
    const { container } = renderRelationship('association', true);
    expect(screen.getByText('Property of Controller -> Block')).toBeTruthy();
    expect(screen.getByTestId('bdd-property-end-label').textContent).toBe('Property [1]');
    expect(container.textContent).not.toContain(uuid(3));
  });
  it('keeps requirement containment accessible names free of internal IDs', () => {
    renderRelationship('requirementContainment');
    expect(screen.getByRole('graphics-symbol', { name: 'Requirement containment: Controller contains Requirement' })).toBeTruthy();
  });
  it('uses the port metaclass in the direction control accessible name', () => {
    const label = evaluateNode(node => ts.isTemplateExpression(node) && node.head.text === 'Direction for ', {
      port: { id: uuid(4), name: ' ' }, sysmlObjectLabel,
    });
    expect(label).toBe('Direction for Port');
  });
});
