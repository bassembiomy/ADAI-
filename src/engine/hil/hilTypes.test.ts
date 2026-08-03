import { describe, expect, it } from 'vitest';
import { applyTargetSelection, legacyTargetForTargetId, resolveTargetSelection } from './hilTypes.js';
import type { HILConfig } from './hilTypes.js';

describe('exact HIL target selection', () => {
  it('preserves exact target, pack version, and driver mode', () => {
    const config: HILConfig = {
      enabled: true,
      target: 'STM32F4',
      targetSelection: {
        targetId: 'stm32f407vgt6',
        packVersion: '1.0.0',
        driverMode: 'bare-metal',
        boardRevision: 'A',
      },
      clockSpeed: 168,
      channels: [],
      mappings: [],
      commPort: 'COM3',
      baudRate: 115200,
    };
    expect(resolveTargetSelection(config)).toEqual(config.targetSelection);
    expect(legacyTargetForTargetId(config.targetSelection!.targetId)).toBe('STM32F4');
  });

  it('migrates legacy family targets to exact static defaults', () => {
    const config = {
      enabled: true,
      target: 'ESP32',
      clockSpeed: 240,
      channels: [],
      mappings: [],
      commPort: 'COM3',
      baudRate: 115200,
    } satisfies HILConfig;
    expect(resolveTargetSelection(config)).toEqual({
      targetId: 'esp32-wroom-32',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    });
  });

  it('updates both exact selection and legacy compatibility target', () => {
    const config: HILConfig = {
      enabled: true,
      target: 'Generic',
      clockSpeed: 16,
      channels: [],
      mappings: [],
      commPort: 'COM3',
      baudRate: 115200,
    };
    const updated = applyTargetSelection(config, {
      targetId: 'atmega2560',
      packVersion: '1.0.0',
      driverMode: 'bare-metal',
      boardRevision: 'A',
    });
    expect(updated.target).toBe('Arduino_Mega');
    expect(updated.targetSelection?.driverMode).toBe('bare-metal');
    expect(config.target).toBe('Generic');
  });
});
