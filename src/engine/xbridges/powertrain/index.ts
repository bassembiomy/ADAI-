// Powertrain blockset registry. Later work packages add their group files to PT_BLOCKS.
// Must not import React or BlockDefinitions.ts (xbCapabilities.ts depends on this module).
import type { XBlock } from '../types';
import type { PtBlockSpec } from './ptSpec';
import { PT_CATEGORY_ORDER } from './ptSpec';
import { SCENARIO_BLOCKS } from './blocks/scenarios';
import { VEHICLE_BODY_BLOCKS } from './blocks/vehicleBody';

export const PT_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [...SCENARIO_BLOCKS, ...VEHICLE_BODY_BLOCKS];

export const POWERTRAIN_SPECS: PtBlockSpec[] = PT_BLOCKS.map(b => b.spec);
export const POWERTRAIN_FACTORIES: Record<string, (id: string, params?: Record<string, any>) => XBlock> =
  Object.fromEntries(PT_BLOCKS.map(b => [b.spec.type, b.factory]));

export const getPowertrainSpec = (type: string): PtBlockSpec | undefined => POWERTRAIN_SPECS.find(s => s.type === type);

export const POWERTRAIN_CATEGORIES: { name: string; blocks: { type: string; label: string; icon: string }[] }[] =
  PT_CATEGORY_ORDER
    .map(name => ({
      name: name as string,
      blocks: POWERTRAIN_SPECS.filter(s => s.category === name).map(s => ({ type: s.type, label: s.label, icon: 'box' })),
    }))
    .filter(c => c.blocks.length > 0);

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
