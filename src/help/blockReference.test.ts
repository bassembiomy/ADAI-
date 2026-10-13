import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';
import { XBRIDGES_CATEGORIES } from '../utils/xbridges/XbridgesLibrary';
import { VLAB_LIBRARY } from '../utils/vlabLibrary';
import { getXBBlockCapability } from '../utils/stateMachine/xbCapabilities';
import { getBlockHelpReferences, getBlockHelpGaps } from './blockReference';

describe('registry-backed block help', () => {
  it('explains physical parameters beyond repeating their labels and units', () => {
    for (const block of getBlockHelpReferences().filter(r => r.source === 'V-Lab')) for (const p of block.parameters) {
      expect(p.description, `${block.id}:${p.name}`).not.toBe(`${p.label}${p.unit ? ` in ${p.unit}` : ''}.`);
    }
    const resistor = getBlockHelpReferences().find(r => r.id === 'vlab:resistor')!;
    expect(resistor.parameters.find(p => p.name === 'R')!.description).toMatch(/current|voltage/i);
    expect(getBlockHelpReferences().find(r => r.id === 'vlab:capacitor')!.parameters.find(p => p.name === 'v0')!.description).toMatch(/initial/i);
  });
  it('keeps corrected control and physical references aligned with current execution', () => {
    const refs=getBlockHelpReferences();
    const pid=BLOCK_LIBRARY.PID_BASIC('test',{mode:'P',Kp:2,sampleTime:0.1});
    expect(pid.execute!([3,1,0],pid.params,pid.state,0.1).outputs[0]).toBe(6);
    expect(refs.find(r=>r.id==='xbridges:PID_BASIC')!.example).toContain('Error=3');
    expect(refs.find(r=>r.id==='xbridges:SWITCH_CASE')!.parameters.find(p=>p.name==='numCases')!.description).toContain('inputs');
    expect(refs.find(r=>r.id==='xbridges:MPC_CONTROLLER')!.behavior).toContain('20');
    expect(refs.find(r=>r.id==='xbridges:ASIN')!.parameters.find(p=>p.name==='angle_unit')!.description).toContain('Output angle');
    const fundamental=refs.find(r=>r.id==='vlab:fundamental_reluctance')!;
    expect(fundamental.behavior).toContain('mu_r');
    expect(refs.find(r=>r.id==='vlab:ma_moisture_sensor')!.behavior).not.toContain('fixed signal');
    expect(refs.find(r=>r.id==='vlab:ma_flow_source')!.behavior).toContain('wired s');
    for(const block of refs.filter(r=>r.source==='V-Lab')) for(const [i,port] of block.ports.entries()) {
      const edges=block.diagram.edges.filter(edge=>edge.from===`port${i}`||edge.to===`port${i}`);
      expect(edges).toHaveLength(1);
      if(port.direction==='bidirectional') expect(edges[0].notation).toBe('conserving');
    }
  });
  it('includes every factory and physical component using unique qualified identities', () => {
    const refs = getBlockHelpReferences();
    expect(refs.filter(r => r.source === 'X-Bridges' && r.availability !== 'palette-only').map(r => r.typeId).sort()).toEqual(Object.keys(BLOCK_LIBRARY).sort());
    expect(refs.filter(r => r.source === 'X-Bridges' && r.availability === 'palette-only').map(r => r.typeId).sort()).toEqual(getBlockHelpGaps().paletteOnly);
    expect(refs.filter(r => r.source === 'V-Lab').map(r => r.typeId).sort()).toEqual(VLAB_LIBRARY.flatMap(d => d.blocks.map(b => b.id)).sort());
    expect(new Set(refs.map(r => r.id)).size).toBe(refs.length);
    expect(refs.every(r => r.id === `${r.source === 'X-Bridges' ? 'xbridges' : 'vlab'}:${r.typeId}`)).toBe(true);
  });
  it('keeps conserving, vector and composite ports distinct from directed signals', () => {
    const refs = getBlockHelpReferences();
    const r = refs.find(r => r.id === 'vlab:resistor')!;
    expect(r.inputs).toHaveLength(0);
    expect(r.outputs).toHaveLength(0);
    expect(r.ports.every(p => p.direction === 'bidirectional')).toBe(true);
    expect(r.parameters[0]).toMatchObject({ name: 'R', defaultValue: 100, bounds: { min: 0, exclusiveMin: true } });
    for (const block of VLAB_LIBRARY.flatMap(d => d.blocks)) {
      for (const p of block.ports.filter(p => p.width || p.composite)) {
        expect(refs.find(r => r.id === `vlab:${block.id}`)!.ports.find(rp => rp.id === p.id)).toMatchObject({ width: p.width, composite: p.composite });
      }
    }
  });
  it('documents source-specific behavior and worked representative examples', () => {
    const refs = getBlockHelpReferences();
    expect(refs.find(r => r.id === 'xbridges:Integrator')!.behavior).toMatch(/derivative.*input/i);
    expect(refs.find(r => r.id === 'xbridges:DFlipFlop')!.behavior).toMatch(/reset.*rising|rising.*reset/i);
    expect(refs.find(r => r.id === 'vlab:resistor')!.example).toMatch(/10.*0\.1/);
    expect(refs.every(r => r.description.length > 20 && r.behavior.length > 20 && r.example.length > 20 && r.diagram.nodes.length > 0)).toBe(true);
  });
  it('shows every palette item, including unavailable entries, without inventing a factory', () => {
    const refs = getBlockHelpReferences();
    const palette = new Set(XBRIDGES_CATEGORIES.flatMap(category => category.blocks.map(block => block.type)));
    for (const typeId of palette) expect(refs.find(ref => ref.id === `xbridges:${typeId}`), typeId).toBeDefined();
    const unavailable = refs.find(ref => ref.id === 'xbridges:COSEC')!;
    expect(getBlockHelpGaps().paletteOnly).toContain('COSEC');
    expect(unavailable.availability).toBe('palette-only');
    expect(unavailable.behavior).toMatch(/no.*factory|not executable/i);
    expect(unavailable.ports).toEqual([]);
    expect(unavailable.example).not.toMatch(/connect .*COSEC.*Scope/i);
  });
  it('derives symbol and terminal positions from live palettes and distinguishes embedded C eligibility', () => {
    const refs = getBlockHelpReferences();
    const physical = refs.find(ref => ref.id === 'vlab:resistor')!;
    expect(physical.icon).toBe(VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'resistor')!.icon);
    expect(physical.ports.map(port => port.position)).toEqual(['left', 'right']);
    expect(physical.connection).toMatch(/conserving.*domain/i);
    const signalOnly = refs.find(ref => ref.id === 'vlab:ps_gain')!;
    expect(signalOnly.ports.every(port => port.direction !== 'bidirectional')).toBe(true);
    expect(signalOnly.connection).toContain('Solver Configuration is not a directed signal input');
    expect(signalOnly.example).not.toContain('Connect a Solver Configuration to the signal network');
    const gain = refs.find(ref => ref.id === 'xbridges:GAIN')!;
    expect(gain.icon).toBe(XBRIDGES_CATEGORIES.flatMap(c => c.blocks).find(b => b.type === 'GAIN')?.icon);
    expect(gain.ports.filter(port => port.direction === 'input').every(port => port.position === 'left')).toBe(true);
    expect(gain.ports.filter(port => port.direction === 'output').every(port => port.position === 'right')).toBe(true);
    expect(gain.embedded?.eligible).toBe(getXBBlockCapability('GAIN')?.codegen);
    expect(gain.connection).toMatch(/output.*input.*port ID/i);
    const motor = refs.find(ref => ref.id === 'xbridges:AC_INDUCTION_MOTOR')!;
    expect(motor.embedded?.eligible).toBe(false);
    expect(motor.embedded?.description).toMatch(/not supported|unsupported|host-only/i);
    expect(physical.embedded).toBeUndefined();
  });
  it('keeps source-review gaps visible instead of counting connection scaffolding as complete instructions', () => {
    const refs = getBlockHelpReferences();
    expect(refs.filter(r => r.description === 'Purpose documentation is pending source review.')).toEqual([]);
    expect(getBlockHelpGaps().instructional).toEqual([]);
    expect(refs.find(r => r.id === 'xbridges:ACOSECH')!.behavior).toContain('reciprocal sine');
    expect(refs.find(r => r.id === 'xbridges:DOE_MODULE')!.behavior).toContain('do not initiate training');
  });
});
