// X-Bridges verification inventory (plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md, section 1).
// Reads the block library, both palettes, the code-generation registry and the test files, and writes
// docs/xbridges-verification/inventory.json. The output has no timestamp: the same sources give the same bytes.
// Run: npm run xbv:inventory        (add --print to only print the summary)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES } from '../../src/engine/xbridges/BlockDefinitions';
import { XBRIDGES_CATEGORIES as HELP_CATEGORIES } from '../../src/utils/xbridges/XbridgesLibrary';
import { XB_PARAMETER_SCHEMA } from '../../src/engine/xbridges/parameterSchema';
import { XB_CAPABILITIES } from '../../src/utils/stateMachine/xbCapabilities';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'docs', 'xbridges-verification', 'inventory.json');

type PaletteEntry = { type: string };
type PaletteCategory = { name?: string; label?: string; title?: string; blocks?: PaletteEntry[]; items?: PaletteEntry[] };

const paletteOf = (categories: unknown): Map<string, string> => {
  const byType = new Map<string, string>();
  const list = (Array.isArray(categories) ? categories : Object.values(categories as object)) as PaletteCategory[];
  for (const c of list) {
    const name = String(c.name ?? c.label ?? c.title ?? '');
    for (const b of c.blocks ?? c.items ?? []) {
      const type = typeof b === 'string' ? b : b.type;
      if (!byType.has(type)) byType.set(type, name);
    }
  }
  return byType;
};

const canvasPalette = paletteOf(XBRIDGES_CATEGORIES);
const helpPalette = paletteOf(HELP_CATEGORIES);

const git = (...args: string[]): string[] =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const testFiles = git('ls-files', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.ts');
const groupOf = (f: string): 'engine' | 'stateMachine' | 'ui' | 'e2e' | 'other' =>
  f.startsWith('src/engine/xbridges/') ? 'engine'
    : f.startsWith('src/utils/stateMachine/') ? 'stateMachine'
      : f.startsWith('src/components/') ? 'ui'
        : f.startsWith('tests/') ? 'e2e' : 'other';
const testText = testFiles.map((f) => ({ group: groupOf(f), text: readFileSync(join(root, f), 'utf8') }));
const namedIn = (type: string) => {
  const re = new RegExp(`['"\`]${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  const groups = new Set(testText.filter((t) => re.test(t.text)).map((t) => t.group));
  return [...groups].sort();
};

const engineSources = git('ls-files', 'src/engine/xbridges/*.ts').filter((f) => !f.endsWith('.test.ts'));
const diagnosticCodes = [...new Set(engineSources.flatMap((f) =>
  [...readFileSync(join(root, f), 'utf8').matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1])))].sort();
const allTestText = testText.map((t) => t.text).join('\n');
const diagnosticCodesWithoutTest = diagnosticCodes.filter((c) => !allTestText.includes(c));

const types = Object.keys(BLOCK_LIBRARY);
const blocks = types.map((type) => {
  const b = BLOCK_LIBRARY[type]('inventory', {});
  const ports = [...b.inputs, ...b.outputs];
  const cap = XB_CAPABILITIES[type];
  return {
    type,
    category: canvasPalette.get(type) ?? null,
    onCanvasPalette: canvasPalette.has(type),
    onHelpPalette: helpPalette.has(type),
    inputs: b.inputs.length,
    outputs: b.outputs.length,
    portsWithUnit: ports.filter((p) => Boolean(p.unit)).length,
    parameters: Object.keys(b.params ?? {}).sort(),
    hasParameterSchema: Boolean(XB_PARAMETER_SCHEMA[type]),
    hasEquationText: Boolean(b.equation),
    isStateful: Boolean(b.isStateful),
    directFeedthroughDeclared: b.directFeedthrough ?? null,
    hasDerivatives: Boolean(b.evaluateDerivatives),
    hasZeroCrossing: Boolean(b.ZeroCrossingFn),
    hasDiscreteUpdate: Boolean(b.updateDiscrete),
    dynamicInputs: Boolean(b.allowDynamicInputs),
    dynamicOutputs: Boolean(b.allowDynamicOutputs),
    capability: cap ? (cap.codegen ? 'codegen' : 'host-only') : 'missing',
    namedInTests: namedIn(type),
  };
});

const count = (f: (b: (typeof blocks)[number]) => boolean) => blocks.filter(f).length;
const summary = {
  libraryBlocks: blocks.length,
  powertrainBlocks: count((b) => b.type.startsWith('PT_')),
  canvasPaletteBlocks: canvasPalette.size,
  canvasPaletteCategories: new Set(canvasPalette.values()).size,
  libraryBlocksNotOnCanvasPalette: count((b) => !b.onCanvasPalette),
  canvasPaletteEntriesWithoutFactory: [...canvasPalette.keys()].filter((t) => !BLOCK_LIBRARY[t]).sort(),
  helpPaletteEntriesWithoutFactory: [...helpPalette.keys()].filter((t) => !BLOCK_LIBRARY[t]).sort(),
  onCanvasPaletteOnly: [...canvasPalette.keys()].filter((t) => !helpPalette.has(t)).sort(),
  onHelpPaletteOnly: [...helpPalette.keys()].filter((t) => !canvasPalette.has(t)).sort(),
  ports: blocks.reduce((n, b) => n + b.inputs + b.outputs, 0),
  portsWithUnit: blocks.reduce((n, b) => n + b.portsWithUnit, 0),
  withEquationText: count((b) => b.hasEquationText),
  withParameterSchema: count((b) => b.hasParameterSchema),
  stateful: count((b) => b.isStateful),
  withDerivatives: count((b) => b.hasDerivatives),
  withZeroCrossing: blocks.filter((b) => b.hasZeroCrossing).map((b) => b.type),
  withDiscreteUpdate: count((b) => b.hasDiscreteUpdate),
  dynamicInputs: count((b) => b.dynamicInputs),
  dynamicOutputs: count((b) => b.dynamicOutputs),
  capabilityEntries: Object.keys(XB_CAPABILITIES).length,
  codegenCapable: Object.values(XB_CAPABILITIES).filter((c) => c.codegen).length,
  capabilityWithoutFactory: Object.keys(XB_CAPABILITIES).filter((t) => !BLOCK_LIBRARY[t]).sort(),
  factoryWithoutCapability: blocks.filter((b) => b.capability === 'missing').map((b) => b.type),
  namedInAnyTest: count((b) => b.namedInTests.length > 0),
  namedInEngineTest: count((b) => b.namedInTests.includes('engine')),
  namedInNoTest: blocks.filter((b) => b.namedInTests.length === 0).map((b) => b.type),
  canvasPaletteBlocksWithoutEngineTest: count((b) => b.onCanvasPalette && !b.namedInTests.includes('engine')),
  diagnosticCodes,
  diagnosticCodesWithoutTest,
};

if (!process.argv.includes('--print')) {
  writeFileSync(OUT, `${JSON.stringify({ summary, blocks }, null, 1)}\n`);
}
const short = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, Array.isArray(v) && v.length > 8 ? v.length : v]));
console.log(JSON.stringify(short, null, 1));
