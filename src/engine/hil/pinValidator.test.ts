import { describe, it, expect } from 'vitest';
import { validatePinAssignments } from './pinValidator';
import type { DriverChannel } from './hilTypes';

const ch = (over: Partial<DriverChannel> = {}): DriverChannel => ({
  id: 'c1', name: 'led', peripheral: 'GPIO', pin: '13', direction: 'Out',
  dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '',
  ...over,
});

describe('validatePinAssignments', () => {
  it('accepts valid Arduino Mega digital pin', () => {
    const issues = validatePinAssignments([ch()], { targetLegacy: 'Arduino_Mega' });
    expect(issues.filter(i => i.level === 'error')).toHaveLength(0);
  });

  it('rejects duplicate pin assignment across channels', () => {
    const issues = validatePinAssignments(
      [ch({ id: 'a', pin: '13' }), ch({ id: 'b', pin: '13', direction: 'In' })],
      { targetLegacy: 'Arduino_Mega' },
    );
    expect(issues.some(i => i.level === 'error' && i.channelId === 'b' && i.message.includes('already assigned'))).toBe(true);
  });

  it('rejects out-of-range pin on Uno (53 does not exist)', () => {
    const issues = validatePinAssignments([ch({ pin: '53' })], { targetLegacy: 'Arduino_Uno' });
    expect(issues.some(i => i.level === 'error' && i.message.includes('not available'))).toBe(true);
  });

  it('warns when Hardware Serial pins 0/1 are used on Arduino', () => {
    const issues = validatePinAssignments([ch({ pin: '0', direction: 'In' })], { targetLegacy: 'Arduino_Uno' });
    expect(issues.some(i => i.level === 'warning' && i.message.includes('Hardware Serial'))).toBe(true);
  });

  it('errors STM32-style pin names on Arduino targets', () => {
    const issues = validatePinAssignments([ch({ pin: 'PA5' })], { targetLegacy: 'Arduino_Mega' });
    expect(issues.some(i => i.level === 'error' && i.message.includes('STM32-style'))).toBe(true);
  });

  it('accepts STM32 PA5 on STM32 targets', () => {
    const issues = validatePinAssignments([ch({ pin: 'PA5' })], { targetLegacy: 'STM32F4' });
    expect(issues.filter(i => i.level === 'error')).toHaveLength(0);
  });

  it('errors output on ESP32 input-only pins 34-39', () => {
    const issues = validatePinAssignments([ch({ pin: '35' })], { targetLegacy: 'ESP32' });
    expect(issues.some(i => i.level === 'error' && i.message.includes('input-only'))).toBe(true);
  });

  it('warns on ESP32 strapping pins', () => {
    const issues = validatePinAssignments([ch({ pin: '12' })], { targetLegacy: 'ESP32' });
    expect(issues.some(i => i.level === 'warning' && i.message.includes('strapping'))).toBe(true);
  });

  it('errors unknown pin when pack provides a complete pins[] list', () => {
    const pack = { pins: [{ id: 'PB5' }], pinsComplete: true };
    const issues = validatePinAssignments([ch({ pin: 'PD9' })], { targetLegacy: 'STM32F1', pack });
    expect(issues.some(i => i.level === 'error' && i.message.includes('not defined in target pack'))).toBe(true);
  });

  it('errors peripheral unsupported by pack capability manifest', () => {
    const pack = { capabilityManifest: { supportedPeripherals: ['gpio', 'adc'] } };
    const issues = validatePinAssignments([ch({ peripheral: 'CAN', pin: 'PA0' })], { targetLegacy: 'STM32F1', pack });
    expect(issues.some(i => i.level === 'error' && i.message.includes('peripheral'))).toBe(true);
  });
});
