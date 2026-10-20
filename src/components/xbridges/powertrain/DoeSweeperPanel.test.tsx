// @vitest-environment jsdom
// EC-08b acceptance tests: DoE Sweeper results and calibration export in the X-Bridges properties panel.
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XbridgesPropertiesPanel } from '../XbridgesPropertiesPanel';
import { BLOCK_LIBRARY } from '../../../engine/xbridges/BlockDefinitions';
import { XbridgesEngine } from '../../../engine/xbridges/XbridgesEngine';
import { Solvers } from '../../../engine/xbridges/Solvers';
import { makeBus } from '../../../engine/xbridges/bus/busCore';
import { calibrationMapsFromResults, mappedEngineTablesFromResults, doeModuleTable } from '../../../engine/xbridges/powertrain/calibrationExport';
import { doeSweeperResults } from '../../../engine/xbridges/powertrain/blocks/doeSweeper';

function sweptBlock() {
  const plant: any = {
    id: 'plant', type: 'TestPlant', params: {},
    inputs: ['x', 'n', 'load'].map(id => ({ id, name: id, type: 'auto', direction: 'input', value: 0 })),
    outputs: [{ id: 'Responses', name: 'Responses', type: 'auto', direction: 'output', value: {} }],
    execute: (ins: any[]) => {
      const soi = Array.isArray(ins[0]) ? ins[0][0] : 0, N = Number(ins[1]), L = Number(ins[2]);
      return { outputs: [makeBus(['T_brake', 'BSFC', 'P_max', 'T_exh', 'NOx'], [2 * L, 200 + (soi - (4 * N / 1000 + 0.04 * L)) ** 2, soi > 10 ? 2e7 : 8e6, 800, 5])] };
    },
  };
  const sw = BLOCK_LIBRARY.PT_DOE_SWEEPER('sw', { designType: 'Full Factorial', factors: 'SOI', bounds: [[0, 12]], levels: 4, dwell: 1, averageWindow: 0.5,
    operatingPoints: 'Grid', opSpeeds: [1500, 2500], opLoads: [25, 75], Pmax_limit: 1.5e7, Texh_limit: 1050 });
  const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
  const e = new XbridgesEngine({ blocks: [sw, plant], connections: [c('sw', 'NextPoint', 'plant', 'x'), c('sw', 'N_set', 'plant', 'n'), c('sw', 'Load', 'plant', 'load'),
    c('plant', 'Responses', 'sw', 'Responses')] } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 16.5, fixedStep: 0.05 } as any);
  return e.getBlock('sw')!;
}

const ecu = { id: 'ecu1', type: 'PT_CALIBRATION_ECU', label: 'ECU', params: { ...BLOCK_LIBRARY.PT_CALIBRATION_ECU('ecu1', {}).params } };
const eng = { id: 'eng1', type: 'PT_MAPPED_CI_ENGINE', label: 'Diesel map', params: { ...BLOCK_LIBRARY.PT_MAPPED_CI_ENGINE('eng1', {}).params } };

describe('DoE Sweeper panel', () => {
  afterEach(cleanup);

  it('lists every sweep row, marks infeasible rows and the best row per operating point', () => {
    const block = sweptBlock();
    render(<XbridgesPropertiesPanel block={block as any} onUpdate={vi.fn()} onClose={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'DoE results' });
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(16);
    expect(within(table).getAllByLabelText('infeasible').length).toBe(doeSweeperResults(block.state).filter(r => !r.feasible).length);
    expect(within(table).getAllByLabelText('best').length).toBe(4);
  });

  it('sends the results to the DOE module', () => {
    const block = sweptBlock();
    const onExportDoeData = vi.fn();
    render(<XbridgesPropertiesPanel block={block as any} onUpdate={vi.fn()} onClose={vi.fn()} onExportDoeData={onExportDoeData} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send to DOE module' }));
    const expected = doeModuleTable(doeSweeperResults(block.state), ['SOI'], ['T_brake', 'BSFC', 'P_max', 'T_exh', 'NOx']);
    expect(onExportDoeData).toHaveBeenCalledWith(expected.headers, expected.data);
  });

  it('writes the optimum maps into the chosen Calibration ECU (map mode)', () => {
    const block = sweptBlock();
    const onUpdate = vi.fn();
    render(<XbridgesPropertiesPanel block={block as any} onUpdate={onUpdate} onClose={vi.fn()} availableBlocks={[ecu, eng] as any} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Target ECU' }), { target: { value: 'ecu1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Write optimum to ECU' }));
    const m = calibrationMapsFromResults(doeSweeperResults(block.state), ['SOI'], { objective: 'BSFC' });
    expect(onUpdate).toHaveBeenCalledWith('ecu1', { params: { ...ecu.params, mode: 'Map', speedBp: m.speedBp, loadBp: m.loadBp, map_SOI: m.maps.SOI } });
  });

  it('writes torque and fuel tables into the chosen Mapped Engine', () => {
    const block = sweptBlock();
    const onUpdate = vi.fn();
    render(<XbridgesPropertiesPanel block={block as any} onUpdate={onUpdate} onClose={vi.fn()} availableBlocks={[ecu, eng] as any} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Target engine' }), { target: { value: 'eng1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Reference torque (N*m)' }), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Write maps to Mapped Engine' }));
    const t = mappedEngineTablesFromResults(doeSweeperResults(block.state), { objective: 'BSFC', T_ref: 200 });
    expect(onUpdate).toHaveBeenCalledWith('eng1', { params: { ...eng.params, f_tbrake_n_bpt: t.f_tbrake_n_bpt, f_tbrake_t_bpt: t.f_tbrake_t_bpt,
      f_tbrake: t.f_tbrake, f_fuel: t.f_fuel, f_air: t.f_air } });
  });

  it('shows nothing extra for other blocks', () => {
    render(<XbridgesPropertiesPanel block={{ id: 'g', type: 'GAIN', params: { gain: 2 }, inputs: [], outputs: [] } as any} onUpdate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('table', { name: 'DoE results' })).toBeNull();
  });

  it('the workspace passes the canvas blocks and the DOE export into the panel, and App opens the DOE window with the data', () => {
    const ws = readFileSync(join(__dirname, '../XbridgesWorkspace.tsx'), 'utf8');
    expect(ws).toMatch(/availableBlocks=\{/);
    expect(ws).toMatch(/onExportDoeData=\{/);
    const app = readFileSync(join(__dirname, '../../../App.tsx'), 'utf8');
    expect(app).toMatch(/onExportDoeData=\{/);
  });
});
