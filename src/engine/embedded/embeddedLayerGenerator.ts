import type { HILConfig } from '../hil/hilTypes.js';
import { resolveTargetSelection } from '../hil/hilTypes.js';
import { generateMcalHeader } from '../mcal/mcalHeaderGenerator.js';
import type { McalChannelConfig, McalPeripheral } from '../mcal/mcalTypes.js';
import type { TargetPackManifest } from '../targetPacks/targetPackTypes.js';
import { generateDriverProviders, type DriverProviderResolution } from './driverProviderGenerator.js';
import { generatePlatformProject } from './platformProjectGenerator.js';
import { createIntegrationManifest, type IntegrationManifest } from './integrationManifest.js';
import { createHash } from 'node:crypto';

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

function sha256Content(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
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

SM_Error_t ADIA_Component_Init(ADIA_Instance_t *instance);
SM_Error_t ADIA_Component_Cyclic(ADIA_Instance_t *instance, uint32_t observed_delta_ms);

#endif /* ADIA_COMPONENT_H */
`;
}

function renderComponentSource(): string {
  return `#include "adia_component.h"
#include "adia_mcal.h"

SM_Error_t ADIA_Component_Init(ADIA_Instance_t *instance)
{
    return SM_Init(instance);
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

  const files: EmbeddedProjectFile[] = [
    { path: 'src/mcal/adia_mcal.h', layer: 'mcal', sha256: sha256Content(mcalHeaderContent), content: mcalHeaderContent },
    { path: 'src/mcal/adia_mcal.c', layer: 'mcal', sha256: sha256Content(renderMcalImplementation(config, channels)), content: renderMcalImplementation(config, channels) },
    { path: 'src/component/adia_component.h', layer: 'component', sha256: sha256Content(componentHeader), content: componentHeader },
    { path: 'src/component/adia_component.c', layer: 'component', sha256: sha256Content(componentSource), content: componentSource },
    ...driverResult.files.map(f => ({ path: f.path, layer: 'driver' as const, sha256: f.sha256, content: f.content })),
    ...platformResult.files.map(f => ({ path: f.path, layer: f.layer, sha256: f.sha256, content: f.content })),
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
    sha256: sha256Content(manifestJson),
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
