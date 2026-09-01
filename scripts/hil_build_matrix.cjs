#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync, execFileSync } = require('node:child_process');
const { HilBuildService } = require('../src/security/hilBuildService.cjs');
const { isToolchainLocallyInstalled, configureToolchainPaths } = require('../src/security/toolchainManager.cjs');

const toolchainsDir = path.join(process.cwd(), 'toolchains');
configureToolchainPaths(toolchainsDir);

const TARGETS = [
  { legacy: 'STM32F4', targetId: 'stm32f407vgt6', toolchainKey: 'STM32' },
  { legacy: 'STM32F1', targetId: 'stm32f103c8t6', toolchainKey: 'STM32' },
  { legacy: 'Arduino_Uno', targetId: 'atmega328p', toolchainKey: 'Arduino' },
  { legacy: 'Arduino_Mega', targetId: 'atmega2560', toolchainKey: 'Arduino' },
  { legacy: 'ESP32', targetId: 'esp32-wroom-32', toolchainKey: 'ESP32' },
  { legacy: 'Generic', targetId: 'generic-host', toolchainKey: 'Generic' },
];

async function runMatrix() {
  console.log('\n======================================================');
  console.log('  ADIA HIL Hardware Target Compilation Matrix');
  console.log('======================================================\n');

  let anyFailures = false;
  const results = [];
  const service = new HilBuildService();

  for (const t of TARGETS) {
    const installed = isToolchainLocallyInstalled(t.toolchainKey, toolchainsDir);
    console.log(`[TARGET] ${t.legacy.padEnd(14)} (${t.targetId})`);
    console.log(`         Toolchain: ${t.toolchainKey} - ${installed ? 'INSTALLED' : 'NOT INSTALLED'}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `hil-matrix-${t.targetId}-`));

    try {
      // 1. Emit sources by executing tsx via Node process directly with shell: false
      const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
      execFileSync(process.execPath, [tsxCli, path.join(__dirname, 'hil_emit_sources.ts'), '--target', t.legacy, '--out', tmpDir], { stdio: 'pipe', shell: false });

      // 2. Read emitted files to compute manifest hash
      const files = fs.readdirSync(tmpDir).map(name => ({
        name,
        content: fs.readFileSync(path.join(tmpDir, name), 'utf8'),
      }));

      const manifestFile = files.find(f => f.name === 'integration_manifest.json');
      const manifest = manifestFile ? JSON.parse(manifestFile.content) : null;
      const manifestEntries = files
        .filter(f => !f.name.endsWith('.md') && !f.name.endsWith('.json'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(f => `${f.name}:${crypto.createHash('sha256').update(f.content).digest('hex')}`)
        .join('\n');
      const sourceManifestHash = `sha256:${crypto.createHash('sha256').update(manifestEntries).digest('hex')}`;

      const savedWorkspace = {
        buildId: `BUILD_${t.targetId}`,
        dir: tmpDir,
        targetSelection: {
          targetId: t.targetId,
          packVersion: '1.0.0',
          driverMode: t.legacy === 'ESP32' ? 'vendor' : 'bare-metal',
          boardRevision: 'A',
        },
        sourceManifestHash,
        flashBlocked: false,
        files: files.map(f => f.name),
      };

      const request = {
        buildId: savedWorkspace.buildId,
        sourceManifestHash: savedWorkspace.sourceManifestHash,
        targetSelection: savedWorkspace.targetSelection,
      };

      if (!installed) {
        console.log(`         Result:    SKIPPED (Toolchain ${t.toolchainKey} not installed on host)`);
        results.push({ target: t.legacy, status: 'SKIP', reason: 'Toolchain not installed' });
      } else {
        const buildRecord = await service.build(request, savedWorkspace);
        if (buildRecord.status === 'LINKED_IMAGE_VERIFIED') {
          console.log(`         Result:    SUCCESS (Status: ${buildRecord.status})`);
          if (buildRecord.memory) {
            console.log(`         Flash:     ${buildRecord.memory.flashUsed} B / ${buildRecord.memory.flashTotal} B`);
            console.log(`         RAM:       ${buildRecord.memory.ramUsed} B / ${buildRecord.memory.ramTotal} B`);
          }
          results.push({ target: t.legacy, status: 'PASS', details: buildRecord });
        } else {
          console.error(`         Result:    FAILED (Status: ${buildRecord.status})`);
          if (buildRecord.logs?.stderr) console.error(`         stderr:    ${buildRecord.logs.stderr}`);
          results.push({ target: t.legacy, status: 'FAIL', details: buildRecord });
          anyFailures = true;
        }
      }
    } catch (err) {
      if (!installed) {
        console.log(`         Result:    SKIPPED (Toolchain ${t.toolchainKey} not installed on host)`);
        results.push({ target: t.legacy, status: 'SKIP', reason: err.message });
      } else {
        console.error(`         Result:    EXCEPTION - ${err.message}`);
        results.push({ target: t.legacy, status: 'FAIL', error: err.message });
        anyFailures = true;
      }
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
    console.log('------------------------------------------------------');
  }

  console.log('\nMatrix Summary:');
  for (const r of results) {
    const symbol = r.status === 'PASS' ? '[PASS]' : r.status === 'SKIP' ? '[SKIP]' : '[FAIL]';
    console.log(`  ${symbol} ${r.target.padEnd(14)} ${r.reason || (r.details?.status === 'LINKED_IMAGE_VERIFIED' ? 'Compiled & Verified' : '')}`);
  }

  if (anyFailures) {
    console.error('\nOne or more installed target compilations failed.');
    process.exit(1);
  } else {
    console.log('\nAll installed target compilations passed.');
    process.exit(0);
  }
}

runMatrix().catch(err => {
  console.error(err);
  process.exit(1);
});
