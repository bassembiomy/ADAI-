/**
 * OPM C model tables generator: typed storage, init, guards and action
 * evaluators. Every lvalue uses the resolved (validated) C identifier;
 * raw editor names/ids never reach generated C (trace mapping lives only
 * in the JSON manifest).
 */

import type { ExecutableOpmModel } from './pipeline';
import type { GeneratedOpmFile } from './cGeneratorTypes';
import {
  mapScalarToCType,
  renderCExpression,
  renderInitLiteral,
  renderLValue,
  resolveAssignmentLvalue,
  isSafeCIdentifier,
} from './cIr';

function u(v: number): string {
  return `(${Math.max(0, Math.trunc(v))}U)`;
}

function upperSafe(cIdentifier: string): string {
  return cIdentifier.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
}

export function generateOpmModelFiles(model: ExecutableOpmModel): GeneratedOpmFile[] {
  const files: GeneratedOpmFile[] = [];
  const s = model.settings;
  const nObj = model.objects.length;
  const nStates = model.states.length;
  const nProcs = model.processes.length;
  const nLinks = model.links.length;
  const allAttrs = model.objects.flatMap(o => [...o.attributes]);
  const nAttrs = allAttrs.length;
  const enumMemberIds = new Set(model.enums.flatMap(e => e.members.map(m => m.cIdentifier)));

  // Attribute global index table (deterministic: object order, then attr order).
  const attrIndex = new Map<string, number>();
  {
    let idx = 0;
    for (const obj of model.objects) {
      for (const attr of obj.attributes) {
        attrIndex.set(`${obj.id}::${attr.id}`, idx);
        attrIndex.set(attr.id, idx);
        attrIndex.set(attr.cIdentifier, idx);
        idx++;
      }
    }
  }
  // --- opm_types.h ---
  const typesH: string[] = [
    '#ifndef OPM_TYPES_H',
    '#define OPM_TYPES_H',
    '',
    '#include <stdint.h>',
    '#include <stdbool.h>',
    '#include <stddef.h>',
    '',
    '#ifdef __cplusplus',
    'extern "C" {',
    '#endif',
    '',
    'typedef enum {',
    '    OPM_OK = 0,',
    '    OPM_ERROR = 1,',
    '    OPM_QUEUE_OVERFLOW = 2,',
    '    OPM_WRITE_CONFLICT = 3,',
    '    OPM_UNKNOWN_EVENT = 4',
    '} OPM_Status_t;',
    '',
    'typedef enum {',
    '    OPM_EVENT_NONE = 0,',
    ...model.events.map((ev, i) => `    ${ev.cIdentifier} = ${i + 1},`),
    `    OPM_EVENT_COUNT = ${model.events.length + 1}`,
    '} OPM_EventId_t;',
    '',
  ];
  for (const en of model.enums) {
    if (!isSafeCIdentifier(en.cIdentifier)) continue;
    typesH.push(`typedef enum {`);
    for (const mem of en.members) {
      if (!isSafeCIdentifier(mem.cIdentifier)) continue;
      typesH.push(`    ${mem.cIdentifier} = ${Math.trunc(mem.value)},`);
    }
    typesH.push(`} ${en.cIdentifier};`, '');
  }
  typesH.push(
    'typedef struct {',
    '    uint32_t error_count;',
    '    uint32_t warning_count;',
    '    OPM_Status_t last_status;',
    '    uint16_t event_drops;',
    '    uint16_t write_conflicts;',
    '    uint16_t staged_drops;',
    '    uint16_t transition_drops;',
    '    uint16_t transition_conflicts;',
    '} OPM_Diagnostics_t;',
    '',
    'typedef struct {',
    '    uint16_t attr_index;',
    '    uint8_t op;',
    '    uint8_t priority;',
    '    int32_t i_value;',
    '    uint32_t u_value;',
    '    float f_value;',
    '    uint8_t is_float;',
    '    uint8_t valid;',
    '} OPM_StagedWrite_t;',
    '',
    'typedef struct {',
    '    uint16_t owner_index;',
    '    uint16_t from_state_index;',
    '    uint16_t to_state_index;',
    '    uint16_t link_index;',
    '    uint8_t valid;',
    '} OPM_StagedTransition_t;',
    '',
    'typedef struct {',
    '    uint16_t owner_index;',
    '    uint16_t from_state_index;',
    '    uint16_t to_state_index;',
    '    uint16_t link_index;',
    '    uint32_t remaining_ms;',
    '    uint8_t valid;',
    '} OPM_DelayedTrans_t;',
    '',
    '#ifdef __cplusplus',
    '}',
    '#endif',
    '',
    '#endif',
    '',
  );
  files.push({ name: 'opm_types.h', content: typesH.join('\n') });

  // --- opm_config.h ---
  const configH: string[] = [
    '#ifndef OPM_CONFIG_H',
    '#define OPM_CONFIG_H',
    '',
    '#include "opm_types.h"',
    '',
    `#define OPM_TICK_MS ${u(s.tickMs)}`,
    `#define OPM_EVENT_QUEUE_CAPACITY ${u(s.eventQueueCapacity)}`,
    `#define OPM_MAX_STAGED_WRITES ${u(s.maxStagedWrites)}`,
    `#define OPM_MAX_TRANSITIONS ${u(s.maxTransitions)}`,
    `#define OPM_TRACE_CAPACITY ${u(s.traceCapacity)}`,
    `#define OPM_NUM_OBJECTS ${u(nObj)}`,
    `#define OPM_NUM_STATES ${u(nStates)}`,
    `#define OPM_NUM_PROCESSES ${u(nProcs)}`,
    `#define OPM_NUM_LINKS ${u(nLinks)}`,
    `#define OPM_NUM_ATTRIBUTES ${u(nAttrs)}`,
    `#define OPM_NUM_EVENTS ${u(model.events.length)}`,
    s.eventOverflow === 'dropOldest'
      ? '#define OPM_EVENT_OVERFLOW_DROP_OLDEST (1U)'
      : '#define OPM_EVENT_OVERFLOW_DROP_OLDEST (0U)',
    '',
    '#endif',
    '',
  ];
  files.push({ name: 'opm_config.h', content: configH.join('\n') });

  // --- opm_model.h ---
  const modelH: string[] = [
    '#ifndef OPM_MODEL_H',
    '#define OPM_MODEL_H',
    '',
    '#include "opm_types.h"',
    '#include "opm_config.h"',
    '',
    '#ifdef __cplusplus',
    'extern "C" {',
    '#endif',
    '',
    '/* State IDs per object (generated order) */',
  ];
  model.states.forEach((st, idx) => {
    if (!isSafeCIdentifier(st.cIdentifier)) return;
    modelH.push(`#define OPM_STATE_${upperSafe(st.cIdentifier)} (${idx + 1}U)`);
  });
  modelH.push('');
  modelH.push('/* Attribute indices (generated order) */');
  allAttrs.forEach((attr, idx) => {
    if (!isSafeCIdentifier(attr.cIdentifier)) return;
    modelH.push(`#define OPM_ATTR_${upperSafe(attr.cIdentifier)} (${idx}U)`);
  });
  modelH.push('');
  modelH.push('typedef struct {');
  modelH.push('    uint32_t step_index;');
  modelH.push('    uint32_t time_ms;');
  modelH.push('');
  modelH.push('    /* Typed object attributes */');
  if (nAttrs === 0) {
    modelH.push('    uint8_t _reserved;');
  } else {
    for (const attr of allAttrs) {
      if (!isSafeCIdentifier(attr.cIdentifier)) continue;
      modelH.push(`    ${mapScalarToCType(attr.type, model.enums)} ${attr.cIdentifier};`);
    }
  }
  modelH.push('');
  modelH.push('    /* Active state per object (generated object order) */');
  modelH.push(`    uint16_t active_states[${Math.max(1, nObj)}];`);
  modelH.push('    /* Elapsed ms per state (generated state order) */');
  modelH.push(`    uint32_t state_timers[${Math.max(1, nStates)}];`);
  modelH.push('    /* Cyclic accumulator per process (generated process order) */');
  modelH.push(`    uint32_t process_timers[${Math.max(1, nProcs)}];`);
  modelH.push(`    uint32_t process_last_fire[${Math.max(1, nProcs)}];`);
  modelH.push(`    uint8_t process_fired[${Math.max(1, nProcs)}];`);
  modelH.push('');
  modelH.push('    /* Bounded FIFO event queue */');
  modelH.push('    OPM_EventId_t event_queue[OPM_EVENT_QUEUE_CAPACITY];');
  modelH.push('    uint16_t queue_head;');
  modelH.push('    uint16_t queue_tail;');
  modelH.push('    uint16_t queue_count;');
  modelH.push('');
  modelH.push('    /* Bounded staging areas */');
  modelH.push('    OPM_StagedWrite_t staged_writes[OPM_MAX_STAGED_WRITES];');
  modelH.push('    uint16_t staged_count;');
  modelH.push('    OPM_StagedTransition_t staged_trans[OPM_MAX_TRANSITIONS];');
  modelH.push('    uint16_t staged_trans_count;');
  modelH.push('');
  modelH.push('    /* Conformance snapshot recording (managed by OPM_Step) */');
  modelH.push(`    uint16_t committed_attrs[${Math.max(1, s.maxStagedWrites)}];`);
  modelH.push('    uint16_t committed_count;');
  modelH.push(`    uint8_t link_traversed[${Math.max(1, nLinks)}];`);
  modelH.push('    uint8_t last_waiting;');
  modelH.push(`    OPM_DelayedTrans_t delayed_trans[${Math.max(1, s.maxTransitions)}];`);
  modelH.push('    uint16_t delayed_count;');
  modelH.push('');
  modelH.push('    /* Diagnostics and trace ring */');
  modelH.push('    OPM_Diagnostics_t diagnostics;');
  modelH.push('    uint32_t trace_head;');
  modelH.push('    uint32_t trace_count;');
  modelH.push('    uint32_t trace_ids[OPM_TRACE_CAPACITY];');
  modelH.push('} OPM_Instance_t;');
  modelH.push('');
  modelH.push('/* Process metadata table (enabled entries only, generated order) */');
  modelH.push('typedef struct {');
  modelH.push('    uint16_t index;');
  modelH.push('    uint8_t activation;');
  modelH.push('    uint16_t priority;');
  modelH.push('    uint32_t period_ms;');
  modelH.push('    uint32_t debounce_ms;');
  modelH.push('    uint8_t enabled;');
  modelH.push('} OPM_ProcessInfo_t;');
  modelH.push('extern const OPM_ProcessInfo_t OPM_PROCESS_TABLE[];');
  modelH.push('');
  modelH.push('/* Link metadata table (enabled entries only, generated order) */');
  modelH.push('typedef struct {');
  modelH.push('    uint16_t index;');
  modelH.push('    uint16_t priority;');
  modelH.push('    uint32_t delay_ms;');
  modelH.push('    uint8_t has_event;');
  modelH.push('    OPM_EventId_t event_id;');
  modelH.push('    uint8_t enabled;');
  modelH.push('} OPM_LinkInfo_t;');
  modelH.push('extern const OPM_LinkInfo_t OPM_LINK_TABLE[];');
  modelH.push('');
  modelH.push('void OPM_Model_Init(OPM_Instance_t *instance);');
  modelH.push('OPM_Status_t OPM_Model_Step(OPM_Instance_t *instance, uint32_t delta_ms);');
  modelH.push('bool OPM_Model_EvaluateGuard(uint16_t process_index, const OPM_Instance_t *instance, bool *ok);');
  modelH.push('bool OPM_Model_EvaluateLinkGuard(uint16_t link_index, const OPM_Instance_t *instance, bool *ok);');
  modelH.push('OPM_Status_t OPM_Model_EvaluateAction(uint16_t process_index, uint16_t action_index, const OPM_Instance_t *snapshot, float *f_out, int32_t *i_out, uint32_t *u_out, uint8_t *is_float, bool *ok);');
  modelH.push('OPM_Status_t OPM_Model_EvaluateLinkAction(uint16_t link_index, uint16_t action_index, const OPM_Instance_t *snapshot, float *f_out, int32_t *i_out, uint32_t *u_out, uint8_t *is_float, bool *ok);');
  modelH.push('uint16_t OPM_Model_ActionTarget(uint16_t process_index, uint16_t action_index);');
  modelH.push('uint8_t OPM_Model_ActionOp(uint16_t process_index, uint16_t action_index);');
  modelH.push('');
  modelH.push('#ifdef __cplusplus');
  modelH.push('}');
  modelH.push('#endif');
  modelH.push('');
  modelH.push('#endif', '');
  files.push({ name: 'opm_model.h', content: modelH.join('\n') });

  // --- opm_model.c ---
  const enabledProcs = model.processes.filter(p => p.enabled !== false);
  const modelC: string[] = [
    '#include "opm_model.h"',
    '#include "opm_io.h"',
    '#include <math.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '',
    '/* Checked integer/float arithmetic: zero divisor sets ok=false. */',
    'static int32_t OPM_CheckedDivI32(int32_t a, int32_t b, bool *ok) {',
    '    if (b == 0) { if (ok) *ok = false; return 0; }',
    '    if ((a == (-2147483647 - 1)) && (b == -1)) { if (ok) *ok = false; return 0; }',
    '    return (int32_t)(a / b);',
    '}',
    'static int32_t OPM_CheckedModI32(int32_t a, int32_t b, bool *ok) {',
    '    if (b == 0) { if (ok) *ok = false; return 0; }',
    '    return (int32_t)(a % b);',
    '}',
    'static uint32_t OPM_CheckedDivU32(uint32_t a, uint32_t b, bool *ok) {',
    '    if (b == 0U) { if (ok) *ok = false; return 0U; }',
    '    return (uint32_t)(a / b);',
    '}',
    'static uint32_t OPM_CheckedModU32(uint32_t a, uint32_t b, bool *ok) {',
    '    if (b == 0U) { if (ok) *ok = false; return 0U; }',
    '    return (uint32_t)(a % b);',
    '}',
    'static float OPM_CheckedDivF32(float a, float b, bool *ok) {',
    '    if (b == 0.0f) { if (ok) *ok = false; return 0.0f; }',
    '    return (float)(a / b);',
    '}',
    'static float OPM_CheckedModF32(float a, float b, bool *ok) {',
    '    if (b == 0.0f) { if (ok) *ok = false; return 0.0f; }',
    '    return fmodf(a, b);',
    '}',
    '',
  ];

  // Metadata tables (numeric only; no raw names/ids).
  modelC.push('/* Generated process table: generated order, enabled only. */');
  if (nProcs === 0) {
    modelC.push('const OPM_ProcessInfo_t OPM_PROCESS_TABLE[1] = { { 0U, 0U, 0U, 0U, 0U, 0U } };');
  } else {
    modelC.push('const OPM_ProcessInfo_t OPM_PROCESS_TABLE[OPM_NUM_PROCESSES] = {');
    modelC.push('__OPM_PROCESS_ROWS__');
    modelC.push('};');
  }

  // Init
  modelC.push('');
  modelC.push('void OPM_Model_Init(OPM_Instance_t *instance) {');
  modelC.push('    if (!instance) return;');
  modelC.push('    (void)memset(instance, 0, sizeof(OPM_Instance_t));');
  modelC.push('    /* Debounce parity: the TS runtime skips the debounce check until a');
  modelC.push('       process has fired once. 0xFFFFFFFF marks "never fired" (a real');
  modelC.push('       firing time can never hold this value in these models). */');
  if (nProcs > 0) {
    modelC.push('    {');
    modelC.push('        uint16_t __pi;');
    modelC.push('        for (__pi = 0U; __pi < OPM_NUM_PROCESSES; __pi++) {');
    modelC.push('            instance->process_last_fire[__pi] = 0xFFFFFFFFU;');
    modelC.push('        }');
    modelC.push('    }');
  }
  for (const obj of model.objects) {
    for (const attr of obj.attributes) {
      if (!isSafeCIdentifier(attr.cIdentifier)) continue;
      const lit = renderInitLiteral(attr.type, attr.initialValue, model.enums);
      modelC.push(`    instance->${attr.cIdentifier} = ${lit};`);
    }
    if (obj.initialStateId) {
      const stIdx = model.states.findIndex(st => st.id === obj.initialStateId);
      if (stIdx >= 0) {
        modelC.push(`    instance->active_states[${obj.order}] = ${(stIdx + 1)}U;`);
      }
    }
  }
  modelC.push('    instance->diagnostics.last_status = OPM_OK;');
  modelC.push('    /* Keep checked arithmetic helpers referenced under strict builds. */');
  modelC.push('    (void)OPM_CheckedDivI32;');
  modelC.push('    (void)OPM_CheckedModI32;');
  modelC.push('    (void)OPM_CheckedDivU32;');
  modelC.push('    (void)OPM_CheckedModU32;');
  modelC.push('    (void)OPM_CheckedDivF32;');
  modelC.push('    (void)OPM_CheckedModF32;');
  modelC.push('}');
  modelC.push('');

  // Guards: one fail-closed guard per enabled process (legacy proc_ name) + dispatcher.
  enabledProcs.forEach((proc) => {
    const gi = model.processes.indexOf(proc);
    const cId = isSafeCIdentifier(proc.cIdentifier) ? proc.cIdentifier : `P${gi}`;
    modelC.push(`static bool proc_${cId}_guard(const OPM_Instance_t *instance, bool *ok) {`);
    modelC.push('    bool __ok = true;');
    modelC.push('    (void)__ok;');
    modelC.push('    (void)instance;');
    if (proc.guardIr) {
      modelC.push(`    bool __r = ${renderCExpression(proc.guardIr, 'instance', '__ok', enumMemberIds)};`);
      modelC.push('    if (!__ok) { if (ok) *ok = false; return false; }');
      modelC.push('    if (ok) *ok = true;');
      modelC.push('    return __r;');
    } else {
      modelC.push('    if (ok) *ok = true;');
      modelC.push('    return true;');
    }
    modelC.push('}');
    modelC.push('');
  });
  modelC.push('bool OPM_Model_EvaluateGuard(uint16_t process_index, const OPM_Instance_t *instance, bool *ok) {');
  modelC.push('    if (!instance) { if (ok) *ok = false; return false; }');
  if (nProcs === 0) {
    modelC.push('    (void)process_index; if (ok) *ok = false; return false;');
  } else {
    modelC.push('    switch (process_index) {');
    model.processes.forEach((proc, gi) => {
      if (!proc.enabled) {
        modelC.push(`        case ${gi}U: if (ok) *ok = true; return false;`);
      } else {
        const cId = isSafeCIdentifier(proc.cIdentifier) ? proc.cIdentifier : `P${gi}`;
        modelC.push(`        case ${gi}U: return proc_${cId}_guard(instance, ok);`);
      }
    });
    modelC.push('        default: if (ok) *ok = false; return false;');
    modelC.push('    }');
  }
  modelC.push('}');
  modelC.push('');

  // Link guards: one fail-closed guard per link carrying a guardIr, plus a
  // dispatcher. Mirrors the TS gateChecksPass guard leg: links without a
  // guard pass, and a failed evaluation fails closed (ok=false, false).
  model.links.forEach((link, li) => {
    if (!link.guardIr) return;
    modelC.push(`static bool OPM_LinkGuard_L${li}(const OPM_Instance_t *instance, bool *ok) {`);
    modelC.push('    bool __ok = true;');
    modelC.push('    (void)__ok;');
    modelC.push(`    bool __r = ${renderCExpression(link.guardIr, 'instance', '__ok', enumMemberIds)};`);
    modelC.push('    if (!__ok) { if (ok) *ok = false; return false; }');
    modelC.push('    if (ok) *ok = true;');
    modelC.push('    return __r;');
    modelC.push('}');
    modelC.push('');
  });
  modelC.push('bool OPM_Model_EvaluateLinkGuard(uint16_t link_index, const OPM_Instance_t *instance, bool *ok) {');
  modelC.push('    if (!instance) { if (ok) *ok = false; return false; }');
  if (!model.links.some(l => !!l.guardIr)) {
    modelC.push('    (void)link_index; if (ok) *ok = true; return true;');
  } else {
    modelC.push('    switch (link_index) {');
    model.links.forEach((link, li) => {
      if (link.guardIr) modelC.push(`        case ${li}U: return OPM_LinkGuard_L${li}(instance, ok);`);
    });
    modelC.push('        default: if (ok) *ok = true; return true;');
    modelC.push('    }');
  }
  modelC.push('}');
  modelC.push('');

  // Action evaluators: evaluate expression against snapshot, return status.
  // Each assignment gets a static evaluator; dispatcher routes by index.
  enabledProcs.forEach((proc) => {
    const gi = model.processes.indexOf(proc);
    proc.assignments.forEach((a, ai) => {
      if (!a.enabled) return;
      const target = resolveAssignmentLvalue(a);
      if (target === '') return;
      const attr = allAttrs.find(x => x.cIdentifier === target);
      const isFloat = attr?.type.kind === 'float32';
      modelC.push(`static OPM_Status_t OPM_Action_P${gi}A${ai}(const OPM_Instance_t *snapshot, float *f_out, int32_t *i_out, uint32_t *u_out, bool *ok) {`);
      modelC.push('    bool __ok = true;');
      modelC.push('    (void)snapshot; (void)f_out; (void)i_out; (void)u_out;');
      if (isFloat) {
        modelC.push(`    float __v = (float)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      } else if (attr?.type.kind === 'uint32') {
        modelC.push(`    uint32_t __v = (uint32_t)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      } else if (attr?.type.kind === 'bool') {
        modelC.push(`    bool __v = (bool)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      } else {
        modelC.push(`    int32_t __v = (int32_t)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      }
      modelC.push('    if (!__ok) { if (ok) *ok = false; return OPM_ERROR; }');
      modelC.push('    if (ok) *ok = true;');
      if (isFloat) {
        modelC.push('    if (f_out) *f_out = __v;');
      } else if (attr?.type.kind === 'uint32') {
        modelC.push('    if (u_out) *u_out = __v;');
      } else if (attr?.type.kind === 'bool') {
        modelC.push('    if (i_out) *i_out = (int32_t)__v;');
      } else {
        modelC.push('    if (i_out) *i_out = __v;');
      }
      modelC.push('    return OPM_OK;');
      modelC.push('}');
      modelC.push('');
    });
  });

  // Count actions per process for dispatcher bounds.
  modelC.push('uint16_t OPM_Model_ActionTarget(uint16_t process_index, uint16_t action_index) {');
  modelC.push('    (void)process_index; (void)action_index;');
  // Map (process, action) -> global attribute index.
  const actionTargetRows: string[] = [];
  model.processes.forEach((proc, gi) => {
    proc.assignments.forEach((a, ai) => {
      if (!a.enabled) return;
      const target = resolveAssignmentLvalue(a);
      if (target === '') return;
      const gIdx = allAttrs.findIndex(x => x.cIdentifier === target);
      if (gIdx < 0) return;
      actionTargetRows.push(`    if ((process_index == ${gi}U) && (action_index == ${ai}U)) return ${gIdx}U;`);
    });
  });
  for (const r of actionTargetRows) modelC.push(r);
  modelC.push('    return 0xFFFFU;');
  modelC.push('}');
  modelC.push('');
  modelC.push('uint8_t OPM_Model_ActionOp(uint16_t process_index, uint16_t action_index) {');
  const opCode = (op: string): number =>
    op === '=' ? 0 : op === '+=' ? 1 : op === '-=' ? 2 : op === '*=' ? 3 : 4;
  model.processes.forEach((proc, gi) => {
    proc.assignments.forEach((a, ai) => {
      if (!a.enabled) return;
      if (resolveAssignmentLvalue(a) === '') return;
      modelC.push(`    if ((process_index == ${gi}U) && (action_index == ${ai}U)) return ${opCode(a.operator)}U;`);
    });
  });
  modelC.push('    return 0U;');
  modelC.push('}');
  modelC.push('');
  modelC.push('OPM_Status_t OPM_Model_EvaluateAction(uint16_t process_index, uint16_t action_index, const OPM_Instance_t *snapshot, float *f_out, int32_t *i_out, uint32_t *u_out, uint8_t *is_float, bool *ok) {');
  modelC.push('    if (!snapshot) { if (ok) *ok = false; return OPM_ERROR; }');
  let hasAny = false;
  model.processes.forEach((proc, gi) => {
    proc.assignments.forEach((a, ai) => {
      if (!a.enabled) return;
      if (resolveAssignmentLvalue(a) === '') return;
      hasAny = true;
      const target = resolveAssignmentLvalue(a);
      const attr = allAttrs.find(x => x.cIdentifier === target);
      const floatFlag = attr?.type.kind === 'float32' ? '1U' : '0U';
      modelC.push(`    if ((process_index == ${gi}U) && (action_index == ${ai}U)) { if (is_float) *is_float = ${floatFlag}; return OPM_Action_P${gi}A${ai}(snapshot, f_out, i_out, u_out, ok); }`);
    });
  });
  if (!hasAny) modelC.push('    (void)f_out; (void)i_out; (void)u_out;');
  modelC.push('    if (ok) *ok = false;');
  modelC.push('    return OPM_ERROR;');
  modelC.push('}');
  modelC.push('');

  // Link action evaluators: staged by the scheduler for traversed links
  // (mirror of runtime.ts link-assignment staging). Fail-closed like above.
  model.links.forEach((link, li) => {
    link.assignments.forEach((a, ai) => {
      if (!a.enabled) return;
      const target = resolveAssignmentLvalue(a);
      if (target === '') return;
      const attr = allAttrs.find(x => x.cIdentifier === target);
      const isFloat = attr?.type.kind === 'float32';
      modelC.push(`static OPM_Status_t OPM_LinkAction_L${li}A${ai}(const OPM_Instance_t *snapshot, float *f_out, int32_t *i_out, uint32_t *u_out, bool *ok) {`);
      modelC.push('    bool __ok = true;');
      modelC.push('    (void)snapshot; (void)f_out; (void)i_out; (void)u_out;');
      if (isFloat) {
        modelC.push(`    float __v = (float)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      } else if (attr?.type.kind === 'uint32') {
        modelC.push(`    uint32_t __v = (uint32_t)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      } else if (attr?.type.kind === 'bool') {
        modelC.push(`    bool __v = (bool)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      } else {
        modelC.push(`    int32_t __v = (int32_t)(${renderCExpression(a.expressionIr, 'snapshot', '__ok', enumMemberIds)});`);
      }
      modelC.push('    if (!__ok) { if (ok) *ok = false; return OPM_ERROR; }');
      modelC.push('    if (ok) *ok = true;');
      if (isFloat) {
        modelC.push('    if (f_out) *f_out = __v;');
      } else if (attr?.type.kind === 'uint32') {
        modelC.push('    if (u_out) *u_out = __v;');
      } else if (attr?.type.kind === 'bool') {
        modelC.push('    if (i_out) *i_out = (int32_t)__v;');
      } else {
        modelC.push('    if (i_out) *i_out = __v;');
      }
      modelC.push('    return OPM_OK;');
      modelC.push('}');
      modelC.push('');
    });
  });
  modelC.push('OPM_Status_t OPM_Model_EvaluateLinkAction(uint16_t link_index, uint16_t action_index, const OPM_Instance_t *snapshot, float *f_out, int32_t *i_out, uint32_t *u_out, uint8_t *is_float, bool *ok) {');
  modelC.push('    if (!snapshot) { if (ok) *ok = false; return OPM_ERROR; }');
  let hasLinkAny = false;
  model.links.forEach((link, li) => {
    link.assignments.forEach((a, ai) => {
      if (!a.enabled) return;
      const target = resolveAssignmentLvalue(a);
      if (target === '') return;
      hasLinkAny = true;
      const attr = allAttrs.find(x => x.cIdentifier === target);
      const floatFlag = attr?.type.kind === 'float32' ? '1U' : '0U';
      modelC.push(`    if ((link_index == ${li}U) && (action_index == ${ai}U)) { if (is_float) *is_float = ${floatFlag}; return OPM_LinkAction_L${li}A${ai}(snapshot, f_out, i_out, u_out, ok); }`);
    });
  });
  if (!hasLinkAny) modelC.push('    (void)link_index; (void)action_index; (void)f_out; (void)i_out; (void)u_out; (void)is_float;');
  modelC.push('    if (ok) *ok = false;');
  modelC.push('    return OPM_ERROR;');
  modelC.push('}');
  modelC.push('');

  // Legacy compat direct-apply wrappers (legacy proc_ names, status-returning).
  // The bounded scheduler uses the staged evaluators above; these preserve the
  // historical per-process action shape for existing consumers. Fail-closed:
  // expressions render through the checked helpers with an ok-flag, and a
  // failed evaluation (e.g. divide/modulo by zero) returns OPM_ERROR with no
  // further assignments applied.
  enabledProcs.forEach((proc) => {
    const cId = isSafeCIdentifier(proc.cIdentifier) ? proc.cIdentifier : `P${model.processes.indexOf(proc)}`;
    const assigns = proc.assignments.filter(a => a.enabled && resolveAssignmentLvalue(a) !== '');
    if (assigns.length === 0) return;
    modelC.push(`OPM_Status_t proc_${cId}_action(OPM_Instance_t *instance) {`);
    modelC.push('    bool __ok = true;');
    modelC.push('    if (!instance) return OPM_ERROR;');
    for (const a of assigns) {
      const lval = renderLValue(a, 'instance');
      const expr = renderCExpression(a.expressionIr, 'instance', '__ok', enumMemberIds);
      // Widened for defense-in-depth: the union has no '%=', but untyped
      // callers can still carry it, and it needs the same zero guard.
      const op: string = a.operator;
      if (op === '=') {
        modelC.push(`    ${lval} = ${expr};`);
      } else if (op === '/=' || op === '%=') {
        // Compound divide/modulo bypasses the checked helpers, so the divisor
        // is evaluated once into a temporary with an explicit zero guard.
        const target = resolveAssignmentLvalue(a);
        const attr = allAttrs.find(x => x.cIdentifier === target);
        const cT = attr ? (attr.type.kind === 'bool' ? 'bool' : attr.type.kind === 'int32' ? 'int32_t' : attr.type.kind === 'uint32' ? 'uint32_t' : attr.type.kind === 'float32' ? 'float' : 'int32_t') : 'int32_t';
        modelC.push('    {');
        modelC.push(`        ${cT} __rhs = (${cT})(${expr});`);
        modelC.push('        if (!__ok) return OPM_ERROR;');
        modelC.push(`        if (__rhs == (${cT})0) return OPM_ERROR;`);
        modelC.push(`        ${lval} ${op} __rhs;`);
        modelC.push('    }');
      } else {
        modelC.push(`    ${lval} ${op} ${expr};`);
      }
      modelC.push('    if (!__ok) return OPM_ERROR;');
    }
    modelC.push('    return OPM_OK;');
    modelC.push('}');
    modelC.push('');
  });

  // Legacy compat step shim: delegates one tick to the bounded scheduler and
  // propagates its worst-status (fail-closed, mirrors OPM_Step).
  modelC.push('extern OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);');
  modelC.push('OPM_Status_t OPM_Model_Step(OPM_Instance_t *instance, uint32_t delta_ms) {');
  modelC.push('    if (!instance) return OPM_ERROR;');
  modelC.push('    return OPM_Step(instance, delta_ms);');
  modelC.push('}');
  modelC.push('');

  // State entry/exit assignments are applied by the bounded scheduler
  // (OPM_RunStateActions in opm_runtime.c) with exit-before-entry ordering;
  // no per-state statics are emitted here so strict builds stay warning-free.

  // Expand the process-table placeholder with numeric rows only.
  const tableRows: string[] = [];
  if (nProcs !== 0) {
    model.processes.forEach((proc, idx) => {
      const act = proc.activation === 'triggered' ? 1 : proc.activation === 'both' ? 2 : 0;
      const per = proc.periodMs ?? 0;
      const deb = proc.debounceMs ?? 0;
      const en = proc.enabled ? 1 : 0;
      tableRows.push(`    { ${idx}U, ${act}U, ${(proc.priority ?? 1)}U, ${per}U, ${deb}U, ${en}U },`);
    });
  }
  const expandedModelC: string[] = [];
  for (const ln of modelC) {
    if (ln === '__OPM_PROCESS_ROWS__') {
      for (const r of tableRows) expandedModelC.push(r);
    } else {
      expandedModelC.push(ln);
    }
  }
  const finalModelC = `${expandedModelC.join('\n')}\n${((): string => {
    const linkTable: string[] = ['', '/* Generated link table: generated order, enabled only. */'];
    if (nLinks === 0) {
      linkTable.push('const OPM_LinkInfo_t OPM_LINK_TABLE[1] = { { 0U, 0U, 0U, 0U, OPM_EVENT_NONE, 0U } };');
    } else {
      linkTable.push('const OPM_LinkInfo_t OPM_LINK_TABLE[OPM_NUM_LINKS] = {');
      model.links.forEach((link, idx) => {
        const en = link.enabled ? 1 : 0;
        let evExpr = 'OPM_EVENT_NONE';
        let hasEv = 0;
        if (link.eventId) {
          const ev = model.events.find(e => e.id === link.eventId);
          if (ev && isSafeCIdentifier(ev.cIdentifier)) {
            evExpr = ev.cIdentifier;
            hasEv = 1;
          }
        }
        linkTable.push(`    { ${idx}U, ${(link.priority ?? 1)}U, ${(link.delayMs ?? 0)}U, ${hasEv}U, ${evExpr}, ${en}U },`);
      });
      linkTable.push('};');
    }
    linkTable.push('');
    return linkTable.join('\n');
  })()}`;
  files.push({ name: 'opm_model.c', content: finalModelC });

  return files;
}
