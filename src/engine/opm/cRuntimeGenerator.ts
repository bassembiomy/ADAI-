/**
 * OPM C bounded runtime generator: scheduler, queues, writes, transitions,
 * diagnostics, trace and public API. Mirrors the TypeScript runtime phases
 * 1:1 with statically bounded storage only.
 */

import type { ExecutableOpmModel } from './pipeline';
import type { GeneratedOpmFile } from './cGeneratorTypes';
import { renderCExpression, renderFloatLiteralC, resolveAssignmentLvalue, isSafeCIdentifier } from './cIr';

export function generateOpmRuntimeFiles(model: ExecutableOpmModel): GeneratedOpmFile[] {
  const files: GeneratedOpmFile[] = [];
  const allAttrs = model.objects.flatMap(o => [...o.attributes]);
  const enumMemberIds = new Set(model.enums.flatMap(e => e.members.map(m => m.cIdentifier)));

  // --- opm_runtime.h ---
  const runtimeH: string[] = [
    '#ifndef OPM_RUNTIME_H',
    '#define OPM_RUNTIME_H',
    '',
    '#include "opm_types.h"',
    '#include "opm_config.h"',
    '#include "opm_model.h"',
    '',
    '#ifdef __cplusplus',
    'extern "C" {',
    '#endif',
    '',
    'void OPM_Init(OPM_Instance_t *instance);',
    'OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);',
    'OPM_Status_t OPM_DispatchEvent(OPM_Instance_t *instance, OPM_EventId_t event_id);',
    'void OPM_Reset(OPM_Instance_t *instance);',
    'const OPM_Diagnostics_t *OPM_GetDiagnostics(const OPM_Instance_t *instance);',
    '',
    'bool OPM_EvaluateEligibility(uint16_t process_index, OPM_Instance_t *instance, uint32_t delta_ms);',
    'OPM_Status_t OPM_ResolveWriteConflicts(OPM_Instance_t *instance);',
    'OPM_Status_t OPM_CommitTransitions(OPM_Instance_t *instance);',
    'OPM_Status_t OPM_RunStateActions(OPM_Instance_t *instance);',
    '',
    '#ifdef __cplusplus',
    '}',
    '#endif',
    '',
    '#endif',
    '',
  ];
  files.push({ name: 'opm_runtime.h', content: runtimeH.join('\n') });

  // --- opm_runtime.c ---
  const rc: string[] = [
    '#include "opm_runtime.h"',
    '#include "opm_trace.h"',
    '#include "opm_io.h"',
    '#include <string.h>',
    '',
    'static OPM_Status_t OPM_WorstStatus(OPM_Status_t a, OPM_Status_t b) {',
    '    int ra = (a == OPM_OK) ? 0 : (a == OPM_UNKNOWN_EVENT) ? 1 : (a == OPM_QUEUE_OVERFLOW) ? 2 : (a == OPM_WRITE_CONFLICT) ? 3 : 4;',
    '    int rb = (b == OPM_OK) ? 0 : (b == OPM_UNKNOWN_EVENT) ? 1 : (b == OPM_QUEUE_OVERFLOW) ? 2 : (b == OPM_WRITE_CONFLICT) ? 3 : 4;',
    '    return (rb > ra) ? b : a;',
    '}',
    '',
    'static void OPM_RecordStatus(OPM_Instance_t *instance, OPM_Status_t st, OPM_Status_t *worst) {',
    '    if (!instance) return;',
    '    if (st != OPM_OK) {',
    '        instance->diagnostics.error_count++;',
    '        instance->diagnostics.last_status = OPM_WorstStatus(instance->diagnostics.last_status, st);',
    '    }',
    '    if (worst) *worst = OPM_WorstStatus(*worst, st);',
    '}',
    '',
    'void OPM_Init(OPM_Instance_t *instance) {',
    '    if (!instance) return;',
    '    OPM_Model_Init(instance);',
    '}',
    '',
    'void OPM_Reset(OPM_Instance_t *instance) {',
    '    OPM_Init(instance);',
    '}',
    '',
    'const OPM_Diagnostics_t *OPM_GetDiagnostics(const OPM_Instance_t *instance) {',
    '    if (!instance) return (const OPM_Diagnostics_t *)0;',
    '    return &instance->diagnostics;',
    '}',
    '',
    'OPM_Status_t OPM_DispatchEvent(OPM_Instance_t *instance, OPM_EventId_t event_id) {',
    '    if (!instance) return OPM_ERROR;',
    '    /* unknown-event validation: only generated event IDs are accepted */',
    `    if ((event_id <= OPM_EVENT_NONE) || (event_id >= OPM_EVENT_COUNT)) {`,
    '        instance->diagnostics.error_count++;',
    '        instance->diagnostics.last_status = OPM_UNKNOWN_EVENT;',
    '        return OPM_UNKNOWN_EVENT;',
    '    }',
    '    if (instance->queue_count >= OPM_EVENT_QUEUE_CAPACITY) {',
    '        instance->diagnostics.event_drops++;',
    '        instance->diagnostics.error_count++;',
    '#if OPM_EVENT_OVERFLOW_DROP_OLDEST',
    '        /* FIFO overflow policy: dropOldest — discard oldest, accept newest */',
    '        instance->event_queue[instance->queue_head] = event_id;',
    '        instance->queue_head = (uint16_t)((instance->queue_head + 1U) % OPM_EVENT_QUEUE_CAPACITY);',
    '        instance->queue_tail = (uint16_t)((instance->queue_tail + 1U) % OPM_EVENT_QUEUE_CAPACITY);',
    '        instance->diagnostics.last_status = OPM_QUEUE_OVERFLOW;',
    '        return OPM_QUEUE_OVERFLOW;',
    '#else',
    '        /* FIFO overflow policy: rejectNewest — keep queue, reject newest */',
    '        instance->diagnostics.last_status = OPM_QUEUE_OVERFLOW;',
    '        return OPM_QUEUE_OVERFLOW;',
    '#endif',
    '    }',
    '    instance->event_queue[instance->queue_tail] = event_id;',
    '    instance->queue_tail = (uint16_t)((instance->queue_tail + 1U) % OPM_EVENT_QUEUE_CAPACITY);',
    '    instance->queue_count++;',
    '    return OPM_OK;',
    '}',
    '',
    '/* Link traversal gate helper: true when the event is currently queued. */',
    'static bool OPM_HasQueuedEvent(const OPM_Instance_t *instance, OPM_EventId_t event_id) {',
    '    uint16_t n, idx;',
    '    if (!instance) return false;',
    '    if (event_id <= OPM_EVENT_NONE) return false;',
    '    idx = instance->queue_head;',
    '    for (n = 0; n < instance->queue_count; n++) {',
    '        if (instance->event_queue[idx] == event_id) return true;',
    '        idx = (uint16_t)((idx + 1U) % OPM_EVENT_QUEUE_CAPACITY);',
    '    }',
    '    return false;',
    '}',
    '',
  ];

  // Eligibility: debounce, cyclic period, enabled flag, guard (fail-closed).
  rc.push('/* Activation eligibility for one process (debounce, period, guard). */');
  rc.push('bool OPM_EvaluateEligibility(uint16_t process_index, OPM_Instance_t *instance, uint32_t delta_ms) {');
  rc.push('    if (!instance) return false;');
  if (model.processes.length === 0) {
    rc.push('    (void)process_index; (void)delta_ms; return false;');
  } else {
    rc.push('    if (process_index >= OPM_NUM_PROCESSES) return false;');
    rc.push('    if (!OPM_PROCESS_TABLE[process_index].enabled) return false;');
    rc.push('    {');
    rc.push('        uint32_t debounce = OPM_PROCESS_TABLE[process_index].debounce_ms;');
    rc.push('        if ((debounce > 0U) && (instance->step_index > 0U)) {');
    rc.push('            uint32_t since = instance->time_ms - instance->process_last_fire[process_index];');
    rc.push('            if (since < debounce) return false;');
    rc.push('        }');
    rc.push('    }');
    rc.push('    {');
    rc.push('        uint32_t period = OPM_PROCESS_TABLE[process_index].period_ms;');
    rc.push('        uint8_t act = OPM_PROCESS_TABLE[process_index].activation;');
    rc.push('        uint32_t accum = instance->process_timers[process_index] + delta_ms;');
    rc.push('        if ((act == 0U) && (period > 0U) && (accum < period)) return false;');
    rc.push('    }');
    rc.push('    {');
    rc.push('        bool ok = true;');
    rc.push('        bool g = OPM_Model_EvaluateGuard(process_index, instance, &ok);');
    rc.push('        if (!ok) return false;');
    rc.push('        if (!g) return false;');
    rc.push('    }');
    rc.push('    return true;');
  }
  rc.push('}');
  rc.push('');

  // Write staging helper: priority-first keep (mirrors the TS
  // sortStagedWritesDeterministic clamp: priority desc, then attributeId,
  // source, id). While capacity remains the write is appended; when full, a
  // newcomer that outranks the worst staged write evicts it, where worst is
  // the lowest priority and — on priority ties — the largest attribute
  // index. Generated attribute-index order is the bounded stand-in for the
  // TS attributeId → source → id tie-break (the C runtime carries no string
  // keys). Otherwise the newcomer is dropped. Every drop/eviction counts
  // staged_drops.
  rc.push('static OPM_Status_t OPM_StageWrite(OPM_Instance_t *instance, uint16_t attr_index, uint8_t op, uint8_t priority, float f_v, int32_t i_v, uint32_t u_v, uint8_t is_float) {');
  rc.push('    if (instance->staged_count >= OPM_MAX_STAGED_WRITES) {');
  rc.push('        uint16_t k, victim = 0xFFFFU;');
  rc.push('        uint8_t victim_pri = priority;');
  rc.push('        uint16_t victim_attr = attr_index;');
  rc.push('        for (k = 0; k < instance->staged_count; k++) {');
  rc.push('            if (!instance->staged_writes[k].valid) continue;');
  rc.push('            if ((instance->staged_writes[k].priority < victim_pri) || ((instance->staged_writes[k].priority == victim_pri) && (instance->staged_writes[k].attr_index > victim_attr))) { victim_pri = instance->staged_writes[k].priority; victim_attr = instance->staged_writes[k].attr_index; victim = k; }');
  rc.push('        }');
  rc.push('        if (victim == 0xFFFFU) {');
  rc.push('            instance->diagnostics.staged_drops++;');
  rc.push('            return OPM_QUEUE_OVERFLOW;');
  rc.push('        }');
  rc.push('        instance->diagnostics.staged_drops++;');
  rc.push('        {');
  rc.push('            OPM_StagedWrite_t *w = &instance->staged_writes[victim];');
  rc.push('            w->attr_index = attr_index;');
  rc.push('            w->op = op;');
  rc.push('            w->priority = priority;');
  rc.push('            w->f_value = f_v;');
  rc.push('            w->i_value = i_v;');
  rc.push('            w->u_value = u_v;');
  rc.push('            w->is_float = is_float;');
  rc.push('            w->valid = 1U;');
  rc.push('        }');
  rc.push('        return OPM_OK;');
  rc.push('    }');
  rc.push('    {');
  rc.push('        OPM_StagedWrite_t *w = &instance->staged_writes[instance->staged_count++];');
  rc.push('        w->attr_index = attr_index;');
  rc.push('        w->op = op;');
  rc.push('        w->priority = priority;');
  rc.push('        w->f_value = f_v;');
  rc.push('        w->i_value = i_v;');
  rc.push('        w->u_value = u_v;');
  rc.push('        w->is_float = is_float;');
  rc.push('        w->valid = 1U;');
  rc.push('    }');
  rc.push('    return OPM_OK;');
  rc.push('}');
  rc.push('');

  // Conflict resolution over staged writes.
  rc.push('/* Conflict resolution: highest priority wins; equal-priority tie drops. */');
  rc.push('OPM_Status_t OPM_ResolveWriteConflicts(OPM_Instance_t *instance) {');
  rc.push('    OPM_Status_t st = OPM_OK;');
  rc.push('    uint16_t i, j;');
  rc.push('    if (!instance) return OPM_ERROR;');
  rc.push('    for (i = 0; i < instance->staged_count; i++) {');
  rc.push('        if (!instance->staged_writes[i].valid) continue;');
  rc.push('        for (j = (uint16_t)(i + 1U); j < instance->staged_count; j++) {');
  rc.push('            if (!instance->staged_writes[j].valid) continue;');
  rc.push('            if (instance->staged_writes[i].attr_index != instance->staged_writes[j].attr_index) continue;');
  rc.push('            if (instance->staged_writes[i].priority > instance->staged_writes[j].priority) {');
  rc.push('                instance->staged_writes[j].valid = 0U;');
  rc.push('            } else if (instance->staged_writes[j].priority > instance->staged_writes[i].priority) {');
  rc.push('                instance->staged_writes[i].valid = 0U;');
  rc.push('                break;');
  rc.push('            } else {');
  rc.push('                /* equal-priority write conflict: commit neither */');
  rc.push('                instance->staged_writes[i].valid = 0U;');
  rc.push('                instance->staged_writes[j].valid = 0U;');
  rc.push('                instance->diagnostics.write_conflicts++;');
  rc.push('                instance->diagnostics.error_count++;');
  rc.push('                st = OPM_WRITE_CONFLICT;');
  rc.push('            }');
  rc.push('        }');
  rc.push('    }');
  rc.push('    if (st != OPM_OK) instance->diagnostics.last_status = OPM_WorstStatus(instance->diagnostics.last_status, st);');
  rc.push('    return st;');
  rc.push('}');
  rc.push('');

  // Typed commit of one winning write (generated per-attribute switch).
  rc.push('static OPM_Status_t OPM_ApplyWrite(OPM_Instance_t *instance, const OPM_StagedWrite_t *w) {');
  rc.push('    if (!instance || !w || !w->valid) return OPM_ERROR;');
  rc.push('    switch (w->attr_index) {');
  allAttrs.forEach((attr, idx) => {
    if (!isSafeCIdentifier(attr.cIdentifier)) return;
    const kind = attr.type.kind;
    rc.push(`        case ${idx}U: {`);
    if (kind === 'float32') {
      const lo = attr.minimum ?? null;
      const hi = attr.maximum ?? null;
      if (attr.overflow === 'saturate' && (lo !== null || hi !== null)) {
        const loS = lo !== null ? renderFloatLiteralC(lo) : '-3.4028235e+38f';
        const hiS = hi !== null ? renderFloatLiteralC(hi) : '3.4028235e+38f';
        rc.push(`            float __nv = w->f_value;`);
        rc.push(`            if (w->op == 1U) __nv = (float)(instance->${attr.cIdentifier} + w->f_value);`);
        rc.push(`            else if (w->op == 2U) __nv = (float)(instance->${attr.cIdentifier} - w->f_value);`);
        rc.push(`            else if (w->op == 3U) __nv = (float)(instance->${attr.cIdentifier} * w->f_value);`);
        rc.push(`            else if (w->op == 4U) { if (w->f_value == 0.0f) return OPM_ERROR; __nv = (float)(instance->${attr.cIdentifier} / w->f_value); }`);
        rc.push(`            if (__nv < ${loS}) __nv = ${loS};`);
        rc.push(`            if (__nv > ${hiS}) __nv = ${hiS};`);
        rc.push(`            instance->${attr.cIdentifier} = __nv;`);
      } else {
        rc.push(`            float __nv = w->f_value;`);
        rc.push(`            if (w->op == 1U) __nv = (float)(instance->${attr.cIdentifier} + w->f_value);`);
        rc.push(`            else if (w->op == 2U) __nv = (float)(instance->${attr.cIdentifier} - w->f_value);`);
        rc.push(`            else if (w->op == 3U) __nv = (float)(instance->${attr.cIdentifier} * w->f_value);`);
        rc.push(`            else if (w->op == 4U) { if (w->f_value == 0.0f) return OPM_ERROR; __nv = (float)(instance->${attr.cIdentifier} / w->f_value); }`);
        rc.push(`            instance->${attr.cIdentifier} = __nv;`);
      }
    } else if (kind === 'bool') {
      rc.push(`            bool __nv = (w->i_value != 0);`);
      rc.push(`            instance->${attr.cIdentifier} = __nv;`);
    } else if (kind === 'uint32') {
      if (attr.overflow === 'wrap') {
        rc.push(`            uint32_t __cur = instance->${attr.cIdentifier};`);
        rc.push(`            uint32_t __nv = w->u_value;`);
        rc.push(`            if (w->op == 1U) __nv = (uint32_t)(__cur + w->u_value);`);
        rc.push(`            else if (w->op == 2U) __nv = (uint32_t)(__cur - w->u_value);`);
        rc.push(`            else if (w->op == 3U) __nv = (uint32_t)(__cur * w->u_value);`);
        rc.push(`            else if (w->op == 4U) { if (w->u_value == 0U) return OPM_ERROR; __nv = (uint32_t)(__cur / w->u_value); }`);
        rc.push(`            instance->${attr.cIdentifier} = __nv;`);
      } else if (attr.overflow === 'saturate') {
        const lo = attr.minimum ?? 0;
        const hi = attr.maximum ?? 4294967295;
        rc.push(`            uint64_t __nv = (uint64_t)w->u_value;`);
        rc.push(`            if (w->op == 1U) __nv = (uint64_t)instance->${attr.cIdentifier} + (uint64_t)w->u_value;`);
        rc.push(`            else if (w->op == 2U) __nv = ((uint64_t)instance->${attr.cIdentifier} >= (uint64_t)w->u_value) ? ((uint64_t)instance->${attr.cIdentifier} - (uint64_t)w->u_value) : 0U;`);
        rc.push(`            else if (w->op == 3U) __nv = (uint64_t)instance->${attr.cIdentifier} * (uint64_t)w->u_value;`);
        rc.push(`            else if (w->op == 4U) { if (w->u_value == 0U) return OPM_ERROR; __nv = (uint64_t)(instance->${attr.cIdentifier} / w->u_value); }`);
        rc.push(`            if (__nv < ${(lo as number)}ULL) __nv = ${(lo as number)}ULL;`);
        rc.push(`            if (__nv > ${(hi as number)}ULL) __nv = ${(hi as number)}ULL;`);
        rc.push(`            instance->${attr.cIdentifier} = (uint32_t)__nv;`);
      } else {
        rc.push(`            uint32_t __nv = w->u_value;`);
        rc.push(`            if (w->op == 1U) __nv = (uint32_t)(instance->${attr.cIdentifier} + w->u_value);`);
        rc.push(`            else if (w->op == 2U) __nv = (uint32_t)(instance->${attr.cIdentifier} - w->u_value);`);
        rc.push(`            else if (w->op == 3U) __nv = (uint32_t)(instance->${attr.cIdentifier} * w->u_value);`);
        rc.push(`            else if (w->op == 4U) { if (w->u_value == 0U) return OPM_ERROR; __nv = (uint32_t)(instance->${attr.cIdentifier} / w->u_value); }`);
        rc.push(`            instance->${attr.cIdentifier} = __nv;`);
      }
    } else {
      // int32 / enum (enum stored in its own type but commit as int)
      const cId = attr.cIdentifier;
      if (kind === 'enum') {
        const en = model.enums.find(e => e.id === (attr.type as { kind: 'enum'; enumId: string }).enumId);
        const castT = en && isSafeCIdentifier(en.cIdentifier) ? en.cIdentifier : 'uint32_t';
        // Documented no-op parity: compound operators (+=, -=, *=, /=) on
        // enum-typed attributes commit nothing beyond plain assignment, which
        // mirrors the TS runtime (numeric ops on enum values are not applied).
        rc.push(`            instance->${cId} = (${castT})w->u_value;`);
        rc.push(`            if (w->op != 0U) { (void)0; }`);
      } else if (attr.overflow === 'saturate') {
        const lo = attr.minimum ?? -2147483648;
        const hi = attr.maximum ?? 2147483647;
        rc.push(`            int64_t __nv = (int64_t)w->i_value;`);
        rc.push(`            if (w->op == 1U) __nv = (int64_t)instance->${cId} + (int64_t)w->i_value;`);
        rc.push(`            else if (w->op == 2U) __nv = (int64_t)instance->${cId} - (int64_t)w->i_value;`);
        rc.push(`            else if (w->op == 3U) __nv = (int64_t)instance->${cId} * (int64_t)w->i_value;`);
        rc.push(`            else if (w->op == 4U) { if (w->i_value == 0) return OPM_ERROR; __nv = (int64_t)(instance->${cId} / w->i_value); }`);
        rc.push(`            if (__nv < ${(lo as number)}LL) __nv = ${(lo as number)}LL;`);
        rc.push(`            if (__nv > ${(hi as number)}LL) __nv = ${(hi as number)}LL;`);
        rc.push(`            instance->${cId} = (int32_t)__nv;`);
      } else if (attr.overflow === 'wrap') {
        rc.push(`            int32_t __cur = instance->${cId};`);
        rc.push(`            int32_t __nv = w->i_value;`);
        rc.push(`            if (w->op == 1U) __nv = (int32_t)((int64_t)__cur + (int64_t)w->i_value);`);
        rc.push(`            else if (w->op == 2U) __nv = (int32_t)((int64_t)__cur - (int64_t)w->i_value);`);
        rc.push(`            else if (w->op == 3U) __nv = (int32_t)((int64_t)__cur * (int64_t)w->i_value);`);
        rc.push(`            else if (w->op == 4U) { if (w->i_value == 0) return OPM_ERROR; __nv = (int32_t)(__cur / w->i_value); }`);
        rc.push(`            instance->${cId} = __nv;`);
      } else {
        rc.push(`            int32_t __nv = w->i_value;`);
        rc.push(`            if (w->op == 1U) __nv = (int32_t)(instance->${cId} + w->i_value);`);
        rc.push(`            else if (w->op == 2U) __nv = (int32_t)(instance->${cId} - w->i_value);`);
        rc.push(`            else if (w->op == 3U) __nv = (int32_t)(instance->${cId} * w->i_value);`);
        rc.push(`            else if (w->op == 4U) { if (w->i_value == 0) return OPM_ERROR; __nv = (int32_t)(instance->${cId} / w->i_value); }`);
        rc.push(`            instance->${cId} = __nv;`);
      }
    }
    rc.push('            return OPM_OK;');
    rc.push('        }');
  });
  rc.push('        default: return OPM_ERROR;');
  rc.push('    }');
  rc.push('}');
  rc.push('');

  // Transitions commit: at most one transition per owner (parity with the TS
  // runtime): the highest-priority candidate wins and lower-priority
  // divergent candidates are dropped silently; equal-priority divergence on
  // different targets invalidates every candidate of that owner with
  // OPM_ERROR; same-target duplicates coalesce. Staged transitions are
  // appended in priority-descending, order-ascending sequence, so the first
  // staged candidate at the winning priority is the TS winner.
  rc.push('OPM_Status_t OPM_CommitTransitions(OPM_Instance_t *instance) {');
  rc.push('    OPM_Status_t st = OPM_OK;');
  rc.push('    uint16_t i, j, k;');
  rc.push('    if (!instance) return OPM_ERROR;');
  rc.push('    for (i = 0; i < instance->staged_trans_count; i++) {');
  rc.push('        uint16_t owner, maxPri, firstTarget;');
  rc.push('        uint8_t seen, conflict, kept;');
  rc.push('        if (!instance->staged_trans[i].valid) continue;');
  rc.push('        owner = instance->staged_trans[i].owner_index;');
  rc.push('        maxPri = 0U;');
  rc.push('        for (k = 0; k < instance->staged_trans_count; k++) {');
  rc.push('            uint16_t pk;');
  rc.push('            if (!instance->staged_trans[k].valid) continue;');
  rc.push('            if (instance->staged_trans[k].owner_index != owner) continue;');
  rc.push('            pk = (instance->staged_trans[k].link_index < OPM_NUM_LINKS) ? OPM_LINK_TABLE[instance->staged_trans[k].link_index].priority : 0U;');
  rc.push('            if (pk > maxPri) maxPri = pk;');
  rc.push('        }');
  rc.push('        firstTarget = 0xFFFFU; seen = 0U; conflict = 0U;');
  rc.push('        for (k = 0; k < instance->staged_trans_count; k++) {');
  rc.push('            uint16_t pk;');
  rc.push('            if (!instance->staged_trans[k].valid) continue;');
  rc.push('            if (instance->staged_trans[k].owner_index != owner) continue;');
  rc.push('            pk = (instance->staged_trans[k].link_index < OPM_NUM_LINKS) ? OPM_LINK_TABLE[instance->staged_trans[k].link_index].priority : 0U;');
  rc.push('            if (pk != maxPri) continue;');
  rc.push('            if (!seen) { firstTarget = instance->staged_trans[k].to_state_index; seen = 1U; }');
  rc.push('            else if (instance->staged_trans[k].to_state_index != firstTarget) { conflict = 1U; break; }');
  rc.push('        }');
  rc.push('        if (conflict) {');
  rc.push('            for (j = 0; j < instance->staged_trans_count; j++) {');
  rc.push('                if (!instance->staged_trans[j].valid) continue;');
  rc.push('                if (instance->staged_trans[j].owner_index != owner) continue;');
  rc.push('                instance->staged_trans[j].valid = 0U;');
  rc.push('            }');
  rc.push('            instance->diagnostics.transition_conflicts++;');
  rc.push('            instance->diagnostics.error_count++;');
  rc.push('            st = OPM_ERROR;');
  rc.push('        } else {');
  rc.push('            kept = 0U;');
  rc.push('            for (j = 0; j < instance->staged_trans_count; j++) {');
  rc.push('                uint16_t pk;');
  rc.push('                if (!instance->staged_trans[j].valid) continue;');
  rc.push('                if (instance->staged_trans[j].owner_index != owner) continue;');
  rc.push('                pk = (instance->staged_trans[j].link_index < OPM_NUM_LINKS) ? OPM_LINK_TABLE[instance->staged_trans[j].link_index].priority : 0U;');
  rc.push('                if ((pk != maxPri) || kept) { instance->staged_trans[j].valid = 0U; }');
  rc.push('                else { kept = 1U; }');
  rc.push('            }');
  rc.push('        }');
  rc.push('    }');
  rc.push('    for (i = 0; i < instance->staged_trans_count; i++) {');
  rc.push('        if (!instance->staged_trans[i].valid) continue;');
  rc.push('        {');
  rc.push('            uint16_t owner = instance->staged_trans[i].owner_index;');
  rc.push('            uint16_t toSt = instance->staged_trans[i].to_state_index;');
  rc.push('#if (OPM_NUM_OBJECTS > 0U)');
  rc.push('            if (owner < OPM_NUM_OBJECTS) {');
  rc.push('                instance->active_states[owner] = (uint16_t)(toSt + 1U);');
  rc.push('#if (OPM_NUM_STATES > 0U)');
  rc.push('                if (toSt < OPM_NUM_STATES) instance->state_timers[toSt] = 0U;');
  rc.push('#endif');
  rc.push('            }');
  rc.push('#else');
  rc.push('            (void)owner; (void)toSt;');
  rc.push('#endif');
  rc.push('        }');
  rc.push('    }');
  rc.push('    if (st != OPM_OK) instance->diagnostics.last_status = OPM_WorstStatus(instance->diagnostics.last_status, st);');
  rc.push('    return st;');
  rc.push('}');
  rc.push('');

  // State actions: exit-before-entry ordering around committed transitions.
  // Exit actions run for the recorded from-state (when it differs from the
  // target), then entry actions run for the target. Failed expressions apply
  // nothing and report OPM_ERROR (fail-closed).
  const emitStateAssigns = (list: typeof model.states[number]['entryAssignments'], indent: string): void => {
    for (const a of list) {
      const target = resolveAssignmentLvalue(a);
      const attr = allAttrs.find(x => x.cIdentifier === target);
      const cT = attr ? (attr.type.kind === 'bool' ? 'bool' : attr.type.kind === 'int32' ? 'int32_t' : attr.type.kind === 'uint32' ? 'uint32_t' : attr.type.kind === 'float32' ? 'float' : 'uint32_t') : 'int32_t';
      const lval = `instance->${target}`;
      const expr = renderCExpression(a.expressionIr, 'instance', '__ok', enumMemberIds);
      rc.push(`${indent}{`);
      rc.push(`${indent}    bool __ok = true;`);
      if (a.operator === '=') {
        rc.push(`${indent}    ${cT} __v = (${cT})(${expr});`);
        rc.push(`${indent}    if (!__ok) { st = OPM_ERROR; break; }`);
        rc.push(`${indent}    ${lval} = __v;`);
      } else {
        rc.push(`${indent}    ${cT} __rhs = (${cT})(${expr});`);
        rc.push(`${indent}    if (!__ok) { st = OPM_ERROR; break; }`);
        if (a.operator === '/=') {
          rc.push(`${indent}    if (__rhs == (${cT})0) { st = OPM_ERROR; break; }`);
        }
        rc.push(`${indent}    ${lval} ${a.operator} __rhs;`);
      }
      rc.push(`${indent}}`);
    }
  };
  rc.push('OPM_Status_t OPM_RunStateActions(OPM_Instance_t *instance) {');
  rc.push('    OPM_Status_t st = OPM_OK;');
  rc.push('    uint16_t k;');
  rc.push('    if (!instance) return OPM_ERROR;');
  rc.push('    /* exit actions observe post-commit values; entry actions run after */');
  rc.push('    for (k = 0; k < instance->staged_trans_count; k++) {');
  rc.push('        uint16_t fromSt;');
  rc.push('        uint16_t toSt;');
  rc.push('        if (!instance->staged_trans[k].valid) continue;');
  rc.push('        fromSt = instance->staged_trans[k].from_state_index;');
  rc.push('        toSt = instance->staged_trans[k].to_state_index;');
  rc.push('        if ((fromSt != 0xFFFFU) && (fromSt != toSt)) {');
  rc.push('            switch (fromSt) {');
  model.states.forEach((sItem, sIdx) => {
    const exits = sItem.exitAssignments.filter(a => a.enabled && resolveAssignmentLvalue(a) !== '');
    if (exits.length === 0) return;
    rc.push(`                case ${sIdx}U: {`);
    emitStateAssigns(exits, '                    ');
    rc.push('                    break;');
    rc.push('                }');
  });
  rc.push('                default: break;');
  rc.push('            }');
  rc.push('        }');
  rc.push('        switch (toSt) {');
  model.states.forEach((sItem, sIdx) => {
    const entries = sItem.entryAssignments.filter(a => a.enabled && resolveAssignmentLvalue(a) !== '');
    if (entries.length === 0) return;
    rc.push(`            case ${sIdx}U: {`);
    emitStateAssigns(entries, '                    ');
    rc.push('                break;');
    rc.push('            }');
  });
  rc.push('            default: break;');
  rc.push('        }');
  rc.push('    }');
  rc.push('    if (st != OPM_OK) { instance->diagnostics.error_count++; instance->diagnostics.last_status = OPM_WorstStatus(instance->diagnostics.last_status, st); }');
  rc.push('    return st;');
  rc.push('}');
  rc.push('');

  // Bounded enqueue shared by timeout dispatch (parity with dispatchOpmEvent
  // overflow policy: rejectNewest drops the newcomer, dropOldest evicts the
  // oldest and accepts; both count an event drop and report an error).
  rc.push('static uint8_t OPM_EnqueueEvent(OPM_Instance_t *instance, OPM_EventId_t event_id, OPM_Status_t *worst) {');
  rc.push('    if (instance->queue_count >= OPM_EVENT_QUEUE_CAPACITY) {');
  rc.push('        instance->diagnostics.event_drops++;');
  rc.push('#if OPM_EVENT_OVERFLOW_DROP_OLDEST');
  rc.push('        /* dropOldest: evict oldest, accept newest */');
  rc.push('        instance->event_queue[instance->queue_head] = event_id;');
  rc.push('        instance->queue_head = (uint16_t)((instance->queue_head + 1U) % OPM_EVENT_QUEUE_CAPACITY);');
  rc.push('        instance->queue_tail = (uint16_t)((instance->queue_tail + 1U) % OPM_EVENT_QUEUE_CAPACITY);');
  rc.push('        OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, worst);');
  rc.push('        return 1U;');
  rc.push('#else');
  rc.push('        OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, worst);');
  rc.push('        return 0U;');
  rc.push('#endif');
  rc.push('    }');
  rc.push('    instance->event_queue[instance->queue_tail] = event_id;');
  rc.push('    instance->queue_tail = (uint16_t)((instance->queue_tail + 1U) % OPM_EVENT_QUEUE_CAPACITY);');
  rc.push('    instance->queue_count++;');
  rc.push('    return 1U;');
  rc.push('}');
  rc.push('');

  // Static per-link/per-process facts for the parity scheduler below.
  const nLinks = model.links.length;
  const nProcs = model.processes.length;
  const nEvents = model.events.length;
  const NL = Math.max(1, nLinks);
  const NE = Math.max(1, nEvents);
  const ND = Math.max(1, Math.trunc(model.settings.maxTransitions));
  const NC = Math.max(1, Math.trunc(model.settings.maxStagedWrites));
  const stateIdxById = new Map(model.states.map((s, i) => [s.id, i] as [string, number]));
  const objIdxById = new Map(model.objects.map((o, i) => [o.id, i] as [string, number]));
  const evIdxById = new Map(model.events.map((e, i) => [e.id, i] as [string, number]));
  // Source-state leg of gateChecksPass: owner/state indexes, or 0xFFFF when
  // the link is not sourced from a state.
  const linkSrcOwner: number[] = model.links.map(l => {
    const si = stateIdxById.get(l.sourceId);
    if (si === undefined) return 0xffff;
    const owner = objIdxById.get(model.states[si].parentObjectId);
    return owner === undefined ? 0xffff : owner;
  });
  const linkSrcState: number[] = model.links.map(l => stateIdxById.get(l.sourceId) ?? 0xffff);
  // Event leg: 1 when the link carries no event or a resolvable one; 0 when
  // the event id can never be queued (gate must fail, as in TS).
  const linkEvOk: number[] = model.links.map(
    l => (!l.eventId || evIdxById.has(l.eventId) ? 1 : 0),
  );
  const linkEventIdx: number[] = model.links.map(
    l => (l.eventId && evIdxById.has(l.eventId) ? evIdxById.get(l.eventId)! : 0xffff),
  );
  interface TimeoutGen { owner: number; st: number; ms: number; ev: string | null }
  const timeoutGens: TimeoutGen[] = [];
  model.states.forEach((st, stIdx) => {
    if (st.timeoutMs && st.timeoutEventId) {
      const owner = objIdxById.get(st.parentObjectId);
      if (owner === undefined) return;
      const ev = model.events.find(e => e.id === st.timeoutEventId);
      timeoutGens.push({
        owner,
        st: stIdx,
        ms: Math.max(0, Math.trunc(st.timeoutMs)),
        ev: ev && isSafeCIdentifier(ev.cIdentifier) ? ev.cIdentifier : null,
      });
    }
  });

  // OPM_Step: full phase pipeline (parity with runtime.ts stepOpmRuntime).
  rc.push('OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms) {');
  rc.push('    OPM_Status_t worst = OPM_OK;');
  rc.push('    uint16_t i, k;');
  rc.push('    if (!instance) return OPM_ERROR;');
  rc.push('    instance->staged_count = 0U;');
  rc.push('    instance->staged_trans_count = 0U;');
  rc.push('    instance->committed_count = 0U;');
  rc.push('    instance->last_waiting = 0U;');
  rc.push(`    OPM_DelayedTrans_t __ready[${ND}U];`);
  rc.push('    uint16_t __ready_count = 0U;');
  rc.push('#if (OPM_NUM_LINKS > 0U)');
  rc.push('    for (i = 0U; i < OPM_NUM_LINKS; i++) { instance->link_traversed[i] = 0U; }');
  rc.push('#endif');
  if (timeoutGens.length === 0) {
    rc.push('    (void)OPM_EnqueueEvent;');
  }
  if (nLinks === 0) {
    rc.push('    (void)OPM_HasQueuedEvent;');
  }
  rc.push('    /* Phase sampleInputs: input sampling — latch hardware inputs */');
  rc.push('    OPM_IO_ReadInputs(instance);');
  rc.push('    /* Phase advanceTimers: state timeouts (active state only, then dispatch) */');
  for (const t of timeoutGens) {
    rc.push(`    { /* timeout of state ${t.st}U */`);
    rc.push(`        if (instance->active_states[${t.owner}U] == (${t.st}U + 1U)) {`);
    rc.push(`            if (instance->state_timers[${t.st}U] > (0xFFFFFFFFU - delta_ms)) { instance->state_timers[${t.st}U] = 0xFFFFFFFFU; }`);
    rc.push(`            else { instance->state_timers[${t.st}U] += delta_ms; }`);
    rc.push(`            if (instance->state_timers[${t.st}U] >= ${t.ms}U) {`);
    if (t.ev) {
      rc.push(`                (void)OPM_EnqueueEvent(instance, ${t.ev}, &worst);`);
    }
    rc.push(`                instance->state_timers[${t.st}U] = 0U;`);
    rc.push('            }');
    rc.push('        }');
    rc.push('    }');
  }
  rc.push('    /* Phase advanceTimers: delayed transitions (decrement, ready, stale-drop) */');
  rc.push('    {');
  rc.push('        uint16_t __w = 0U;');
  rc.push('        for (i = 0U; i < instance->delayed_count; i++) {');
  rc.push('            if (!instance->delayed_trans[i].valid) continue;');
  rc.push('            if (instance->delayed_trans[i].remaining_ms <= delta_ms) {');
  rc.push('                uint8_t __stale = 0U;');
  rc.push('                if ((instance->delayed_trans[i].from_state_index != 0xFFFFU)');
  rc.push('                    && (instance->active_states[instance->delayed_trans[i].owner_index]');
  rc.push('                        != (uint16_t)(instance->delayed_trans[i].from_state_index + 1U))) {');
  rc.push('                    __stale = 1U;');
  rc.push('                }');
  rc.push('                if (!__stale) {');
  rc.push(`                    if (__ready_count < ${ND}U) { __ready[__ready_count++] = instance->delayed_trans[i]; }`);
  rc.push('                    else { instance->diagnostics.transition_drops++; OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, &worst); }');
  rc.push('                }');
  rc.push('            } else {');
  rc.push('                instance->delayed_trans[i].remaining_ms -= delta_ms;');
  rc.push('                if (__w != i) { instance->delayed_trans[__w] = instance->delayed_trans[i]; }');
  rc.push('                __w++;');
  rc.push('            }');
  rc.push('        }');
  rc.push('        instance->delayed_count = __w;');
  rc.push(`        for (k = __w; k < ${ND}U; k++) { instance->delayed_trans[k].valid = 0U; }`);
  rc.push('    }');
  rc.push('    /* Phase activate: link traversal gates (fail-closed, mirrors gateChecksPass) */');
  rc.push('#if (OPM_NUM_LINKS > 0U)');
  rc.push('    {');
  const srcOwnerList = linkSrcOwner.map(v => (v === 0xffff ? '0xFFFFU' : `${v}U`)).join(', ') || '0xFFFFU';
  const srcStateList = linkSrcState.map(v => (v === 0xffff ? '0xFFFFU' : `${v}U`)).join(', ') || '0xFFFFU';
  const evOkList = linkEvOk.map(v => `${v}U`).join(', ') || '1U';
  rc.push(`        static const uint16_t OPM_LINK_SRC_OWNER[${NL}U] = { ${srcOwnerList} };`);
  rc.push(`        static const uint16_t OPM_LINK_SRC_STATE[${NL}U] = { ${srcStateList} };`);
  rc.push(`        static const uint8_t OPM_LINK_EV_OK[${NL}U] = { ${evOkList} };`);
  rc.push('        for (i = 0U; i < OPM_NUM_LINKS; i++) {');
  rc.push('            uint8_t __g = 1U;');
  rc.push('            if (OPM_LINK_SRC_OWNER[i] != 0xFFFFU) {');
  rc.push('                if (instance->active_states[OPM_LINK_SRC_OWNER[i]] != (uint16_t)(OPM_LINK_SRC_STATE[i] + 1U)) { __g = 0U; }');
  rc.push('            }');
  rc.push('            if ((__g != 0U) && (OPM_LINK_EV_OK[i] == 0U)) { __g = 0U; }');
  rc.push('            if ((__g != 0U) && (OPM_LINK_TABLE[i].has_event != 0U)) {');
  rc.push('                if (!OPM_HasQueuedEvent(instance, OPM_LINK_TABLE[i].event_id)) { __g = 0U; }');
  rc.push('            }');
  rc.push('            if (__g != 0U) {');
  rc.push('                bool __gok = true;');
  rc.push('                bool __gv = OPM_Model_EvaluateLinkGuard(i, instance, &__gok);');
  rc.push('                if (!__gok || !__gv) { __g = 0U; }');
  rc.push('            }');
  rc.push('            instance->link_traversed[i] = __g;');
  rc.push('        }');
  rc.push('    }');
  rc.push('#endif');
  // Phase activate (continued): per-process eligibility with condition and
  // trigger legs (mirrors the TS activation sequence: debounce, condition
  // links, activation kind, guard). Timers and last-fire use pre-step time.
  rc.push('    /* Phase activate: process eligibility (debounce, links, kind, guard) */');
  model.processes.forEach((proc, pi) => {
    const condLinks = model.links
      .map((l, li) => ({ l, li }))
      .filter(({ l }) => l.targetId === proc.id && l.type === 'condition')
      .map(({ li }) => li);
    const trigLinks = model.links
      .map((l, li) => ({ l, li }))
      .filter(({ l }) => l.targetId === proc.id && l.type === 'trigger')
      .map(({ li }) => li);
    const actCode = proc.activation === 'triggered' ? 1 : proc.activation === 'both' ? 2 : 0;
    rc.push(`    { /* process ${pi}U eligibility */`);
    rc.push('        uint8_t __elig = 1U;');
    rc.push('        uint8_t __debOk = 1U;');
    rc.push('        uint8_t __condOk = 1U;');
    rc.push('        uint8_t __hasTrigger = 0U;');
    rc.push('        uint8_t __due = 1U;');
    rc.push(`        if ((OPM_PROCESS_TABLE[${pi}U].debounce_ms > 0U) && (instance->process_last_fire[${pi}U] != 0xFFFFFFFFU)) {`);
    rc.push(`            uint32_t __since = instance->time_ms - instance->process_last_fire[${pi}U];`);
    rc.push(`            if (__since < OPM_PROCESS_TABLE[${pi}U].debounce_ms) { __elig = 0U; __debOk = 0U; }`);
    rc.push('        }');
    for (const li of condLinks) {
      rc.push(`        if (instance->link_traversed[${li}U] == 0U) { __elig = 0U; __condOk = 0U; }`);
    }
    for (const li of trigLinks) {
      rc.push(`        if (instance->link_traversed[${li}U] != 0U) { __hasTrigger = 1U; }`);
    }
    rc.push(`        { /* activation kind ${actCode}U */`);
    rc.push(`            uint32_t __period = OPM_PROCESS_TABLE[${pi}U].period_ms;`);
    rc.push(`            uint32_t __accum = instance->process_timers[${pi}U] + delta_ms;`);
    rc.push('            if ((__period != 0U) && (__accum < __period)) { __due = 0U; }');
    if (actCode === 1) {
      rc.push('            if (__hasTrigger == 0U) { __elig = 0U; }');
    } else if (actCode === 0) {
      rc.push('            if (__due == 0U) { __elig = 0U; }');
    } else {
      rc.push('            if ((__hasTrigger == 0U) && (__due == 0U)) { __elig = 0U; }');
    }
    rc.push('        }');
    rc.push('        if (__elig != 0U) {');
    rc.push('            bool __ok = true;');
    rc.push(`            bool __g = OPM_Model_EvaluateGuard(${pi}U, instance, &__ok);`);
    rc.push('            if (!__ok || !__g) { __elig = 0U; }');
    rc.push('        }');
    rc.push(`        instance->process_fired[${pi}U] = (__elig != 0U) ? 1U : 0U;`);
    rc.push(`        if (__elig != 0U) { instance->process_timers[${pi}U] = 0U; instance->process_last_fire[${pi}U] = instance->time_ms; }`);
    rc.push('        else {');
    rc.push(`            if (instance->process_timers[${pi}U] > (0xFFFFFFFFU - delta_ms)) { instance->process_timers[${pi}U] = 0xFFFFFFFFU; }`);
    rc.push(`            else { instance->process_timers[${pi}U] += delta_ms; }`);
    if (actCode === 1 || actCode === 2) {
      rc.push('            /* waiting: blocked only by a missing trigger (TS hasWaitingTriggered) */');
      rc.push('            if ((__debOk != 0U) && (__condOk != 0U) && (__hasTrigger == 0U)) {');
      if (actCode === 1) {
        rc.push('                instance->last_waiting = 1U;');
      } else {
        rc.push('                if (__due == 0U) { instance->last_waiting = 1U; }');
      }
      rc.push('            }');
    }
    rc.push('        }');
    rc.push('        (void)__debOk; (void)__condOk; (void)__hasTrigger; (void)__due;');
    rc.push('    }');
  });
  // Causality (firedSet): a process-sourced result link (process source,
  // non-process target) traverses only when its source process fired.
  {
    const resultLinks = model.links
      .map((link, li) => ({ link, li }))
      .filter(({ link }) => {
        const spi = model.processes.findIndex(p => p.id === link.sourceId);
        const targetIsProc = model.processes.some(p => p.id === link.targetId);
        return spi >= 0 && !targetIsProc;
      })
      .map(({ link, li }) => ({ li, spi: model.processes.findIndex(p => p.id === link.sourceId) }));
    if (resultLinks.length > 0) {
      rc.push('    /* causality: result links require the source process to have fired */');
      for (const { li, spi } of resultLinks) {
        rc.push(`    if (instance->process_fired[${spi}U] == 0U) { instance->link_traversed[${li}U] = 0U; }`);
      }
    }
  }
  // Event consumption: one FIFO occurrence per consumed (traversed) event,
  // mirroring the TS publishOutputs consumption of consumedEventIds.
  rc.push('    /* consume one FIFO occurrence per traversed-link event */');
  rc.push('    {');
  const linkEvIdxList = linkEventIdx.map(v => (v === 0xffff ? '0xFFFFU' : `${v}U`)).join(', ') || '0xFFFFU';
  rc.push(`        static const uint16_t OPM_LINK_EVENT_IDX[${NL}U] = { ${linkEvIdxList} };`);
  rc.push(`        uint8_t __consumed[${NE}U] = { 0U };`);
  rc.push('        uint16_t __e, __n;');
  rc.push('        (void)__consumed;');
  rc.push('#if (OPM_NUM_LINKS > 0U)');
  rc.push('        for (i = 0U; i < OPM_NUM_LINKS; i++) {');
  rc.push('            if ((instance->link_traversed[i] != 0U) && (OPM_LINK_EVENT_IDX[i] != 0xFFFFU)) {');
  rc.push('                __consumed[OPM_LINK_EVENT_IDX[i]] = 1U;');
  rc.push('            }');
  rc.push('        }');
  rc.push('#endif');
  rc.push('#if (OPM_NUM_EVENTS > 0U)');
  rc.push('        for (__e = 0U; __e < OPM_NUM_EVENTS; __e++) {');
  rc.push('            if (__consumed[__e] != 0U) {');
  rc.push('                uint16_t __pos = instance->queue_head;');
  rc.push('                uint16_t __found = 0xFFFFU;');
  rc.push('                for (__n = 0U; __n < instance->queue_count; __n++) {');
  rc.push('                    if (instance->event_queue[__pos] == (OPM_EventId_t)(__e + 1U)) { __found = __pos; break; }');
  rc.push('                    __pos = (uint16_t)((__pos + 1U) % OPM_EVENT_QUEUE_CAPACITY);');
  rc.push('                }');
  rc.push('                if (__found != 0xFFFFU) {');
  rc.push('                    uint16_t __cur = __found;');
  rc.push('                    while (__cur != instance->queue_tail) {');
  rc.push('                        uint16_t __nxt = (uint16_t)((__cur + 1U) % OPM_EVENT_QUEUE_CAPACITY);');
  rc.push('                        instance->event_queue[__cur] = instance->event_queue[__nxt];');
  rc.push('                        __cur = __nxt;');
  rc.push('                    }');
  rc.push('                    instance->queue_tail = (uint16_t)((instance->queue_tail + OPM_EVENT_QUEUE_CAPACITY - 1U) % OPM_EVENT_QUEUE_CAPACITY);');
  rc.push('                    instance->queue_count--;');
  rc.push('                }');
  rc.push('            }');
  rc.push('        }');
  rc.push('#endif');
  rc.push('        (void)__e; (void)__n;');
  rc.push('    }');
  rc.push('    /* Phase evaluate: snapshot evaluation — immutable snapshot, fail-closed */');
  rc.push('    /* Phase stage: staging — evaluate action expressions into bounded buffer */');
  rc.push('    /* Phase capacity checking: enforce OPM_MAX_STAGED_WRITES, drop lowest priority */');
  // Generate per-process staging calls in priority-first order (mirrors the TS
  // fired-process sort: descending priority, then ascending generated order),
  // so bounded-buffer truncation keeps the same highest-priority writes.
  if (model.processes.length > 0) {
    const procOrder = model.processes
      .map((proc, gi) => ({ gi, priority: proc.priority ?? 1, order: proc.order ?? gi }))
      .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.order - b.order))
      .map(e => e.gi);
    rc.push('    {');
    rc.push('        uint16_t p;');
    rc.push(`        static const uint16_t OPM_PROC_STAGE_ORDER[OPM_NUM_PROCESSES] = { ${procOrder.map(gi => `${gi}U`).join(', ')} };`);
    rc.push('        uint16_t rank;');
    rc.push('        for (rank = 0; rank < OPM_NUM_PROCESSES; rank++) {');
    rc.push('        p = OPM_PROC_STAGE_ORDER[rank];');
    rc.push('        { uint16_t pri;');
    rc.push('        if (!instance->process_fired[p]) continue;');
    rc.push('        pri = OPM_PROCESS_TABLE[p].priority;');
    model.processes.forEach((proc, gi) => {
      const enabledAssigns = proc.assignments.filter(x => x.enabled && resolveAssignmentLvalue(x) !== '');
      if (enabledAssigns.length === 0) return;
      rc.push(`        if (p == ${gi}U) {`);
      enabledAssigns.forEach((asgn, ai) => {
        const target = resolveAssignmentLvalue(asgn);
        const gIdx = allAttrs.findIndex(x => x.cIdentifier === target);
        if (gIdx < 0) return;
        const attr = allAttrs[gIdx];
        const isFloat = attr.type.kind === 'float32' ? 1 : 0;
        const opCode = asgn.operator === '=' ? 0 : asgn.operator === '+=' ? 1 : asgn.operator === '-=' ? 2 : asgn.operator === '*=' ? 3 : 4;
        rc.push('            {');
        rc.push('                bool __ok = true;');
        rc.push('                float __f = 0.0f; int32_t __i = 0; uint32_t __u = 0U;');
        rc.push(`                OPM_Status_t __st = OPM_Model_EvaluateAction(${gi}U, ${ai}U, instance, &__f, &__i, &__u, 0, &__ok);`);
        rc.push('                if (!__ok || (__st != OPM_OK)) { OPM_RecordStatus(instance, OPM_ERROR, &worst); }');
        rc.push(`                else { OPM_Status_t __sst = OPM_StageWrite(instance, ${gIdx}U, ${opCode}U, (uint8_t)pri, __f, __i, __u, ${isFloat}U);`);
        rc.push('                    if (__sst != OPM_OK) OPM_RecordStatus(instance, __sst, &worst); }');
        rc.push('            }');
      });
      rc.push('        }');
    });
    rc.push('        }');
    rc.push('        }');
    rc.push('    }');
  }
  // Stage traversed-link assignments (parity with runtime.ts link staging):
  // an assignment is staged only when its link traversed in the activate
  // phase (recorded in link_traversed). Untraversed links stage nothing.
  // Evaluation failures record OPM_ERROR and capacity overflow is handled
  // priority-first by OPM_StageWrite.
  {
    const linksWithAssigns = model.links
      .map((link, li) => ({ link, li }))
      .filter(({ link }) => link.assignments.some(x => x.enabled && resolveAssignmentLvalue(x) !== ''));
    if (linksWithAssigns.length > 0) {
      rc.push('    /* Stage link assignments from traversed links (fail-closed). */');
      rc.push('    {');
      for (const { link, li } of linksWithAssigns) {
        const linkPri = link.priority ?? 1;
        rc.push(`        if (instance->link_traversed[${li}U] != 0U) {`);
        link.assignments.forEach((asgn, ai) => {
          const target = resolveAssignmentLvalue(asgn);
          if (!asgn.enabled || target === '') return;
          const gIdx = allAttrs.findIndex(x => x.cIdentifier === target);
          if (gIdx < 0) return;
          const attr = allAttrs[gIdx];
          const isFloat = attr.type.kind === 'float32' ? 1 : 0;
          const opCode = asgn.operator === '=' ? 0 : asgn.operator === '+=' ? 1 : asgn.operator === '-=' ? 2 : asgn.operator === '*=' ? 3 : 4;
          rc.push('            {');
          rc.push('                bool __ok = true;');
          rc.push('                float __f = 0.0f; int32_t __i = 0; uint32_t __u = 0U;');
          rc.push(`                OPM_Status_t __lst = OPM_Model_EvaluateLinkAction(${li}U, ${ai}U, instance, &__f, &__i, &__u, 0, &__ok);`);
          rc.push('                if (!__ok || (__lst != OPM_OK)) { OPM_RecordStatus(instance, OPM_ERROR, &worst); }');
          rc.push(`                else { OPM_Status_t __lsst = OPM_StageWrite(instance, ${gIdx}U, ${opCode}U, ${linkPri}U, __f, __i, __u, ${isFloat}U);`);
          rc.push('                    if (__lsst != OPM_OK) OPM_RecordStatus(instance, __lsst, &worst); }');
          rc.push('            }');
        });
        rc.push('        }');
      }
      rc.push('    }');
    }
  }
  rc.push('    if (instance->staged_count > OPM_MAX_STAGED_WRITES) {');
  rc.push('        instance->staged_count = OPM_MAX_STAGED_WRITES;');
  rc.push('        instance->diagnostics.staged_drops++;');
  rc.push('        OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, &worst);');
  rc.push('    }');
  rc.push('    /* Phase resolveConflicts: conflict resolution — priority wins */');
  rc.push('    {');
  rc.push('        OPM_Status_t __cst = OPM_ResolveWriteConflicts(instance);');
  rc.push('        if (__cst != OPM_OK) worst = OPM_WorstStatus(worst, __cst);');
  rc.push('    }');
  rc.push('    /* Phase commit: atomic commit — apply winning writes only */');
  rc.push('    {');
  rc.push('        uint16_t i;');
  rc.push('        for (i = 0; i < instance->staged_count; i++) {');
  rc.push('            if (!instance->staged_writes[i].valid) continue;');
  rc.push('            {');
  rc.push('                OPM_Status_t __ast = OPM_ApplyWrite(instance, &instance->staged_writes[i]);');
  rc.push(`                if (__ast != OPM_OK) { OPM_RecordStatus(instance, __ast, &worst); }`);
  rc.push(`                else if (instance->committed_count < ${NC}U) { instance->committed_attrs[instance->committed_count++] = instance->staged_writes[i].attr_index; }`);
  rc.push('            }');
  rc.push('        }');
  rc.push('    }');
  // Stage transitions from traversed links (priority-first emission order:
  // descending priority, then ascending link order, mirroring the TS
  // candidate sort), so the bounded drop-newest overflow keeps the same
  // highest-priority transitions. Delayed links enqueue instead of staging.
  rc.push('    /* Stage transitions from traversed links (priority-first order). */');
  if (model.links.length > 0) {
    const orderedLinks = model.links
      .map((link, li) => ({ link, li }))
      .sort((a, b) => ((b.link.priority ?? 1) !== (a.link.priority ?? 1)
        ? (b.link.priority ?? 1) - (a.link.priority ?? 1)
        : (a.link.order ?? a.li) - (b.link.order ?? b.li)));
    orderedLinks.forEach(({ link, li }) => {
      if (!link.transition) return;
      const ownerIdx = objIdxById.get(link.transition.ownerObjectId);
      const toIdx = stateIdxById.get(link.transition.targetStateId);
      if (ownerIdx === undefined || toIdx === undefined) return;
      const srcIdx = link.transition.sourceStateId
        ? stateIdxById.get(link.transition.sourceStateId)
        : undefined;
      const fromExpr = srcIdx === undefined ? '0xFFFFU' : `${srcIdx}U`;
      const srcCheck = srcIdx === undefined
        ? '1U'
        : `(instance->active_states[${ownerIdx}U] == (${srcIdx}U + 1U))`;
      const delayMs = Math.max(0, Math.trunc(link.delayMs ?? 0));
      rc.push(`    { /* link ${li}U transition */`);
      rc.push(`        if ((instance->link_traversed[${li}U] != 0U) && (${srcCheck})) {`);
      if (delayMs > 0) {
        rc.push('            uint8_t __dup = 0U;');
        rc.push(`            for (k = 0U; k < ${ND}U; k++) {`);
        rc.push(`                if (instance->delayed_trans[k].valid && (instance->delayed_trans[k].link_index == ${li}U) && (instance->delayed_trans[k].owner_index == ${ownerIdx}U)) { __dup = 1U; break; }`);
        rc.push('            }');
        rc.push('            if (__dup == 0U) {');
        rc.push(`                if (instance->delayed_count < ${ND}U) {`);
        rc.push(`                    OPM_DelayedTrans_t *__d = &instance->delayed_trans[instance->delayed_count++];`);
        rc.push(`                    __d->owner_index = ${ownerIdx}U; __d->from_state_index = ${fromExpr}; __d->to_state_index = ${toIdx}U; __d->link_index = ${li}U; __d->remaining_ms = ${delayMs}U; __d->valid = 1U;`);
        rc.push('                } else {');
        rc.push('                    instance->diagnostics.transition_drops++;');
        rc.push('                    OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, &worst);');
        rc.push('                }');
        rc.push('            }');
      } else {
        rc.push('            if (instance->staged_trans_count < OPM_MAX_TRANSITIONS) {');
        rc.push('                OPM_StagedTransition_t *__t = &instance->staged_trans[instance->staged_trans_count++];');
        rc.push(`                __t->owner_index = ${ownerIdx}U; __t->to_state_index = ${toIdx}U; __t->link_index = ${li}U; __t->valid = 1U;`);
        rc.push(`                __t->from_state_index = ${fromExpr};`);
        rc.push('            } else {');
        rc.push('                instance->diagnostics.transition_drops++;');
        rc.push('                OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, &worst);');
        rc.push('            }');
      }
      rc.push('        }');
      rc.push('    }');
    });
  }
  // Append transitions whose delay elapsed this step (TS readyTransitions).
  rc.push('    { /* append delay-ready transitions */');
  rc.push('        for (i = 0U; i < __ready_count; i++) {');
  rc.push('            if (instance->staged_trans_count < OPM_MAX_TRANSITIONS) {');
  rc.push('                OPM_StagedTransition_t *__t = &instance->staged_trans[instance->staged_trans_count++];');
  rc.push('                __t->owner_index = __ready[i].owner_index;');
  rc.push('                __t->from_state_index = __ready[i].from_state_index;');
  rc.push('                __t->to_state_index = __ready[i].to_state_index;');
  rc.push('                __t->link_index = __ready[i].link_index;');
  rc.push('                __t->valid = 1U;');
  rc.push('            } else {');
  rc.push('                instance->diagnostics.transition_drops++;');
  rc.push('                OPM_RecordStatus(instance, OPM_QUEUE_OVERFLOW, &worst);');
  rc.push('            }');
  rc.push('        }');
  rc.push('    }');
  rc.push('    {');
  rc.push('        OPM_Status_t __tst = OPM_CommitTransitions(instance);');
  rc.push('        if (__tst != OPM_OK) worst = OPM_WorstStatus(worst, __tst);');
  rc.push('    }');
  rc.push('    /* Phase stateActions: state actions — exit-before-entry, fail-closed */');
  rc.push('    {');
  rc.push('        OPM_Status_t __sst2 = OPM_RunStateActions(instance);');
  rc.push('        if (__sst2 != OPM_OK) worst = OPM_WorstStatus(worst, __sst2);');
  rc.push('    }');
  rc.push('    /* Phase publishOutputs: output publication (consumption done in activate) */');
  rc.push('    OPM_IO_WriteOutputs(instance);');
  rc.push('    /* Phase trace + diagnostics: bounded ring, highest-severity status */');
  rc.push('    {');
  rc.push('        uint32_t slot = (uint32_t)(instance->trace_head % OPM_TRACE_CAPACITY);');
  rc.push('        instance->trace_ids[slot] = instance->step_index;');
  rc.push('        instance->trace_head++;');
  rc.push('        if (instance->trace_count < OPM_TRACE_CAPACITY) instance->trace_count++;');
  rc.push('        OPM_Trace_Step(instance);');
  rc.push('    }');
  rc.push('    instance->step_index++;');
  rc.push('    if (instance->time_ms > (0xFFFFFFFFU - delta_ms)) { instance->time_ms = 0xFFFFFFFFU; }');
  rc.push('    else { instance->time_ms += delta_ms; }');
  rc.push('    if (worst != OPM_OK) instance->diagnostics.last_status = OPM_WorstStatus(instance->diagnostics.last_status, worst);');
  rc.push('    else if (instance->diagnostics.last_status == OPM_OK) instance->diagnostics.last_status = OPM_OK;');
  rc.push('    return worst;');
  rc.push('}');
  rc.push('');
  files.push({ name: 'opm_runtime.c', content: rc.join('\n') });

  // --- opm_io.h ---
  files.push({
    name: 'opm_io.h',
    content: [
      '#ifndef OPM_IO_H', '#define OPM_IO_H', '', '#include "opm_model.h"', '',
      '#ifdef __cplusplus', 'extern "C" {', '#endif', '',
      'void OPM_IO_ReadInputs(OPM_Instance_t *instance);',
      'void OPM_IO_WriteOutputs(const OPM_Instance_t *instance);',
      '', '#ifdef __cplusplus', '}', '#endif', '', '#endif', '',
    ].join('\n'),
  });

  // --- opm_io.c ---
  files.push({
    name: 'opm_io.c',
    content: [
      '#include "opm_io.h"', '',
      'void OPM_IO_ReadInputs(OPM_Instance_t *instance) {',
      '    (void)instance;',
      '}',
      '',
      'void OPM_IO_WriteOutputs(const OPM_Instance_t *instance) {',
      '    (void)instance;',
      '}',
      '',
    ].join('\n'),
  });

  // --- opm_trace.h ---
  files.push({
    name: 'opm_trace.h',
    content: [
      '#ifndef OPM_TRACE_H', '#define OPM_TRACE_H', '', '#include "opm_model.h"', '',
      '#ifdef __cplusplus', 'extern "C" {', '#endif', '',
      'void OPM_Trace_Step(const OPM_Instance_t *instance);',
      '', '#ifdef __cplusplus', '}', '#endif', '', '#endif', '',
    ].join('\n'),
  });

  // --- opm_trace.c ---
  const traceCap = model.settings.traceCapacity;
  files.push({
    name: 'opm_trace.c',
    content: [
      '#include "opm_trace.h"',
      '#include "opm_config.h"',
      '',
      'void OPM_Trace_Step(const OPM_Instance_t *instance) {',
      '    if (!instance) return;',
      `    if (instance->trace_count > ${Math.max(0, Math.trunc(traceCap))}U) return;`,
      '    (void)instance->trace_head;',
      '}',
      '',
    ].join('\n'),
  });

  // --- main_example.c ---
  files.push({
    name: 'main_example.c',
    content: [
      '#include "opm_runtime.h"',
      '#include <stdio.h>',
      '',
      'int main(void) {',
      '    OPM_Instance_t instance;',
      '    int i;',
      '    OPM_Init(&instance);',
      '    printf("Initialized OPM embedded runtime.\\n");',
      '    for (i = 0; i < 10; ++i) {',
      '        (void)OPM_Step(&instance, OPM_TICK_MS);',
      '    }',
      '    printf("Stepped 10 ticks successfully. Time: %ums\\n", instance.time_ms);',
      '    return 0;',
      '}',
      '',
    ].join('\n'),
  });

  return files;
}
