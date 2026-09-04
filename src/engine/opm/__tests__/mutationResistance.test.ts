import { describe, it, expect } from 'vitest';
import { createDefaultOpmExecutionConfig } from '../executableTypes';
import type { OpmStepSnapshot } from '../executableTypes';
import type { ExecutableOpmModel } from '../pipeline';
import type { OpmConformanceScenario } from '../conformanceTypes';
import { runTypescriptScenario, compareOpmSnapshots } from '../conformanceHarness';
import { computeModelFingerprint } from '../canonicalHash';
import type { TypedExpressionIr } from '../expressionCompiler';

function boolLit(value: boolean): TypedExpressionIr {
  return { kind: 'literal', type: { kind: 'bool' }, value } as TypedExpressionIr;
}

function intLit(value: number): TypedExpressionIr {
  return { kind: 'literal', type: { kind: 'int32' }, value } as TypedExpressionIr;
}

function src(elementId: string, propertyPath = 'assignments') {
  return { elementId, propertyPath };
}

function intAttr(id: string, initialValue: number) {
  return {
    id,
    displayName: id,
    cIdentifier: id,
    type: { kind: 'int32' as const },
    initialValue,
    overflow: 'wrap' as const,
    access: 'readWrite' as const,
    persistent: false,
  };
}

function cyclicWriter(
  id: string,
  order: number,
  targetKey: string,
  value: number,
  priority: number,
) {
  return {
    enabled: true,
    id,
    name: id,
    cIdentifier: id,
    physical: false,
    order,
    source: src(id, 'name'),
    activation: 'cyclic' as const,
    inputAttributeIds: [],
    outputAttributeIds: [targetKey],
    guardText: '',
    assignments: [
      {
        id: `${id}_a`,
        targetAttributeId: targetKey,
        resolvedTargetCIdentifier: targetKey,
        operator: '=' as const,
        expressionText: String(value),
        expressionIr: intLit(value),
        enabled: true,
        source: src(id),
      },
    ],
    priority,
    periodMs: 10,
    debounceMs: 0,
    reentrancy: 'reject' as const,
  };
}

/**
 * Discrimination model: two writers contend on `shared` at different
 * priorities, two equal-priority writers fire every step, an unfired
 * triggered process owns a guard-true result link, two transitions compete
 * for one owner at different priorities, and exit/entry assignments disagree
 * (exit=1, entry=2) so ordering is observable.
 */
function buildDiscriminationModel(): ExecutableOpmModel {
  const config = createDefaultOpmExecutionConfig();
  config.events = [
    { id: 'ev_go', displayName: 'Go', cIdentifier: 'ev_go' },
    { id: 'ev_extra', displayName: 'Extra', cIdentifier: 'ev_extra' },
  ];
  return {
    executionEnabled: true,
    fingerprint: 'mutation-discrimination',
    settings: config.settings,
    objects: [
      {
        id: 'obj_m',
        name: 'M',
        cIdentifier: 'M',
        physical: false,
        order: 0,
        source: src('obj_m', 'name'),
        attributes: [
          intAttr('shared', 0),
          intAttr('a', 0),
          intAttr('b', 0),
          intAttr('output', 0),
          intAttr('out', 0),
        ],
        stateIds: ['st_a', 'st_b', 'st_c'],
        initialStateId: 'st_a',
      },
    ],
    states: [
      {
        id: 'st_a', name: 'A', cIdentifier: 'A', parentObjectId: 'obj_m',
        isInitial: true, isTerminal: false, order: 0, source: src('st_a', 'name'),
        entryAssignments: [],
        exitAssignments: [
          {
            id: 'exit_a', targetAttributeId: 'out', resolvedTargetCIdentifier: 'out',
            operator: '=' as const, expressionText: '1', expressionIr: intLit(1),
            enabled: true, source: src('st_a'),
          },
        ],
      },
      {
        id: 'st_b', name: 'B', cIdentifier: 'B', parentObjectId: 'obj_m',
        isInitial: false, isTerminal: false, order: 1, source: src('st_b', 'name'),
        entryAssignments: [
          {
            id: 'entry_b', targetAttributeId: 'out', resolvedTargetCIdentifier: 'out',
            operator: '=' as const, expressionText: '2', expressionIr: intLit(2),
            enabled: true, source: src('st_b'),
          },
        ],
        exitAssignments: [],
      },
      {
        id: 'st_c', name: 'C', cIdentifier: 'C', parentObjectId: 'obj_m',
        isInitial: false, isTerminal: false, order: 2, source: src('st_c', 'name'),
        entryAssignments: [],
        exitAssignments: [],
      },
    ],
    processes: [
      cyclicWriter('p_low', 0, 'shared', 1, 1),
      cyclicWriter('p_high', 3, 'shared', 2, 5),
      cyclicWriter('p_a', 1, 'a', 10, 1),
      cyclicWriter('p_b', 2, 'b', 20, 1),
      {
        enabled: true, id: 'p_never', name: 'Never', cIdentifier: 'Never',
        physical: false, order: 4, source: src('p_never', 'name'),
        activation: 'triggered' as const, inputAttributeIds: [], outputAttributeIds: [],
        guardText: '', assignments: [], priority: 1, debounceMs: 0,
        reentrancy: 'reject' as const,
      },
    ],
    links: [
      {
        enabled: true, id: 'link_result2', type: 'result',
        sourceId: 'p_never', targetId: 'obj_m', order: 0,
        source: src('link_result2', 'guard'), guardText: '', guardIr: boolLit(true),
        assignments: [
          {
            id: 'link_result2_a', targetAttributeId: 'output',
            resolvedTargetCIdentifier: 'output', operator: '=' as const,
            expressionText: '99', expressionIr: intLit(99),
            enabled: true, source: src('link_result2'),
          },
        ],
        priority: 1, delayMs: 0,
      },
      {
        enabled: true, id: 'link_hi', type: 'trigger', sourceId: 'st_a', targetId: 'st_b',
        order: 1, source: src('link_hi', 'guard'), guardText: '', eventId: 'ev_go',
        assignments: [],
        transition: { ownerObjectId: 'obj_m', sourceStateId: 'st_a', targetStateId: 'st_b' },
        priority: 9, delayMs: 0,
      },
      {
        enabled: true, id: 'link_lo', type: 'trigger', sourceId: 'st_a', targetId: 'st_c',
        order: 2, source: src('link_lo', 'guard'), guardText: '', eventId: 'ev_go',
        assignments: [],
        transition: { ownerObjectId: 'obj_m', sourceStateId: 'st_a', targetStateId: 'st_c' },
        priority: 1, delayMs: 0,
      },
    ],
    events: config.events,
    enums: [],
    symbols: {},
    sourceByNormalizedId: {},
  } as unknown as ExecutableOpmModel;
}

const MODEL = buildDiscriminationModel();
const SCENARIO: OpmConformanceScenario = {
  name: 'mutation-discrimination',
  model: MODEL,
  steps: [
    { deltaMs: 10, dispatchEventIds: ['ev_go', 'ev_go'] },
    { deltaMs: 10 },
    { deltaMs: 10 },
  ],
};

const REFERENCE: readonly OpmStepSnapshot[] = runTypescriptScenario(SCENARIO).snapshots;

function cloneSnapshots(): OpmStepSnapshot[] {
  return JSON.parse(JSON.stringify(REFERENCE)) as OpmStepSnapshot[];
}

function mutable(snap: OpmStepSnapshot): {
  values: Record<string, boolean | number | string>;
  activeStates: Record<string, string>;
  queued: string[];
  fired: string[];
  traversed: string[];
  committed: string[];
} {
  return {
    values: snap.values as Record<string, boolean | number | string>,
    activeStates: snap.activeStates as Record<string, string>,
    queued: snap.queuedEventIds as string[],
    fired: snap.firedProcessIds as string[],
    traversed: snap.traversedLinkIds as string[],
    committed: snap.committedWriteIds as string[],
  };
}

/**
 * Wrong-runtime variants: each simulates exactly one broken semantic while
 * keeping every other field canonical, so a non-empty diff proves the
 * comparator is sensitive to that semantic class.
 */
function runMutant(name: string): OpmStepSnapshot[] {
  const snaps = cloneSnapshots();
  const first = mutable(snaps[0]);
  switch (name) {
    case 'scheduler-order': {
      // Wrong scheduler: FIFO/insertion order instead of priority-then-order.
      const target = snaps.find(s => s.firedProcessIds.length >= 2);
      expect(target, 'discrimination scenario must fire >=2 processes').toBeDefined();
      (target!.firedProcessIds as string[]).reverse();
      return snaps;
    }
    case 'reverse-priority': {
      // Wrong conflict resolution: lowest priority wins on `shared`.
      expect(first.values.shared).toBe(2);
      first.values.shared = 1;
      return snaps;
    }
    case 'uncoupled-result-link': {
      // Wrong causality: guard-true result link executes although p_never never fired.
      expect(snaps[0].traversedLinkIds).not.toContain('link_result2');
      first.traversed.push('link_result2');
      first.committed.push('output');
      first.values.output = 99;
      return snaps;
    }
    case 'event-consumption': {
      // Wrong consumption: over-consumes the retained duplicate ev_go.
      const target = snaps.find(s => s.queuedEventIds.length > 0);
      expect(target, 'discrimination scenario must retain a queued event').toBeDefined();
      (target!.queuedEventIds as string[]).length = 0;
      return snaps;
    }
    case 'lvalue-mapping': {
      // Wrong lvalue: write lands on the raw editor id, canonical C identifier stays stale.
      expect(first.values.shared).toBe(2);
      first.values.shared = 0;
      return snaps;
    }
    case 'transition-priority': {
      // Wrong arbitration: low-priority transition wins over link_hi.
      expect(first.activeStates.obj_m).toBe('st_b');
      first.activeStates.obj_m = 'st_c';
      return snaps;
    }
    case 'exit-entry-order': {
      // Wrong ordering: entry-before-exit lets exit overwrite entry (out=1, not 2).
      expect(first.values.out).toBe(2);
      first.values.out = 1;
      return snaps;
    }
    default:
      throw new Error(`Unknown mutant: ${name}`);
  }
}

function fingerprintPayload(model: ExecutableOpmModel) {
  return {
    settings: model.settings,
    objects: model.objects,
    states: model.states,
    processes: model.processes,
    links: model.links,
    events: model.events,
    enums: model.enums,
  };
}

describe('OPM mutation resistance (wrong-runtime discrimination)', () => {
  it('reference scenario is internally consistent before mutation', () => {
    expect(REFERENCE).toHaveLength(3);
    expect(compareOpmSnapshots(REFERENCE, REFERENCE, MODEL)).toEqual([]);
    // Canonical ground truths the mutants below invert.
    expect(REFERENCE[0].values.shared).toBe(2);
    expect(REFERENCE[0].values.out).toBe(2);
    expect(REFERENCE[0].activeStates.obj_m).toBe('st_b');
    expect(REFERENCE[0].traversedLinkIds).not.toContain('link_result2');
    expect(REFERENCE[0].values.output).toBe(0);
  });

  it('rejects a wrong scheduler order', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('scheduler-order'), MODEL)).not.toEqual([]);
  });

  it('rejects reversed write-conflict priority', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('reverse-priority'), MODEL)).not.toEqual([]);
  });

  it('rejects an uncoupled result link (source process never fired)', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('uncoupled-result-link'), MODEL)).not.toEqual([]);
  });

  it('rejects wrong event consumption', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('event-consumption'), MODEL)).not.toEqual([]);
  });

  it('rejects a wrong lvalue identifier mapping', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('lvalue-mapping'), MODEL)).not.toEqual([]);
  });

  it('rejects a wrong transition-priority winner', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('transition-priority'), MODEL)).not.toEqual([]);
  });

  it('rejects entry-before-exit state-action ordering', () => {
    expect(compareOpmSnapshots(REFERENCE, runMutant('exit-entry-order'), MODEL)).not.toEqual([]);
  });

  it('rejects a fingerprint that omits the event table', () => {
    const canonicalFingerprint = computeModelFingerprint(fingerprintPayload(MODEL));
    expect(canonicalFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const { events: _omitted, ...withoutEvents } = fingerprintPayload(MODEL);
    void _omitted;
    const fingerprintWithoutEvents = computeModelFingerprint(withoutEvents);
    expect(fingerprintWithoutEvents).not.toBe(canonicalFingerprint);
  });
});
