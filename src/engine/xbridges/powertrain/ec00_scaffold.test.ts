// EC-00 acceptance tests: scaffolding for the engine calibration blocks (docs/powertrain/engine-calibration-spec.md).
import { describe, it, expect } from 'vitest';
import { PT_CATEGORY_ORDER, PT_SYMBOL_IDS } from './ptSpec';
import type { PtBlockSpec } from './ptSpec';

describe('engine calibration scaffolding', () => {
  it('has Engine Calibration sub-libraries after the Simulink ones', () => {
    const ec = ['Powertrain / Engine Calibration / Engine Plant', 'Powertrain / Engine Calibration / Air Path',
      'Powertrain / Engine Calibration / Fueling and Actuation', 'Powertrain / Engine Calibration / Control and Calibration',
      'Powertrain / Engine Calibration / Test Cell and DoE'];
    for (const c of ec) expect(PT_CATEGORY_ORDER as readonly string[]).toContain(c);
    const lastSimulink = Math.max(...(PT_CATEGORY_ORDER as readonly string[]).map((c, i) => c.includes('Engine Calibration') ? -1 : i));
    for (const c of ec) expect((PT_CATEGORY_ORDER as readonly string[]).indexOf(c)).toBeGreaterThan(lastSimulink);
  });

  it('has symbols for every new block', () => {
    for (const id of ['cylinder-ci', 'cylinder-si', 'throttle', 'intake-manifold', 'turbocharger', 'fuel-injector',
      'valvetrain', 'calibration-ecu', 'calibration-map', 'dyno', 'ambient', 'doe-sweeper']) {
      expect(PT_SYMBOL_IDS as readonly string[], id).toContain(id);
    }
  });

  it('accepts user-spec blocks with a spec reference (type check)', () => {
    const s: Pick<PtBlockSpec, 'source' | 'specRef'> = { source: 'user-spec', specRef: 'docs/powertrain/engine-calibration-spec.md#2-blocks' };
    expect(s.source).toBe('user-spec');
  });
});
