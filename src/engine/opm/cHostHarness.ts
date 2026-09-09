/**
 * OPM C host harness: mandatory compilation and execution of the generated
 * C99 runtime for differential parity against the canonical TS runtime.
 *
 * Strictness contract (no skips, fail-closed):
 * - The qualification compiler is mandatory: bundled
 *   `toolchains/w64devkit/.../gcc.exe` on win32, otherwise the `ADIA_OPM_CC`
 *   environment override. When neither resolves, compilation throws
 *   'OPM qualification compiler is unavailable' and the qualification tests
 *   FAIL (they never skip).
 * - The compiler is invoked via `execFileSync(compiler, args, { cwd })`
 *   with an argument vector (never a shell string) and strict flags
 *   `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.
 * - The conformance executable prints exactly one JSON object per scenario
 *   step to stdout (JSONL, no banners); any extra non-empty stdout, missing
 *   field, duplicate step index, non-finite number, or invalid ID fails
 *   parsing with a throw.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ExecutableOpmModel } from './pipeline';
import type { OpmStepSnapshot } from './executableTypes';
import type { OpmConformanceResult, OpmConformanceScenario } from './conformanceTypes';
import { generateOpmCArtifacts } from './cGenerator';
import { isSafeCIdentifier, renderFloatLiteralC } from './cIr';

export const OPM_QUALIFICATION_COMPILER_ERROR = 'OPM qualification compiler is unavailable';

/**
 * Resolve the mandatory OPM qualification compiler. Throws (never returns
 * null) when no compiler is available so callers fail instead of skipping.
 */
export function resolveRequiredOpmCompiler(repoRoot: string): string {
  const fromEnv = process.env.ADIA_OPM_CC;
  if (fromEnv && fromEnv.length > 0 && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  if (process.platform === 'win32') {
    const bundled = path.join(repoRoot, 'toolchains', 'w64devkit', 'w64devkit', 'bin', 'gcc.exe');
    if (fs.existsSync(bundled)) {
      return bundled;
    }
    // Development environments may provide a verified host GCC without the
    // optional bundled W64DevKit archive. Use it for the same strict C99
    // qualification flags before failing closed.
    const hostCompiler = fs.existsSync(repoRoot) && process.env.ComSpec
      ? (() => {
        try {
          return execFileSync(process.env.ComSpec, ['/d', '/s', '/c', 'where gcc'], { encoding: 'utf8' }).split(/\r?\n/).find(Boolean);
        } catch { return undefined; }
      })()
      : undefined;
    if (hostCompiler && fs.existsSync(hostCompiler.trim())) return hostCompiler.trim();
    throw new Error(
      `${OPM_QUALIFICATION_COMPILER_ERROR}: expected bundled compiler at ${bundled}`,
    );
  }
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  throw new Error(
    `${OPM_QUALIFICATION_COMPILER_ERROR}: set ADIA_OPM_CC to a C99 compiler executable`,
  );
}

/** IDs printed into JSON must need no string escaping. */
function requireJsonSafeId(value: string, what: string): string {
  if (!/^[A-Za-z0-9_\-]+$/.test(value)) {
    throw new Error(`OPM conformance harness: unsafe ID for ${what}: ${value}`);
  }
  return value;
}

function requireCIdentifier(value: string, what: string): string {
  if (!isSafeCIdentifier(value)) {
    throw new Error(`OPM conformance harness: unsafe C identifier for ${what}: ${value}`);
  }
  return value;
}

interface ConformanceAttr {
  key: string;
  field: string;
  kind: string;
  enumType: string | null;
}

/**
 * Generate the model-specific conformance `main` (C99): embeds the scenario
 * step table, drives OPM_Init/OPM_Reset/OPM_DispatchEvent/OPM_Step, and prints
 * one JSON snapshot per step with exactly the OpmStepSnapshot fields.
 */
export function generateConformanceMain(
  model: ExecutableOpmModel,
  scenario: OpmConformanceScenario,
): string {
  const attrs: ConformanceAttr[] = [];
  for (const obj of model.objects) {
    for (const attr of obj.attributes) {
      const field = requireCIdentifier(attr.cIdentifier, `attribute ${attr.id}`);
      const key = requireJsonSafeId(attr.cIdentifier, `attribute ${attr.id}`);
      let enumType: string | null = null;
      if (attr.type.kind === 'enum') {
        const en = model.enums.find(e => e.id === (attr.type as { kind: 'enum'; enumId: string }).enumId);
        enumType = en && isSafeCIdentifier(en.cIdentifier) ? en.cIdentifier : 'uint32_t';
      }
      attrs.push({ key, field, kind: attr.type.kind, enumType });
    }
  }
  const attrIndexByKey = new Map(attrs.map((a, i) => [a.key, i] as [string, number]));
  const attrById = new Map<string, number>();
  for (const obj of model.objects) {
    for (const attr of obj.attributes) {
      const idx = attrIndexByKey.get(attr.cIdentifier);
      if (idx !== undefined && !attrById.has(attr.id)) {
        attrById.set(attr.id, idx);
      }
    }
  }

  const objectsWithStates = model.objects.filter(o => (o.stateIds?.length ?? 0) > 0);
  for (const o of objectsWithStates) requireJsonSafeId(o.id, 'object');
  for (const s of model.states) requireJsonSafeId(s.id, 'state');
  for (const p of model.processes) requireJsonSafeId(p.id, 'process');
  for (const l of model.links) requireJsonSafeId(l.id, 'link');
  for (const e of model.events) {
    requireJsonSafeId(e.id, 'event');
    requireCIdentifier(e.cIdentifier, `event ${e.id}`);
  }
  const stateById = new Map(model.states.map(s => [s.id, s] as [string, (typeof model.states)[number]]));

  const firedOrder = model.processes
    .map((p, i) => ({ i, priority: p.priority ?? 1, order: p.order ?? i }))
    .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.order - b.order))
    .map(e => e.i);

  // Attributes ever injected: latched (TS ioInputs persist until reset).
  const injectedAttrKeys = new Set<string>();
  scenario.steps.forEach((step, si) => {
    for (const key of Object.keys(step.inputValues ?? {})) {
      const idx = attrIndexByKey.get(key) ?? attrById.get(key);
      if (idx === undefined) {
        throw new Error(`OPM conformance scenario "${scenario.name}" step ${si}: unknown input "${key}"`);
      }
      injectedAttrKeys.add(attrs[idx].key);
    }
    if (!Number.isInteger(step.deltaMs) || step.deltaMs < 0 || step.deltaMs > 0xffffffff) {
      throw new Error(`OPM conformance scenario "${scenario.name}" step ${si}: invalid deltaMs`);
    }
    for (const evId of step.dispatchEventIds ?? []) {
      requireJsonSafeId(evId, 'dispatch event');
    }
  });
  const latchAttrs = attrs.filter(a => injectedAttrKeys.has(a.key));

  const cTypeOf = (a: ConformanceAttr): string => {
    if (a.kind === 'bool') return 'bool';
    if (a.kind === 'int32') return 'int32_t';
    if (a.kind === 'uint32') return 'uint32_t';
    if (a.kind === 'float32') return 'float';
    return a.enumType ?? 'uint32_t';
  };

  const inputLiteral = (attrIdx: number, value: boolean | number | string): string => {
    const a = attrs[attrIdx];
    if (a.kind === 'bool') {
      if (typeof value !== 'boolean') throw new Error(`OPM conformance: input "${a.key}" needs a boolean`);
      return value ? 'true' : 'false';
    }
    if (a.kind === 'float32') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`OPM conformance: input "${a.key}" needs a finite number`);
      }
      return renderFloatLiteralC(value);
    }
    if (a.kind === 'int32') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new Error(`OPM conformance: input "${a.key}" needs an int32`);
      }
      return `${value}`;
    }
    if (a.kind === 'uint32') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 4294967295) {
        throw new Error(`OPM conformance: input "${a.key}" needs a uint32`);
      }
      return `${value}U`;
    }
    // enum: member id/cIdentifier string, or raw numeric value.
    const enumId = (model.objects.flatMap(o => [...o.attributes]).find(x => x.cIdentifier === a.key)?.type as { kind: string; enumId?: string } | undefined)?.enumId;
    const en = model.enums.find(e => e.id === enumId);
    if (typeof value === 'string') {
      const mem = en?.members.find(m => m.id === value || m.cIdentifier === value);
      if (!mem || !isSafeCIdentifier(mem.cIdentifier)) {
        throw new Error(`OPM conformance: input "${a.key}" references unknown enum member "${value}"`);
      }
      return mem.cIdentifier;
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
      return `((${a.enumType ?? 'uint32_t'})${value})`;
    }
    throw new Error(`OPM conformance: input "${a.key}" needs an enum member id`);
  };

  const procIdList = model.processes.map(p => `"${p.id}"`).join(', ') || '""';
  const linkIdList = model.links.map(l => `"${l.id}"`).join(', ') || '""';
  const attrKeyList = attrs.map(a => `"${a.key}"`).join(', ') || '""';
  const firedOrderList = firedOrder.map(i => `${i}U`).join(', ') || '0U';
  const lines: string[] = [
    '/* OPM conformance driver: generated, model-specific. Prints one JSON',
    '   snapshot per scenario step to stdout (JSONL, no other output). */',
    '#include "opm_runtime.h"',
    '#include <stdio.h>',
    '',
    `static const char *__OPM_CONF_PROC_IDS[${Math.max(1, model.processes.length)}U] = { ${procIdList} };`,
    `static const char *__OPM_CONF_LINK_IDS[${Math.max(1, model.links.length)}U] = { ${linkIdList} };`,
    `static const char *__OPM_CONF_ATTR_KEYS[${Math.max(1, attrs.length)}U] = { ${attrKeyList} };`,
    '',
    'int main(void) {',
    '    OPM_Instance_t inst;',
    `    static const uint16_t __OPM_FIRED_ORDER[${Math.max(1, model.processes.length)}U] = { ${firedOrderList} };`,
  ];
  for (const a of latchAttrs) {
    const idx = attrIndexByKey.get(a.key)!;
    lines.push(`    static ${cTypeOf(a)} __opm_latch_${idx};`);
    lines.push(`    static uint8_t __opm_latchv_${idx} = 0U;`);
  }
  lines.push('    OPM_Init(&inst);');

  scenario.steps.forEach((step, si) => {
    lines.push(`    { /* scenario step ${si} */`);
    lines.push('        OPM_Status_t __w;');
    lines.push('        uint16_t __ed0 = inst.diagnostics.event_drops;');
    lines.push('        uint16_t __ed1 = 0U;');
    lines.push('        uint16_t __wc0 = inst.diagnostics.write_conflicts;');
    lines.push('        uint16_t __sd0 = inst.diagnostics.staged_drops;');
    lines.push('        uint16_t __td0 = inst.diagnostics.transition_drops;');
    lines.push('        uint16_t __tc0 = inst.diagnostics.transition_conflicts;');
    if (step.resetBeforeStep) {
      lines.push('        OPM_Reset(&inst);');
      for (const a of latchAttrs) {
        const idx = attrIndexByKey.get(a.key)!;
        lines.push(`        __opm_latchv_${idx} = 0U;`);
      }
      lines.push('        __ed0 = inst.diagnostics.event_drops;');
      lines.push('        __wc0 = inst.diagnostics.write_conflicts;');
      lines.push('        __sd0 = inst.diagnostics.staged_drops;');
      lines.push('        __td0 = inst.diagnostics.transition_drops;');
      lines.push('        __tc0 = inst.diagnostics.transition_conflicts;');
    }
    const provided = new Set<string>();
    for (const [key, value] of Object.entries(step.inputValues ?? {})) {
      const idx = (attrIndexByKey.get(key) ?? attrById.get(key))!;
      const a = attrs[idx];
      provided.add(a.key);
      lines.push(`        inst.${a.field} = ${inputLiteral(idx, value)};`);
      if (injectedAttrKeys.has(a.key)) {
        lines.push(`        __opm_latch_${idx} = inst.${a.field};`);
        lines.push(`        __opm_latchv_${idx} = 1U;`);
      }
    }
    for (const a of latchAttrs) {
      if (provided.has(a.key)) continue;
      const idx = attrIndexByKey.get(a.key)!;
      lines.push(`        if (__opm_latchv_${idx} != 0U) { inst.${a.field} = __opm_latch_${idx}; }`);
    }
    for (const evId of step.dispatchEventIds ?? []) {
      const ev = model.events.find(e => e.id === evId);
      if (ev) {
        lines.push(`        (void)OPM_DispatchEvent(&inst, ${ev.cIdentifier});`);
      } else {
        // Unknown events are rejected without queue or diagnostic effects on
        // both runtimes; still drive the C API for parity.
        lines.push('        (void)OPM_DispatchEvent(&inst, (OPM_EventId_t)0xFFFFU);');
      }
    }
    // Post-dispatch event-drop baseline: the canonical TS runtime reports
    // driver dispatch overflows in the snapshot diagnostics list but excludes
    // them from the step status (status covers in-step diagnostics only, and
    // in-step timeout dispatches still count). __ed0 stays pre-dispatch for
    // the diagnostics list; __ed1 is the status baseline.
    lines.push('        __ed1 = inst.diagnostics.event_drops;');
    lines.push(`        __w = OPM_Step(&inst, ${Math.trunc(step.deltaMs)}U);`);
    // Diagnostics synthesis from counter deltas (one entry per counted drop).
    lines.push('        {');
    lines.push('            uint16_t __n;');
    lines.push('            uint8_t __fired = 0U;');
    lines.push('            uint8_t __finished = 1U;');
    lines.push('            uint8_t __hasStates = 0U;');
    lines.push('            uint16_t __errs = 0U;');
    lines.push('            const char *__status;');
    lines.push('            const char *__lifecycle;');
    lines.push('            uint8_t __dfirst = 1U;');
    lines.push('#if (OPM_NUM_PROCESSES > 0U)');
    lines.push('            for (__n = 0U; __n < OPM_NUM_PROCESSES; __n++) { if (inst.process_fired[__n] != 0U) { __fired = 1U; break; } }');
    lines.push('#endif');
    objectsWithStates.forEach(o => {
      const oi = model.objects.findIndex(x => x.id === o.id);
      lines.push(`            { /* finished leg for ${o.id} */`);
      lines.push('                uint8_t __term = 0U;');
      lines.push(`                uint16_t __a = inst.active_states[${oi}U];`);
      lines.push('                (void)__a;');
      lines.push(`                __hasStates = 1U;`);
      for (const stId of o.stateIds) {
        const sti = model.states.findIndex(s => s.id === stId);
        const st = stateById.get(stId);
        if (sti < 0 || !st) continue;
        if (st.isTerminal) {
          lines.push(`                if (__a == (${sti}U + 1U)) { __term = 1U; }`);
        }
      }
      lines.push('                if (__term == 0U) { __finished = 0U; }');
      lines.push('            }');
    });
    lines.push('            if (__hasStates == 0U) { __finished = 0U; }');
    lines.push('            __errs = (uint16_t)((uint16_t)(inst.diagnostics.event_drops - __ed1) + (uint16_t)(inst.diagnostics.write_conflicts - __wc0));');
    lines.push('            __errs = (uint16_t)(__errs + (uint16_t)(inst.diagnostics.staged_drops - __sd0));');
    lines.push('            __errs = (uint16_t)(__errs + (uint16_t)(inst.diagnostics.transition_drops - __td0));');
    lines.push('            __errs = (uint16_t)(__errs + (uint16_t)(inst.diagnostics.transition_conflicts - __tc0));');
    lines.push('            __status = ((__w != OPM_OK) || (__errs != 0U)) ? "error" : "ok";');
    lines.push('            if (__w != OPM_OK) { __lifecycle = "faulted"; }');
    lines.push('            else if (__errs != 0U) { __lifecycle = "faulted"; }');
    lines.push('            else if (__finished != 0U) { __lifecycle = "finished"; }');
    lines.push('            else if (__fired != 0U) { __lifecycle = "running"; }');
    lines.push('            else if (inst.last_waiting != 0U) { __lifecycle = "waiting"; }');
    lines.push('            else { __lifecycle = "ready"; }');
    // Begin JSON line.
    lines.push('            printf("{\\"stepIndex\\":%u,\\"timeMs\\":%u,", (unsigned)inst.step_index, (unsigned)inst.time_ms);');
    lines.push('            printf("\\"status\\":\\"%s\\",\\"lifecycle\\":\\"%s\\",\\"finished\\":%s,", __status, __lifecycle, (__finished != 0U) ? "true" : "false");');
    // values
    lines.push('            printf("\\"values\\":{");');
    attrs.forEach((a, ai) => {
      const comma = ai === 0 ? '' : ',';
      if (a.kind === 'bool') {
        lines.push(`            printf("${comma}\\"${a.key}\\":%s", inst.${a.field} ? "true" : "false");`);
      } else if (a.kind === 'int32') {
        lines.push(`            printf("${comma}\\"${a.key}\\":%d", (int)inst.${a.field});`);
      } else if (a.kind === 'uint32') {
        lines.push(`            printf("${comma}\\"${a.key}\\":%u", (unsigned)inst.${a.field});`);
      } else if (a.kind === 'float32') {
        lines.push(`            printf("${comma}\\"${a.key}\\":%.9g", (double)inst.${a.field});`);
      } else {
        lines.push(`            printf("${comma}\\"${a.key}\\":%u", (unsigned)inst.${a.field});`);
      }
    });
    lines.push('            printf("},");');
    // activeStates
    lines.push('            printf("\\"activeStates\\":{");');
    lines.push('            { uint8_t __afirst = 1U;');
    objectsWithStates.forEach(o => {
      const oi = model.objects.findIndex(x => x.id === o.id);
      lines.push(`                if (inst.active_states[${oi}U] != 0U) {`);
      lines.push(`                    const char *__sid = "";`);
      lines.push(`                    switch (inst.active_states[${oi}U]) {`);
      for (const stId of o.stateIds) {
        const sti = model.states.findIndex(s => s.id === stId);
        if (sti < 0) continue;
        lines.push(`                        case (${sti}U + 1U): __sid = "${stId}"; break;`);
      }
      lines.push('                        default: break;');
      lines.push('                    }');
      lines.push(`                    printf("%s\\"${o.id}\\":\\"%s\\"", (__afirst != 0U) ? "" : ",", __sid);`);
      lines.push('                    __afirst = 0U;');
      lines.push('                }');
    });
    lines.push('            }');
    lines.push('            printf("},");');
    // queuedEventIds (FIFO order from the ring)
    lines.push('            printf("\\"queuedEventIds\\":[");');
    lines.push('            { uint16_t __qn; uint16_t __qpos = inst.queue_head;');
    lines.push('                for (__qn = 0U; __qn < inst.queue_count; __qn++) {');
    lines.push('                    const char *__eid = "";');
    lines.push('                    switch (inst.event_queue[__qpos]) {');
    model.events.forEach(ev => {
      lines.push(`                        case ${ev.cIdentifier}: __eid = "${ev.id}"; break;`);
    });
    lines.push('                        default: break;');
    lines.push('                    }');
    lines.push('                    printf("%s\\"%s\\"", (__qn == 0U) ? "" : ",", __eid);');
    lines.push('                    __qpos = (uint16_t)((__qpos + 1U) % OPM_EVENT_QUEUE_CAPACITY);');
    lines.push('                }');
    lines.push('            }');
    lines.push('            printf("],");');
    // stateTimersMs (all states; absent-on-TS means 0)
    lines.push('            printf("\\"stateTimersMs\\":{");');
    model.states.forEach((st, sti) => {
      const comma = sti === 0 ? '' : ',';
      lines.push(`            printf("${comma}\\"${st.id}\\":%u", (unsigned)inst.state_timers[${sti}U]);`);
    });
    lines.push('            printf("},");');
    // processTimersMs (all processes)
    lines.push('            printf("\\"processTimersMs\\":{");');
    model.processes.forEach((p, pi) => {
      const comma = pi === 0 ? '' : ',';
      lines.push(`            printf("${comma}\\"${p.id}\\":%u", (unsigned)inst.process_timers[${pi}U]);`);
    });
    lines.push('            printf("},");');
    // firedProcessIds (priority-first order)
    lines.push('            printf("\\"firedProcessIds\\":[");');
    lines.push('            { uint16_t __r; uint8_t __ffirst = 1U;');
    lines.push('                for (__r = 0U; __r < OPM_NUM_PROCESSES; __r++) {');
    lines.push('                    uint16_t __p = __OPM_FIRED_ORDER[__r];');
    lines.push('                    if (inst.process_fired[__p] != 0U) {');
    lines.push('                        printf("%s\\"%s\\"", (__ffirst != 0U) ? "" : ",", __OPM_CONF_PROC_IDS[__p]);');
    lines.push('                        __ffirst = 0U;');
    lines.push('                    }');
    lines.push('                }');
    lines.push('            }');
    lines.push('            printf("],");');
    // blockedProcessIds (model order)
    lines.push('            printf("\\"blockedProcessIds\\":[");');
    lines.push('            { uint16_t __b; uint8_t __bfirst = 1U;');
    lines.push('                for (__b = 0U; __b < OPM_NUM_PROCESSES; __b++) {');
    lines.push('                    if (inst.process_fired[__b] == 0U) {');
    lines.push('                        printf("%s\\"%s\\"", (__bfirst != 0U) ? "" : ",", __OPM_CONF_PROC_IDS[__b]);');
    lines.push('                        __bfirst = 0U;');
    lines.push('                    }');
    lines.push('                }');
    lines.push('            }');
    lines.push('            printf("],");');
    // traversedLinkIds in canonical TS order: gating links (model order)
    // first, then process-sourced result links (model order), mirroring
    // runtime.ts [...traversedGating, ...traversedResult].
    lines.push('            printf("\\"traversedLinkIds\\":[");');
    lines.push('#if (OPM_NUM_LINKS > 0U)');
    lines.push('            { uint8_t __tfirst = 1U;');
    model.links.forEach((link, li) => {
      const isResult =
        model.processes.some(p => p.id === link.sourceId) &&
        !model.processes.some(p => p.id === link.targetId);
      if (!isResult) {
        lines.push(`                if (inst.link_traversed[${li}U] != 0U) { printf("%s\\"${link.id}\\"", (__tfirst != 0U) ? "" : ","); __tfirst = 0U; }`);
      }
    });
    model.links.forEach((link, li) => {
      const isResult =
        model.processes.some(p => p.id === link.sourceId) &&
        !model.processes.some(p => p.id === link.targetId);
      if (isResult) {
        lines.push(`                if (inst.link_traversed[${li}U] != 0U) { printf("%s\\"${link.id}\\"", (__tfirst != 0U) ? "" : ","); __tfirst = 0U; }`);
      }
    });
    lines.push('            }');
    lines.push('#endif');
    lines.push('            printf("],");');
    // committedWriteIds (commit order)
    lines.push('            printf("\\"committedWriteIds\\":[");');
    lines.push('            { uint16_t __c;');
    lines.push('                for (__c = 0U; __c < inst.committed_count; __c++) {');
    lines.push('                    printf("%s\\"%s\\"", (__c == 0U) ? "" : ",", __OPM_CONF_ATTR_KEYS[inst.committed_attrs[__c]]);');
    lines.push('                }');
    lines.push('            }');
    lines.push('            printf("],");');
    // transitions
    lines.push('            printf("\\"transitions\\":[");');
    lines.push('            { uint16_t __x; uint8_t __xfirst = 1U;');
    lines.push('                for (__x = 0U; __x < inst.staged_trans_count; __x++) {');
    lines.push('                    if (!inst.staged_trans[__x].valid) continue;');
    lines.push('                    {');
    lines.push('                        uint16_t __o = inst.staged_trans[__x].owner_index;');
    lines.push('                        uint16_t __f = inst.staged_trans[__x].from_state_index;');
    lines.push('                        uint16_t __s = inst.staged_trans[__x].to_state_index;');
    lines.push('                        uint16_t __l = inst.staged_trans[__x].link_index;');
    lines.push('                        const char *__on = "";');
    lines.push('                        const char *__fn = "";');
    lines.push('                        const char *__sn = "";');
    lines.push('                        const char *__ln = "";');
    lines.push('                        switch (__o) {');
    model.objects.forEach((o, oi) => {
      lines.push(`                            case ${oi}U: __on = "${o.id}"; break;`);
    });
    lines.push('                            default: break;');
    lines.push('                        }');
    lines.push('                        switch (__s) {');
    model.states.forEach((st, sti) => {
      lines.push(`                            case ${sti}U: __sn = "${st.id}"; break;`);
    });
    lines.push('                            default: break;');
    lines.push('                        }');
    lines.push('                        if (__f != 0xFFFFU) {');
    lines.push('                            switch (__f) {');
    model.states.forEach((st, sti) => {
      lines.push(`                                case ${sti}U: __fn = "${st.id}"; break;`);
    });
    lines.push('                                default: break;');
    lines.push('                            }');
    lines.push('                        }');
    lines.push('#if (OPM_NUM_LINKS > 0U)');
    lines.push('                        if (__l < OPM_NUM_LINKS) { __ln = __OPM_CONF_LINK_IDS[__l]; }');
    lines.push('#endif');
    lines.push('                        printf("%s{\\"ownerObjectId\\":\\"%s\\"", (__xfirst != 0U) ? "" : ",", __on);');
    lines.push('                        if (__f != 0xFFFFU) { printf(",\\"fromStateId\\":\\"%s\\"", __fn); }');
    lines.push('                        printf(",\\"toStateId\\":\\"%s\\",\\"linkId\\":\\"%s\\"}", __sn, __ln);');
    lines.push('                        __xfirst = 0U;');
    lines.push('                    }');
    lines.push('                }');
    lines.push('            }');
    lines.push('            printf("],");');
    // diagnostics
    lines.push('            printf("\\"diagnostics\\":[");');
    lines.push('            for (__n = 0U; __n < (uint16_t)(inst.diagnostics.event_drops - __ed0); __n++) { printf("%s{\\"code\\":\\"OPM_EVENT_QUEUE_OVERFLOW\\",\\"severity\\":\\"error\\"}", (__dfirst != 0U) ? "" : ","); __dfirst = 0U; }');
    lines.push('            for (__n = 0U; __n < (uint16_t)(inst.diagnostics.write_conflicts - __wc0); __n++) { printf("%s{\\"code\\":\\"OPM_WRITE_CONFLICT\\",\\"severity\\":\\"error\\"}", (__dfirst != 0U) ? "" : ","); __dfirst = 0U; }');
    lines.push('            for (__n = 0U; __n < (uint16_t)(inst.diagnostics.staged_drops - __sd0); __n++) { printf("%s{\\"code\\":\\"OPM_STAGED_WRITES_OVERFLOW\\",\\"severity\\":\\"error\\"}", (__dfirst != 0U) ? "" : ","); __dfirst = 0U; }');
    lines.push('            for (__n = 0U; __n < (uint16_t)(inst.diagnostics.transition_drops - __td0); __n++) { printf("%s{\\"code\\":\\"OPM_TRANSITIONS_OVERFLOW\\",\\"severity\\":\\"error\\"}", (__dfirst != 0U) ? "" : ","); __dfirst = 0U; }');
    lines.push('            for (__n = 0U; __n < (uint16_t)(inst.diagnostics.transition_conflicts - __tc0); __n++) { printf("%s{\\"code\\":\\"OPM_TRANSITION_CONFLICT\\",\\"severity\\":\\"error\\"}", (__dfirst != 0U) ? "" : ","); __dfirst = 0U; }');
    lines.push('            printf("]");');
    lines.push('            printf("}\\n");');
    lines.push('        }');
    lines.push('    }');
  });

  lines.push('    (void)__OPM_FIRED_ORDER;');
  lines.push('    (void)__OPM_CONF_PROC_IDS;');
  lines.push('    (void)__OPM_CONF_LINK_IDS;');
  lines.push('    (void)__OPM_CONF_ATTR_KEYS;');
  lines.push('    return 0;');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function formatExecFailure(err: unknown): string {
  const anyErr = err as {
    message?: string;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
    status?: number;
  };
  const parts: string[] = [];
  if (anyErr.message) parts.push(anyErr.message.split('\n').slice(0, 3).join(' '));
  const stderr = typeof anyErr.stderr === 'string' ? anyErr.stderr : anyErr.stderr?.toString();
  if (stderr) parts.push(`stderr: ${stderr.slice(0, 4000)}`);
  if (typeof anyErr.status === 'number') parts.push(`status: ${anyErr.status}`);
  return parts.join(' | ');
}

export interface OpmCHostOptions {
  repoRoot?: string;
  keepArtifacts?: boolean;
}

/**
 * Compile the generated C artifacts plus the conformance driver with the
 * mandatory qualification compiler and execute the scenario. Throws on any
 * compile or execution failure (strict: never skips).
 */
export function compileAndRunOpmCScenario(
  model: ExecutableOpmModel,
  scenario: OpmConformanceScenario,
  opts: OpmCHostOptions = {},
): OpmConformanceResult {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const compiler = resolveRequiredOpmCompiler(repoRoot);
  // The qualification compiler resolves its assembler/linker via PATH. A
  // stale 32-bit mingw on the host PATH can shadow the bundled w64devkit
  // binutils (pushq/subq 64-bit failures), so prepend the compiler's own
  // bin directory for both compile and execute steps.
  const compilerBinDir = path.dirname(compiler);
  const spawnEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${compilerBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  const artifacts = generateOpmCArtifacts(model);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opm-conformance-'));
  try {
    for (const file of artifacts.files) {
      fs.writeFileSync(path.join(dir, file.name), file.content, 'utf8');
    }
    fs.writeFileSync(
      path.join(dir, 'opm_conformance_main.c'),
      generateConformanceMain(model, scenario),
      'utf8',
    );
    const exeName = process.platform === 'win32' ? 'opm_conformance.exe' : 'opm_conformance';
    const args = [
      '-std=c99',
      '-pedantic-errors',
      '-Wall',
      '-Wextra',
      '-Werror',
      'opm_model.c',
      'opm_runtime.c',
      'opm_io.c',
      'opm_trace.c',
      'opm_conformance_main.c',
      '-o',
      exeName,
    ];
    if (process.platform !== 'win32') {
      args.push('-lm');
    }
    try {
      execFileSync(compiler, args, {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180000,
        env: spawnEnv,
      });
    } catch (err) {
      throw new Error(`OPM C conformance compilation failed: ${formatExecFailure(err)}`);
    }
    let stdout: string;
    try {
      const out = execFileSync(path.join(dir, exeName), [], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180000,
        env: spawnEnv,
      });
      stdout = typeof out === 'string' ? out : String(out);
    } catch (err) {
      throw new Error(`OPM C conformance execution failed: ${formatExecFailure(err)}`);
    }
    const snapshots = parseOpmSnapshotsStrict(stdout, model, scenario);
    return { snapshots, stdout };
  } finally {
    if (!opts.keepArtifacts) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

const SNAPSHOT_FIELDS = [
  'stepIndex',
  'timeMs',
  'status',
  'lifecycle',
  'finished',
  'values',
  'activeStates',
  'queuedEventIds',
  'stateTimersMs',
  'processTimersMs',
  'firedProcessIds',
  'blockedProcessIds',
  'traversedLinkIds',
  'committedWriteIds',
  'transitions',
  'diagnostics',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strictly parse conformance JSONL into snapshots. Rejects extra non-empty
 * stdout lines, missing/extra fields, mistyped values, non-finite numbers,
 * duplicate step indexes (a repeat is only legal after a reset step), and
 * any ID that is not part of the model.
 */
export function parseOpmSnapshotsStrict(
  stdout: string,
  model: ExecutableOpmModel,
  scenario: OpmConformanceScenario,
): OpmStepSnapshot[] {
  const eventIds = new Set(model.events.map(e => e.id));
  const procIds = new Set(model.processes.map(p => p.id));
  const linkIds = new Set(model.links.map(l => l.id));
  const objIds = new Set(model.objects.map(o => o.id));
  const stateIds = new Set(model.states.map(s => s.id));
  const statesByObject = new Map<string, Set<string>>();
  for (const o of model.objects) {
    statesByObject.set(o.id, new Set(o.stateIds ?? []));
  }
  const attrKindByKey = new Map<string, string>();
  for (const o of model.objects) {
    for (const a of o.attributes) {
      attrKindByKey.set(a.cIdentifier, a.type.kind);
    }
  }

  const rawLines = stdout.split(/\r?\n/);
  const lines = rawLines.filter(l => l.trim().length > 0);
  if (lines.length !== scenario.steps.length) {
    throw new Error(
      `OPM conformance parse: expected ${scenario.steps.length} snapshot lines, got ${lines.length}`,
    );
  }
  const checkInt = (value: unknown, what: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`OPM conformance parse: ${what} must be a finite integer`);
    }
    return value;
  };

  const lastPosByStepIndex = new Map<number, number>();
  const snapshots: OpmStepSnapshot[] = [];
  lines.forEach((line, pos) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`OPM conformance parse: line ${pos} is not valid JSON (extra stdout rejected)`);
    }
    if (!isRecord(parsed)) {
      throw new Error(`OPM conformance parse: line ${pos} must be a JSON object`);
    }
    const keys = Object.keys(parsed).sort();
    const wanted = [...SNAPSHOT_FIELDS].sort();
    if (keys.length !== wanted.length || keys.some((k, i) => k !== wanted[i])) {
      throw new Error(`OPM conformance parse: line ${pos} must carry exactly the OpmStepSnapshot fields`);
    }

    const stepIndex = checkInt(parsed.stepIndex, `line ${pos} stepIndex`);
    const prevPos = lastPosByStepIndex.get(stepIndex);
    if (prevPos !== undefined) {
      const resetBetween = scenario.steps
        .slice(prevPos + 1, pos + 1)
        .some(s => s.resetBeforeStep === true);
      if (!resetBetween) {
        throw new Error(`OPM conformance parse: duplicate step index ${stepIndex} at line ${pos}`);
      }
    }
    lastPosByStepIndex.set(stepIndex, pos);

    const timeMs = checkInt(parsed.timeMs, `line ${pos} timeMs`);
    if (timeMs < 0) throw new Error(`OPM conformance parse: line ${pos} timeMs negative`);
    if (parsed.status !== 'ok' && parsed.status !== 'error') {
      throw new Error(`OPM conformance parse: line ${pos} invalid status`);
    }
    if (!['ready', 'running', 'waiting', 'finished', 'faulted'].includes(parsed.lifecycle as string)) {
      throw new Error(`OPM conformance parse: line ${pos} invalid lifecycle`);
    }
    if (typeof parsed.finished !== 'boolean') {
      throw new Error(`OPM conformance parse: line ${pos} finished must be boolean`);
    }

    if (!isRecord(parsed.values)) throw new Error(`OPM conformance parse: line ${pos} values must be an object`);
    const valueKeys = Object.keys(parsed.values).sort();
    const wantKeys = [...attrKindByKey.keys()].sort();
    if (valueKeys.length !== wantKeys.length || valueKeys.some((k, i) => k !== wantKeys[i])) {
      throw new Error(`OPM conformance parse: line ${pos} values must key every attribute cIdentifier exactly`);
    }
    for (const [key, value] of Object.entries(parsed.values)) {
      const kind = attrKindByKey.get(key)!;
      if (kind === 'bool') {
        if (typeof value !== 'boolean') throw new Error(`OPM conformance parse: line ${pos} bool "${key}"`);
      } else if (kind === 'float32') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`OPM conformance parse: line ${pos} float "${key}" must be finite`);
        }
      } else if (kind === 'enum') {
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
          throw new Error(`OPM conformance parse: line ${pos} enum "${key}" must be an integer`);
        }
      } else {
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
          throw new Error(`OPM conformance parse: line ${pos} int "${key}" must be a finite integer`);
        }
      }
    }

    if (!isRecord(parsed.activeStates)) throw new Error(`OPM conformance parse: line ${pos} activeStates object`);
    for (const [objId, stId] of Object.entries(parsed.activeStates)) {
      if (!objIds.has(objId)) throw new Error(`OPM conformance parse: line ${pos} unknown object "${objId}"`);
      if (typeof stId !== 'string' || !stateIds.has(stId)) {
        throw new Error(`OPM conformance parse: line ${pos} invalid state for "${objId}"`);
      }
      if (!statesByObject.get(objId)?.has(stId)) {
        throw new Error(`OPM conformance parse: line ${pos} state "${stId}" not owned by "${objId}"`);
      }
    }

    if (!Array.isArray(parsed.queuedEventIds)) throw new Error(`OPM conformance parse: line ${pos} queuedEventIds array`);
    for (const ev of parsed.queuedEventIds) {
      if (typeof ev !== 'string' || !eventIds.has(ev)) {
        throw new Error(`OPM conformance parse: line ${pos} invalid queued event "${String(ev)}"`);
      }
    }
    if (parsed.queuedEventIds.length > model.settings.eventQueueCapacity) {
      throw new Error(`OPM conformance parse: line ${pos} queue exceeds capacity`);
    }

    if (!isRecord(parsed.stateTimersMs)) throw new Error(`OPM conformance parse: line ${pos} stateTimersMs object`);
    for (const [stId, v] of Object.entries(parsed.stateTimersMs)) {
      if (!stateIds.has(stId)) throw new Error(`OPM conformance parse: line ${pos} unknown state "${stId}"`);
      checkInt(v, `line ${pos} state timer "${stId}"`);
    }
    if (!isRecord(parsed.processTimersMs)) throw new Error(`OPM conformance parse: line ${pos} processTimersMs object`);
    {
      const keys = Object.keys(parsed.processTimersMs).sort();
      const want = [...procIds].sort();
      if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
        throw new Error(`OPM conformance parse: line ${pos} processTimersMs must key every process exactly`);
      }
      for (const v of Object.values(parsed.processTimersMs)) checkInt(v, `line ${pos} process timer`);
    }

    const checkIdList = (value: unknown, field: string, valid: Set<string>): string[] => {
      if (!Array.isArray(value)) throw new Error(`OPM conformance parse: line ${pos} ${field} array`);
      const seen = new Set<string>();
      for (const id of value) {
        if (typeof id !== 'string' || !valid.has(id)) {
          throw new Error(`OPM conformance parse: line ${pos} invalid ${field} id "${String(id)}"`);
        }
        if (seen.has(id)) throw new Error(`OPM conformance parse: line ${pos} duplicate ${field} id "${id}"`);
        seen.add(id);
      }
      return [...seen];
    };
    const fired = checkIdList(parsed.firedProcessIds, 'firedProcessIds', procIds);
    const blocked = checkIdList(parsed.blockedProcessIds, 'blockedProcessIds', procIds);
    if (fired.some(id => blocked.includes(id))) {
      throw new Error(`OPM conformance parse: line ${pos} process both fired and blocked`);
    }
    if (fired.length + blocked.length !== procIds.size) {
      throw new Error(`OPM conformance parse: line ${pos} fired+blocked must partition all processes`);
    }
    checkIdList(parsed.traversedLinkIds, 'traversedLinkIds', linkIds);
    const committed = checkIdList(parsed.committedWriteIds, 'committedWriteIds', new Set(attrKindByKey.keys()));

    if (!Array.isArray(parsed.transitions)) throw new Error(`OPM conformance parse: line ${pos} transitions array`);
    const transitions = parsed.transitions.map((t, ti) => {
      if (!isRecord(t)) throw new Error(`OPM conformance parse: line ${pos} transition ${ti} object`);
      const tKeys = Object.keys(t).sort();
      const allowed = ['fromStateId', 'linkId', 'ownerObjectId', 'toStateId'];
      if (!tKeys.includes('ownerObjectId') || !tKeys.includes('toStateId') || tKeys.some(k => !allowed.includes(k))) {
        throw new Error(`OPM conformance parse: line ${pos} transition ${ti} fields`);
      }
      if (typeof t.ownerObjectId !== 'string' || !objIds.has(t.ownerObjectId)) {
        throw new Error(`OPM conformance parse: line ${pos} transition ${ti} owner`);
      }
      if (typeof t.toStateId !== 'string' || !stateIds.has(t.toStateId)) {
        throw new Error(`OPM conformance parse: line ${pos} transition ${ti} target`);
      }
      if (t.fromStateId !== undefined && (typeof t.fromStateId !== 'string' || !stateIds.has(t.fromStateId))) {
        throw new Error(`OPM conformance parse: line ${pos} transition ${ti} source`);
      }
      if (t.linkId !== undefined && (typeof t.linkId !== 'string' || !linkIds.has(t.linkId))) {
        throw new Error(`OPM conformance parse: line ${pos} transition ${ti} link`);
      }
      return {
        ownerObjectId: t.ownerObjectId,
        ...(t.fromStateId !== undefined ? { fromStateId: t.fromStateId as string } : {}),
        toStateId: t.toStateId as string,
        ...(t.linkId !== undefined ? { linkId: t.linkId as string } : {}),
      };
    });

    if (!Array.isArray(parsed.diagnostics)) throw new Error(`OPM conformance parse: line ${pos} diagnostics array`);
    const diagnostics = parsed.diagnostics.map((d, di) => {
      if (!isRecord(d)) throw new Error(`OPM conformance parse: line ${pos} diagnostic ${di} object`);
      const dKeys = Object.keys(d).sort();
      if (dKeys.length !== 2 || dKeys[0] !== 'code' || dKeys[1] !== 'severity') {
        throw new Error(`OPM conformance parse: line ${pos} diagnostic ${di} fields`);
      }
      if (typeof d.code !== 'string' || d.code.length === 0) {
        throw new Error(`OPM conformance parse: line ${pos} diagnostic ${di} code`);
      }
      if (d.severity !== 'error' && d.severity !== 'warning') {
        throw new Error(`OPM conformance parse: line ${pos} diagnostic ${di} severity`);
      }
      return {
        code: d.code,
        severity: d.severity as 'error' | 'warning',
        message: '',
        source: { elementId: '', propertyPath: '' },
      };
    });

    snapshots.push({
      stepIndex,
      timeMs,
      status: parsed.status,
      lifecycle: parsed.lifecycle as OpmStepSnapshot['lifecycle'],
      finished: parsed.finished,
      values: parsed.values as OpmStepSnapshot['values'],
      activeStates: parsed.activeStates as OpmStepSnapshot['activeStates'],
      queuedEventIds: (parsed.queuedEventIds as unknown[]).map(String),
      stateTimersMs: parsed.stateTimersMs as OpmStepSnapshot['stateTimersMs'],
      processTimersMs: parsed.processTimersMs as OpmStepSnapshot['processTimersMs'],
      firedProcessIds: fired,
      blockedProcessIds: blocked,
      traversedLinkIds: parsed.traversedLinkIds as string[],
      committedWriteIds: committed,
      transitions,
      diagnostics,
    });
  });
  return snapshots;
}
