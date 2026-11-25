/**
 * XBV-439 probe (2026-11-25): y = y + 1e-12 (y^2 + 1) has no real root. Prints the result per algMaxPasses.
 * Run: npx tsx scripts/xbridges-verification/xbv439Probe.ts   (expected after the fix: NOT_CONVERGED for every row)
 */
const root = new URL('../../src/engine/xbridges', import.meta.url).pathname;
const { XbridgesEngine } = await import(`${root}/XbridgesEngine.ts`);
const { buildModel } = await import(`${root}/testkit/index.ts`);
const spec = { blocks: [{ id: 'cd', type: 'Constant', params: { value: 1 } }, { id: 'p', type: 'PRODUCT', params: { numInputs: 2 } },
  { id: 's2', type: 'Sum', params: { signs: '++' } }, { id: 'g', type: 'GAIN', params: { gain: 1e-12 } }, { id: 's', type: 'Sum', params: { signs: '++' } }],
  wires: ['s.out -> p.in1', 's.out -> p.in2', 'p.y -> s2.in1', 'cd.out -> s2.in2', 's2.out -> g.u', 's.out -> s.in1', 'g.y -> s.in2'] };
for (const passes of [1, 2, 3, 4, 50, 0]) {
  const e: any = new XbridgesEngine(buildModel(spec));
  e.options = { solver: 'rk4', fixedStep: 0.1, startTime: 0, stopTime: 0.5, algTol: 1e-6, algMaxPasses: passes };
  e.compile(0);
  const order = e.cycleBlocks.map((b: any) => b.id);
  let n = 0; const s = e.flatBlocks?.find?.((b: any) => b.id === 's') ?? null;
  e.computeOutputs(0);
  console.log(`passes=${passes} cycle=${order} s=${e.getSignalValue('s','out')} g=${e.getSignalValue('g','y')} codes=${e.diagnostics.map((d: any)=>d.code)}`);
}
