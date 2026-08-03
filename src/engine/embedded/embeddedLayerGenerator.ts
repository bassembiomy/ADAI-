import type { HILConfig } from '../hil/hilTypes.js';
import { resolveTargetSelection } from '../hil/hilTypes.js';
import { generateMcalHeader } from '../mcal/mcalHeaderGenerator.js';
import type { McalChannelConfig, McalPeripheral } from '../mcal/mcalTypes.js';

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

function renderMcalStub(channels: readonly McalChannelConfig[]): string {
  const peripherals = [...new Set(channels.map(channel => channel.peripheral))].sort();
  const lines = [
    '/* Generated integration stubs. Replace through a certified target driver provider. */',
    '#include "adia_mcal.h"',
    '',
  ];
  for (const peripheral of peripherals) {
    const pfx = prefix(peripheral);
    const type = enumName(peripheral);
    const configured = channels.filter(channel => channel.peripheral === peripheral);
    const hasInput = configured.some(channel => channel.direction === 'input');
    const hasOutput = configured.some(channel => channel.direction === 'output');
    const communication = ['uart', 'spi', 'i2c', 'can'].includes(peripheral);
    for (const operation of ['init', 'deinit', 'health', 'safe_state']) {
      lines.push(`adia_mcal_status_t ${pfx}_${operation}(void)`);
      lines.push('{');
      lines.push('    return ADIA_MCAL_NOT_IMPLEMENTED;');
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
      lines.push('    return ADIA_MCAL_NOT_IMPLEMENTED;');
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
      lines.push('    return ADIA_MCAL_NOT_IMPLEMENTED;');
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

function renderComponentSource(peripherals: readonly McalPeripheral[]): string {
  const initLines = peripherals.map(peripheral => [
    `    if (${prefix(peripheral)}_init() != ADIA_MCAL_OK) {`,
    '        return SM_ERR_CONFIGURATION;',
    '    }',
  ]).flat();
  return `#include "adia_component.h"
#include "adia_mcal.h"

SM_Error_t ADIA_Component_Init(ADIA_Instance_t *instance)
{
${initLines.join('\n')}
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

export function generateEmbeddedLayers(config: HILConfig): EmbeddedLayerResult {
  const targetSelection = resolveTargetSelection(config);
  if (!targetSelection) throw new Error('An exact target selection is required for embedded layers');
  const channels = channelModel(config);
  const stubbedPeripherals = [...new Set(channels.map(channel => channel.peripheral))].sort();
  const manifest: EmbeddedIntegrationManifest = {
    schemaVersion: '1.0.0',
    targetSelection,
    generatedLayers: ['component', 'mcal', 'driver'],
    stubbedPeripherals,
    flashBlocked: stubbedPeripherals.length > 0,
    blockReasons: stubbedPeripherals.length > 0 ? ['TARGET_DRIVER_PROVIDER_NOT_GENERATED'] : [],
  };
  return {
    files: [
      { name: 'adia_mcal.h', content: generateMcalHeader({ packTargetId: targetSelection.targetId, channels }) },
      { name: 'adia_mcal.c', content: renderMcalStub(channels) },
      { name: 'adia_component.h', content: renderComponentHeader() },
      { name: 'adia_component.c', content: renderComponentSource(stubbedPeripherals) },
      { name: 'integration_manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    ],
    manifest,
  };
}
