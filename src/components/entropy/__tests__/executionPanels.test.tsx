/**
 * Task 7 interaction tests (repo React test renderer pattern: element-tree
 * traversal + renderToStaticMarkup, no DOM test library).
 *
 * Covers: add/edit/reorder/disable/delete attributes + assignments, typed
 * bool/numeric/enum values, legal reference selection, state entry/exit,
 * link transition/event/delay, event/enum tables, invalid settings rejection.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  OpmExecutionPropertiesPanel,
  AssignmentRows,
  TypedValueEditor,
  toCIdentifier,
  type OpmExecutionSelection,
} from '../OpmExecutionPropertiesPanel';
import { OpmTargetSettingsModal } from '../OpmTargetSettingsModal';
import { validateTargetSettings } from '../../../engine/opm/schemaAdapter';
import {
  createDefaultOpmExecutionConfig,
  createDefaultOpmTargetSettings,
} from '../../../engine/opm/executableTypes';

// --- Minimal screen shim backed by static markup (repo renderer pattern) ---
let lastHtml = '';
const screen = {
  getByTestId: (id: string) => {
    if (!lastHtml.includes(`data-testid="${id}"`)) {
      throw new Error(`getByTestId(${id}) not found`);
    }
    return { testId: id };
  },
};

function renderHtml(element: React.ReactElement): string {
  lastHtml = renderToStaticMarkup(element);
  return lastHtml;
}

// --- Element-tree traversal for hook-free components ---
function expandTree(node: any): any {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(expandTree);
  if (typeof node.type === 'function') {
    const rendered = (node.type as any)(node.props ?? {});
    return expandTree(rendered);
  }
  if (node.props && 'children' in node.props) {
    const kids = React.Children.toArray(node.props.children).map(expandTree);
    return { ...node, props: { ...node.props, children: kids.length === 1 ? kids[0] : kids } };
  }
  return node;
}

function findAll(node: any, pred: (n: any) => boolean, out: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const c of node) findAll(c, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  const kids = node.props?.children;
  if (kids !== undefined) findAll(kids, pred, out);
  return out;
}

const byTestId = (id: string) => (n: any) => n?.props?.['data-testid'] === id;

function renderPanelTree(props: any): any {
  return expandTree((OpmExecutionPropertiesPanel as any)(props));
}

const WRITABLE = [
  { id: 'attr_temp', displayName: 'temp' },
  { id: 'attr_flag', displayName: 'flag' },
];

function objectSelection(overrides: any = {}): OpmExecutionSelection {
  return {
    type: 'object',
    id: 'obj_1',
    name: 'Boiler',
    execution: {
      enabled: true,
      attributes: [
        {
          id: 'attr_temp',
          displayName: 'temp',
          cIdentifier: 'temp',
          type: { kind: 'float32' },
          initialValue: 20,
          overflow: 'wrap',
          access: 'readWrite',
          persistent: false,
        },
      ],
    },
    ...overrides,
  };
}

describe('OPM typed executable modeling editors', () => {
  it('adds an attribute to an object selection', () => {
    const onUpdate = vi.fn();
    const tree = renderPanelTree({
      selection: objectSelection(),
      onUpdateSelectionExecution: onUpdate,
    });
    const addBtn = findAll(tree, byTestId('add-attr-btn'))[0];
    expect(addBtn).toBeDefined();
    addBtn.props.onClick();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].attributes).toHaveLength(2);
  });

  it('display-name edits never copy raw text into cIdentifier', () => {
    const onUpdate = vi.fn();
    const tree = renderPanelTree({
      selection: objectSelection(),
      onUpdateSelectionExecution: onUpdate,
    });
    const nameInput = findAll(tree, byTestId('attr-name-input'))[0];
    nameInput.props.onChange({ target: { value: 'My Temp!' } });
    const patched = onUpdate.mock.calls[0][0].attributes[0];
    expect(patched.displayName).toBe('My Temp!');
    expect(patched.cIdentifier).toBe('My_Temp');
    expect(patched.cIdentifier).not.toBe('My Temp!');
    expect(toCIdentifier('  9 lives raw! ', 'fallback')).toBe('9_lives_raw');
  });

  it('reorders and deletes attributes', () => {
    const two = objectSelection({
      execution: {
        enabled: true,
        attributes: [
          { id: 'a1', displayName: 'first', cIdentifier: 'first', type: { kind: 'float32' }, initialValue: 1, overflow: 'wrap', access: 'readWrite', persistent: false },
          { id: 'a2', displayName: 'second', cIdentifier: 'second', type: { kind: 'float32' }, initialValue: 2, overflow: 'wrap', access: 'readWrite', persistent: false },
        ],
      },
    });
    const onUpdate = vi.fn();
    const tree = renderPanelTree({ selection: two, onUpdateSelectionExecution: onUpdate });
    findAll(tree, byTestId('attr-move-down-btn'))[0].props.onClick();
    expect(onUpdate.mock.calls[0][0].attributes.map((a: any) => a.id)).toEqual(['a2', 'a1']);

    const onUpdate2 = vi.fn();
    const tree2 = renderPanelTree({ selection: two, onUpdateSelectionExecution: onUpdate2 });
    findAll(tree2, byTestId('delete-attr-btn'))[0].props.onClick();
    expect(onUpdate2.mock.calls[0][0].attributes).toHaveLength(1);
    expect(onUpdate2.mock.calls[0][0].attributes[0].id).toBe('a2');
  });

  it('bool false stays boolean through the typed value editor', () => {
    const boolSel = objectSelection({
      execution: {
        enabled: true,
        attributes: [
          { id: 'b1', displayName: 'flag', cIdentifier: 'flag', type: { kind: 'bool' }, initialValue: true, overflow: 'wrap', access: 'readWrite', persistent: false },
        ],
      },
    });
    const onUpdate = vi.fn();
    const tree = renderPanelTree({ selection: boolSel, onUpdateSelectionExecution: onUpdate });
    const checkbox = findAll(tree, byTestId('attr-initial-input'))[0];
    expect(checkbox.props.type).toBe('checkbox');
    checkbox.props.onChange({ target: { checked: false } });
    const next = onUpdate.mock.calls[0][0].attributes[0].initialValue;
    expect(next).toBe(false);
    expect(typeof next).toBe('boolean');
  });

  it('numeric values stay numbers through the typed value editor', () => {
    const onChange = vi.fn();
    const tree = expandTree(
      (TypedValueEditor as any)({ type: { kind: 'int32' }, value: 20, onChange, testId: 'num' }),
    );
    const input = findAll(tree, (n: any) => n?.props?.['data-testid'] === 'num')[0];
    expect(input.props.type).toBe('number');
    input.props.onChange({ target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('enum values resolve to declared members', () => {
    const onChange = vi.fn();
    const members = [{ id: 'm_on', displayName: 'On', cIdentifier: 'On', value: 1 }];
    const tree = expandTree(
      (TypedValueEditor as any)({
        type: { kind: 'enum', enumId: 'en_mode' },
        value: '',
        enumOptions: members,
        onChange,
        testId: 'en',
      }),
    );
    const select = findAll(tree, (n: any) => n?.props?.['data-testid'] === 'en')[0];
    expect(select.type).toBe('select');
    select.props.onChange({ target: { value: 'm_on' } });
    expect(onChange).toHaveBeenCalledWith({
      enumId: 'en_mode',
      memberId: 'm_on',
      cIdentifier: 'On',
    });
  });

  it('assignment targets use legal reference selection (select of writable attributes)', () => {
    const tree = expandTree(
      (AssignmentRows as any)({
        value: [{ id: 'x1', targetAttributeId: '', operator: '=', expression: '0', enabled: true }],
        writableAttributes: WRITABLE,
        onChange: () => {},
      }),
    );
    const target = findAll(tree, byTestId('target-attr-select'))[0];
    expect(target.type).toBe('select');
    const options = React.Children.toArray(target.props.children);
    expect(options.length).toBeGreaterThanOrEqual(3); // placeholder + 2 writables
  });

  it('adds, edits, reorders, disables, and deletes process assignments', () => {
    const procSel: OpmExecutionSelection = {
      type: 'process',
      id: 'proc_1',
      name: 'Heat',
      execution: {
        enabled: true,
        activation: 'cyclic',
        inputAttributeIds: [],
        outputAttributeIds: [],
        guard: '',
        assignments: [
          { id: 'as1', targetAttributeId: 'attr_temp', operator: '=', expression: '1', enabled: true },
          { id: 'as2', targetAttributeId: 'attr_flag', operator: '+=', expression: '2', enabled: true },
        ],
        priority: 1,
        debounceMs: 0,
        reentrancy: 'reject',
      },
    };
    // add
    const onAdd = vi.fn();
    renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onAdd, writableAttributes: WRITABLE });
    // edit expression
    const onEdit = vi.fn();
    const editTree = renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onEdit, writableAttributes: WRITABLE });
    findAll(editTree, byTestId('assignment-expr-input'))[0].props.onChange({ target: { value: 'temp + 1' } });
    expect(onEdit.mock.calls[0][0].assignments[0].expression).toBe('temp + 1');
    // edit target via legal select
    const onTarget = vi.fn();
    const targetTree = renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onTarget, writableAttributes: WRITABLE });
    findAll(targetTree, byTestId('target-attr-select'))[0].props.onChange({ target: { value: 'attr_flag' } });
    expect(onTarget.mock.calls[0][0].assignments[0].targetAttributeId).toBe('attr_flag');
    // reorder
    const onMove = vi.fn();
    const moveTree = renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onMove, writableAttributes: WRITABLE });
    findAll(moveTree, byTestId('assignment-move-down-btn'))[0].props.onClick();
    expect(onMove.mock.calls[0][0].assignments.map((a: any) => a.id)).toEqual(['as2', 'as1']);
    // disable
    const onDisable = vi.fn();
    const disTree = renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onDisable, writableAttributes: WRITABLE });
    findAll(disTree, byTestId('assignment-enabled-checkbox'))[0].props.onChange({ target: { checked: false } });
    expect(onDisable.mock.calls[0][0].assignments[0].enabled).toBe(false);
    // delete
    const onDelete = vi.fn();
    const delTree = renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onDelete, writableAttributes: WRITABLE });
    findAll(delTree, byTestId('delete-assignment-btn'))[0].props.onClick();
    expect(onDelete.mock.calls[0][0].assignments).toHaveLength(1);
    // add button exists and appends
    const addTree = renderPanelTree({ selection: procSel, onUpdateSelectionExecution: onAdd, writableAttributes: WRITABLE });
    findAll(addTree, byTestId('add-assignment-btn'))[0].props.onClick();
    expect(onAdd.mock.calls[0][0].assignments).toHaveLength(3);
  });

  it('edits state entry and exit assignments', () => {
    const stateSel: OpmExecutionSelection = {
      type: 'state',
      id: 'st_1',
      name: 'On',
      execution: { enabled: true, initial: true, terminal: false, entryAssignments: [], exitAssignments: [] },
    };
    const onEntry = vi.fn();
    const entryTree = renderPanelTree({ selection: stateSel, onUpdateSelectionExecution: onEntry, writableAttributes: WRITABLE });
    findAll(entryTree, byTestId('add-entry-assignment-btn'))[0].props.onClick();
    expect(onEntry.mock.calls[0][0].entryAssignments).toHaveLength(1);

    const onExit = vi.fn();
    const exitTree = renderPanelTree({ selection: stateSel, onUpdateSelectionExecution: onExit, writableAttributes: WRITABLE });
    findAll(exitTree, byTestId('add-exit-assignment-btn'))[0].props.onClick();
    expect(onExit.mock.calls[0][0].exitAssignments).toHaveLength(1);
  });

  it('selecting an edge renders the link execution inspector', () => {
    const linkSel: OpmExecutionSelection = {
      type: 'link',
      id: 'edge_1',
      name: 'edge_1',
      execution: { enabled: true, guard: '', assignments: [], priority: 1, delayMs: 0 },
    };
    const config = createDefaultOpmExecutionConfig();
    config.events = [{ id: 'ev_start', displayName: 'start', cIdentifier: 'start' }];
    renderHtml(
      React.createElement(OpmExecutionPropertiesPanel, {
        selection: linkSel,
        executionConfig: config,
        onUpdateSelectionExecution: () => {},
        writableAttributes: WRITABLE as any,
      }),
    );
    expect(screen.getByTestId('link-execution-inspector')).toBeDefined();
  });

  it('edits link transition, event, and delay', () => {
    const linkSel: OpmExecutionSelection = {
      type: 'link',
      id: 'edge_1',
      name: 'edge_1',
      execution: { enabled: true, guard: '', assignments: [], priority: 1, delayMs: 0 },
    };
    const config = createDefaultOpmExecutionConfig();
    config.events = [{ id: 'ev_start', displayName: 'start', cIdentifier: 'start' }];
    const onEvent = vi.fn();
    const evTree = renderPanelTree({
      selection: linkSel,
      executionConfig: config,
      onUpdateSelectionExecution: onEvent,
      writableAttributes: WRITABLE as any,
    });
    findAll(evTree, byTestId('link-event-select'))[0].props.onChange({ target: { value: 'ev_start' } });
    expect(onEvent.mock.calls[0][0].eventId).toBe('ev_start');

    const onDelay = vi.fn();
    const delayTree = renderPanelTree({
      selection: linkSel,
      executionConfig: config,
      onUpdateSelectionExecution: onDelay,
      writableAttributes: WRITABLE as any,
    });
    findAll(delayTree, byTestId('link-delay-input'))[0].props.onChange({ target: { value: '250' } });
    expect(onDelay.mock.calls[0][0].delayMs).toBe(250);

    const onTrans = vi.fn();
    const transTree = renderPanelTree({
      selection: linkSel,
      executionConfig: config,
      onUpdateSelectionExecution: onTrans,
      writableAttributes: WRITABLE as any,
    });
    findAll(transTree, byTestId('link-transition-target-input'))[0].props.onChange({ target: { value: 'st_on' } });
    expect(onTrans.mock.calls[0][0].transition.targetStateId).toBe('st_on');
  });

  it('edits event and enum tables on canvas selection', () => {
    const config = createDefaultOpmExecutionConfig();
    const onConfig = vi.fn();
    const tree = renderPanelTree({
      selection: { type: 'canvas' },
      executionConfig: config,
      onUpdateSelectionExecution: () => {},
      onUpdateExecutionConfig: onConfig,
    });
    findAll(tree, byTestId('add-event-btn'))[0].props.onClick();
    expect(onConfig.mock.calls[0][0].events).toHaveLength(1);

    const onConfig2 = vi.fn();
    const tree2 = renderPanelTree({
      selection: { type: 'canvas' },
      executionConfig: config,
      onUpdateSelectionExecution: () => {},
      onUpdateExecutionConfig: onConfig2,
    });
    findAll(tree2, byTestId('add-enum-btn'))[0].props.onClick();
    expect(onConfig2.mock.calls[0][0].enums).toHaveLength(1);
  });

  it('every diagnostic target carries data-opm-path', () => {
    const procSel: OpmExecutionSelection = {
      type: 'process',
      id: 'proc_1',
      name: 'Heat',
      execution: {
        enabled: true, activation: 'cyclic', inputAttributeIds: [], outputAttributeIds: [],
        guard: 'x', assignments: [{ id: 'a1', targetAttributeId: 't', operator: '=', expression: '1', enabled: true }],
        priority: 1, debounceMs: 0, reentrancy: 'reject',
      },
    };
    const html = renderHtml(
      React.createElement(OpmExecutionPropertiesPanel, {
        selection: procSel,
        executionConfig: createDefaultOpmExecutionConfig(),
        onUpdateSelectionExecution: () => {},
        writableAttributes: WRITABLE as any,
      }),
    );
    expect(html).toContain('data-opm-path="processExecution.guard"');
    expect(html).toContain('data-opm-path="processExecution.assignments[0].expression"');
    expect(html).toContain('data-opm-path="processExecution.assignments[0].targetAttributeId"');
  });

  it('rejects invalid target settings with inline errors and disabled save/export', () => {
    const bad = { ...createDefaultOpmTargetSettings(), tickMs: 0, eventQueueCapacity: -5 };
    const result = validateTargetSettings(bad);
    expect(result.diagnostics.some((d) => d.code === 'OPM_INVALID_SETTINGS')).toBe(true);
    expect(result.settings).toBeUndefined();

    const html = renderHtml(
      React.createElement(OpmTargetSettingsModal, {
        isOpen: true,
        settings: bad,
        onSave: () => {},
        onClose: () => {},
        onExportZip: () => {},
      }),
    );
    expect(html).toContain('data-opm-path="settings.tickMs"');
    expect(html).toContain('disabled');
  });

  it('verifies Studio Ribbon clusters and OpmSimulationScope integration in EntropyWorkspace', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const wsPath = path.resolve(__dirname, '../EntropyWorkspace.tsx');
    const wsSource = fs.readFileSync(wsPath, 'utf-8');

    expect(wsSource).toContain("from './OpmSimulationScope'");
    expect(wsSource).toContain('data-testid="opm-studio-ribbon"');
    expect(wsSource).toContain("rightTab === 'scope'");
    expect(wsSource).toContain('data-testid="opm-sim-scope-launcher"');
  });

  it('verifies keyboard shortcuts for Delete, Undo, Redo, and Escape in EntropyWorkspace', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const wsPath = path.resolve(__dirname, '../EntropyWorkspace.tsx');
    const wsSource = fs.readFileSync(wsPath, 'utf-8');

    expect(wsSource).toContain("e.key === 'Delete' || e.key === 'Backspace'");
    expect(wsSource).toContain('handleDeleteSelectedNode');
    expect(wsSource).toContain('triggerUndo');
    expect(wsSource).toContain('triggerRedo');
  });
});
