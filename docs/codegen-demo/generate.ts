/**
 * Regenerates the committed code-generation evidence for the thermal demo model.
 *
 *   npx tsx docs/codegen-demo/generate.ts [--out docs/codegen-demo/evidence]
 *
 * Produces:
 *   model/thermal_controller.json   the model in the app's persisted schema (importable in ADAI)
 *   evidence/IR.md                  the semantic IR the emitter reads
 *   evidence/production/*.{c,h}     the generated production package
 *   evidence/differential_trace.json  cycle frames observed by running the compiled C
 *   evidence/measurements.txt       footprint / object-size measurements (printed, not written)
 *
 * The differential trace needs a host C compiler; everything else is pure generation.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateStateMachineModel } from '../../src/utils/stateMachine/smModelMigration';
import { buildSemanticModel } from '../../src/utils/stateMachine/smSemanticBuilder';
import { generateCArtifacts } from '../../src/utils/stateMachine/smCGenerator';
import { analyzeSemanticModel } from '../../src/utils/smAnalysisEngine';
import { compileAndRunCTrace, runInterpreterTrace } from '../../src/utils/stateMachine/smCHarness';
import { compareSemanticTraces } from '../../src/utils/stateMachine/smTrace';
import { thermalControllerModel } from './thermal-model';
import type { DifferentialScenarioStep } from '../../src/utils/stateMachine/smFixtures';
import type { SemanticModel } from '../../src/utils/stateMachine/smSemanticModel';

const here = ((): string => {
  // ESM (tsx / node --experimental-strip-types) resolves the module URL;
  // a CommonJS bundle (esbuild) has no import.meta.url, so fall back to cwd.
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
})();


const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const irMarkdown = (ir: SemanticModel): string => {
  const lines: string[] = [];
  lines.push('### States (activityIndex order)', '');
  lines.push('| # | state id | C enum | parent state | layer | activeSlot | depth | entry | during | exit |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of Object.values(ir.states).sort((a, b) => a.activityIndex - b.activityIndex)) {
    lines.push(`| ${s.activityIndex} | ${s.id} | \`${s.enumName}\` | ${s.parentStateId ?? '—'} | ${s.layerId} | ${s.activeSlot} | ${s.depth} | ${JSON.stringify(s.entrySource)} | ${JSON.stringify(s.duringSource)} | ${JSON.stringify(s.exitSource)} |`);
  }
  lines.push('', `Active-slot count: **${ir.activeSlotCount}**`, '');
  lines.push('### Layers', '');
  lines.push('| layer | decomposition | parent state | children | activeSlot | default entry |');
  lines.push('|---|---|---|---|---|---|');
  for (const l of Object.values(ir.layers)) {
    lines.push(`| ${l.id} | ${l.decomposition} | ${l.parentStateId ?? '(root)'} | ${l.children.join(', ') || '—'} | ${l.activeSlot === null ? 'none' : l.activeSlot} | ${l.defaultEntryId ?? '—'} (${l.defaultEntryKind ?? '—'}) |`);
  }
  lines.push('', '### Junctions', '', '| junction | kind | owning layer |', '|---|---|---|');
  for (const j of Object.values(ir.junctions)) lines.push(`| ${j.id} | ${j.kind} | ${j.layerId} |`);
  lines.push('', '### Transitions (lowered)', '');
  lines.push('| transition | source | destination | kind | trigger | guard | exit set | entry set | routes |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const t of Object.values(ir.transitions)) {
    lines.push(`| ${t.id} | ${t.sourceStateId} (${t.sourceKind}) | ${t.destinationStateId ?? '—'} (${t.destinationKind}) | ${t.kind}/${t.transitionKind} | ${t.triggerMode}${t.afterTicks !== null ? ` afterTicks=${t.afterTicks} @${t.temporalThresholdMs}ms` : ''} | \`${t.guardSource || '(none)'}\` | ${t.exitStateIds.join(', ') || '—'} | ${t.entryStateIds.join(', ') || '—'} | ${t.routes.map((r) => `[${r.transitionIds.join('+')} → ${r.destinationKind}:${r.destinationStateId ?? r.destinationJunctionId ?? '?'}]`).join(' ')} |`);
  }
  return lines.join('\n');
};

const main = (): void => {
  const outDir = resolve(process.cwd(), argValue('--out') ?? join(here, 'evidence'));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'production'), { recursive: true });
  mkdirSync(join(outDir, 'model'), { recursive: true });

  const model = thermalControllerModel();
  writeFileSync(
    join(outDir, 'model', 'thermal_controller.json'),
    `${JSON.stringify(model, null, 2)}\n`,
    'utf8',
  );

  const migrated = migrateStateMachineModel(model);
  const built = buildSemanticModel(migrated.model);
  const errors = [...migrated.diagnostics, ...built.diagnostics].filter((d) => d.severity === 'error');
  if (!built.ir || errors.length > 0) {
    console.error('model failed to build:', errors.map((e) => e.code).join(', '));
    process.exit(1);
  }
  const ir = built.ir;

  writeFileSync(join(outDir, 'IR.md'), `${irMarkdown(ir)}\n`, 'utf8');

  const flat = generateCArtifacts(ir);
  for (const file of flat.files) {
    if (file.name.endsWith('.md')) continue;
    writeFileSync(join(outDir, 'production', file.name), file.content, 'utf8');
  }
  const pkg = generateCArtifacts(ir, { includeVerificationPackage: true });
  for (const file of pkg.files) {
    if (file.name.endsWith('.md') || file.name.startsWith('production/')) continue;
    const target = join(outDir, file.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf8');
  }
  console.log(`generated ${flat.files.length} flat artefacts, ${pkg.files.length} package artefacts (${flat.errors.length} errors, ${flat.warnings.length} warnings)`);
  console.log(`  production/      ${flat.files.filter((f) => !f.name.endsWith('.md')).map((f) => f.name).join(' ')}`);
  console.log(`  IR.md            ${Object.keys(ir.states).length} states, ${Object.keys(ir.layers).length} layers, ${ir.activeSlotCount} active slots`);
  console.log(`  analysis.json    reachability ${(analyzeSemanticModel(ir).reachabilityPercentage ?? 'n/a')}`);

  const step = (inputs?: Record<string, number | boolean>): DifferentialScenarioStep =>
    inputs ? { kind: 'step', inputs } : { kind: 'step' };
  const steps: DifferentialScenarioStep[] = [
    step(),
    step({ start_cmd: true }),
    step({ start_cmd: false }),
    ...Array.from({ length: 20 }, () => step()),
    step({ over_temperature: true }),
    step({ over_temperature: false }),
    step({ stop_cmd: true }),
    step({ stop_cmd: false }),
    step(),
  ];
  const fixture = { name: 'deep-history-and' as const, model, steps };
  try {
    const interpreter = runInterpreterTrace(fixture);
    const generated = compileAndRunCTrace(fixture);
    const divergence = compareSemanticTraces(interpreter, generated);
    const trace = {
      steps: steps.length,
      interpreterFrames: interpreter.length,
      generatedCFrames: generated.length,
      divergence,
      interpreter,
      generated,
    };
    // Compact on purpose: this file is machine evidence, not prose.
    writeFileSync(join(outDir, 'differential_trace.json'), `${JSON.stringify(trace)}\n`, 'utf8');
    console.log(`  differential     interpreter ${interpreter.length} frames vs compiled C ${generated.length} frames → ${divergence === null ? 'IDENTICAL' : 'DIVERGED'}`);
  } catch (error) {
    console.warn(`  differential     skipped (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
  }

  const coverage = join(outDir, 'differential_trace.json');
  if (existsSync(coverage)) {
    console.log(`evidence written to ${outDir}`);
  }
};

main();
