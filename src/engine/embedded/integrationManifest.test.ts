import { describe, it, expect } from 'vitest';
import { createIntegrationManifest } from './integrationManifest';
import type { DriverProviderResolution } from './driverProviderGenerator';

describe('integrationManifest', () => {
  it('creates manifest and sets flashBlocked=true when any channel is stubbed', () => {
    const channels: DriverProviderResolution[] = [
      { channelId: 'ch1', peripheral: 'gpio', provider: 'stm32f4-gpio-vendor', sourceAssetIds: [], stub: false },
      { channelId: 'ch2', peripheral: 'dac', provider: 'stm32f4-dac-stub', sourceAssetIds: [], stub: true, reason: 'UNSUPPORTED_PERIPHERAL' },
    ];

    const manifest = createIntegrationManifest(
      { targetId: 'stm32f407vgt6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
      channels,
      { 'src/app/sm_core.c': 'sha256:1234' },
    );

    expect(manifest.flashBlocked).toBe(true);
    expect(manifest.stubs).toContain('ch2');
    expect(manifest.blockReasons).toContain('UNSUPPORTED_DRIVER_PROVIDERS');
  });
});
