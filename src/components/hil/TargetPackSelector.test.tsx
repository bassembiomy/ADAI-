import { describe, it, expect } from 'vitest';
import { getDefaultTargetRegistry } from '../../engine/targetPacks/defaultTargetPacks.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetPackSelector } from './TargetPackSelector.js';

describe('TargetPackSelector integration', () => {
  it('loads built-in registry manifests cleanly', () => {
    const registry = getDefaultTargetRegistry();
    const stm32 = registry.getTarget('stm32f407vgt6');
    expect(stm32).toBeDefined();
    expect(stm32?.displayName).toBe('STM32F407VG (Discovery)');
    expect(stm32?.capabilityManifest.supportedPeripherals).toContain('GPIO');
    expect(stm32?.capabilityManifest.supportedPeripherals).toContain('ADC');
  });

  it('does not display certification without recorded evidence', () => {
    const html = renderToStaticMarkup(
      <TargetPackSelector
        selectedTargetId="stm32f407vgt6"
        selectedDriverMode="vendor"
        onSelectTarget={() => undefined}
      />,
    );
    expect(html).toContain('Static analysis only');
    expect(html).not.toContain('>Certified<');
    expect(html).not.toContain('HARDWARE_TESTED');
  });
});
