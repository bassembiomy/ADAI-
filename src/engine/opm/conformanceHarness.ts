/**
 * OPM conformance harness: canonical TypeScript scenario runner and
 * snapshot comparator for differential parity against the C runtime.
 *
 * Comparison discipline (strict, no weakening):
 * - int32/uint32/bool/enum/state/ID fields: exact equality. Enum values are
 *   normalized to their numeric member value on both sides first (the TS
 *   runtime carries enum initial values as member-id strings, the C runtime
 *   as integers).
 * - float32 fields: bit-exact comparison after float32 rounding (handles
 *   -0 vs +0 distinctly, unlike `===`).
 * - diagnostics: compared as multisets of (code, severity); message text and
 *   source paths are implementation-defined wording and excluded.
 * - transitions: compared order-insensitively (sorted by owner/from/to/link);
 *   every other list field (queued/fired/blocked/traversed/committed) is
 *   order-sensitive and compared exactly.
 * - stateTimersMs: compared per state with absent entries treated as 0 (the
 *   TS runtime only materializes entries for states it has touched).
 */

import type { OpmStepSnapshot, OpmDiagnostic } from './executableTypes';
import type { ExecutableOpmModel } from './pipeline';
import type {
  OpmConformanceResult,
  OpmConformanceScenario,
  OpmSnapshotDiff,
} from './conformanceTypes';
import {
  createOpmRuntime,
  stepOpmRuntime,
  dispatchOpmEvent,
  resetOpmRuntime,
} from './runtime';

export function runTypescriptScenario(scenario: OpmConformanceScenario): OpmConformanceResult {
  const runtime = createOpmRuntime(scenario.model);
  const snapshots: OpmStepSnapshot[] = [];
  for (const step of scenario.steps) {
    if (step.resetBeforeStep) {
      resetOpmRuntime(runtime);
    }
    for (const [key, value] of Object.entries(step.inputValues ?? {})) {
      runtime.ioInputs[key] = value;
    }
    const stepDiagnostics: OpmDiagnostic[] = [];
    for (const eventId of step.dispatchEventIds ?? []) {
      dispatchOpmEvent(runtime, eventId, stepDiagnostics);
    }
    const result = stepOpmRuntime(runtime, step.deltaMs);
    snapshots.push({
      stepIndex: result.stepIndex,
      timeMs: result.timeMs,
      status: result.status,
      lifecycle: result.lifecycle,
      finished: result.finished,
      values: { ...result.values },
      activeStates: { ...result.activeStates },
      queuedEventIds: [...result.queuedEventIds],
      stateTimersMs: { ...result.stateTimersMs },
      processTimersMs: { ...result.processTimersMs },
      firedProcessIds: [...result.firedProcessIds],
      blockedProcessIds: [...result.blockedProcessIds],
      traversedLinkIds: [...result.traversedLinkIds],
      committedWriteIds: [...result.committedWriteIds],
      transitions: result.transitions.map(t => ({ ...t })),
      diagnostics: [...stepDiagnostics, ...result.diagnostics],
    });
  }
  return { snapshots, stdout: '' };
}

function float32Bits(value: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return view.getUint32(0, false);
}

/** Normalize an enum-typed snapshot value to its numeric member value. */
function normalizeEnumValue(
  value: boolean | number | string | undefined,
  enumId: string,
  model: ExecutableOpmModel,
): number | string {
  const def = model.enums.find(e => e.id === enumId);
  if (!def) return value as number | string;
  if (typeof value === 'string') {
    const member = def.members.find(m => m.id === value || m.cIdentifier === value);
    if (member) return member.value;
    return value;
  }
  if (typeof value === 'number') return Math.trunc(value);
  return String(value);
}

function diffValue(
  diffs: OpmSnapshotDiff[],
  stepPosition: number,
  stepIndex: number,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  const e = JSON.stringify(expected) ?? 'undefined';
  const a = JSON.stringify(actual) ?? 'undefined';
  if (e !== a) {
    diffs.push({ stepPosition, stepIndex, field, expected: e, actual: a });
  }
}

function diffStringList(
  diffs: OpmSnapshotDiff[],
  stepPosition: number,
  stepIndex: number,
  field: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  if (expected.length !== actual.length || expected.some((v, i) => v !== actual[i])) {
    diffs.push({
      stepPosition,
      stepIndex,
      field,
      expected: JSON.stringify(expected),
      actual: JSON.stringify(actual),
    });
  }
}

/**
 * Compare expected (TypeScript) snapshots against actual (C) snapshots for
 * the same scenario and model. Returns an empty array on exact parity.
 */
export function compareOpmSnapshots(
  expected: readonly OpmStepSnapshot[],
  actual: readonly OpmStepSnapshot[],
  model: ExecutableOpmModel,
  expectedFingerprint?: string,
): OpmSnapshotDiff[] {
  const diffs: OpmSnapshotDiff[] = [];
  if (expectedFingerprint !== undefined && model.fingerprint !== expectedFingerprint) {
    diffs.push({
      stepPosition: -1,
      stepIndex: -1,
      field: 'modelFingerprint',
      expected: expectedFingerprint,
      actual: model.fingerprint,
    });
  }
  if (expected.length !== actual.length) {
    diffs.push({
      stepPosition: -1,
      stepIndex: -1,
      field: 'snapshots.length',
      expected: String(expected.length),
      actual: String(actual.length),
    });
    return diffs;
  }
  const attrByKey = new Map<string, (typeof model.objects)[number]['attributes'][number]>();
  for (const obj of model.objects) {
    for (const attr of obj.attributes) {
      attrByKey.set(attr.cIdentifier, attr);
      if (!attrByKey.has(attr.id)) {
        attrByKey.set(attr.id, attr);
      }
    }
  }
  const objectsWithStates = model.objects.filter(o => (o.stateIds?.length ?? 0) > 0);

  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const a = actual[i];
    const pos = i;
    const idx = e.stepIndex;
    diffValue(diffs, pos, idx, 'stepIndex', e.stepIndex, a.stepIndex);
    diffValue(diffs, pos, idx, 'timeMs', e.timeMs, a.timeMs);
    diffValue(diffs, pos, idx, 'status', e.status, a.status);
    diffValue(diffs, pos, idx, 'lifecycle', e.lifecycle, a.lifecycle);
    diffValue(diffs, pos, idx, 'finished', e.finished, a.finished);

    for (const obj of model.objects) {
      for (const attr of obj.attributes) {
        const field = `values.${attr.cIdentifier}`;
        const rawE = (e.values as Record<string, boolean | number | string>)[
          attr.cIdentifier
        ] ?? (e.values as Record<string, boolean | number | string>)[attr.id];
        const rawA = (a.values as Record<string, boolean | number | string>)[attr.cIdentifier];
        const kind = attr.type.kind;
        if (kind === 'float32') {
          const bitsE =
            typeof rawE === 'number' ? float32Bits(rawE) : `typeof:${typeof rawE}:${String(rawE)}`;
          const bitsA =
            typeof rawA === 'number' ? float32Bits(rawA) : `typeof:${typeof rawA}:${String(rawA)}`;
          if (bitsE !== bitsA) {
            diffs.push({
              stepPosition: pos,
              stepIndex: idx,
              field,
              expected: `f32bits:${String(bitsE)}`,
              actual: `f32bits:${String(bitsA)}`,
            });
          }
        } else if (kind === 'enum') {
          const normE = normalizeEnumValue(
            rawE as boolean | number | string | undefined,
            (attr.type as { kind: 'enum'; enumId: string }).enumId,
            model,
          );
          const normA = normalizeEnumValue(
            rawA as boolean | number | string | undefined,
            (attr.type as { kind: 'enum'; enumId: string }).enumId,
            model,
          );
          diffValue(diffs, pos, idx, field, normE, normA);
        } else {
          diffValue(diffs, pos, idx, field, rawE ?? null, rawA ?? null);
        }
      }
    }

    for (const obj of objectsWithStates) {
      diffValue(
        diffs,
        pos,
        idx,
        `activeStates.${obj.id}`,
        (e.activeStates as Record<string, string>)[obj.id] ?? null,
        (a.activeStates as Record<string, string>)[obj.id] ?? null,
      );
    }
    diffStringList(diffs, pos, idx, 'queuedEventIds', e.queuedEventIds, a.queuedEventIds);

    for (const st of model.states) {
      diffValue(
        diffs,
        pos,
        idx,
        `stateTimersMs.${st.id}`,
        (e.stateTimersMs as Record<string, number>)[st.id] ?? 0,
        (a.stateTimersMs as Record<string, number>)[st.id] ?? 0,
      );
    }
    for (const proc of model.processes) {
      diffValue(
        diffs,
        pos,
        idx,
        `processTimersMs.${proc.id}`,
        (e.processTimersMs as Record<string, number>)[proc.id] ?? null,
        (a.processTimersMs as Record<string, number>)[proc.id] ?? null,
      );
    }
    diffStringList(diffs, pos, idx, 'firedProcessIds', e.firedProcessIds, a.firedProcessIds);
    diffStringList(diffs, pos, idx, 'blockedProcessIds', e.blockedProcessIds, a.blockedProcessIds);
    diffStringList(diffs, pos, idx, 'traversedLinkIds', e.traversedLinkIds, a.traversedLinkIds);
    diffStringList(diffs, pos, idx, 'committedWriteIds', e.committedWriteIds, a.committedWriteIds);

    const sortKey = (t: { ownerObjectId: string; fromStateId?: string; toStateId: string; linkId?: string }): string =>
      `${t.ownerObjectId}|${t.fromStateId ?? ''}|${t.toStateId}|${t.linkId ?? ''}`;
    const eTrans = [...e.transitions].map(t => ({ ...t })).sort((x, y) =>
      sortKey(x) < sortKey(y) ? -1 : sortKey(x) > sortKey(y) ? 1 : 0,
    );
    const aTrans = [...a.transitions].map(t => ({ ...t })).sort((x, y) =>
      sortKey(x) < sortKey(y) ? -1 : sortKey(x) > sortKey(y) ? 1 : 0,
    );
    diffValue(diffs, pos, idx, 'transitions', eTrans, aTrans);

    const diagKey = (d: { code: string; severity: string }): string => `${d.code}|${d.severity}`;
    const eDiags = e.diagnostics.map(d => diagKey(d)).sort();
    const aDiags = a.diagnostics.map(d => diagKey(d)).sort();
    diffValue(diffs, pos, idx, 'diagnostics', eDiags, aDiags);
  }
  return diffs;
}
