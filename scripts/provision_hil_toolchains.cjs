#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  TARGET_ENVIRONMENTS,
  provisionAllRequiredToolchains,
  resolveInstalledToolchain,
} = require('../src/security/toolchainManager.cjs');

async function main() {
  const json = process.argv.includes('--json');
  const toolchainsDir = path.join(process.cwd(), 'toolchains');
  if (!json) console.log(`[PROVISION] Destination: ${toolchainsDir}`);
  await provisionAllRequiredToolchains(toolchainsDir);

  const rows = [];
  for (const [target, environment] of Object.entries(TARGET_ENVIRONMENTS)) {
    for (const [kind, key] of Object.entries(environment)) {
      const resolved = resolveInstalledToolchain(key, { toolchainsDir });
      rows.push({ target, kind, key, executable: resolved?.executable || null });
    }
  }
  if (json) console.log(JSON.stringify({ toolchainsDir, environments: rows }, null, 2));
  else for (const row of rows) console.log(`[${row.executable ? ' OK ' : 'MISS'}] ${row.target} ${row.kind} ${row.key}: ${row.executable || 'not found'}`);
  if (rows.some(row => !row.executable)) throw new Error('Provisioning completed with missing target tools');
  if (!json) console.log('[PROVISION] All supported MCU environments are available locally.');
}

main().catch(error => {
  console.error(`[PROVISION] Failed: ${error.message}`);
  process.exitCode = 1;
});
