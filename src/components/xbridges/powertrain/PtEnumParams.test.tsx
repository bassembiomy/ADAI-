// @vitest-environment jsdom
// Powertrain enum parameters in the X-Bridges properties panel: a dropdown with the options of the block spec, named by
// the parameter label (e.g. the Calibration ECU Mode must offer 'DoE override' and 'Map').
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XbridgesPropertiesPanel } from '../XbridgesPropertiesPanel';
import { BLOCK_LIBRARY } from '../../../engine/xbridges/BlockDefinitions';
import { POWERTRAIN_SPECS } from '../../../engine/xbridges/powertrain/index';

const options = (el: HTMLElement) => Array.from((el as HTMLSelectElement).options).map(o => o.value);

describe('Powertrain enum parameters', () => {
  afterEach(cleanup);

  it('Calibration ECU Mode offers DoE override and Map, shows the current value and updates it', () => {
    const b = BLOCK_LIBRARY.PT_CALIBRATION_ECU('ecu', { mode: 'Map' });
    const onUpdate = vi.fn();
    render(<XbridgesPropertiesPanel block={b as any} onUpdate={onUpdate} onClose={vi.fn()} />);
    const sel = screen.getByRole('combobox', { name: 'Mode' }) as HTMLSelectElement;
    expect(options(sel)).toEqual(['DoE override', 'Map']);
    expect(sel.value).toBe('Map');
    fireEvent.change(sel, { target: { value: 'DoE override' } });
    expect(onUpdate).toHaveBeenCalledWith('ecu', { params: { ...b.params, mode: 'DoE override' } });
  });

  it('every enum parameter of every Powertrain block is a dropdown with the spec options', () => {
    for (const spec of POWERTRAIN_SPECS) {
      const enums = spec.params.filter(p => p.kind === 'enum');
      if (enums.length === 0) continue;
      const b = BLOCK_LIBRARY[spec.type]('x', {});
      render(<XbridgesPropertiesPanel block={b as any} onUpdate={vi.fn()} onClose={vi.fn()} />);
      for (const p of enums) {
        const sel = screen.getByRole('combobox', { name: p.label });
        expect(options(sel), `${spec.type}.${p.name}`).toEqual(p.options);
        expect((sel as HTMLSelectElement).value, `${spec.type}.${p.name}`).toBe(String(b.params[p.name]));
      }
      cleanup();
    }
  });
});
