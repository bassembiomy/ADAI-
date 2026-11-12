import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateEmbeddedLayers } from './embeddedLayerGenerator.js';
import type { HILConfig } from '../hil/hilTypes.js';

/*
 * Acceptance tests for the integration scheduler that wraps the generated state machine.
 *
 * The state machine (sm_*.c) is unchanged. What is tested here is the component layer an
 * embedded engineer calls from the target: it must follow the standard fixed-step pattern
 * (Simulink/Embedded Coder rt_OneStep, time-triggered cooperative scheduling):
 *   - init drives initial outputs before the first tick (like model_initialize),
 *   - releases happen on a fixed-rate grid of SM_TICK_MS (no drift from execution time),
 *   - the observed delta between releases is passed to SM_Step (jitter supervision),
 *   - missed releases are counted as overruns and not executed in a burst,
 *   - an ISR-driven step that re-enters while a step is running is an overrun, not a nested step.
 */

const config: HILConfig = {
  enabled: true,
  target: 'STM32F4',
  targetSelection: {
    targetId: 'stm32f407vgt6',
    packVersion: '1.0.0',
    driverMode: 'vendor',
    boardRevision: 'A',
  },
  clockSpeed: 168,
  channels: [
    { id: 'LED_0', name: 'led', peripheral: 'GPIO', pin: 'PD12', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
  ],
  mappings: [{ id: 'map-led', adiaVarId: 'led', channelId: 'LED_0', direction: 'write', safeValue: false }],
  commPort: 'COM3',
  baudRate: 115200,
};

const componentFiles = () => {
  const files = generateEmbeddedLayers(config).files;
  const header = files.find((file) => file.name === 'adia_component.h')?.content ?? '';
  const source = files.find((file) => file.name === 'adia_component.c')?.content ?? '';
  return { header, source };
};

const hasHostGcc = (() => {
  try {
    execFileSync('gcc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/* Stand-in for the generated state machine: records the call sequence and the delta passed to SM_Step. */
const STUB_SM_CORE_H = `#ifndef SM_CORE_H
#define SM_CORE_H
#include <stdbool.h>
#include <stdint.h>
#define SM_TICK_MS 10U
typedef enum { SM_ERR_NONE = 0, SM_ERR_NULL_INSTANCE, SM_ERR_TIMING } SM_Error_t;
typedef struct ADIA_Instance { int unused; } ADIA_Instance_t;
SM_Error_t SM_Init(ADIA_Instance_t *instance);
SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance);
SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms);
SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance);
#endif
`;

const HARNESS_C = `#include <stdio.h>
#include <string.h>
#include "adia_component.h"

static char log_buf[512];
static void log_add(const char *s) { strncat(log_buf, s, sizeof(log_buf) - strlen(log_buf) - 1U); }

static ADIA_Scheduler_t sched;
static uint32_t reenter_at_ms = 0U;
static bool reenter_armed = false;
static SM_Error_t reenter_result = SM_ERR_NONE;

SM_Error_t SM_Init(ADIA_Instance_t *instance) { (void)instance; log_add("I,"); return SM_ERR_NONE; }
SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance) { (void)instance; log_add("R,"); return SM_ERR_NONE; }
SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance) { (void)instance; log_add("W,"); return SM_ERR_NONE; }
SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms)
{
    char item[24];
    (void)snprintf(item, sizeof(item), "S%lu,", (unsigned long)delta_ms);
    log_add(item);
    if (reenter_armed) {
        /* Simulates the tick ISR firing again while this step is still running. */
        reenter_armed = false;
        reenter_result = ADIA_Component_OneStep(instance, &sched, reenter_at_ms);
    }
    return SM_ERR_NONE;
}

static void poll(uint32_t now)
{
    uint32_t delta = 0xFFFFFFFFU;
    bool due = ADIA_Scheduler_Poll(&sched, now, &delta);
    if (due) {
        printf("P%lu:%lu:%lu ", (unsigned long)now, (unsigned long)delta,
               (unsigned long)ADIA_Scheduler_GetOverruns(&sched));
    } else {
        printf("P%lu:- ", (unsigned long)now);
    }
}

int main(void)
{
    ADIA_Instance_t inst;

    /* 1. Init: SM_Init then initial outputs, nothing else. */
    log_buf[0] = '\\0';
    if (ADIA_Component_Init(&inst) != SM_ERR_NONE) { return 1; }
    printf("INIT[%s]\\n", log_buf);

    /* 2. Cooperative fixed-rate polling. */
    ADIA_Scheduler_Init(&sched, 1000U);
    poll(1000U); poll(1005U); poll(1009U); poll(1010U); poll(1021U); poll(1029U); poll(1030U);
    poll(1065U); poll(1070U); poll(1075U);
    printf("\\n");

    /* 3. 32-bit millisecond counter wrap-around. */
    ADIA_Scheduler_Init(&sched, 0xFFFFFFFAU);
    poll(0xFFFFFFFAU); poll(0x00000002U); poll(0x00000004U);
    printf("\\n");

    /* 4. ISR-driven one-step: first delta nominal, then observed, then re-entrancy overrun. */
    ADIA_Scheduler_Init(&sched, 500U);
    log_buf[0] = '\\0';
    if (ADIA_Component_OneStep(&inst, &sched, 500U) != SM_ERR_NONE) { return 2; }
    if (ADIA_Component_OneStep(&inst, &sched, 511U) != SM_ERR_NONE) { return 3; }
    reenter_armed = true;
    reenter_at_ms = 525U;
    if (ADIA_Component_OneStep(&inst, &sched, 521U) != SM_ERR_NONE) { return 4; }
    printf("ONESTEP[%s] reenter=%d overruns=%lu\\n", log_buf,
           (reenter_result == SM_ERR_TIMING) ? 1 : 0,
           (unsigned long)ADIA_Scheduler_GetOverruns(&sched));
    return 0;
}
`;

describe('integration scheduler (adia_component)', () => {
  it('declares the standard fixed-step integration API', () => {
    const { header } = componentFiles();
    expect(header).toContain('ADIA_Scheduler_t');
    expect(header).toMatch(/void\s+ADIA_Scheduler_Init\s*\(\s*ADIA_Scheduler_t\s*\*\s*\w+\s*,\s*uint32_t\s+\w+\s*\)/);
    expect(header).toMatch(/bool\s+ADIA_Scheduler_Poll\s*\(\s*ADIA_Scheduler_t\s*\*\s*\w+\s*,\s*uint32_t\s+\w+\s*,\s*uint32_t\s*\*\s*\w+\s*\)/);
    expect(header).toMatch(/uint32_t\s+ADIA_Scheduler_GetOverruns\s*\(\s*const\s+ADIA_Scheduler_t\s*\*\s*\w+\s*\)/);
    expect(header).toMatch(/SM_Error_t\s+ADIA_Component_OneStep\s*\(\s*ADIA_Instance_t\s*\*\s*\w+\s*,\s*ADIA_Scheduler_t\s*\*\s*\w+\s*,\s*uint32_t\s+\w+\s*\)/);
    expect(header).toContain('ADIA_Component_Cyclic');
  });

  it('keeps the explicit Read → Step → Write cyclic sequence', () => {
    const { source } = componentFiles();
    const read = source.indexOf('SM_ReadInputs(instance)');
    const step = source.indexOf('SM_Step(instance');
    const write = source.indexOf('SM_WriteOutputs(instance)', step);
    expect(read).toBeGreaterThan(-1);
    expect(step).toBeGreaterThan(read);
    expect(write).toBeGreaterThan(step);
  });

  it.skipIf(!hasHostGcc)('behaves like a fixed-rate scheduler with overrun detection (host C, -Werror)', () => {
    const { header, source } = componentFiles();
    const dir = mkdtempSync(join(tmpdir(), 'adia-sched-'));
    try {
      writeFileSync(join(dir, 'sm_core.h'), STUB_SM_CORE_H);
      writeFileSync(join(dir, 'adia_mcal.h'), '#ifndef ADIA_MCAL_H\n#define ADIA_MCAL_H\n#endif\n');
      writeFileSync(join(dir, 'adia_component.h'), header);
      writeFileSync(join(dir, 'adia_component.c'), source);
      writeFileSync(join(dir, 'harness.c'), HARNESS_C);
      const exe = join(dir, process.platform === 'win32' ? 'harness.exe' : 'harness');
      for (const std of ['-std=c99', '-std=c11']) {
        execFileSync('gcc', [std, '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', 'adia_component.c', 'harness.c', '-o', exe], { cwd: dir, stdio: 'pipe' });
        const out = execFileSync(exe, { cwd: dir, encoding: 'utf8' }).split(/\r?\n/);

        // Init calls SM_Init and drives initial outputs once, without stepping or reading.
        expect(out[0]).toBe('INIT[I,W,]');

        // First release is immediate with the nominal delta; releases sit on a 10 ms grid;
        // the observed delta (jitter) is reported; a late
        // release (1040 run at 1065) with the two skipped releases (1050, 1060) counted as overruns;
        // the next release is one period after the late one, so no burst and no short delta.
        expect(out[1].trim()).toBe([
          'P1000:10:0', 'P1005:-', 'P1009:-', 'P1010:10:0', 'P1021:11:0', 'P1029:-', 'P1030:9:0',
          'P1065:35:2', 'P1070:-', 'P1075:10:2',
        ].join(' '));

        // Unsigned wrap of the millisecond counter does not stall or burst the scheduler.
        expect(out[2].trim()).toBe('P4294967290:10:0 P2:- P4:10:0');

        // rt_OneStep pattern: nominal first delta, observed afterwards, Read→Step→Write per tick,
        // and a re-entrant call while stepping is rejected as an overrun without a nested step.
        expect(out[3]).toBe('ONESTEP[R,S10,W,R,S11,W,R,S10,W,] reenter=1 overruns=1');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
