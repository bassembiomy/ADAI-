/**
 * zero_g_ci.ts
 * Standalone CLI runner for Project Zero-G (Antigravity Agent) in CI/CD pipelines.
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateMISRACCode } from '../src/utils/stateMachineCodeGenerator';
import { runAntigravityPipeline } from '../src/utils/antigravity/antigravityRunner';

async function runCLI() {
  const args = process.argv.slice(2);
  const outDirArg = args.find(a => a.startsWith('--outDir='))?.split('=')[1] || './dist/c_out';
  const modelArg = args.find(a => a.startsWith('--model='))?.split('=')[1];

  console.log('🚀 Invoking Antigravity Agent (Project Zero-G)...');

  let chart: any = {
    states: [{ id: 's1', name: 'Idle', parentId: 'root', autostart: true }],
    variables: [{ id: 'v1', name: 'in_sensor', type: 'float', initialValue: '0.0' }],
    transitions: [],
    junctions: [],
    layers: []
  };

  if (modelArg && fs.existsSync(modelArg)) {
    const raw = fs.readFileSync(modelArg, 'utf8');
    const parsed = JSON.parse(raw);
    chart = {
      states: parsed.states || chart.states,
      variables: parsed.variables || chart.variables,
      transitions: parsed.transitions || chart.transitions,
      junctions: parsed.junctions || chart.junctions,
      layers: parsed.layers || chart.layers
    };
  }

  const generated = generateMISRACCode(chart);
  const rawFiles: Record<string, string> = {};
  if (Array.isArray(generated.files)) {
    generated.files.forEach(f => {
      rawFiles[f.name] = f.content;
    });
  }
  const result = await runAntigravityPipeline(rawFiles, chart);

  const targetDir = path.resolve(outDirArg);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Write sanitized C output files
  Object.entries(result.files).forEach(([fn, content]) => {
    fs.writeFileSync(path.join(targetDir, fn), content);
  });

  // Write antigravity_patches.diff artifact for CI uploaders (actions/upload-artifact)
  const diffPath = path.join(targetDir, 'antigravity_patches.diff');
  fs.writeFileSync(diffPath, result.diffLog);

  console.log(`STATUS: ${result.status === 'ZERO_G' ? '🌕 Zero-G (0 Errors)' : '☄️ Re-entry Failed'}`);
  console.log(`Artifact saved to: ${diffPath}`);

  if (!result.success) {
    process.exit(1);
  }
}

runCLI().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
