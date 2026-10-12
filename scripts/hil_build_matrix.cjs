#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { HilBuildService } = require('../src/security/hilBuildService.cjs');
const { TARGETS, resolveRuntime, validateProductionSources } = require('../src/security/hilRuntime.cjs');
const repo = path.resolve(__dirname, '..');
async function main() {
  const resourceOption = process.argv.indexOf('--resources-path');
  const runtimeOptions = resourceOption >= 0 ? { resourcesPath: path.resolve(process.argv[resourceOption + 1]) } : { repoRoot: repo };
  resolveRuntime(runtimeOptions);
  fs.mkdirSync(path.join(repo, '.tmp'), { recursive: true });
  const root = fs.mkdtempSync(path.join(repo, '.tmp/hil-production-matrix-'));
  const service = new HilBuildService();
  const results = [];
  for (const [targetId, target] of Object.entries(TARGETS)) {
    const projectDir = path.join(root, targetId);
    let log = '';
    try {
      execFileSync(process.execPath, [path.join(repo, 'node_modules/tsx/dist/cli.mjs'), path.join(__dirname, 'hil_emit_sources.ts'), '--target', target.legacy, '--out', projectDir, '--all-peripherals'], { cwd: repo, shell: false, encoding: 'utf8' });
      validateProductionSources(projectDir);
      const files = fs.readdirSync(projectDir).sort((a,b) => a.localeCompare(b));
      const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'integration_manifest.json'), 'utf8'));
      const canonical = files.map(name => { const content = fs.readFileSync(path.join(projectDir, name), 'utf8'); return `${name}\0${content.length}\0${content}`; }).join('\0');
      const sourceManifestHash = `sha256:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
      const workspace = { buildId: `matrix-${targetId}`, sourceManifestHash, targetSelection: manifest.targetSelection, flashBlocked: manifest.flashBlocked, files, buildDir: projectDir };
      const record = await service.build({ buildId: workspace.buildId, sourceManifestHash, targetSelection: workspace.targetSelection }, workspace, { ...runtimeOptions, cacheDir: path.join(root, 'empty-user-cache'), onLog: line => { log += line; } });
      fs.writeFileSync(path.join(root, `${targetId}.log`), log);
      const pass = record.status === 'LINKED_IMAGE_VERIFIED' && record.inspection?.evidence === 'tool-output';
      results.push({ targetId, status: pass ? 'PASS' : 'FAIL', record });
      console.log(`[${pass ? 'PASS' : 'FAIL'}] ${target.legacy}: ${record.status} ${record.code || ''}`);
      if (!pass) console.error(log.slice(-6000), record.error || '');
      else console.log(`  Flash ${record.memory.flashUsed} B; RAM ${record.memory.ramUsed} B; ${record.artifacts.flashImages.length} genuine flash images.`);
    } catch (error) { results.push({ targetId, status: 'FAIL', error: error.message }); console.error(`[FAIL] ${target.legacy}: ${error.message}`); }
  }
  fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify({ offline: true, testShims: false, results }, null, 2));
  console.log(`Production build evidence: ${root}`);
  if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
