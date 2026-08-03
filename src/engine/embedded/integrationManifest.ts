import type { DriverProviderResolution } from './driverProviderGenerator.js';
import type { DriverMode } from '../targetPacks/targetPackTypes.js';

export interface IntegrationTargetSelection {
  targetId: string;
  packVersion: string;
  driverMode: DriverMode;
  boardRevision: string;
}

export interface IntegrationManifest {
  schemaVersion: '1.0.0';
  targetSelection: IntegrationTargetSelection;
  channels: readonly DriverProviderResolution[];
  stubs: readonly string[];
  flashBlocked: boolean;
  blockReasons: readonly string[];
  contentHashes: Record<string, string>;
}

export function createIntegrationManifest(
  targetSelection: IntegrationTargetSelection,
  channels: readonly DriverProviderResolution[],
  contentHashes: Record<string, string>,
): IntegrationManifest {
  const stubbedChannels = channels.filter(c => c.stub).map(c => c.channelId);
  const flashBlocked = stubbedChannels.length > 0;
  const blockReasons: string[] = [];
  if (flashBlocked) {
    blockReasons.push('UNSUPPORTED_DRIVER_PROVIDERS');
  }

  return {
    schemaVersion: '1.0.0',
    targetSelection,
    channels,
    stubs: stubbedChannels,
    flashBlocked,
    blockReasons,
    contentHashes,
  };
}
