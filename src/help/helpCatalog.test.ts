import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../utils/vlabLibrary';
import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';
import { HELP_DATA } from '../HelpData';
import type { BlockHelpEntry, ItemHelpEntry, ItemModule } from './types';
import { XBRIDGES_HELP_A } from './blocks/xbridgesHelpA';
import { XBRIDGES_HELP_B } from './blocks/xbridgesHelpB';
import { XBRIDGES_HELP_C } from './blocks/xbridgesHelpC';
import { VLAB_HELP_A } from './blocks/vlabHelpA';
import { VLAB_HELP_B } from './blocks/vlabHelpB';
import { VLAB_HELP_C } from './blocks/vlabHelpC';
import { ITEM_HELP, CONCEPT_TOPICS, XBRIDGES_BLOCK_HELP, VLAB_BLOCK_HELP } from './index';

// ---- Partitioning contract (one executor per partition) ----
const XB_KEYS = Object.keys(BLOCK_LIBRARY);
export const XB_PARTITIONS = {
  A: XB_KEYS.slice(0, 80),
  B: XB_KEYS.slice(80, 160),
  C: XB_KEYS.slice(160),
};

const VLAB_DOMAINS_A = ['Electrical', 'Gas', 'Magnetic', 'Mechanical', 'Thermal'];
const VLAB_DOMAINS_B = ['Physical'];
const vlabIdsFor = (domains: string[]) =>
  VLAB_LIBRARY.filter(d => domains.includes(d.type)).flatMap(d => d.blocks.map(b => b.id));
export const VLAB_PARTITIONS = {
  A: vlabIdsFor(VLAB_DOMAINS_A),
  B: vlabIdsFor(VLAB_DOMAINS_B),
  C: VLAB_LIBRARY.filter(d => !VLAB_DOMAINS_A.includes(d.type) && !VLAB_DOMAINS_B.includes(d.type))
    .flatMap(d => d.blocks.map(b => b.id)),
};

const PLACEHOLDER = /\b(TODO|TBD|FIXME|lorem ipsum|placeholder text|same as above)\b/i;

function actualXbPorts(key: string): string[] {
  const b = BLOCK_LIBRARY[key]('help', {});
  return [...(b.inputs || []), ...(b.outputs || [])].map(p => p.id);
}
function actualXbParams(key: string): string[] {
  return Object.keys(BLOCK_LIBRARY[key]('help', {}).params || {});
}
const vlabById = new Map(VLAB_LIBRARY.flatMap(d => d.blocks.map(b => [b.id, b] as const)));

function checkBlockEntry(
  id: string,
  entry: BlockHelpEntry | undefined,
  ports: string[],
  params: string[],
  library: Record<string, BlockHelpEntry>,
  allIds: Set<string>,
) {
  const where = `block "${id}"`;
  expect(entry, `${where} has no help entry`).toBeDefined();
  if (!entry) return;
  expect(entry.id, where).toBe(id);
  expect(entry.summary.length, `${where} summary`).toBeGreaterThanOrEqual(20);
  expect(entry.description.length, `${where} description`).toBeGreaterThanOrEqual(150);
  expect(entry.shape.length, `${where} shape`).toBeGreaterThanOrEqual(20);
  expect(entry.algorithm.length, `${where} algorithm`).toBeGreaterThanOrEqual(10);
  expect(entry.usage.length, `${where} usage steps`).toBeGreaterThanOrEqual(3);
  expect(entry.simulationExecution.length, `${where} simulationExecution`).toBeGreaterThanOrEqual(40);
  expect(entry.embeddedExecution.length, `${where} embeddedExecution`).toBeGreaterThanOrEqual(40);
  const c = entry.characteristics;
  expect(c, `${where} characteristics`).toBeDefined();
  expect(c.sampleTime && c.states && c.dataTypes && c.codeGeneration, `${where} characteristics fields`).toBeTruthy();

  // Ports and params must mirror the library exactly (no invented, none missing).
  expect(entry.ports.map(p => p.id).sort(), `${where} ports`).toEqual([...ports].sort());
  entry.ports.forEach(p => expect(p.description.length, `${where} port ${p.id}`).toBeGreaterThanOrEqual(8));
  expect(entry.params.map(p => p.key).sort(), `${where} params`).toEqual([...params].sort());
  entry.params.forEach(p => expect(p.description.length, `${where} param ${p.key}`).toBeGreaterThanOrEqual(8));

  (entry.seeAlso || []).forEach(ref => {
    expect(allIds.has(ref), `${where} seeAlso "${ref}" is not a block of the same library`).toBe(true);
    expect(ref, `${where} seeAlso references itself`).not.toBe(id);
  });
  expect(PLACEHOLDER.test(JSON.stringify(entry)), `${where} contains placeholder text`).toBe(false);
  void library;
}

describe('X-Bridges block help (MATLAB-style reference)', () => {
  const allIds = new Set(XB_KEYS);
  const parts: [string, string[], Record<string, BlockHelpEntry>][] = [
    ['A', XB_PARTITIONS.A, XBRIDGES_HELP_A],
    ['B', XB_PARTITIONS.B, XBRIDGES_HELP_B],
    ['C', XB_PARTITIONS.C, XBRIDGES_HELP_C],
  ];
  for (const [name, keys, file] of parts) {
    it(`partition ${name} (xbridgesHelp${name}.ts) documents exactly its ${keys.length} blocks`, () => {
      expect(Object.keys(file).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        checkBlockEntry(key, file[key], actualXbPorts(key), actualXbParams(key), file, allIds);
      }
    });
  }
  it('merged registry covers every X-Bridges block', () => {
    expect(Object.keys(XBRIDGES_BLOCK_HELP).sort()).toEqual([...XB_KEYS].sort());
  });
});

describe('V-Lab block help (MATLAB-style reference)', () => {
  const allIds = new Set(vlabById.keys());
  const parts: [string, string[], Record<string, BlockHelpEntry>][] = [
    ['A', VLAB_PARTITIONS.A, VLAB_HELP_A],
    ['B', VLAB_PARTITIONS.B, VLAB_HELP_B],
    ['C', VLAB_PARTITIONS.C, VLAB_HELP_C],
  ];
  for (const [name, ids, file] of parts) {
    it(`partition ${name} (vlabHelp${name}.ts) documents exactly its ${ids.length} blocks`, () => {
      expect(Object.keys(file).sort()).toEqual([...ids].sort());
      for (const id of ids) {
        const b = vlabById.get(id)!;
        checkBlockEntry(id, file[id], b.ports.map(p => p.id), Object.keys(b.params || {}), file, allIds);
      }
    });
  }
  it('merged registry covers every V-Lab block', () => {
    expect(Object.keys(VLAB_BLOCK_HELP).sort()).toEqual([...vlabById.keys()].sort());
  });
});

describe('Diagram item help', () => {
  const REQUIRED: Record<ItemModule, string[]> = {
    statemachine: [
      'state', 'transition', 'default-transition', 'junction', 'history', 'deep-history',
      'parallel-decomposition', 'exclusive-decomposition', 'entry-action', 'during-action',
      'exit-action', 'event', 'guard', 'temporal-after', 'internal-transition', 'variable',
      'safe-state', 'terminal-state', 'transition-priority',
    ],
    opm: [
      'object', 'process', 'state', 'requirement', 'aggregation', 'exhibition', 'generalization',
      'agent', 'instrument', 'consumption', 'result', 'effect', 'trigger', 'condition',
      'satisfies', 'verifies',
    ],
    'sysml-bdd': ['block', 'value-property', 'part-property', 'reference-property', 'association',
      'generalization', 'composition', 'aggregation', 'dependency'],
    'sysml-ibd': ['part', 'standard-port', 'flow-port', 'proxy-port', 'assembly-connector',
      'delegation-connector', 'binding-connector'],
    requirements: ['requirement', 'derive', 'refine', 'satisfy', 'verify', 'trace', 'copy', 'containment'],
    plantuml: [],
    hil: ['target-pack', 'driver-channel', 'signal-mapping', 'fault-injection'],
    'vlab-canvas': ['wire', 'ground-reference', 'scope', 'domain-converter'],
    'xbridges-canvas': ['signal-line', 'subsystem', 'inport-outport', 'branch-point'],
  };

  for (const [module, ids] of Object.entries(REQUIRED) as [ItemModule, string[]][]) {
    it(`module ${module} documents its required items`, () => {
      const inModule = Object.values(ITEM_HELP).filter(i => i.module === module);
      expect(inModule.length, `${module} has no items`).toBeGreaterThanOrEqual(Math.max(ids.length, 3));
      for (const short of ids) {
        expect(ITEM_HELP[`${module}.${short}`], `missing item ${module}.${short}`).toBeDefined();
      }
    });
  }

  it('every item entry is complete and cross-references resolve', () => {
    Object.entries(ITEM_HELP).forEach(([key, item]: [string, ItemHelpEntry]) => {
      expect(item.id).toBe(key);
      expect(key.startsWith(`${item.module}.`), `${key} must be prefixed by its module`).toBe(true);
      expect(item.name.length).toBeGreaterThan(1);
      expect(item.shape.length, `${key} shape`).toBeGreaterThanOrEqual(20);
      expect(item.summary.length, `${key} summary`).toBeGreaterThanOrEqual(20);
      expect(item.description.length, `${key} description`).toBeGreaterThanOrEqual(150);
      expect(item.usage.length, `${key} usage`).toBeGreaterThanOrEqual(2);
      expect(item.connections.length, `${key} connections`).toBeGreaterThanOrEqual(1);
      expect(item.semantics.length, `${key} semantics`).toBeGreaterThanOrEqual(60);
      (item.seeAlso || []).forEach(ref => expect(ITEM_HELP[ref], `${key} seeAlso ${ref}`).toBeDefined());
      expect(PLACEHOLDER.test(JSON.stringify(item)), `${key} placeholder text`).toBe(false);
    });
  });
});

describe('Concept topics (philosophy, interconnection, execution priority)', () => {
  const REQUIRED_TOPICS = [
    'adia-philosophy',
    'module-interconnection',
    'reading-block-reference',
    'build-state-machine',
    'build-xbridges-model',
    'build-vlab-model',
    'build-opm-model',
    'build-sysml-diagrams',
    'build-hil-setup',
    'state-machine-semantics',
    'simulation-execution-order',
    'embedded-execution-order',
  ];

  it('all concept topics exist with diagrams and depth', () => {
    for (const key of REQUIRED_TOPICS) {
      const t = CONCEPT_TOPICS[key];
      expect(t, `missing topic ${key}`).toBeDefined();
      expect(t.content.length, `${key} content`).toBeGreaterThanOrEqual(200);
      expect(t.sections?.length ?? 0, `${key} sections`).toBeGreaterThanOrEqual(5);
      const diagrams = (t.sections || []).filter(s => s.diagram && s.diagram.split('\n').length >= 4);
      expect(diagrams.length, `${key} needs at least 1 multi-line diagram`).toBeGreaterThanOrEqual(1);
      expect(PLACEHOLDER.test(JSON.stringify(t)), `${key} placeholder text`).toBe(false);
    }
  });

  it('concept topics are published in HELP_DATA and every related link resolves', () => {
    for (const key of Object.keys(CONCEPT_TOPICS)) {
      expect(HELP_DATA[key], `HELP_DATA is missing concept topic ${key}`).toBeDefined();
    }
    Object.entries(HELP_DATA).forEach(([key, t]) => {
      (t.related || []).forEach(ref => expect(HELP_DATA[ref], `${key} related -> ${ref}`).toBeDefined());
    });
  });

  it('execution-order topics cover simulation and embedded priority rules', () => {
    const sim = JSON.stringify(CONCEPT_TOPICS['simulation-execution-order']);
    for (const term of ['sorted', 'algebraic loop', 'direct feedthrough', 'zero-crossing', 'DAE', 'tick']) {
      expect(sim.toLowerCase(), `simulation-execution-order should explain "${term}"`).toContain(term.toLowerCase());
    }
    const emb = JSON.stringify(CONCEPT_TOPICS['embedded-execution-order']);
    for (const term of ['step', 'init', 'rate', 'ISR', 'fixed-step']) {
      expect(emb.toLowerCase(), `embedded-execution-order should explain "${term}"`).toContain(term.toLowerCase());
    }
    const sm = JSON.stringify(CONCEPT_TOPICS['state-machine-semantics']);
    for (const term of ['entry', 'during', 'exit', 'priority', 'history', 'parallel', 'junction']) {
      expect(sm.toLowerCase(), `state-machine-semantics should explain "${term}"`).toContain(term);
    }
  });
});
