import type { BlockHelpEntry, ItemHelpEntry, ItemModule } from './types';
import { XBRIDGES_HELP_A } from './blocks/xbridgesHelpA';
import { XBRIDGES_HELP_B } from './blocks/xbridgesHelpB';
import { XBRIDGES_HELP_C } from './blocks/xbridgesHelpC';
import { VLAB_HELP_A } from './blocks/vlabHelpA';
import { VLAB_HELP_B } from './blocks/vlabHelpB';
import { VLAB_HELP_C } from './blocks/vlabHelpC';
import { ITEM_HELP } from './items/itemHelp';
import { CONCEPT_TOPICS } from './topics/conceptTopics';

export * from './types';
export { CONCEPT_TOPICS, ITEM_HELP };

export const XBRIDGES_BLOCK_HELP: Record<string, BlockHelpEntry> = {
  ...XBRIDGES_HELP_A,
  ...XBRIDGES_HELP_B,
  ...XBRIDGES_HELP_C,
};

export const VLAB_BLOCK_HELP: Record<string, BlockHelpEntry> = {
  ...VLAB_HELP_A,
  ...VLAB_HELP_B,
  ...VLAB_HELP_C,
};

export const ITEM_MODULE_LABELS: Record<ItemModule, string> = {
  statemachine: 'State Machine',
  opm: 'ENTROPY OPM',
  'sysml-bdd': 'SysML BDD',
  'sysml-ibd': 'SysML IBD',
  requirements: 'Requirements',
  plantuml: 'PlantUML',
  hil: 'HIL',
  'vlab-canvas': 'V-Lab Canvas',
  'xbridges-canvas': 'X-Bridges Canvas',
};

export function getBlockHelp(source: 'V-Lab' | 'X-Bridges', id: string): BlockHelpEntry | undefined {
  return source === 'V-Lab' ? VLAB_BLOCK_HELP[id] : XBRIDGES_BLOCK_HELP[id];
}

export function getItemsByModule(module: ItemModule): ItemHelpEntry[] {
  return Object.values(ITEM_HELP).filter(item => item.module === module);
}
