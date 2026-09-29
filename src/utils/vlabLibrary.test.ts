import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY, scoreVLabBlock, searchVLabBlocks } from './vlabLibrary';

describe('VLab Library Search & Scoring', () => {
  it('defines functional Gas sensors and the requested Gas port domains', () => {
    const blocks = new Map(VLAB_LIBRARY.flatMap(d => d.blocks).map(block => [block.id, block]));
    const portDomains = (id: string) => Object.fromEntries((blocks.get(id)?.ports ?? []).map(port => [port.id, port.domain]));

    expect(portDomains('gas_pressure_sensor')).toEqual({ p: 'Gas', out: 'Physical' });
    expect(portDomains('gas_flow_sensor')).toEqual({ p: 'Gas', n: 'Gas', out: 'Physical' });
    expect(blocks.get('gas_pressure_sensor')?.equation).toContain('mass_flow = 0');
    expect(blocks.get('gas_pressure_sensor')?.equation).toContain('out = P(p)');
    expect(blocks.get('gas_flow_sensor')?.equation).toContain('P(p) = P(n)');
    expect(blocks.get('gas_flow_sensor')?.equation).toContain('out = mdot');
    expect(portDomains('gas_reservoir')).toEqual({ a: 'Gas', s: 'Physical' });
    expect(portDomains('gas_restriction')).toEqual({ a: 'Gas', b: 'Gas', ar: 'Physical' });
    expect(portDomains('gas_flow_source')).toEqual({ a: 'Gas', b: 'Gas', m: 'Physical' });
    expect(portDomains('gas_pressure_source')).toEqual({ a: 'Gas', b: 'Gas', p: 'Physical' });
    expect(portDomains('gas_rotational_conv')).toEqual({ a: 'Gas', h: 'Gas', r: 'Rotational', c: 'Rotational' });
    expect(portDomains('gas_translational_conv')).toEqual({ a: 'Gas', h: 'Gas', r: 'Translational', c: 'Translational' });
    expect(blocks.get('gas_pipe')?.ports.map(port => port.id)).toEqual(['a', 'b']);
    expect(blocks.has('gas_properties')).toBe(false);
  });

  it('defines the PMSM with three-phase electrical and rotational ports', () => {
    const pmsm = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'pmsm');

    expect(pmsm?.ports.map(port => port.id)).toEqual(['a', 'b', 'c', 'n', 'r']);
    expect(pmsm?.ports.slice(0, 4).every(port => port.domain === 'Electrical')).toBe(true);
    expect(pmsm?.ports[4]?.domain).toBe('Rotational');
  });

  it('exposes every DC Motor parameter used by the simulation equation', () => {
    const dcMotor = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'dc_motor');

    expect(dcMotor?.equation).toContain('T = Kt*I');
    expect(dcMotor?.params.Kt).toEqual({
      value: 0.05,
      unit: 'N-m/A',
      label: 'Torque Const'
    });
    expect(dcMotor?.params.B).toEqual({
      value: 0.001,
      unit: 'N-m-s/rad',
      label: 'Viscous Damping'
    });
  });

  it('exposes the BLDC Motor electrical and mechanical runtime parameters', () => {
    const bldcMotor = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'bldc_motor');

    expect(bldcMotor?.params.Ls).toEqual({
      value: 0.002,
      unit: 'H',
      label: 'Phase Ind'
    });
    expect(bldcMotor?.params.Kt).toEqual({
      value: 0.1,
      unit: 'N-m/A',
      label: 'Torque Const'
    });
    expect(bldcMotor?.params.J).toEqual({
      value: 0.02,
      unit: 'kg-m^2',
      label: 'Inertia'
    });
    expect(bldcMotor?.params.B).toEqual({
      value: 0.002,
      unit: 'N-m-s/rad',
      label: 'Viscous Damping'
    });
  });

  it('exposes the AC Motor mechanical parameters used by the simulation equation', () => {
    const acMotor = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'ac_motor');

    expect(acMotor?.params.J).toEqual({
      value: 0.05,
      unit: 'kg-m^2',
      label: 'Inertia'
    });
    expect(acMotor?.params.B).toEqual({
      value: 0.005,
      unit: 'N-m-s/rad',
      label: 'Viscous Damping'
    });
  });

  it('prioritizes exact name/id match "constant" over description matches', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);
    const results = searchVLabBlocks(allBlocks, 'constant');

    expect(results.length).toBeGreaterThan(0);
    // The top result must be the Constant block
    expect(results[0].name).toBe('Constant');
    expect(results[0].id).toBe('constant');
  });

  it('scores exact matches higher than substring or description matches', () => {
    const constantBlock = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'constant')!;
    const dcVoltageBlock = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'dc_voltage')!;

    const constantScore = scoreVLabBlock(constantBlock, 'constant');
    const dcVoltageScore = scoreVLabBlock(dcVoltageBlock, 'constant');

    expect(constantScore).toBeGreaterThan(dcVoltageScore);
    expect(constantScore).toBe(1000);
  });
});
