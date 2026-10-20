// Powertrain blockset registry. Later work packages add their group files to PT_BLOCKS.
// Must not import React or BlockDefinitions.ts (xbCapabilities.ts depends on this module).
import type { XBlock } from '../types';
import type { PtBlockSpec } from './ptSpec';
import { PT_CATEGORY_ORDER } from './ptSpec';
import { TEST_CELL_CONTROL_BLOCKS } from './blocks/testCellControl';
import { DOE_SWEEPER_BLOCKS } from './blocks/doeSweeper';
import { TURBOCHARGER_BLOCKS } from './blocks/turbocharger';
import { AIR_PATH_BLOCKS } from './blocks/airPath';
import { FINAL_DRIVE_BLOCKS } from './blocks/finalDrive';
import { COMBUSTION_ENGINE_BLOCKS } from './blocks/combustionEngines';
import { WHEEL_BLOCKS } from './blocks/wheels';
import { SCENARIO_BLOCKS } from './blocks/scenarios';
import { VEHICLE_BODY_BLOCKS } from './blocks/vehicleBody';
import { BATTERY_BLOCKS } from './blocks/batteries';
import { ELECTRIC_MOTOR_BLOCKS } from './blocks/electricMotors';

export const PT_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [...SCENARIO_BLOCKS, ...VEHICLE_BODY_BLOCKS, ...BATTERY_BLOCKS, ...ELECTRIC_MOTOR_BLOCKS, ...WHEEL_BLOCKS, ...COMBUSTION_ENGINE_BLOCKS, ...FINAL_DRIVE_BLOCKS, ...AIR_PATH_BLOCKS, ...TURBOCHARGER_BLOCKS, ...DOE_SWEEPER_BLOCKS, ...TEST_CELL_CONTROL_BLOCKS];

export const POWERTRAIN_SPECS: PtBlockSpec[] = PT_BLOCKS.map(b => b.spec);
export const POWERTRAIN_FACTORIES: Record<string, (id: string, params?: Record<string, any>) => XBlock> =
  Object.fromEntries(PT_BLOCKS.map(b => [b.spec.type, b.factory]));

export const getPowertrainSpec = (type: string): PtBlockSpec | undefined => POWERTRAIN_SPECS.find(s => s.type === type);

export const POWERTRAIN_CATEGORIES: { name: string; blocks: { type: string; label: string; icon: string }[] }[] =
  (() => {
    const blocks = PT_CATEGORY_ORDER
      .flatMap(name => POWERTRAIN_SPECS.filter(s => s.category === name))
      .map(s => ({ type: s.type, label: s.label, icon: 'box' }));
    return blocks.length > 0 ? [{ name: 'Powertrain Blockset', blocks }] : [];
  })();

export const POWERTRAIN_GUIDANCE: Record<string, {
  description: string; behavior: string; example: string; equation: string; parameters: Record<string, string>;
}> = Object.fromEntries(POWERTRAIN_SPECS.map(s => [`xbridges:${s.type}`, {
  description: s.description,
  behavior: s.behavior,
  example: s.example,
  equation: s.equations.join('; '),
  parameters: Object.fromEntries(s.params.map(p => [p.name, p.description])),
}]));

export const POWERTRAIN_HOST_ONLY_TYPES: string[] = POWERTRAIN_SPECS.map(s => s.type);
