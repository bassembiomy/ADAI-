import { describe, it, expect } from 'vitest';
import { purgePhantomVariables } from './phantomPurge';

describe('phantomPurge - PHANTOM_PURGE Protocol', () => {
  it('should remove phantom struct variables not defined in JSON model or engine reserved list', () => {
    const structCode = `
      typedef struct {
          volatile float in_sensor;
          volatile bool out_led;
          volatile uint32_t phantom_x;
          volatile uint32_t current_state;
      } SM_Data_t;
    `;

    const model = {
      variables: [
        { name: 'in_sensor', type: 'float' },
        { name: 'out_led', type: 'bool' }
      ]
    };

    const result = purgePhantomVariables(structCode, model);
    expect(result).toContain('in_sensor;');
    expect(result).toContain('out_led;');
    expect(result).toContain('current_state;');
    expect(result).not.toContain('phantom_x;');
  });
});
