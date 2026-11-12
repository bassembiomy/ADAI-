import type { HILConfig } from '../hil/hilTypes.js';
import { resolveTargetSelection } from '../hil/hilTypes.js';
import { generateMcalHeader } from '../mcal/mcalHeaderGenerator.js';
import type { McalChannelConfig, McalPeripheral } from '../mcal/mcalTypes.js';
import type { TargetPackManifest } from '../targetPacks/targetPackTypes.js';
import { generateDriverProviders, type DriverProviderResolution } from './driverProviderGenerator.js';
import { generatePlatformProject } from './platformProjectGenerator.js';
import { createIntegrationManifest, type IntegrationManifest } from './integrationManifest.js';
import { contentHash } from './contentHash.js';

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

function renderIntegrationGuide(): string {
  return `# Stateflow to ADIA integration guide

This guide is for the embedded engineer who integrates the generated ADIA state machine into the target firmware. The chart behaves like the Stateflow chart it replaces, but it runs at one fixed rate, is called through the component API below, and talks to the hardware only through the MCAL layer.

## 1. Mapping from Stateflow / Embedded Coder

| Stateflow / Embedded Coder | ADIA (this project) |
| --- | --- |
| \`model_initialize()\` | \`ADIA_Component_Init(&sm)\`: \`SM_Init()\` initializes the data and, unless the chart is set to not execute at initialization, enters the default configuration; then the initial outputs are written. |
| \`model_step()\` called from \`rt_OneStep\` at the base rate | \`ADIA_Component_OneStep(&sm, &sched, now_ms)\` from a periodic timer interrupt or RTOS task with period \`SM_TICK_MS\`; or, in a super-loop, \`ADIA_Scheduler_Poll(&sched, now_ms, &delta)\` followed by \`ADIA_Component_Cyclic(&sm, delta)\` when it returns true. |
| Root inports and outports (\`rtU\`, \`rtY\`) | Generated \`SM_ReadInputs()\` and \`SM_WriteOutputs()\` call the MCAL functions in \`src/mcal/adia_mcal.c\`. The engineer implements the MCAL drivers on top of the vendor HAL. |
| Input events (event ports, function-call inputs) | \`SM_PostEvent()\`, safe to call from an ISR. Map \`SM_ENTER_CRITICAL()\` and \`SM_EXIT_CRITICAL()\` to interrupt masking on the target. Available when the model declares input events. |
| Step overrun, late or early tick | \`ADIA_Scheduler_GetOverruns()\` counts missed releases. \`SM_Step()\` returns \`SM_ERR_TIMING\` when the observed delta is outside \`SM_TICK_MIN_MS..SM_TICK_MAX_MS\`, and \`ADIA_Component_OneStep()\` returns it when a step is re-entered. |
| "Execute (enter) chart at initialization" | Model option \`executeAtInitialization\`. Stateflow's default is off; ADIA's default is on. When it is off, the generated \`sm_config.h\` defines \`SM_EXECUTE_AT_INIT 0U\`, and the first step only enters the default configuration. |

## 2. Integration steps

1. Implement the MCAL drivers for every channel in \`src/mcal/adia_mcal.c\`. Read and write functions must not block.
2. Init order: clocks, then the peripherals used by MCAL, then \`ADIA_Component_Init(&sm)\`, then \`ADIA_Scheduler_Init(&sched, now_ms)\`, and only then enable the periodic timer or the super-loop. Interrupts that call \`ADIA_Component_OneStep()\` or \`SM_PostEvent()\` must not be enabled before \`ADIA_Component_Init()\` has returned.
3. Periodic task: run it with period \`SM_TICK_MS\` (the model tick). Measure the real period on the target. Every observed delta must lie inside the jitter window \`SM_TICK_MIN_MS..SM_TICK_MAX_MS\` (tolerance \`SM_TICK_TOLERANCE_MS\`); an out-of-window delta faults the chart with \`SM_ERR_TIMING\`.
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
- Include a case with a jittered tick inside the window and a case outside it (expect \`SM_ERR_TIMING\`).
- Include a reset and a fault recovery.
- For any mismatch, check the known differences in section 5 first. Otherwise record the first differing step, its inputs and the model element involved.

## 5. Known differences

- Single rate per chart: all states run at \`SM_TICK_MS\`. A multirate Stateflow chart must be split into charts, one per rate.
- Local events use the run-to-completion queue of UML/SysML, not Stateflow's immediate nested broadcast. The order in which events are processed can differ from Stateflow.
- Integer arithmetic saturates on overflow. Stateflow wraps some integer types.
- No fixed-point data types.
- Actions cannot call hand-written C functions.
`;
}

export function generateEmbeddedProject(
  config: HILConfig,
  pack: TargetPackManifest,
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
  const componentHeader = renderComponentHeader();
  const componentSource = renderComponentSource();
  const integrationGuide = renderIntegrationGuide();

  const files: EmbeddedProjectFile[] = [
    { path: 'src/mcal/adia_mcal.h', layer: 'mcal', sha256: contentHash(mcalHeaderContent), content: mcalHeaderContent },
    { path: 'src/mcal/adia_mcal.c', layer: 'mcal', sha256: contentHash(renderMcalImplementation(config, channels)), content: renderMcalImplementation(config, channels) },
    { path: 'src/component/adia_component.h', layer: 'component', sha256: contentHash(componentHeader), content: componentHeader },
    { path: 'src/component/adia_component.c', layer: 'component', sha256: contentHash(componentSource), content: componentSource },
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

export function generateEmbeddedLayers(config: HILConfig): EmbeddedLayerResult {
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
  const compHeader = renderComponentHeader();
  const compSource = renderComponentSource();

  return {
    files: [
      { name: 'adia_mcal.h', content: header },
      { name: 'adia_mcal.c', content: mcalImpl },
      { name: 'adia_component.h', content: compHeader },
      { name: 'adia_component.c', content: compSource },
      { name: 'integration_manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    ],
    manifest,
  };
}
