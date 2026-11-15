import { describe, expect, it } from 'vitest';
import type { HILConfig } from '../hil/hilTypes.js';
import { BUILTIN_TARGET_PACKS } from '../targetPacks/defaultTargetPacks';
import { generateEmbeddedProject } from './embeddedLayerGenerator';

/*
 * The integration guide always documents the fast task for X-Bridges separate-task states, worded conditionally,
 * so a chart generated without the fast-task argument still gets the section.
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

const guideOf = (fastTask?: { periodUs: number; stepsPerTick: number }): string => {
  const result = generateEmbeddedProject(config, BUILTIN_TARGET_PACKS[0], undefined, fastTask);
  const file = result.files.find((item) => item.path === 'docs/INTEGRATION.md');
  if (file === undefined) throw new Error('integration_guide.md was not generated');
  return file.content;
};

describe('integration guide fast-task section', () => {
  it('is emitted by generateEmbeddedProject without a fast-task argument', () => {
    const guide = guideOf();
    expect(guide).toContain('SM_XB_Task');
    expect(guide).toContain('SM_XB_TASK_PERIOD_US');
    expect(guide).toContain('model_step0');
  });

  it('is worded conditionally and keeps the rate figures when a fast task is given', () => {
    const guide = guideOf({ periodUs: 50, stepsPerTick: 20 });
    expect(guide).toContain("If the chart has X-Bridges states with solver.execution = 'separate-task'");
    expect(guide).toContain('SM_XB_TASK_PERIOD_US` (50 us)');
    expect(guide).toContain('SM_XB_TASK_STEPS_PER_TICK` (20)');
    expect(guide).toContain('SM_XB_Task');
    expect(guide).toContain('model_step0');
  });
});
