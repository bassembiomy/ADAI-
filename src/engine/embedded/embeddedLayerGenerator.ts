import type { HILConfig } from '../hil/hilTypes.js';
import { resolveTargetSelection } from '../hil/hilTypes.js';
import { generateMcalHeader } from '../mcal/mcalHeaderGenerator.js';
import type { McalChannelConfig, McalPeripheral } from '../mcal/mcalTypes.js';
import type { TargetPackManifest } from '../targetPacks/targetPackTypes.js';
import { generateDriverProviders, type DriverProviderResolution } from './driverProviderGenerator.js';
import { generatePlatformProject } from './platformProjectGenerator.js';
import { createIntegrationManifest, type IntegrationManifest } from './integrationManifest.js';
import { contentHash } from './contentHash.js';
import { applyCodePrefix } from '../../utils/stateMachine/smCodePrefix.js';

export interface EmbeddedProjectFile {
  path: string;
  layer: 'component' | 'mcal' | 'driver' | 'platform' | 'build' | 'app';
  sha256: `sha256:${string}`;
  content: string;
}

export interface EmbeddedProjectResult {
  files: EmbeddedProjectFile[];
  manifest: IntegrationManifest;
  diagnostics: readonly string[];
}

function channelModel(config: HILConfig): McalChannelConfig[] {
  return config.channels.map(channel => {
    const mapping = config.mappings.find(item => item.channelId === channel.id);
    return {
      peripheral: channel.peripheral.toLowerCase() as McalPeripheral,
      channelId: channel.id,
      pin: channel.pin,
      direction: channel.direction === 'In' ? 'input' : 'output',
      units: channel.unit,
      range: { min: channel.rangeMin, max: channel.rangeMax },
      safeValue: mapping?.safeValue ?? false,
    };
  });
}

function prefix(peripheral: McalPeripheral): string {
  return `adia_mcal_${peripheral}`;
}

function enumName(peripheral: McalPeripheral): string {
  return `${prefix(peripheral)}_channel_t`;
}

const SCALAR_PROVIDER_MATRIX: Readonly<Record<HILConfig['target'], readonly McalPeripheral[]>> = {
  STM32F4: ['gpio', 'adc', 'dac', 'pwm'],
  STM32F1: ['gpio', 'adc', 'pwm'],
  Arduino_Uno: ['gpio', 'adc', 'pwm'],
  Arduino_Mega: ['gpio', 'adc', 'pwm'],
  ESP32: ['gpio', 'adc', 'dac', 'pwm'],
  Generic: [],
};

function cEnumMember(peripheral: McalPeripheral, channelId: string): string {
  return `${prefix(peripheral).toUpperCase()}_${channelId.replaceAll('-', '_').toUpperCase()}`;
}

function halPinMacro(name: string): string {
  return `PIN_${name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()}`;
}

function cString(value: string): string {
  return JSON.stringify(value).replaceAll('\\u2028', '\\u2028').replaceAll('\\u2029', '\\u2029');
}

function isProviderImplemented(config: HILConfig, peripheral: McalPeripheral): boolean {
  return resolveTargetSelection(config)?.driverMode === 'vendor'
    && SCALAR_PROVIDER_MATRIX[config.target].includes(peripheral);
}

function configuredChannel(config: HILConfig, channel: McalChannelConfig) {
  const resolved = config.channels.find(item => item.id === channel.channelId);
  if (!resolved) throw new Error(`Missing configured channel: ${channel.channelId}`);
  return resolved;
}

function scalarRead(config: HILConfig, channel: McalChannelConfig): string {
  const configured = configuredChannel(config, channel);
  const pin = halPinMacro(configured.name);
  const name = cString(configured.name);
  if (channel.peripheral === 'gpio') return `HAL_GPIO_Read(${pin}, ${name}) ? 1 : 0`;
  if (channel.peripheral === 'adc') return `(int32_t)HAL_ADC_Read(${pin}, ${name})`;
  return '0';
}

function scalarWrite(config: HILConfig, channel: McalChannelConfig, value: string): string {
  const configured = configuredChannel(config, channel);
  const pin = halPinMacro(configured.name);
  const name = cString(configured.name);
  if (channel.peripheral === 'gpio') return `HAL_GPIO_Write(${pin}, ${name}, (${value} != 0));`;
  if (channel.peripheral === 'dac') return `HAL_DAC_Write(${pin}, ${name}, (uint32_t)${value});`;
  if (channel.peripheral === 'pwm') return `HAL_PWM_Write(${pin}, ${name}, (uint32_t)${value});`;
  return '(void)value;';
}

function renderMcalImplementation(config: HILConfig, channels: readonly McalChannelConfig[]): string {
  const peripherals = [...new Set(channels.map(channel => channel.peripheral))].sort();
  const lines = [
    '/* Generated MCAL adapters. Unsupported providers fail closed. */',
    '#include "adia_mcal.h"',
    '#include "hal_drivers.h"',
    '#include <stddef.h>',
    '',
  ];
  for (const peripheral of peripherals) {
    const pfx = prefix(peripheral);
    const type = enumName(peripheral);
    const configured = channels.filter(channel => channel.peripheral === peripheral);
    const hasInput = configured.some(channel => channel.direction === 'input');
    const hasOutput = configured.some(channel => channel.direction === 'output');
    const communication = ['uart', 'spi', 'i2c', 'can'].includes(peripheral);
    const implemented = isProviderImplemented(config, peripheral);
    for (const operation of ['init', 'deinit', 'health', 'safe_state']) {
      lines.push(`adia_mcal_status_t ${pfx}_${operation}(void)`);
      lines.push('{');
      if (implemented && operation === 'safe_state') {
        for (const channel of configured.filter(item => item.direction === 'output')) {
          lines.push(`    ${scalarWrite(config, channel, String(Number(channel.safeValue)))}`);
        }
      }
      lines.push(`    return ${implemented ? 'ADIA_MCAL_OK' : 'ADIA_MCAL_NOT_IMPLEMENTED'};`);
      lines.push('}');
      lines.push('');
    }
    if (hasInput) {
      lines.push(communication
        ? `adia_mcal_status_t ${pfx}_read(${type} ch, uint8_t *buffer, uint32_t capacity, uint32_t *out_length)`
        : `adia_mcal_status_t ${pfx}_read(${type} ch, int32_t *out_value)`);
      lines.push('{');
      lines.push('    (void)ch;');
      if (communication) {
        lines.push('    (void)buffer;');
        lines.push('    (void)capacity;');
        lines.push('    (void)out_length;');
      } else lines.push('    (void)out_value;');
      if (implemented && !communication) {
        lines.pop();
        lines.push('    if (out_value == NULL) { return ADIA_MCAL_INVALID_STATE; }');
        lines.push('    switch (ch) {');
        for (const channel of configured.filter(item => item.direction === 'input')) {
          lines.push(`    case ${cEnumMember(peripheral, channel.channelId)}:`);
          lines.push(`        *out_value = ${scalarRead(config, channel)};`);
          lines.push('        return ADIA_MCAL_OK;');
        }
        lines.push('    default: return ADIA_MCAL_INVALID_CHANNEL;');
        lines.push('    }');
      } else {
        lines.push('    return ADIA_MCAL_NOT_IMPLEMENTED;');
      }
      lines.push('}');
      lines.push('');
    }
    if (hasOutput) {
      lines.push(communication
        ? `adia_mcal_status_t ${pfx}_write(${type} ch, const uint8_t *data, uint32_t length)`
        : `adia_mcal_status_t ${pfx}_write(${type} ch, int32_t value)`);
      lines.push('{');
      lines.push('    (void)ch;');
      if (communication) {
        lines.push('    (void)data;');
        lines.push('    (void)length;');
      } else lines.push('    (void)value;');
      if (implemented && !communication) {
        lines.pop();
        lines.push('    switch (ch) {');
        for (const channel of configured.filter(item => item.direction === 'output')) {
          lines.push(`    case ${cEnumMember(peripheral, channel.channelId)}:`);
          lines.push(`        ${scalarWrite(config, channel, 'value')}`);
          lines.push('        return ADIA_MCAL_OK;');
        }
        lines.push('    default: return ADIA_MCAL_INVALID_CHANNEL;');
        lines.push('    }');
      } else {
        lines.push('    return ADIA_MCAL_NOT_IMPLEMENTED;');
      }
      lines.push('}');
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderComponentHeader(): string {
  return `#ifndef ADIA_COMPONENT_H
#define ADIA_COMPONENT_H

#include "sm_core.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Integration of the generated state machine (fixed-step execution).
 *
 * Style 1 - timer ISR / RTOS task (Embedded Coder rt_OneStep): call
 *   ADIA_Component_OneStep() every SM_TICK_MS from a periodic timer ISR or task.
 *   A re-entrant call while a step is running is rejected (SM_ERR_TIMING, counted).
 *
 * Style 2 - cooperative super-loop: call ADIA_Scheduler_Poll() with a monotonic
 *   millisecond clock; when it returns true call ADIA_Component_Cyclic(instance, delta).
 *   Releases sit on a fixed SM_TICK_MS grid; missed releases are counted, not burst.
 */

typedef struct {
    uint32_t next_release_ms;
    uint32_t last_release_ms;
    uint32_t overrun_count;
    bool started;
    volatile bool step_active;
} ADIA_Scheduler_t;

/* Initializes the instance and drives the initial/safe outputs before the first tick. */
SM_Error_t ADIA_Component_Init(ADIA_Instance_t *instance);
/* One Read -> Step -> Write cycle with the observed delta. */
SM_Error_t ADIA_Component_Cyclic(ADIA_Instance_t *instance, uint32_t observed_delta_ms);

void ADIA_Scheduler_Init(ADIA_Scheduler_t *scheduler, uint32_t now_ms);
bool ADIA_Scheduler_Poll(ADIA_Scheduler_t *scheduler, uint32_t now_ms, uint32_t *delta_ms);
uint32_t ADIA_Scheduler_GetOverruns(const ADIA_Scheduler_t *scheduler);
SM_Error_t ADIA_Component_OneStep(ADIA_Instance_t *instance, ADIA_Scheduler_t *scheduler, uint32_t now_ms);

#ifdef __cplusplus
}
#endif

#endif /* ADIA_COMPONENT_H */
`;
}

function renderComponentSource(): string {
  return `#include <stddef.h>
#include "adia_component.h"
#include "adia_mcal.h"

SM_Error_t ADIA_Component_Init(ADIA_Instance_t *instance)
{
    SM_Error_t error = SM_Init(instance);
    if (error == SM_ERR_NONE) {
        error = SM_WriteOutputs(instance);
    }
    return error;
}

SM_Error_t ADIA_Component_Cyclic(ADIA_Instance_t *instance, uint32_t observed_delta_ms)
{
    SM_Error_t error = SM_ReadInputs(instance);
    if (error == SM_ERR_NONE) {
        error = SM_Step(instance, observed_delta_ms);
    }
    if (error == SM_ERR_NONE) {
        error = SM_WriteOutputs(instance);
    }
    return error;
}

void ADIA_Scheduler_Init(ADIA_Scheduler_t *scheduler, uint32_t now_ms)
{
    if (scheduler != NULL) {
        scheduler->next_release_ms = now_ms;
        scheduler->last_release_ms = now_ms;
        scheduler->overrun_count = 0U;
        scheduler->started = false;
        scheduler->step_active = false;
    }
}

bool ADIA_Scheduler_Poll(ADIA_Scheduler_t *scheduler, uint32_t now_ms, uint32_t *delta_ms)
{
    bool due = false;
    if ((scheduler != NULL) && (delta_ms != NULL)) {
        const uint32_t late_ms = now_ms - scheduler->next_release_ms;
        /* Wrap-safe signed difference: negative means the release is not yet due. */
        if ((int32_t)late_ms >= 0) {
            *delta_ms = scheduler->started ? (now_ms - scheduler->last_release_ms) : (uint32_t)SM_TICK_MS;
            scheduler->started = true;
            scheduler->last_release_ms = now_ms;
            if (late_ms >= (uint32_t)SM_TICK_MS) {
                /* Missed releases are counted and skipped, never executed in a burst. */
                scheduler->overrun_count += late_ms / (uint32_t)SM_TICK_MS;
                scheduler->next_release_ms = now_ms + (uint32_t)SM_TICK_MS;
            } else {
                scheduler->next_release_ms += (uint32_t)SM_TICK_MS;
            }
            due = true;
        }
    }
    return due;
}

uint32_t ADIA_Scheduler_GetOverruns(const ADIA_Scheduler_t *scheduler)
{
    return (scheduler != NULL) ? scheduler->overrun_count : 0U;
}

SM_Error_t ADIA_Component_OneStep(ADIA_Instance_t *instance, ADIA_Scheduler_t *scheduler, uint32_t now_ms)
{
    SM_Error_t error;
    if ((instance == NULL) || (scheduler == NULL)) {
        error = SM_ERR_NULL_INSTANCE;
    } else if (scheduler->step_active) {
        /* Tick fired again while the previous step is still running. */
        scheduler->overrun_count++;
        error = SM_ERR_TIMING;
    } else {
        const uint32_t delta_ms = scheduler->started ? (now_ms - scheduler->last_release_ms) : (uint32_t)SM_TICK_MS;
        scheduler->step_active = true;
        scheduler->started = true;
        scheduler->last_release_ms = now_ms;
        error = ADIA_Component_Cyclic(instance, delta_ms);
        scheduler->step_active = false;
    }
    return error;
}
`;
}

/** The shared fast-task rate of a chart with separate-task X-Bridges states (multi-rate). */
export interface EmbeddedFastTask {
  periodUs: number;
  stepsPerTick: number;
}

function renderFastTaskSection(fastTask: EmbeddedFastTask): string {
  return `
## 8. Fast task for X-Bridges states (multi-rate)

This chart has X-Bridges states with solver execution \`separate-task\`. Their solver step is \`SM_XB_TASK_PERIOD_US\` (${fastTask.periodUs} us) and the chart tick is \`SM_XB_TASK_STEPS_PER_TICK\` (${fastTask.stepsPerTick}) fast steps long.

- Call \`SM_XB_Task(&sm)\` every \`SM_XB_TASK_PERIOD_US\` microseconds from a timer or PWM interrupt whose priority is higher than the chart task that calls \`ADIA_Component_OneStep()\` / \`SM_Step()\`. One call performs ONE solver step of every enabled separate-task state.
- Alignment: the first call of each chart period must precede the chart step of that period (the instance counts the calls, so start the fast timer in phase with the chart timer after \`ADIA_Component_Init()\`). Do not call \`SM_XB_Task()\` while \`SM_Init()\` or \`SM_Reset()\` runs.
- Deterministic rate transitions (Simulink multitasking with deterministic transfer, the \`model_step0\` fast task and \`model_step1\` slow task of Embedded Coder): fast step kN uses the inputs and the enable latched at the end of chart step k-1; chart step k reads the outputs of fast step kN; the chart's inputs are latched at the end of its step for the next period (one chart period delay, slow to fast). A state entered by chart step k starts at fast step (k+1)N and applies its memory \`reset\` there; outputs are held while the state is disabled. The results do not depend on where the fast interrupt preempts the chart.
- Critical sections: map \`SM_ENTER_CRITICAL()\` and \`SM_EXIT_CRITICAL()\` to interrupt masking (or a mask of the fast interrupt). They bracket only the short latch and the output copy in the chart task, so the fast interrupt never sees a torn update.
- Faults: an escalating numeric fault (\`numericFault\` = \`escalate\`) raised in the fast task is latched and becomes the chart error (\`SM_ERR_XBRIDGES_NUMERIC\`) at the start of the next chart step; the fast task does nothing while the chart is in error. A \`signal-only\` fault only sets the block's error signal.
- CPU budget: the fast task runs \`SM_XB_TASK_STEPS_PER_TICK\` times per chart tick; its worst-case execution time must fit in \`SM_XB_TASK_PERIOD_US\` with the margin your safety case requires, and the chart task must finish before the next first fast step so the sampled outputs are the ones of its hit.
`;
}

function renderIntegrationGuide(fastTask?: EmbeddedFastTask): string {
  return `# Stateflow to ADIA integration guide

This guide is for the embedded engineer who integrates the generated ADIA state machine into the target firmware. The chart behaves like the Stateflow chart it replaces, but it runs at one fixed rate, is called through the component API below, and talks to the hardware only through the MCAL layer.

## 1. Mapping from Stateflow / Embedded Coder

| Stateflow / Embedded Coder | ADIA (this project) |
| --- | --- |
| \`model_initialize()\` | \`ADIA_Component_Init(&sm)\`: \`SM_Init()\` initializes the data and, unless the chart is set to not execute at initialization, enters the default configuration; then the initial outputs are written. |
| \`model_step()\` called from \`rt_OneStep\` at the base rate | \`ADIA_Component_OneStep(&sm, &sched, now_ms)\` from a periodic timer interrupt or RTOS task with period \`SM_TICK_MS\`; or, in a super-loop, \`ADIA_Scheduler_Poll(&sched, now_ms, &delta)\` followed by \`ADIA_Component_Cyclic(&sm, delta)\` when it returns true. |
| Root inports and outports (\`rtU\`, \`rtY\`) | Generated \`SM_ReadInputs()\` and \`SM_WriteOutputs()\` call the MCAL functions in \`src/mcal/adia_mcal.c\`. The engineer implements the MCAL drivers on top of the vendor HAL. |
| Input events (event ports, function-call inputs) | \`SM_PostEvent()\`, safe to call from an ISR. Map \`SM_ENTER_CRITICAL()\` and \`SM_EXIT_CRITICAL()\` to interrupt masking on the target. Available when the model declares input events. |
| Step overrun, late or early tick | \`ADIA_Scheduler_GetOverruns()\` counts missed releases. With the default model option \`timingFaultPolicy\` = \`latch\`, \`SM_Step()\` returns \`SM_ERR_TIMING\` when the observed delta is outside \`SM_TICK_MIN_MS..SM_TICK_MAX_MS\` and latches the fault. With \`timingFaultPolicy\` = \`monitor\` (Stateflow-like), the tick runs on logical time, the violation is only counted, and \`SM_GetTimingViolations()\` returns the count (saturating; cleared by \`SM_Init()\` and \`SM_Reset()\`). \`ADIA_Component_OneStep()\` returns \`SM_ERR_TIMING\` when a step is re-entered in either policy. |
| "Execute (enter) chart at initialization" | Model option \`executeAtInitialization\`. Stateflow's default is off; ADIA's default is on. When it is off, the generated \`sm_config.h\` defines \`SM_EXECUTE_AT_INIT 0U\`, and the first step only enters the default configuration. |

## 2. Integration steps

1. Implement the MCAL drivers for every channel in \`src/mcal/adia_mcal.c\`. Read and write functions must not block.
2. Init order: clocks, then the peripherals used by MCAL, then \`ADIA_Component_Init(&sm)\`, then \`ADIA_Scheduler_Init(&sched, now_ms)\`, and only then enable the periodic timer or the super-loop. Interrupts that call \`ADIA_Component_OneStep()\` or \`SM_PostEvent()\` must not be enabled before \`ADIA_Component_Init()\` has returned.
3. Periodic task: run it with period \`SM_TICK_MS\` (the model tick). Measure the real period on the target. Every observed delta should lie inside the jitter window \`SM_TICK_MIN_MS..SM_TICK_MAX_MS\` (tolerance \`SM_TICK_TOLERANCE_MS\`). An out-of-window delta is handled by the model option \`timingFaultPolicy\`: with \`latch\` (default) it faults the chart with \`SM_ERR_TIMING\`; with \`monitor\` the chart keeps running on logical time, timers advance by \`SM_TICK_MS\` as in a Stateflow chart, and the application reads the number of violations with \`SM_GetTimingViolations(&sm)\` and decides what to do with them. Choose \`monitor\` only when the application supervises the timing itself.
4. Watchdog: the generated \`SM_WriteOutputs()\` calls \`MCAL_Watchdog_Kick()\` after a successful output write, when the model has I/O mappings. Implement the kick as the MCU watchdog refresh and do not kick it anywhere else, so a faulted or stalled component lets the watchdog expire.
5. Fault latch and reset: once a step reports an error, the instance latches the fault, the outputs go to their safe values, and later calls return the same error. Read the cause with \`SM_GetError(&sm)\`. Call \`SM_Reset()\` only when the application has established that restarting is safe; the verification reset policy in the model states the conditions.
6. Concurrency: one task or interrupt owns the instance and performs \`ADIA_Component_Init()\`, \`ADIA_Component_Cyclic()\` or \`ADIA_Component_OneStep()\`, and \`SM_Reset()\`. The only call that other contexts may make is \`SM_PostEvent()\`. Do not call the state machine from two contexts at once.

## 3. Example code

### STM32 HAL, timer interrupt

The timer period must equal \`SM_TICK_MS\`. For example, an 84 MHz timer clock with prescaler 84 - 1 runs at 1 MHz, and the period register is then \`SM_TICK_MS * 1000 - 1\`.

\`\`\`c
#include "adia_component.h"
#include "stm32f4xx_hal.h"

extern TIM_HandleTypeDef htim6;   /* period = SM_TICK_MS */

static ADIA_Instance_t g_sm;
static ADIA_Scheduler_t g_sched;

void App_Init(void)
{
    if (ADIA_Component_Init(&g_sm) != SM_ERR_NONE) {
        /* Outputs are already in their safe state; log SM_GetError(&g_sm). */
    }
    ADIA_Scheduler_Init(&g_sched, HAL_GetTick());
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_TIM6_Init();
    App_Init();
    (void)HAL_TIM_Base_Start_IT(&htim6);
    for (;;) {
        /* Background work only; the state machine runs in the interrupt. */
    }
}

/* HAL calls this on every TIM6 update. */
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM6) {
        (void)ADIA_Component_OneStep(&g_sm, &g_sched, HAL_GetTick());
    }
}
\`\`\`

### Super-loop

\`\`\`c
int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    App_Init();
    for (;;) {
        uint32_t delta_ms = 0U;
        if (ADIA_Scheduler_Poll(&g_sched, HAL_GetTick(), &delta_ms)) {
            if (ADIA_Component_Cyclic(&g_sm, delta_ms) != SM_ERR_NONE) {
                /* Fault latched; outputs are safe. Log SM_GetError(&g_sm). */
            }
        }
        if (ADIA_Scheduler_GetOverruns(&g_sched) > 0U) {
            /* Missed releases occurred; report them. */
        }
    }
}
\`\`\`

## 4. Back-to-back test checklist

Run the same model in Stateflow on the host and on the target, then compare:

- Align the first tick. Both runs start at the same sample time (\`SM_TICK_MS\` equals the Stateflow sample time), and the first step is step 1 in both.
- Set \`executeAtInitialization\` in the model to the same value as the Stateflow chart's "Execute (enter) chart at initialization" setting.
- Drive identical input sequences, one value set per step, from the same test vectors.
- After every step, compare the outputs and the active state configuration (\`SM_IsStateActive()\`, \`SM_GetActive()\`).
- Include a case with a jittered tick inside the window and a case outside it (expect \`SM_ERR_TIMING\` under \`latch\`, or a counted violation from \`SM_GetTimingViolations()\` under \`monitor\`).
- Include a reset and a fault recovery.
- For any mismatch, check the known differences in section 5 first. Otherwise record the first differing step, its inputs and the model element involved.

## 5. Several charts and rates

A firmware with several charts (or one chart per rate, the replacement for a multirate Stateflow chart) uses one generated package per chart in one build.

- Prefixes: give every chart its own model option \`codePrefix\` (upper case, for example \`PUMP\` or \`MOTOR\`; invalid or reserved values such as \`MCAL\`, \`ADIA\`, \`HAL\` and \`HIL\` are rejected by model validation). Every external function, type, macro, include guard and file name of the chart then carries it: \`PUMP_Init()\`, \`PUMP_TICK_MS\`, \`PUMP_Instance_t\`, \`pump_core.c\`, \`pump_mcal_dio.h\`, \`PUMP_MCAL_CH_*\`, and in this component layer \`PUMP_Component_OneStep()\` and \`PUMP_Scheduler_t\`. Two charts never collide at link time. The default prefix keeps the unprefixed names.
- Shared MCAL: the MCAL driver functions (\`MCAL_Dio_ReadChannel\`, \`MCAL_Dio_WriteChannel\`, \`MCAL_ReadChannelValue\`, \`MCAL_WriteChannelValue\`, \`MCAL_ApplySafeOutputs\`, \`MCAL_Watchdog_Kick\`) are never prefixed and have identical prototypes in every chart's MCAL header, so one driver implementation serves all charts. Channel numbers are the generated per-chart \`<PREFIX>_MCAL_CH_*\` macros; keep them disjoint between charts that write the same physical channel, or arbitrate in the driver.
- Base tick: run one periodic timer or RTOS tick at the greatest common divisor of all chart ticks (10 ms and 50 ms: base 10 ms; 20 ms and 30 ms: base 10 ms). Each chart is released every \`chart_tick / base_tick\` base ticks, with a counter per chart. Each chart must still receive its own tick as the step delta, so \`PUMP_Step(&pump, PUMP_TICK_MS)\` is called with the chart's period, never the base period.
- One scheduler per chart: either one \`<PREFIX>_Scheduler_t\` per chart polled with the same monotonic clock (\`<PREFIX>_Scheduler_Poll()\` then \`<PREFIX>_Component_Cyclic()\`), which gives each chart its own release grid and its own overrun count, or a single base-tick dispatcher that calls \`<PREFIX>_Component_OneStep()\` of each due chart.
- Priority by rate (rate-monotonic): the shortest period gets the highest priority. In an RTOS give each chart its own task with that priority; in a super-loop or from one timer ISR call the due charts from the fastest to the slowest. A slow chart must not delay a fast chart beyond one base tick.
- Overrun handling: a chart that is still running when its next release arrives is not re-entered (the component returns a timing error and counts it). Read the per-chart overrun counter, and decide per chart whether to drop the release (default), degrade, or go to the safe state. Missed releases are never burst. Keep the sum of worst-case execution times of all charts released in the same base tick below the base tick.
- Data between charts: exchange values through the MCAL or through plain variables written by one chart and read by the other at the slower chart's release; never share an instance between two charts.

## 6. Known differences

- Single rate per chart: all states run at \`SM_TICK_MS\`. A multirate Stateflow chart must be split into charts, one per rate.
- Local events use the run-to-completion queue of UML/SysML, not Stateflow's immediate nested broadcast. The order in which events are processed can differ from Stateflow.
- Integer arithmetic saturates on overflow. Stateflow wraps some integer types.
- Fixed-point variables (\`fixdt\`) are stored as binary-point integers: the real value is the stored integer times 2^-F, where the fraction length F is declared per variable together with a word length of 8, 16 or 32 bits and signedness. Multiplication and division use 64-bit integer intermediates, so the generated C is integer-only (no floating-point operations on fixed-point values) and requires C99 or later. The chart option \`fixedPointRounding\` selects \`floor\` (default, toward negative infinity) or \`nearest\` (half toward positive infinity) for conversions and divisions, as Simulink's Floor and Nearest do. Overflow saturates to the range of the format by default; a variable with overflow policy \`error\` latches the arithmetic error instead. Fixed-point variables cannot be mapped to I/O channels: assign them from a floating or integer variable first.
- Hand-written C functions are called directly by the generated code (section 7); the chart's simulation uses the declared simulation expression instead, so the two must agree.

## 7. Custom code (external C functions)

When the chart declares external functions, the generated \`sm_core.c\` and \`sm_user_logic.c\` include the declared headers (\`#include "<header>"\`) and call the functions as \`name((T1)(arg1), (T2)(arg2))\`, with the arguments converted (saturating) to the declared parameter types.

- Provide every declared header and its implementation in the firmware build, and add the directory of the headers to the include path. The headers and function names are yours: the \`codePrefix\` option never renames them.
- Keep each implementation consistent with the simulation expression declared in the chart (same results for the same arguments, same return type); the simulation and the back-to-back tests only model the function through that expression.
- The functions run in the context of the chart task, once per call site evaluation, inside the tick. They must be reentrant with respect to the chart (no hidden state shared with other contexts without protection), non-blocking, with a bounded execution time that fits in the tick period \`SM_TICK_MS\`, and free of side effects the chart does not expect: a guard may be evaluated several times per tick and in any order.
- A floating-point result that is not finite raises the chart's arithmetic error (\`SM_ERR_ARITHMETIC\`).
${fastTask === undefined ? '' : renderFastTaskSection(fastTask)}`;
}

export function generateEmbeddedProject(
  config: HILConfig,
  pack: TargetPackManifest,
  codePrefix?: string,
  fastTask?: EmbeddedFastTask,
): EmbeddedProjectResult {
  const selection = resolveTargetSelection(config);
  if (!selection) throw new Error('An exact target selection is required');

  const channels = channelModel(config);
  const mcalHeaderContent = generateMcalHeader({ packTargetId: selection.targetId, channels });

  // Generate driver providers
  const driverResult = generateDriverProviders(config, pack);

  // Generate platform build assets
  const platformResult = generatePlatformProject(config, pack);

  // Component files
  const [componentHeaderFile, componentSourceFile, integrationGuideFile] = applyCodePrefix([
    { name: 'adia_component.h', content: renderComponentHeader() },
    { name: 'adia_component.c', content: renderComponentSource() },
    { name: 'integration_guide.md', content: renderIntegrationGuide(fastTask) },
  ], codePrefix);
  const componentHeader = componentHeaderFile.content;
  const componentSource = componentSourceFile.content;
  const integrationGuide = integrationGuideFile.content;
  const componentStem = componentHeaderFile.name.replace(/\.h$/, '');

  const files: EmbeddedProjectFile[] = [
    { path: 'src/mcal/adia_mcal.h', layer: 'mcal', sha256: contentHash(mcalHeaderContent), content: mcalHeaderContent },
    { path: 'src/mcal/adia_mcal.c', layer: 'mcal', sha256: contentHash(renderMcalImplementation(config, channels)), content: renderMcalImplementation(config, channels) },
    { path: `src/component/${componentStem}.h`, layer: 'component', sha256: contentHash(componentHeader), content: componentHeader },
    { path: `src/component/${componentStem}.c`, layer: 'component', sha256: contentHash(componentSource), content: componentSource },
    ...driverResult.files.map(f => ({ path: f.path, layer: 'driver' as const, sha256: f.sha256, content: f.content })),
    ...platformResult.files.map(f => ({ path: f.path, layer: f.layer, sha256: f.sha256, content: f.content })),
    { path: 'docs/INTEGRATION.md', layer: 'build', sha256: contentHash(integrationGuide), content: integrationGuide },
  ];

  const contentHashes: Record<string, string> = {};
  for (const f of files) {
    contentHashes[f.path] = f.sha256;
  }

  const manifest = createIntegrationManifest(selection, driverResult.channels, contentHashes);
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  files.push({
    path: 'integration_manifest.json',
    layer: 'build',
    sha256: contentHash(manifestJson),
    content: manifestJson,
  });

  const diagnostics: string[] = [];
  if (manifest.flashBlocked) {
    diagnostics.push(`Flash blocked due to stubs: ${manifest.stubs.join(', ')}`);
  }

  return {
    files,
    manifest,
    diagnostics,
  };
}

// Backward compatibility legacy wrapper
export interface EmbeddedLayerFile {
  name: string;
  content: string;
}

export interface EmbeddedIntegrationManifest {
  schemaVersion: '1.0.0';
  targetSelection: NonNullable<ReturnType<typeof resolveTargetSelection>>;
  generatedLayers: readonly ['component', 'mcal', 'driver'];
  stubbedPeripherals: readonly McalPeripheral[];
  flashBlocked: boolean;
  blockReasons: readonly string[];
}

export interface EmbeddedLayerResult {
  files: EmbeddedLayerFile[];
  manifest: EmbeddedIntegrationManifest;
}

export function generateEmbeddedLayers(config: HILConfig, codePrefix?: string): EmbeddedLayerResult {
  const targetSelection = resolveTargetSelection(config);
  if (!targetSelection) throw new Error('An exact target selection is required for embedded layers');
  const channels = channelModel(config);
  const stubbedPeripherals = [...new Set(channels
    .map(channel => channel.peripheral)
    .filter(peripheral => !isProviderImplemented(config, peripheral)))].sort();
  const manifest: EmbeddedIntegrationManifest = {
    schemaVersion: '1.0.0',
    targetSelection,
    generatedLayers: ['component', 'mcal', 'driver'],
    stubbedPeripherals,
    flashBlocked: stubbedPeripherals.length > 0,
    blockReasons: stubbedPeripherals.length > 0 ? ['TARGET_DRIVER_PROVIDER_NOT_GENERATED'] : [],
  };

  const header = generateMcalHeader({ packTargetId: targetSelection.targetId, channels });
  const mcalImpl = renderMcalImplementation(config, channels);
  const [compHeaderFile, compSourceFile] = applyCodePrefix([
    { name: 'adia_component.h', content: renderComponentHeader() },
    { name: 'adia_component.c', content: renderComponentSource() },
  ], codePrefix);

  return {
    files: [
      { name: 'adia_mcal.h', content: header },
      { name: 'adia_mcal.c', content: mcalImpl },
      compHeaderFile,
      compSourceFile,
      { name: 'integration_manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    ],
    manifest,
  };
}
