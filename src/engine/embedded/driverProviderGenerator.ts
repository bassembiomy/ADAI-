import type { TargetPackManifest } from '../targetPacks/targetPackTypes.js';
import type { HILConfig } from '../hil/hilTypes.js';
import { resolveTargetSelection } from '../hil/hilTypes.js';
import { createHash } from 'node:crypto';

export interface DriverProviderResolution {
  channelId: string;
  peripheral: string;
  provider: string;
  sourceAssetIds: readonly string[];
  stub: boolean;
  reason?: 'UNSUPPORTED_PERIPHERAL' | 'UNSUPPORTED_MODE' | 'PIN_CONFLICT';
}

export interface GeneratedDriverFile {
  path: string;
  layer: 'driver';
  sha256: `sha256:${string}`;
  content: string;
}

export interface DriverProviderGeneratorResult {
  files: GeneratedDriverFile[];
  channels: DriverProviderResolution[];
}

function sha256Content(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

export function generateDriverProviders(
  config: HILConfig,
  pack: TargetPackManifest,
): DriverProviderGeneratorResult {
  const selection = resolveTargetSelection(config);
  const driverMode = selection?.driverMode ?? 'vendor';

  const channelResolutions: DriverProviderResolution[] = [];
  const filesMap = new Map<string, string>();

  const requestedPeripherals = [...new Set(config.channels.map(c => c.peripheral.toLowerCase()))].sort();

  for (const channel of config.channels) {
    const p = channel.peripheral.toLowerCase();
    const isSupported = pack.capabilityManifest.supportedPeripherals.includes(p) &&
      pack.supportedDriverModes.includes(driverMode);

    if (isSupported) {
      channelResolutions.push({
        channelId: channel.id,
        peripheral: p,
        provider: `${pack.targetId}-${p}-vendor`,
        sourceAssetIds: pack.assets?.map(a => a.path) ?? [],
        stub: false,
      });
    } else {
      channelResolutions.push({
        channelId: channel.id,
        peripheral: p,
        provider: `${pack.targetId}-${p}-stub`,
        sourceAssetIds: [],
        stub: true,
        reason: 'UNSUPPORTED_PERIPHERAL',
      });
    }
  }

  for (const peripheral of requestedPeripherals) {
    const channelsForPeripheral = config.channels.filter(c => c.peripheral.toLowerCase() === peripheral);
    const isSupported = pack.capabilityManifest.supportedPeripherals.includes(peripheral) &&
      pack.supportedDriverModes.includes(driverMode);

    const lines: string[] = [
      `/* Driver provider implementation for peripheral: ${peripheral} */`,
      `#include "adia_mcal.h"`,
      `#include <stdint.h>`,
      `#include <stddef.h>`,
      ``,
    ];

    if (!isSupported) {
      lines.push(`/* STUB PROVIDER FOR UNSUPPORTED PERIPHERAL: ${peripheral} */`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_init(void) { return ADIA_MCAL_NOT_IMPLEMENTED; }`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_deinit(void) { return ADIA_MCAL_NOT_IMPLEMENTED; }`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_health(void) { return ADIA_MCAL_NOT_IMPLEMENTED; }`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_safe_state(void) { return ADIA_MCAL_NOT_IMPLEMENTED; }`);
    } else {
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_init(void) { return ADIA_MCAL_OK; }`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_deinit(void) { return ADIA_MCAL_OK; }`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_health(void) { return ADIA_MCAL_OK; }`);
      lines.push(`adia_mcal_status_t adia_mcal_${peripheral}_safe_state(void) {`);
      for (const ch of channelsForPeripheral) {
        if (ch.direction === 'Out') {
          lines.push(`    /* Apply safe output for channel ${ch.id} on pin ${ch.pin ?? 'N/A'} */`);
        }
      }
      lines.push(`    return ADIA_MCAL_OK;`);
      lines.push(`}`);
    }

    filesMap.set(`src/driver/adia_mcal_${peripheral}.c`, `${lines.join('\n')}\n`);
  }

  const generatedFiles: GeneratedDriverFile[] = Array.from(filesMap.entries()).map(([path, content]) => ({
    path,
    layer: 'driver',
    sha256: sha256Content(content),
    content,
  }));

  return {
    files: generatedFiles,
    channels: channelResolutions,
  };
}
